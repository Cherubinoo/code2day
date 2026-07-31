"""
Canonical parameter/return-type vocabulary for Problem.param_schema.

This module is the single source of truth for what a "type" string is
allowed to be in a problem's structured schema, e.g.:

    {
        "params": [
            {"name": "nums", "type": "int[]", "order": 0},
            {"name": "target", "type": "int", "order": 1},
        ],
        "return_type": "int[]",
    }

It has zero Django/DB dependencies so it can be imported from both
views.py (schema-save validation) and execution_adapter.py (typed
marshalling) without any circular-import risk.

Scope (deliberate, per product decision): primitives + 1D/2D arrays only.
No linked-list/tree/custom-struct types in this phase.
"""

from __future__ import annotations

import re

SCALAR_TYPES = ("int", "float", "double", "string", "boolean")
ARRAY_SUFFIXES = ("", "[]", "[][]")  # scalar, 1D, 2D

VALID_TYPES = [s + suf for s in SCALAR_TYPES for suf in ARRAY_SUFFIXES]

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def is_valid_param_type(t: str) -> bool:
    return isinstance(t, str) and t in VALID_TYPES


def array_dimensions(t: str) -> int:
    """0 for a scalar type, 1 for `x[]`, 2 for `x[][]`."""
    if not isinstance(t, str):
        return 0
    if t.endswith("[][]"):
        return 2
    if t.endswith("[]"):
        return 1
    return 0


def base_scalar_type(t: str) -> str:
    """Strip any `[]`/`[][]` suffix, returning the underlying scalar type."""
    if not isinstance(t, str):
        return t
    return t[: -4] if t.endswith("[][]") else (t[:-2] if t.endswith("[]") else t)


def validate_param_schema(schema: dict) -> list[str]:
    """Validate a param_schema dict. Returns a list of human-readable error
    strings; an empty list means the schema is valid."""
    errors: list[str] = []

    if not isinstance(schema, dict):
        return ["Schema must be a JSON object."]

    params = schema.get("params")
    if not isinstance(params, list) or not params:
        errors.append("`params` must be a non-empty list.")
        params = []

    seen_names = set()
    seen_orders = set()
    for i, p in enumerate(params):
        if not isinstance(p, dict):
            errors.append(f"params[{i}] must be an object.")
            continue

        name = p.get("name")
        ptype = p.get("type")
        order = p.get("order")

        if not isinstance(name, str) or not _IDENTIFIER_RE.match(name):
            errors.append(f"params[{i}].name must be a valid identifier (got {name!r}).")
        elif name in seen_names:
            errors.append(f"params[{i}].name {name!r} is duplicated.")
        else:
            seen_names.add(name)

        if not is_valid_param_type(ptype):
            errors.append(f"params[{i}].type {ptype!r} is not one of the supported types: {VALID_TYPES}.")

        if not isinstance(order, int) or isinstance(order, bool):
            errors.append(f"params[{i}].order must be an integer (got {order!r}).")
        elif order in seen_orders:
            errors.append(f"params[{i}].order {order} is duplicated.")
        else:
            seen_orders.add(order)

    if params and seen_orders != set(range(len(params))):
        errors.append(f"`order` values must be exactly 0..{len(params) - 1} with no gaps/duplicates.")

    return_type = schema.get("return_type")
    if not is_valid_param_type(return_type):
        errors.append(f"return_type {return_type!r} is not one of the supported types: {VALID_TYPES}.")

    return errors


def ordered_params(schema: dict) -> list[dict]:
    """Return schema['params'] sorted by declared order."""
    return sorted(schema.get("params", []), key=lambda p: p.get("order", 0))


def ordered_param_names(schema: dict) -> list[str]:
    """Return param names sorted by declared order — used to turn a
    TestCase.input_data dict into the positional arg list the existing
    JSON-array wire format expects."""
    return [p["name"] for p in ordered_params(schema)]


# ── Student-facing starter code ───────────────────────────────────────────────
# Right now nothing pre-populates the editor with a problem-specific signature
# — students hand-write it from the description, which is exactly the kind of
# mismatch a typed schema is meant to remove. generate_starter_code() emits an
# idiomatic empty stub per language from the same vocabulary the execution
# pipeline uses, so what a student sees matches what the backend can actually
# execute.

_JAVA_TYPE_MAP = {
    "int": "int", "float": "float", "double": "double", "string": "String", "boolean": "boolean",
}
_CPP_TYPE_MAP = {
    "int": "int", "float": "float", "double": "double", "string": "string", "boolean": "bool",
}
_C_TYPE_MAP = {
    "int": "int", "float": "float", "double": "double", "string": "char*", "boolean": "int",
}
_PY_TYPE_HINT = {
    "int": "int", "float": "float", "double": "float", "string": "str", "boolean": "bool",
}


def _mapped_type(type_map: dict, t: str, array_ctor) -> str:
    dims = array_dimensions(t)
    base = type_map.get(base_scalar_type(t), base_scalar_type(t))
    for _ in range(dims):
        base = array_ctor(base)
    return base


def _java_type(t: str) -> str:
    dims = array_dimensions(t)
    return _JAVA_TYPE_MAP.get(base_scalar_type(t), base_scalar_type(t)) + ("[]" * dims)


def _cpp_type(t: str) -> str:
    return _mapped_type(_CPP_TYPE_MAP, t, lambda inner: f"vector<{inner}>")


def _py_type_hint(t: str) -> str:
    return _mapped_type(_PY_TYPE_HINT, t, lambda inner: f"List[{inner}]")


def generate_starter_code(problem, language: str) -> str | None:
    """Return an idiomatic empty stub for `language` derived from
    problem.param_schema, or None when there's no schema/function_name to
    derive one from (or, for C, when the schema uses a 2D array — the C
    execution path only supports scalars + 1D arrays, see
    _build_c_wrapper_typed in execution_adapter.py, so a starter stub the
    platform can't actually run would be misleading)."""
    schema = getattr(problem, "param_schema", None)
    fn = getattr(problem, "function_name", "") or ""
    if not schema or not fn:
        return None

    errors = validate_param_schema(schema)
    if errors:
        return None

    params = ordered_params(schema)
    return_type = schema.get("return_type", "")

    if language == "Python":
        needs_list = any(array_dimensions(p["type"]) > 0 for p in params) or array_dimensions(return_type) > 0
        args = ", ".join(f"{p['name']}: {_py_type_hint(p['type'])}" for p in params)
        header = "from typing import List\n\n\n" if needs_list else ""
        return f"{header}class Solution:\n    def {fn}(self, {args}) -> {_py_type_hint(return_type)}:\n        pass\n"

    if language == "Java":
        args = ", ".join(f"{_java_type(p['type'])} {p['name']}" for p in params)
        return f"class Solution {{\n    public {_java_type(return_type)} {fn}({args}) {{\n        \n    }}\n}}\n"

    if language in ("C++", "CPP"):
        args = ", ".join(f"{_cpp_type(p['type'])} {p['name']}" for p in params)
        needs_vector = any(array_dimensions(p["type"]) > 0 for p in params) or array_dimensions(return_type) > 0
        needs_string = any(base_scalar_type(p["type"]) == "string" for p in params) or base_scalar_type(return_type) == "string"
        headers = "#include <string>\n" if needs_string else ""
        headers += "#include <vector>\nusing namespace std;\n\n" if needs_vector else "\n"
        return f"{headers}class Solution {{\npublic:\n    {_cpp_type(return_type)} {fn}({args}) {{\n        \n    }}\n}};\n"

    if language == "C":
        if any(array_dimensions(p["type"]) > 1 for p in params) or array_dimensions(return_type) > 1:
            return None  # 2D arrays aren't supported by the C execution path yet
        c_args = []
        for p in params:
            base = _C_TYPE_MAP[base_scalar_type(p["type"])]
            if array_dimensions(p["type"]) == 1:
                c_args.append(f"{base}* {p['name']}, int {p['name']}Size")
            else:
                c_args.append(f"{base} {p['name']}")
        if array_dimensions(return_type) == 1:
            c_args.append(f"int* returnSize")
            ret = f"{_C_TYPE_MAP[base_scalar_type(return_type)]}*"
        else:
            ret = _C_TYPE_MAP[base_scalar_type(return_type)]
        return f"{ret} {fn}({', '.join(c_args)}) {{\n    \n}}\n"

    if language in ("JavaScript", "JS"):
        args = ", ".join(p["name"] for p in params)
        return f"function {fn}({args}) {{\n    \n}}\n"

    return None
