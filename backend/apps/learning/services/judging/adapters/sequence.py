"""One generic adapter for every 'ordered collection of T' shape — vector,
array, list, matrix (sugar: a sequence-of-sequences, already expanded by
the type parser), stack, queue, deque — and for `set` (identical wire
format; only comparator.py's unordered handling differs, not this codegen).
No need for 6+ separate adapters when the wire format and the generated
parse/serialize code are byte-for-byte identical; a caller can still tell
them apart via `node.sequence_kind` if a future language module ever wants
push/pop-specific idioms, but none currently do.
"""

from .base import Adapter, read_count


class SequenceAdapter(Adapter):
    def _element_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def generate_parser(self, cb, lang, ctx):
        elem_adapter = self._element_adapter()
        n = read_count(cb, lang, ctx)
        var = ctx.fresh("seq")

        if lang.name == "python":
            cb.line(f"{var} = []")
        elif lang.name == "javascript":
            cb.line(f"let {var} = [];")
        elif lang.name == "java":
            elem_type = elem_adapter.generate_language_type(lang, boxed=True)
            cb.line(f"List<{elem_type}> {var} = new ArrayList<>();")
        elif lang.name == "cpp":
            elem_type = elem_adapter.generate_language_type(lang)
            cb.line(f"vector<{elem_type}> {var};")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            item_expr = elem_adapter.generate_parser(cb, lang, ctx)
            lang.append_stmt(cb, var, item_expr)
        return var

    def generate_serializer(self, cb, lang, ctx, value_expr):
        elem_adapter = self._element_adapter()
        out_var = ctx.fresh("out")

        if lang.name == "python":
            cb.line(f"{out_var} = []")
        elif lang.name == "javascript":
            cb.line(f"let {out_var} = [];")
        elif lang.name == "java":
            cb.line(f"List<String> {out_var} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {out_var};")

        elem_type_for_foreach = None
        if lang.name == "java":
            elem_type_for_foreach = elem_adapter.generate_language_type(lang, boxed=True)
        header, item_var = lang.foreach_header(ctx, value_expr, elem_type=elem_type_for_foreach) \
            if lang.name == "java" else lang.foreach_header(ctx, value_expr)
        with cb.block(header):
            item_out = elem_adapter.generate_serializer(cb, lang, ctx, item_var)
            lang.append_stmt(cb, out_var, item_out)

        if lang.name in ("python", "javascript"):
            return out_var
        if lang.name == "java":
            return f'("[" + String.join(",", {out_var}) + "]")'
        if lang.name == "cpp":
            return f"_joinArr({out_var})"
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        elem_adapter = self._element_adapter()
        if lang.name == "java":
            return f"List<{elem_adapter.generate_language_type(lang, boxed=True)}>"
        if lang.name == "cpp":
            return f"vector<{elem_adapter.generate_language_type(lang)}>"
        return None
