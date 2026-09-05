"""Adapter interface — spec's per-family contract, generic over type shape.

An Adapter's real job is codegen: given the TypeNode it wraps, emit the
*textual* target-language statements (via `languages/*_lang.py` helpers +
`CodeBuilder`) that parse this shape off the shared line reader, or
serialize a value of this shape to the output-format text the Python-side
`comparator.py` expects back. Nesting ("vector<pair<int,int>>") is never a
new branch anywhere — each adapter recurses into `get_adapter(child_node)`
for its element/key/value/field types, so a combination nobody wrote a
special case for still Just Works.

Every adapter also reuses the *language-independent* wire format from
`serializer.py`/`comparator.py` for anything that happens Python-side
(building Judge0 stdin, comparing Judge0 stdout) — codegen only matters for
the *generated program's own* parsing/printing, which must agree with that
same wire format byte-for-byte.
"""

from ..serializer import serialize_value, deserialize_value


class Adapter:
    """Base class every family adapter extends. `node` is the TypeNode this
    adapter instance wraps."""

    def __init__(self, node):
        self.node = node

    # 1. serialize — structured value -> stdin wire text (Python-side; used
    #    to build a Judge0 submission's stdin from a stored TestCase).
    def serialize(self, value):
        return serialize_value(self.node, value)

    # 2. deserialize — stdin wire text -> structured value (Python-side;
    #    round-trip / admin-preview use).
    def deserialize(self, text):
        return deserialize_value(self.node, text)

    # 3. generate_parser(cb, lang, ctx) -> expr
    #    Emit statements (via `cb`, a CodeBuilder) that read this shape off
    #    the shared line reader in `lang`, returning the expression string
    #    that now holds the parsed value.
    def generate_parser(self, cb, lang, ctx):
        raise NotImplementedError

    # 4. generate_serializer(cb, lang, ctx, value_expr) -> expr
    #    Emit statements that build (not print) this value's OUTPUT-format
    #    text (spec §12 bracket notation) as a string expression; the
    #    top-level wrapper_generator prints exactly one such expression.
    def generate_serializer(self, cb, lang, ctx, value_expr):
        raise NotImplementedError

    # 5. generate_language_type(lang, boxed=False) -> str | None
    #    This family's static declared type in `lang` (None for dynamically
    #    typed languages, which skip declarations entirely). `boxed=True`
    #    requests the boxed/reference form (Java's `Integer` vs `int`)
    #    needed as a generic type argument — irrelevant for C++ (templates
    #    accept value types directly) and for Python/JS.
    def generate_language_type(self, lang, boxed=False):
        raise NotImplementedError

    def runtime_snippets(self, lang):
        """Zero or more (name, source) reusable definitions (ListNode,
        TreeNode, ...) this family needs hoisted once into the generated
        program. Deduplicated by name across every adapter used by a
        problem, so e.g. ListNode is defined exactly once even if it
        appears in 3 params."""
        return []


def declare_var(cb, lang, var, expr, *, java_type=None, cpp_type=None):
    """Emit `var = expr` in whichever form `lang` requires. Every adapter
    that needs to capture an expression exactly once (never re-evaluate it,
    e.g. a count read off the reader used as a loop bound) goes through
    this instead of inlining the expression directly into a loop header."""
    if lang.name == "python":
        cb.line(f"{var} = {expr}")
    elif lang.name == "javascript":
        cb.line(f"let {var} = {expr};")
    elif lang.name == "java":
        cb.line(f"{java_type} {var} = {expr};")
    elif lang.name == "cpp":
        cb.line(f"{cpp_type} {var} = {expr};")
    else:
        raise ValueError(f"Unknown language {lang.name!r}")


def assign_stmt(cb, lang, target_expr, value_expr):
    """Plain `target = value` (no re-declaration) — semicolon only for the
    brace-style languages. Used for anything that isn't a fresh var's first
    declaration (e.g. a struct field, or re-pointing a `tail` variable)."""
    if lang.brace_style:
        cb.line(f"{target_expr} = {value_expr};")
    else:
        cb.line(f"{target_expr} = {value_expr}")


def increment_stmt(cb, lang, var, by=1):
    if lang.brace_style:
        cb.line(f"{var} += {by};")
    else:
        cb.line(f"{var} += {by}")


def read_count(cb, lang, ctx, var_base="n"):
    """Read one line, parse it as an int, and capture it in a freshly named
    variable — the standard "how many elements follow" prefix every
    collection-shaped wire format starts with."""
    var = ctx.fresh(var_base)
    parsed = lang.to_int(lang.read_line_expr(ctx))
    declare_var(cb, lang, var, parsed, java_type="int", cpp_type="int")
    return var
