"""C++ codegen primitives. Statically typed like Java; sequences are
uniformly `std::vector<T>` (never raw arrays) for the same nesting reason.
No local compiler is available in this sandbox, so generated C++ is
verified structurally, not by an actual build — flagged in the package
README as needing a live Judge0 smoke test post-deploy.
"""

from .base import CodeBuilder

name = "cpp"
brace_style = True

LIST_NODE_CLASS = "ListNode"
TREE_NODE_CLASS = "TreeNode"
FIELD_OP = "->"


def new_object(class_name, args):
    return f"new {class_name}({', '.join(args)})"


def index_expr(container_expr, idx_expr):
    return f"{container_expr}[{idx_expr}]"


def length_expr(container_expr):
    return f"{container_expr}.size()"


def reader_rollback(cb):
    cb.line("_reader.pos -= 1;")


def string_eq(expr, literal):
    return f'{expr} == "{literal}"'

_TYPE = {"int": "int", "long": "long long", "float": "float", "double": "double",
         "bool": "bool", "char": "char", "string": "string"}


def new_builder():
    return CodeBuilder(brace_style=True)


def reader_prelude():
    return (
        "#include <bits/stdc++.h>\n"
        "using namespace std;\n\n"
        "struct _Reader {\n"
        "    vector<string> lines;\n"
        "    size_t pos = 0;\n"
        "    void load() {\n"
        "        string ln;\n"
        "        while (getline(cin, ln)) {\n"
        "            if (!ln.empty() && ln.back() == '\\r') ln.pop_back();\n"
        "            lines.push_back(ln);\n"
        "        }\n"
        "    }\n"
        "    string next() { return lines[pos++]; }\n"
        "};\n"
        "_Reader _reader;\n\n"
        "string _jsonQuote(const string& s) {\n"
        "    string out = \"\\\"\";\n"
        "    for (char c : s) {\n"
        "        if (c == '\"' || c == '\\\\') out += '\\\\';\n"
        "        out += c;\n"
        "    }\n"
        "    out += '\"';\n"
        "    return out;\n"
        "}\n\n"
        "string _joinArr(const vector<string>& items) {\n"
        "    string out = \"[\";\n"
        "    for (size_t i = 0; i < items.size(); i++) {\n"
        "        if (i) out += \",\";\n"
        "        out += items[i];\n"
        "    }\n"
        "    out += \"]\";\n"
        "    return out;\n"
        "}"
    )


def primitive_type(pname):
    return _TYPE[pname]


def read_line_expr(ctx):
    return "_reader.next()"


def to_int(expr):
    return f"stoi({expr})"


def to_long(expr):
    return f"stoll({expr})"


def to_float(expr):
    return f"stof({expr})"


def to_double(expr):
    return f"stod({expr})"


def to_bool(expr):
    return f"({expr} == \"true\")"


def as_string(expr):
    return expr


def to_char(expr):
    return f"{expr}[0]"


def for_header(ctx, count_expr, int_type="int"):
    var = ctx.fresh("i")
    return f"for ({int_type} {var} = 0; {var} < {count_expr}; {var}++)", var


def foreach_header(ctx, collection_expr, elem_type="auto"):
    var = ctx.fresh("x")
    return f"for ({elem_type} {var} : {collection_expr})", var


def new_vector(elem_type):
    return f"vector<{elem_type}>()"


def append_stmt(cb, list_expr, item_expr):
    cb.line(f"{list_expr}.push_back({item_expr});")


def null_literal():
    return "nullptr"


def is_null(expr):
    return f"{expr} == nullptr"


def print_final(cb, expr):
    cb.line(f"cout << {expr} << endl;")
