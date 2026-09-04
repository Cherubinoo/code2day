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

Scope: primitives + 1D/2D arrays, plus a small set of named structural
types (currently just GraphNode) added on demand as real problems need
them — not the full LeetCode structural type catalog (TreeNode/ListNode
already work today via the older name/annotation-based heuristics in
execution_adapter.py; only GraphNode needed a real fix, since no existing
heuristic builds a proper cyclic graph).
"""

from __future__ import annotations

import re

SCALAR_TYPES = ("int", "float", "double", "string", "boolean")
ARRAY_SUFFIXES = ("", "[]", "[][]")  # scalar, 1D, 2D

# Structural types: not primitives, not arrays of primitives — each one names
# a real object shape the execution pipeline knows how to build/serialize.
# GraphNode: val + neighbors (List[GraphNode]), possibly cyclic — the shape
# LeetCode-style "Clone Graph"-family problems use, represented on the wire
# as an adjacency list keyed by 1-indexed node value (see
# execution_adapter.py's __c2d_to_graph/__c2d_from_graph).
STRUCTURAL_TYPES = ("GraphNode",)

VALID_TYPES = [s + suf for s in SCALAR_TYPES for suf in ARRAY_SUFFIXES] + list(STRUCTURAL_TYPES)

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


# ── Design/OOP problems (LRU Cache, Trie, ZigzagIterator, ...) ───────────────
# A completely different shape from a function schema: instead of one call in
# / one value out, the wire format is a *sequence* of operations replayed
# against one constructed instance, e.g.:
#
#   {"kind": "design", "class_name": "LRUCache",
#    "methods": {
#        "LRUCache": {"params": ["int"], "return_type": "void"},
#        "put":      {"params": ["int", "int"], "return_type": "void"},
#        "get":      {"params": ["int"], "return_type": "int"},
#    }}
#
# TestCase.input_data for a design schema is {"operations": [...], "arguments": [[...], ...]}
# (the operations list's first entry is always the constructor, matching
# class_name) and expected_output is a JSON array, one entry per operation
# (null for void-returning ones) — exactly LeetCode's own convention.
# A schema with no "kind" (every existing function schema) is implicitly
# "function" — this is purely additive, existing schemas are untouched.

def is_design_schema(schema: dict) -> bool:
    return isinstance(schema, dict) and schema.get("kind") == "design"


def validate_design_schema(schema: dict) -> list[str]:
    """Validate a design-kind schema. Returns a list of human-readable error
    strings; an empty list means the schema is valid."""
    errors: list[str] = []
    if not isinstance(schema, dict):
        return ["Schema must be a JSON object."]

    class_name = schema.get("class_name")
    if not isinstance(class_name, str) or not _IDENTIFIER_RE.match(class_name):
        errors.append(f"class_name must be a valid identifier (got {class_name!r}).")

    methods = schema.get("methods")
    if not isinstance(methods, dict) or not methods:
        errors.append("`methods` must be a non-empty object mapping method name -> {params, return_type}.")
        methods = {}

    if isinstance(class_name, str) and class_name not in methods:
        errors.append(f"`methods` must include a constructor entry named {class_name!r}.")

    for name, spec in methods.items():
        if not isinstance(spec, dict):
            errors.append(f"methods[{name!r}] must be an object.")
            continue
        params = spec.get("params")
        if not isinstance(params, list) or not all(is_valid_param_type(t) for t in params):
            errors.append(f"methods[{name!r}].params must be a list of types from {VALID_TYPES}.")
        return_type = spec.get("return_type")
        if return_type != "void" and not is_valid_param_type(return_type):
            errors.append(f"methods[{name!r}].return_type {return_type!r} is not 'void' or one of {VALID_TYPES}.")

    return errors


def validate_schema(schema: dict) -> list[str]:
    """Dispatches to validate_design_schema or validate_param_schema based on
    schema['kind'] — the single entry point new callers (admin schema-save
    endpoint) should use instead of calling either validator directly."""
    if is_design_schema(schema):
        return validate_design_schema(schema)
    return validate_param_schema(schema)


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


def _slug_function_name(slug: str) -> str:
    """camelCase name derived from a problem's slug, e.g. "two-sum" ->
    "twoSum" — the same convention execution_adapter.build_function_name_
    candidates() tries first. Almost every problem leaves function_name
    blank and relies on this slug-based detection (see Problem.function_
    name's help_text), so the starter stub must derive the same name the
    execution engine will look for, or the two would silently disagree."""
    parts = [p for p in (slug or "").split("-") if p]
    if not parts:
        return ""
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _design_prefix(class_name: str) -> str:
    """Same lowerCamelCase convention as execution_adapter._c_design_prefix
    (duplicated, not imported, to keep this module's zero execution_adapter
    dependency — see the module docstring)."""
    if not class_name:
        return "obj"
    return class_name[0].lower() + class_name[1:]


def _design_method_fn(prefix: str, method_name: str) -> str:
    if not method_name:
        return prefix
    return prefix + method_name[0].upper() + method_name[1:]


def _generate_design_starter_code(schema: dict, language: str) -> str | None:
    """Design/class-kind counterpart to generate_starter_code() below —
    schema['methods'] params are unnamed (just a type list, see the design
    schema shape), so stub params are synthesized as arg1, arg2, ... which
    is fine: the injected driver calls methods positionally, never by
    keyword, so the student's own parameter names are never consulted."""
    class_name = schema["class_name"]
    methods = schema["methods"]
    ctor = methods.get(class_name) or {"params": [], "return_type": "void"}
    other_methods = [(name, spec) for name, spec in methods.items() if name != class_name]

    def names(params):
        return [f"arg{i + 1}" for i in range(len(params))]

    if language == "Python":
        needs_list = any(array_dimensions(t) > 0 for spec in methods.values() for t in spec.get("params", []))
        header = "from typing import List\n\n\n" if needs_list else ""
        ctor_args = ", ".join(f"{n}: {_py_type_hint(t)}" for n, t in zip(names(ctor["params"]), ctor["params"]))
        lines = [f"{header}class {class_name}:", "", f"    def __init__(self, {ctor_args}):", "        pass", ""]
        for name, spec in other_methods:
            args = ", ".join(f"{n}: {_py_type_hint(t)}" for n, t in zip(names(spec.get("params", [])), spec.get("params", [])))
            ret = "None" if spec.get("return_type") == "void" else _py_type_hint(spec["return_type"])
            lines += [f"    def {name}(self, {args}) -> {ret}:", "        pass", ""]
        return "\n".join(lines).rstrip("\n") + "\n"

    if language == "Java":
        ctor_args = ", ".join(f"{_java_type(t)} {n}" for n, t in zip(names(ctor["params"]), ctor["params"]))
        lines = [f"class {class_name} {{", f"    public {class_name}({ctor_args}) {{", "        ", "    }", ""]
        for name, spec in other_methods:
            args = ", ".join(f"{_java_type(t)} {n}" for n, t in zip(names(spec.get("params", [])), spec.get("params", [])))
            ret = "void" if spec.get("return_type") == "void" else _java_type(spec["return_type"])
            lines += [f"    public {ret} {name}({args}) {{", "        ", "    }", ""]
        lines.append("}")
        return "\n".join(lines) + "\n"

    if language in ("C++", "CPP"):
        all_types = [t for spec in methods.values() for t in spec.get("params", [])]
        needs_vector = any(array_dimensions(t) > 0 for t in all_types)
        needs_string = any(base_scalar_type(t) == "string" for t in all_types)
        headers = ("#include <string>\n" if needs_string else "") + ("#include <vector>\nusing namespace std;\n\n" if needs_vector else "\n")
        ctor_args = ", ".join(f"{_cpp_type(t)} {n}" for n, t in zip(names(ctor["params"]), ctor["params"]))
        lines = [f"{headers}class {class_name} {{", "public:", f"    {class_name}({ctor_args}) {{", "        ", "    }", ""]
        for name, spec in other_methods:
            args = ", ".join(f"{_cpp_type(t)} {n}" for n, t in zip(names(spec.get("params", [])), spec.get("params", [])))
            ret = "void" if spec.get("return_type") == "void" else _cpp_type(spec["return_type"])
            lines += [f"    {ret} {name}({args}) {{", "        ", "    }", ""]
        lines.append("};")
        return "\n".join(lines) + "\n"

    if language == "C":
        # Mirrors execution_adapter._build_c_design_wrapper's own limits:
        # only scalar + 1D-array types (no 2D arrays) are supported.
        all_types = [t for spec in methods.values() for t in spec.get("params", [])]
        all_types += [spec["return_type"] for spec in methods.values() if spec.get("return_type") != "void"]
        if any(array_dimensions(t) > 1 for t in all_types):
            return None

        prefix = _design_prefix(class_name)

        def c_params(params):
            parts = []
            for i, t in enumerate(params):
                base = _C_TYPE_MAP[base_scalar_type(t)]
                if array_dimensions(t) == 1:
                    parts.append(f"{base}* arg{i + 1}, int arg{i + 1}Size")
                else:
                    parts.append(f"{base} arg{i + 1}")
            return ", ".join(parts)

        lines = [
            f"typedef struct {{",
            f"    ",
            f"}} {class_name};",
            "",
            f"{class_name}* {prefix}Create({c_params(ctor['params'])}) {{",
            "    ",
            "}",
            "",
        ]
        for name, spec in other_methods:
            return_type = spec.get("return_type", "void")
            if return_type == "void":
                ret = "void"
            elif array_dimensions(return_type) == 1:
                ret = f"{_C_TYPE_MAP[base_scalar_type(return_type)]}*"
            else:
                ret = _C_TYPE_MAP[base_scalar_type(return_type)]
            params_str = c_params(spec.get("params", []))
            full_params = f"{class_name}* obj" + (", " + params_str if params_str else "")
            if array_dimensions(return_type) == 1:
                full_params += ", int* returnSize"
            fn = _design_method_fn(prefix, name)
            lines += [f"{ret} {fn}({full_params}) {{", "    ", "}", ""]
        return "\n".join(lines).rstrip("\n") + "\n"

    return None


def generate_starter_code(problem, language: str) -> str | None:
    """Return an idiomatic empty stub for `language` derived from
    problem.param_schema, or None when there's no schema to derive one
    from (or, for C, when the schema uses a 2D array — the C execution
    path only supports scalars + 1D arrays, see _build_c_wrapper_typed in
    execution_adapter.py, so a starter stub the platform can't actually
    run would be misleading)."""
    schema = getattr(problem, "param_schema", None)
    if not schema:
        return None

    if is_design_schema(schema):
        if validate_design_schema(schema):
            return None
        return _generate_design_starter_code(schema, language)

    fn = getattr(problem, "function_name", "") or _slug_function_name(getattr(problem, "slug", ""))
    if not fn:
        return None

    errors = validate_param_schema(schema)
    if errors:
        return None

    params = ordered_params(schema)
    return_type = schema.get("return_type", "")
    uses_graph_node = any(p["type"] == "GraphNode" for p in params) or return_type == "GraphNode"

    if language == "Python":
        if uses_graph_node:
            args = ", ".join(f"{p['name']}: 'Node'" if p["type"] == "GraphNode" else p["name"] for p in params)
            ret = "'Node'" if return_type == "GraphNode" else _py_type_hint(return_type)
            return (
                '"""\n# Definition for a Node.\nclass Node:\n'
                '    def __init__(self, val = 0, neighbors = None):\n'
                '        self.val = val\n'
                '        self.neighbors = neighbors if neighbors is not None else []\n"""\n\n'
                f"class Solution:\n    def {fn}(self, {args}) -> {ret}:\n        pass\n"
            )
        needs_list = any(array_dimensions(p["type"]) > 0 for p in params) or array_dimensions(return_type) > 0
        args = ", ".join(f"{p['name']}: {_py_type_hint(p['type'])}" for p in params)
        header = "from typing import List\n\n\n" if needs_list else ""
        return f"{header}class Solution:\n    def {fn}(self, {args}) -> {_py_type_hint(return_type)}:\n        pass\n"

    if language == "Java":
        if uses_graph_node:
            args = ", ".join(f"Node {p['name']}" if p["type"] == "GraphNode" else f"{_java_type(p['type'])} {p['name']}" for p in params)
            ret = "Node" if return_type == "GraphNode" else _java_type(return_type)
            return (
                "/*\n// Definition for a Node.\nclass Node {\n    public int val;\n    public List<Node> neighbors;\n"
                "    public Node() { val = 0; neighbors = new ArrayList<Node>(); }\n"
                "    public Node(int _val) { val = _val; neighbors = new ArrayList<Node>(); }\n}\n*/\n\n"
                f"class Solution {{\n    public {ret} {fn}({args}) {{\n        \n    }}\n}}\n"
            )
        args = ", ".join(f"{_java_type(p['type'])} {p['name']}" for p in params)
        return f"class Solution {{\n    public {_java_type(return_type)} {fn}({args}) {{\n        \n    }}\n}}\n"

    # GraphNode execution is Python/Java only for now (see
    # _build_python_wrapper_typed / _build_java_wrapper_typed in
    # execution_adapter.py) — no starter stub for other languages, since one
    # would imply the platform can actually run it there, which it can't yet.
    if uses_graph_node:
        return None

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
