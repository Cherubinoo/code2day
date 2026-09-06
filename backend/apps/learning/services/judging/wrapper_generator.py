"""Orchestrates: a problem's generic schema + a language + the student's
submitted source -> one complete, compilable/runnable program.

The platform never requires a specific class name — a submission can name
its class anything, as long as *some* class in it defines a method named
`function_name` (see class_detector.py, called once per generation and
used everywhere this module used to hardcode "Solution"). This module
otherwise never special-cases "Python has no classes" or similar — it
always does:
  1. language reader prelude (shared line reader, embedded once)
  2. any ListNode/TreeNode/etc. runtime snippets the schema's types need
     (deduplicated by name across every param + the return type)
  3. the student's source, verbatim
  4. generated `main`: parse each param (via its adapter), call
     <DetectedClass>().function_name(*args), serialize + print the
     result — OR, for a mutated-input problem (return_type "void"/"None",
     or an explicit `comparison.type == "mutated_input"`), call the
     function for its side effect only and serialize the *parameter's*
     post-call value instead of a return value.

Schema shape: {"function_name": str, "params": [(name, type_str), ...],
"return_type": type_str, "custom_structs": {...} (optional),
"comparison": {"type": "mutated_input", "mutated_param": name} (optional)}.
"""

from .type_system import parse_type
from .adapters.registry import get_adapter
from .adapters.base import read_count
from .languages.registry import get_language
from .languages.base import Ctx, if_header
from .class_detector import detect_class_name, detect_class_name_for_methods

_VOID_RETURN_TYPES = ("void", "none", "", None)


def _is_void_return(return_type_str):
    return not return_type_str or (
        isinstance(return_type_str, str) and return_type_str.strip().lower() in _VOID_RETURN_TYPES
    )


def generate_source(schema, language_name, solution_code):
    if language_name == "c":
        # C gets its own dedicated code path, not another branch threaded
        # through the logic below — see generate_c_source's own docstring
        # for why (no classes, and a fundamentally different array-as-
        # pointer+size calling convention LeetCode's own C track uses).
        return generate_c_source(schema, solution_code)

    lang = get_language(language_name)
    custom_structs = schema.get("custom_structs")
    param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in schema["params"]]
    func_name = schema["function_name"]
    class_name = detect_class_name(lang.name, solution_code, func_name)
    param_adapters = [(pname, get_adapter(node)) for pname, node in param_nodes]

    return_type_str = schema.get("return_type")
    is_void = isinstance(return_type_str, str) and return_type_str.strip().lower() in _VOID_RETURN_TYPES or not return_type_str
    comparison = schema.get("comparison") or {}
    wants_mutated = is_void or comparison.get("type") == "mutated_input"

    mutated_index = None
    return_adapter = None
    if wants_mutated:
        mutated_name = comparison.get("mutated_param")
        if mutated_name:
            mutated_index = next(i for i, (pname, _) in enumerate(param_nodes) if pname == mutated_name)
        else:
            mutated_index = 0  # default: the function mutates its first argument
    else:
        return_adapter = get_adapter(parse_type(return_type_str, custom_structs))

    cb = lang.new_builder()
    ctx = Ctx()

    cb.line(lang.reader_prelude())
    cb.line()

    seen_snippets = set()
    all_adapters = [a for _, a in param_adapters] + ([return_adapter] if return_adapter else [])
    for adapter in all_adapters:
        for snippet_name, source in adapter.runtime_snippets(lang):
            if snippet_name not in seen_snippets:
                seen_snippets.add(snippet_name)
                cb.line(source)
                cb.line()

    cb.line(solution_code)
    cb.line()

    _generate_main(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index)

    return cb.render()


def _generate_main(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index):
    if lang.name == "python":
        with cb.block("if __name__ == \"__main__\""):
            _emit_body(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index, indent_call="sol")
        return

    if lang.name == "javascript":
        _emit_body(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index, indent_call="sol")
        return

    if lang.name == "java":
        with cb.block("public class Main"):
            with cb.block("public static void main(String[] args) throws IOException"):
                cb.line("_Reader.load();")
                _emit_body(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index, indent_call="sol")
        return

    if lang.name == "cpp":
        with cb.block("int main()"):
            cb.line("_reader.load();")
            _emit_body(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index, indent_call="sol")
            cb.line("return 0;")
        return

    raise ValueError(f"Unsupported language {lang.name!r}")


def _emit_body(cb, lang, ctx, class_name, func_name, param_adapters, return_adapter, mutated_index, *, indent_call):
    arg_exprs = [adapter.generate_parser(cb, lang, ctx) for _pname, adapter in param_adapters]
    args_joined = ", ".join(arg_exprs)

    if mutated_index is not None:
        # void / mutated-input: call for the side effect only, ignore
        # whatever (if anything) the function returns, then serialize the
        # MUTATED PARAMETER's own post-call value — never a return value.
        if lang.name == "python":
            cb.line(f"{indent_call} = {class_name}()")
            cb.line(f"{indent_call}.{func_name}({args_joined})")
        elif lang.name == "javascript":
            cb.line(f"const {indent_call} = new {class_name}();")
            cb.line(f"{indent_call}.{func_name}({args_joined});")
        elif lang.name == "java":
            cb.line(f"{class_name} {indent_call} = new {class_name}();")
            cb.line(f"{indent_call}.{func_name}({args_joined});")
        elif lang.name == "cpp":
            cb.line(f"{class_name} {indent_call};")
            cb.line(f"{indent_call}.{func_name}({args_joined});")

        mutated_pname, mutated_adapter = param_adapters[mutated_index]
        _emit_output(cb, lang, ctx, mutated_adapter, arg_exprs[mutated_index])
        return

    if lang.name == "python":
        cb.line(f"{indent_call} = {class_name}()")
        cb.line(f"__result = {indent_call}.{func_name}({args_joined})")
    elif lang.name == "javascript":
        cb.line(f"const {indent_call} = new {class_name}();")
        cb.line(f"const __result = {indent_call}.{func_name}({args_joined});")
    elif lang.name == "java":
        cb.line(f"{class_name} {indent_call} = new {class_name}();")
        ret_type = return_adapter.generate_language_type(lang) or "var"
        cb.line(f"{ret_type} __result = {indent_call}.{func_name}({args_joined});")
    elif lang.name == "cpp":
        cb.line(f"{class_name} {indent_call};")
        ret_type = return_adapter.generate_language_type(lang) or "auto"
        cb.line(f"{ret_type} __result = {indent_call}.{func_name}({args_joined});")

    _emit_output(cb, lang, ctx, return_adapter, "__result")


def _emit_output(cb, lang, ctx, adapter, value_expr):
    node = adapter.node
    if node.kind == "primitive" and node.name == "string":
        # Spec's own bare-string exception: printed raw, never JSON-quoted.
        lang.print_final(cb, value_expr)
        return

    serialized = adapter.generate_serializer(cb, lang, ctx, value_expr)
    if lang.name == "python":
        cb.line(f"__out = json.dumps({serialized})")
        lang.print_final(cb, "__out")
    elif lang.name == "javascript":
        cb.line(f"const __out = JSON.stringify({serialized});")
        lang.print_final(cb, "__out")
    else:
        # Java/C++: `serialized` is already the fully-built JSON text string.
        lang.print_final(cb, serialized)


# ─────────────────────────────────────────────────────────────────────────
# Design-pattern (class + multiple method calls) wrapper generation.
#
# Schema shape: {"kind": "design", "class_name": str,
# "methods": {class_name: {"params": [...], "return_type": "void"},
#             method_name: {"params": [...], "return_type": type_str}, ...}}
# — the constructor is keyed by class_name itself inside `methods`, same
# convention services/param_types.py's legacy design schema already uses.
#
# Wire format (identical to the legacy design path, execution_adapter.py):
# stdin is `json.dumps([operations, arguments])` (a flat 2-element array:
# operations[0] is always the constructor call, i.e. == class_name;
# arguments[i] is the argument list for operations[i]). Rather than parse
# that as one JSON blob at runtime (which would need a from-scratch
# per-language JSON parser this framework doesn't have), it's re-expressed
# as a sequence of newline-delimited tokens up front (see
# schema_generator.py's design TestCase convention) so every operation's
# arguments are read off the SAME shared line-reader + per-type adapters
# the function-style path already uses — no new parsing machinery, just a
# runtime dispatch loop over a statically-known set of operation names.
# Output is a single JSON array line, one entry per operation (null for
# the constructor/void methods) — LeetCode's own convention for design
# problems.
# ─────────────────────────────────────────────────────────────────────────

def generate_design_source(schema, language_name, solution_code):
    if language_name == "c":
        # C has no classes — design/class-style problems (a constructor
        # plus multiple callable methods) have no equivalent here. Raise
        # loudly rather than let get_language("c") proceed into logic that
        # assumes a class exists (the legacy execution_adapter.py path
        # already handles C design problems; this package doesn't need to
        # duplicate that).
        raise ValueError(
            "C design/class-style problems are not supported by the generic judge yet — "
            "see execution_adapter.py's legacy design path for C support."
        )

    lang = get_language(language_name)
    custom_structs = schema.get("custom_structs")
    class_name_hint = schema["class_name"]
    methods = schema["methods"]
    method_names = [name for name in methods if name != class_name_hint]
    detected_class = detect_class_name_for_methods(lang.name, solution_code, method_names)

    # One (param_adapters, return_adapter_or_None) pair per declared
    # operation (constructor included), built once up front so both the
    # snippet-hoisting pass and the per-branch codegen below share them.
    op_specs = {}
    for op_name, spec in methods.items():
        param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in spec.get("params", [])]
        param_adapters = [(pname, get_adapter(node)) for pname, node in param_nodes]
        return_type_str = spec.get("return_type")
        return_adapter = None if _is_void_return(return_type_str) else get_adapter(parse_type(return_type_str, custom_structs))
        op_specs[op_name] = (param_adapters, return_adapter)

    cb = lang.new_builder()
    ctx = Ctx()

    cb.line(lang.reader_prelude())
    cb.line()

    seen_snippets = set()
    all_adapters = []
    for param_adapters, return_adapter in op_specs.values():
        all_adapters.extend(a for _pname, a in param_adapters)
        if return_adapter:
            all_adapters.append(return_adapter)
    for adapter in all_adapters:
        for snippet_name, source in adapter.runtime_snippets(lang):
            if snippet_name not in seen_snippets:
                seen_snippets.add(snippet_name)
                cb.line(source)
                cb.line()

    cb.line(solution_code)
    cb.line()

    _generate_design_main(cb, lang, ctx, detected_class, class_name_hint, op_specs)

    return cb.render()


def _generate_design_main(cb, lang, ctx, detected_class, class_name_hint, op_specs):
    if lang.name == "python":
        with cb.block("if __name__ == \"__main__\""):
            _emit_design_body(cb, lang, ctx, detected_class, class_name_hint, op_specs)
        return

    if lang.name == "javascript":
        _emit_design_body(cb, lang, ctx, detected_class, class_name_hint, op_specs)
        return

    if lang.name == "java":
        with cb.block("public class Main"):
            with cb.block("public static void main(String[] args) throws IOException"):
                cb.line("_Reader.load();")
                _emit_design_body(cb, lang, ctx, detected_class, class_name_hint, op_specs)
        return

    if lang.name == "cpp":
        with cb.block("int main()"):
            cb.line("_reader.load();")
            _emit_design_body(cb, lang, ctx, detected_class, class_name_hint, op_specs)
            cb.line("return 0;")
        return

    raise ValueError(f"Unsupported language {lang.name!r}")


def _emit_design_body(cb, lang, ctx, detected_class, class_name_hint, op_specs):
    # `sol` starts unset — the constructor branch is just another entry in
    # the dispatch loop below (schema convention: methods[class_name_hint]
    # is the constructor), so it's assigned there, not declared+constructed
    # up front (the class may have no no-arg constructor to default to).
    if lang.name == "python":
        cb.line("sol = None")
        cb.line("__results = []")
    elif lang.name == "javascript":
        cb.line("let sol = null;")
        cb.line("const __results = [];")
    elif lang.name == "java":
        cb.line(f"{detected_class} sol = null;")
        cb.line("List<String> __results = new ArrayList<>();")
    elif lang.name == "cpp":
        cb.line(f"{detected_class}* sol = nullptr;")
        cb.line("vector<string> __results;")

    n_var = read_count(cb, lang, ctx, var_base="__n")
    header, _loop_var = lang.for_header(ctx, n_var)
    with cb.block(header):
        op_expr = lang.read_line_expr(ctx)
        if lang.name == "python":
            cb.line(f"__op = {op_expr}")
        elif lang.name == "javascript":
            cb.line(f"const __op = {op_expr};")
        elif lang.name == "java":
            cb.line(f"String __op = {op_expr};")
        elif lang.name == "cpp":
            cb.line(f"string __op = {op_expr};")

        for op_name, (param_adapters, return_adapter) in op_specs.items():
            with cb.block(if_header(lang, lang.string_eq("__op", op_name))):
                arg_exprs = [adapter.generate_parser(cb, lang, ctx) for _pname, adapter in param_adapters]
                args_joined = ", ".join(arg_exprs)
                is_constructor = op_name == class_name_hint

                if is_constructor:
                    ctor_expr = lang.new_object(detected_class, arg_exprs)
                    cb.line(f"sol = {ctor_expr}" + (";" if lang.brace_style else ""))
                    _append_design_result(cb, lang, ctx, None, None)
                    continue

                call_expr = f"sol{lang.FIELD_OP}{op_name}({args_joined})"
                if return_adapter is None:
                    cb.line(call_expr + (";" if lang.brace_style else ""))
                    _append_design_result(cb, lang, ctx, None, None)
                else:
                    if lang.name == "python":
                        cb.line(f"__result = {call_expr}")
                    elif lang.name == "javascript":
                        cb.line(f"const __result = {call_expr};")
                    elif lang.name == "java":
                        ret_type = return_adapter.generate_language_type(lang) or "var"
                        cb.line(f"{ret_type} __result = {call_expr};")
                    elif lang.name == "cpp":
                        ret_type = return_adapter.generate_language_type(lang) or "auto"
                        cb.line(f"{ret_type} __result = {call_expr};")
                    _append_design_result(cb, lang, ctx, return_adapter, "__result")

    if lang.name == "python":
        lang.print_final(cb, "json.dumps(__results)")
    elif lang.name == "javascript":
        lang.print_final(cb, "JSON.stringify(__results)")
    elif lang.name == "java":
        lang.print_final(cb, '"[" + String.join(",", __results) + "]"')
    elif lang.name == "cpp":
        lang.print_final(cb, "_joinArr(__results)")


def _append_design_result(cb, lang, ctx, adapter, value_expr):
    """Appends one operation's result to __results — a native JSON-ready
    value for Python/JS (dynamically typed: the whole __results list gets
    one json.dumps/JSON.stringify pass at the very end), or an
    already-built JSON text fragment for Java/C++ (statically typed: no
    built-in JSON encoder, so each fragment is pre-serialized text joined
    into one array string at the end)."""
    if adapter is None:
        # void method / constructor — no return value.
        if lang.name == "python":
            cb.line("__results.append(None)")
        elif lang.name == "javascript":
            cb.line("__results.push(null);")
        elif lang.name == "java":
            cb.line('__results.add("null");')
        elif lang.name == "cpp":
            cb.line('__results.push_back("null");')
        return

    serialized = adapter.generate_serializer(cb, lang, ctx, value_expr)
    if lang.name == "python":
        cb.line(f"__results.append({serialized})")
    elif lang.name == "javascript":
        cb.line(f"__results.push({serialized});")
    elif lang.name == "java":
        cb.line(f"__results.add({serialized});")
    elif lang.name == "cpp":
        cb.line(f"__results.push_back({serialized});")


# ─────────────────────────────────────────────────────────────────────────
# C — a genuinely separate code path from everything above, not another
# `lang.name` branch threaded through the shared logic. Two real
# differences from Python/Java/C++/JS:
#   1. No classes — the student writes one free function named
#      schema["function_name"] directly at file scope. class_detector.py
#      doesn't apply; there's nothing to detect.
#   2. LeetCode's own real C calling convention decomposes any array-typed
#      parameter or return value into a raw pointer PLUS a separate size
#      argument (`int* nums, int numsSize`, `int* twoSum(..., int*
#      returnSize)`) rather than passing/returning a single object — unlike
#      every other language here, which builds one adapter expression per
#      declared param and calls `Solution().func(arg1, arg2, ...)`.
#
# Scope, matching the boundary the legacy execution_adapter.py's C path
# already draws (its own "2D arrays aren't supported by the C execution
# path yet"): scalars, strings, a flat (1D) array of a scalar/string,
# linked_list<T>, and binary_tree<T>/bst<T> for scalar T. Anything else
# (2D arrays, graph, pair, map, set, custom_struct, optional, ...) raises a
# clear ValueError naming the unsupported shape — never emits broken C.
# ─────────────────────────────────────────────────────────────────────────

def _c_kind(type_node):
    """Classify a TypeNode for C's own calling convention. One of "scalar",
    "string", "array_scalar", "array_string", "linked_list", "tree"."""
    kind = type_node.kind
    if kind == "primitive":
        return "string" if type_node.name == "string" else "scalar"
    if kind in ("binary_tree", "bst"):
        if type_node.element.kind != "primitive" or type_node.element.name == "string":
            raise ValueError(f"C only supports binary_tree<T>/bst<T> for a scalar numeric T, not {type_node.raw!r}.")
        return "tree"
    if kind == "linked_list":
        if type_node.element.kind != "primitive" or type_node.element.name == "string":
            raise ValueError(f"C only supports linked_list<T> for a scalar numeric T, not {type_node.raw!r}.")
        return "linked_list"
    if kind in ("sequence", "set"):
        elem = type_node.element
        if elem.kind != "primitive":
            raise ValueError(
                f"C does not support nested/2D array types ({type_node.raw!r}) in the generic judge yet — "
                "only a flat array of a scalar or string."
            )
        return "array_string" if elem.name == "string" else "array_scalar"
    raise ValueError(f"C does not support the {kind!r} type shape ({type_node.raw!r}) in the generic judge yet.")


def _c_call_args_for_param(kind, var_expr):
    """Expand one parsed param's variable into the positional C call
    arguments it contributes: 2 for an array (data pointer + size), 1 for
    everything else (scalar/string passed directly; linked_list/tree
    passed as the pointer itself)."""
    if kind in ("array_scalar", "array_string"):
        return [f"{var_expr}.data", f"{var_expr}.size"]
    return [var_expr]


def _emit_c_array_return_output(cb, lang, ctx, elem_node, ptr_expr, size_expr):
    """Build the OUTPUT-format JSON text for a raw (pointer, size) pair —
    LeetCode's own C return convention for an array (an `int* returnSize`
    out-param), which has no struct to run the shared SequenceAdapter
    machinery on (that machinery is for the struct-based internal
    representation built while *parsing* input, not a function's raw
    returned pointer)."""
    elem_adapter = get_adapter(elem_node)
    out_var = ctx.fresh("out")
    cb.line(f"StringArray {out_var};")
    cb.line(f"StringArray_init(&{out_var});")
    header, idx = lang.for_header(ctx, size_expr)
    with cb.block(header):
        item_expr = f"{ptr_expr}[{idx}]"
        item_out = elem_adapter.generate_serializer(cb, lang, ctx, item_expr)
        cb.line(f"StringArray_push(&{out_var}, {item_out});")
    return f"_c2d_join_arr({out_var}.data, {out_var}.size)"


def generate_c_source(schema, solution_code):
    lang = get_language("c")
    custom_structs = schema.get("custom_structs")
    param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in schema["params"]]
    func_name = schema["function_name"]

    param_kinds = [_c_kind(node) for _pname, node in param_nodes]
    param_adapters = [(pname, get_adapter(node)) for pname, node in param_nodes]

    return_type_str = schema.get("return_type")
    is_void = _is_void_return(return_type_str)
    comparison = schema.get("comparison") or {}
    wants_mutated = is_void or comparison.get("type") == "mutated_input"

    mutated_index = None
    return_node = None
    return_kind = None
    if wants_mutated:
        mutated_name = comparison.get("mutated_param")
        if mutated_name:
            mutated_index = next(i for i, (pname, _) in enumerate(param_nodes) if pname == mutated_name)
        else:
            mutated_index = 0  # default: the function mutates its first argument
    else:
        return_node = parse_type(return_type_str, custom_structs)
        return_kind = _c_kind(return_node)

    cb = lang.new_builder()
    ctx = Ctx()

    cb.line(lang.reader_prelude())
    cb.line()

    seen_snippets = set()
    all_adapters = [a for _, a in param_adapters]
    if return_node is not None:
        all_adapters.append(get_adapter(return_node))
    for adapter in all_adapters:
        for snippet_name, source in adapter.runtime_snippets(lang):
            if snippet_name not in seen_snippets:
                seen_snippets.add(snippet_name)
                cb.line(source)
                cb.line()

    cb.line(solution_code)
    cb.line()

    with cb.block("int main(void)"):
        cb.line("_c2d_load();")

        arg_exprs = [adapter.generate_parser(cb, lang, ctx) for _pname, adapter in param_adapters]
        call_args = []
        for kind, var_expr in zip(param_kinds, arg_exprs):
            call_args.extend(_c_call_args_for_param(kind, var_expr))

        if mutated_index is not None:
            cb.line(f"{func_name}({', '.join(call_args)});")
            mutated_kind = param_kinds[mutated_index]
            mutated_var = arg_exprs[mutated_index]
            mutated_node = param_nodes[mutated_index][1]
            if mutated_kind in ("array_scalar", "array_string"):
                json_expr = _emit_c_array_return_output(
                    cb, lang, ctx, mutated_node.element, f"{mutated_var}.data", f"{mutated_var}.size",
                )
                lang.print_final(cb, json_expr)
            else:
                mutated_adapter = param_adapters[mutated_index][1]
                _emit_output(cb, lang, ctx, mutated_adapter, mutated_var)
        elif return_kind in ("array_scalar", "array_string"):
            size_var = ctx.fresh("returnSize")
            cb.line(f"int {size_var};")
            if return_kind == "array_string":
                ret_type = "char**"
            else:
                elem_c_type = get_adapter(return_node.element).generate_language_type(lang)
                ret_type = f"{elem_c_type}*"
            result_var = ctx.fresh("result")
            call_args_with_out = call_args + [f"&{size_var}"]
            cb.line(f"{ret_type} {result_var} = {func_name}({', '.join(call_args_with_out)});")
            json_expr = _emit_c_array_return_output(cb, lang, ctx, return_node.element, result_var, size_var)
            lang.print_final(cb, json_expr)
        else:
            return_adapter = get_adapter(return_node)
            result_var = ctx.fresh("result")
            if return_kind in ("scalar", "string"):
                ret_type = return_adapter.generate_language_type(lang)
            elif return_kind == "linked_list":
                ret_type = "struct ListNode*"
            elif return_kind == "tree":
                ret_type = "struct TreeNode*"
            else:
                raise ValueError(f"Unexpected C return kind {return_kind!r}")
            cb.line(f"{ret_type} {result_var} = {func_name}({', '.join(call_args)});")
            _emit_output(cb, lang, ctx, return_adapter, result_var)

        cb.line("return 0;")

    return cb.render()
