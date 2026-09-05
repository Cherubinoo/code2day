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
from .languages.registry import get_language
from .languages.base import Ctx
from .class_detector import detect_class_name

_VOID_RETURN_TYPES = ("void", "none", "", None)


def generate_source(schema, language_name, solution_code):
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
