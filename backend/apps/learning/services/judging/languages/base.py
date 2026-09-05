"""Shared codegen plumbing every `*_lang.py` module and adapter builds on.

`CodeBuilder` hides the one real syntactic difference that would otherwise
force every adapter to branch on language: Python blocks are colon+indent,
C-family blocks are brace+indent. Adapters call `cb.block(header)` with a
language-appropriate header string (built by the language module) and never
think about braces/colons/indentation themselves.
"""


class CodeBuilder:
    def __init__(self, brace_style):
        """brace_style: True for C-like languages (Java/C++/JS), False for
        Python's colon+indent blocks."""
        self.brace_style = brace_style
        self.lines = []
        self.indent = 0

    def line(self, text=""):
        if text == "":
            self.lines.append("")
        else:
            self.lines.append("    " * self.indent + text)

    def block(self, header):
        return _Block(self, header)

    def render(self):
        return "\n".join(self.lines)


class _Block:
    def __init__(self, cb, header):
        self.cb = cb
        self.header = header

    def __enter__(self):
        if self.cb.brace_style:
            self.cb.line(self.header + " {")
        else:
            self.cb.line(self.header.rstrip(":") + ":")
        self.cb.indent += 1
        return self.cb

    def __exit__(self, exc_type, exc, tb):
        self.cb.indent -= 1
        if self.cb.brace_style:
            self.cb.line("}")
        return False


def if_header(lang, cond_expr):
    return f"if ({cond_expr})" if lang.brace_style else f"if {cond_expr}"


def else_header(lang):
    return "else"


def while_header(lang, cond_expr):
    return f"while ({cond_expr})" if lang.brace_style else f"while {cond_expr}"


def negate(lang, expr):
    return f"!({expr})" if lang.brace_style else f"not ({expr})"


def logical_and(lang, a, b):
    return f"{a} && {b}" if lang.brace_style else f"{a} and {b}"


class Ctx:
    """Per-generation fresh-name allocator, so nested adapters never collide
    on variable names (`i`, `i2`, `i3`, ... for loop counters at increasing
    depth; `tmp`, `tmp2`, ... for scratch values)."""

    def __init__(self):
        self._counters = {}

    def fresh(self, base):
        n = self._counters.get(base, 0) + 1
        self._counters[base] = n
        return base if n == 1 else f"{base}{n}"


class LanguageModule:
    """Interface every languages/*_lang.py module implements. Not an ABC —
    Python duck-typing is enough here and keeps each module a flat set of
    functions rather than a class hierarchy."""

    name = None
    brace_style = None  # True = brace/indent (Java/C++/JS), False = Python

    @staticmethod
    def new_builder():
        raise NotImplementedError

    @staticmethod
    def reader_prelude():
        """Source text for the shared line-reader class/object, embedded
        once per generated program regardless of how many params use it."""
        raise NotImplementedError

    @staticmethod
    def read_line_expr(ctx):
        """Returns (statements, expr) — statements to run + an expression
        yielding the next raw input line as a string."""
        raise NotImplementedError
