"""Canonical singly-linked list — spec's own worked final example.

Wire format: count N, then N recursive element blocks (no nulls — a linked
list's "gaps" would just be a shorter list, unlike a tree's positional
gaps). Parsing builds a REAL ListNode chain (not a bare array) so user code
receives/returns the same object shape LeetCode itself uses; serializing
walks that chain back into a flat array, matching the same array-of-values
JSON the comparator expects for a linked_list's output.
"""

from .base import Adapter, read_count, assign_stmt
from ..languages.base import if_header, else_header, while_header, negate


class LinkedListAdapter(Adapter):
    def _element_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def generate_parser(self, cb, lang, ctx):
        elem_adapter = self._element_adapter()
        n = read_count(cb, lang, ctx)
        head = ctx.fresh("head")
        tail = ctx.fresh("tail")

        if lang.name == "python":
            cb.line(f"{head} = None")
            cb.line(f"{tail} = None")
        elif lang.name == "javascript":
            cb.line(f"let {head} = null;")
            cb.line(f"let {tail} = null;")
        elif lang.name == "java":
            cb.line(f"ListNode {head} = null;")
            cb.line(f"ListNode {tail} = null;")
        elif lang.name == "cpp":
            cb.line(f"ListNode* {head} = nullptr;")
            cb.line(f"ListNode* {tail} = nullptr;")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            val_expr = elem_adapter.generate_parser(cb, lang, ctx)
            node_var = ctx.fresh("node")
            new_expr = lang.new_object("ListNode", [val_expr])
            if lang.name == "python":
                cb.line(f"{node_var} = {new_expr}")
            elif lang.name == "javascript":
                cb.line(f"const {node_var} = {new_expr};")
            elif lang.name == "java":
                cb.line(f"ListNode {node_var} = {new_expr};")
            elif lang.name == "cpp":
                cb.line(f"ListNode* {node_var} = {new_expr};")

            with cb.block(if_header(lang, lang.is_null(head))):
                assign_stmt(cb, lang, head, node_var)
            with cb.block(else_header(lang)):
                assign_stmt(cb, lang, f"{tail}{lang.FIELD_OP}next", node_var)
            assign_stmt(cb, lang, tail, node_var)

        return head

    def generate_serializer(self, cb, lang, ctx, value_expr):
        elem_adapter = self._element_adapter()
        out_var = ctx.fresh("out")
        cur = ctx.fresh("cur")

        if lang.name == "python":
            cb.line(f"{out_var} = []")
            cb.line(f"{cur} = {value_expr}")
        elif lang.name == "javascript":
            cb.line(f"let {out_var} = [];")
            cb.line(f"let {cur} = {value_expr};")
        elif lang.name == "java":
            cb.line(f"List<String> {out_var} = new ArrayList<>();")
            cb.line(f"ListNode {cur} = {value_expr};")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {out_var};")
            cb.line(f"ListNode* {cur} = {value_expr};")

        with cb.block(while_header(lang, negate(lang, lang.is_null(cur)))):
            item_out = elem_adapter.generate_serializer(cb, lang, ctx, f"{cur}{lang.FIELD_OP}val")
            lang.append_stmt(cb, out_var, item_out)
            assign_stmt(cb, lang, cur, f"{cur}{lang.FIELD_OP}next")

        if lang.name in ("python", "javascript"):
            return out_var
        if lang.name == "java":
            return f'("[" + String.join(",", {out_var}) + "]")'
        if lang.name == "cpp":
            return f"_joinArr({out_var})"
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        if lang.name == "java":
            return "ListNode"
        if lang.name == "cpp":
            return "ListNode*"
        return None

    def runtime_snippets(self, lang):
        elem_adapter = self._element_adapter()
        if lang.name == "python":
            src = (
                "class ListNode:\n"
                "    def __init__(self, val=0, next=None):\n"
                "        self.val = val\n"
                "        self.next = next"
            )
        elif lang.name == "javascript":
            src = (
                "class ListNode {\n"
                "    constructor(val, next) {\n"
                "        this.val = (val === undefined ? 0 : val);\n"
                "        this.next = (next === undefined ? null : next);\n"
                "    }\n"
                "}"
            )
        elif lang.name == "java":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "class ListNode {\n"
                f"    {val_type} val;\n"
                "    ListNode next;\n"
                "    ListNode() {}\n"
                f"    ListNode({val_type} val) {{ this.val = val; }}\n"
                f"    ListNode({val_type} val, ListNode next) {{ this.val = val; this.next = next; }}\n"
                "}"
            )
        elif lang.name == "cpp":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "struct ListNode {\n"
                f"    {val_type} val;\n"
                "    ListNode *next;\n"
                "    ListNode() : val(0), next(nullptr) {}\n"
                f"    ListNode({val_type} x) : val(x), next(nullptr) {{}}\n"
                f"    ListNode({val_type} x, ListNode *next) : val(x), next(next) {{}}\n"
                "};"
            )
        else:
            return []
        return [("ListNode", src)]
