"""Canonical binary tree — LeetCode's own level-order-with-nulls array
convention: a `null` slot means "this position has no node," and (crucially)
a null node's children are never themselves listed. Reconstructing a real
tree from that flat stream needs the standard queue-based algorithm (attach
each next 1-2 tokens as the next dequeued node's left/right, enqueuing any
non-null child); serializing runs the same walk in reverse, emitting slots
only for children of nodes that actually exist.
"""

from .base import Adapter, read_count, assign_stmt, increment_stmt
from ..languages.base import if_header, else_header, while_header, negate, logical_and


def _require_c_scalar_element(node):
    if node.element.kind != "primitive" or node.element.name == "string":
        raise ValueError(f"C only supports binary_tree<T>/bst<T> for a scalar numeric T, not {node.raw!r}.")


class BinaryTreeAdapter(Adapter):
    def _element_adapter(self):
        from .registry import get_adapter
        return get_adapter(self.node.element)

    def generate_parser(self, cb, lang, ctx):
        elem_adapter = self._element_adapter()
        n = read_count(cb, lang, ctx)
        nodes = ctx.fresh("nodes")

        if lang.name == "python":
            cb.line(f"{nodes} = []")
        elif lang.name == "javascript":
            cb.line(f"let {nodes} = [];")
        elif lang.name == "java":
            cb.line(f"List<TreeNode> {nodes} = new ArrayList<>();")
        elif lang.name == "cpp":
            cb.line(f"vector<TreeNode*> {nodes};")
        elif lang.name == "c":
            _require_c_scalar_element(self.node)
            cb.line(f"TreeNodePtrArray {nodes};")
            cb.line(f"TreeNodePtrArray_init(&{nodes});")

        header, _idx = lang.for_header(ctx, n)
        with cb.block(header):
            raw = ctx.fresh("raw")
            if lang.name == "python":
                cb.line(f"{raw} = {lang.read_line_expr(ctx)}")
            elif lang.name == "javascript":
                cb.line(f"const {raw} = {lang.read_line_expr(ctx)};")
            elif lang.name == "java":
                cb.line(f"String {raw} = {lang.read_line_expr(ctx)};")
            elif lang.name == "cpp":
                cb.line(f"string {raw} = {lang.read_line_expr(ctx)};")
            elif lang.name == "c":
                cb.line(f"char* {raw} = {lang.read_line_expr(ctx)};")

            tnode = ctx.fresh("tnode")
            if lang.name == "python":
                cb.line(f"{tnode} = None")
            elif lang.name == "javascript":
                cb.line(f"let {tnode} = null;")
            elif lang.name == "java":
                cb.line(f"TreeNode {tnode} = null;")
            elif lang.name == "cpp":
                cb.line(f"TreeNode* {tnode} = nullptr;")
            elif lang.name == "c":
                cb.line(f"struct TreeNode* {tnode} = NULL;")

            with cb.block(if_header(lang, lang.string_eq(raw, "null"))):
                if not lang.brace_style:
                    cb.line("pass")  # tnode already null; Python needs an explicit body
            with cb.block(else_header(lang)):
                lang.reader_rollback(cb)
                val_expr = elem_adapter.generate_parser(cb, lang, ctx)
                if lang.name == "c":
                    cb.line(f"{tnode} = (struct TreeNode*)malloc(sizeof(struct TreeNode));")
                    cb.line(f"{tnode}->val = {val_expr};")
                    cb.line(f"{tnode}->left = NULL;")
                    cb.line(f"{tnode}->right = NULL;")
                else:
                    assign_stmt(cb, lang, tnode, lang.new_object("TreeNode", [val_expr]))
            if lang.name == "c":
                cb.line(f"TreeNodePtrArray_push(&{nodes}, {tnode});")
            else:
                lang.append_stmt(cb, nodes, tnode)

        root = ctx.fresh("root")
        if lang.name == "python":
            cb.line(f"{root} = None")
        elif lang.name == "javascript":
            cb.line(f"let {root} = null;")
        elif lang.name == "java":
            cb.line(f"TreeNode {root} = null;")
        elif lang.name == "cpp":
            cb.line(f"TreeNode* {root} = nullptr;")
        elif lang.name == "c":
            cb.line(f"struct TreeNode* {root} = NULL;")

        with cb.block(if_header(lang, f"{n} > 0")):
            assign_stmt(cb, lang, root, lang.index_expr(nodes, "0"))
            with cb.block(if_header(lang, negate(lang, lang.is_null(root)))):
                queue = ctx.fresh("queue")
                if lang.name == "python":
                    cb.line(f"{queue} = []")
                elif lang.name == "javascript":
                    cb.line(f"let {queue} = [];")
                elif lang.name == "java":
                    cb.line(f"List<TreeNode> {queue} = new ArrayList<>();")
                elif lang.name == "cpp":
                    cb.line(f"vector<TreeNode*> {queue};")
                elif lang.name == "c":
                    cb.line(f"TreeNodePtrArray {queue};")
                    cb.line(f"TreeNodePtrArray_init(&{queue});")
                if lang.name == "c":
                    cb.line(f"TreeNodePtrArray_push(&{queue}, {root});")
                else:
                    lang.append_stmt(cb, queue, root)

                idx = ctx.fresh("idx")
                qi = ctx.fresh("qi")
                if lang.name == "python":
                    cb.line(f"{idx} = 1")
                    cb.line(f"{qi} = 0")
                else:
                    cb.line(f"let {idx} = 1;" if lang.name == "javascript" else f"int {idx} = 1;")
                    cb.line(f"let {qi} = 0;" if lang.name == "javascript" else f"int {qi} = 0;")

                cond = logical_and(lang, f"{qi} < {lang.length_expr(queue)}", f"{idx} < {n}")
                with cb.block(while_header(lang, cond)):
                    cur = ctx.fresh("curnode")
                    if lang.name == "python":
                        cb.line(f"{cur} = {lang.index_expr(queue, qi)}")
                    elif lang.name == "javascript":
                        cb.line(f"const {cur} = {lang.index_expr(queue, qi)};")
                    elif lang.name == "java":
                        cb.line(f"TreeNode {cur} = {lang.index_expr(queue, qi)};")
                    elif lang.name == "cpp":
                        cb.line(f"TreeNode* {cur} = {lang.index_expr(queue, qi)};")
                    elif lang.name == "c":
                        cb.line(f"struct TreeNode* {cur} = {lang.index_expr(queue, qi)};")
                    increment_stmt(cb, lang, qi)

                    for side in ("left", "right"):
                        with cb.block(if_header(lang, f"{idx} < {n}")):
                            child = lang.index_expr(nodes, idx)
                            with cb.block(if_header(lang, negate(lang, lang.is_null(child)))):
                                assign_stmt(cb, lang, f"{cur}{lang.FIELD_OP}{side}", child)
                                if lang.name == "c":
                                    cb.line(f"TreeNodePtrArray_push(&{queue}, {child});")
                                else:
                                    lang.append_stmt(cb, queue, child)
                            increment_stmt(cb, lang, idx)

        return root

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
        elif lang.name == "c":
            _require_c_scalar_element(self.node)
            cb.line(f"StringArray {out_var};")
            cb.line(f"StringArray_init(&{out_var});")

        null_token = "None" if lang.name == "python" else ("null" if lang.name == "javascript" else '"null"')

        with cb.block(if_header(lang, negate(lang, lang.is_null(value_expr)))):
            queue = ctx.fresh("queue")
            if lang.name == "python":
                cb.line(f"{queue} = [{value_expr}]")
            elif lang.name == "javascript":
                cb.line(f"let {queue} = [{value_expr}];")
            elif lang.name == "java":
                cb.line(f"List<TreeNode> {queue} = new ArrayList<>();")
                lang.append_stmt(cb, queue, value_expr)
            elif lang.name == "cpp":
                cb.line(f"vector<TreeNode*> {queue};")
                lang.append_stmt(cb, queue, value_expr)
            elif lang.name == "c":
                cb.line(f"TreeNodePtrArray {queue};")
                cb.line(f"TreeNodePtrArray_init(&{queue});")
                cb.line(f"TreeNodePtrArray_push(&{queue}, {value_expr});")

            root_out = elem_adapter.generate_serializer(cb, lang, ctx, f"{value_expr}{lang.FIELD_OP}val")
            if lang.name == "c":
                cb.line(f"StringArray_push(&{out_var}, {root_out});")
            else:
                lang.append_stmt(cb, out_var, root_out)

            qi = ctx.fresh("qi")
            if lang.name == "python":
                cb.line(f"{qi} = 0")
            else:
                cb.line(f"let {qi} = 0;" if lang.name == "javascript" else f"int {qi} = 0;")

            with cb.block(while_header(lang, f"{qi} < {lang.length_expr(queue)}")):
                cur = ctx.fresh("curnode")
                if lang.name == "python":
                    cb.line(f"{cur} = {lang.index_expr(queue, qi)}")
                elif lang.name == "javascript":
                    cb.line(f"const {cur} = {lang.index_expr(queue, qi)};")
                elif lang.name == "java":
                    cb.line(f"TreeNode {cur} = {lang.index_expr(queue, qi)};")
                elif lang.name == "cpp":
                    cb.line(f"TreeNode* {cur} = {lang.index_expr(queue, qi)};")
                elif lang.name == "c":
                    cb.line(f"struct TreeNode* {cur} = {lang.index_expr(queue, qi)};")
                increment_stmt(cb, lang, qi)

                for side in ("left", "right"):
                    child_expr = f"{cur}{lang.FIELD_OP}{side}"
                    with cb.block(if_header(lang, negate(lang, lang.is_null(child_expr)))):
                        child_out = elem_adapter.generate_serializer(cb, lang, ctx, f"{child_expr}{lang.FIELD_OP}val")
                        if lang.name == "c":
                            cb.line(f"StringArray_push(&{out_var}, {child_out});")
                            cb.line(f"TreeNodePtrArray_push(&{queue}, {child_expr});")
                        else:
                            lang.append_stmt(cb, out_var, child_out)
                            lang.append_stmt(cb, queue, child_expr)
                    with cb.block(else_header(lang)):
                        if lang.name == "c":
                            cb.line(f"StringArray_push(&{out_var}, {null_token});")
                        else:
                            lang.append_stmt(cb, out_var, null_token)

        if lang.name in ("python", "javascript"):
            return out_var
        if lang.name == "java":
            return f'("[" + String.join(",", {out_var}) + "]")'
        if lang.name == "cpp":
            return f"_joinArr({out_var})"
        if lang.name == "c":
            return f"_c2d_join_arr({out_var}.data, {out_var}.size)"
        raise ValueError(f"Unsupported language {lang.name!r}")

    def generate_language_type(self, lang, boxed=False):
        if lang.name == "java":
            return "TreeNode"
        if lang.name == "cpp":
            return "TreeNode*"
        if lang.name == "c":
            return "struct TreeNode*"
        return None

    def runtime_snippets(self, lang):
        elem_adapter = self._element_adapter()
        if lang.name == "c":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            tree_src = (
                "struct TreeNode {\n"
                f"    {val_type} val;\n"
                "    struct TreeNode* left;\n"
                "    struct TreeNode* right;\n"
                "};"
            )
            ptrarray_src = (
                "typedef struct { struct TreeNode** data; int size; int cap; } TreeNodePtrArray;\n"
                "static void TreeNodePtrArray_init(TreeNodePtrArray* a) { a->data = NULL; a->size = 0; a->cap = 0; }\n"
                "static void TreeNodePtrArray_push(TreeNodePtrArray* a, struct TreeNode* v) {\n"
                "    if (a->size == a->cap) { a->cap = a->cap ? a->cap * 2 : 4; a->data = (struct TreeNode**)realloc(a->data, a->cap * sizeof(struct TreeNode*)); }\n"
                "    a->data[a->size++] = v;\n"
                "}"
            )
            return [("TreeNode", tree_src), ("TreeNodePtrArray", ptrarray_src)]
        if lang.name == "python":
            src = (
                "class TreeNode:\n"
                "    def __init__(self, val=0, left=None, right=None):\n"
                "        self.val = val\n"
                "        self.left = left\n"
                "        self.right = right"
            )
        elif lang.name == "javascript":
            src = (
                "class TreeNode {\n"
                "    constructor(val, left, right) {\n"
                "        this.val = (val === undefined ? 0 : val);\n"
                "        this.left = (left === undefined ? null : left);\n"
                "        this.right = (right === undefined ? null : right);\n"
                "    }\n"
                "}"
            )
        elif lang.name == "java":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "class TreeNode {\n"
                f"    {val_type} val;\n"
                "    TreeNode left;\n"
                "    TreeNode right;\n"
                "    TreeNode() {}\n"
                f"    TreeNode({val_type} val) {{ this.val = val; }}\n"
                f"    TreeNode({val_type} val, TreeNode left, TreeNode right) {{\n"
                "        this.val = val; this.left = left; this.right = right;\n"
                "    }\n"
                "}"
            )
        elif lang.name == "cpp":
            val_type = elem_adapter.generate_language_type(lang) or "int"
            src = (
                "struct TreeNode {\n"
                f"    {val_type} val;\n"
                "    TreeNode *left;\n"
                "    TreeNode *right;\n"
                "    TreeNode() : val(0), left(nullptr), right(nullptr) {}\n"
                f"    TreeNode({val_type} x) : val(x), left(nullptr), right(nullptr) {{}}\n"
                f"    TreeNode({val_type} x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {{}}\n"
                "};"
            )
        else:
            return []
        return [("TreeNode", src)]
