"""DoublyLinkedListNode<T> — a linked list with both `next` and `prev`
pointers. Wire format is identical to a plain linked_list<T> (count N,
then N val blocks, in list order — see serializer.py, which routes this
kind through the exact same branches as linked_list for that reason);
construction just additionally wires up `prev` as each node is appended,
in the same single pass."""

from .base import Adapter, read_count, assign_stmt
from ..languages.base import if_header, else_header, while_header, negate


class DoublyLinkedListNodeAdapter(Adapter):
    def _element_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def generate_parser(self, cb, lang, ctx):
        elem_adapter = self._element_adapter()
        n = read_count(cb, lang, ctx)
        head = ctx.fresh("dhead")
        tail = ctx.fresh("dtail")

        if lang.name == "python":
            cb.line(f"{head} = None")
            cb.line(f"{tail} = None")
        elif lang.name == "javascript":
            cb.line(f"let {head} = null;")
            cb.line(f"let {tail} = null;")
        elif lang.name == "java":
            cb.line(f"DoublyLinkedListNode {head} = null;")
            cb.line(f"DoublyLinkedListNode {tail} = null;")
        elif lang.name == "cpp":
            cb.line(f"DoublyLinkedListNode* {head} = nullptr;")
            cb.line(f"DoublyLinkedListNode* {tail} = nullptr;")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            val_expr = elem_adapter.generate_parser(cb, lang, ctx)
            node_var = ctx.fresh("dnode")
            new_expr = lang.new_object("DoublyLinkedListNode", [val_expr])
            if lang.name == "python":
                cb.line(f"{node_var} = {new_expr}")
            elif lang.name == "javascript":
                cb.line(f"const {node_var} = {new_expr};")
            elif lang.name == "java":
                cb.line(f"DoublyLinkedListNode {node_var} = {new_expr};")
            elif lang.name == "cpp":
                cb.line(f"DoublyLinkedListNode* {node_var} = {new_expr};")

            with cb.block(if_header(lang, lang.is_null(head))):
                assign_stmt(cb, lang, head, node_var)
            with cb.block(else_header(lang)):
                assign_stmt(cb, lang, f"{tail}{lang.FIELD_OP}next", node_var)
                assign_stmt(cb, lang, f"{node_var}{lang.FIELD_OP}prev", tail)
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
            cb.line(f"DoublyLinkedListNode {cur} = {value_expr};")
        elif lang.name == "cpp":
            cb.line(f"vector<string> {out_var};")
            cb.line(f"DoublyLinkedListNode* {cur} = {value_expr};")

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
            return "DoublyLinkedListNode"
        if lang.name == "cpp":
            return "DoublyLinkedListNode*"
        return None

    def runtime_snippets(self, lang):
        elem_adapter = self._element_adapter()
        if lang.name == "python":
            src = (
                "class DoublyLinkedListNode:\n"
                "    def __init__(self, val=0, prev=None, next=None):\n"
                "        self.val = val\n"
                "        self.prev = prev\n"
                "        self.next = next"
            )
        elif lang.name == "javascript":
            src = (
                "class DoublyLinkedListNode {\n"
                "    constructor(val, prev, next) {\n"
                "        this.val = (val === undefined ? 0 : val);\n"
                "        this.prev = (prev === undefined ? null : prev);\n"
                "        this.next = (next === undefined ? null : next);\n"
                "    }\n"
                "}"
            )
        elif lang.name == "java":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "class DoublyLinkedListNode {\n"
                f"    {val_type} val;\n"
                "    DoublyLinkedListNode prev;\n"
                "    DoublyLinkedListNode next;\n"
                "    DoublyLinkedListNode() {}\n"
                f"    DoublyLinkedListNode({val_type} val) {{ this.val = val; }}\n"
                "}"
            )
        elif lang.name == "cpp":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "struct DoublyLinkedListNode {\n"
                f"    {val_type} val;\n"
                "    DoublyLinkedListNode *prev;\n"
                "    DoublyLinkedListNode *next;\n"
                "    DoublyLinkedListNode() : val(0), prev(nullptr), next(nullptr) {}\n"
                f"    DoublyLinkedListNode({val_type} x) : val(x), prev(nullptr), next(nullptr) {{}}\n"
                "};"
            )
        else:
            return []
        return [("DoublyLinkedListNode", src)]
