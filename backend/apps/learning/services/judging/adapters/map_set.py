"""map<K,V> — count N, then N (key block, value block) pairs (spec's own
wire format; see serializer.py's module docstring). `set<T>` doesn't need
a class here at all — the type parser routes it straight to
`SequenceAdapter` since its wire format and codegen are identical to any
other ordered collection; only `comparator.py`'s unordered-equality
handling treats it specially.

Java uses `LinkedHashMap` (List already gets correct content-based
equals/hashCode from the JDK, so even a compound key type works); C++
uses `std::map` (needs `operator<`, which every generated type here
supports transitively) — comparator.py's map equality is already
order-independent, so neither's iteration order matters.
"""

from .base import Adapter, read_count


class MapAdapter(Adapter):
    def _sub_adapters(self):
        from .registry import get_adapter
        return get_adapter(self.node.key), get_adapter(self.node.value)

    def generate_parser(self, cb, lang, ctx):
        key_adapter, val_adapter = self._sub_adapters()
        n = read_count(cb, lang, ctx)
        var = ctx.fresh("map")

        if lang.name == "python":
            cb.line(f"{var} = {{}}")
        elif lang.name == "javascript":
            cb.line(f"let {var} = new Map();")
        elif lang.name == "java":
            k_type = key_adapter.generate_language_type(lang, boxed=True)
            v_type = val_adapter.generate_language_type(lang, boxed=True)
            cb.line(f"Map<{k_type}, {v_type}> {var} = new LinkedHashMap<>();")
        elif lang.name == "cpp":
            k_type = key_adapter.generate_language_type(lang)
            v_type = val_adapter.generate_language_type(lang)
            cb.line(f"map<{k_type}, {v_type}> {var};")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            k_expr = key_adapter.generate_parser(cb, lang, ctx)
            v_expr = val_adapter.generate_parser(cb, lang, ctx)
            if lang.name == "python":
                cb.line(f"{var}[{k_expr}] = {v_expr}")
            elif lang.name == "javascript":
                cb.line(f"{var}.set({k_expr}, {v_expr});")
            elif lang.name == "java":
                cb.line(f"{var}.put({k_expr}, {v_expr});")
            elif lang.name == "cpp":
                cb.line(f"{var}[{k_expr}] = {v_expr};")
        return var

    def generate_serializer(self, cb, lang, ctx, value_expr):
        key_adapter, val_adapter = self._sub_adapters()
        out_var = ctx.fresh("out")
        if lang.name == "python":
            cb.line(f"{out_var} = []")
        elif lang.name == "javascript":
            cb.line(f"let {out_var} = [];")
        elif lang.name == "java":
            cb.line(f"List<String> {out_var} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {out_var};")

        k_var = ctx.fresh("k")
        v_var = ctx.fresh("v")
        if lang.name == "python":
            with cb.block(f"for {k_var}, {v_var} in {value_expr}.items()"):
                self._emit_pair(cb, lang, ctx, key_adapter, val_adapter, k_var, v_var, out_var)
        elif lang.name == "javascript":
            with cb.block(f"for (const [{k_var}, {v_var}] of {value_expr})"):
                self._emit_pair(cb, lang, ctx, key_adapter, val_adapter, k_var, v_var, out_var)
        elif lang.name == "java":
            entry_type = (f"Map.Entry<{key_adapter.generate_language_type(lang, boxed=True)}, "
                          f"{val_adapter.generate_language_type(lang, boxed=True)}>")
            e_var = ctx.fresh("e")
            with cb.block(f"for ({entry_type} {e_var} : {value_expr}.entrySet())"):
                cb.line(f"{key_adapter.generate_language_type(lang, boxed=True)} {k_var} = {e_var}.getKey();")
                cb.line(f"{val_adapter.generate_language_type(lang, boxed=True)} {v_var} = {e_var}.getValue();")
                self._emit_pair(cb, lang, ctx, key_adapter, val_adapter, k_var, v_var, out_var)
        elif lang.name == "cpp":
            e_var = ctx.fresh("e")
            with cb.block(f"for (auto& {e_var} : {value_expr})"):
                cb.line(f"auto {k_var} = {e_var}.first;")
                cb.line(f"auto {v_var} = {e_var}.second;")
                self._emit_pair(cb, lang, ctx, key_adapter, val_adapter, k_var, v_var, out_var)

        if lang.name in ("python", "javascript"):
            return out_var
        if lang.name == "java":
            return f'("[" + String.join(",", {out_var}) + "]")'
        if lang.name == "cpp":
            return f"_joinArr({out_var})"
        raise ValueError(f"Unsupported language {lang.name!r}")

    @staticmethod
    def _emit_pair(cb, lang, ctx, key_adapter, val_adapter, k_var, v_var, out_var):
        k_out = key_adapter.generate_serializer(cb, lang, ctx, k_var)
        v_out = val_adapter.generate_serializer(cb, lang, ctx, v_var)
        if lang.name in ("python", "javascript"):
            lang.append_stmt(cb, out_var, f"[{k_out}, {v_out}]")
        else:
            lang.append_stmt(cb, out_var, f'("[" + {k_out} + "," + {v_out} + "]")')

    def generate_language_type(self, lang, boxed=False):
        key_adapter, val_adapter = self._sub_adapters()
        if lang.name == "java":
            return (f"Map<{key_adapter.generate_language_type(lang, boxed=True)}, "
                    f"{val_adapter.generate_language_type(lang, boxed=True)}>")
        if lang.name == "cpp":
            return f"map<{key_adapter.generate_language_type(lang)}, {val_adapter.generate_language_type(lang)}>"
        return None
