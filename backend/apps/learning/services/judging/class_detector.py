"""Detects which class in a student's submission actually implements the
problem's `function_name` — the platform never requires a specific class
name (e.g. `Solution`). Every language wrapper used to hardcode `Solution`;
now `wrapper_generator.py` calls `detect_class_name()` once per submission
and splices in whatever it finds.

This is necessarily a best-effort, source-text scan rather than true
reflection: Java and C++ have no runtime introspection available inside
the sandboxed generated program, and JavaScript's top-level `class Foo {}`
declarations aren't reliably enumerable at runtime either (they don't
become properties of any object we could inspect generically). Python
*could* do this at runtime via its own module namespace, but scanning the
source text the same way as the other three keeps one predictable code
path instead of a language-specific exception, and is not meaningfully
less reliable for the common "one class, matching method" case this
covers.

Falls back to the conventional name `Solution` whenever detection finds
zero or more-than-one candidate — so existing submissions that already
use `class Solution` (the overwhelming majority) are completely
unaffected; this only matters for a submission that names its class
something else.
"""

import re

_BRACE_CLASS_RE = {
    "javascript": re.compile(r"\bclass\s+(\w+)\b[^{]*\{"),
    "java": re.compile(r"\bclass\s+(\w+)\b[^{]*\{"),
    "cpp": re.compile(r"\b(?:class|struct)\s+(\w+)\b[^{]*\{"),
}
_PYTHON_CLASS_RE = re.compile(r"^(\s*)class\s+(\w+)\s*(?:\([^)]*\))?\s*:")

_FALLBACK_CLASS_NAME = "Solution"


def detect_class_name(lang_name, solution_code, func_name):
    """Returns the single class name in `solution_code` that defines a
    method/def named `func_name`, or "Solution" if none or more than one
    match (ambiguous — safer to fall back than guess wrong)."""
    if lang_name == "python":
        candidates = [
            name for name, body in _python_class_bodies(solution_code)
            if re.search(rf"\bdef\s+{re.escape(func_name)}\s*\(", body)
        ]
    else:
        pattern = _BRACE_CLASS_RE.get(lang_name)
        if pattern is None:
            return _FALLBACK_CLASS_NAME
        candidates = []
        for m in pattern.finditer(solution_code):
            class_name = m.group(1)
            body_start = m.end() - 1  # position of the opening '{'
            body_end = _match_brace(solution_code, body_start)
            if body_end is None:
                continue
            body = solution_code[body_start:body_end]
            # A method *definition* of func_name, not a call to it
            # (`.func_name(` or a bare word followed by '('), guarded
            # against false positives from an unrelated `x.func_name(...)`
            # call by requiring no preceding '.' or word character.
            if re.search(rf"(?<![.\w]){re.escape(func_name)}\s*\(", body):
                candidates.append(class_name)

    if len(candidates) == 1:
        return candidates[0]
    return _FALLBACK_CLASS_NAME


def _match_brace(text, open_pos):
    depth = 0
    for i in range(open_pos, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return i
    return None


def _python_class_bodies(source_code):
    """[(class_name, body_text), ...] — body bounded by indentation
    (everything more-indented than the `class` line itself), the same
    convention Python's own grammar uses."""
    lines = source_code.split("\n")
    results = []
    i = 0
    while i < len(lines):
        m = _PYTHON_CLASS_RE.match(lines[i])
        if not m:
            i += 1
            continue
        indent = len(m.group(1))
        class_name = m.group(2)
        body_lines = []
        j = i + 1
        while j < len(lines):
            line = lines[j]
            if line.strip() == "":
                body_lines.append(line)
                j += 1
                continue
            cur_indent = len(line) - len(line.lstrip())
            if cur_indent <= indent:
                break
            body_lines.append(line)
            j += 1
        results.append((class_name, "\n".join(body_lines)))
        i = j
    return results
