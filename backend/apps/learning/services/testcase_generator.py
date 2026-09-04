"""
LLM-based test case generation for Problems and Lab exercises.

Calls an OpenAI-compatible chat completion endpoint to generate
stdin/expected_output test case pairs from a problem statement. Providers
are configured in the DB (LLMProvider model, editable in Django admin) and
selected round-robin: each request uses whichever active provider was used
longest ago, falling through to the next-least-recently-used one only if
that call errors or times out. With many providers configured, this
spreads load across all of them over time instead of either (a) always
hammering the same "priority 0" one, or (b) firing every single one in
parallel for every single request, which would burn through each
provider's own rate limit for one generation call and doesn't need to
happen when there are 10-20 of them to rotate through instead.

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
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)


class TestCaseGenError(Exception):
    """Base exception for test case generation errors."""


class TestCaseGenTimeoutError(TestCaseGenError):
    """Raised when the LLM request times out."""


class TestCaseGenServiceError(TestCaseGenError):
    """Raised when the LLM service returns an error or an unusable response."""


class TestCaseGenTruncatedError(TestCaseGenServiceError):
    """Raised when the reply looks cut off mid-JSON (an opening { with no
    matching closing }) — most often a reasoning model burning its whole
    max_tokens budget on hidden reasoning before it gets to the actual
    answer. Callers can retry the same provider with a larger max_tokens
    instead of just giving up."""


class NoProvidersAvailableError(TestCaseGenError):
    """Raised when there are no active LLMProvider rows to try, or every one failed."""


PROMPT_TEMPLATE = """You are an expert competitive programmer and computer science educator generating test cases for an online judge system.

Problem title: {title}

Problem description:
{description}

{examples_block}

Generate {num_cases} test cases that exercise this problem correctly, including the
examples above (reproduced exactly) plus additional edge cases (empty/minimum input,
large values, duplicates, negative numbers, boundary conditions — whatever is relevant
to THIS specific problem).

Rules:
1. COMPLETE & VALID INPUT (CRITICAL):
   - "stdin" MUST contain the COMPLETE raw input data required for a program reading from standard input.
   - For Tree / Graph / List / Array problems: If the problem asks for tree traversal, node counts, or list operations, stdin MUST contain the complete dataset (e.g. node count N followed by the N node values, or a complete level-order array like "3 9 20 null null 15 8"). NEVER generate a single arbitrary integer (like "4") when the output requires 5 or more tree nodes!
2. EXACT EXPECTED OUTPUT (CRITICAL):
   - "expected_output" must be the EXACT stdout text produced by correctly solving the problem step-by-step.
   - For Tree Traversals (preorder/inorder/postorder), calculate the EXACT node visit sequence (e.g. "3 9 20 15 8").
3. RICH WORKED EXPLANATION:
   - For every "is_sample": true case, provide a clear, step-by-step explanation. If the problem involves a Binary Tree or Graph, describe the tree structure (root, left child, right child) and show how the traversal order was derived step-by-step.
   - Preserve formatting inside "explanation" strings using \\n line breaks and spaces when showing ASCII trees or traversal traces. For traversal examples, include a final line like "Preorder Order: 1 -> 2 -> 4 -> 5 -> 3 -> 6" (or the matching traversal name/order for the problem).
   - The explanation MUST match the exact "stdin" tree/graph/list data and the exact "expected_output"; never explain a different structure than the one in the test case.
4. JSON SHAPE:
   - Respond with ONLY a JSON object in this exact shape:
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


_JSON_SIMPLE_ESCAPES = set('"\\/bfnrt')


def _repair_invalid_json_escapes(raw):
    """Models frequently emit raw backslashes inside JSON string values —
    LaTeX-style math ("\\times", "\\frac"), Windows paths, etc. — without
    escaping them for JSON, which json.loads rejects as "Invalid \\escape".
    Doubles any backslash that isn't already part of a valid JSON escape
    (\\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX) so those strings parse
    instead of the whole response being thrown away."""
    out = []
    i, n = 0, len(raw)
    while i < n:
        c = raw[i]
        if c == "\\" and i + 1 < n:
            nxt = raw[i + 1]
            if nxt in _JSON_SIMPLE_ESCAPES:
                out.append(c)
                out.append(nxt)
                i += 2
                continue
            if nxt == "u" and re.match(r"[0-9a-fA-F]{4}", raw[i + 2:i + 6]):
                out.append(raw[i:i + 6])
                i += 6
                continue
            out.append("\\\\")
            i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _extract_json(text):
    """LLMs sometimes wrap JSON in ```json fences or add stray prose around
    it — strip fences and pull out the first {...} block."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        if "{" in text and "}" not in text:
            # An opening brace with no closing one anywhere in the reply —
            # the response was cut off mid-JSON, not malformed/absent.
            raise TestCaseGenTruncatedError(f"LLM reply was truncated mid-JSON: {text[:200]!r}")
        raise TestCaseGenServiceError(f"No JSON object found in LLM response: {text[:200]!r}")
    raw = match.group(0)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return json.loads(_repair_invalid_json_escapes(raw))
        except json.JSONDecodeError as exc:
            raise TestCaseGenServiceError(f"Unparseable JSON from LLM response: {exc}") from exc


def _call_provider_once(provider, prompt, max_tokens=None):
    """POST to one provider and return the raw text content of its reply.
    `max_tokens` overrides the provider's configured value — used to retry
    with a larger budget when a first attempt came back truncated.
    Raises TestCaseGenTimeoutError / TestCaseGenServiceError on failure."""
    payload = {
        "model": provider.model_name,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": provider.temperature,
        "top_p": provider.top_p,
        "max_tokens": max_tokens or provider.max_tokens,
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


def _providers_in_rotation_order():
    """Active providers ordered least-recently-used first (never-used ones
    first of all), with `priority` as a tie-breaker. Each call to this
    naturally continues the rotation from wherever the last request left
    off, since selection is driven by the persisted last_used_at column
    rather than any in-process state (which wouldn't be shared across
    gunicorn's worker processes anyway)."""
    from apps.learning.models import LLMProvider

    providers = list(
        LLMProvider.objects.filter(is_active=True)
        .order_by(F("last_used_at").asc(nulls_first=True), "priority", "id")
    )
    if not providers:
        raise NoProvidersAvailableError("No active LLMProvider is configured.")
    return providers


def _mark_provider_used(provider):
    from apps.learning.models import LLMProvider

    LLMProvider.objects.filter(id=provider.id).update(last_used_at=timezone.now())


def _try_providers_in_order(providers, prompt, *, transform=lambda content: content, log_label=""):
    """
    Try providers one at a time in the given (round-robin) order — NOT in
    parallel. A provider is marked used the moment it's picked (before the
    call, whether it ultimately succeeds or not), so it rotates to the back
    of the queue for the next unrelated request regardless of outcome —
    a slow/failing provider doesn't keep getting tried first forever, and a
    single generation call only ever occupies one provider's rate limit at
    a time (a few, if earlier ones in the rotation fail).

    `transform` may raise to reject an otherwise-200 response (e.g.
    unparseable/unusable JSON) — that's treated the same as a network
    failure and we move on to the next provider in the rotation.

    Raises a TestCaseGenError subclass if every provider in `providers`
    fails.
    """
    label = log_label or "generation"
    errors = {}
    for provider in providers:
        _mark_provider_used(provider)
        logger.info("Trying provider %r for %s", provider.name, label)
        try:
            content = _call_provider_once(provider, prompt)
            result = transform(content)
        except TestCaseGenTruncatedError:
            # Likely a reasoning model that burned its budget on hidden
            # reasoning before reaching the answer — same provider, more
            # room, once, before giving up on it and moving on.
            bigger_budget = min(provider.max_tokens * 2, 16000)
            logger.warning(
                "Provider %r truncated for %s — retrying with max_tokens=%d",
                provider.name, label, bigger_budget,
            )
            try:
                content = _call_provider_once(provider, prompt, max_tokens=bigger_budget)
                result = transform(content)
            except Exception as exc:  # noqa: BLE001 — any failure just means "try the next one"
                logger.warning("Provider %r failed for %s after retry: %s — trying next", provider.name, label, exc)
                errors[provider.name] = exc
                continue
        except Exception as exc:  # noqa: BLE001 — any failure just means "try the next one"
            logger.warning("Provider %r failed for %s: %s — trying next", provider.name, label, exc)
            errors[provider.name] = exc
            continue
        logger.info("Provider %r succeeded for %s", provider.name, label)
        return result

    if errors:
        detail = "; ".join(f"{name}: {exc}" for name, exc in errors.items())
        raise TestCaseGenServiceError(f"All {len(providers)} provider(s) failed — {detail}")
    raise NoProvidersAvailableError("All configured providers failed.")


def generate_text_with_fallback(prompt, *, log_label=""):
    """
    Send `prompt` to active configured LLMProviders one at a time, in
    round-robin order, and return the raw text content of whichever
    succeeds first.

    Shared by generate_test_cases() (which then parses JSON out of the
    result) and any other caller that just wants free-text back (e.g. an
    algorithm write-up for a lab report).

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    providers = _providers_in_rotation_order()
    return _try_providers_in_order(providers, prompt, log_label=log_label)


def _parse_and_validate_cases(content):
    """Turn one provider's raw reply into a validated list of
    {"stdin", "expected_output", "is_sample", "explanation"} dicts, or
    raise TestCaseGenServiceError if the response wasn't usable — used as
    the `transform` in _try_providers_in_order() so a 200-but-garbled
    response from one provider is treated as a failure and we move on to
    the next provider in the rotation instead of returning garbage."""
    parsed = _extract_json(content)

    raw_cases = parsed.get("test_cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise TestCaseGenServiceError(f"No usable test_cases in response: {content[:300]!r}")

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
        raise TestCaseGenServiceError("Response had test_cases but none had a usable expected_output.")

    return cases


def num_cases_for_difficulty(difficulty):
    """Cap generated test cases at 4, scaled by difficulty so easy problems
    don't get padded with redundant cases and hard ones still get enough
    coverage to be meaningful."""
    return {"Easy": 2, "Medium": 3, "Hard": 4}.get((difficulty or "").strip().title(), 3)


def extract_difficulty(description):
    """LabExercise has no dedicated difficulty field — its compiled
    description blob has an optional "Difficulty: Easy/Medium/Hard" line
    (see compileDescription() in frontend/StaffLabPanel.jsx). Pull it out
    so lab exercises get the same difficulty-scaled test case cap as
    Problems; defaults to Medium's cap (via num_cases_for_difficulty) when
    absent."""
    if not description:
        return None
    match = re.search(r"Difficulty:\s*(Easy|Medium|Hard)", description, re.IGNORECASE)
    return match.group(1).title() if match else None


def generate_test_cases(*, title, description, examples=None, num_cases=None, difficulty=None):
    """
    Returns a list of {"stdin": str, "expected_output": str, "is_sample": bool}
    dicts generated by one active LLM provider, trying the next one in the
    round-robin rotation if the first fails.

    `num_cases` defaults to a difficulty-scaled cap (see
    num_cases_for_difficulty) when not given explicitly.

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    if num_cases is None:
        num_cases = num_cases_for_difficulty(difficulty)
    providers = _providers_in_rotation_order()
    prompt = _build_prompt(title, description, examples, num_cases)
    cases = _try_providers_in_order(providers, prompt, transform=_parse_and_validate_cases, log_label=title)
    logger.info("Generated %d test cases for %r", len(cases), title)
    return cases


EXPLANATION_PROMPT_TEMPLATE = """You are a computer science professor writing a comprehensive, crystal-clear explanation for a student attempting the following problem.

Title: {title}

Description:
{description}

Write a detailed, pedagogical explanation covering:
1. Core Problem Concept: Explain what the problem is asking in plain language. If it involves a Binary Tree, Graph, Stack, or specific Data Structure, clearly explain the structure and properties (e.g. for Binary Trees: Root, Left Subtree, Right Subtree, and how Preorder/Inorder/Postorder traversals work).
2. Step-by-Step Approach & Key Insights: Explain the algorithmic approach, key insights, and edge cases to handle.
3. Visualization: For Tree or Graph problems, include an ASCII diagram of a sample tree and trace its step-by-step traversal so the student can visually understand the process.

Write at least 3 short paragraphs. Do not return a one-line explanation.
Respond with ONLY the explanation text, clear, educational, and structured.
"""
HINT_PROMPT_TEMPLATE = """You are writing a single short hint for a student who is stuck on the
following problem.

Title: {title}

Description:
{description}

Write ONE short sentence — a nudge toward the right technique or approach, not the
answer. It should help someone who is stuck get moving again without solving the
problem for them.

Respond with ONLY the hint text — no "Hint:" prefix, no commentary, one sentence.
"""


def generate_explanation(*, title, description, examples=None, difficulty=None):
    """Returns a real, multi-paragraph plain-text explanation of the
    problem's concept/approach — shown to students instead of the old hints
    list. Raises a TestCaseGenError subclass if every active provider fails.

    `examples`/`difficulty` aren't used in the prompt (the explanation is
    concept-level, not example-specific) but are accepted so callers can
    pass the same kwargs used for generate_test_cases() without filtering."""
    prompt = EXPLANATION_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (explanation)")
    explanation = text.strip()
    if not explanation:
        raise TestCaseGenServiceError("LLM returned an empty explanation.")
    return explanation


PARAM_SCHEMA_PROMPT_TEMPLATE = """You are inferring a structured function signature for an online judge, given a problem statement.

Title: {title}

Description:
{description}
{examples_block}

Respond with ONLY a JSON object of this exact shape, nothing else:
{{"params": [{{"name": "paramName", "type": "int", "order": 0}}, ...], "return_type": "int"}}

Rules:
- "type" and "return_type" must each be one of: int, float, double, string, boolean, or one of those
  with "[]" (1D array) or "[][]" (2D array) appended — nothing else (no objects, no other type names).
- "order" values must be 0..N-1 matching each parameter's position in the function's argument list.
- Pick param names that match the problem's natural variable names (e.g. "nums", "target").
- Do not include a "self" or "this" parameter.
"""


def generate_param_schema(*, title, description, examples=None):
    """Returns a validated {"params": [...], "return_type": ...} dict inferred
    by an LLM from the problem statement — the same structured schema a
    staff member could hand-author in the Problem Bank's schema editor (see
    services/param_types.py for the type vocabulary and validation rules).
    Raises a TestCaseGenError subclass if every active provider fails, or if
    every provider's response fails schema validation."""
    if examples:
        blocks = [f"Example input:\n{ex.get('input', '')}\nExample output:\n{ex.get('output', '')}" for ex in examples]
        examples_block = "\nExamples:\n\n" + "\n\n".join(blocks)
    else:
        examples_block = ""

    prompt = PARAM_SCHEMA_PROMPT_TEMPLATE.format(title=title or "", description=description or "", examples_block=examples_block)
    providers = _providers_in_rotation_order()
    schema = _try_providers_in_order(providers, prompt, transform=_parse_and_validate_schema, log_label=f"{title} (param schema)")
    logger.info("Generated param schema for %r: %s", title, schema)
    return schema


def _parse_and_validate_schema(content):
    from . import param_types

    parsed = _extract_json(content)
    errors = param_types.validate_param_schema(parsed)
    if errors:
        raise TestCaseGenServiceError(f"LLM produced an invalid schema ({'; '.join(errors)}): {content[:300]!r}")
    return parsed


def generate_hint(*, title, description):
    """Returns a single short (one-sentence) nudge-hint — distinct from
    generate_explanation()'s full write-up. Used for lab exercises, whose
    description blob has an optional "Hint: ..." line staff can otherwise
    author by hand. Raises a TestCaseGenError subclass if every active
    provider fails."""
    prompt = HINT_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (hint)")
    hint = text.strip()
    if not hint:
        raise TestCaseGenServiceError("LLM returned an empty hint.")
    return hint


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
