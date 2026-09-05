"""Python codegen primitives. Dynamically typed, so parsing produces native
Python values directly (no declared types), and output serialization for
every compound family except linked_list/binary_tree is just "the value is
already the right native shape — hand it to json.dumps at the top level."
"""

from .base import CodeBuilder

name = "python"
brace_style = False

LIST_NODE_CLASS = "ListNode"
TREE_NODE_CLASS = "TreeNode"
FIELD_OP = "."


def new_object(class_name, args):
    return f"{class_name}({', '.join(args)})"


def index_expr(container_expr, idx_expr):
    return f"{container_expr}[{idx_expr}]"


def length_expr(container_expr):
    return f"len({container_expr})"


def reader_rollback(cb):
    cb.line("_reader.pos -= 1")


def string_eq(expr, literal):
    return f"{expr} == {literal!r}"


def new_builder():
    return CodeBuilder(brace_style=False)


def reader_prelude():
    return (
        "import sys, json\n\n"
        "class _Reader:\n"
        "    def __init__(self, text):\n"
        "        text = text.replace(\"\\r\\n\", \"\\n\").replace(\"\\r\", \"\\n\")\n"
        "        self.lines = text.split(\"\\n\")\n"
        "        if self.lines and self.lines[-1] == \"\":\n"
        "            self.lines.pop()\n"
        "        self.pos = 0\n\n"
        "    def next(self):\n"
        "        line = self.lines[self.pos]\n"
        "        self.pos += 1\n"
        "        return line\n\n"
        "_reader = _Reader(sys.stdin.read())"
    )


def read_line_expr(ctx):
    return "_reader.next()"


def to_int(expr):
    return f"int({expr})"


def to_float(expr):
    return f"float({expr})"


def to_long(expr):
    return f"int({expr})"


def to_double(expr):
    return f"float({expr})"


def to_bool(expr):
    return f"({expr}.strip().lower() == 'true')"


def as_string(expr):
    return expr


def to_char(expr):
    return expr


def for_header(ctx, count_expr):
    var = ctx.fresh("i")
    return f"for {var} in range({count_expr})", var


def foreach_header(ctx, collection_expr, elem_type=None):
    var = ctx.fresh("x")
    return f"for {var} in {collection_expr}", var


def new_list_expr():
    return "[]"


def append_stmt(cb, list_expr, item_expr):
    cb.line(f"{list_expr}.append({item_expr})")


def null_literal():
    return "None"


def is_null(expr):
    return f"{expr} is None"


def print_final(cb, expr):
    cb.line(f"print({expr})")
