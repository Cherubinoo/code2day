"""LLM-based test case generation for problems already on the generic
judging framework — a different job from services/judging/schema_generator.py
(which infers the *schema*) and from apps.learning.services.testcase_generator
(which generates legacy-format stdin/expected_output text for the untyped
execution path). This module asks the LLM for **plain structured values**
per the problem's already-known `generic_schema` types (a JSON object per
test case, e.g. `{"nums": [2,7,11,15], "target": 9}` plus an expected
value) — never wire-format text — and then this module, not the LLM,
deterministically turns those into the actual wire-format `stdin` /
JSON-encoded `expected_output` via `serializer.py`. The LLM only has to
get the *values* right; getting the wire format right is not something
we're trusting it with.

Every generated case is structurally validated before being kept: each
param's value must actually serialize under its declared type (catches
the LLM inventing a shape that doesn't match, e.g. a bare int where the
schema says `vector<int>`), and likewise for the expected value. A case
that fails validation is dropped, not silently corrupted into the DB.

Same caveat as every other LLM-authored test data on this platform: the
LLM "solves" the problem itself to produce `expected_output`, so
correctness isn't guaranteed — treat this as a fast-start draft a human
should spot-check, not ground truth.
"""

import json
import logging

from ..testcase_generator import (
    TestCaseGenError,
    TestCaseGenServiceError,
    _extract_json_array,
    _providers_in_rotation_order,
    _try_providers_in_order,
)
from .type_system import parse_type
from .serializer import serialize_value, SerializationError

logger = logging.getLogger(__name__)

_TYPE_VOCAB_BLOCK = """Type vocabulary you may use for any value below (nest freely):
- Primitives: int, long, float, double, bool, char, string — plain JSON number/bool/string.
- Sequences (vector/array/list/matrix/stack/queue/deque, all share one shape): a plain JSON array, nested as needed for matrix/vector<vector<T>>.
- linked_list<T>: a plain JSON array of T, in list order (e.g. [1,2,3,4,5]).
- binary_tree<T> / bst<T>: a plain JSON array, LeetCode's own level-order-with-null convention (e.g. [1,2,3,null,4]).
- graph: a JSON object {"n": <node count>, "edges": [[u,v], ...]} (0-indexed nodes, undirected).
- pair<A,B> / tuple<T1,...,TN>: a JSON array of exactly that many elements, e.g. [1,"x"].
- map<K,V>: a JSON array of [key, value] pairs (not a JSON object — keys aren't limited to strings).
- set<T>: a plain JSON array (order doesn't matter).
- optional<T> / nullable<T>: T's own value, or JSON null.
- random_list_node<T>: a JSON array of [val, random_index_or_null] pairs, e.g. [[7,null],[13,0]].
- doubly_linked_list_node<T>: same as linked_list<T> — a plain JSON array of T.
- a name declared in the problem's custom_structs: a JSON object of {"field": value, ...}.
"""

GENERIC_TESTCASE_PROMPT_TEMPLATE = """You are writing test cases for an online judge, given a problem statement and its already-finalized parameter/return schema. Produce REALISTIC, CORRECT test data — solve the problem yourself to compute each expected value.

Title: {title}

Description:
{description}

Schema:
- function_name: {function_name}
- params (in order): {params_desc}
- return_type: {return_type}
{mutated_note}

{type_vocab}

Respond with ONLY a JSON array of {num_cases} test cases, each of this exact shape:
{{"params": {{"<param_name>": <value>, ...}}, "expected_output": <value>}}

- "params" must have exactly one key per declared param, using its exact name, with a value in the shape described above for that param's type.
- "expected_output" must be in the shape described above for {output_type_desc}.
- Include a mix: at least one small/simple case, one edge case (empty/single-element/boundary value) relevant to this problem's types, and the rest realistic mid-size cases.
- Respond with ONLY the JSON array, no markdown fences, no commentary.
"""


def generate_generic_test_cases(*, title, description, schema, num_cases=4):
    """Returns a list of {"stdin": str, "expected_output": str} dicts ready
    to save as TestCase rows — already converted to this framework's wire
    format, already structurally validated. Raises a TestCaseGenError
    subclass if every provider fails; returns however many of the LLM's
    proposed cases actually pass structural validation (possibly fewer
    than num_cases, possibly zero if every one was malformed)."""
    custom_structs = schema.get("custom_structs")
    param_specs = schema["params"]  # [[name, type_str], ...]
    param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in param_specs]

    comparison = schema.get("comparison") or {}
    return_type_str = schema.get("return_type")
    is_void = (not return_type_str) or str(return_type_str).strip().lower() in ("void", "none")
    wants_mutated = is_void or comparison.get("type") == "mutated_input"

    mutated_index = None
    output_node = None
    if wants_mutated:
        mutated_name = comparison.get("mutated_param")
        if mutated_name:
            mutated_index = next(i for i, (pname, _) in enumerate(param_nodes) if pname == mutated_name)
        else:
            mutated_index = 0
        output_node = param_nodes[mutated_index][1]
        output_type_desc = f'the MUTATED parameter "{param_nodes[mutated_index][0]}" after the function runs (this function returns nothing — grade its side effect)'
        mutated_note = f'- This is a MUTATED-INPUT problem: the function returns nothing. "expected_output" must be the value of parameter "{param_nodes[mutated_index][0]}" AFTER the function has mutated it, not a return value.'
    else:
        output_node = parse_type(return_type_str, custom_structs)
        output_type_desc = f'the return type ({return_type_str})'
        mutated_note = ""

    params_desc = ", ".join(f"{pname}: {ptype}" for pname, ptype in param_specs)
    prompt = GENERIC_TESTCASE_PROMPT_TEMPLATE.format(
        title=title or "", description=description or "",
        function_name=schema.get("function_name", ""),
        params_desc=params_desc, return_type=return_type_str,
        mutated_note=mutated_note, type_vocab=_TYPE_VOCAB_BLOCK,
        num_cases=num_cases, output_type_desc=output_type_desc,
    )

    providers = _providers_in_rotation_order()
    raw_cases = _try_providers_in_order(
        providers, prompt,
        transform=lambda content: _parse_raw_cases(content, param_nodes),
        log_label=f"{title} (generic test cases)",
    )

    return _validate_and_convert(raw_cases, param_nodes, output_node)


def _parse_raw_cases(content, param_nodes):
    parsed = _extract_json_array(content)
    if not isinstance(parsed, list) or not parsed:
        raise TestCaseGenServiceError(f"LLM did not return a non-empty JSON array: {content[:300]!r}")

    param_names = {pname for pname, _ in param_nodes}
    cases = []
    for item in parsed:
        if not isinstance(item, dict) or "params" not in item or "expected_output" not in item:
            continue
        if not isinstance(item["params"], dict) or set(item["params"]) != param_names:
            continue
        cases.append(item)

    if not cases:
        raise TestCaseGenServiceError(f"LLM response had no usable test cases matching the schema's params: {content[:300]!r}")
    return cases


def _validate_and_convert(raw_cases, param_nodes, output_node):
    results = []
    for case in raw_cases:
        try:
            for pname, pnode in param_nodes:
                _check_shape(pnode, case["params"][pname])
            _check_shape(output_node, case["expected_output"])
            stdin_parts = [serialize_value(pnode, case["params"][pname]) for pname, pnode in param_nodes]
        except (SerializationError, KeyError, TypeError, ValueError) as exc:
            logger.warning("Dropping a generated test case that failed structural validation: %s", exc)
            continue

        results.append({
            "stdin": "".join(stdin_parts),
            "expected_output": json.dumps(case["expected_output"]),
        })

    return results


def _check_shape(node, value):
    """A real firewall against the LLM inventing a shape that doesn't
    match the declared type — deliberately stricter than
    serializer._write's own duck-typing, which tolerates e.g.
    `list(some_dict)` silently coercing into a list of that dict's keys
    instead of rejecting it (fine for serializer.py's normal trusted-input
    callers, not safe as the boundary against untrusted LLM output).
    Raises SerializationError on the first mismatch found; returns None
    (structurally OK) otherwise."""
    kind = node.kind

    if kind == "optional":
        if value is None:
            return
        _check_shape(node.element, value)
        return

    if kind == "primitive":
        name = node.name
        if name in ("int", "long"):
            if not isinstance(value, int) or isinstance(value, bool):
                raise SerializationError(f"expected an integer, got {value!r}")
        elif name in ("float", "double"):
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise SerializationError(f"expected a number, got {value!r}")
        elif name == "bool":
            if not isinstance(value, bool):
                raise SerializationError(f"expected a boolean, got {value!r}")
        elif name in ("char", "string"):
            if not isinstance(value, str):
                raise SerializationError(f"expected a string, got {value!r}")
        return

    if kind in ("sequence", "set", "linked_list", "doubly_linked_list_node"):
        if not isinstance(value, list):
            raise SerializationError(f"expected a list, got {value!r}")
        for item in value:
            _check_shape(node.element, item)
        return

    if kind in ("binary_tree", "bst"):
        if not isinstance(value, list):
            raise SerializationError(f"expected a list, got {value!r}")
        for item in value:
            if item is not None:
                _check_shape(node.element, item)
        return

    if kind == "random_list_node":
        if not isinstance(value, list):
            raise SerializationError(f"expected a list, got {value!r}")
        for item in value:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                raise SerializationError(f"expected [val, random_index] pairs, got {item!r}")
            v, r = item
            _check_shape(node.element, v)
            if r is not None and (not isinstance(r, int) or isinstance(r, bool)):
                raise SerializationError(f"random index must be an int or null, got {r!r}")
        return

    if kind == "graph":
        if not isinstance(value, dict) or "n" not in value or "edges" not in value:
            raise SerializationError(f"expected a graph object with n/edges, got {value!r}")
        if not isinstance(value["n"], int) or not isinstance(value["edges"], list):
            raise SerializationError(f"malformed graph object: {value!r}")
        for e in value["edges"]:
            if not (isinstance(e, (list, tuple)) and len(e) == 2):
                raise SerializationError(f"malformed graph edge: {e!r}")
        return

    if kind == "pair":
        if not (isinstance(value, (list, tuple)) and len(value) == len(node.elements)):
            raise SerializationError(f"expected a {len(node.elements)}-element array, got {value!r}")
        for elem_node, elem_value in zip(node.elements, value):
            _check_shape(elem_node, elem_value)
        return

    if kind == "map":
        if not isinstance(value, list):
            raise SerializationError(f"expected a list of [key,value] pairs, got {value!r}")
        for item in value:
            if not (isinstance(item, (list, tuple)) and len(item) == 2):
                raise SerializationError(f"malformed map entry: {item!r}")
            k, v = item
            _check_shape(node.key, k)
            _check_shape(node.value, v)
        return

    if kind == "custom_struct":
        if not isinstance(value, dict):
            raise SerializationError(f"expected an object with fields {list(node.fields)}, got {value!r}")
        for fname, ftype in node.fields.items():
            if fname not in value:
                raise SerializationError(f"missing field {fname!r} in {value!r}")
            _check_shape(ftype, value[fname])
        return

    raise SerializationError(f"No shape check for type kind {kind!r} ({node.raw!r})")


__all__ = ["generate_generic_test_cases", "TestCaseGenError"]
