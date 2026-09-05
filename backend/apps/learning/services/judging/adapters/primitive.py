"""int/long/float/double/bool/char/string — always a single line, so both
directions are pure expressions (no statements/loops needed), regardless
of language."""

from .base import Adapter


class PrimitiveAdapter(Adapter):
    _CONVERTERS = {
        "int": "to_int", "long": "to_long", "float": "to_float", "double": "to_double",
        "bool": "to_bool", "char": "to_char", "string": "as_string",
    }

    def generate_parser(self, cb, lang, ctx):
        pname = self.node.name
        line_expr = lang.read_line_expr(ctx)
        converter = getattr(lang, self._CONVERTERS[pname])
        return converter(line_expr)

    def generate_serializer(self, cb, lang, ctx, value_expr):
        pname = self.node.name
        if lang.name in ("python", "javascript"):
            # Native value already matches the JSON-compatible shape;
            # json.dumps/JSON.stringify at the top level handles the rest.
            return value_expr
        # Java / C++: build the exact JSON token text by hand.
        if pname == "bool":
            if lang.name == "java":
                return f"String.valueOf({value_expr})"
            return f"({value_expr} ? \"true\" : \"false\")"
        if pname in ("int", "long", "float", "double"):
            if lang.name == "java":
                return f"String.valueOf({value_expr})"
            return f"to_string({value_expr})"
        if pname == "char":
            if lang.name == "java":
                return f"_Json.quote(String.valueOf({value_expr}))"
            return f"_jsonQuote(string(1, {value_expr}))"
        if pname == "string":
            if lang.name == "java":
                return f"_Json.quote({value_expr})"
            return f"_jsonQuote({value_expr})"
        raise ValueError(f"Unknown primitive {pname!r}")

    def generate_language_type(self, lang, boxed=False):
        pname = self.node.name
        if lang.name == "java":
            return lang.primitive_boxed(pname) if boxed else lang.primitive_unboxed(pname)
        if lang.name == "cpp":
            return lang.primitive_type(pname)
        return None
