"""int/long/float/double/bool/char/string — always a single line."""

from .base import Adapter, declare_var


class PrimitiveAdapter(Adapter):
    _CONVERTERS = {
        "int": "to_int", "long": "to_long", "float": "to_float", "double": "to_double",
        "bool": "to_bool", "char": "to_char", "string": "as_string",
    }

    def generate_parser(self, cb, lang, ctx):
        pname = self.node.name
        line_expr = lang.read_line_expr(ctx)
        converter = getattr(lang, self._CONVERTERS[pname])
        expr = converter(line_expr)

        # Always captured into a freshly declared variable immediately —
        # never returned as a bare, still-unevaluated expression. A raw
        # `int(_reader.next())` handed back to the caller would only
        # actually READ from stdin whenever that expression text finally
        # gets used (e.g. at a later function-call site), which silently
        # reorders stdin consumption relative to sibling params that DO
        # emit real statements right away (sequences, trees, ...) — a
        # primitive param followed by a compound one would have the
        # compound one's parsing steal the primitive's line first.
        var = ctx.fresh("prim")
        declare_var(
            cb, lang, var, expr,
            java_type=self.generate_language_type(lang) if lang.name == "java" else None,
            cpp_type=self.generate_language_type(lang) if lang.name == "cpp" else None,
            c_type=self.generate_language_type(lang) if lang.name == "c" else None,
        )
        return var

    def generate_serializer(self, cb, lang, ctx, value_expr):
        pname = self.node.name
        if lang.name in ("python", "javascript"):
            # Native value already matches the JSON-compatible shape;
            # json.dumps/JSON.stringify at the top level handles the rest.
            return value_expr
        if lang.name == "c":
            # C has no to_string/String.valueOf — build the JSON token text
            # via a small sprintf-based helper (see c_lang.reader_prelude).
            if pname == "bool":
                return f'({value_expr} ? "true" : "false")'
            if pname == "int":
                return f'_c2d_sprintf_dup("%d", {value_expr})'
            if pname == "long":
                return f'_c2d_sprintf_dup("%lld", {value_expr})'
            if pname in ("float", "double"):
                return f'_c2d_sprintf_dup("%.10g", {value_expr})'
            if pname == "char":
                return f"_c2d_json_quote_char({value_expr})"
            if pname == "string":
                return f"_c2d_json_quote({value_expr})"
            raise ValueError(f"Unknown primitive {pname!r}")
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
        if lang.name in ("cpp", "c"):
            return lang.primitive_type(pname)
        return None
