"""Java codegen primitives. Statically typed, so every adapter must emit a
real declared type (via `type_name`) as well as real parsing/serializing
statements — there is no dynamic "hand the runtime a spec and get back a
native value" shortcut here. Sequences are uniformly `List<Boxed>` (never
raw arrays) so arbitrary nesting (`List<List<Integer>>`) never runs into
Java's generic-array-creation restrictions; that's this framework's own
canonical convention, not a claim about idiomatic LeetCode signatures.
"""

from .base import CodeBuilder

name = "java"
brace_style = True

LIST_NODE_CLASS = "ListNode"
TREE_NODE_CLASS = "TreeNode"
FIELD_OP = "."


def new_object(class_name, args):
    return f"new {class_name}({', '.join(args)})"


def index_expr(container_expr, idx_expr):
    return f"{container_expr}.get({idx_expr})"


def length_expr(container_expr):
    return f"{container_expr}.size()"


def reader_rollback(cb):
    cb.line("_Reader.pos -= 1;")


def string_eq(expr, literal):
    return f'{expr}.equals("{literal}")'

_UNBOXED = {"int": "int", "long": "long", "float": "float", "double": "double",
            "bool": "boolean", "char": "char", "string": "String"}
_BOXED = {"int": "Integer", "long": "Long", "float": "Float", "double": "Double",
          "bool": "Boolean", "char": "Character", "string": "String"}


def new_builder():
    return CodeBuilder(brace_style=True)


def reader_prelude():
    return (
        "import java.util.*;\n"
        "import java.io.*;\n\n"
        "class _Reader {\n"
        "    static List<String> lines = new ArrayList<>();\n"
        "    static int pos = 0;\n"
        "    static void load() throws IOException {\n"
        "        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n"
        "        String ln;\n"
        "        while ((ln = br.readLine()) != null) lines.add(ln);\n"
        "    }\n"
        "    static String next() { return lines.get(pos++); }\n"
        "}\n\n"
        "class _Json {\n"
        "    static String quote(String s) {\n"
        "        StringBuilder sb = new StringBuilder(\"\\\"\");\n"
        "        for (char c : s.toCharArray()) {\n"
        "            if (c == '\"' || c == '\\\\') sb.append('\\\\');\n"
        "            sb.append(c);\n"
        "        }\n"
        "        sb.append('\"');\n"
        "        return sb.toString();\n"
        "    }\n"
        "}"
    )


def primitive_unboxed(pname):
    return _UNBOXED[pname]


def primitive_boxed(pname):
    return _BOXED[pname]


def read_line_expr(ctx):
    return "_Reader.next()"


def to_int(expr):
    return f"Integer.parseInt({expr})"


def to_long(expr):
    return f"Long.parseLong({expr})"


def to_float(expr):
    return f"Float.parseFloat({expr})"


def to_double(expr):
    return f"Double.parseDouble({expr})"


def to_bool(expr):
    return f"{expr}.trim().equalsIgnoreCase(\"true\")"


def as_string(expr):
    return expr


def to_char(expr):
    return f"{expr}.charAt(0)"


def for_header(ctx, count_expr, int_type="int"):
    var = ctx.fresh("i")
    return f"for ({int_type} {var} = 0; {var} < {count_expr}; {var}++)", var


def foreach_header(ctx, collection_expr, elem_type="Object"):
    var = ctx.fresh("x")
    return f"for ({elem_type} {var} : {collection_expr})", var


def new_arraylist(elem_type):
    return f"new ArrayList<{elem_type}>()"


def append_stmt(cb, list_expr, item_expr):
    cb.line(f"{list_expr}.add({item_expr});")


def null_literal():
    return "null"


def is_null(expr):
    return f"{expr} == null"


def print_final(cb, expr):
    cb.line(f"System.out.println({expr});")
