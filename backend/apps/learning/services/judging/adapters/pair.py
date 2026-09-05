"""pair<A,B> — a fixed 2-tuple of (possibly different, possibly nested)
types. Represented natively per language (Python tuple, JS 2-array, Java's
own JDK `AbstractMap.SimpleEntry`, C++'s `std::pair`) rather than a custom
generated class, since every one of these already has the right shape and
existing accessors."""

from .base import Adapter


class PairAdapter(Adapter):
    def _sub_adapters(self):
        from .registry import get_adapter
        a_node, b_node = self.node.elements
        return get_adapter(a_node), get_adapter(b_node)

    def generate_parser(self, cb, lang, ctx):
        a_adapter, b_adapter = self._sub_adapters()
        a_expr = a_adapter.generate_parser(cb, lang, ctx)
        b_expr = b_adapter.generate_parser(cb, lang, ctx)
        if lang.name == "python":
            return f"({a_expr}, {b_expr})"
        if lang.name == "javascript":
            return f"[{a_expr}, {b_expr}]"
        if lang.name == "java":
            return f"new AbstractMap.SimpleEntry<>({a_expr}, {b_expr})"
        if lang.name == "cpp":
            return f"make_pair({a_expr}, {b_expr})"
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_serializer(self, cb, lang, ctx, value_expr):
        a_adapter, b_adapter = self._sub_adapters()
        if lang.name in ("python", "javascript"):
            a_val, b_val = f"{value_expr}[0]", f"{value_expr}[1]"
        elif lang.name == "java":
            a_val, b_val = f"{value_expr}.getKey()", f"{value_expr}.getValue()"
        elif lang.name == "cpp":
            a_val, b_val = f"{value_expr}.first", f"{value_expr}.second"
        else:
            raise ValueError(f"Unsupported language {lang.name!r}")

        a_out = a_adapter.generate_serializer(cb, lang, ctx, a_val)
        b_out = b_adapter.generate_serializer(cb, lang, ctx, b_val)

        if lang.name in ("python", "javascript"):
            return f"[{a_out}, {b_out}]"
        return f'("[" + {a_out} + "," + {b_out} + "]")'

    def generate_language_type(self, lang, boxed=False):
        a_adapter, b_adapter = self._sub_adapters()
        if lang.name == "java":
            return (f"AbstractMap.SimpleEntry<{a_adapter.generate_language_type(lang, boxed=True)}, "
                     f"{b_adapter.generate_language_type(lang, boxed=True)}>")
        if lang.name == "cpp":
            return f"pair<{a_adapter.generate_language_type(lang)}, {b_adapter.generate_language_type(lang)}>"
        return None
