"""LLM-based `Problem.generic_schema` generation — the same LLM fallback
chain `services/testcase_generator.py` already uses for the legacy
`param_schema` (generate_param_schema), aimed at this package's richer
type vocabulary instead. Two deliberately separate steps, matching how the
admin Problem Bank already treats generation vs. validation as distinct
actions:

  generate_generic_schema()   — "one hit" LLM call. Returns whatever the
                                 LLM produced, normalized to this package's
                                 param shape. Raises only if every provider
                                 fails or the reply isn't even valid JSON —
                                 it does NOT deep-validate the type strings
                                 (that's validate_generic_schema()'s job),
                                 so a schema with a typo'd type still saves
                                 and shows up for the validate pass to catch.

  validate_generic_schema()   — structural check: every declared type
                                 string actually parses via
                                 services/judging/type_system.py, function_name
                                 is a usable identifier, params/custom_structs
                                 are well-formed. Returns a list of error
                                 strings (empty = valid) — same convention as
                                 services/param_types.py's validate_schema().
"""

import re

from ..testcase_generator import (
    TestCaseGenError,
    TestCaseGenServiceError,
    _extract_json,
    _providers_in_rotation_order,
    _try_providers_in_order,
)
from .type_system import parse_type, TypeError_

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

GENERIC_SCHEMA_PROMPT_TEMPLATE = """You are inferring a structured execution schema for a generic, type-driven online judge, given a problem statement.

Title: {title}

Description:
{description}
{examples_block}

The student writes one function/method (inside a class named `Solution`) that
takes some typed arguments and returns a single typed value.

Respond with ONLY a JSON object of this exact shape:
{{"function_name": "twoSum", "params": [{{"name": "nums", "type": "vector<int>"}}, {{"name": "target", "type": "int"}}], "return_type": "vector<int>", "custom_structs": {{}}}}

- "function_name": the method name the student implements, in lowerCamelCase, matching the problem's own terminology if it names one.
- "params": one entry per argument, in declaration order. Pick param names matching the problem's natural variable names (e.g. "nums", "target").
- "return_type": the single type the function returns.
- "custom_structs": ONLY needed if the problem's own data has named fields that don't fit the built-in shapes below (e.g. a "Point" with x/y, an "Interval" with start/end) — a dict of {{"StructName": {{"field": "type", ...}}}}. Leave it as {{}} for anything expressible with the built-in shapes.

Type vocabulary for every "type"/"return_type" entry (nest freely — e.g. "vector<pair<int,int>>", "vector<vector<int>>", "map<string, vector<int>>"):
- Primitives: int, long, float, double, bool, char, string
- Sequences (all share the same wire format, pick whichever reads most naturally): vector<T>, array<T>, list<T>, matrix<T> (2D grid of T), stack<T>, queue<T>, deque<T> — or T[] / T[][] array-suffix form
- linked_list<T> — a singly linked list of T (e.g. for "Reverse Linked List", "Merge Two Sorted Lists")
- binary_tree<T> (or bst<T>) — a binary tree of T, given/returned as a level-order array with null gaps (e.g. for any Tree traversal/construction problem)
- graph — an undirected graph (node/edge-count problems)
- pair<A,B> — a fixed 2-tuple of two (possibly different) types
- map<K,V> — a key-value map
- set<T> — an unordered collection of T
- a name declared in "custom_structs" — a named record with typed fields

Rules:
- Respond with ONLY the JSON object, no markdown fences, no commentary.
- Never invent a type outside this vocabulary (no raw "object", no language-specific names like "Integer" or "List<Integer>").
"""


def generate_generic_schema(*, title, description, examples=None):
    """Returns a schema dict shaped {"function_name", "params": [[name,type],...],
    "return_type", "custom_structs"} inferred by an LLM — NOT deep-validated
    (see validate_generic_schema for that). Raises a TestCaseGenError
    subclass if every active provider fails or replies with unparseable JSON."""
    if examples:
        blocks = [f"Example input:\n{ex.get('input', '')}\nExample output:\n{ex.get('output', '')}" for ex in examples]
        examples_block = "\nExamples:\n\n" + "\n\n".join(blocks)
    else:
        examples_block = ""

    prompt = GENERIC_SCHEMA_PROMPT_TEMPLATE.format(title=title or "", description=description or "", examples_block=examples_block)
    providers = _providers_in_rotation_order()
    schema = _try_providers_in_order(
        providers, prompt, transform=_parse_and_normalize_schema, log_label=f"{title} (generic schema)",
    )
    return schema


def _parse_and_normalize_schema(content):
    parsed = _extract_json(content)
    if not isinstance(parsed, dict):
        raise TestCaseGenServiceError(f"LLM did not return a JSON object: {content[:300]!r}")

    raw_params = parsed.get("params")
    if not isinstance(raw_params, list):
        raise TestCaseGenServiceError(f"LLM response has no usable 'params' list: {content[:300]!r}")

    normalized_params = []
    for item in raw_params:
        if isinstance(item, dict):
            normalized_params.append([str(item.get("name", "")).strip(), str(item.get("type", "")).strip()])
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            normalized_params.append([str(item[0]).strip(), str(item[1]).strip()])
        else:
            raise TestCaseGenServiceError(f"LLM produced a malformed param entry: {item!r}")

    return {
        "function_name": str(parsed.get("function_name", "")).strip(),
        "params": normalized_params,
        "return_type": str(parsed.get("return_type", "")).strip(),
        "custom_structs": parsed.get("custom_structs") or {},
    }


def validate_generic_schema(schema):
    """Structural validation only — every declared type string must
    actually parse via type_system.parse_type. Does not (and cannot,
    without a reference solution) check that the schema is semantically
    the *right* one for the problem. Returns a list of error strings;
    empty means valid."""
    errors = []
    if not isinstance(schema, dict):
        return ["Schema is not a JSON object."]

    function_name = schema.get("function_name")
    if not function_name or not isinstance(function_name, str) or not _IDENTIFIER_RE.match(function_name):
        errors.append(f"function_name {function_name!r} is not a usable identifier.")

    custom_structs = schema.get("custom_structs") or {}
    if not isinstance(custom_structs, dict):
        errors.append("custom_structs must be an object.")
        custom_structs = {}
    else:
        for struct_name, fields in custom_structs.items():
            if not isinstance(fields, dict) or not fields:
                errors.append(f"custom_structs[{struct_name!r}] must be a non-empty object of field:type.")
                continue
            for field_name, field_type in fields.items():
                if not isinstance(field_name, str) or not _IDENTIFIER_RE.match(field_name):
                    errors.append(f"custom_structs[{struct_name!r}] has an invalid field name {field_name!r}.")
                try:
                    parse_type(field_type, custom_structs)
                except TypeError_ as exc:
                    errors.append(f"custom_structs[{struct_name!r}].{field_name}: {exc}")

    params = schema.get("params")
    if not isinstance(params, list) or not params:
        errors.append("params must be a non-empty list.")
        params = []
    for entry in params:
        if not (isinstance(entry, (list, tuple)) and len(entry) == 2):
            errors.append(f"Malformed param entry: {entry!r}")
            continue
        pname, ptype = entry
        if not isinstance(pname, str) or not _IDENTIFIER_RE.match(pname):
            errors.append(f"Param name {pname!r} is not a usable identifier.")
        try:
            parse_type(ptype, custom_structs)
        except TypeError_ as exc:
            errors.append(f"Param {pname!r} type {ptype!r}: {exc}")

    return_type = schema.get("return_type")
    if not return_type or not isinstance(return_type, str):
        errors.append("return_type is missing.")
    else:
        try:
            parse_type(return_type, custom_structs)
        except TypeError_ as exc:
            errors.append(f"return_type {return_type!r}: {exc}")

    return errors


__all__ = ["generate_generic_schema", "validate_generic_schema", "TestCaseGenError"]
