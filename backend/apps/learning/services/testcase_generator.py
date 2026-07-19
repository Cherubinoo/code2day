"""
LLM-based test case generation for Problems and Lab exercises.

Calls an OpenAI-compatible chat completion endpoint to generate
stdin/expected_output test case pairs from a problem statement. Providers
are configured in the DB (LLMProvider model, editable in Django admin) and
tried in priority order — if one errors or times out, the next active
provider is tried automatically, so a new fallback endpoint can be added
without touching code or redeploying.

Best-effort by design: callers should catch TestCaseGenError and continue
without test cases rather than let generation failures block problem/
exercise creation.

Note: the LLM computes expected_output by "solving" the problem itself,
so correctness is not guaranteed for tricky algorithmic problems — treat
generated cases as a starting point staff should spot-check, not ground
truth handed down from on high.
"""

import json
import logging
import re

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class TestCaseGenError(Exception):
    """Base exception for test case generation errors."""


class TestCaseGenTimeoutError(TestCaseGenError):
    """Raised when the LLM request times out."""


class TestCaseGenServiceError(TestCaseGenError):
    """Raised when the LLM service returns an error or an unusable response."""


class NoProvidersAvailableError(TestCaseGenError):
    """Raised when there are no active LLMProvider rows to try, or every one failed."""


PROMPT_TEMPLATE = """You are generating test cases for a competitive-programming-style judge.

Problem title: {title}

Problem description:
{description}

{examples_block}

Generate {num_cases} test cases that exercise this problem correctly, including the
examples above (reproduced exactly) plus additional edge cases (empty/minimum input,
large values, duplicates, negative numbers, boundary conditions — whatever is relevant
to THIS specific problem).

Rules:
- "stdin" must be the exact raw text a program reading from standard input would
  receive — match the format shown in the examples above exactly (same layout, same
  separators, same line breaks). Do not invent a different input format.
- "expected_output" must be the exact expected stdout text for that input, correctly
  computed by actually solving the problem step by step — not guessed.
- Mark the cases that reproduce the given examples as "is_sample": true; mark the rest
  "is_sample": false. For every "is_sample": true case, also include a short one or two
  sentence "explanation" of why that input produces that output (this is shown to
  students alongside the example, so it should read like a worked example, not just
  restate the input/output).
- Respond with ONLY a JSON object, no markdown code fences, no commentary, in exactly
  this shape:
{{"test_cases": [{{"stdin": "...", "expected_output": "...", "is_sample": true, "explanation": "..."}}]}}
"""


def _build_prompt(title, description, examples, num_cases):
    if examples:
        blocks = []
        for example in examples:
            block = f"Example input:\n{example.get('input', '')}\nExample output:\n{example.get('output', '')}"
            if example.get("explanation"):
                block += f"\nExplanation: {example['explanation']}"
            blocks.append(block)
        examples_block = "Given examples (reproduce these exactly as sample test cases):\n\n" + "\n\n".join(blocks)
    else:
        examples_block = (
            "No examples were provided — infer a reasonable stdin format from the description. "
            "Since there are no given examples to reproduce, you MUST still pick 1-2 of your generated "
            "cases to mark \"is_sample\": true — choose simple, clearly illustrative inputs (not empty, "
            "trivial, or degenerate edge cases) that would make good worked examples for a student "
            "reading the problem for the first time."
        )

    return PROMPT_TEMPLATE.format(
        title=title or "",
        description=description or "",
        examples_block=examples_block,
        num_cases=num_cases,
    )


def _extract_json(text):
    """LLMs sometimes wrap JSON in ```json fences or add stray prose around
    it — strip fences and pull out the first {...} block."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise TestCaseGenServiceError(f"No JSON object found in LLM response: {text[:200]!r}")
    return json.loads(match.group(0))


def _call_provider_once(provider, prompt):
    """POST to one provider and return the raw text content of its reply.
    Raises TestCaseGenTimeoutError / TestCaseGenServiceError on failure."""
    payload = {
        "model": provider.model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": provider.temperature,
        "top_p": provider.top_p,
        "max_tokens": provider.max_tokens,
        "stream": provider.use_streaming,
        **(provider.extra_body or {}),
    }
    headers = {
        "Authorization": f"Bearer {provider.api_key}",
        "Content-Type": "application/json",
    }
    url = f"{provider.base_url.rstrip('/')}/chat/completions"

    try:
        if provider.use_streaming:
            return _consume_stream(url, payload, headers, provider.timeout_seconds)

        response = requests.post(url, json=payload, headers=headers, timeout=provider.timeout_seconds)
        if response.status_code != 200:
            raise TestCaseGenServiceError(f"HTTP {response.status_code}: {response.text[:500]}")
        body = response.json()
        return body["choices"][0]["message"]["content"]

    except requests.exceptions.Timeout as exc:
        raise TestCaseGenTimeoutError(f"Request timed out after {provider.timeout_seconds}s") from exc
    except requests.exceptions.RequestException as exc:
        raise TestCaseGenServiceError(f"Request failed: {exc}") from exc
    except (KeyError, IndexError, ValueError) as exc:
        raise TestCaseGenServiceError(f"Unexpected response shape: {exc}") from exc


def _consume_stream(url, payload, headers, timeout_seconds):
    """Read an OpenAI-style SSE stream and concatenate delta.content chunks
    (reasoning_content, if any, is logged but not included in the result)."""
    content_parts = []
    reasoning_seen = False
    try:
        with requests.post(url, json=payload, headers=headers, timeout=timeout_seconds, stream=True) as response:
            if response.status_code != 200:
                raise TestCaseGenServiceError(f"HTTP {response.status_code}: {response.text[:500]}")
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line or not raw_line.startswith("data:"):
                    continue
                data_str = raw_line[len("data:"):].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                if delta.get("reasoning_content"):
                    reasoning_seen = True
                if delta.get("content"):
                    content_parts.append(delta["content"])
    except requests.exceptions.Timeout as exc:
        raise TestCaseGenTimeoutError(f"Streaming request timed out after {timeout_seconds}s") from exc
    except requests.exceptions.RequestException as exc:
        raise TestCaseGenServiceError(f"Streaming request failed: {exc}") from exc

    if reasoning_seen:
        logger.debug("Provider emitted reasoning_content (discarded, not part of the JSON answer)")
    return "".join(content_parts)


def generate_text_with_fallback(prompt, *, log_label=""):
    """
    Send `prompt` to the first working configured LLMProvider, tried in
    priority order, and return the raw text content of its reply.

    Shared by generate_test_cases() (which then parses JSON out of the
    result) and any other caller that just wants free-text back (e.g. an
    algorithm write-up for a lab report).

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    from apps.learning.models import LLMProvider

    providers = list(LLMProvider.objects.filter(is_active=True).order_by("priority", "id"))
    if not providers:
        raise NoProvidersAvailableError("No active LLMProvider is configured.")

    last_error = None
    for provider in providers:
        logger.info("Requesting %s via provider %r", log_label or "generation", provider.name)
        try:
            return _call_provider_once(provider, prompt)
        except TestCaseGenError as exc:
            logger.warning("Provider %r failed for %s: %s — trying next provider", provider.name, log_label, exc)
            last_error = exc
            continue

    raise last_error or NoProvidersAvailableError("All configured providers failed.")


def generate_test_cases(*, title, description, examples=None, num_cases=6):
    """
    Returns a list of {"stdin": str, "expected_output": str, "is_sample": bool}
    dicts generated by the first working configured LLM provider, tried in
    priority order.

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    from apps.learning.models import LLMProvider

    providers = list(LLMProvider.objects.filter(is_active=True).order_by("priority", "id"))
    if not providers:
        raise NoProvidersAvailableError("No active LLMProvider is configured.")

    prompt = _build_prompt(title, description, examples, num_cases)

    last_error = None
    for provider in providers:
        logger.info("Requesting test case generation for %r via provider %r", title, provider.name)
        try:
            content = _call_provider_once(provider, prompt)
            parsed = _extract_json(content)
        except (TestCaseGenError, json.JSONDecodeError) as exc:
            logger.warning("Provider %r failed for %r: %s — trying next provider", provider.name, title, exc)
            last_error = exc
            continue

        raw_cases = parsed.get("test_cases")
        if not isinstance(raw_cases, list) or not raw_cases:
            logger.warning("Provider %r returned no usable test_cases for %r — trying next provider", provider.name, title)
            last_error = TestCaseGenServiceError(f"No usable test_cases in response: {content[:300]!r}")
            continue

        cases = []
        for item in raw_cases:
            if not isinstance(item, dict):
                continue
            expected_output = str(item.get("expected_output", "")).strip()
            if not expected_output:
                continue
            cases.append({
                "stdin": str(item.get("stdin", "")).strip(),
                "expected_output": expected_output,
                "is_sample": bool(item.get("is_sample", False)),
                "explanation": str(item.get("explanation", "")).strip(),
            })

        if not cases:
            last_error = TestCaseGenServiceError("Provider returned test_cases but none had a usable expected_output.")
            continue

        logger.info("Generated %d test cases for %r via provider %r", len(cases), title, provider.name)
        return cases

    raise last_error or NoProvidersAvailableError("All configured providers failed.")


def derive_examples(cases):
    """Reshape the is_sample=True entries from generate_test_cases() into
    Problem.examples format ({input, output, explanation}), so a problem
    that was created with no worked examples gets some for free alongside
    its test cases. If the LLM didn't mark anything as sample, falls back
    to the first case with non-empty stdin (skipping empty/degenerate edge
    cases, which make poor illustrative examples), or the first case at all
    if every one has empty stdin — so a problem is never left with zero
    examples after generation."""
    samples = [c for c in cases if c.get("is_sample")]
    if not samples and cases:
        samples = [next((c for c in cases if c.get("stdin")), cases[0])]
    return [
        {
            "input": c["stdin"],
            "output": c["expected_output"],
            "explanation": c.get("explanation", ""),
        }
        for c in samples
    ]
