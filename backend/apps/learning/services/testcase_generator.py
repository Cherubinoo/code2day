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


_MOJIBAKE_MARKERS = ("Ã", "Â", "â€", "â\x80", "â\x84", "â\x86", "Ã¢", "�")


def _fix_mojibake(text):
    """Undo the classic "UTF-8 bytes decoded as Latin-1/CP1252" corruption
    (e.g. a curly apostrophe shows up as ``â€™`` and ``x²`` as ``xÂ²``).

    Some stored explanations were generated before the streaming decode was
    pinned to UTF-8, so their text is doubly-encoded garbage. Re-encoding as
    CP1252 and decoding as UTF-8 reverses it. Only applied when it actually
    removes mojibake markers and introduces no U+FFFD replacement chars, so
    clean text (and legitimately accented prose) is never touched."""
    if not text or not any(m in text for m in _MOJIBAKE_MARKERS):
        return text
    try:
        repaired = text.encode("cp1252", errors="strict").decode("utf-8", errors="strict")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text
    before = sum(text.count(m) for m in _MOJIBAKE_MARKERS)
    after = sum(repaired.count(m) for m in _MOJIBAKE_MARKERS)
    if after < before and "�" not in repaired:
        # A single pass often leaves a second layer ("Ã¢â‚¬â„¢"); recurse once.
        return _fix_mojibake(repaired)
    return text


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


def _extract_json_array(text):
    """Same idea as _extract_json but for a top-level JSON array reply
    (e.g. a list of hint strings) instead of an object — LLMs wrap these in
    fences/prose the same way."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        if "[" in text and "]" not in text:
            raise TestCaseGenTruncatedError(f"LLM reply was truncated mid-JSON: {text[:200]!r}")
        raise TestCaseGenServiceError(f"No JSON array found in LLM response: {text[:200]!r}")
    raw = match.group(0)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        try:
            return json.loads(_repair_invalid_json_escapes(raw))
        except json.JSONDecodeError as exc:
            raise TestCaseGenServiceError(f"Unparseable JSON from LLM response: {exc}") from exc


def _call_provider_once(provider, prompt, max_tokens=None):
    """POST to one provider and return (content, usage) — usage is
    whatever token-count dict the provider handed back (possibly empty,
    e.g. a provider that doesn't report usage on streaming responses),
    used only for the cost/usage dashboard, never for control flow.
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
    if provider.use_streaming:
        payload["stream_options"] = {"include_usage": True}
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
        return body["choices"][0]["message"]["content"], (body.get("usage") or {})

    except requests.exceptions.Timeout as exc:
        raise TestCaseGenTimeoutError(f"Request timed out after {provider.timeout_seconds}s") from exc
    except requests.exceptions.RequestException as exc:
        raise TestCaseGenServiceError(f"Request failed: {exc}") from exc
    except (KeyError, IndexError, ValueError) as exc:
        raise TestCaseGenServiceError(f"Unexpected response shape: {exc}") from exc


def _consume_stream(url, payload, headers, timeout_seconds):
    """Read an OpenAI-style SSE stream and concatenate delta.content chunks
    (reasoning_content, if any, is logged but not included in the result).
    Returns (content, usage) — usage comes from the final chunk when the
    provider honors `stream_options.include_usage` (most OpenAI-compatible
    providers do), otherwise an empty dict."""
    content_parts = []
    reasoning_seen = False
    usage = {}
    try:
        with requests.post(url, json=payload, headers=headers, timeout=timeout_seconds, stream=True) as response:
            if response.status_code != 200:
                raise TestCaseGenServiceError(f"HTTP {response.status_code}: {response.text[:500]}")
            # text/event-stream responses usually carry no charset, so
            # `requests` falls back to guessing (often Latin-1) for
            # iter_lines(decode_unicode=True) — any multi-byte UTF-8
            # character the LLM writes (e.g. "→") then gets decoded one
            # byte at a time into mojibake ("â\x86'"-style garbage) baked
            # straight into the stored explanation. Providers are OpenAI-
            # compatible and always emit UTF-8, so force it explicitly
            # instead of trusting the guess.
            response.encoding = "utf-8"
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
                if chunk.get("usage"):
                    usage = chunk["usage"]
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
    return "".join(content_parts), usage


_FEATURE_RE = re.compile(r"\(([^)]+)\)\s*$")


def _log_llm_usage(provider, label, *, success, usage=None, error=None):
    """Records one LLMUsageLog row for a single actual HTTP call. Never
    raises — a logging failure must never take down a generation call.
    `label` is whatever log_label the caller passed (e.g. "Two Sum
    (generic schema)"); the parenthesized suffix becomes `feature` so the
    cost dashboard can group by generation type without every call site
    needing to pass a separate tag."""
    try:
        from apps.learning.models import LLMUsageLog

        usage = usage or {}
        prompt_tokens = int(usage.get("prompt_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or 0)
        total_tokens = int(usage.get("total_tokens") or (prompt_tokens + completion_tokens))
        feature_match = _FEATURE_RE.search(label or "")
        feature = feature_match.group(1) if feature_match else ""
        cost = (
            (prompt_tokens / 1_000_000) * float(provider.input_cost_per_million)
            + (completion_tokens / 1_000_000) * float(provider.output_cost_per_million)
        )
        LLMUsageLog.objects.create(
            provider=provider, provider_name=provider.name, model_name=provider.model_name,
            feature=feature, label=(label or "")[:255], success=success,
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, total_tokens=total_tokens,
            estimated_cost=cost, error_message=str(error or "")[:2000],
        )
    except Exception:  # noqa: BLE001 — usage logging must never break generation
        logger.exception("Failed to record LLMUsageLog (non-fatal)")


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
            content, usage = _call_provider_once(provider, prompt)
            result = transform(content)
        except TestCaseGenTruncatedError as exc:
            # Likely a reasoning model that burned its budget on hidden
            # reasoning before reaching the answer — same provider, more
            # room, once, before giving up on it and moving on.
            _log_llm_usage(provider, label, success=False, error=exc)
            bigger_budget = min(provider.max_tokens * 2, 16000)
            logger.warning(
                "Provider %r truncated for %s — retrying with max_tokens=%d",
                provider.name, label, bigger_budget,
            )
            try:
                content, usage = _call_provider_once(provider, prompt, max_tokens=bigger_budget)
                result = transform(content)
            except Exception as exc2:  # noqa: BLE001 — any failure just means "try the next one"
                logger.warning("Provider %r failed for %s after retry: %s — trying next", provider.name, label, exc2)
                _log_llm_usage(provider, label, success=False, error=exc2)
                errors[provider.name] = exc2
                continue
        except Exception as exc:  # noqa: BLE001 — any failure just means "try the next one"
            logger.warning("Provider %r failed for %s: %s — trying next", provider.name, label, exc)
            _log_llm_usage(provider, label, success=False, error=exc)
            errors[provider.name] = exc
            continue
        logger.info("Provider %r succeeded for %s", provider.name, label)
        _log_llm_usage(provider, label, success=True, usage=usage)
        return result

    if errors:
        detail = "; ".join(f"{name}: {exc}" for name, exc in errors.items())
        raise TestCaseGenServiceError(f"All {len(providers)} provider(s) failed — {detail}")
    raise NoProvidersAvailableError("All configured providers failed.")


def generate_text_with_fallback(prompt, *, log_label="", providers=None):
    """
    Send `prompt` to active configured LLMProviders one at a time, in
    round-robin order, and return the raw text content of whichever
    succeeds first.

    Shared by generate_test_cases() (which then parses JSON out of the
    result) and any other caller that just wants free-text back (e.g. an
    algorithm write-up for a lab report).

    `providers`, if given, overrides the normal rotation-order lookup —
    used by bulk sweeps to pin one specific provider per parallel worker
    (pass e.g. `providers=[some_provider]`) so several providers can be
    hit concurrently instead of the usual one-at-a-time-with-fallback
    behavior. With a single-provider list there's no fallback target if it
    fails, same as any other exhausted rotation.

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    providers = providers if providers is not None else _providers_in_rotation_order()
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


def generate_test_cases(*, title, description, examples=None, num_cases=None, difficulty=None, providers=None):
    """
    Returns a list of {"stdin": str, "expected_output": str, "is_sample": bool}
    dicts generated by one active LLM provider, trying the next one in the
    round-robin rotation if the first fails.

    `num_cases` defaults to a difficulty-scaled cap (see
    num_cases_for_difficulty) when not given explicitly. `providers`
    overrides the normal rotation lookup (see generate_text_with_fallback).

    Raises a TestCaseGenError subclass if every active provider fails (or
    none are configured).
    """
    if num_cases is None:
        num_cases = num_cases_for_difficulty(difficulty)
    providers = providers if providers is not None else _providers_in_rotation_order()
    prompt = _build_prompt(title, description, examples, num_cases)
    cases = _try_providers_in_order(providers, prompt, transform=_parse_and_validate_cases, log_label=f"{title} (test cases)")
    cases = _cap_sample_cases(cases)
    logger.info("Generated %d test cases for %r", len(cases), title)
    return cases


MAX_SAMPLE_CASES = 2


def _cap_sample_cases(cases):
    """At most MAX_SAMPLE_CASES cases stay visible ("is_sample": True,
    shown to students as worked "Example N" cards) — the LLM sometimes
    marks every given example as a sample (e.g. 3+ provided examples all
    get reproduced with is_sample=True), which used to mean every one of
    them became a visible example with no cap. Anything past the first
    MAX_SAMPLE_CASES stays a real test case (still generated, still used
    for grading) but is demoted to hidden rather than shown."""
    seen = 0
    capped = []
    for case in cases:
        if case.get("is_sample"):
            seen += 1
            if seen > MAX_SAMPLE_CASES:
                case = {**case, "is_sample": False}
        capped.append(case)
    return capped


_EXPLANATION_BODY_RULES = """Write it as ONE continuous "Problem Explanation" — a single flowing piece of teaching prose. Do NOT split it into labelled sections and do NOT use headings like "Story Hook", "Core Problem Concept", "Step-by-Step Approach", "Key Insights", "Edge Cases" or "Visualization". It should read as one explanation a teacher gives out loud, start to finish.

Cover, woven together naturally in this order but with no visible labels:
- Open with a brief (2-3 sentence) relatable hook — a character doing an everyday task whose structure mirrors this problem's real data structure/algorithm — then slide straight from the hook into the actual concept without announcing the transition.
- What the problem is really asking, in plain language, tying the hook's objects to the real terms. If it involves a Binary Tree, Graph, Stack or similar, explain that structure and its relevant properties.
- The approach to solve it, the key insight that makes it work, and the edge cases to watch for — as ordinary prose, keeping the hook's character carrying out the steps.
- Then walk through {sample_count} concrete worked example(s) chosen to fit this problem: for each, give a specific input, the expected output, and a short trace of how the approach reaches that output. Pick the example count and shape from the problem's own complexity — one is plenty for a simple problem, two when a second case shows a meaningfully different path or edge case.
- For Tree or Graph problems, include a small ASCII diagram of the sample structure and trace the walk over it.

Keep it precise and tailored to THIS problem — a few short paragraphs, not a padded essay, every sentence teaching something specific to this problem's mechanics. No generic filler, no restating a point to pad length, never a one-line answer."""

EXPLANATION_PROMPT_TEMPLATE = """You are a gifted teacher who makes a programming problem stick by opening with a short relatable hook and then teaching the idea in plain language.

Title: {title}

Description:
{description}

""" + _EXPLANATION_BODY_RULES.format(sample_count="one or two") + """

Respond with ONLY the explanation text — clear, educational, continuous prose. No section headings, no JSON, no commentary.
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


def generate_explanation(*, title, description, examples=None, difficulty=None, providers=None):
    """Returns a real, multi-paragraph plain-text explanation of the
    problem's concept/approach — shown to students instead of the old hints
    list. Raises a TestCaseGenError subclass if every active provider fails.

    `examples`/`difficulty` aren't used in the prompt (the explanation is
    concept-level, not example-specific) but are accepted so callers can
    pass the same kwargs used for generate_test_cases() without filtering.
    `providers` overrides the normal rotation lookup (see
    generate_text_with_fallback) — used to pin one provider per parallel
    worker in the bulk sweeps."""
    prompt = EXPLANATION_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (explanation)", providers=providers)
    explanation = _fix_mojibake(text.strip())
    if not explanation:
        raise TestCaseGenServiceError("LLM returned an empty explanation.")
    return explanation


EXPLANATION_WITH_TITLE_PROMPT_TEMPLATE = """You are a gifted teacher who makes a programming problem stick by opening with a short relatable hook and then teaching the idea in plain language.

Title: {title}

Description:
{description}

""" + _EXPLANATION_BODY_RULES.format(sample_count="one or two") + """

Also propose a new title for the problem that reflects the hook you opened with (e.g. if the hook is a librarian shelving books for a tree problem, something like "The Librarian's Shelving Order" rather than the generic original title) — short (4-8 words), still clearly readable as a programming-problem title.

Respond with ONLY a JSON object of this exact shape, no markdown fences, no commentary:
{{"title": "...", "explanation": "..."}}
"""


def generate_explanation_with_title(*, title, description, examples=None, difficulty=None, providers=None):
    """Like generate_explanation(), but also asks the LLM for a new title
    matching the story hook, returned as (new_title, explanation). Used
    only by the Problem Bank admin's explanation regeneration (single-
    problem and bulk) — generate_explanation() itself is untouched and
    still title-free for its other callers (lab exercises, the "fill
    missing metadata" sweep), where changing the title as a side effect of
    filling in a missing explanation would be a surprising, unrequested
    side effect."""
    prompt = EXPLANATION_WITH_TITLE_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (explanation+title)", providers=providers)
    data = _extract_json(text)
    new_title = _fix_mojibake((data.get("title") or "").strip())
    explanation = _fix_mojibake((data.get("explanation") or "").strip())
    if not explanation:
        raise TestCaseGenServiceError("LLM returned an empty explanation.")
    if not new_title:
        raise TestCaseGenServiceError("LLM returned an empty title.")
    return new_title, explanation


SCENARIO_DESCRIPTION_PROMPT_TEMPLATE = """You are rewriting a coding problem's statement into an original, real-world scenario — the same technical problem, dressed in a story instead of dry algorithmic phrasing, so it reads as this platform's own content rather than a copy of a well-known problem bank.

Title: {title}

Original statement:
{description}

Rewrite it as a short, concrete scenario (a person, team, or system doing some everyday or workplace task whose structure naturally matches the underlying data/algorithm — e.g. a warehouse dispatcher for a graph problem, a librarian shelving returns for a tree problem, a cashier counting change for a greedy/array problem). Then state precisely what must be computed, in plain language.

Hard rules — the input, output, constraints, and every example's actual values must remain EXACTLY as they are in the original; you are changing the framing and variable *flavor text* only, never the technical contract a program would be graded against:
- Do not invent new inputs, outputs, edge cases, or constraints, and do not drop any that are already there.
- Never mention LeetCode, any other problem-bank/platform name, a problem number, or include any URL — strip out any "this is the same as problem N" note entirely; the rewritten statement must read as fully original.
- Do not include the raw formal Input:/Output: example blocks yourself — those are kept separately; just write the narrative statement (scenario + what must be computed + any constraints called out in prose).
- Keep it readable in a similar length to the original — a short scenario paragraph or two, not a long story.

Respond with ONLY the rewritten statement text — no title repetition, no markdown headers, no commentary about what you changed.
"""


def generate_scenario_description(*, title, description, examples=None, providers=None):
    """Returns a rewritten problem statement — the same technical problem
    wrapped in an original real-world scenario, with any source-platform
    branding/cross-references (LeetCode name, problem numbers, URLs)
    stripped out. Raises a TestCaseGenError subclass if every active
    provider fails or returns an empty rewrite.

    `examples` isn't used in the prompt (the rewrite must never change
    example values, so the model isn't given them to paraphrase — the
    formal Input:/Output: blocks stay exactly as stored) but is accepted so
    callers can pass the same kwargs used elsewhere without filtering.
    `providers` overrides the normal rotation lookup — used to pin one
    provider per parallel worker in the bulk sweep, same convention as
    generate_explanation()."""
    prompt = SCENARIO_DESCRIPTION_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (scenario description)", providers=providers)
    rewritten = text.strip()
    if not rewritten:
        raise TestCaseGenServiceError("LLM returned an empty scenario description.")
    return rewritten


SCENARIO_DESCRIPTION_WITH_TITLE_PROMPT_TEMPLATE = """You are rewriting a coding problem's statement into an original, real-world scenario — the same technical problem, dressed in a story instead of dry algorithmic phrasing, so it reads as this platform's own content rather than a copy of a well-known problem bank.

Title: {title}

Original statement:
{description}

Rewrite it as a short, concrete scenario (a person, team, or system doing some everyday or workplace task whose structure naturally matches the underlying data/algorithm — e.g. a warehouse dispatcher for a graph problem, a librarian shelving returns for a tree problem, a cashier counting change for a greedy/array problem). Then state precisely what must be computed, in plain language.

Hard rules — the input, output, constraints, and every example's actual values must remain EXACTLY as they are in the original; you are changing the framing and variable *flavor text* only, never the technical contract a program would be graded against:
- Do not invent new inputs, outputs, edge cases, or constraints, and do not drop any that are already there.
- Never mention LeetCode, any other problem-bank/platform name, a problem number, or include any URL — strip out any "this is the same as problem N" note entirely; the rewritten statement must read as fully original.
- Do not include the raw formal Input:/Output: example blocks yourself — those are kept separately; just write the narrative statement (scenario + what must be computed + any constraints called out in prose).
- Keep it readable in a similar length to the original — a short scenario paragraph or two, not a long story.

Also propose a new title matching the new scenario's flavor (e.g. "The Warehouse Dispatcher's Route" for a graph problem framed around a warehouse dispatcher) — short (4-8 words), same technical problem, just fitting the new framing instead of the old generic/source-platform-style one.

Respond with ONLY a JSON object of this exact shape, no markdown fences, no commentary:
{{"title": "...", "description": "..."}}
- "description" is the rewritten narrative statement exactly as specified above (scenario + what must be computed) — never the raw Input:/Output: blocks, never touching example values.
"""


def generate_scenario_description_with_title(*, title, description, examples=None, providers=None):
    """Like generate_scenario_description(), but also asks the LLM for a
    new title matching the new scenario, returned as (new_title,
    description). Same hard rules apply (input/output/constraints/examples
    untouched) — only the title and narrative framing change. Used only by
    the Problem Bank admin's scenario-description regeneration (single-
    problem and the bank-wide/per-topic bulk sweep) —
    generate_scenario_description() itself is untouched for any other
    caller."""
    prompt = SCENARIO_DESCRIPTION_WITH_TITLE_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (scenario description+title)", providers=providers)
    data = _extract_json(text)
    new_title = (data.get("title") or "").strip()
    rewritten = (data.get("description") or "").strip()
    if not rewritten:
        raise TestCaseGenServiceError("LLM returned an empty scenario description.")
    if not new_title:
        raise TestCaseGenServiceError("LLM returned an empty title.")
    return new_title, rewritten


PARAM_SCHEMA_PROMPT_TEMPLATE = """You are inferring a structured execution schema for an online judge, given a problem statement.

Title: {title}

Description:
{description}
{examples_block}

First decide which shape this problem is:

(a) FUNCTION — the student writes one function/method that takes some arguments
    and returns a single value (e.g. "Two Sum", "Reverse a Linked List", "Valid
    Parentheses"). This is the common case.
(b) DESIGN / CLASS — the problem statement describes a CLASS with a constructor
    and several named methods that get called one after another, sharing state
    between calls (e.g. "Design a Vector2D iterator with next()/hasNext()",
    "Implement LRU Cache with get()/put()", "Design a Stack using Queues").
    Recognize this from language like "design a ...", "implement a class ...",
    or a statement that explicitly lists multiple method names to implement.

For a FUNCTION problem, respond with ONLY a JSON object of this exact shape:
{{"kind": "function", "params": [{{"name": "paramName", "type": "int", "order": 0}}, ...], "return_type": "int"}}
- "order" values must be 0..N-1 matching each parameter's position in the function's argument list.
- Pick param names that match the problem's natural variable names (e.g. "nums", "target").
- Do not include a "self" or "this" parameter.

For a DESIGN/CLASS problem, respond with ONLY a JSON object of this exact shape:
{{"kind": "design", "class_name": "ClassName", "methods": {{"ClassName": {{"params": ["int[][]"], "return_type": "void"}}, "next": {{"params": [], "return_type": "int"}}, "hasNext": {{"params": [], "return_type": "boolean"}}}}}}
- "class_name" is the exact class name the student must define, matching the problem statement.
- "methods" must have one entry per constructor/method, keyed by name. Include an entry keyed by
  the exact class_name itself for the constructor (its "return_type" is "void").
- Each method's "params" is a plain list of types in declaration order (no names, no "order" field —
  unlike the FUNCTION shape above).
- A method that returns nothing uses "return_type": "void" (only valid for methods, never as a param type).

Type vocabulary for every "type"/"return_type"/params entry, in BOTH shapes above:
int, float, double, string, boolean, or one of those with "[]" (1D array) or "[][]" (2D array)
appended — nothing else (no objects, no other type names).

Rules:
- Respond with ONLY the JSON object, no markdown fences, no commentary.
"""


def generate_param_schema(*, title, description, examples=None, providers=None):
    """Returns a validated schema inferred by an LLM from the problem
    statement — either the FUNCTION shape ({"kind":"function","params":[...],
    "return_type":...}) or, for a class/design-style problem, the DESIGN
    shape ({"kind":"design","class_name":...,"methods":{...}}) — the same
    structured schema a staff member could hand-author in the Problem Bank's
    schema editor (see services/param_types.py for the type vocabulary and
    validation rules for both shapes). Raises a TestCaseGenError subclass if
    every active provider fails, or if every provider's response fails
    schema validation."""
    if examples:
        blocks = [f"Example input:\n{ex.get('input', '')}\nExample output:\n{ex.get('output', '')}" for ex in examples]
        examples_block = "\nExamples:\n\n" + "\n\n".join(blocks)
    else:
        examples_block = ""

    prompt = PARAM_SCHEMA_PROMPT_TEMPLATE.format(title=title or "", description=description or "", examples_block=examples_block)
    providers = providers if providers is not None else _providers_in_rotation_order()
    schema = _try_providers_in_order(providers, prompt, transform=_parse_and_validate_schema, log_label=f"{title} (param schema)")
    logger.info("Generated param schema for %r: %s", title, schema)
    return schema


def _parse_and_validate_schema(content):
    from . import param_types

    parsed = _extract_json(content)
    errors = param_types.validate_schema(parsed)
    if errors:
        raise TestCaseGenServiceError(f"LLM produced an invalid schema ({'; '.join(errors)}): {content[:300]!r}")
    return parsed


def generate_hint(*, title, description, providers=None):
    """Returns a single short (one-sentence) nudge-hint — distinct from
    generate_explanation()'s full write-up. Used for lab exercises, whose
    description blob has an optional "Hint: ..." line staff can otherwise
    author by hand. Raises a TestCaseGenError subclass if every active
    provider fails."""
    prompt = HINT_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    text = generate_text_with_fallback(prompt, log_label=f"{title} (hint)", providers=providers)
    hint = text.strip()
    if not hint:
        raise TestCaseGenServiceError("LLM returned an empty hint.")
    return hint


HINTS_LIST_PROMPT_TEMPLATE = """You are writing a progressive hint ladder for a student attempting the
following problem: 2 to 4 hints, each one giving away a little more than the last,
without ever stating the full solution or final code. Reason from the problem itself
— never reference LeetCode, any other problem-bank/platform, or a problem number.

Title: {title}

Description:
{description}

Hint 1 should be a gentle nudge toward the right way to think about the problem.
Each following hint should narrow in further — toward the data structure or
technique to use, then toward the key algorithmic step — but the last hint must
still stop short of the answer.

Respond with ONLY a JSON array of strings, one string per hint, ordered from
vaguest to most specific — e.g. ["...", "...", "..."]. No markdown fences, no
commentary, no keys other than the array itself.
"""


def generate_hints(*, title, description, providers=None):
    """Returns a short progressive hint ladder (2-4 strings, vaguest first) for
    Problem.hints — distinct from generate_hint()'s single lab nudge. Raises a
    TestCaseGenError subclass if every active provider fails or every
    provider's reply fails to parse as a non-empty JSON array of strings."""
    prompt = HINTS_LIST_PROMPT_TEMPLATE.format(title=title or "", description=description or "")
    providers = providers if providers is not None else _providers_in_rotation_order()
    hints = _try_providers_in_order(providers, prompt, transform=_parse_hints_list, log_label=f"{title} (hints)")
    return hints


def _parse_hints_list(content):
    parsed = _extract_json_array(content)
    if not isinstance(parsed, list) or not parsed or not all(isinstance(h, str) and h.strip() for h in parsed):
        raise TestCaseGenServiceError(f"LLM did not return a non-empty JSON array of hint strings: {content[:300]!r}")
    return [h.strip() for h in parsed]


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


def run_across_providers_in_parallel(items, call_fn, timeout_seconds=None):
    """Runs call_fn(item, provider) for every item in `items`, assigning
    active LLMProviders round-robin (item 0 -> provider 0, item 1 ->
    provider 1, ..., wrapping around) so N providers genuinely work at the
    same time instead of the normal one-at-a-time-with-fallback rotation.
    This is what makes the admin bulk sweeps (Generate Judge Schemas,
    Validate & Enable Judge, Regenerate All Explanations) fast — an
    individual "generate for this one problem" button already gets one
    provider to itself and feels fast; a bulk sweep over hundreds of
    problems felt slow purely because it was pinning everything onto
    whichever single provider was "next up" in a strict for-loop.

    call_fn must do ONLY the LLM call + parsing — no Django ORM writes —
    because it runs in a worker thread and Django DB connections aren't
    safely handed between threads; do all model .save() calls in the
    caller, in the main thread, from the returned results.

    `timeout_seconds`, if given, bounds how long this waits overall (e.g.
    the caller's own time budget) — any item still in flight past that
    gets an error result ("timed out") instead of blocking the request;
    the underlying thread is abandoned (not force-killed — Python threads
    can't be), finishes on its own with nowhere to write its result, and
    doesn't hold up the response.

    Returns a list of (item, result, error) triples in the same order as
    `items` — result is None if error is set, and vice versa. Raises
    NoProvidersAvailableError up front if there are no active providers at
    all (nothing to assign)."""
    from concurrent.futures import ThreadPoolExecutor, wait
    from django.db import connections

    providers = _providers_in_rotation_order()  # raises NoProvidersAvailableError if none active
    results = [None] * len(items)
    errors = [None] * len(items)

    def task(idx, item, provider):
        try:
            results[idx] = call_fn(item, provider)
        except Exception as exc:  # noqa: BLE001 — surfaced per-item, never crashes the batch
            errors[idx] = exc
        finally:
            connections.close_all()  # this thread's own connection, opened lazily by the ORM calls above

    executor = ThreadPoolExecutor(max_workers=len(providers))
    try:
        future_to_idx = {
            executor.submit(task, idx, item, providers[idx % len(providers)]): idx
            for idx, item in enumerate(items)
        }
        _done, not_done = wait(future_to_idx.keys(), timeout=timeout_seconds)
        for future in not_done:
            errors[future_to_idx[future]] = TestCaseGenTimeoutError(
                "Timed out waiting for this round to finish — try again."
            )
    finally:
        # wait=False: don't block the response on threads still mid-request;
        # cancel_futures=True: drop any not-yet-started tasks outright.
        executor.shutdown(wait=False, cancel_futures=True)

    return list(zip(items, results, errors))
