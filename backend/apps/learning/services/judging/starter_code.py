"""Student-facing starter code (the `class Solution: ...` skeleton shown in
the code editor) for a generic-judge problem.

Matches EXACTLY what wrapper_generator.py requires: the strict "class
Solution" convention for function-kind schemas, the exact schema-declared
`class_name` for design-kind ones (see that module's own docstring for why
there's no name detection either place). A student shown the wrong
signature here would have no way to know what's actually expected, so this
must never drift out of sync with the real driver — the C branch below
reuses wrapper_generator._c_kind (the exact same classification the real
C driver uses) rather than re-deriving the array-as-pointer+size
convention by hand, and every other language reuses the same per-type
adapters (adapters.registry.get_adapter) the real driver's codegen uses.

Mirrors services/param_types.py's generate_starter_code() in spirit — same
per-language branches, same "return None and let the frontend fall back to
its generic template" convention whenever a shape isn't supported yet —
but reads Problem.generic_schema's richer type vocabulary. The legacy
generator's scope never went past scalars/1D-2D arrays/GraphNode, so a
tree/linked-list-typed generic-judge problem got no real starter code at
all before this existed — plain silence, not even a wrong signature.

C has no classes at all — its starter stub is a bare free function.
Design-kind schemas have no C stub at all — see generate_design_source's
own explicit rejection of C for why. "stdin"-kind schemas have no stub
either: the student's whole program handles its own I/O, there's no
function/class signature to show.
"""

from .type_system import parse_type, TypeError_
from .adapters.registry import get_adapter
from .languages.registry import get_language

_VOID_RETURN_TYPES = ("void", "none", "", None)


def _is_void_return(return_type_str):
    return not return_type_str or (
        isinstance(return_type_str, str) and return_type_str.strip().lower() in _VOID_RETURN_TYPES
    )


def generate_generic_starter_code(problem, language):
    """Returns a starter-code string for `language` derived from
    Problem.generic_schema, or None when there's nothing to show (no
    schema yet, a "stdin"-kind schema, a malformed type string, or a shape
    this module doesn't cover) — callers fall back to their own generic
    per-language template in that case, same convention as
    param_types.generate_starter_code()."""
    schema = getattr(problem, "generic_schema", None)
    if not schema:
        return None

    kind = schema.get("kind", "function")
    if kind == "stdin":
        return None
    if kind == "design":
        return _design_starter_code(schema, language)
    return _function_starter_code(schema, language)


# ── Python type hints — adapters never provide these (python_lang has no
# static types to declare), so this is this module's own small mapper,
# recursive over the same TypeNode tree every adapter already works
# against. Falls back to "Any" for shapes with no crisp Python analogue
# (graph/custom_struct/random_list_node/doubly_linked_list_node) rather
# than blocking generation — an imprecise-but-present hint is still more
# useful than no starter code at all, unlike the statically-typed
# languages below where a wrong type would actually fail to compile.
def _py_type_hint(node):
    if node.kind == "primitive":
        return {
            "int": "int", "long": "int", "float": "float", "double": "float",
            "bool": "bool", "char": "str", "string": "str",
        }[node.name]
    if node.kind in ("sequence", "set"):
        return f"List[{_py_type_hint(node.element)}]"
    if node.kind == "linked_list":
        return "Optional[ListNode]"
    if node.kind in ("binary_tree", "bst"):
        return "Optional[TreeNode]"
    if node.kind == "optional":
        inner = _py_type_hint(node.element)
        return inner if inner.startswith("Optional[") else f"Optional[{inner}]"
    if node.kind == "pair":
        return f"Tuple[{', '.join(_py_type_hint(e) for e in node.elements)}]"
    if node.kind == "map":
        return f"Dict[{_py_type_hint(node.key)}, {_py_type_hint(node.value)}]"
    return "Any"


def _parse_function_shape(schema):
    """(func_name, [(pname, TypeNode), ...], return_node_or_None), or None
    if the schema's type strings don't even parse (a malformed/incomplete
    schema — nothing sensible to show)."""
    func_name = schema.get("function_name")
    params = schema.get("params")
    if not func_name or not params:
        return None
    custom_structs = schema.get("custom_structs")
    try:
        param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in params]
        return_type_str = schema.get("return_type")
        return_node = None if _is_void_return(return_type_str) else parse_type(return_type_str, custom_structs)
    except (TypeError_, ValueError):
        return None
    return func_name, param_nodes, return_node


def _function_starter_code(schema, language):
    parsed = _parse_function_shape(schema)
    if parsed is None:
        return None
    func_name, param_nodes, return_node = parsed

    if language == "Python":
        args = ", ".join(f"{pname}: {_py_type_hint(node)}" for pname, node in param_nodes)
        ret_hint = "None" if return_node is None else _py_type_hint(return_node)
        return f"class Solution:\n    def {func_name}(self, {args}) -> {ret_hint}:\n        pass\n"

    if language == "Java":
        lang = get_language("java")
        args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in param_nodes)
        ret_type = "void" if return_node is None else get_adapter(return_node).generate_language_type(lang)
        return f"class Solution {{\n    public {ret_type} {func_name}({args}) {{\n        \n    }}\n}}\n"

    if language in ("C++", "CPP"):
        lang = get_language("cpp")
        args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in param_nodes)
        ret_type = "void" if return_node is None else get_adapter(return_node).generate_language_type(lang)
        return f"class Solution {{\npublic:\n    {ret_type} {func_name}({args}) {{\n        \n    }}\n}};\n"

    if language == "C":
        return _c_function_starter(func_name, param_nodes, return_node)

    return None


def _c_function_starter(func_name, param_nodes, return_node):
    # Local import: avoids a module-load-order cycle (wrapper_generator
    # imports from this package's other modules; this keeps the
    # dependency one-directional at import time, only resolved when a C
    # stub is actually requested).
    from .wrapper_generator import _c_kind

    lang = get_language("c")
    try:
        param_kinds = [_c_kind(node) for _pname, node in param_nodes]
        return_kind = None if return_node is None else _c_kind(return_node)
    except ValueError:
        # 2D arrays, graph, pair, map, set, custom_struct, optional, ... —
        # the same boundary generate_c_source itself draws. Fall back
        # rather than show a signature the real driver could never match.
        return None

    c_args = []
    for (pname, node), kind in zip(param_nodes, param_kinds):
        if kind in ("array_scalar", "array_string"):
            elem_type = get_adapter(node.element).generate_language_type(lang)
            c_args.append(f"{elem_type}* {pname}, int {pname}Size")
        else:
            c_args.append(f"{get_adapter(node).generate_language_type(lang)} {pname}")

    if return_node is None:
        ret_type = "void"
    elif return_kind in ("array_scalar", "array_string"):
        c_args.append("int* returnSize")
        elem_type = get_adapter(return_node.element).generate_language_type(lang)
        ret_type = f"{elem_type}*"
    else:
        ret_type = get_adapter(return_node).generate_language_type(lang)

    return f"{ret_type} {func_name}({', '.join(c_args)}) {{\n    \n}}\n"


def _design_starter_code(schema, language):
    if language == "C":
        return None  # generate_design_source itself never supports C — see its own docstring

    class_name = schema.get("class_name")
    methods = schema.get("methods") or {}
    if not class_name or class_name not in methods:
        return None
    custom_structs = schema.get("custom_structs")

    try:
        parsed_methods = {}
        for op_name, spec in methods.items():
            param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in spec.get("params", [])]
            return_node = None if _is_void_return(spec.get("return_type")) else parse_type(spec.get("return_type"), custom_structs)
            parsed_methods[op_name] = (param_nodes, return_node)
    except (TypeError_, ValueError):
        return None

    ctor_params, _ctor_return = parsed_methods[class_name]
    op_items = [(name, spec) for name, spec in parsed_methods.items() if name != class_name]

    if language == "Python":
        lines = [f"class {class_name}:"]
        ctor_args = ", ".join(f"{pname}: {_py_type_hint(node)}" for pname, node in ctor_params)
        lines.append(f"    def __init__(self, {ctor_args}):" if ctor_args else "    def __init__(self):")
        lines.append("        pass")
        for op_name, (param_nodes, return_node) in op_items:
            args = ", ".join(f"{pname}: {_py_type_hint(node)}" for pname, node in param_nodes)
            ret_hint = "None" if return_node is None else _py_type_hint(return_node)
            signature = f"self, {args}" if args else "self"
            lines.append(f"    def {op_name}({signature}) -> {ret_hint}:")
            lines.append("        pass")
        return "\n".join(lines) + "\n"

    if language == "Java":
        lang = get_language("java")
        lines = [f"class {class_name} {{"]
        ctor_args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in ctor_params)
        lines.append(f"    public {class_name}({ctor_args}) {{\n        \n    }}")
        for op_name, (param_nodes, return_node) in op_items:
            args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in param_nodes)
            ret_type = "void" if return_node is None else get_adapter(return_node).generate_language_type(lang)
            lines.append(f"    public {ret_type} {op_name}({args}) {{\n        \n    }}")
        lines.append("}")
        return "\n".join(lines) + "\n"

    if language in ("C++", "CPP"):
        lang = get_language("cpp")
        lines = [f"class {class_name} {{", "public:"]
        ctor_args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in ctor_params)
        lines.append(f"    {class_name}({ctor_args}) {{\n        \n    }}")
        for op_name, (param_nodes, return_node) in op_items:
            args = ", ".join(f"{get_adapter(node).generate_language_type(lang)} {pname}" for pname, node in param_nodes)
            ret_type = "void" if return_node is None else get_adapter(return_node).generate_language_type(lang)
            lines.append(f"    {ret_type} {op_name}({args}) {{\n        \n    }}")
        lines.append("};")
        return "\n".join(lines) + "\n"

    return None
