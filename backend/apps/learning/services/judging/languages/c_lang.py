"""C codegen primitives — the one language module in this package that
genuinely can't share the other three's "dynamically typed value / built-in
generic container" assumptions: C has no classes, no templates, and no
built-in growable array or string type.

Scope (matches the boundary the legacy execution_adapter.py's C path
already draws — see its own "2D arrays aren't supported by the C execution
path yet" comment): scalars, a flat (1D) array of a scalar/string,
linked_list<T> and binary_tree<T>/bst<T> for a scalar T. No 2D arrays,
graphs, maps, sets, pairs, or custom structs — wrapper_generator.py raises
a clear error for those rather than emitting broken C.

Every declared C-array-of-T shape (IntArray, LongArray, ..., StringArray)
is a tiny hand-rolled growable-array struct (malloc/realloc-backed),
unconditionally defined once in `reader_prelude()` regardless of whether a
given problem actually uses each one — cheap, and it means no adapter needs
per-problem snippet hoisting for these (unlike ListNode/TreeNode, which
really are conditional on the schema and stay hoisted per-adapter).

`index_expr`/`length_expr` below assume every C "container" this package
ever builds (an XArray struct, or a TreeNodePtrArray/ListNodePtrArray used
for BFS bookkeeping) shares the same `{data, size, cap}` shape — which is
why adapters (e.g. binary_tree.py's queue/nodes bookkeeping) can reuse them
generically exactly like the other three languages do, even though C has
no built-in equivalent of a Python list / Java ArrayList / C++ vector.
"""

from .base import CodeBuilder

name = "c"
brace_style = True

LIST_NODE_CLASS = "ListNode"
TREE_NODE_CLASS = "TreeNode"
FIELD_OP = "->"

_C_TYPE = {
    "int": "int", "long": "long long", "float": "float", "double": "double",
    "bool": "int", "char": "char", "string": "char*",
}

# Primitive name -> the growable-array struct name that holds a flat
# sequence of that primitive (see reader_prelude() for the struct
# definitions themselves).
ARRAY_STRUCTS = {
    "int": "IntArray", "long": "LongArray", "float": "FloatArray",
    "double": "DoubleArray", "bool": "BoolArray", "char": "CharArray", "string": "StringArray",
}


def primitive_type(pname):
    return _C_TYPE[pname]


def new_builder():
    return CodeBuilder(brace_style=True)


def index_expr(container_expr, idx_expr):
    return f"{container_expr}.data[{idx_expr}]"


def length_expr(container_expr):
    return f"{container_expr}.size"


def reader_rollback(cb):
    cb.line("_c2d_pos--;")


def string_eq(expr, literal):
    return f'(strcmp({expr}, "{literal}") == 0)'


def read_line_expr(ctx):
    return "_c2d_next()"


def to_int(expr):
    return f"atoi({expr})"


def to_long(expr):
    return f"atoll({expr})"


def to_float(expr):
    return f"(float)atof({expr})"


def to_double(expr):
    return f"atof({expr})"


def to_bool(expr):
    return f'(strcmp({expr}, "true") == 0)'


def as_string(expr):
    return expr


def to_char(expr):
    return f"{expr}[0]"


def for_header(ctx, count_expr, int_type="int"):
    var = ctx.fresh("i")
    return f"for ({int_type} {var} = 0; {var} < {count_expr}; {var}++)", var


def null_literal():
    return "NULL"


def is_null(expr):
    return f"{expr} == NULL"


def print_final(cb, expr):
    cb.line(f"printf(\"%s\\n\", {expr});")


def reader_prelude():
    return (
        "#include <stdio.h>\n"
        "#include <stdlib.h>\n"
        "#include <string.h>\n"
        "#include <stdarg.h>\n\n"
        "#define _C2D_MAX_LINES 200000\n"
        "static char* _c2d_lines[_C2D_MAX_LINES];\n"
        "static int _c2d_line_count = 0;\n"
        "static int _c2d_pos = 0;\n\n"
        "static void _c2d_load(void) {\n"
        "    static char buf[1 << 20];\n"
        "    while (fgets(buf, sizeof(buf), stdin)) {\n"
        "        size_t len = strlen(buf);\n"
        "        while (len > 0 && (buf[len - 1] == '\\n' || buf[len - 1] == '\\r')) buf[--len] = '\\0';\n"
        "        char* copy = (char*)malloc(len + 1);\n"
        "        memcpy(copy, buf, len + 1);\n"
        "        _c2d_lines[_c2d_line_count++] = copy;\n"
        "    }\n"
        "}\n\n"
        "static char* _c2d_next(void) { return _c2d_lines[_c2d_pos++]; }\n\n"
        "static char* _c2d_sprintf_dup(const char* fmt, ...) {\n"
        "    char buf[64];\n"
        "    va_list args;\n"
        "    va_start(args, fmt);\n"
        "    vsnprintf(buf, sizeof(buf), fmt, args);\n"
        "    va_end(args);\n"
        "    return strdup(buf);\n"
        "}\n\n"
        "static char* _c2d_json_quote(const char* s) {\n"
        "    size_t len = strlen(s);\n"
        "    char* out = (char*)malloc(len * 2 + 3);\n"
        "    size_t j = 0;\n"
        "    out[j++] = '\"';\n"
        "    for (size_t i = 0; i < len; i++) {\n"
        "        if (s[i] == '\"' || s[i] == '\\\\') out[j++] = '\\\\';\n"
        "        out[j++] = s[i];\n"
        "    }\n"
        "    out[j++] = '\"';\n"
        "    out[j] = '\\0';\n"
        "    return out;\n"
        "}\n\n"
        "static char* _c2d_json_quote_char(char c) {\n"
        "    char buf[2] = { c, '\\0' };\n"
        "    return _c2d_json_quote(buf);\n"
        "}\n\n"
        "static char* _c2d_join_arr(char** items, int n) {\n"
        "    size_t total = 3;\n"
        "    for (int i = 0; i < n; i++) total += strlen(items[i]) + 1;\n"
        "    char* out = (char*)malloc(total);\n"
        "    size_t pos = 0;\n"
        "    out[pos++] = '[';\n"
        "    for (int i = 0; i < n; i++) {\n"
        "        if (i) out[pos++] = ',';\n"
        "        size_t l = strlen(items[i]);\n"
        "        memcpy(out + pos, items[i], l);\n"
        "        pos += l;\n"
        "    }\n"
        "    out[pos++] = ']';\n"
        "    out[pos] = '\\0';\n"
        "    return out;\n"
        "}\n\n"
        + "\n\n".join(_array_struct_src(c_type, struct_name) for c_type, struct_name in [
            ("int", "IntArray"), ("long long", "LongArray"), ("float", "FloatArray"),
            ("double", "DoubleArray"), ("int", "BoolArray"), ("char", "CharArray"), ("char*", "StringArray"),
        ])
    )


def _array_struct_src(c_type, struct_name):
    return (
        f"typedef struct {{ {c_type}* data; int size; int cap; }} {struct_name};\n"
        f"static void {struct_name}_init({struct_name}* a) {{ a->data = NULL; a->size = 0; a->cap = 0; }}\n"
        f"static void {struct_name}_push({struct_name}* a, {c_type} v) {{\n"
        f"    if (a->size == a->cap) {{ a->cap = a->cap ? a->cap * 2 : 4; a->data = ({c_type}*)realloc(a->data, a->cap * sizeof({c_type})); }}\n"
        f"    a->data[a->size++] = v;\n"
        f"}}"
    )
