"""JavaScript codegen primitives. Dynamically typed like Python — parsing
produces native arrays/objects directly; output serialization for every
compound family except linked_list/binary_tree is just "hand the native
value to JSON.stringify at the top level."
"""

from .base import CodeBuilder

name = "javascript"
brace_style = True

LIST_NODE_CLASS = "ListNode"
TREE_NODE_CLASS = "TreeNode"
FIELD_OP = "."


def new_object(class_name, args):
    return f"new {class_name}({', '.join(args)})"


def index_expr(container_expr, idx_expr):
    return f"{container_expr}[{idx_expr}]"


def length_expr(container_expr):
    return f"{container_expr}.length"


def reader_rollback(cb):
    cb.line("_reader.pos -= 1;")


def string_eq(expr, literal):
    return f"{expr} === {literal!r}"


def new_builder():
    return CodeBuilder(brace_style=True)


def reader_prelude():
    return (
        "const _inputText = require('fs').readFileSync(0, 'utf8')\n"
        "    .replace(/\\r\\n/g, \"\\n\").replace(/\\r/g, \"\\n\");\n"
        "let _rawLines = _inputText.split(\"\\n\");\n"
        "if (_rawLines.length && _rawLines[_rawLines.length - 1] === \"\") { _rawLines.pop(); }\n"
        "const _reader = {\n"
        "    lines: _rawLines,\n"
        "    pos: 0,\n"
        "    next: function () { return this.lines[this.pos++]; }\n"
        "};"
    )


def read_line_expr(ctx):
    return "_reader.next()"


def to_int(expr):
    return f"parseInt({expr}, 10)"


def to_float(expr):
    return f"parseFloat({expr})"


def to_long(expr):
    return f"parseInt({expr}, 10)"


def to_double(expr):
    return f"parseFloat({expr})"


def to_bool(expr):
    return f"({expr}.trim().toLowerCase() === 'true')"


def as_string(expr):
    return expr


def to_char(expr):
    return expr


def for_header(ctx, count_expr):
    var = ctx.fresh("i")
    return f"for (let {var} = 0; {var} < {count_expr}; {var}++)", var


def foreach_header(ctx, collection_expr, elem_type=None):
    var = ctx.fresh("x")
    return f"for (const {var} of {collection_expr})", var


def new_list_expr():
    return "[]"


def append_stmt(cb, list_expr, item_expr):
    cb.line(f"{list_expr}.push({item_expr});")


def null_literal():
    return "null"


def is_null(expr):
    return f"({expr} === null)"


def print_final(cb, expr):
    cb.line(f"console.log({expr});")
