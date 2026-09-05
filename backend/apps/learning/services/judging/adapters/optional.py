"""Optional<T> / Nullable<T> — a generic nullable wrapper for any type.

binary_tree/bst and linked_list are ALREADY inherently nullable in both
wire format and generated code (an empty tree/list IS a null root/head —
see BinaryTreeAdapter/LinkedListAdapter), so wrapping either in Optional
is a pure pass-through: no extra codegen needed, `Optional[TreeNode]` and
`binary_tree<int>` behave identically. Every other type (primitives,
sequences, pairs, maps, custom structs, graphs) gets the real null-vs-
value wire prefix here, plus — for statically-typed languages — a
promotion to an actually-nullable representation (Java: the boxed type;
C++: a heap pointer, since e.g. a bare `int` has no null value of its own).
"""

from .base import Adapter, assign_stmt
from ..languages.base import if_header, else_header

_INHERENTLY_NULLABLE = ("linked_list", "binary_tree", "bst")


class OptionalAdapter(Adapter):
    def _inner_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def _passthrough(self):
        return self.node.element.kind in _INHERENTLY_NULLABLE

    def generate_parser(self, cb, lang, ctx):
        inner = self._inner_adapter()
        if self._passthrough():
            return inner.generate_parser(cb, lang, ctx)

        raw = ctx.fresh("optRaw")
        if lang.name == "python":
            cb.line(f"{raw} = {lang.read_line_expr(ctx)}")
        elif lang.name == "javascript":
            cb.line(f"const {raw} = {lang.read_line_expr(ctx)};")
        elif lang.name == "java":
            cb.line(f"String {raw} = {lang.read_line_expr(ctx)};")
        elif lang.name == "cpp":
            cb.line(f"string {raw} = {lang.read_line_expr(ctx)};")

        result = ctx.fresh("opt")
        lang_type = self.generate_language_type(lang)
        if lang.name == "python":
            cb.line(f"{result} = None")
        elif lang.name == "javascript":
            cb.line(f"let {result} = null;")
        elif lang.name == "java":
            cb.line(f"{lang_type} {result} = null;")
        elif lang.name == "cpp":
            cb.line(f"{lang_type} {result} = nullptr;")

        with cb.block(if_header(lang, lang.string_eq(raw, "null"))):
            if not lang.brace_style:
                cb.line("pass")  # result already None; Python needs an explicit body
        with cb.block(else_header(lang)):
            lang.reader_rollback(cb)  # the peeked line wasn't "null" — the inner adapter re-reads it
            inner_expr = inner.generate_parser(cb, lang, ctx)
            if lang.name == "cpp":
                inner_expr = f"new {inner.generate_language_type(lang)}({inner_expr})"
            assign_stmt(cb, lang, result, inner_expr)

        return result

    def generate_serializer(self, cb, lang, ctx, value_expr):
        inner = self._inner_adapter()
        if self._passthrough():
            return inner.generate_serializer(cb, lang, ctx, value_expr)

        out = ctx.fresh("optOut")
        deref = f"(*{value_expr})" if lang.name == "cpp" else value_expr

        if lang.name == "python":
            cb.line(f"{out} = None")
        elif lang.name == "javascript":
            cb.line(f"let {out} = null;")
        elif lang.name == "java":
            cb.line(f"String {out} = null;")
        elif lang.name == "cpp":
            cb.line(f'string {out} = "null";')

        with cb.block(if_header(lang, lang.is_null(value_expr))):
            null_lit = "None" if lang.name == "python" else ("null" if lang.name == "javascript" else '"null"')
            assign_stmt(cb, lang, out, null_lit)
        with cb.block(else_header(lang)):
            inner_out = inner.generate_serializer(cb, lang, ctx, deref)
            assign_stmt(cb, lang, out, inner_out)

        return out

    def generate_language_type(self, lang, boxed=False):
        inner = self._inner_adapter()
        if self._passthrough():
            return inner.generate_language_type(lang, boxed=boxed)
        if lang.name == "java":
            return inner.generate_language_type(lang, boxed=True)
        if lang.name == "cpp":
            return f"{inner.generate_language_type(lang)}*"
        return None

    def runtime_snippets(self, lang):
        return self._inner_adapter().runtime_snippets(lang)
