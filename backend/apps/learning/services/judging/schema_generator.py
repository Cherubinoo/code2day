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

# Design-pattern counterpart to GENERIC_SCHEMA_PROMPT_TEMPLATE, for
# problems that ask the student to implement a class with a constructor
# plus one or more callable methods (LeetCode's "Design" category —
# iterators, caches, data structures) rather than one plain function. Same
# {title, description, examples_block} interpolation.
DESIGN_SCHEMA_PROMPT_TEMPLATE = """You are inferring a structured execution schema for a generic, type-driven online judge, given a problem statement that asks the student to DESIGN A CLASS (a constructor plus one or more callable methods), not write a single function.

Title: {title}

Description:
{description}
{examples_block}

The student implements a class with a constructor and one or more methods that get called in sequence against one shared instance (e.g. an iterator's `next`/`hasNext`, a cache's `get`/`put`).

Respond with ONLY a JSON object of this exact shape:
{{"class_name": "LRUCache", "methods": {{"LRUCache": {{"params": [{{"name": "capacity", "type": "int"}}], "return_type": "void"}}, "get": {{"params": [{{"name": "key", "type": "int"}}], "return_type": "int"}}, "put": {{"params": [{{"name": "key", "type": "int"}}, {{"name": "value", "type": "int"}}], "return_type": "void"}}}}, "custom_structs": {{}}}}

- "class_name": the class name, matching the problem's own terminology if it names one (e.g. "LRUCache", "ZigzagIterator").
- "methods": one entry per callable operation, INCLUDING the constructor keyed by the exact same string as "class_name" (its "params" are the constructor's arguments, "return_type" always "void"). Every other method the class must implement gets its own entry keyed by its method name (lowerCamelCase, matching the problem's own terminology).
- Each method's "params": one entry per argument, in declaration order, named to match the problem's natural variable names.
- Each method's "return_type": the type it returns, or "void" if it returns nothing.
- "custom_structs": ONLY needed if the problem's own data has named fields that don't fit the built-in shapes below — a dict of {{"StructName": {{"field": "type", ...}}}}. Leave it as {{}} for anything expressible with the built-in shapes.

Type vocabulary — identical to the function-style schema (nest freely, e.g. "vector<pair<int,int>>"):
- Primitives: int, long, float, double, bool, char, string
- Sequences (pick whichever reads most naturally): vector<T>, array<T>, list<T>, matrix<T>, stack<T>, queue<T>, deque<T> — or T[] / T[][]
- linked_list<T>, binary_tree<T> (or bst<T>), graph, pair<A,B>, map<K,V>, set<T>
- a name declared in "custom_structs"

Rules:
- Respond with ONLY the JSON object, no markdown fences, no commentary.
- Never invent a type outside this vocabulary.
- Include EVERY method the student must implement — a missing method means the judge can never call it.
"""

# Cheap, LLM-free heuristic for "does this problem need a design (class +
# multiple methods) schema, or a plain function one?" — checked before
# ever calling an LLM, since the overwhelming majority of problems are
# function-style and this heuristic costs nothing. Deliberately biased
# toward false negatives (defaulting to function-style) rather than false
# positives: a function-style problem wrongly sent to the design prompt
# would get a nonsensical single-method "class", whereas the reverse
# (a design problem sent to the function prompt) is the exact bug this
# heuristic exists to prevent, and the phrases below are strong, specific
# signals LeetCode's own "Design" category statements consistently use.
_DESIGN_PHRASE_RE = re.compile(
    r"\bdesign\s+a\b|\bimplement\s+the\s+\w+\s+class\b|\byour\s+class\s+will\s+be\s+instantiated\b"
    r"|\bthe\s+\w+\s+class\s+is\s+implemented\s+as\s+follows\b",
    re.IGNORECASE,
)


def detect_schema_kind(*, title, description, examples=None):
    """Returns "design" or "function" — a fast heuristic, no LLM call.
    Checks title+description for LeetCode's own stock "Design" category
    phrasing, then falls back to sniffing whether any example's input
    already looks like the design wire format (a 2-element array whose
    first element is itself a list of operation-name strings — the exact
    shape execution_adapter.py's legacy design-payload sniff also checks)."""
    text = f"{title or ''} {description or ''}"
    if _DESIGN_PHRASE_RE.search(text):
        return "design"

    for ex in examples or []:
        raw = ex.get("input")
        if not isinstance(raw, str):
            continue
        try:
            import json as _json
            parsed = _json.loads(raw)
        except (ValueError, TypeError):
            continue
        if (
            isinstance(parsed, list) and len(parsed) == 2
            and isinstance(parsed[0], list) and parsed[0]
            and all(isinstance(op, str) for op in parsed[0])
        ):
            return "design"

    return "function"


def generate_generic_schema(*, title, description, examples=None, providers=None, known_kind=None):
    """Returns a schema dict inferred by an LLM — NOT deep-validated (see
    validate_generic_schema for that). Dispatches to the design-pattern
    prompt/shape (see DESIGN_SCHEMA_PROMPT_TEMPLATE) when
    detect_schema_kind() calls this a class/design problem, otherwise the
    plain function-style prompt/shape below — the returned schema always
    carries an explicit "kind" either way. Raises a TestCaseGenError
    subclass if every active provider fails or replies with unparseable
    JSON.

    `known_kind`, if given ("design", "function", or "stdin"), skips the
    title/description heuristic entirely and uses that kind directly —
    for the cases where the caller already knows the answer for certain:
    - a problem whose LEGACY param_schema is already design-shaped
      (services/param_types.py's is_design_schema()) is unambiguously a
      design problem regardless of what its prose happens to say, so the
      admin bulk sweeps pass "design" explicitly for those rather than
      risking a heuristic miss regenerating the exact bug this schema kind
      exists to fix (a design problem silently getting a single-method
      function schema).
    - a problem whose Problem.execution_type is explicitly "stdin" (the
      student's whole program handles its own I/O — no function/class to
      infer, no LLM call needed at all: known_kind="stdin" short-circuits
      straight to {"kind": "stdin"} before ever touching providers, so
      this never fails even with zero LLM providers configured.
      execution_type is a staff decision, never something text-heuristics
      should guess — detect_schema_kind() only ever distinguishes
      function vs design, never stdin).

    `providers`, if given, overrides the normal rotation-order lookup —
    pass e.g. `providers=[some_provider]` to pin this call to one specific
    provider (no fallback), used by the bulk sweeps to run many of these
    concurrently, one per active provider, instead of funneling every
    problem through the rotation one at a time. Never consulted for
    known_kind="stdin", which makes no LLM call."""
    if known_kind == "stdin":
        return {"kind": "stdin"}

    if examples:
        blocks = [f"Example input:\n{ex.get('input', '')}\nExample output:\n{ex.get('output', '')}" for ex in examples]
        examples_block = "\nExamples:\n\n" + "\n\n".join(blocks)
    else:
        examples_block = ""

    providers = providers if providers is not None else _providers_in_rotation_order()
    kind = known_kind or detect_schema_kind(title=title, description=description, examples=examples)

    if kind == "design":
        prompt = DESIGN_SCHEMA_PROMPT_TEMPLATE.format(title=title or "", description=description or "", examples_block=examples_block)
        schema = _try_providers_in_order(
            providers, prompt, transform=_parse_and_normalize_design_schema, log_label=f"{title} (design schema)",
        )
        schema["kind"] = "design"
        return schema

    prompt = GENERIC_SCHEMA_PROMPT_TEMPLATE.format(title=title or "", description=description or "", examples_block=examples_block)
    schema = _try_providers_in_order(
        providers, prompt, transform=_parse_and_normalize_schema, log_label=f"{title} (generic schema)",
    )
    schema["kind"] = "function"
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


def _normalize_params_list(raw_params, *, context):
    """Shared by both schema kinds — [{"name","type"}] or [[name,type]] ->
    [[name,type],...], raising TestCaseGenServiceError on anything else."""
    if not isinstance(raw_params, list):
        return []
    normalized = []
    for item in raw_params:
        if isinstance(item, dict):
            normalized.append([str(item.get("name", "")).strip(), str(item.get("type", "")).strip()])
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            normalized.append([str(item[0]).strip(), str(item[1]).strip()])
        else:
            raise TestCaseGenServiceError(f"LLM produced a malformed param entry in {context}: {item!r}")
    return normalized


def _parse_and_normalize_design_schema(content):
    parsed = _extract_json(content)
    if not isinstance(parsed, dict):
        raise TestCaseGenServiceError(f"LLM did not return a JSON object: {content[:300]!r}")

    class_name = str(parsed.get("class_name", "")).strip()
    raw_methods = parsed.get("methods")
    if not isinstance(raw_methods, dict) or not raw_methods:
        raise TestCaseGenServiceError(f"LLM response has no usable 'methods' object: {content[:300]!r}")

    normalized_methods = {}
    for method_name, spec in raw_methods.items():
        if not isinstance(spec, dict):
            raise TestCaseGenServiceError(f"LLM produced a malformed method entry {method_name!r}: {spec!r}")
        normalized_methods[str(method_name).strip()] = {
            "params": _normalize_params_list(spec.get("params"), context=f"method {method_name!r}"),
            "return_type": str(spec.get("return_type", "void")).strip(),
        }

    return {
        "class_name": class_name,
        "methods": normalized_methods,
        "custom_structs": parsed.get("custom_structs") or {},
    }


def validate_generic_schema(schema):
    """Structural validation only — every declared type string must
    actually parse via type_system.parse_type. Does not (and cannot,
    without a reference solution) check that the schema is semantically
    the *right* one for the problem. Returns a list of error strings;
    empty means valid. Dispatches on schema.get("kind") — "design" schemas
    (class + multiple methods) go through _validate_design_schema, "stdin"
    schemas are trivially always valid (nothing to check — the student's
    program handles its own I/O, there's no function/class/type shape to
    get wrong), every other/missing kind through the original
    function-style check below (kept as _validate_function_schema)."""
    if not isinstance(schema, dict):
        return ["Schema is not a JSON object."]
    if schema.get("kind") == "design":
        return _validate_design_schema(schema)
    if schema.get("kind") == "stdin":
        return []
    return _validate_function_schema(schema)


def _validate_design_schema(schema):
    """Mirrors services/param_types.py's validate_design_schema() for the
    legacy design-schema shape, adapted to this package's richer type
    vocabulary (every param/return type parsed via type_system.parse_type
    instead of the legacy primitives-only checker)."""
    errors = []

    class_name = schema.get("class_name")
    if not class_name or not isinstance(class_name, str) or not _IDENTIFIER_RE.match(class_name):
        errors.append(f"class_name {class_name!r} is not a usable identifier.")

    custom_structs = schema.get("custom_structs") or {}
    if not isinstance(custom_structs, dict):
        errors.append("custom_structs must be an object.")
        custom_structs = {}

    methods = schema.get("methods")
    if not isinstance(methods, dict) or not methods:
        errors.append("methods must be a non-empty object.")
        return errors

    if class_name and class_name not in methods:
        errors.append(f"methods has no constructor entry keyed by class_name {class_name!r}.")

    non_constructor_count = 0
    for method_name, spec in methods.items():
        if not isinstance(method_name, str) or not _IDENTIFIER_RE.match(method_name):
            errors.append(f"Method name {method_name!r} is not a usable identifier.")
        if not isinstance(spec, dict):
            errors.append(f"methods[{method_name!r}] must be an object.")
            continue
        if method_name != class_name:
            non_constructor_count += 1

        params = spec.get("params")
        if not isinstance(params, list):
            errors.append(f"methods[{method_name!r}].params must be a list.")
            params = []
        for entry in params:
            if not (isinstance(entry, (list, tuple)) and len(entry) == 2):
                errors.append(f"methods[{method_name!r}]: malformed param entry {entry!r}.")
                continue
            pname, ptype = entry
            if not isinstance(pname, str) or not _IDENTIFIER_RE.match(pname):
                errors.append(f"methods[{method_name!r}]: param name {pname!r} is not a usable identifier.")
            try:
                parse_type(ptype, custom_structs)
            except TypeError_ as exc:
                errors.append(f"methods[{method_name!r}].{pname}: {exc}")

        return_type = spec.get("return_type")
        is_void_return = isinstance(return_type, str) and return_type.strip().lower() in ("void", "none", "")
        if not is_void_return:
            try:
                parse_type(return_type, custom_structs)
            except TypeError_ as exc:
                errors.append(f"methods[{method_name!r}].return_type {return_type!r}: {exc}")

    if non_constructor_count == 0:
        errors.append("A design schema needs at least one method besides the constructor — otherwise it's just a function.")

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

    return errors


def _validate_function_schema(schema):
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

    # "void"/"none"/"" is wrapper_generator.py's own convention for a
    # mutated-input problem (see its _VOID_RETURN_TYPES) — never a real
    # type to parse, so it's exempt from the parse_type check below.
    return_type = schema.get("return_type")
    is_void_return = isinstance(return_type, str) and return_type.strip().lower() in ("void", "none", "")
    if not is_void_return:
        if not return_type or not isinstance(return_type, str):
            errors.append("return_type is missing.")
        else:
            try:
                parse_type(return_type, custom_structs)
            except TypeError_ as exc:
                errors.append(f"return_type {return_type!r}: {exc}")

    comparison = schema.get("comparison")
    if comparison is not None:
        if not isinstance(comparison, dict) or "type" not in comparison:
            errors.append("comparison, if present, must be an object with at least a 'type' key.")
        else:
            mutated_param = comparison.get("mutated_param")
            if mutated_param is not None:
                param_names = {entry[0] for entry in params if isinstance(entry, (list, tuple)) and len(entry) == 2}
                if mutated_param not in param_names:
                    errors.append(f"comparison.mutated_param {mutated_param!r} does not match any declared param name.")
            elif comparison.get("type") == "mutated_input" and not params:
                errors.append("comparison.type is 'mutated_input' but there are no params to default the mutated one to.")

    return errors


__all__ = ["generate_generic_schema", "validate_generic_schema", "detect_schema_kind", "TestCaseGenError"]
