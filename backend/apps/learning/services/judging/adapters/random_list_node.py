"""RandomListNode<T> — "Copy List with Random Pointer"'s node shape: each
node has val/next (like a normal singly-linked list) plus an extra
`random` pointer to any node in the same list, or null.

Wire format: count N, then N `val` blocks (list order), then N `random`
index lines (0-based index into that list, or -1 for null) — the same
information as LeetCode's own `[[val,random_index],...]` convention, split
into two passes so construction is a simple two-pass build (every node
first, then wire up `next` and `random` by index) instead of needing
forward references to not-yet-built nodes.
"""

from .base import Adapter, read_count, assign_stmt, declare_var
from ..languages.base import if_header


class RandomListNodeAdapter(Adapter):
    def _element_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def generate_parser(self, cb, lang, ctx):
        elem_adapter = self._element_adapter()
        n = read_count(cb, lang, ctx)
        nodes = ctx.fresh("rlnodes")

        if lang.name == "python":
            cb.line(f"{nodes} = []")
        elif lang.name == "javascript":
            cb.line(f"let {nodes} = [];")
        elif lang.name == "java":
            cb.line(f"List<RandomListNode> {nodes} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<RandomListNode*> {nodes};")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            val_expr = elem_adapter.generate_parser(cb, lang, ctx)
            node_var = ctx.fresh("rlnode")
            new_expr = lang.new_object("RandomListNode", [val_expr])
            if lang.name == "python":
                cb.line(f"{node_var} = {new_expr}")
            elif lang.name == "javascript":
                cb.line(f"const {node_var} = {new_expr};")
            elif lang.name == "java":
                cb.line(f"RandomListNode {node_var} = {new_expr};")
            elif lang.name == "cpp":
                cb.line(f"RandomListNode* {node_var} = {new_expr};")
            lang.append_stmt(cb, nodes, node_var)

        idx_arr = ctx.fresh("rlrand")
        if lang.name == "python":
            cb.line(f"{idx_arr} = []")
        elif lang.name == "javascript":
            cb.line(f"let {idx_arr} = [];")
        elif lang.name == "java":
            cb.line(f"List<Integer> {idx_arr} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<int> {idx_arr};")

        header2, _idx2 = lang.for_header(ctx, n)
        with cb.block(header2):
            ri = ctx.fresh("ri")
            declare_var(cb, lang, ri, lang.to_int(lang.read_line_expr(ctx)), java_type="int", cpp_type="int")
            lang.append_stmt(cb, idx_arr, ri)

        header3, i3 = lang.for_header(ctx, n)
        with cb.block(header3):
            cur = lang.index_expr(nodes, i3)
            with cb.block(if_header(lang, f"{i3} + 1 < {n}")):
                assign_stmt(cb, lang, f"{cur}{lang.FIELD_OP}next", lang.index_expr(nodes, f"{i3} + 1"))
            ridx = lang.index_expr(idx_arr, i3)
            with cb.block(if_header(lang, f"{ridx} >= 0")):
                assign_stmt(cb, lang, f"{cur}{lang.FIELD_OP}random", lang.index_expr(nodes, ridx))

        head = ctx.fresh("rlhead")
        if lang.name == "python":
            cb.line(f"{head} = None")
        elif lang.name == "javascript":
            cb.line(f"let {head} = null;")
        elif lang.name == "java":
            cb.line(f"RandomListNode {head} = null;")
        elif lang.name == "cpp":
            cb.line(f"RandomListNode* {head} = nullptr;")
        with cb.block(if_header(lang, f"{n} > 0")):
            assign_stmt(cb, lang, head, lang.index_expr(nodes, "0"))

        return head

    def generate_serializer(self, cb, lang, ctx, value_expr):
        elem_adapter = self._element_adapter()

        # Pass 1: walk `.next` collecting every node, in order.
        walk = ctx.fresh("rlwalk")
        cur = ctx.fresh("rlcur")
        if lang.name == "python":
            cb.line(f"{walk} = []")
            cb.line(f"{cur} = {value_expr}")
        elif lang.name == "javascript":
            cb.line(f"let {walk} = [];")
            cb.line(f"let {cur} = {value_expr};")
        elif lang.name == "java":
            cb.line(f"List<RandomListNode> {walk} = new ArrayList<>();")
            cb.line(f"RandomListNode {cur} = {value_expr};")
        elif lang.name == "cpp":
            cb.line(f"vector<RandomListNode*> {walk};")
            cb.line(f"RandomListNode* {cur} = {value_expr};")

        from ..languages.base import while_header, negate
        with cb.block(while_header(lang, negate(lang, lang.is_null(cur)))):
            lang.append_stmt(cb, walk, cur)
            assign_stmt(cb, lang, cur, f"{cur}{lang.FIELD_OP}next")

        # Pass 2: for each node, find its random pointer's position in
        # `walk` (or -1) — O(n^2) but these lists are always small.
        out = ctx.fresh("rlout")
        if lang.name == "python":
            cb.line(f"{out} = []")
        elif lang.name == "javascript":
            cb.line(f"let {out} = [];")
        elif lang.name == "java":
            cb.line(f"List<String> {out} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {out};")

        header, i = lang.for_header(ctx, lang.length_expr(walk))
        with cb.block(header):
            node_i = lang.index_expr(walk, i)
            val_out = elem_adapter.generate_serializer(cb, lang, ctx, f"{node_i}{lang.FIELD_OP}val")

            ridx = ctx.fresh("ridx")
            declare_var(cb, lang, ridx, "-1", java_type="int", cpp_type="int")
            with cb.block(if_header(lang, negate(lang, lang.is_null(f"{node_i}{lang.FIELD_OP}random")))):
                j = ctx.fresh("j")
                header_j, j = lang.for_header(ctx, lang.length_expr(walk))
                with cb.block(header_j):
                    with cb.block(if_header(lang, f"{lang.index_expr(walk, j)} == {node_i}{lang.FIELD_OP}random")):
                        assign_stmt(cb, lang, ridx, j)

            ridx_out = ridx if lang.name in ("python", "javascript") else f"to_string({ridx})" if lang.name == "cpp" else f"String.valueOf({ridx})"
            if lang.name in ("python", "javascript"):
                lang.append_stmt(cb, out, f"[{val_out}, {ridx_out}]")
            else:
                lang.append_stmt(cb, out, f'("[" + {val_out} + "," + {ridx_out} + "]")')

        if lang.name in ("python", "javascript"):
            return out
        if lang.name == "java":
            return f'("[" + String.join(",", {out}) + "]")'
        if lang.name == "cpp":
            return f"_joinArr({out})"
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        if lang.name == "java":
            return "RandomListNode"
        if lang.name == "cpp":
            return "RandomListNode*"
        return None

    def runtime_snippets(self, lang):
        elem_adapter = self._element_adapter()
        if lang.name == "python":
            src = (
                "class RandomListNode:\n"
                "    def __init__(self, val=0, next=None, random=None):\n"
                "        self.val = val\n"
                "        self.next = next\n"
                "        self.random = random"
            )
        elif lang.name == "javascript":
            src = (
                "class RandomListNode {\n"
                "    constructor(val, next, random) {\n"
                "        this.val = (val === undefined ? 0 : val);\n"
                "        this.next = (next === undefined ? null : next);\n"
                "        this.random = (random === undefined ? null : random);\n"
                "    }\n"
                "}"
            )
        elif lang.name == "java":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "class RandomListNode {\n"
                f"    {val_type} val;\n"
                "    RandomListNode next;\n"
                "    RandomListNode random;\n"
                "    RandomListNode() {}\n"
                f"    RandomListNode({val_type} val) {{ this.val = val; }}\n"
                "}"
            )
        elif lang.name == "cpp":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "struct RandomListNode {\n"
                f"    {val_type} val;\n"
                "    RandomListNode *next;\n"
                "    RandomListNode *random;\n"
                "    RandomListNode() : val(0), next(nullptr), random(nullptr) {}\n"
                f"    RandomListNode({val_type} x) : val(x), next(nullptr), random(nullptr) {{}}\n"
                "};"
            )
        else:
            return []
        return [("RandomListNode", src)]
