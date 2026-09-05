"""custom_struct — each declared field's recursive block, in wire-declared
order (spec's own scheme; see serializer.py's module docstring). Parsing
builds a real object of a class generated once per struct name (so user
code gets a real typed record, not a bare dict/map) via `runtime_snippets`;
serializing reads the same fields back off it and emits a genuine JSON
object (unlike pair/map, which spec §12 represents as arrays)."""

from .base import Adapter


def _java_cpp_key_prefix(fname):
    """The literal java/cpp source text for `"<fname>":` as a string-literal
    fragment (i.e. already escaped to appear inside a `"..."` concatenation
    chain) — e.g. for fname="val" this returns the text `"\"val\":"`."""
    return f'"\\"{fname}\\":"'


class CustomStructAdapter(Adapter):
    def _field_adapters(self):
        from .registry import get_adapter
        return [(fname, get_adapter(ftype)) for fname, ftype in self.node.fields.items()]

    def generate_parser(self, cb, lang, ctx):
        field_adapters = self._field_adapters()
        arg_exprs = [adapter.generate_parser(cb, lang, ctx) for _fname, adapter in field_adapters]
        return lang.new_object(self.node.name, arg_exprs)

    def generate_serializer(self, cb, lang, ctx, value_expr):
        field_adapters = self._field_adapters()
        field_outs = []
        for fname, adapter in field_adapters:
            val_expr = f"{value_expr}{lang.FIELD_OP}{fname}"
            field_outs.append((fname, adapter.generate_serializer(cb, lang, ctx, val_expr)))

        if lang.name == "python":
            body = ", ".join(f"{fname!r}: {out}" for fname, out in field_outs)
            return "{" + body + "}"
        if lang.name == "javascript":
            body = ", ".join(f"{fname}: {out}" for fname, out in field_outs)
            return "{" + body + "}"
        if lang.name in ("java", "cpp"):
            parts = [f"{_java_cpp_key_prefix(fname)} + {out}" for fname, out in field_outs]
            joined = ' + "," + '.join(parts)
            return f'("{{" + {joined} + "}}")'
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        if lang.name in ("java", "cpp"):
            return self.node.name
        return None

    def runtime_snippets(self, lang):
        field_adapters = self._field_adapters()
        struct_name = self.node.name

        if lang.name == "python":
            params = ", ".join(fname for fname, _ in field_adapters)
            assigns = "\n".join(f"        self.{fname} = {fname}" for fname, _ in field_adapters) or "        pass"
            src = f"class {struct_name}:\n    def __init__(self, {params}):\n{assigns}"
        elif lang.name == "javascript":
            params = ", ".join(fname for fname, _ in field_adapters)
            assigns = "\n".join(f"        this.{fname} = {fname};" for fname, _ in field_adapters)
            src = f"class {struct_name} {{\n    constructor({params}) {{\n{assigns}\n    }}\n}}"
        elif lang.name == "java":
            fields_decl = "\n".join(f"    {a.generate_language_type(lang)} {fname};" for fname, a in field_adapters)
            params = ", ".join(f"{a.generate_language_type(lang)} {fname}" for fname, a in field_adapters)
            assigns = " ".join(f"this.{fname} = {fname};" for fname, _ in field_adapters)
            src = f"class {struct_name} {{\n{fields_decl}\n    {struct_name}({params}) {{ {assigns} }}\n}}"
        elif lang.name == "cpp":
            fields_decl = "\n".join(f"    {a.generate_language_type(lang)} {fname};" for fname, a in field_adapters)
            params = ", ".join(f"{a.generate_language_type(lang)} {fname}" for fname, a in field_adapters)
            init_list = ", ".join(f"{fname}({fname})" for fname, _ in field_adapters)
            src = f"struct {struct_name} {{\n{fields_decl}\n    {struct_name}({params}) : {init_list} {{}}\n}};"
        else:
            return []
        return [(struct_name, src)]
