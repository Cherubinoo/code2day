"""Orchestrates: a problem's generic schema + a language + the author's
Solution-class source -> one complete, compilable/runnable program.

Every language uses the same calling convention (a `Solution` class/struct
with one method named `function_name`) so this module never special-cases
"Python has no classes" or similar — it always does:
  1. language reader prelude (shared line reader, embedded once)
  2. any ListNode/TreeNode/etc. runtime snippets the schema's types need
     (deduplicated by name across every param + the return type)
  3. the author's Solution source, verbatim
  4. generated `main`: parse each param (via its adapter), call
     `Solution().function_name(*args)`, serialize + print the result

Schema shape: {"function_name": str, "params": [(name, type_str), ...],
"return_type": type_str, "custom_structs": {...} (optional)}.
"""

from .type_system import parse_type
from .adapters.registry import get_adapter
from .languages.registry import get_language
from .languages.base import Ctx


def generate_source(schema, language_name, solution_code):
    lang = get_language(language_name)
    custom_structs = schema.get("custom_structs")
    param_nodes = [(pname, parse_type(ptype, custom_structs)) for pname, ptype in schema["params"]]
    return_node = parse_type(schema["return_type"], custom_structs)
    func_name = schema["function_name"]

    param_adapters = [(pname, get_adapter(node)) for pname, node in param_nodes]
    return_adapter = get_adapter(return_node)

    cb = lang.new_builder()
    ctx = Ctx()

    cb.line(lang.reader_prelude())
    cb.line()

    seen_snippets = set()
    for _, adapter in param_adapters + [(None, return_adapter)]:
        for snippet_name, source in adapter.runtime_snippets(lang):
            if snippet_name not in seen_snippets:
                seen_snippets.add(snippet_name)
                cb.line(source)
                cb.line()

    cb.line(solution_code)
    cb.line()

    _generate_main(cb, lang, ctx, func_name, param_adapters, return_adapter)

    return cb.render()


def _generate_main(cb, lang, ctx, func_name, param_adapters, return_adapter):
    if lang.name == "python":
        with cb.block("if __name__ == \"__main__\""):
            _emit_body(cb, lang, ctx, func_name, param_adapters, return_adapter, indent_call="sol")
        return

    if lang.name == "javascript":
        _emit_body(cb, lang, ctx, func_name, param_adapters, return_adapter, indent_call="sol")
        return

    if lang.name == "java":
        with cb.block("public class Main"):
            with cb.block("public static void main(String[] args) throws IOException"):
                cb.line("_Reader.load();")
                _emit_body(cb, lang, ctx, func_name, param_adapters, return_adapter, indent_call="sol")
        return

    if lang.name == "cpp":
        with cb.block("int main()"):
            cb.line("_reader.load();")
            _emit_body(cb, lang, ctx, func_name, param_adapters, return_adapter, indent_call="sol")
            cb.line("return 0;")
        return

    raise ValueError(f"Unsupported language {lang.name!r}")


def _emit_body(cb, lang, ctx, func_name, param_adapters, return_adapter, *, indent_call):
    arg_exprs = []
    for pname, adapter in param_adapters:
        expr = adapter.generate_parser(cb, lang, ctx)
        arg_exprs.append(expr)

    args_joined = ", ".join(arg_exprs)
    if lang.name == "python":
        cb.line(f"{indent_call} = Solution()")
        cb.line(f"__result = {indent_call}.{func_name}({args_joined})")
    elif lang.name == "javascript":
        cb.line(f"const {indent_call} = new Solution();")
        cb.line(f"const __result = {indent_call}.{func_name}({args_joined});")
    elif lang.name == "java":
        cb.line(f"Solution {indent_call} = new Solution();")
        ret_type = return_adapter.generate_language_type(lang) or "var"
        cb.line(f"{ret_type} __result = {indent_call}.{func_name}({args_joined});")
    elif lang.name == "cpp":
        cb.line(f"Solution {indent_call};")
        ret_type = return_adapter.generate_language_type(lang) or "auto"
        cb.line(f"{ret_type} __result = {indent_call}.{func_name}({args_joined});")

    _emit_output(cb, lang, ctx, return_adapter)


def _emit_output(cb, lang, ctx, return_adapter):
    node = return_adapter.node
    if node.kind == "primitive" and node.name == "string":
        # Spec's own bare-string exception: printed raw, never JSON-quoted.
        lang.print_final(cb, "__result")
        return

    serialized = return_adapter.generate_serializer(cb, lang, ctx, "__result")
    if lang.name == "python":
        cb.line(f"__out = json.dumps({serialized})")
        lang.print_final(cb, "__out")
    elif lang.name == "javascript":
        cb.line(f"const __out = JSON.stringify({serialized});")
        lang.print_final(cb, "__out")
    else:
        # Java/C++: `serialized` is already the fully-built JSON text string.
        lang.print_final(cb, serialized)
