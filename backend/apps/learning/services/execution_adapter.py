from __future__ import annotations

import ast
import json
import re


def build_function_name_candidates(slug: str) -> list[str]:
    parts = [part for part in (slug or "").split("-") if part]
    if not parts:
        return []

    camel_case = parts[0] + "".join(part.capitalize() for part in parts[1:])
    snake_case = "_".join(parts)
    pascal_case = "".join(part.capitalize() for part in parts)
    compact = "".join(parts)

    candidates = []
    for name in (camel_case, snake_case, pascal_case, compact):
        if name and name not in candidates:
            candidates.append(name)
    return candidates


def clean_expected_output(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return ""

    for noisy_prefix in ("output:", "explanation:"):
        if any(line.lower().startswith(noisy_prefix) for line in lines[1:]):
            return lines[0]

    return cleaned


def _coerce_literal(value: str):
    candidate = value.strip()
    if not candidate:
        return ""

    for parser_input in (
        candidate,
        re.sub(r"\btrue\b", "True", re.sub(r"\bfalse\b", "False", re.sub(r"\bnull\b", "None", candidate))),
    ):
        try:
            return ast.literal_eval(parser_input)
        except Exception:
            continue

    return candidate


def _split_top_level_arguments(raw_input: str) -> list[str]:
    parts = []
    current = []
    depth = 0
    quote = None
    escaped = False

    for char in raw_input:
        if quote:
            current.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in {"'", '"'}:
            quote = char
            current.append(char)
            continue

        if char in "([{":
            depth += 1
            current.append(char)
            continue

        if char in ")]}":
            depth = max(depth - 1, 0)
            current.append(char)
            continue

        if char == "," and depth == 0:
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
            continue

        current.append(char)

    tail = "".join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def parse_argument_list(raw_input: str):
    cleaned = str(raw_input or "").strip()
    if not cleaned:
        return []

    if "=" not in cleaned:
        parsed = _coerce_literal(cleaned)
        return parsed if isinstance(parsed, list) else [parsed]

    values = []
    for part in _split_top_level_arguments(cleaned):
        if "=" not in part:
            values.append(_coerce_literal(part))
            continue
        _, raw_value = part.split("=", 1)
        values.append(_coerce_literal(raw_value))
    return values


def normalize_comparable_output(value: str) -> str:
    cleaned = clean_expected_output(value)
    parsed = _coerce_literal(cleaned)

    if isinstance(parsed, str):
        return " ".join(parsed.split())
    if isinstance(parsed, (list, dict, bool, int, float)) or parsed is None:
        return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
    return " ".join(cleaned.split())


def _looks_like_python_function_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code:
        return True

    for name in candidates:
        if f"def {name}(" in source_code:
            return True
    return False


def _build_python_wrapper(source_code: str, candidates: list[str]) -> str:
    candidate_list = json.dumps(candidates)
    return f"""{source_code}

import json as __code2day_json
import sys as __code2day_sys

def __code2day_find_solver():
    candidates = {candidate_list}
    for name in candidates:
        fn = globals().get(name)
        if callable(fn):
            return fn

    solution_cls = globals().get("Solution")
    if solution_cls:
        instance = solution_cls()
        for name in candidates:
            method = getattr(instance, name, None)
            if callable(method):
                return method

    raise NameError("Could not find a matching solver function for this problem.")

def __code2day_serialize(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    return __code2day_json.dumps(value, separators=(",", ":"), ensure_ascii=False)

if __name__ == "__main__":
    raw = __code2day_sys.stdin.read().strip()
    args = __code2day_json.loads(raw) if raw else []
    if not isinstance(args, list):
        args = [args]
    result = __code2day_find_solver()(*args)
    __code2day_sys.stdout.write(__code2day_serialize(result))
"""


def prepare_execution_payload(*, problem, source_code: str, language: str, stdin: str):
    candidates = build_function_name_candidates(getattr(problem, "slug", ""))
    if language != "Python" or not candidates:
        return {"source_code": source_code, "stdin": stdin, "adapted": False}

    if not _looks_like_python_function_solution(source_code, candidates):
        return {"source_code": source_code, "stdin": stdin, "adapted": False}

    try:
        args = parse_argument_list(stdin)
    except Exception:
        return {"source_code": source_code, "stdin": stdin, "adapted": False}

    return {
        "source_code": _build_python_wrapper(source_code, candidates),
        "stdin": json.dumps(args, separators=(",", ":"), ensure_ascii=False),
        "adapted": True,
    }
