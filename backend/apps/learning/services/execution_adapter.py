from __future__ import annotations

import ast
import json
import re

from . import param_types


# ── Execution model constants ─────────────────────────────────────────────────
# These define how the engine passes test-case input to the submitted code.
EXEC_AUTO        = "auto"        # resolve at runtime
EXEC_STDIN       = "stdin"       # user reads stdin / prints to stdout — no driver needed
EXEC_FUNCTION    = "function"    # user defines a function; engine generates driver
EXEC_CLASS       = "class"       # user defines a class; engine instantiates and calls methods
EXEC_INTERACTIVE = "interactive" # judge ↔ program exchange (future)

# Regex patterns that indicate the code already has its own entrypoint.
# If matched → treat as EXEC_STDIN (no driver injection).
_ENTRYPOINT_PATTERNS: dict[str, list[str]] = {
    "Python":     [r'if\s+__name__\s*==\s*["\']__main__["\']'],
    "Java":       [r'public\s+static\s+void\s+main\s*\(\s*String'],
    "C":          [r'\bint\s+main\s*\('],
    "C++":        [r'\bint\s+main\s*\('],
    "Go":         [r'\bfunc\s+main\s*\(\s*\)'],
    "Rust":       [r'\bfn\s+main\s*\(\s*\)'],
    "Kotlin":     [r'\bfun\s+main\s*\('],
    "Swift":      [r'\bfunc\s+main\s*\(', r'@main'],
}


def build_function_name_candidates(slug: str, source_code: str = "") -> list[str]:
    """Build function name candidates from slug and extract from source code."""
    parts = [part for part in (slug or "").split("-") if part]
    if not parts:
        candidates = []
    else:
        camel_case = parts[0] + "".join(part.capitalize() for part in parts[1:])
        snake_case = "_".join(parts)
        pascal_case = "".join(part.capitalize() for part in parts)
        compact = "".join(parts)

        candidates = []
        for name in (camel_case, snake_case, pascal_case, compact):
            if name and name not in candidates:
                candidates.append(name)
    
    # Also extract actual function names from source code based on common patterns
    if source_code:
        patterns = [
            r'def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',             # Python
            r'func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',            # Go, Swift
            r'fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',              # Rust
            r'function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',        # JS, PHP
            r'(?:public|private|static|internal)\s+(?:[\w<>[\]]+\s+)+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(', # Java, C#, C++
            r'fun\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(',             # Kotlin
            # C++ method inside a class body reached via a bare "public:"
            # access specifier (no modifier keyword on the method's own line),
            # e.g. "vector<int> twoSum(vector<int>& nums, int target) {"
            r'(?:vector<[^;{}]*>&?|deque<[^;{}]*>&?|stack<[^;{}]*>&?|queue<[^;{}]*>&?|priority_queue<[^;{}]*>&?|'
            r'unordered_(?:map|set)<[^;{}]*>&?|pair<[^;{}]*>&?|tuple<[^;{}]*>&?|string&?|bool|char\*?|'
            r'int|long(?:\s+long)?|float|double|void|auto|[A-Za-z_]\w*\*)\s+'
            r'([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;{}]*\)\s*(?:const\s*)?\{',
        ]
        for pattern in patterns:
            found_functions = re.findall(pattern, source_code)
            for func_name in found_functions:
                if func_name not in candidates and not func_name.startswith('__') and func_name != "main":
                    candidates.append(func_name)
    
    return candidates


def clean_expected_output(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    if not lines:
        return ""

    for noisy_prefix in ("output:", "explanation:"):
        if any(line.lower().startswith(noisy_prefix) for line in lines[1:]):
            return lines[0]

    return cleaned


def _extract_primary_expected(value: str) -> str:
    """
    For problems like removeDuplicates where expected output is stored as
    '2, nums = [1,2]' or '2\nnums = [1,2]', extract just the primary return value.

    Rules:
    - If the value contains ', <identifier> =' pattern after the first token,
      return only the first token (the actual return value).
    - If the value is a plain number or array, return as-is.
    """
    import re
    cleaned = str(value or "").strip()
    if not cleaned:
        return cleaned

    # Pattern: "2, nums = [1,2]" or "5, nums = [0,1,2,3,4]"
    # Extract just the first part before ", <word> ="
    match = re.match(r'^([^,\n]+?)(?:,\s*\w+\s*=|\n)', cleaned)
    if match:
        return match.group(1).strip()

    return cleaned




def _coerce_literal(value: str):
    candidate = value.strip()
    if not candidate:
        return ""

    for parser_input in (
        candidate,
        re.sub(r"\btrue\b", "True", re.sub(r"\bfalse\b", "False", re.sub(r"\bnull\b", "None", candidate))),
    ):
        try:
            return ast.literal_eval(parser_input)
        except Exception:
            continue

    return candidate


def _coerce_whitespace_rows(raw_input: str):
    """Parse classic judge input rows like:

      3 3
      1 2 3
      4 5 6

    into nested lists when every non-empty row is simple scalar tokens. This
    keeps stdin-style DS cases usable for function wrappers without requiring
    staff to author JSON.
    """
    lines = [line.strip() for line in str(raw_input or "").splitlines() if line.strip()]
    if not lines:
        return []

    def atom(token: str):
        lowered = token.lower()
        if lowered in {"null", "none", "nil"}:
            return None
        if lowered == "true":
            return True
        if lowered == "false":
            return False
        try:
            return int(token)
        except ValueError:
            pass
        try:
            return float(token)
        except ValueError:
            return token

    rows = []
    for line in lines:
        if any(ch in line for ch in "[]{}=,"):
            return None
        tokens = line.split()
        if not tokens:
            continue
        rows.append([atom(token) for token in tokens])
    return rows


def _split_top_level_arguments(raw_input: str) -> list[str]:
    parts = []
    current = []
    depth = 0
    quote = None
    escaped = False

    for char in raw_input:
        if quote:
            current.append(char)
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue

        if char in {"'", '"'}:
            quote = char
            current.append(char)
            continue

        if char in "([{":
            depth += 1
            current.append(char)
            continue

        if char in ")]}":
            depth = max(depth - 1, 0)
            current.append(char)
            continue

        if (char == "," or char == "\n") and depth == 0:
            part = "".join(current).strip()
            if part:
                parts.append(part)
            current = []
            continue

        current.append(char)

    tail = "".join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def parse_argument_list(raw_input: str):
    """Parse argument list from raw input string.

    Handles three formats:
      - Named args:  "nums = [2,7], target = 9"  →  [[2,7], 9]
      - Named+newline: "nums = [2,7]\ntarget = 9" →  [[2,7], 9]
      - Plain values: "[2,7]\n9"                  →  [[2,7], 9]
      - Single value: "[-2,1,3]"                  →  [-2,1,3]

    Returns a list of arguments. For a single list argument (e.g. 'adjList = [...]'),
    returns the list directly without extra wrapping.
    """
    cleaned = str(raw_input or "").strip()
    if not cleaned:
        return []

    if "=" not in cleaned:
        parsed = _coerce_literal(cleaned)

        # Single list arg (e.g. maxSubArray) — return as-is so caller unpacks correctly
        if isinstance(parsed, list):
            return parsed

        whitespace_rows = _coerce_whitespace_rows(cleaned)
        if whitespace_rows:
            if "\n" not in cleaned:
                return whitespace_rows[0]
            if any(len(row) > 1 for row in whitespace_rows):
                return whitespace_rows

        # Multi-line plain values without "=" (e.g. "[2,7,11,15]\n9")
        if "\n" in cleaned:
            lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
            if len(lines) > 1:
                return [_coerce_literal(line) for line in lines]

        # Single scalar or unparseable string
        return [parsed]

    values = []
    parts = list(_split_top_level_arguments(cleaned))
    for part in parts:
        if "=" not in part:
            values.append(_coerce_literal(part))
            continue
        _, raw_value = part.split("=", 1)
        values.append(_coerce_literal(raw_value))

    # If only one value and it's a list, return it directly (not wrapped in another list)
    if len(values) == 1:
        return values[0] if isinstance(values[0], list) else values

    return values


def _canonicalize_numbers(obj):
    """Recursively collapse whole-number floats to int (5.0 -> 5) so that
    numerically-equal answers compare equal regardless of which language's
    wrapper produced them (Python/Java emit "5.0" for a float, C++ emits
    "5" for the same value via ostringstream) or whether the expected
    output was authored as "5" vs "5.0"."""
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float) and obj.is_integer():
        return int(obj)
    if isinstance(obj, list):
        return [_canonicalize_numbers(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _canonicalize_numbers(v) for k, v in obj.items()}
    return obj


def normalize_comparable_output(value: str) -> str:
    """Normalize output for comparison without aggressive cleaning."""
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""

    # Strip annotation suffixes like ", nums = [1,2]" from expected outputs
    cleaned = _extract_primary_expected(cleaned)

    # If it's already a valid JSON array/object, return as-is (compact)
    if (cleaned.startswith("[") and cleaned.endswith("]")) or \
       (cleaned.startswith("{") and cleaned.endswith("}")):
        try:
            parsed = json.loads(cleaned)
            return json.dumps(_canonicalize_numbers(parsed), separators=(",", ":"), ensure_ascii=False)
        except json.JSONDecodeError:
            pass

    # Try to parse as a literal first
    parsed = _coerce_literal(cleaned)

    if isinstance(parsed, str):
        # Space-separated numeric tokens are a legitimate legacy stdout
        # convention (e.g. "1 2 3" meaning an array) — safe to normalize as
        # a list regardless of exact spacing. Anything else is treated as
        # literal text and must NOT have its internal whitespace touched:
        # collapsing multiple/leading/trailing spaces here would silently
        # turn a correct answer to a whitespace-sensitive problem (Text
        # Justification, pattern printing, ...) into a false Wrong Answer.
        if re.fullmatch(r"-?\d+(?:\s+-?\d+)+", parsed):
            values = [int(part) for part in parsed.split()]
            return json.dumps(values, separators=(",", ":"), ensure_ascii=False)
        if re.fullmatch(r"-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?)+", parsed):
            values = [float(part) for part in parsed.split()]
            return json.dumps(_canonicalize_numbers(values), separators=(",", ":"), ensure_ascii=False)
        return parsed
    if isinstance(parsed, (list, dict, bool, int, float)) or parsed is None:
        return json.dumps(_canonicalize_numbers(parsed), separators=(",", ":"), ensure_ascii=False)
    return cleaned


def _parse_typed_value(raw: str):
    cleaned = str(raw or "").strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return _coerce_literal(cleaned)


def _values_equal_typed(actual, expected, return_type: str, float_tol: float) -> bool:
    dims = param_types.array_dimensions(return_type)
    base = param_types.base_scalar_type(return_type)

    if dims > 0:
        if not isinstance(actual, list) or not isinstance(expected, list):
            return False
        if len(actual) != len(expected):
            return False
        inner_type = base + "[]" * (dims - 1)
        return all(_values_equal_typed(a, e, inner_type, float_tol) for a, e in zip(actual, expected))

    if base in ("float", "double"):
        try:
            return abs(float(actual) - float(expected)) <= float_tol
        except (TypeError, ValueError):
            return False
    if base == "int":
        try:
            return int(actual) == int(expected)
        except (TypeError, ValueError):
            return False
    if base == "boolean":
        return bool(actual) == bool(expected)
    if base == "string":
        return str(actual) == str(expected)
    if base == "GraphNode":
        # Serialized as an adjacency list indexed by node value (position IS
        # meaningful — see __c2d_from_graph), but the neighbor order WITHIN
        # each node's own list isn't semantically meaningful for an
        # undirected graph, so compare each node's neighbor set unordered.
        if not isinstance(actual, list) or not isinstance(expected, list) or len(actual) != len(expected):
            return False
        return all(
            isinstance(a, list) and isinstance(e, list) and sorted(a) == sorted(e)
            for a, e in zip(actual, expected)
        )
    return actual == expected


def compare_typed_output(actual_raw: str, expected_raw: str, return_type: str, *, float_tol: float = 1e-6) -> bool:
    """Type-aware comparison used only when problem.param_schema is present
    (see normalize_comparable_output for the untouched heuristic-path
    comparison used by every non-schema problem). Never raises — a parse
    mismatch is just a normal Wrong Answer, not a 500."""
    try:
        actual = _parse_typed_value(actual_raw)
        expected = _parse_typed_value(expected_raw)
        return _values_equal_typed(actual, expected, return_type, float_tol)
    except Exception:
        return False


def compare_design_output(actual_raw: str, expected_raw: str, schema: dict, operations: list, *, float_tol: float = 1e-6) -> bool:
    """Type-aware comparison for design/OOP problems — each position in the
    output array can have a DIFFERENT return type (one per operation in the
    replayed sequence), unlike a function problem's single uniform
    return_type, so this looks up each operation's declared type from
    schema['methods'] rather than taking one type for the whole array."""
    try:
        actual = json.loads(actual_raw)
        expected = json.loads(expected_raw)
    except (json.JSONDecodeError, TypeError):
        return False
    if not isinstance(actual, list) or not isinstance(expected, list) or len(actual) != len(expected):
        return False

    methods = schema.get("methods", {})
    for i, (a, e) in enumerate(zip(actual, expected)):
        op = operations[i] if i < len(operations) else None
        return_type = methods.get(op, {}).get("return_type", "") if op else ""
        if return_type in ("float", "double"):
            try:
                if abs(float(a) - float(e)) > float_tol:
                    return False
            except (TypeError, ValueError):
                return False
        elif a != e:
            return False
    return True


def _looks_like_python_function_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code:
        return True
    for name in candidates:
        if f"def {name}(" in source_code:
            return True
    # Also check for any function definition at all
    if re.search(r'def\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(', source_code):
        return True
    return False


def _looks_like_java_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code or "public class" in source_code:
        return True
    # Check for method definitions
    for name in candidates:
        if re.search(rf'\s+{re.escape(name)}\s*\([^)]*\)\s*{{', source_code):
            return True
    return False


def _looks_like_c_solution(source_code: str, candidates: list[str]) -> bool:
    # Check for C function definitions
    for name in candidates:
        if re.search(rf'\b(?:int|long|float|double|char|void|bool)\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Also check for any function pattern
    if re.search(r'\b(?:int|long|float|double|char|void)\s+\w+\s*\([^)]*\)\s*\{', source_code):
        return True
    return False


def _looks_like_csharp_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code or "public class" in source_code or "static class" in source_code:
        return True
    # Check for method definitions
    for name in candidates:
        if re.search(rf'\s+(?:public|private|static|internal)?\s*{re.escape(name)}\s*\([^)]*\)', source_code):
            return True
    return False


def _looks_like_go_solution(source_code: str, candidates: list[str]) -> bool:
    if "package main" in source_code:
        return True
    for name in candidates:
        if re.search(rf'func\s+(?:\([^)]*\)\s*)?{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any func definition
    if re.search(r'func\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_rust_solution(source_code: str, candidates: list[str]) -> bool:
    if "fn main(" in source_code:
        return True
    for name in candidates:
        if re.search(rf'fn\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any fn definition
    if re.search(r'fn\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_kotlin_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code or "fun main(" in source_code:
        return True
    for name in candidates:
        if re.search(rf'fun\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any fun definition
    if re.search(r'fun\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_ruby_solution(source_code: str, candidates: list[str]) -> bool:
    for name in candidates:
        if re.search(rf'def\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any def
    if re.search(r'def\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_php_solution(source_code: str, candidates: list[str]) -> bool:
    if "<?php" in source_code or "<?" in source_code:
        return True
    for name in candidates:
        if re.search(rf'function\s+{re.escape(name)}\s*\(', source_code):
            return True
    return False


def _looks_like_swift_solution(source_code: str, candidates: list[str]) -> bool:
    if "func main(" in source_code:
        return True
    for name in candidates:
        if re.search(rf'func\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any func definition
    if re.search(r'func\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_bash_solution(source_code: str, candidates: list[str]) -> bool:
    if "#!/bin/bash" in source_code or "#!/bin/sh" in source_code:
        return True
    # Check for function definitions
    if re.search(r'\w+\s*\(\s*\)\s*\{', source_code):
        return True
    return False


def _looks_like_elixir_solution(source_code: str, candidates: list[str]) -> bool:
    if "defmodule" in source_code:
        return True
    for name in candidates:
        if re.search(rf'def\s+{re.escape(name)}', source_code):
            return True
    # Check for any def
    if re.search(r'def\s+\w+', source_code):
        return True
    return False


def _looks_like_erlang_solution(source_code: str, candidates: list[str]) -> bool:
    if "-module(" in source_code:
        return True
    for name in candidates:
        if re.search(rf'{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any function export
    if re.search(r'-export\s*\[', source_code):
        return True
    return False


def _looks_like_fsharp_solution(source_code: str, candidates: list[str]) -> bool:
    if "let " in source_code:
        for name in candidates:
            if re.search(rf'let\s+{re.escape(name)}\s+', source_code):
                return True
        # Check for any let function
        if re.search(r'let\s+\w+\s+', source_code):
            return True
    return False


def _looks_like_groovy_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code or "def " in source_code:
        return True
    for name in candidates:
        if re.search(rf'def\s+{re.escape(name)}\s*\(', source_code):
            return True
    return False


def _looks_like_objective_c_solution(source_code: str, candidates: list[str]) -> bool:
    if "@implementation" in source_code or "int main(" in source_code:
        return True
    for name in candidates:
        if re.search(rf'^\s*[-+]\s*\([^)]*\)\s*{re.escape(name)}', source_code, re.MULTILINE):
            return True
    return False


def _looks_like_r_solution(source_code: str, candidates: list[str]) -> bool:
    # R function definitions
    for name in candidates:
        if re.search(rf'{re.escape(name)}\s*<-\s*function\s*\(', source_code):
            return True
    # Check for any function definition
    if re.search(r'\w+\s*<-\s*function\s*\(', source_code):
        return True
    return False


def _looks_like_haskell_solution(source_code: str, candidates: list[str]) -> bool:
    # Haskell function definitions (name :: Type or name params = ...)
    for name in candidates:
        if re.search(rf'{re.escape(name)}\s*::', source_code) or re.search(rf'^{re.escape(name)}\s+', source_code):
            return True
    # Check for any function pattern
    if re.search(r'^\w+\s*::', source_code, re.MULTILINE):
        return True
    return False


def _looks_like_lua_solution(source_code: str, candidates: list[str]) -> bool:
    # Lua function definitions: function name( or local function name(
    for name in candidates:
        if re.search(rf'function\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any function
    if re.search(r'function\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_perl_solution(source_code: str, candidates: list[str]) -> bool:
    # Perl subroutine definitions: sub name { or sub name(
    for name in candidates:
        if re.search(rf'sub\s+{re.escape(name)}\s*\{{', source_code) or re.search(rf'sub\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any sub
    if re.search(r'sub\s+\w+\s*[\{(]', source_code):
        return True
    return False


def _looks_like_scala_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code or "object Solution" in source_code:
        return True
    # Check for def definitions
    for name in candidates:
        if re.search(rf'def\s+{re.escape(name)}\s*\(', source_code):
            return True
    # Check for any def
    if re.search(r'def\s+\w+\s*\(', source_code):
        return True
    return False


def _looks_like_cpp_solution(source_code: str, candidates: list[str]) -> bool:
    if "class Solution" in source_code:
        return True
    # Check for function definitions matching a known candidate name
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\([^)]*\)\s*{{', source_code):
            return True
    # Broad fallback: any C++-shaped function/method declaration at all
    # (return type + name + parens + brace), so a LeetCode-style submission
    # is still recognized even when the function name wasn't guessable from
    # the problem slug and the class-body method sits after a bare
    # "public:" access specifier the candidate-extraction regex can't see.
    if re.search(
        r'\b(?:void|bool|char|int|long|float|double|auto|string|vector<[^;{}]*>|deque<[^;{}]*>|'
        r'stack<[^;{}]*>|queue<[^;{}]*>|priority_queue<[^;{}]*>|unordered_(?:map|set)<[^;{}]*>|'
        r'pair<[^;{}]*>|tuple<[^;{}]*>|[A-Za-z_]\w*\*)\s*&?\s+'
        r'[a-zA-Z_]\w*\s*\([^;{}]*\)\s*\{',
        source_code,
    ):
        return True
    return False





def _looks_like_javascript_solution(source_code: str, candidates: list[str]) -> bool:
    for name in candidates:
        # Check for: function name(, const name =, let name =, var name =, name = function, name = ( =>
        patterns = [
            rf'function\s+{re.escape(name)}\s*\(',
            rf'(?:const|let|var)\s+{re.escape(name)}\s*=\s*(?:function|\(|\w+)',
            rf'{re.escape(name)}\s*=\s*(?:function|\()',
        ]
        for pattern in patterns:
            if re.search(pattern, source_code):
                return True
    return False


def _build_java_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Java wrapper that converts raw args by the method signature."""
    candidate_list_java = "{" + ", ".join(json.dumps(c) for c in candidates) + "}"
    source_code = re.sub(r'\bpublic\s+class\s+([A-Za-z0-9_]+)\b', r'class \1', source_code)
    source_code = re.sub(r'^\s*package\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)
    source_code = re.sub(r'^\s*import\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)
    
    exclude_classes = {'Solution', 'Main', 'TreeNode', 'ListNode', 'DoublyNode', 'Node'}
    user_classes = re.findall(r'\bclass\s+([A-Za-z0-9_]+)\b', source_code)
    class_name = "Solution"
    for c in user_classes:
        if c not in exclude_classes:
            class_name = c
            break

    standard_defs = []
    if not re.search(r'\b(?:class|static\s+class)\s+TreeNode\b', source_code):
        standard_defs.append("class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int v) { val = v; } }")
    if not re.search(r'\b(?:class|static\s+class)\s+ListNode\b', source_code):
        standard_defs.append("class ListNode { int val; ListNode next; ListNode() {} ListNode(int v) { val = v; } }")
    if not re.search(r'\b(?:class|static\s+class)\s+DoublyNode\b', source_code):
        standard_defs.append("class DoublyNode { int val; DoublyNode prev, next; DoublyNode() {} DoublyNode(int v) { val = v; } }")
    if not re.search(r'\b(?:class|static\s+class)\s+Node\b', source_code):
        standard_defs.append("class Node { public int val; public List<Node> children; public Node() { children = new ArrayList<>(); } public Node(int v) { val = v; children = new ArrayList<>(); } }")
    template = r'''
import java.io.*;
import java.lang.reflect.*;
import java.util.*;

__STANDARD_DEFS__

__SOURCE_CODE__

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line = reader.readLine();
        if (line == null || line.trim().isEmpty()) line = "[]";
        Object parsed = parseValue(line.trim());
        List<Object> argList = parsed instanceof List ? (List<Object>) parsed : new ArrayList<>(Arrays.asList(parsed));
        Object result = callSolution(argList);
        System.out.println(serialize(result));
    }

    static Object parseValue(String s) {
        s = s.trim();
        if (s.isEmpty() || s.equalsIgnoreCase("null")) return null;
        if (s.equalsIgnoreCase("true")) return true;
        if (s.equalsIgnoreCase("false")) return false;
        if (s.startsWith("[") && s.endsWith("]")) return parseList(s.substring(1, s.length() - 1));
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) return s.substring(1, s.length() - 1);
        try { return s.contains(".") ? Double.parseDouble(s) : Integer.parseInt(s); }
        catch (NumberFormatException e) { return s; }
    }

    static List<Object> parseList(String s) {
        List<Object> result = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inString = false; char quote = 0; int depth = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!inString && (c == '"' || c == '\'')) { inString = true; quote = c; cur.append(c); }
            else if (inString && c == quote) { inString = false; cur.append(c); }
            else if (!inString && c == '[') { depth++; cur.append(c); }
            else if (!inString && c == ']') { depth--; cur.append(c); }
            else if (!inString && c == ',' && depth == 0) { result.add(parseValue(cur.toString())); cur.setLength(0); }
            else cur.append(c);
        }
        if (cur.length() > 0) result.add(parseValue(cur.toString()));
        return result;
    }

    static Object callSolution(List<Object> args) throws Exception {
        String[] names = __CANDIDATES__;
        Class<?> cls = Class.forName("__CLASS_NAME__");
        Object instance = cls.getDeclaredConstructor().newInstance();
        for (String name : names) {
            for (Method m : cls.getDeclaredMethods()) {
                if (!m.getName().equals(name)) continue;
                try {
                    Object[] converted = convertArgs(args, m.getParameterTypes());
                    if (converted == null) continue;
                    m.setAccessible(true);
                    return m.invoke(instance, converted);
                } catch (Exception ignored) {}
            }
        }
        throw new RuntimeException("Could not find matching Solution method");
    }

    static Object[] convertArgs(List<Object> args, Class<?>[] types) {
        if (types.length == 1) return new Object[] { convertOne(args.size() == 1 ? args.get(0) : args, types[0]) };
        List<Object> values = args.size() == 1 && args.get(0) instanceof List ? (List<Object>) args.get(0) : args;
        if (values.size() < types.length) return null;
        Object[] out = new Object[types.length];
        for (int i = 0; i < types.length; i++) out[i] = convertOne(values.get(i), types[i]);
        return out;
    }

    static Object convertOne(Object value, Class<?> type) {
        if (type == int.class || type == Integer.class) return toInt(value);
        if (type == long.class || type == Long.class) return Long.valueOf(toLong(value));
        if (type == double.class || type == Double.class) return Double.valueOf(toDouble(value));
        if (type == boolean.class || type == Boolean.class) return Boolean.valueOf(toBool(value));
        if (type == char.class || type == Character.class) return Character.valueOf(toStringValue(value).isEmpty() ? '\0' : toStringValue(value).charAt(0));
        if (type == String.class) return toStringValue(value);
        if (type.isArray()) return toArray(value, type.getComponentType());
        if (List.class.isAssignableFrom(type)) return value instanceof List ? value : new ArrayList<>(Arrays.asList(value));
        if (Queue.class.isAssignableFrom(type)) return new LinkedList<>((List<Object>) (value instanceof List ? value : Arrays.asList(value)));
        if (Deque.class.isAssignableFrom(type)) return new ArrayDeque<>((List<Object>) (value instanceof List ? value : Arrays.asList(value)));
        if (Stack.class.isAssignableFrom(type)) { Stack<Object> s = new Stack<>(); for (Object v : (List<Object>) (value instanceof List ? value : Arrays.asList(value))) s.push(v); return s; }
        if (PriorityQueue.class.isAssignableFrom(type)) return new PriorityQueue<>((List<Object>) (value instanceof List ? value : Arrays.asList(value)));
        if (Set.class.isAssignableFrom(type)) return new HashSet<>((List<Object>) (value instanceof List ? value : Arrays.asList(value)));
        if (Map.class.isAssignableFrom(type)) return toMap(value);
        if (type.getSimpleName().equals("TreeNode")) return toTree(asList(value));
        if (type.getSimpleName().equals("ListNode")) return toListNode(asList(value));
        if (type.getSimpleName().equals("DoublyNode")) return toDoublyNode(asList(value));
        if (type.getSimpleName().equals("Node")) return toNary(asList(value));
        return value;
    }

    static Object toArray(Object value, Class<?> component) {
        List<Object> list = asList(value);
        Object arr = Array.newInstance(component, list.size());
        for (int i = 0; i < list.size(); i++) Array.set(arr, i, convertOne(list.get(i), component));
        return arr;
    }

    static List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : new ArrayList<>(Arrays.asList(value));
    }
    static int toInt(Object v) { return v instanceof Number ? ((Number) v).intValue() : Integer.parseInt(String.valueOf(v)); }
    static long toLong(Object v) { return v instanceof Number ? ((Number) v).longValue() : Long.parseLong(String.valueOf(v)); }
    static double toDouble(Object v) { return v instanceof Number ? ((Number) v).doubleValue() : Double.parseDouble(String.valueOf(v)); }
    static boolean toBool(Object v) { return v instanceof Boolean ? ((Boolean) v) : Boolean.parseBoolean(String.valueOf(v)); }
    static String toStringValue(Object v) { return v == null ? "" : String.valueOf(v); }

    static TreeNode toTree(List<Object> vals) {
        if (vals.isEmpty() || vals.get(0) == null) return null;
        TreeNode root = new TreeNode(toInt(vals.get(0)));
        Queue<TreeNode> q = new LinkedList<>(); q.add(root); int i = 1;
        while (!q.isEmpty() && i < vals.size()) {
            TreeNode node = q.poll();
            if (i < vals.size() && vals.get(i) != null) { node.left = new TreeNode(toInt(vals.get(i))); q.add(node.left); }
            i++;
            if (i < vals.size() && vals.get(i) != null) { node.right = new TreeNode(toInt(vals.get(i))); q.add(node.right); }
            i++;
        }
        return root;
    }
    static ListNode toListNode(List<Object> vals) {
        ListNode dummy = new ListNode(0), tail = dummy;
        for (Object v : vals) { tail.next = new ListNode(toInt(v)); tail = tail.next; }
        return dummy.next;
    }
    static DoublyNode toDoublyNode(List<Object> vals) {
        DoublyNode head = null, prev = null;
        for (Object v : vals) { DoublyNode n = new DoublyNode(toInt(v)); if (head == null) head = n; n.prev = prev; if (prev != null) prev.next = n; prev = n; }
        return head;
    }
    static Node toNary(List<Object> vals) {
        if (vals.isEmpty() || vals.get(0) == null) return null;
        Node root = new Node(toInt(vals.get(0))); Queue<Node> q = new LinkedList<>(); q.add(root);
        int i = vals.size() > 1 && vals.get(1) == null ? 2 : 1;
        while (!q.isEmpty() && i < vals.size()) {
            Node p = q.poll();
            while (i < vals.size() && vals.get(i) != null) { Node c = new Node(toInt(vals.get(i++))); p.children.add(c); q.add(c); }
            i++;
        }
        return root;
    }
    static Map<Object,Object> toMap(Object value) {
        Map<Object,Object> map = new HashMap<>();
        for (Object row : asList(value)) { List<Object> p = asList(row); if (p.size() >= 2) map.put(p.get(0), p.get(1)); }
        return map;
    }

    static String serialize(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof Boolean || obj instanceof Number) return obj.toString();
        if (obj instanceof String || obj instanceof Character) return obj.toString();
        Class<?> cls = obj.getClass();
        if (cls.isArray()) { int n = Array.getLength(obj); List<String> parts = new ArrayList<>(); for (int i=0;i<n;i++) parts.add(serialize(Array.get(obj, i))); return "[" + String.join(",", parts) + "]"; }
        if (obj instanceof List) { List<String> parts = new ArrayList<>(); for (Object v : (List<?>) obj) parts.add(serialize(v)); return "[" + String.join(",", parts) + "]"; }
        if (obj instanceof TreeNode) return serializeTree((TreeNode) obj);
        if (obj instanceof ListNode) { List<Integer> vals = new ArrayList<>(); for (ListNode n=(ListNode)obj; n!=null; n=n.next) vals.add(n.val); return serialize(vals); }
        if (obj instanceof DoublyNode) { List<Integer> vals = new ArrayList<>(); for (DoublyNode n=(DoublyNode)obj; n!=null; n=n.next) vals.add(n.val); return serialize(vals); }
        if (obj instanceof Node) return serializeNary((Node) obj);
        return obj.toString();
    }
    static String serializeTree(TreeNode root) {
        List<String> vals = new ArrayList<>(); Queue<TreeNode> q = new LinkedList<>(); q.add(root);
        while (!q.isEmpty()) { TreeNode n = q.poll(); if (n == null) vals.add("null"); else { vals.add(String.valueOf(n.val)); q.add(n.left); q.add(n.right); } }
        while (!vals.isEmpty() && vals.get(vals.size()-1).equals("null")) vals.remove(vals.size()-1);
        return "[" + String.join(",", vals) + "]";
    }
    static String serializeNary(Node root) {
        List<String> vals = new ArrayList<>(); Queue<Node> q = new LinkedList<>(); vals.add(String.valueOf(root.val)); vals.add("null"); q.add(root);
        while (!q.isEmpty()) { Node n = q.poll(); for (Node c : n.children) { vals.add(String.valueOf(c.val)); q.add(c); } vals.add("null"); }
        while (!vals.isEmpty() && vals.get(vals.size()-1).equals("null")) vals.remove(vals.size()-1);
        return "[" + String.join(",", vals) + "]";
    }
}
'''.strip()
    return (
        template
        .replace("__STANDARD_DEFS__", "\n".join(standard_defs))
        .replace("__SOURCE_CODE__", source_code)
        .replace("__CANDIDATES__", candidate_list_java)
        .replace("__CLASS_NAME__", class_name)
    )


def _build_java_wrapper_typed(source_code: str, candidates: list[str], schema: dict) -> str | None:
    """Schema-driven Java driver — only diverges from _build_java_wrapper
    when a GraphNode is actually involved. Same root cause as the Python fix:
    the untyped wrapper's convertOne() dispatches purely on the reflected
    parameter type's simple name ("Node"), and the Node class it injects when
    the student doesn't define their own is the n-ary-tree shape (val +
    children) — wrong for a graph (val + neighbors, possibly cyclic). This
    injects a graph-shaped Node instead and builds/serializes it explicitly
    from the schema, rather than guessing from the type name."""
    params = param_types.ordered_params(schema)
    return_type = schema.get("return_type", "")
    if not any(p["type"] == "GraphNode" for p in params) and return_type != "GraphNode":
        return None

    candidate_list_java = "{" + ", ".join(json.dumps(c) for c in candidates) + "}"
    source_code = re.sub(r'\bpublic\s+class\s+([A-Za-z0-9_]+)\b', r'class \1', source_code)
    source_code = re.sub(r'^\s*package\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)
    source_code = re.sub(r'^\s*import\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)
    
    exclude_classes = {'Solution', 'Main', 'TreeNode', 'ListNode', 'DoublyNode', 'Node'}
    user_classes = re.findall(r'\bclass\s+([A-Za-z0-9_]+)\b', source_code)
    class_name = "Solution"
    for c in user_classes:
        if c not in exclude_classes:
            class_name = c
            break
    graph_param_indices = [i for i, p in enumerate(params) if p["type"] == "GraphNode"]
    returns_graph = return_type == "GraphNode"

    template = r'''
import java.io.*;
import java.lang.reflect.*;
import java.util.*;

class Node {
    public int val;
    public List<Node> neighbors;
    public Node() { val = 0; neighbors = new ArrayList<>(); }
    public Node(int v) { val = v; neighbors = new ArrayList<>(); }
}

__SOURCE_CODE__

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line = reader.readLine();
        if (line == null || line.trim().isEmpty()) line = "[]";
        Object parsed = parseValue(line.trim());
        List<Object> argList = parsed instanceof List ? (List<Object>) parsed : new ArrayList<>(Arrays.asList(parsed));

        Set<Integer> graphIndices = new HashSet<>(Arrays.asList(__GRAPH_INDICES__));
        Object[] converted = new Object[argList.size()];
        for (int i = 0; i < argList.size(); i++) {
            converted[i] = graphIndices.contains(i) ? buildGraph(argList.get(i)) : argList.get(i);
        }

        Object result = callSolution(converted);
        if (__RETURNS_GRAPH__) {
            System.out.println(serializeGraph((Node) result));
        } else {
            System.out.println(serialize(result));
        }
    }

    static Node buildGraph(Object adjListObj) {
        List<Object> adjList = adjListObj instanceof List ? (List<Object>) adjListObj : new ArrayList<>();
        if (adjList.isEmpty()) return null;
        Map<Integer, Node> nodes = new HashMap<>();
        for (int i = 0; i < adjList.size(); i++) nodes.put(i + 1, new Node(i + 1));
        for (int i = 0; i < adjList.size(); i++) {
            List<Object> neighborVals = (List<Object>) adjList.get(i);
            for (Object v : neighborVals) nodes.get(i + 1).neighbors.add(nodes.get(toInt(v)));
        }
        return nodes.get(1);
    }

    static String serializeGraph(Node start) {
        if (start == null) return "[]";
        Map<Integer, Node> visited = new TreeMap<>();
        visited.put(start.val, start);
        Queue<Node> q = new LinkedList<>(); q.add(start);
        while (!q.isEmpty()) {
            Node n = q.poll();
            for (Node nb : n.neighbors) {
                if (!visited.containsKey(nb.val)) { visited.put(nb.val, nb); q.add(nb); }
            }
        }
        List<String> rows = new ArrayList<>();
        for (Node n : visited.values()) {
            List<Integer> vals = new ArrayList<>();
            for (Node nb : n.neighbors) vals.add(nb.val);
            Collections.sort(vals);
            List<String> parts = new ArrayList<>();
            for (int v : vals) parts.add(String.valueOf(v));
            rows.add("[" + String.join(",", parts) + "]");
        }
        return "[" + String.join(",", rows) + "]";
    }

    static Object parseValue(String s) {
        s = s.trim();
        if (s.isEmpty() || s.equalsIgnoreCase("null")) return null;
        if (s.equalsIgnoreCase("true")) return true;
        if (s.equalsIgnoreCase("false")) return false;
        if (s.startsWith("[") && s.endsWith("]")) return parseList(s.substring(1, s.length() - 1));
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) return s.substring(1, s.length() - 1);
        try { return s.contains(".") ? Double.parseDouble(s) : Integer.parseInt(s); }
        catch (NumberFormatException e) { return s; }
    }

    static List<Object> parseList(String s) {
        List<Object> result = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inString = false; char quote = 0; int depth = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!inString && (c == '"' || c == '\'')) { inString = true; quote = c; cur.append(c); }
            else if (inString && c == quote) { inString = false; cur.append(c); }
            else if (!inString && c == '[') { depth++; cur.append(c); }
            else if (!inString && c == ']') { depth--; cur.append(c); }
            else if (!inString && c == ',' && depth == 0) { result.add(parseValue(cur.toString())); cur.setLength(0); }
            else cur.append(c);
        }
        if (cur.length() > 0) result.add(parseValue(cur.toString()));
        return result;
    }

    static Object callSolution(Object[] preparedArgs) throws Exception {
        String[] names = __CANDIDATES__;
        Class<?> cls = Class.forName("__CLASS_NAME__");
        Object instance = cls.getDeclaredConstructor().newInstance();
        for (String name : names) {
            for (Method m : cls.getDeclaredMethods()) {
                if (!m.getName().equals(name)) continue;
                if (m.getParameterCount() != preparedArgs.length) continue;
                try {
                    Class<?>[] types = m.getParameterTypes();
                    Object[] finalArgs = new Object[preparedArgs.length];
                    for (int i = 0; i < preparedArgs.length; i++) {
                        finalArgs[i] = preparedArgs[i] instanceof Node ? preparedArgs[i] : convertOne(preparedArgs[i], types[i]);
                    }
                    m.setAccessible(true);
                    return m.invoke(instance, finalArgs);
                } catch (Exception ignored) {}
            }
        }
        throw new RuntimeException("Could not find matching Solution method");
    }

    static Object convertOne(Object value, Class<?> type) {
        if (type == int.class || type == Integer.class) return toInt(value);
        if (type == long.class || type == Long.class) return Long.valueOf(toLong(value));
        if (type == double.class || type == Double.class) return Double.valueOf(toDouble(value));
        if (type == boolean.class || type == Boolean.class) return Boolean.valueOf(toBool(value));
        if (type == String.class) return toStringValue(value);
        if (type.isArray()) return toArray(value, type.getComponentType());
        if (List.class.isAssignableFrom(type)) return value instanceof List ? value : new ArrayList<>(Arrays.asList(value));
        return value;
    }

    static Object toArray(Object value, Class<?> component) {
        List<Object> list = asList(value);
        Object arr = Array.newInstance(component, list.size());
        for (int i = 0; i < list.size(); i++) Array.set(arr, i, convertOne(list.get(i), component));
        return arr;
    }

    static List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : new ArrayList<>(Arrays.asList(value));
    }
    static int toInt(Object v) { return v instanceof Number ? ((Number) v).intValue() : Integer.parseInt(String.valueOf(v)); }
    static long toLong(Object v) { return v instanceof Number ? ((Number) v).longValue() : Long.parseLong(String.valueOf(v)); }
    static double toDouble(Object v) { return v instanceof Number ? ((Number) v).doubleValue() : Double.parseDouble(String.valueOf(v)); }
    static boolean toBool(Object v) { return v instanceof Boolean ? ((Boolean) v) : Boolean.parseBoolean(String.valueOf(v)); }
    static String toStringValue(Object v) { return v == null ? "" : String.valueOf(v); }

    static String serialize(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof Boolean || obj instanceof Number) return obj.toString();
        if (obj instanceof String || obj instanceof Character) return obj.toString();
        Class<?> cls = obj.getClass();
        if (cls.isArray()) { int n = Array.getLength(obj); List<String> parts = new ArrayList<>(); for (int i=0;i<n;i++) parts.add(serialize(Array.get(obj, i))); return "[" + String.join(",", parts) + "]"; }
        if (obj instanceof List) { List<String> parts = new ArrayList<>(); for (Object v : (List<?>) obj) parts.add(serialize(v)); return "[" + String.join(",", parts) + "]"; }
        if (obj instanceof Node) return serializeGraph((Node) obj);
        return obj.toString();
    }
}
'''.strip()
    return (
        template
        .replace("__SOURCE_CODE__", source_code)
        .replace("__CANDIDATES__", candidate_list_java)
        .replace("__GRAPH_INDICES__", ", ".join(str(i) for i in graph_param_indices))
        .replace("__RETURNS_GRAPH__", "true" if returns_graph else "false")
        .replace("__CLASS_NAME__", class_name)
    )


# Scalar C types the typed wrapper below knows how to parse from a JSON token
# and pass into the user's function. Array/pointer parameters aren't handled —
# a signature with any other type falls back to the naive single-string call.
_C_SCALAR_TYPES = {
    "int":            ('(int)strtol(_c_tok(_c_i++), NULL, 10)', "int",       '"%d\\n"'),
    "unsigned int":   ('(unsigned int)strtoul(_c_tok(_c_i++), NULL, 10)', "unsigned int", '"%u\\n"'),
    "long":           ('strtol(_c_tok(_c_i++), NULL, 10)', "long",      '"%ld\\n"'),
    "long long":      ('strtoll(_c_tok(_c_i++), NULL, 10)', "long long", '"%lld\\n"'),
    "unsigned long":  ('strtoul(_c_tok(_c_i++), NULL, 10)', "unsigned long", '"%lu\\n"'),
    "short":          ('(short)strtol(_c_tok(_c_i++), NULL, 10)', "short",   '"%d\\n"'),
    "double":         ('strtod(_c_tok(_c_i++), NULL)', "double",       '"%g\\n"'),
    "float":          ('(float)strtod(_c_tok(_c_i++), NULL)', "float", '"%g\\n"'),
    "char":           ('_c_strip_quotes(_c_tok(_c_i++))[0]', "char",   '"%c\\n"'),
    "bool":           ('(strcmp(_c_tok(_c_i++), "true") == 0)', "int", '"%d\\n"'),
    "char*":          ('_c_strip_quotes(_c_tok(_c_i++))', "char*",     '"%s\\n"'),
    "const char*":    ('_c_strip_quotes(_c_tok(_c_i++))', "const char*", '"%s\\n"'),
}

# Helpers injected into every generated wrapper — tokenizes a top-level JSON
# array of scalars (numbers / quoted strings / true|false) and strips quotes.
_C_WRAPPER_HELPERS = r'''
#define _C_MAX_ARGS 16
static char* _c_tokens[_C_MAX_ARGS];
static int _c_ntok = 0;
static int _c_i = 0;

static char* _c_tok(int i) {
    return (i >= 0 && i < _c_ntok) ? _c_tokens[i] : "";
}

static char* _c_strip_quotes(char* s) {
    int len = (int)strlen(s);
    if (len >= 2 && s[0] == '"' && s[len - 1] == '"') {
        s[len - 1] = '\0';
        return s + 1;
    }
    return s;
}

static void _c_split_args(char* s) {
    while (*s == ' ') s++;
    if (*s == '[') s++;
    int len = (int)strlen(s);
    while (len > 0 && (s[len - 1] == ' ' || s[len - 1] == '\n' || s[len - 1] == '\r')) s[--len] = '\0';
    if (len > 0 && s[len - 1] == ']') s[--len] = '\0';

    int depth = 0, in_str = 0;
    char* start = s;
    char* c = s;
    while (1) {
        char ch = *c;
        if (ch == '"') in_str = !in_str;
        else if (!in_str && ch == '[') depth++;
        else if (!in_str && ch == ']') depth--;

        if ((ch == ',' && depth == 0 && !in_str) || ch == '\0') {
            *c = '\0';
            char* tok = start;
            while (*tok == ' ') tok++;
            int tl = (int)strlen(tok);
            while (tl > 0 && tok[tl - 1] == ' ') tok[--tl] = '\0';
            if (_c_ntok < _C_MAX_ARGS) _c_tokens[_c_ntok++] = tok;
            if (ch == '\0') break;
            start = c + 1;
        }
        c++;
    }
}
'''


def _parse_c_signature(func_name: str, source_code: str):
    """Extract (return_type, [param_types]) for a C function, or None if it
    can't be parsed as a plain-scalar signature the typed wrapper supports."""
    sig_pattern = re.compile(
        rf'([\w][\w\s\*]*?)\s+{re.escape(func_name)}\s*\(([^)]*)\)\s*\{{',
        re.MULTILINE,
    )
    match = sig_pattern.search(source_code)
    if not match:
        return None

    def normalize(t):
        return re.sub(r'\s+', ' ', t.strip())

    ret_type = normalize(match.group(1))
    params_str = match.group(2).strip()
    if not params_str or params_str == "void":
        return ret_type, []

    param_types = []
    for param in params_str.split(','):
        param = param.strip()
        if param.endswith('*'):
            # e.g. "char* s" or "char *s" with no space before the name
            base, _, _name = param.rpartition('*')
            param_types.append(normalize(base) + "*")
            continue
        parts = param.rsplit(None, 1)
        ptype = normalize(parts[0]) if len(parts) == 2 else normalize(parts[0])
        param_types.append(ptype)

    return ret_type, param_types


def _build_c_wrapper(source_code: str, candidates: list[str]) -> str:
    """
    Build a C wrapper that reads one line of JSON-array args from stdin,
    parses them into the function's declared scalar types, calls it, and
    prints the typed return value — mirroring the C++ wrapper's approach
    but without STL (scalars + C strings only; no array/pointer params).

    Falls back to a best-effort single-raw-string call when the signature
    can't be determined or uses an unsupported (e.g. array) parameter type.
    """
    func_name = None
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\(', source_code):
            func_name = name
            break
    if not func_name and candidates:
        func_name = candidates[0]
    if not func_name:
        func_name = "solution"

    sig = _parse_c_signature(func_name, source_code)
    supported = sig is not None and all(t in _C_SCALAR_TYPES or t == "void" for t in ([sig[0]] + sig[1]))

    if supported:
        ret_type, param_types = sig
        arg_lines = []
        call_args = []
        for idx, ptype in enumerate(param_types):
            expr, decl_type, _ = _C_SCALAR_TYPES[ptype]
            var = f"_c_a{idx}"
            arg_lines.append(f"    {decl_type} {var} = {expr};")
            call_args.append(var)
        call_expr = f'{func_name}({", ".join(call_args)})'

        if ret_type == "void":
            call_lines = f"    {call_expr};\n    printf(\"void\\n\");"
        else:
            _, _, fmt = _C_SCALAR_TYPES[ret_type]
            call_lines = f"    printf({fmt}, {call_expr});"

        return (
            "#include <stdio.h>\n"
            "#include <stdlib.h>\n"
            "#include <string.h>\n\n"
            "// User code\n"
            f"{source_code}\n\n"
            f"{_C_WRAPPER_HELPERS}\n"
            "int main() {\n"
            "    char line[65536];\n"
            "    if (!fgets(line, sizeof(line), stdin)) line[0] = '\\0';\n"
            "    int len = (int)strlen(line);\n"
            "    while (len > 0 && (line[len - 1] == '\\n' || line[len - 1] == '\\r')) line[--len] = '\\0';\n"
            "    if (len > 0) _c_split_args(line);\n\n"
            f"{chr(10).join(arg_lines)}\n\n"
            f"{call_lines}\n"
            "    return 0;\n"
            "}\n"
        )

    # ── Fallback: unknown/unsupported signature — best-effort single string arg ──
    try_calls = '\n    '.join([f'result = {name}(arg); if (result) goto done;' for name in candidates])
    return f'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// User code
{source_code}

// Wrapper main function
int main() {{
    char line[4096];
    char* arg = NULL;
    char* result = NULL;

    // Read input
    if (fgets(line, sizeof(line), stdin)) {{
        // Parse simple string from JSON-like format ["string"]
        char* start = strchr(line, '"');
        if (start) {{
            start++;
            char* end = strchr(start, '"');
            if (end) {{
                *end = '\\0';
                arg = start;
            }}
        }}
    }}

    if (!arg) arg = "";

    // Try each candidate function
    {try_calls}

done:
    if (result) {{
        printf("%s\\n", result);
    }} else {{
        printf("null\\n");
    }}

    return 0;
}}
'''.strip()


# ── Typed C wrapper (driven by Problem.param_schema, not signature-guessing) ─
# Only used when a param_schema is present — see _prepare_typed_execution_payload.
# Scalars reuse the same decl/parse pairs as _C_SCALAR_TYPES. Array params follow
# the LeetCode-C convention: a schema array param "nums" is expected to appear in
# the student's actual C signature as `int* nums, int numsSize` (pointer directly
# followed by an implicit size parameter that has NO entry in param_schema — the
# schema only models logical parameters). An array return type gets an implicit
# trailing `int* returnSize` output parameter. 2D arrays are not supported in this
# phase — _build_c_wrapper_typed returns None so the caller falls back to the
# existing untyped path (same behavior C already has for unsupported signatures).
_C_TYPED_ARRAY_HELPERS = r'''
static int* _c_parse_int_array(const char* tok, int* out_size) {
    int cap = 16, n = 0;
    int* arr = (int*)malloc(cap * sizeof(int));
    const char* p = tok;
    while (*p == ' ') p++;
    if (*p == '[') p++;
    while (*p && *p != ']') {
        while (*p == ' ' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;
        char* end;
        long v = strtol(p, &end, 10);
        if (n >= cap) { cap *= 2; arr = (int*)realloc(arr, cap * sizeof(int)); }
        arr[n++] = (int)v;
        p = end;
    }
    *out_size = n;
    return arr;
}

static double* _c_parse_double_array(const char* tok, int* out_size) {
    int cap = 16, n = 0;
    double* arr = (double*)malloc(cap * sizeof(double));
    const char* p = tok;
    while (*p == ' ') p++;
    if (*p == '[') p++;
    while (*p && *p != ']') {
        while (*p == ' ' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;
        char* end;
        double v = strtod(p, &end);
        if (n >= cap) { cap *= 2; arr = (double*)realloc(arr, cap * sizeof(double)); }
        arr[n++] = v;
        p = end;
    }
    *out_size = n;
    return arr;
}

static char** _c_parse_string_array(const char* tok, int* out_size) {
    int cap = 16, n = 0;
    char** arr = (char**)malloc(cap * sizeof(char*));
    const char* p = tok;
    while (*p == ' ') p++;
    if (*p == '[') p++;
    while (*p && *p != ']' && *p != '\0') {
        while (*p == ' ' || *p == ',') p++;
        if (*p != '"') break;
        p++;
        const char* start = p;
        while (*p && *p != '"') p++;
        int len = (int)(p - start);
        char* s = (char*)malloc(len + 1);
        memcpy(s, start, len);
        s[len] = '\0';
        if (n >= cap) { cap *= 2; arr = (char**)realloc(arr, cap * sizeof(char*)); }
        arr[n++] = s;
        if (*p == '"') p++;
    }
    *out_size = n;
    return arr;
}

static int* _c_parse_bool_array(const char* tok, int* out_size) {
    int cap = 16, n = 0;
    int* arr = (int*)malloc(cap * sizeof(int));
    const char* p = tok;
    while (*p == ' ') p++;
    if (*p == '[') p++;
    while (*p && *p != ']') {
        while (*p == ' ' || *p == ',') p++;
        if (*p == ']' || *p == '\0') break;
        int val = (strncmp(p, "true", 4) == 0) ? 1 : 0;
        if (strncmp(p, "true", 4) == 0) p += 4;
        else if (strncmp(p, "false", 5) == 0) p += 5;
        else p++;
        if (n >= cap) { cap *= 2; arr = (int*)realloc(arr, cap * sizeof(int)); }
        arr[n++] = val;
    }
    *out_size = n;
    return arr;
}

static void _c_print_int_array(int* arr, int size) {
    printf("[");
    for (int _c_pi = 0; _c_pi < size; _c_pi++) { if (_c_pi) printf(","); printf("%d", arr[_c_pi]); }
    printf("]\n");
}

static void _c_print_double_array(double* arr, int size) {
    printf("[");
    for (int _c_pi = 0; _c_pi < size; _c_pi++) { if (_c_pi) printf(","); printf("%g", arr[_c_pi]); }
    printf("]\n");
}

static void _c_print_string_array(char** arr, int size) {
    printf("[");
    for (int _c_pi = 0; _c_pi < size; _c_pi++) { if (_c_pi) printf(","); printf("\"%s\"", arr[_c_pi]); }
    printf("]\n");
}

static void _c_print_bool_array(int* arr, int size) {
    printf("[");
    for (int _c_pi = 0; _c_pi < size; _c_pi++) { if (_c_pi) printf(","); printf(arr[_c_pi] ? "true" : "false"); }
    printf("]\n");
}
'''

_C_ARRAY_PARSE_FN = {
    "int": "_c_parse_int_array",
    "float": "_c_parse_double_array",
    "double": "_c_parse_double_array",
    "string": "_c_parse_string_array",
    "boolean": "_c_parse_bool_array",
}
_C_ARRAY_ELEM_C_TYPE = {
    "int": "int",
    "float": "double",
    "double": "double",
    "string": "char*",
    "boolean": "int",
}
_C_ARRAY_PRINT_FN = {
    "int": "_c_print_int_array",
    "float": "_c_print_double_array",
    "double": "_c_print_double_array",
    "string": "_c_print_string_array",
    "boolean": "_c_print_bool_array",
}
_C_SCALAR_PARSE = {
    "int":     ('(int)strtol(_c_tok(_c_i++), NULL, 10)', "int"),
    "float":   ('(float)strtod(_c_tok(_c_i++), NULL)', "float"),
    "double":  ('strtod(_c_tok(_c_i++), NULL)', "double"),
    "boolean": ('(strncmp(_c_tok(_c_i++), "true", 4) == 0)', "int"),
    "string":  ('_c_strip_quotes(_c_tok(_c_i++))', "char*"),
}


# ── GraphNode support for C (schema-driven, no reflection/STL to lean on) ────
# The riskiest of the four typed builders: unlike Python/Java/C++, there's no
# existing map/vector/GC to reuse, no compiler available to test-compile this
# against in this environment, and it's almost entirely new code rather than
# a small delta on proven logic. Verified by careful manual trace against all
# 4 of Clone Graph's real stored test cases (empty graph, single isolated
# node, and two connected multi-node cases) — but this one specifically
# should be the first thing compiled for real once deployed, before trusting
# it with real student submissions. Node vals are capped at 100000 (LeetCode's
# real Clone Graph constraint is n<=100) via fixed-size arrays instead of a
# hash map, to keep the generated C simple.
_C_GRAPH_HELPERS = r'''
#define _C_MAX_GRAPH_NODES 100001

struct Node {
    int val;
    int numNeighbors;
    struct Node** neighbors;
};

static void __c2d_split_toplevel(char* s, char** out, int* out_n) {
    int depth = 0, in_str = 0, n = 0;
    char* start = s;
    char* c = s;
    while (1) {
        char ch = *c;
        if (ch == '"') in_str = !in_str;
        else if (!in_str && ch == '[') depth++;
        else if (!in_str && ch == ']') depth--;
        if ((ch == ',' && depth == 0 && !in_str) || ch == '\0') {
            *c = '\0';
            if (n < _C_MAX_GRAPH_NODES) out[n++] = start;
            if (ch == '\0') break;
            start = c + 1;
        }
        c++;
    }
    *out_n = n;
}

static struct Node* __c2d_build_graph(char* tok) {
    int len = (int)strlen(tok);
    if (len < 2) return NULL;
    tok[len - 1] = '\0';   /* strip trailing ']' */
    tok++;                  /* skip leading '[' */
    if (strlen(tok) == 0) return NULL;   /* adjList == [] -- empty graph */

    static char* rows[_C_MAX_GRAPH_NODES];
    int n_rows = 0;
    __c2d_split_toplevel(tok, rows, &n_rows);

    struct Node** nodes = (struct Node**)malloc((n_rows + 1) * sizeof(struct Node*));
    for (int i = 1; i <= n_rows; i++) {
        nodes[i] = (struct Node*)malloc(sizeof(struct Node));
        nodes[i]->val = i;
        nodes[i]->numNeighbors = 0;
        nodes[i]->neighbors = NULL;
    }
    for (int i = 0; i < n_rows; i++) {
        int size = 0;
        int* vals = _c_parse_int_array(rows[i], &size);
        nodes[i + 1]->numNeighbors = size;
        if (size > 0) {
            nodes[i + 1]->neighbors = (struct Node**)malloc(size * sizeof(struct Node*));
            for (int j = 0; j < size; j++) nodes[i + 1]->neighbors[j] = nodes[vals[j]];
        }
    }
    return nodes[1];
}

static char* __c2d_serialize_graph(struct Node* start) {
    char* out = (char*)malloc(65536);
    int pos = 0;
    if (!start) { strcpy(out, "[]"); return out; }

    static struct Node* visited[_C_MAX_GRAPH_NODES];
    static int seen[_C_MAX_GRAPH_NODES];
    memset(seen, 0, sizeof(seen));
    static struct Node* q[_C_MAX_GRAPH_NODES];
    int qh = 0, qt = 0, max_val = 0;

    q[qt++] = start; seen[start->val] = 1; visited[start->val] = start;
    if (start->val > max_val) max_val = start->val;
    while (qh < qt) {
        struct Node* n = q[qh++];
        for (int i = 0; i < n->numNeighbors; i++) {
            struct Node* nb = n->neighbors[i];
            if (!seen[nb->val]) {
                seen[nb->val] = 1; visited[nb->val] = nb; q[qt++] = nb;
                if (nb->val > max_val) max_val = nb->val;
            }
        }
    }

    out[pos++] = '[';
    int first_row = 1;
    for (int v = 1; v <= max_val; v++) {
        if (!seen[v]) continue;
        if (!first_row) out[pos++] = ',';
        first_row = 0;
        out[pos++] = '[';
        struct Node* n = visited[v];
        int vals[10000], cnt = 0;
        for (int i = 0; i < n->numNeighbors; i++) vals[cnt++] = n->neighbors[i]->val;
        for (int i = 1; i < cnt; i++) {
            int key = vals[i], j = i - 1;
            while (j >= 0 && vals[j] > key) { vals[j + 1] = vals[j]; j--; }
            vals[j + 1] = key;
        }
        for (int i = 0; i < cnt; i++) {
            if (i) out[pos++] = ',';
            pos += sprintf(out + pos, "%d", vals[i]);
        }
        out[pos++] = ']';
    }
    out[pos++] = ']';
    out[pos] = '\0';
    return out;
}
'''


def _build_c_graph_wrapper_typed(source_code: str, candidates: list[str], schema: dict) -> str:
    """GraphNode-specific C driver — only ever called when the schema
    actually uses GraphNode (see _build_c_wrapper_typed's dispatch)."""
    params = param_types.ordered_params(schema)
    return_type = schema.get("return_type", "")

    func_name = None
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\(', source_code):
            func_name = name
            break
    if not func_name and candidates:
        func_name = candidates[0]
    if not func_name:
        func_name = "solution"

    arg_lines = []
    call_args = []
    for idx, p in enumerate(params):
        var = f"_c_a{idx}"
        if p["type"] == "GraphNode":
            arg_lines.append(f"    struct Node* {var} = __c2d_build_graph(_c_tok(_c_i++));")
        else:
            base = param_types.base_scalar_type(p["type"])
            expr, c_type = _C_SCALAR_PARSE[base]
            arg_lines.append(f"    {c_type} {var} = {expr};")
        call_args.append(var)

    call_expr = f'{func_name}({", ".join(call_args)})'
    if return_type == "GraphNode":
        call_lines = f"    struct Node* _c_result = {call_expr};\n    printf(\"%s\\n\", __c2d_serialize_graph(_c_result));"
    elif return_type == "boolean":
        call_lines = f'    printf({call_expr} ? "true\\n" : "false\\n");'
    else:
        fmt = '"%g\\n"' if return_type in ("float", "double") else '"%d\\n"'
        call_lines = f"    printf({fmt}, {call_expr});"

    return (
        "#include <stdio.h>\n"
        "#include <stdlib.h>\n"
        "#include <string.h>\n\n"
        # struct Node + its helpers (which need _c_parse_int_array, hence
        # _C_TYPED_ARRAY_HELPERS) MUST come before the user's source code —
        # the student's function dereferences node->val/neighbors, which
        # requires struct Node to already be a complete type at that point,
        # not just forward-declared.
        f"{_C_WRAPPER_HELPERS}\n"
        f"{_C_TYPED_ARRAY_HELPERS}\n"
        f"{_C_GRAPH_HELPERS}\n"
        "// User code\n"
        f"{source_code}\n\n"
        "int main() {\n"
        "    char line[65536];\n"
        "    if (!fgets(line, sizeof(line), stdin)) line[0] = '\\0';\n"
        "    int len = (int)strlen(line);\n"
        "    while (len > 0 && (line[len - 1] == '\\n' || line[len - 1] == '\\r')) line[--len] = '\\0';\n"
        "    if (len > 0) _c_split_args(line);\n\n"
        f"{chr(10).join(arg_lines)}\n\n"
        f"{call_lines}\n"
        "    return 0;\n"
        "}\n"
    )


def _build_c_wrapper_typed(source_code: str, candidates: list[str], schema: dict) -> str | None:
    """Build a C driver directly from an explicit param_schema, instead of
    regex-guessing types from the source. This is what closes the gap
    _build_c_wrapper has today (no array support at all). Returns None if
    the schema uses a 2D array anywhere — the caller falls back to the
    existing untyped wrapper in that case."""
    params = param_types.ordered_params(schema)
    return_type = schema.get("return_type", "")

    if any(p["type"] == "GraphNode" for p in params) or return_type == "GraphNode":
        return _build_c_graph_wrapper_typed(source_code, candidates, schema)

    if any(param_types.array_dimensions(p["type"]) > 1 for p in params) or param_types.array_dimensions(return_type) > 1:
        return None

    func_name = None
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\(', source_code):
            func_name = name
            break
    if not func_name and candidates:
        func_name = candidates[0]
    if not func_name:
        func_name = "solution"

    arg_lines = []
    call_args = []
    for idx, p in enumerate(params):
        ptype = p["type"]
        base = param_types.base_scalar_type(ptype)
        var = f"_c_a{idx}"
        if param_types.array_dimensions(ptype) == 1:
            parse_fn = _C_ARRAY_PARSE_FN[base]
            elem_type = _C_ARRAY_ELEM_C_TYPE[base]
            size_var = f"{var}_size"
            arg_lines.append(f"    int {size_var} = 0;")
            arg_lines.append(f"    {elem_type}* {var} = {parse_fn}(_c_tok(_c_i++), &{size_var});")
            call_args.append(var)
            call_args.append(size_var)
        else:
            expr, c_type = _C_SCALAR_PARSE[base]
            arg_lines.append(f"    {c_type} {var} = {expr};")
            call_args.append(var)

    return_dims = param_types.array_dimensions(return_type)
    return_size_var = "_c_return_size"
    if return_dims == 1:
        call_args.append(f"&{return_size_var}")

    call_expr = f'{func_name}({", ".join(call_args)})'

    if return_dims == 1:
        ret_base = param_types.base_scalar_type(return_type)
        elem_type = _C_ARRAY_ELEM_C_TYPE[ret_base]
        print_fn = _C_ARRAY_PRINT_FN[ret_base]
        call_lines = (
            f"    int {return_size_var} = 0;\n"
            f"    {elem_type}* _c_result = {call_expr};\n"
            f"    {print_fn}(_c_result, {return_size_var});"
        )
    elif return_type == "boolean":
        call_lines = f'    printf({call_expr} ? "true\\n" : "false\\n");'
    elif return_type == "string":
        call_lines = f'    printf("%s\\n", {call_expr});'
    else:
        fmt = '"%g\\n"' if return_type in ("float", "double") else '"%d\\n"'
        call_lines = f"    printf({fmt}, {call_expr});"

    return (
        "#include <stdio.h>\n"
        "#include <stdlib.h>\n"
        "#include <string.h>\n\n"
        "// User code\n"
        f"{source_code}\n\n"
        f"{_C_WRAPPER_HELPERS}\n"
        f"{_C_TYPED_ARRAY_HELPERS}\n"
        "int main() {\n"
        "    char line[65536];\n"
        "    if (!fgets(line, sizeof(line), stdin)) line[0] = '\\0';\n"
        "    int len = (int)strlen(line);\n"
        "    while (len > 0 && (line[len - 1] == '\\n' || line[len - 1] == '\\r')) line[--len] = '\\0';\n"
        "    if (len > 0) _c_split_args(line);\n\n"
        f"{chr(10).join(arg_lines)}\n\n"
        f"{call_lines}\n"
        "    return 0;\n"
        "}\n"
    )


def _generate_cpp_call(func_name: str, sig_match, source_code: str, has_solution_class: bool = True) -> str:
    """
    Generate the typed call inside the C++ main lambda.
    Inspects the function signature to determine parameter types and builds
    the correct typed call with serialization of the return value.
    """
    import re as _re

    call_prefix = "sol." if has_solution_class else ""

    def normalize_type(t):
        t = t.strip()
        t = _re.sub(r'\bconst\b', '', t)
        t = t.replace('std::', '')
        t = _re.sub(r'\s+', ' ', t)
        t = _re.sub(r'\s*<\s*', '<', t)
        t = _re.sub(r'\s*>\s*', '>', t)
        t = _re.sub(r'\s*,\s*', ',', t)
        t = t.replace('&', '').strip()
        t = _re.sub(r'\s*\*\s*', '*', t)
        return t

    def split_params(params: str) -> list[str]:
        result, current, depth = [], [], 0
        for ch in params:
            if ch == '<':
                depth += 1
            elif ch == '>':
                depth = max(0, depth - 1)
            if ch == ',' and depth == 0:
                part = ''.join(current).strip()
                if part:
                    result.append(part)
                current = []
            else:
                current.append(ch)
        tail = ''.join(current).strip()
        if tail:
            result.append(tail)
        return result

    def param_type(param: str) -> str:
        param = param.split('=', 1)[0].strip()
        param = _re.sub(r'\s+', ' ', param)
        match = _re.match(r'(.+?)(?:\s+[A-Za-z_]\w*)$', param)
        return normalize_type(match.group(1) if match else param)

    def arg_expr(ptype: str, index: int) -> str:
        aliases = {
            'long': 'long long',
            'long int': 'long long',
            'long long int': 'long long',
            'unsigned int': 'int',
            'size_t': 'int',
        }
        ptype = aliases.get(ptype, ptype)
        if ptype in ('int', 'short'):
            return f'__c2d_int_arg(args, {index})'
        if ptype == 'long long':
            return f'__c2d_long_arg(args, {index})'
        if ptype in ('double', 'float'):
            return f'__c2d_double_arg(args, {index})'
        if ptype == 'bool':
            return f'__c2d_bool_arg(args, {index})'
        if ptype == 'char':
            return f'__c2d_char_arg(args, {index})'
        if ptype == 'string':
            return f'__c2d_string_arg(args, {index})'
        if ptype == 'TreeNode*':
            return f'__c2d_tree_arg(args, {index})'
        if ptype == 'ListNode*':
            return f'__c2d_list_arg(args, {index})'
        if ptype == 'DoublyNode*':
            return f'__c2d_doubly_arg(args, {index})'
        if ptype == 'Node*':
            return f'__c2d_nary_arg(args, {index})'
        if ptype == 'vector<int>':
            return f'__c2d_vec_int(args, {index})'
        if ptype == 'vector<long long>':
            return f'__c2d_vec_long(args, {index})'
        if ptype == 'vector<double>':
            return f'__c2d_vec_double(args, {index})'
        if ptype == 'vector<string>':
            return f'__c2d_vec_string(args, {index})'
        if ptype == 'vector<char>':
            return f'__c2d_vec_char(args, {index})'
        if ptype == 'vector<bool>':
            return f'__c2d_vec_bool(args, {index})'
        if ptype == 'vector<vector<int>>':
            return f'__c2d_matrix_int(args, {index})'
        if ptype == 'vector<vector<long long>>':
            return f'__c2d_matrix_long(args, {index})'
        if ptype == 'vector<vector<double>>':
            return f'__c2d_matrix_double(args, {index})'
        if ptype == 'vector<vector<char>>':
            return f'__c2d_matrix_char(args, {index})'
        if ptype == 'vector<vector<string>>':
            return f'__c2d_matrix_string(args, {index})'
        if ptype == 'pair<int,int>':
            return f'__c2d_pair_int(args, {index})'
        if ptype == 'vector<pair<int,int>>':
            return f'__c2d_intervals(args, {index})'
        if ptype == 'stack<int>':
            return f'__c2d_stack_int(args, {index})'
        if ptype == 'queue<int>':
            return f'__c2d_queue_int(args, {index})'
        if ptype == 'deque<int>':
            return f'__c2d_deque_int(args, {index})'
        if ptype.startswith('priority_queue<int'):
            return f'__c2d_priority_queue_int(args, {index})'
        if ptype == 'unordered_set<int>':
            return f'__c2d_unordered_set_int(args, {index})'
        if ptype == 'unordered_map<int,int>':
            return f'__c2d_unordered_map_int(args, {index})'
        return f'__c2d_int_arg(args, {index})'

    lines = []

    if sig_match:
        params_str = sig_match.group(2).strip()
        ret_type = normalize_type(sig_match.group(1))

        # Parse parameter types
        param_types = []
        if params_str:
            for param in split_params(params_str):
                param_types.append(param_type(param))

        # Build argument list
        call_args = [arg_expr(ptype, i) for i, ptype in enumerate(param_types)]

        call_str = f'{call_prefix}{func_name}({", ".join(call_args)})'

        # Determine how to serialize return value
        ret_norm = normalize_type(ret_type)
        if ret_norm == 'void':
            lines.append(f'        {call_str};')
            lines.append('        return "void";')
        elif ret_norm == 'bool':
            lines.append(f'        return serialize((bool)({call_str}));')
        elif ret_norm in ('int', 'short', 'long', 'long long'):
            lines.append(f'        return serialize((long long)({call_str}));')
        elif ret_norm in ('double', 'float'):
            lines.append(f'        return serialize((double)({call_str}));')
        elif ret_norm in ('string', 'char'):
            lines.append(f'        return serialize({call_str});')
        elif any(token in ret_norm for token in ('vector', 'pair', 'tuple', 'deque')):
            lines.append(f'        return serialize({call_str});')
        elif ret_norm in ('TreeNode*', 'ListNode*', 'DoublyNode*', 'Node*'):
            lines.append(f'        return serialize({call_str});')
        else:
            # Unknown return type — try to_string
            lines.append(f'        auto __r = {call_str};')
            lines.append('        ostringstream __os; __os << __r; return __os.str();')
    else:
        # No signature found — try common single-arg patterns as fallback
        lines.append(f'        if (args.size() >= 2) {{')
        lines.append(f'            auto __r = {call_prefix}{func_name}(__c2d_int_arg(args, 0), __c2d_int_arg(args, 1));')
        lines.append(f'            return serialize(__r);')
        lines.append(f'        }}')
        lines.append(f'        if (args.size() == 1) {{')
        lines.append(f'            auto __r = {call_prefix}{func_name}(__c2d_vec_int(args, 0));')
        lines.append(f'            return serialize(__r);')
        lines.append(f'        }}')

    return '\n'.join(lines)


def _build_cpp_wrapper(source_code: str, candidates: list[str]) -> str:
    """
    Build C++ wrapper that reads JSON args from stdin and calls the solution.

    Strategy:
    - Inject a full JSON parser (no external deps).
    - Detect the first candidate function name from the user's code.
    - Generate a main() that:
        1. Reads one line of JSON from stdin (e.g. [2, 7, 11, 15, 9])
        2. Parses it into a vector of JsonNode values
        3. Calls the solution function with the parsed args
        4. Prints the result

    Because C++ has no runtime reflection, we use a code-generation approach:
    we inspect the source to find the function signature and generate a typed call.
    If we can't determine the signature, we fall back to passing the raw JSON line
    as a single string argument.
    """
    import re as _re

    # Pick the first candidate that actually appears in the source
    func_name = None
    for c in candidates:
        if _re.search(rf'\b{_re.escape(c)}\s*\(', source_code):
            func_name = c
            break
    if not func_name and candidates:
        func_name = candidates[0]
    if not func_name:
        func_name = "solution"

    # Try to extract the return type and parameter types from the function signature
    # Pattern: <return_type> func_name(<params>) {
    sig_pattern = _re.compile(
        rf'([\w:<>\[\]*&\s]+?)\s+{_re.escape(func_name)}\s*\(([^)]*)\)\s*(?:const\s*)?\{{',
        _re.MULTILINE
    )
    match = sig_pattern.search(source_code)
    has_solution_class = bool(_re.search(r'\bclass\s+Solution\b', source_code))
    standard_defs = []
    if not _re.search(r'\b(?:struct|class)\s+TreeNode\b', source_code):
        standard_defs.append("struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x=0): val(x), left(nullptr), right(nullptr) {} };")
    if not _re.search(r'\b(?:struct|class)\s+ListNode\b', source_code):
        standard_defs.append("struct ListNode { int val; ListNode *next; ListNode(int x=0): val(x), next(nullptr) {} };")
    if not _re.search(r'\b(?:struct|class)\s+DoublyNode\b', source_code):
        standard_defs.append("struct DoublyNode { int val; DoublyNode *prev; DoublyNode *next; DoublyNode(int x=0): val(x), prev(nullptr), next(nullptr) {} };")
    if not _re.search(r'\b(?:struct|class)\s+Node\b', source_code):
        standard_defs.append("class Node { public: int val; vector<Node*> children; Node(): val(0) {} Node(int _val): val(_val) {} Node(int _val, vector<Node*> _children): val(_val), children(_children) {} };")
    standard_defs_code = "\n".join(standard_defs)

    # Build the wrapper
    # We use a robust JSON parser that handles nested arrays, strings, ints, bools
    wrapper = r"""
#include <bits/stdc++.h>
using namespace std;

// ── Lightweight JSON value ────────────────────────────────────────────────────
struct J {
    enum Type { INT, DOUBLE, BOOL, STR, ARR, NUL } type = NUL;
    long long   ival = 0;
    double      dval = 0;
    bool        bval = false;
    string      sval;
    vector<J>   aval;

    // Accessors
    int         asInt()    const { return (int)ival; }
    long long   asLong()   const { return ival; }
    double      asDouble() const { return type==DOUBLE?dval:(double)ival; }
    bool        asBool()   const { return bval; }
    string      asStr()    const { return sval; }
    vector<int> asVecInt() const {
        vector<int> v; for(auto&x:aval) v.push_back(x.asInt()); return v;
    }
    vector<long long> asVecLong() const {
        vector<long long> v; for(auto&x:aval) v.push_back(x.asLong()); return v;
    }
    vector<double> asVecDouble() const {
        vector<double> v; for(auto&x:aval) v.push_back(x.asDouble()); return v;
    }
    vector<string> asVecStr() const {
        vector<string> v; for(auto&x:aval) v.push_back(x.asStr()); return v;
    }
    vector<vector<int>> asVecVecInt() const {
        vector<vector<int>> v;
        for(auto&x:aval) v.push_back(x.asVecInt());
        return v;
    }
};

// ── JSON parser ───────────────────────────────────────────────────────────────
static size_t _pos;
static string _src;

static void skip_ws() { while(_pos<_src.size()&&isspace(_src[_pos]))_pos++; }

static J parse_value();

static J parse_array() {
    J j; j.type=J::ARR; _pos++; // skip '['
    skip_ws();
    if(_pos<_src.size()&&_src[_pos]==']'){_pos++;return j;}
    while(true){
        skip_ws();
        j.aval.push_back(parse_value());
        skip_ws();
        if(_pos>=_src.size()||_src[_pos]==']'){_pos++;break;}
        if(_src[_pos]==',')_pos++;
    }
    return j;
}

static J parse_string() {
    J j; j.type=J::STR; _pos++; // skip '"'
    while(_pos<_src.size()&&_src[_pos]!='"'){
        if(_src[_pos]=='\\'&&_pos+1<_src.size()){_pos++;j.sval+=_src[_pos++];}
        else j.sval+=_src[_pos++];
    }
    if(_pos<_src.size())_pos++; // skip closing '"'
    return j;
}

static J parse_value() {
    skip_ws();
    if(_pos>=_src.size()){J j;return j;}
    char c=_src[_pos];
    if(c=='[') return parse_array();
    if(c=='"') return parse_string();
    if(c=='t'){_pos+=4;J j;j.type=J::BOOL;j.bval=true;return j;}
    if(c=='f'){_pos+=5;J j;j.type=J::BOOL;j.bval=false;return j;}
    if(c=='n'){_pos+=4;J j;j.type=J::NUL;return j;}
    // number
    size_t start=_pos;
    bool is_float=false;
    if(c=='-')_pos++;
    while(_pos<_src.size()&&(isdigit(_src[_pos])||_src[_pos]=='.'||_src[_pos]=='e'||_src[_pos]=='E'||_src[_pos]=='+'||_src[_pos]=='-')){
        if(_src[_pos]=='.'||_src[_pos]=='e'||_src[_pos]=='E') is_float=true;
        _pos++;
    }
    string num=_src.substr(start,_pos-start);
    J j;
    if(is_float){j.type=J::DOUBLE;j.dval=stod(num);}
    else{j.type=J::INT;j.ival=stoll(num);}
    return j;
}

static vector<J> parse_json_args(const string& line) {
    _src=line; _pos=0;
    skip_ws();
    if(_pos<_src.size()&&_src[_pos]=='['){
        J arr=parse_array();
        return arr.aval;
    }
    // single value
    return {parse_value()};
}

// C2D standard data-structure definitions
""" + standard_defs_code + """

// User solution
""" + source_code + """

// Data-structure conversion helpers
static vector<string> __c2d_split_tokens(const string& s) {
    vector<string> out; string tok; stringstream ss(s);
    while (ss >> tok) out.push_back(tok);
    return out;
}

static bool __c2d_is_null_token(const string& s) {
    string t=s; transform(t.begin(), t.end(), t.begin(), ::tolower);
    return t=="null" || t=="none" || t=="nil" || t=="#";
}

static long long __c2d_long_value(const J& v) {
    if (v.type == J::INT) return v.ival;
    if (v.type == J::DOUBLE) return (long long)v.dval;
    if (v.type == J::BOOL) return v.bval ? 1 : 0;
    if (v.type == J::STR) {
        auto toks = __c2d_split_tokens(v.sval);
        if (!toks.empty() && !__c2d_is_null_token(toks[0])) return stoll(toks[0]);
        return 0;
    }
    if (v.type == J::ARR && !v.aval.empty()) return __c2d_long_value(v.aval[0]);
    return 0;
}

static double __c2d_double_value(const J& v) {
    if (v.type == J::DOUBLE) return v.dval;
    if (v.type == J::INT) return (double)v.ival;
    if (v.type == J::STR) {
        auto toks = __c2d_split_tokens(v.sval);
        return toks.empty() ? 0.0 : stod(toks[0]);
    }
    if (v.type == J::ARR && !v.aval.empty()) return __c2d_double_value(v.aval[0]);
    return 0.0;
}

static string __c2d_string_value(const J& v) {
    if (v.type == J::STR) return v.sval;
    if (v.type == J::INT) return to_string(v.ival);
    if (v.type == J::DOUBLE) { ostringstream os; os << v.dval; return os.str(); }
    if (v.type == J::BOOL) return v.bval ? "true" : "false";
    return "";
}

static bool __c2d_bool_value(const J& v) {
    if (v.type == J::BOOL) return v.bval;
    if (v.type == J::INT) return v.ival != 0;
    if (v.type == J::STR) {
        string s = v.sval; transform(s.begin(), s.end(), s.begin(), ::tolower);
        return s == "true" || s == "1" || s == "yes";
    }
    return false;
}

static int __c2d_int_arg(const vector<J>& args, int i) { return i < (int)args.size() ? (int)__c2d_long_value(args[i]) : 0; }
static long long __c2d_long_arg(const vector<J>& args, int i) { return i < (int)args.size() ? __c2d_long_value(args[i]) : 0; }
static double __c2d_double_arg(const vector<J>& args, int i) { return i < (int)args.size() ? __c2d_double_value(args[i]) : 0.0; }
static bool __c2d_bool_arg(const vector<J>& args, int i) { return i < (int)args.size() ? __c2d_bool_value(args[i]) : false; }
static string __c2d_string_arg(const vector<J>& args, int i) { return i < (int)args.size() ? __c2d_string_value(args[i]) : ""; }
static char __c2d_char_arg(const vector<J>& args, int i) { string s = __c2d_string_arg(args, i); return s.empty() ? '\0' : s[0]; }

static vector<J> __c2d_slice_or_nested(const vector<J>& args, int start) {
    if (start >= (int)args.size()) return {};
    if (args[start].type == J::ARR) return args[start].aval;
    if (start == 0) return args;
    return vector<J>(args.begin() + start, args.end());
}

static vector<int> __c2d_vec_int(const vector<J>& args, int start) {
    vector<int> out;
    for (const J& v : __c2d_slice_or_nested(args, start)) {
        if (v.type == J::STR) {
            for (auto& tok : __c2d_split_tokens(v.sval)) if (!__c2d_is_null_token(tok)) out.push_back(stoi(tok));
        } else {
            out.push_back((int)__c2d_long_value(v));
        }
    }
    return out;
}

static vector<long long> __c2d_vec_long(const vector<J>& args, int start) {
    vector<long long> out; for (const J& v : __c2d_slice_or_nested(args, start)) out.push_back(__c2d_long_value(v)); return out;
}
static vector<double> __c2d_vec_double(const vector<J>& args, int start) {
    vector<double> out; for (const J& v : __c2d_slice_or_nested(args, start)) out.push_back(__c2d_double_value(v)); return out;
}
static vector<string> __c2d_vec_string(const vector<J>& args, int start) {
    vector<string> out; for (const J& v : __c2d_slice_or_nested(args, start)) out.push_back(__c2d_string_value(v)); return out;
}
static vector<char> __c2d_vec_char(const vector<J>& args, int start) {
    vector<char> out; for (const string& s : __c2d_vec_string(args, start)) if (!s.empty()) out.push_back(s[0]); return out;
}
static vector<bool> __c2d_vec_bool(const vector<J>& args, int start) {
    vector<bool> out; for (const J& v : __c2d_slice_or_nested(args, start)) out.push_back(__c2d_bool_value(v)); return out;
}

static vector<vector<J>> __c2d_rows(const vector<J>& args, int start) {
    vector<vector<J>> rows;
    if (start >= (int)args.size()) return rows;
    if (args[start].type == J::ARR && !args[start].aval.empty() && args[start].aval[0].type == J::ARR) {
        for (const J& row : args[start].aval) rows.push_back(row.aval);
    } else {
        for (int i=start; i<(int)args.size(); ++i) {
            if (args[i].type == J::ARR) rows.push_back(args[i].aval);
            else rows.push_back({args[i]});
        }
    }
    if (rows.size() >= 2 && rows[0].size() == 2) {
        int r = (int)__c2d_long_value(rows[0][0]);
        int c = (int)__c2d_long_value(rows[0][1]);
        if (r >= 0 && c >= 0 && (int)rows.size() - 1 >= r) {
            bool dimensions_match = true;
            for (int i=1; i<=r; ++i) if ((int)rows[i].size() != c) dimensions_match = false;
            if (dimensions_match) rows.erase(rows.begin());
        }
    }
    return rows;
}

static vector<vector<int>> __c2d_matrix_int(const vector<J>& args, int start) {
    vector<vector<int>> out;
    for (auto& row : __c2d_rows(args, start)) {
        vector<int> r; for (auto& v : row) r.push_back((int)__c2d_long_value(v)); out.push_back(r);
    }
    return out;
}
static vector<vector<long long>> __c2d_matrix_long(const vector<J>& args, int start) {
    vector<vector<long long>> out; for (auto& row : __c2d_rows(args, start)) { vector<long long> r; for (auto& v : row) r.push_back(__c2d_long_value(v)); out.push_back(r); } return out;
}
static vector<vector<double>> __c2d_matrix_double(const vector<J>& args, int start) {
    vector<vector<double>> out; for (auto& row : __c2d_rows(args, start)) { vector<double> r; for (auto& v : row) r.push_back(__c2d_double_value(v)); out.push_back(r); } return out;
}
static vector<vector<string>> __c2d_matrix_string(const vector<J>& args, int start) {
    vector<vector<string>> out; for (auto& row : __c2d_rows(args, start)) { vector<string> r; for (auto& v : row) r.push_back(__c2d_string_value(v)); out.push_back(r); } return out;
}
static vector<vector<char>> __c2d_matrix_char(const vector<J>& args, int start) {
    vector<vector<char>> out; for (auto& row : __c2d_matrix_string(args, start)) { vector<char> r; for (auto& s : row) r.push_back(s.empty()?'\0':s[0]); out.push_back(r); } return out;
}

static TreeNode* __c2d_tree_arg(const vector<J>& args, int start) {
    vector<J> vals = __c2d_slice_or_nested(args, start);
    if (vals.empty() || vals[0].type == J::NUL) return nullptr;
    TreeNode* root = new TreeNode((int)__c2d_long_value(vals[0]));
    queue<TreeNode*> q; q.push(root);
    int i = 1;
    while (!q.empty() && i < (int)vals.size()) {
        TreeNode* node = q.front(); q.pop();
        if (i < (int)vals.size() && vals[i].type != J::NUL) { node->left = new TreeNode((int)__c2d_long_value(vals[i])); q.push(node->left); }
        ++i;
        if (i < (int)vals.size() && vals[i].type != J::NUL) { node->right = new TreeNode((int)__c2d_long_value(vals[i])); q.push(node->right); }
        ++i;
    }
    return root;
}

static ListNode* __c2d_list_arg(const vector<J>& args, int start) {
    vector<int> vals = __c2d_vec_int(args, start);
    ListNode dummy(0), *tail = &dummy;
    for (int v : vals) { tail->next = new ListNode(v); tail = tail->next; }
    return dummy.next;
}

static DoublyNode* __c2d_doubly_arg(const vector<J>& args, int start) {
    vector<int> vals = __c2d_vec_int(args, start);
    DoublyNode* head = nullptr; DoublyNode* tail = nullptr;
    for (int v : vals) { auto* node = new DoublyNode(v); if (!head) head = node; node->prev = tail; if (tail) tail->next = node; tail = node; }
    return head;
}

static Node* __c2d_nary_arg(const vector<J>& args, int start) {
    vector<J> vals = __c2d_slice_or_nested(args, start);
    if (vals.empty() || vals[0].type == J::NUL) return nullptr;
    Node* root = new Node((int)__c2d_long_value(vals[0]));
    queue<Node*> q; q.push(root);
    int i = (vals.size() > 1 && vals[1].type == J::NUL) ? 2 : 1;
    while (!q.empty() && i < (int)vals.size()) {
        Node* parent = q.front(); q.pop();
        while (i < (int)vals.size() && vals[i].type != J::NUL) {
            Node* child = new Node((int)__c2d_long_value(vals[i++]));
            parent->children.push_back(child); q.push(child);
        }
        ++i;
    }
    return root;
}

static pair<int,int> __c2d_pair_int(const vector<J>& args, int start) {
    vector<int> v = __c2d_vec_int(args, start);
    return {v.size() > 0 ? v[0] : 0, v.size() > 1 ? v[1] : 0};
}
static vector<pair<int,int>> __c2d_intervals(const vector<J>& args, int start) {
    vector<pair<int,int>> out; for (auto& row : __c2d_matrix_int(args, start)) if (row.size() >= 2) out.push_back({row[0], row[1]}); return out;
}
static stack<int> __c2d_stack_int(const vector<J>& args, int start) { stack<int> s; for (int v : __c2d_vec_int(args, start)) s.push(v); return s; }
static queue<int> __c2d_queue_int(const vector<J>& args, int start) { queue<int> q; for (int v : __c2d_vec_int(args, start)) q.push(v); return q; }
static deque<int> __c2d_deque_int(const vector<J>& args, int start) { auto v = __c2d_vec_int(args, start); return deque<int>(v.begin(), v.end()); }
static priority_queue<int> __c2d_priority_queue_int(const vector<J>& args, int start) { priority_queue<int> pq; for (int v : __c2d_vec_int(args, start)) pq.push(v); return pq; }
static unordered_set<int> __c2d_unordered_set_int(const vector<J>& args, int start) { unordered_set<int> s; for (int v : __c2d_vec_int(args, start)) s.insert(v); return s; }
static unordered_map<int,int> __c2d_unordered_map_int(const vector<J>& args, int start) { unordered_map<int,int> m; for (auto& p : __c2d_intervals(args, start)) m[p.first] = p.second; return m; }

// ── Serializer ────────────────────────────────────────────────────────────────
static string serialize(int v)         { return to_string(v); }
static string serialize(long long v)   { return to_string(v); }
static string serialize(double v)      { ostringstream s;s<<v;return s.str(); }
static string serialize(bool v)        { return v?"true":"false"; }
static string serialize(const string&v){ return v; }
static string serialize(char v)        { return string(1, v); }
static string serialize(const vector<int>&v){
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+=to_string(v[i]);}
    return s+"]";
}
static string serialize(const vector<long long>&v){
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+=to_string(v[i]);}
    return s+"]";
}
static string serialize(const vector<string>&v){
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+="\""+v[i]+"\"";}
    return s+"]";
}
static string serialize(const vector<vector<int>>&v){
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+=serialize(v[i]);}
    return s+"]";
}

template<class A, class B>
static string serialize(const pair<A,B>& p) {
    return "[" + serialize(p.first) + "," + serialize(p.second) + "]";
}

template<class T>
static string serialize(const vector<T>& v) {
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+=serialize(v[i]);}
    return s+"]";
}

template<class T>
static string serialize(const deque<T>& v) {
    string s="[";
    for(int i=0;i<(int)v.size();i++){if(i)s+=",";s+=serialize(v[i]);}
    return s+"]";
}

static string serialize(TreeNode* root) {
    if (!root) return "[]";
    vector<string> vals; queue<TreeNode*> q; q.push(root);
    while (!q.empty()) {
        TreeNode* node = q.front(); q.pop();
        if (!node) { vals.push_back("null"); continue; }
        vals.push_back(to_string(node->val));
        q.push(node->left); q.push(node->right);
    }
    while (!vals.empty() && vals.back()=="null") vals.pop_back();
    string s="[";
    for(int i=0;i<(int)vals.size();++i){ if(i)s+=","; s+=vals[i]; }
    return s+"]";
}

static string serialize(ListNode* head) {
    vector<int> vals;
    while (head) { vals.push_back(head->val); head = head->next; }
    return serialize(vals);
}

static string serialize(DoublyNode* head) {
    vector<int> vals;
    while (head) { vals.push_back(head->val); head = head->next; }
    return serialize(vals);
}

static string serialize(Node* root) {
    if (!root) return "[]";
    vector<string> vals; queue<Node*> q; q.push(root); vals.push_back(to_string(root->val)); vals.push_back("null");
    while (!q.empty()) {
        Node* node = q.front(); q.pop();
        for (Node* child : node->children) { vals.push_back(to_string(child->val)); q.push(child); }
        vals.push_back("null");
    }
    while (!vals.empty() && vals.back()=="null") vals.pop_back();
    string s="[";
    for(int i=0;i<(int)vals.size();++i){ if(i)s+=","; s+=vals[i]; }
    return s+"]";
}

static string serialize(stack<int> st) {
    vector<int> vals; while(!st.empty()){ vals.push_back(st.top()); st.pop(); } return serialize(vals);
}
static string serialize(queue<int> q) {
    vector<int> vals; while(!q.empty()){ vals.push_back(q.front()); q.pop(); } return serialize(vals);
}
static string serialize(priority_queue<int> pq) {
    vector<int> vals; while(!pq.empty()){ vals.push_back(pq.top()); pq.pop(); } return serialize(vals);
}
static string serialize(const unordered_set<int>& s) {
    vector<int> vals(s.begin(), s.end()); sort(vals.begin(), vals.end()); return serialize(vals);
}
static string serialize(const unordered_map<int,int>& m) {
    vector<pair<int,int>> vals(m.begin(), m.end()); sort(vals.begin(), vals.end()); return serialize(vals);
}

// ── User solution ─────────────────────────────────────────────────────────────
// ── Main: read args, call solution, print result ──────────────────────────────
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string line;
    if (!getline(cin, line) || line.empty()) line = "[]";

    vector<J> args = parse_json_args(line);

    """ + ("Solution sol;" if has_solution_class else "") + """
    auto call = [&]() -> string {
""" + _generate_cpp_call(func_name, match, source_code, has_solution_class) + """
        return "null";
    };

    cout << call() << endl;
    return 0;
}
"""
    return wrapper


# ── Typed C++ wrapper (schema-driven, currently only needed for GraphNode) ──
# Same root cause/fix as the Python and Java versions: the untyped wrapper
# above injects an n-ary-tree-shaped `Node` (val + children) when the
# student's code doesn't define its own, which is wrong for a graph (val +
# neighbors, possibly cyclic). Reuses the SAME J-struct JSON parser as the
# untyped wrapper (copied verbatim below — this file has no shared-constant
# extraction point for it) but skips the regex-based signature detection
# entirely: the schema already tells us the exact param count/order/types,
# so args are built directly, the same principle as the Java typed wrapper.
_CPP_JSON_PARSER = r"""
struct J {
    enum Type { INT, DOUBLE, BOOL, STR, ARR, NUL } type = NUL;
    long long   ival = 0;
    double      dval = 0;
    bool        bval = false;
    string      sval;
    vector<J>   aval;
    int         asInt()    const { return (int)ival; }
    double      asDouble() const { return type==DOUBLE?dval:(double)ival; }
    bool        asBool()   const { return bval; }
    string      asStr()    const { return sval; }
    vector<int> asVecInt() const { vector<int> v; for(auto&x:aval) v.push_back(x.asInt()); return v; }
};

static size_t _pos;
static string _src;
static void skip_ws() { while(_pos<_src.size()&&isspace(_src[_pos]))_pos++; }
static J parse_value();
static J parse_array() {
    J j; j.type=J::ARR; _pos++;
    skip_ws();
    if(_pos<_src.size()&&_src[_pos]==']'){_pos++;return j;}
    while(true){
        skip_ws();
        j.aval.push_back(parse_value());
        skip_ws();
        if(_pos>=_src.size()||_src[_pos]==']'){_pos++;break;}
        if(_src[_pos]==',')_pos++;
    }
    return j;
}
static J parse_string() {
    J j; j.type=J::STR; _pos++;
    while(_pos<_src.size()&&_src[_pos]!='"'){
        if(_src[_pos]=='\\'&&_pos+1<_src.size()){_pos++;j.sval+=_src[_pos++];}
        else j.sval+=_src[_pos++];
    }
    if(_pos<_src.size())_pos++;
    return j;
}
static J parse_value() {
    skip_ws();
    if(_pos>=_src.size()){J j;return j;}
    char c=_src[_pos];
    if(c=='[') return parse_array();
    if(c=='"') return parse_string();
    if(c=='t'){_pos+=4;J j;j.type=J::BOOL;j.bval=true;return j;}
    if(c=='f'){_pos+=5;J j;j.type=J::BOOL;j.bval=false;return j;}
    if(c=='n'){_pos+=4;J j;j.type=J::NUL;return j;}
    size_t start=_pos;
    bool is_float=false;
    if(c=='-')_pos++;
    while(_pos<_src.size()&&(isdigit(_src[_pos])||_src[_pos]=='.'||_src[_pos]=='e'||_src[_pos]=='E'||_src[_pos]=='+'||_src[_pos]=='-')){
        if(_src[_pos]=='.'||_src[_pos]=='e'||_src[_pos]=='E') is_float=true;
        _pos++;
    }
    string num=_src.substr(start,_pos-start);
    J j;
    if(is_float){j.type=J::DOUBLE;j.dval=stod(num);}
    else{j.type=J::INT;j.ival=stoll(num);}
    return j;
}
static vector<J> parse_json_args(const string& line) {
    _src=line; _pos=0;
    skip_ws();
    if(_pos<_src.size()&&_src[_pos]=='['){
        J arr=parse_array();
        return arr.aval;
    }
    return {parse_value()};
}
"""

_CPP_GRAPH_HELPERS = r"""
class Node {
public:
    int val;
    vector<Node*> neighbors;
    Node() { val = 0; neighbors = vector<Node*>(); }
    Node(int _val) { val = _val; neighbors = vector<Node*>(); }
    Node(int _val, vector<Node*> _neighbors) { val = _val; neighbors = _neighbors; }
};

static Node* __c2d_build_graph(const J& adjList) {
    if (adjList.type != J::ARR || adjList.aval.empty()) return nullptr;
    int n = (int)adjList.aval.size();
    vector<Node*> nodes(n + 1, nullptr);
    for (int i = 1; i <= n; i++) nodes[i] = new Node(i);
    for (int i = 0; i < n; i++) {
        for (const J& nb : adjList.aval[i].aval) nodes[i + 1]->neighbors.push_back(nodes[nb.asInt()]);
    }
    return nodes[1];
}

static string __c2d_serialize_graph(Node* start) {
    if (!start) return "[]";
    map<int, Node*> visited;
    visited[start->val] = start;
    queue<Node*> q; q.push(start);
    while (!q.empty()) {
        Node* n = q.front(); q.pop();
        for (Node* nb : n->neighbors) {
            if (visited.find(nb->val) == visited.end()) { visited[nb->val] = nb; q.push(nb); }
        }
    }
    vector<string> rows;
    for (auto& kv : visited) {
        vector<int> vals;
        for (Node* nb : kv.second->neighbors) vals.push_back(nb->val);
        sort(vals.begin(), vals.end());
        vector<string> parts;
        for (int v : vals) parts.push_back(to_string(v));
        string row = "[";
        for (size_t i = 0; i < parts.size(); i++) { if (i) row += ","; row += parts[i]; }
        row += "]";
        rows.push_back(row);
    }
    string out = "[";
    for (size_t i = 0; i < rows.size(); i++) { if (i) out += ","; out += rows[i]; }
    out += "]";
    return out;
}
"""


def _build_cpp_wrapper_typed(source_code: str, candidates: list[str], schema: dict) -> str | None:
    """Schema-driven C++ driver — only diverges from _build_cpp_wrapper when
    a GraphNode is actually involved; otherwise returns None so the caller
    falls back to the untyped builder unchanged."""
    params = param_types.ordered_params(schema)
    return_type = schema.get("return_type", "")
    if not any(p["type"] == "GraphNode" for p in params) and return_type != "GraphNode":
        return None

    func_name = None
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\(', source_code):
            func_name = name
            break
    if not func_name and candidates:
        func_name = candidates[0]
    if not func_name:
        func_name = "solution"

    arg_exprs = []
    for i, p in enumerate(params):
        base = param_types.base_scalar_type(p["type"])
        dims = param_types.array_dimensions(p["type"])
        if p["type"] == "GraphNode":
            arg_exprs.append(f"__c2d_build_graph(args[{i}])")
        elif dims == 1 and base == "int":
            arg_exprs.append(f"args[{i}].asVecInt()")
        elif base in ("float", "double"):
            arg_exprs.append(f"args[{i}].asDouble()")
        elif base == "string":
            arg_exprs.append(f"args[{i}].asStr()")
        elif base == "boolean":
            arg_exprs.append(f"args[{i}].asBool()")
        else:
            arg_exprs.append(f"args[{i}].asInt()")
    call_expr = f'sol.{func_name}({", ".join(arg_exprs)})'

    if return_type == "GraphNode":
        print_expr = f"__c2d_serialize_graph({call_expr})"
    elif return_type == "boolean":
        print_expr = f'(({call_expr}) ? "true" : "false")'
    elif return_type == "string":
        print_expr = call_expr
    else:
        print_expr = f"({call_expr})"  # int/float/double — ostream << handles these directly

    wrapper = r"""
#include <bits/stdc++.h>
using namespace std;
""" + _CPP_JSON_PARSER + _CPP_GRAPH_HELPERS + r"""

// User solution
""" + source_code + r"""

int main() {
    string line;
    if (!getline(cin, line) || line.empty()) line = "[]";
    vector<J> args = parse_json_args(line);
    Solution sol;
    cout << """ + print_expr + r""" << endl;
    return 0;
}
"""
    return wrapper


def _build_csharp_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build C# wrapper that reads from stdin and calls the solution method."""
    candidate_list = json.dumps(candidates)
    return f'''
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.Json;

{source_code}

class Program {{
    static void Main(string[] args) {{
        string line = Console.ReadLine();
        if (string.IsNullOrWhiteSpace(line)) line = "[]";
        
        var arguments = JsonSerializer.Deserialize<List<JsonElement>>(line);
        
        // Try to find and call solution method
        var candidates = {candidate_list};
        object result = null;
        
        // Try to find Solution class and instantiate it
        object solutionInstance = null;
        Type solutionType = null;
        try {{
            solutionType = Type.GetType("Solution");
            if (solutionType == null) {{
                // Try to find any class that might contain the solution
                var allTypes = System.Reflection.Assembly.GetExecutingAssembly().GetTypes();
                foreach (var t in allTypes) {{
                    if (t.Name == "Solution") {{
                        solutionType = t;
                        break;
                    }}
                }}
            }}
            if (solutionType != null) {{
                solutionInstance = Activator.CreateInstance(solutionType);
            }}
        }} catch {{ }}
        
        foreach (var name in candidates) {{
            if (solutionInstance != null && solutionType != null) {{
                // Try instance method on Solution
                try {{
                    var method = solutionType.GetMethod(name);
                    if (method != null) {{
                        var methodArgs = arguments.Select(a => ParseValue(a)).ToArray();
                        result = method.Invoke(solutionInstance, methodArgs);
                        break;
                    }}
                }} catch {{ }}
            }}
            
            // Try static method on Solution
            try {{
                var method = typeof(Solution).GetMethod(name);
                if (method != null && method.IsStatic) {{
                    var methodArgs = arguments.Select(a => ParseValue(a)).ToArray();
                    result = method.Invoke(null, methodArgs);
                    break;
                }}
            }} catch {{ }}
        }}
        
        if (result != null) {{
            Console.WriteLine(JsonSerializer.Serialize(result));
        }}
    }}
    
    static object ParseValue(JsonElement elem) {{
        switch (elem.ValueKind) {{
            case JsonValueKind.Number: return elem.GetInt64();
            case JsonValueKind.String: return elem.GetString();
            case JsonValueKind.True: return true;
            case JsonValueKind.False: return false;
            case JsonValueKind.Array: return elem.EnumerateArray().Select(a => ParseValue(a)).ToList();
            default: return null;
        }}
    }}
}}
'''.strip()


def _build_python_wrapper(source_code: str, candidates: list[str]) -> str:
    """
    Build a Python driver that:
      1. Injects standard DS class definitions (TreeNode, ListNode)
      2. Reads JSON args from stdin
      3. Finds and calls the solution function/method
      4. Serialises the result back to stdout
    """
    candidate_list = json.dumps(candidates)
    return f"""
# ── Data structure definitions (always available) ────────────────────────────
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right
    def __repr__(self): return f"TreeNode({{self.val}})"

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next
    def __repr__(self): return f"ListNode({{self.val}})"

class DoublyNode:
    def __init__(self, val=0, prev=None, next=None):
        self.val = val; self.prev = prev; self.next = next
    def __repr__(self): return f"DoublyNode({{self.val}})"

class Node:
    def __init__(self, val=0, children=None):
        self.val = val; self.children = children or []
    def __repr__(self): return f"Node({{self.val}})"

def __c2d_to_tree(vals):
    if not vals or vals[0] is None: return None
    from collections import deque as _dq
    root = TreeNode(vals[0]); q = _dq([root]); i = 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals) and vals[i] is not None:
            node.left = TreeNode(vals[i]); q.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None:
            node.right = TreeNode(vals[i]); q.append(node.right)
        i += 1
    return root

def __c2d_from_tree(root):
    if not root: return []
    from collections import deque as _dq
    result, q = [], _dq([root])
    while q:
        node = q.popleft()
        if node: result.append(node.val); q.append(node.left); q.append(node.right)
        else: result.append(None)
    while result and result[-1] is None: result.pop()
    return result

def __c2d_to_linked(vals):
    if not vals: return None
    head = ListNode(vals[0]); curr = head
    for v in vals[1:]: curr.next = ListNode(v); curr = curr.next
    return head

def __c2d_from_linked(head):
    result = []
    while head: result.append(head.val); head = head.next
    return result

def __c2d_to_doubly(vals):
    head = prev = None
    for v in vals or []:
        node = DoublyNode(v)
        if not head: head = node
        node.prev = prev
        if prev: prev.next = node
        prev = node
    return head

def __c2d_to_nary(vals):
    if not vals or vals[0] is None: return None
    from collections import deque as _dq
    root = Node(vals[0]); q = _dq([root]); i = 2 if len(vals) > 1 and vals[1] is None else 1
    while q and i < len(vals):
        parent = q.popleft()
        while i < len(vals) and vals[i] is not None:
            child = Node(vals[i]); parent.children.append(child); q.append(child); i += 1
        i += 1
    return root

def __c2d_from_nary(root):
    if not root: return []
    from collections import deque as _dq
    vals, q = [root.val, None], _dq([root])
    while q:
        node = q.popleft()
        for child in node.children:
            vals.append(child.val); q.append(child)
        vals.append(None)
    while vals and vals[-1] is None: vals.pop()
    return vals

# ── Solution code ─────────────────────────────────────────────────────────────
{source_code}

# ── Driver ────────────────────────────────────────────────────────────────────
import json as __code2day_json
import sys as __code2day_sys
import inspect as __code2day_inspect

def __code2day_find_solver():
    candidates = {candidate_list}
    # 1. Check module-level globals by candidate names
    for name in candidates:
        fn = globals().get(name)
        if callable(fn) and not isinstance(fn, type):
            return fn
    # 2. Check Solution class methods by candidate names
    solution_cls = globals().get("Solution")
    if solution_cls:
        instance = solution_cls()
        for name in candidates:
            method = getattr(instance, name, None)
            if callable(method):
                return method
        # 3. Fallback: find the single public entry-point method on Solution
        _own_methods = [
            name for name, obj in vars(solution_cls).items()
            if not name.startswith("_") and callable(obj)
        ]
        if len(_own_methods) == 1:
            return getattr(instance, _own_methods[0])
    # 4. Fallback: try any standalone function defined in user code
    _known_internals = {"TreeNode", "ListNode"}
    for _name, _obj in globals().items():
        if _name.startswith("_") or _name in _known_internals:
            continue
        if callable(_obj) and not isinstance(_obj, type):
            return _obj
    raise RuntimeError(
        f"No solver function found. "
        f"Expected one of: {candidates}. "
        f"Make sure your function or Solution class method matches the problem."
    )

def __code2day_serialize(value):
    if value is None: return "null"
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, TreeNode):
        return __code2day_json.dumps(__c2d_from_tree(value), separators=(",", ":"))
    if isinstance(value, ListNode):
        return __code2day_json.dumps(__c2d_from_linked(value), separators=(",", ":"))
    if isinstance(value, DoublyNode):
        return __code2day_json.dumps(__c2d_from_linked(value), separators=(",", ":"))
    if isinstance(value, Node):
        return __code2day_json.dumps(__c2d_from_nary(value), separators=(",", ":"))
    if isinstance(value, str): return value
    return __code2day_json.dumps(value, separators=(",", ":"), ensure_ascii=False)

def __code2day_prepare_args(solver, args):
    sig = __code2day_inspect.signature(solver)
    params = [
        p for p in sig.parameters.values()
        if p.default is __code2day_inspect.Parameter.empty
        and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
    ]
    if len(params) == 1:
        name = params[0].name.lower()
        annot = str(params[0].annotation).lower()
        values = args[0] if len(args) == 1 and isinstance(args[0], list) else args
        if "treenode" in annot or name in {{"root", "tree"}}:
            return [__c2d_to_tree(values)]
        if "doubly" in annot or name in {{"dhead", "doublyhead"}}:
            return [__c2d_to_doubly(values)]
        if "listnode" in annot or name in {{"head", "list", "linkedlist"}}:
            return [__c2d_to_linked(values)]
        if annot.endswith("node") or name in {{"node", "naryroot"}}:
            return [__c2d_to_nary(values)]
        return [values] if len(args) > 1 else args
    if len(params) > 1 and len(args) == 1 and isinstance(args[0], list):
        return list(args[0])
    return args

if __name__ == "__main__":
    try:
        raw = __code2day_sys.stdin.read().strip()
        args = __code2day_json.loads(raw) if raw else []
        if not isinstance(args, list):
            args = [args]

        solver = __code2day_find_solver()

        try:
            sig = __code2day_inspect.signature(solver)
            param_count = len([
                p for p in sig.parameters.values()
                if p.default is __code2day_inspect.Parameter.empty
                and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD)
            ])
            result = solver(*__code2day_prepare_args(solver, args))
        except TypeError:
            # Arg count mismatch — try passing the whole list or unpacking
            try:
                result = solver(*args)
            except TypeError:
                result = solver(args)

        __code2day_sys.stdout.write(__code2day_serialize(result) + "\\n")
    except Exception as __c2d_err:
        import traceback as __c2d_tb
        __code2day_sys.stderr.write(__c2d_tb.format_exc())
        __code2day_sys.exit(1)
"""


# ── Typed Python wrapper (schema-driven, currently only needed for GraphNode) ─
# Python's reflection-based calling (_build_python_wrapper above) already
# handles scalars/arrays/TreeNode/ListNode fine via name/annotation guessing.
# GraphNode is the one shape nothing existing builds correctly — the old
# n-ary-tree __c2d_to_nary conversion a "node"-named param falls into builds a
# hierarchy (parent→children, no cycles), not a general undirected graph
# (arbitrary bidirectional neighbors, possibly cyclic) — exactly what a
# Clone-Graph-style adjacency list represents. This uses the schema's
# declared type (not a name guess) to know when a real graph, not a tree,
# needs to be built.
#
# The injected class is named `Node` (matching real LeetCode Python solutions,
# which construct `Node(val)` directly inside their own algorithm, e.g. Clone
# Graph's DFS copy step) — NOT `GraphNode`. This driver is only ever built for
# a GraphNode-schema problem, so there's no ambiguity with the *other* `Node`
# (n-ary tree, val+children) the untyped wrapper injects elsewhere; the two
# never coexist in the same generated file.
_PY_GRAPH_HELPERS = '''
class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val; self.neighbors = neighbors if neighbors is not None else []
    def __repr__(self): return f"Node({self.val})"

def __c2d_to_graph(adj_list):
    if not adj_list:
        return None
    nodes = {i + 1: Node(i + 1) for i in range(len(adj_list))}
    for i, neighbor_vals in enumerate(adj_list):
        nodes[i + 1].neighbors = [nodes[v] for v in neighbor_vals]
    return nodes[1]

def __c2d_from_graph(start):
    if not start:
        return []
    from collections import deque as _dq
    visited = {start.val: start}
    q = _dq([start])
    while q:
        node = q.popleft()
        for nb in node.neighbors:
            if nb.val not in visited:
                visited[nb.val] = nb
                q.append(nb)
    return [sorted(n.val for n in visited[v].neighbors) for v in sorted(visited)]
'''


def _build_python_wrapper_typed(source_code: str, candidates: list[str], schema: dict) -> str | None:
    """Schema-driven Python driver — only diverges from the untyped
    _build_python_wrapper when a GraphNode is actually involved; otherwise
    returns None so the caller falls back to the untyped builder unchanged
    (Python's reflection already handles every other type in our vocabulary
    correctly)."""
    params = param_types.ordered_params(schema)
    return_type = schema.get("return_type", "")
    if not any(p["type"] == "GraphNode" for p in params) and return_type != "GraphNode":
        return None

    candidate_list = json.dumps(candidates)
    param_types_json = json.dumps([p["type"] for p in params])
    returns_graph = return_type == "GraphNode"

    return f"""
# ── Data structure definitions (always available) ────────────────────────────
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next

class DoublyNode:
    def __init__(self, val=0, prev=None, next=None):
        self.val = val; self.prev = prev; self.next = next

{_PY_GRAPH_HELPERS}

# ── Solution code ─────────────────────────────────────────────────────────────
{source_code}

# ── Driver ────────────────────────────────────────────────────────────────────
import json as __code2day_json
import sys as __code2day_sys

def __code2day_find_solver():
    candidates = {candidate_list}
    for name in candidates:
        fn = globals().get(name)
        if callable(fn) and not isinstance(fn, type):
            return fn
    solution_cls = globals().get("Solution")
    if solution_cls:
        instance = solution_cls()
        for name in candidates:
            method = getattr(instance, name, None)
            if callable(method):
                return method
        _own_methods = [
            name for name, obj in vars(solution_cls).items()
            if not name.startswith("_") and callable(obj)
        ]
        if len(_own_methods) == 1:
            return getattr(instance, _own_methods[0])
    raise RuntimeError(f"No solver function found. Expected one of: {{candidates}}.")

if __name__ == "__main__":
    try:
        raw = __code2day_sys.stdin.read().strip()
        args = __code2day_json.loads(raw) if raw else []
        if not isinstance(args, list):
            args = [args]

        __c2d_param_types = {param_types_json}
        converted = []
        for i, v in enumerate(args):
            t = __c2d_param_types[i] if i < len(__c2d_param_types) else None
            converted.append(__c2d_to_graph(v) if t == "GraphNode" else v)

        solver = __code2day_find_solver()
        result = solver(*converted)

        if {returns_graph!r}:
            __code2day_sys.stdout.write(__code2day_json.dumps(__c2d_from_graph(result), separators=(",", ":")) + "\\n")
        elif isinstance(result, bool):
            __code2day_sys.stdout.write(("true" if result else "false") + "\\n")
        elif isinstance(result, str):
            __code2day_sys.stdout.write(result + "\\n")
        else:
            __code2day_sys.stdout.write(__code2day_json.dumps(result, separators=(",", ":"), ensure_ascii=False) + "\\n")
    except Exception as __c2d_err:
        import traceback as __c2d_tb
        __code2day_sys.stderr.write(__c2d_tb.format_exc())
        __code2day_sys.exit(1)
"""


# ── Design/OOP problem drivers (LRU Cache, Trie, ZigzagIterator, ...) ────────
# A fundamentally different shape from every typed builder above: no single
# call in / value out. The wire format (built by _prepare_design_execution_payload)
# is a 2-element JSON array [operations, arguments] rather than a dict, so
# every language can reuse its existing array-only JSON parser unchanged —
# none of them had object/map parsing before this, and adding it just for
# this one wire format wasn't worth the risk. operations[0] is always the
# constructor (its name matches schema['class_name']); each subsequent
# operations[i] is a method name, called with arguments[i], and every
# call's result (None/null for void) is collected into one output array —
# exactly LeetCode's own convention for these problems.

def _build_python_design_wrapper(source_code: str, schema: dict) -> str:
    class_name = schema.get("class_name")
    return f"""
# ── Data structure definitions (always available) ────────────────────────────
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val; self.next = next

# ── Solution code ─────────────────────────────────────────────────────────────
{source_code}

# ── Driver ────────────────────────────────────────────────────────────────────
import json as __code2day_json
import sys as __code2day_sys

if __name__ == "__main__":
    try:
        data = __code2day_json.loads(__code2day_sys.stdin.read())
        operations, arguments = data[0], data[1]
        cls = globals()[{class_name!r}]
        obj = None
        results = []
        for op, op_args in zip(operations, arguments):
            if op == {class_name!r}:
                obj = cls(*op_args)
                results.append(None)
            else:
                results.append(getattr(obj, op)(*op_args))
        __code2day_sys.stdout.write(__code2day_json.dumps(results, separators=(",", ":"), ensure_ascii=False) + "\\n")
    except Exception as __c2d_err:
        import traceback as __c2d_tb
        __code2day_sys.stderr.write(__c2d_tb.format_exc())
        __code2day_sys.exit(1)
"""


_JAVA_DESIGN_SCALAR_CONVERTERS = {
    "int": "toInt", "double": "toDouble", "boolean": "toBool", "string": "toStringValue",
}
_JAVA_DESIGN_LIST_CONVERTERS = {
    "int": "toIntList", "double": "toDoubleList", "boolean": "toBoolList", "string": "toStringList",
}
_JAVA_DESIGN_MATRIX_CONVERTERS = {
    "int": "toIntMatrix", "double": "toDoubleMatrix", "boolean": "toBoolMatrix", "string": "toStringMatrix",
}


def _java_design_arg_expr(ptype: str, idx: int) -> str:
    """Scalars, 1D arrays (as List<T> — the real LeetCode convention for a
    Design/OOP problem's flat list-shaped params, e.g. ZigzagIterator(
    List<Integer> v1, List<Integer> v2)), and 2D arrays (as a raw T[][] —
    LeetCode's own convention diverges here: matrix-shaped constructor args
    like Vector2D(int[][] vec) use a native 2D array, not
    List<List<Integer>>). No "float" entry in the list/matrix converter
    maps (float arrays aren't needed by any design problem yet) — that
    raises KeyError, caught by the caller as a clear "can't build this
    driver" signal, same as any other genuinely unsupported type, rather
    than silently emitting a broken conversion."""
    dims = param_types.array_dimensions(ptype)
    base = param_types.base_scalar_type(ptype)
    if dims == 2:
        return f"{_JAVA_DESIGN_MATRIX_CONVERTERS[base]}(argsFor.get({idx}))"
    if dims == 1:
        return f"{_JAVA_DESIGN_LIST_CONVERTERS[base]}(argsFor.get({idx}))"
    if ptype == "float":
        return f"(float) toDouble(argsFor.get({idx}))"
    return f"{_JAVA_DESIGN_SCALAR_CONVERTERS[ptype]}(argsFor.get({idx}))"


def _build_java_design_wrapper(source_code: str, schema: dict) -> str:
    class_name = schema.get("class_name")
    methods = schema.get("methods", {})
    source_code = re.sub(rf'\bpublic\s+class\s+{re.escape(class_name)}\b', f'class {class_name}', source_code)
    source_code = re.sub(r'^\s*package\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)
    source_code = re.sub(r'^\s*import\s+[^;]+;\s*', '', source_code, flags=re.MULTILINE)

    cases = []
    for name, spec in methods.items():
        params = spec.get("params", [])
        return_type = spec.get("return_type", "void")
        args = ", ".join(_java_design_arg_expr(t, i) for i, t in enumerate(params))
        if name == class_name:
            body = f"obj = new {class_name}({args}); results.add(null);"
        elif return_type == "void":
            body = f"obj.{name}({args}); results.add(null);"
        else:
            body = f"results.add(obj.{name}({args}));"
        cases.append(f'                case {json.dumps(name)}: {body} break;')
    switch_body = "\n".join(cases)

    return r'''
import java.io.*;
import java.util.*;

class TreeNode { int val; TreeNode left, right; TreeNode() {} TreeNode(int v) { val = v; } }
class ListNode { int val; ListNode next; ListNode() {} ListNode(int v) { val = v; } }

''' + source_code + r'''

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        Object parsed = parseValue(sb.toString().trim());
        List<Object> data = (List<Object>) parsed;
        List<Object> operations = (List<Object>) data.get(0);
        List<Object> arguments = (List<Object>) data.get(1);

        ''' + class_name + r''' obj = null;
        List<Object> results = new ArrayList<>();

        for (int __i = 0; __i < operations.size(); __i++) {
            String op = (String) operations.get(__i);
            List<Object> argsFor = (List<Object>) arguments.get(__i);
            switch (op) {
''' + switch_body + r'''
                default: throw new RuntimeException("Unknown operation: " + op);
            }
        }

        System.out.println(serialize(results));
    }

    static Object parseValue(String s) {
        s = s.trim();
        if (s.isEmpty() || s.equalsIgnoreCase("null")) return null;
        if (s.equalsIgnoreCase("true")) return true;
        if (s.equalsIgnoreCase("false")) return false;
        if (s.startsWith("[") && s.endsWith("]")) return parseList(s.substring(1, s.length() - 1));
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) return s.substring(1, s.length() - 1);
        try { return s.contains(".") ? Double.parseDouble(s) : Integer.parseInt(s); }
        catch (NumberFormatException e) { return s; }
    }

    static List<Object> parseList(String s) {
        List<Object> result = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inString = false; char quote = 0; int depth = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (!inString && (c == '"' || c == '\'')) { inString = true; quote = c; cur.append(c); }
            else if (inString && c == quote) { inString = false; cur.append(c); }
            else if (!inString && c == '[') { depth++; cur.append(c); }
            else if (!inString && c == ']') { depth--; cur.append(c); }
            else if (!inString && c == ',' && depth == 0) { result.add(parseValue(cur.toString())); cur.setLength(0); }
            else cur.append(c);
        }
        if (cur.length() > 0) result.add(parseValue(cur.toString()));
        return result;
    }

    static int toInt(Object v) { return v instanceof Number ? ((Number) v).intValue() : Integer.parseInt(String.valueOf(v)); }
    static double toDouble(Object v) { return v instanceof Number ? ((Number) v).doubleValue() : Double.parseDouble(String.valueOf(v)); }
    static boolean toBool(Object v) { return v instanceof Boolean ? ((Boolean) v) : Boolean.parseBoolean(String.valueOf(v)); }
    static String toStringValue(Object v) { return v == null ? "" : String.valueOf(v); }

    static List<Object> asList(Object value) {
        return value instanceof List ? (List<Object>) value : new ArrayList<>(Arrays.asList(value));
    }
    // Design/OOP problems (ZigzagIterator, etc.) conventionally take array-shaped
    // constructor/method args as List<Integer>/List<String>/... , not a raw Java
    // array, matching real LeetCode signatures for these problem types.
    static List<Integer> toIntList(Object v) { List<Integer> out = new ArrayList<>(); for (Object o : asList(v)) out.add(toInt(o)); return out; }
    static List<Double> toDoubleList(Object v) { List<Double> out = new ArrayList<>(); for (Object o : asList(v)) out.add(toDouble(o)); return out; }
    static List<Boolean> toBoolList(Object v) { List<Boolean> out = new ArrayList<>(); for (Object o : asList(v)) out.add(toBool(o)); return out; }
    static List<String> toStringList(Object v) { List<String> out = new ArrayList<>(); for (Object o : asList(v)) out.add(toStringValue(o)); return out; }
    // Matrix-shaped constructor/method args (Vector2D(int[][] vec), etc.) —
    // a native 2D array, matching LeetCode's own convention for these,
    // unlike the flat List<T> convention used for 1D args above.
    static int[][] toIntMatrix(Object v) {
        List<Object> rows = asList(v);
        int[][] out = new int[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            List<Integer> r = toIntList(rows.get(i));
            out[i] = new int[r.size()];
            for (int j = 0; j < r.size(); j++) out[i][j] = r.get(j);
        }
        return out;
    }
    static double[][] toDoubleMatrix(Object v) {
        List<Object> rows = asList(v);
        double[][] out = new double[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            List<Double> r = toDoubleList(rows.get(i));
            out[i] = new double[r.size()];
            for (int j = 0; j < r.size(); j++) out[i][j] = r.get(j);
        }
        return out;
    }
    static boolean[][] toBoolMatrix(Object v) {
        List<Object> rows = asList(v);
        boolean[][] out = new boolean[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            List<Boolean> r = toBoolList(rows.get(i));
            out[i] = new boolean[r.size()];
            for (int j = 0; j < r.size(); j++) out[i][j] = r.get(j);
        }
        return out;
    }
    static String[][] toStringMatrix(Object v) {
        List<Object> rows = asList(v);
        String[][] out = new String[rows.size()][];
        for (int i = 0; i < rows.size(); i++) {
            List<String> r = toStringList(rows.get(i));
            out[i] = r.toArray(new String[0]);
        }
        return out;
    }

    static String serialize(Object obj) {
        if (obj == null) return "null";
        if (obj instanceof Boolean || obj instanceof Number) return obj.toString();
        if (obj instanceof String || obj instanceof Character) return "\"" + obj + "\"";
        if (obj instanceof List) { List<String> parts = new ArrayList<>(); for (Object v : (List<?>) obj) parts.add(serialize(v)); return "[" + String.join(",", parts) + "]"; }
        return obj.toString();
    }
}
'''


_CPP_DESIGN_HELPERS = r"""
static vector<double> __c2d_vec_double(const J& j) { vector<double> v; for (auto& x : j.aval) v.push_back(x.asDouble()); return v; }
static vector<bool>   __c2d_vec_bool(const J& j)   { vector<bool> v; for (auto& x : j.aval) v.push_back(x.asBool()); return v; }
static vector<string> __c2d_vec_string(const J& j) { vector<string> v; for (auto& x : j.aval) v.push_back(x.asStr()); return v; }
static vector<vector<int>>    __c2d_vec_vec_int(const J& j)    { vector<vector<int>> v; for (auto& x : j.aval) v.push_back(x.asVecInt()); return v; }
static vector<vector<double>> __c2d_vec_vec_double(const J& j) { vector<vector<double>> v; for (auto& x : j.aval) v.push_back(__c2d_vec_double(x)); return v; }
static vector<vector<bool>>   __c2d_vec_vec_bool(const J& j)   { vector<vector<bool>> v; for (auto& x : j.aval) v.push_back(__c2d_vec_bool(x)); return v; }
static vector<vector<string>> __c2d_vec_vec_string(const J& j) { vector<vector<string>> v; for (auto& x : j.aval) v.push_back(__c2d_vec_string(x)); return v; }

static string __c2d_json_escape(const string& s) {
    string out;
    for (char c : s) {
        if (c == '"' || c == '\\') out += '\\';
        out += c;
    }
    return out;
}

// Minimal serializer for the design-problem output array — scoped to the
// param_types.py vocabulary (int/float/double/string/boolean + 1D/2D arrays),
// not the full LeetCode structural-type serializer the function-style
// wrapper needs (TreeNode/graphs/etc. aren't valid design method types).
static string serialize(long long v)     { return to_string(v); }
static string serialize(int v)           { return to_string(v); }
static string serialize(double v)        { ostringstream s; s << v; return s.str(); }
static string serialize(bool v)          { return v ? "true" : "false"; }
static string serialize(const string& v) { return "\"" + __c2d_json_escape(v) + "\""; }
template<class T>
static string serialize(const vector<T>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ","; s += serialize(v[i]); }
    return s + "]";
}
"""

# Only "int" gets a distinct 1D accessor (J::asVecInt already exists on the
# shared parser) — the rest go through the __c2d_vec_* helpers above. No
# "float" entry, deliberately: matches _JAVA_DESIGN_LIST_CONVERTERS's scope
# limit (float arrays aren't needed by any design problem yet); a schema
# that declares one raises KeyError here, caught by the caller the same way
# an unbuildable Java driver already is.
_CPP_DESIGN_SCALAR_ACCESSOR = {"int": "asInt", "float": "asDouble", "double": "asDouble", "boolean": "asBool", "string": "asStr"}
_CPP_DESIGN_VEC1_FN = {"double": "__c2d_vec_double", "boolean": "__c2d_vec_bool", "string": "__c2d_vec_string"}
_CPP_DESIGN_VEC2_FN = {"int": "__c2d_vec_vec_int", "double": "__c2d_vec_vec_double", "boolean": "__c2d_vec_vec_bool", "string": "__c2d_vec_vec_string"}


def _cpp_design_arg_expr(ptype: str, idx: int) -> str:
    base = param_types.base_scalar_type(ptype)
    dims = param_types.array_dimensions(ptype)
    src = f"argsFor[{idx}]"
    if dims == 0:
        expr = f"{src}.{_CPP_DESIGN_SCALAR_ACCESSOR[base]}()"
    elif dims == 1:
        expr = f"{src}.asVecInt()" if base == "int" else f"{_CPP_DESIGN_VEC1_FN[base]}({src})"
    else:
        expr = f"{_CPP_DESIGN_VEC2_FN[base]}({src})"
    return f"(float)({expr})" if ptype == "float" else expr


def _build_cpp_design_wrapper(source_code: str, schema: dict) -> str:
    """Design/OOP driver for C++ — instantiates the student's class once and
    replays the operations/arguments sequence against it, LeetCode-style
    (Vector2D, LRUCache, ZigzagIterator, ...). Mirrors
    _build_python_design_wrapper/_build_java_design_wrapper's wire format
    ([operations, arguments] JSON array on stdin, a JSON array of per-op
    results on stdout) but dispatches via an if/else-if chain on the
    operation name since C++ has no string switch. May raise KeyError for a
    param type outside the design vocabulary this builder covers (e.g. a
    float array) — the caller (_prepare_design_execution_payload) already
    catches that and falls back to a clean compile-time #error instead of
    emitting broken C++."""
    class_name = schema.get("class_name")
    methods = schema.get("methods", {})

    dispatch = []
    for name, spec in methods.items():
        params = spec.get("params", [])
        return_type = spec.get("return_type", "void")
        # Bind each converted argument to a named local first, then pass the
        # locals by name — never a temporary directly. The student's method
        # may take e.g. `vector<vector<int>>& vec` (a non-const reference,
        # the actual LeetCode Vector2D signature); a temporary rvalue like
        # __c2d_vec_vec_int(argsFor[0]) can't bind to that, but a named
        # local variable is an lvalue and binds fine regardless of whether
        # the student declared the parameter by value, by const ref, or by
        # non-const ref.
        arg_names = [f"__a{i}" for i in range(len(params))]
        binds = "".join(
            f" auto {arg_names[i]} = {_cpp_design_arg_expr(t, i)};"
            for i, t in enumerate(params)
        )
        call_args = ", ".join(arg_names)
        if name == class_name:
            body = f'obj = new {class_name}({call_args}); results.push_back("null");'
        elif return_type == "void":
            body = f'obj->{name}({call_args}); results.push_back("null");'
        else:
            body = f'results.push_back(serialize(obj->{name}({call_args})));'
        keyword = "if" if not dispatch else "else if"
        dispatch.append(f'        {keyword} (op == {json.dumps(name)}) {{{binds} {body} }}')
    dispatch_code = "\n".join(dispatch)

    return r"""
#include <bits/stdc++.h>
using namespace std;

struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x=0): val(x), left(nullptr), right(nullptr) {} };
struct ListNode { int val; ListNode *next; ListNode(int x=0): val(x), next(nullptr) {} };

""" + _CPP_JSON_PARSER + _CPP_DESIGN_HELPERS + r"""

// ── Solution code ───────────────────────────────────────────────────────────
""" + source_code + r"""

// ── Driver ───────────────────────────────────────────────────────────────────
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    string __c2d_all_input((istreambuf_iterator<char>(cin)), istreambuf_iterator<char>());
    vector<J> __c2d_top = parse_json_args(__c2d_all_input);   // stdin is [operations, arguments]
    const J& __c2d_ops = __c2d_top[0];
    const J& __c2d_args = __c2d_top[1];

    """ + class_name + r"""* obj = nullptr;
    vector<string> results;
    for (size_t __i = 0; __i < __c2d_ops.aval.size(); __i++) {
        string op = __c2d_ops.aval[__i].asStr();
        vector<J> argsFor = __c2d_args.aval[__i].aval;
""" + dispatch_code + r"""
        else { throw runtime_error("Unknown operation: " + op); }
    }

    string out = "[";
    for (size_t i = 0; i < results.size(); i++) { if (i) out += ","; out += results[i]; }
    out += "]";
    cout << out << "\n";
    return 0;
}
"""


def _build_go_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Go wrapper that reads from stdin and calls the solution function."""
    # Only include candidates that actually appear in the source code to avoid compilation errors
    present_candidates = [c for c in candidates if f"func {c}" in source_code]
    
    candidate_calls = []
    for name in present_candidates:
        candidate_calls.append(f'''
    case "{name}":
        result = {name}(args)
        ok = true''')
    
    switch_body = '\n'.join(candidate_calls)
    
    return f'''
package main

import (
    "bufio"
    "encoding/json"
    "fmt"
    "os"
    "strings"
)

{source_code}

func findAndCallSolver(args interface{{}}, name string) (interface{{}}, bool) {{
    var result interface{{}}
    var ok bool
    
    switch name {{
    {switch_body}
    }}
    return result, ok
}}

func main() {{
    // Read all input from stdin
    scanner := bufio.NewScanner(os.Stdin)
    var input strings.Builder
    for scanner.Scan() {{
        input.WriteString(scanner.Text() + "\\n")
    }}
    line := strings.TrimSpace(input.String())
    if line == "" {{
        line = "[]"
    }}
    
    var args interface{{}}
    json.Unmarshal([]byte(line), &args)
    
    // We need the function name to call. Since we don't have it in the input,
    // we try all present candidates.
    candidates := []string{{{", ".join([f'"{c}"' for c in present_candidates])}}}
    
    for _, name := range candidates {{
        result, ok := findAndCallSolver(args, name)
        if ok {{
            output, _ := json.Marshal(result)
            fmt.Println(string(output))
            return
        }}
    }}
    
    fmt.Println("Error: Could not find matching solver function")
}}
'''.strip()


def _build_rust_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Rust wrapper that reads from stdin and calls the solution function."""
    # Only include candidates that actually appear in the source code
    present_candidates = [c for c in candidates if f"fn {c}" in source_code]
    
    # Generate match arms for present candidate functions
    match_arms = '\n        '.join([f'"{name}" => {{ let r = {name}(&args); return Some(serde_json::to_value(r).unwrap()); }}' for name in present_candidates])
    
    return f'''
use std::io::{{self, BufRead}};
use serde_json::Value;

{source_code}

fn find_and_call_solver(args: Value, name: &str) -> Option<Value> {{
    match name {{
        {match_arms}
        _ => None
    }}
}}

fn main() {{
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    
    let input_trimmed = if input.trim().is_empty() {{ "[]" }} else {{ input.trim() }};
    let args: Value = serde_json::from_str(input_trimmed).unwrap();
    
    let candidates = vec![{", ".join([f'"{c}"' for c in present_candidates])}];
    
    for name in candidates {{
        if let Some(result) = find_and_call_solver(args.clone(), name) {{
            println!("{{}}", serde_json::to_string(&result).unwrap());
            return;
        }}
    }}
    
    println!("Error: Could not find matching solver function");
}}
'''.strip()


def _build_kotlin_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Kotlin wrapper that reads from stdin and calls the solution function."""
    # Generate when branches for candidate functions
    when_branches = '\n        '.join([f'"{name}" -> solution.javaClass.getMethod(name).invoke(solution, args)' for name in candidates])
    return f'''
import org.json.JSONArray
import org.json.JSONObject

{source_code}

fun findAndCallSolver(args: Any): Any? {{
    // Try to find Solution class and instantiate it
    val solution = try {{
        Class.forName("Solution").getDeclaredConstructor().newInstance()
    }} catch (e: Exception) {{
        null
    }}
    
    if (solution != null) {{
        // Try each candidate method on the Solution instance
        for (name in listOf({', '.join([f'"{n}"' for n in candidates])})) {{
            val result = when (name) {{
                {when_branches}
                else -> null
            }}
            if (result != null) return result
        }}
    }}
    
    // Fallback: try standalone functions
    for (name in listOf({', '.join([f'"{n}"' for n in candidates])})) {{
        val result = when (name) {{
            {chr(39).join([f'"{name}" -> {name}(args)' for name in candidates])}
            else -> null
        }}
        if (result != null) return result
    }}
    return null
}}

fun main() {{
    val line = readLine() ?: "[]"
    val args = org.json.JSONArray(line)
    
    val result = findAndCallSolver(args)
    if (result != null) {{
        println(org.json.JSONObject.quote(result.toString()))
    }} else {{
        println("Error: Could not find matching solver function")
    }}
}}
'''.strip()


def _build_ruby_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Ruby wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
require 'json'

{source_code}

def find_solver(candidates)
  candidates.each do |name|
    return method(name) if respond_to?(name)
  end
  nil
end

input = gets || '[]'
args = JSON.parse(input.strip)

# Always pass args as a single argument (let function unpack if needed)
args = [args] unless args.is_a?(Array)

candidates = {candidate_list}
solver = find_solver(candidates)

if solver
  # Try calling with single argument first
  begin
    result = solver.call(args)
  rescue ArgumentError
    # If that fails, try unpacking
    result = solver.call(*args)
  end
  puts result.to_json
else
  puts 'Error: Could not find solver function'
end
'''.strip()


def _build_php_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build PHP wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
<?php
{source_code}

function find_solver($candidates) {{
    foreach ($candidates as $name) {{
        if (function_exists($name)) {{
            return $name;
        }}
    }}
    return null;
}}

$line = fgets(STDIN) ?: '[]';
$args = json_decode(trim($line), true);

// Always pass as single argument
if (!is_array($args)) $args = array($args);

$candidates = {candidate_list};
$solver = find_solver($candidates);

if ($solver) {{
    // Try single argument first, then unpacked
    try {{
        $result = call_user_func($solver, $args);
    }} catch (Throwable $e) {{
        $result = call_user_func_array($solver, $args);
    }}
    echo json_encode($result);
}} else {{
    echo "Error: Could not find solver function\\n";
}}
?>
'''.strip()


def _build_swift_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Swift wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    # Generate switch cases for candidate functions
    switch_cases = '\n        '.join([f'case "{name}": return solution.{name}(args)' for name in candidates])
    standalone_cases = '\n        '.join([f'case "{name}": return {name}(args)' for name in candidates])
    return f'''
import Foundation

{source_code}

func findAndCallSolver(args: Any) -> Any? {{
    let candidates = {candidate_list}
    
    // Try to find Solution class and instantiate it
    let solutionType: Any.Type? = NSClassFromString("Solution")
    if let solType = solutionType as? NSObject.Type {{
        let solution = solType.init()
        
        // Try instance methods on Solution
        for name in candidates {{
            switch name {{
            {switch_cases}
            default: break
            }}
        }}
    }}
    
    // Fallback: try standalone functions
    for name in candidates {{
        switch name {{
        {standalone_cases}
        default: break
        }}
    }}
    return nil
}}

if let line = readLine() {{
    let input = line.trimmingCharacters(in: .whitespaces)
    // Parse JSON
    if let data = input.data(using: .utf8),
       let args = try? JSONSerialization.jsonObject(with: data) {{
        if let result = findAndCallSolver(args: args) {{
            if let resultData = try? JSONSerialization.data(withJSONObject: result, options: []),
               let resultString = String(data: resultData, encoding: .utf8) {{
                print(resultString)
            }}
        }} else {{
            print("Error: Could not find matching solver function")
        }}
    }} else {{
        print("Error: Could not find matching solver function")
    }}
}} else {{
    print("[]")
}}
'''.strip()


def _build_bash_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Bash wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
#!/bin/bash

{source_code}

# Read input
read -r line
line="${{line:-[]}}"

# Parse JSON-like input (simplified)
# Note: Bash has limited JSON support, using simple parsing

candidates=({candidate_list})

# Try to find and call function
for name in "${{candidates[@]}}"; do
    if declare -f "$name" > /dev/null 2>&1; then
        # Simple argument parsing - call function with raw input
        result=$("$name" "$line" 2>/dev/null || echo "Error")
        echo "$result"
        exit 0
    fi
done

echo "Error: Could not find solver function"
'''.strip()


def _build_elixir_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Elixir wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
defmodule Main do
{source_code}

  def run do
    candidates = {candidate_list}
    line = IO.gets("") |> String.trim()
    input = if line == "", do: "[]", else: line
    
    # Try to find and call solution
    args = Jason.decode!(input)
    
    Enum.find_value(candidates, fn name ->
      try do
        func = String.to_atom(name)
        if function_exported?(Solution, func, length(args)) do
          apply(Solution, func, args)
        else
          nil
        end
      rescue
        _ -> nil
      end
    end)
    |> Jason.encode!()
    |> IO.puts()
  end
end

Main.run()
'''.strip()


def _build_erlang_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Erlang wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    # Generate explicit function calls
    func_calls = ';\n    '.join([f'try {{ {name}(Arg) }} catch _:_ -> continue' for name in candidates])
    return f'''
-module(main).
-export([main/0]).

{source_code}

find_and_call_solver([Arg|_]) ->
    Candidates = {candidate_list},
    try_candidates(Candidates, Arg);
find_and_call_solver([]) ->
    error.

try_candidates([Name|Rest], Arg) ->
    try
        Result = apply(list_to_atom(Name), [Arg]),
        Result
    catch
        _:_ -> try_candidates(Rest, Arg)
    end;
try_candidates([], _) ->
    error.

main() ->
    {{ok, [Line]}} = io:fread("", "~s"),
    Input = case Line of
        [] -> "[]";
        _ -> Line
    end,
    case find_and_call_solver([Input]) of
        error -> io:format("Error: Could not find matching solver function~n");
        Result -> io:format("~p~n", [Result])
    end.
'''.strip()


def _build_fsharp_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build F# wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    # Generate explicit match cases
    match_cases = '\n        '.join([f'| "{name}" -> Some({name}(arg))' for name in candidates])
    return f'''
open System
open Newtonsoft.Json.Linq

{source_code}

let findAndCallSolver (args: string list) : string option =
    let candidates = {candidate_list}
    
    match args with
    | arg::_ ->
        candidates
        |> List.tryPick (fun name ->
            match name with
            {match_cases}
            | _ -> None
        )
    | [] -> None

[<EntryPoint>]
let main argv =
    let line = Console.ReadLine()
    let input = if String.IsNullOrWhiteSpace(line) then "[]" else line
    
    try
        let json = JArray.Parse(input)
        let args = json |> Seq.map (fun x -> x.ToString()) |> Seq.toList
        
        match findAndCallSolver args with
        | Some(result) -> printfn "%s" result; 0
        | None -> printfn "Error: Could not find matching solver function"; 1
    with
    | _ -> printfn "Error: Invalid JSON input"; 1
'''.strip()


def _build_groovy_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Groovy wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

{source_code}

def findSolver(candidates) {{
    // Try to find Solution class and instantiate it
    try {{
        def solutionClass = Class.forName("Solution")
        def solution = solutionClass.getDeclaredConstructor().newInstance()
        for (name in candidates) {{
            if (solution.respondsTo(name)) {{
                return [instance: solution, method: name]
            }}
        }}
    }} catch (e) {{ }}
    
    // Fallback: try standalone closures
    for (name in candidates) {{
        if (binding.hasVariable(name) && binding.getVariable(name) instanceof Closure) {{
            return [instance: null, method: name]
        }}
    }}
    return null
}}

def line = System.in.newReader().readLine() ?: '[]'
def args = new JsonSlurper().parseText(line.trim())
if (!(args instanceof List)) args = [args]

def candidates = {candidate_list}
def solver = findSolver(candidates)

if (solver) {{
    def result
    if (solver.instance) {{
        // Call instance method on Solution
        result = solver.instance."${{solver.method}}"(*args)
    }} else {{
        // Call standalone closure
        result = binding.getVariable(solver.method).call(*args)
    }}
    println JsonOutput.toJson(result)
}} else {{
    println "Error: Could not find solver function"
}}
'''.strip()


def _build_objective_c_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Objective-C wrapper that reads from stdin and calls the solution method."""
    candidate_list = json.dumps(candidates)
    # Generate explicit calls for string-returning functions
    candidate_calls = '\n    '.join([f'if ([{name} respondsToSelector:@selector({name}:)]) {{ result = [{name} {name}:arg]; if (result) goto found; }}' for name in candidates])
    return f'''
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

{source_code}

NSString* findAndCallSolver(NSArray* args) {{
    NSArray* candidates = {candidate_list};
    
    if (args.count == 0) return nil;
    NSString* arg = args[0];
    NSString* result = nil;
    
    // Try each candidate
    {candidate_calls}
    
found:
    return result;
}}

int main(int argc, const char * argv[]) {{
    @autoreleasepool {{
        NSFileHandle *stdin = [NSFileHandle fileHandleWithStandardInput];
        NSData *data = [stdin availableData];
        NSString *line = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
        
        if ([line length] == 0) line = @"[]";
        
        NSData *jsonData = [line dataUsingEncoding:NSUTF8StringEncoding];
        NSError *error;
        NSArray *args = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
        if (!args) args = @[];
        
        NSString *result = findAndCallSolver(args);
        if (result) {{
            NSLog(@"%@", result);
        }} else {{
            NSLog(@"Error: Could not find matching solver function");
        }}
    }}
    return 0;
}}
'''.strip()


def _build_r_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build R wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
{source_code}

# Find and call the solver
candidates <- {candidate_list}
input_line <- readLines(con = "stdin", n = 1)
if (length(input_line) == 0 || input_line == "") input_line <- "[]"

args <- jsonlite::fromJSON(input_line)
if (!is.list(args)) args <- list(args)

# Try to find function by name
result <- NULL
for (name in candidates) {{
    if (exists(name, mode = "function")) {{
        fn <- get(name)
        result <- do.call(fn, args)
        break
    }}
}}

if (!is.null(result)) {{
    cat(jsonlite::toJSON(result, auto_unbox = TRUE))
}} else {{
    cat("Error: Could not find solver function")
}}
'''.strip()


def _build_haskell_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Haskell wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    # Generate explicit function calls
    func_calls = ';\n  '.join([f'tryJust ({name} <$> decode arg)' for name in candidates])
    return f'''
import System.IO
import Data.Aeson
import qualified Data.ByteString.Lazy.Char8 as B
import Control.Exception

{source_code}

tryJust :: Maybe a -> Maybe a
tryJust x = x

findAndCallSolver :: String -> Maybe String
findAndCallSolver arg =
    let candidates = {candidate_list}
    in  {func_calls}

main :: IO ()
main = do
    line <- getLine
    let input = if null line then "[]" else line
    
    case findAndCallSolver input of
        Just result -> putStrLn result
        Nothing -> putStrLn "Error: Could not find matching solver function"
'''.strip()


def _build_lua_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Lua wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
local json = require("dkjson")  -- or cjson

{source_code}

local function findSolver(candidates)
    for _, name in ipairs(candidates) do
        if _G[name] and type(_G[name]) == "function" then
            return _G[name]
        end
    end
    return nil
end

local line = io.read() or "[]"
local args = json.decode(line)
if type(args) ~= "table" then args = {{args}} end

local candidates = {candidate_list}
local solver = findSolver(candidates)

if solver then
    local result = solver(table.unpack(args))
    print(json.encode(result))
else
    print("Error: Could not find solver function")
end
'''.strip()


def _build_perl_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Perl wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    return f'''
use strict;
use warnings;
use JSON;

{source_code}

my @candidates = @{candidate_list};
my $line = <STDIN> || '[]';
chomp $line;
my $args = decode_json($line);
$args = [$args] unless ref $args eq 'ARRAY';

my $result;
for my $name (@candidates) {{
    if (defined &$name) {{
        no strict 'refs';
        $result = &{{$name}}(@$args);
        last;
    }}
}}

if (defined $result) {{
    print encode_json($result);
}} else {{
    print "Error: Could not find solver function\\n";
}}
'''.strip()


def _build_scala_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build Scala wrapper that reads from stdin and calls the solution function."""
    candidate_list = json.dumps(candidates)
    # Generate explicit match cases for candidate functions
    match_cases = '\n      '.join([f'case "{name}" => Some(solution.{name}(args))' for name in candidates])
    standalone_cases = '\n      '.join([f'case "{name}" => Some({name}(args))' for name in candidates])
    return f'''
import scala.io.StdIn
import io.circe.parser.parse
import io.circe.syntax._

{source_code}

object Main {{
  def findAndCallSolver(args: List[Any]): Option[Any] = {{
    val candidates = {candidate_list}
    
    // Try to find Solution class and instantiate it
    val solution = try {{
      Some(Class.forName("Solution").getDeclaredConstructor().newInstance())
    }} catch {{
      case _: Exception => None
    }}
    
    solution match {{
      case Some(sol) =>
        // Try instance methods on Solution
        for (name <- candidates) {{
          val result = name match {{
            {match_cases}
            case _ => None
          }}
          if (result.isDefined) return result
        }}
        None
      case None =>
        // Fallback: try standalone functions
        for (name <- candidates) {{
          val result = name match {{
            {standalone_cases}
            case _ => None
          }}
          if (result.isDefined) return result
        }}
        None
    }}
  }}

  def main(args: Array[String]): Unit = {{
    val line = StdIn.readLine()
    val input = if (line == null || line.trim.isEmpty) "[]" else line.trim
    
    parse(input) match {{
      case Right(json) =>
        val argList = json.asArray.map(_.toList).getOrElse(List(json))
        findAndCallSolver(argList) match {{
          case Some(result) => println(result.asJson.noSpaces)
          case None => println("Error: Could not find matching solver function")
        }}
      case Left(_) => println("Error: Invalid JSON input")
    }}
  }}
}}
'''.strip()


def _build_javascript_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build JavaScript/TypeScript wrapper that reads from stdin and calls the solution."""
    candidate_list = json.dumps(candidates)
    return f'''
{source_code}

const readline = require('readline');

function __code2day_findSolver() {{
    const candidates = {candidate_list};
    for (const name of candidates) {{
        if (typeof global[name] === 'function') {{
            return global[name];
        }}
        // Check if defined in current scope
        try {{ if (eval('typeof ' + name) === 'function') return eval(name); }} catch (e) {{}}
    }}
    // Look for any function in the source
    const funcNames = Object.keys(global).filter(k => typeof global[k] === 'function' && !k.startsWith('_'));
    for (const name of funcNames) {{
        if (candidates.some(c => name.toLowerCase().includes(c.toLowerCase()))) {{
            return global[name];
        }}
    }}
    throw new Error("Could not find a matching solver function");
}}

function __code2day_serialize(value) {{
    if (value === null) return "null";
    if (value === undefined) return "null";
    if (typeof value === 'boolean') return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (Array.isArray(value)) {{
        return '[' + value.map(__code2day_serialize).join(',') + ']';
    }}
    if (typeof value === 'object') {{
        return JSON.stringify(value);
    }}
    return String(value);
}}

const rl = readline.createInterface({{
    input: process.stdin,
    output: process.stdout,
    terminal: false
}});

let input = '';
rl.on('line', (line) => {{
    input += line + '\n';
}});

rl.on('close', () => {{
    input = input.trim();
    if (!input) input = '[]';
    
    let args;
    try {{
        args = JSON.parse(input);
    }} catch (e) {{
        args = input;
    }}
    
    const solver = __code2day_findSolver();
    
    // Try calling with single argument first
    let result;
    try {{
        result = solver(args);
    }} catch (e) {{
        // If that fails, try with args as array
        if (Array.isArray(args)) {{
            result = solver(...args);
        }} else {{
            throw e;
        }}
    }}
    
    console.log(__code2day_serialize(result));
}});
'''.strip()


# ── Execution type resolution ─────────────────────────────────────────────────

def _has_entrypoint(source_code: str, language: str) -> bool:
    """Return True if the code already has its own entry-point → use stdin mode."""
    for pattern in _ENTRYPOINT_PATTERNS.get(language, []):
        if re.search(pattern, source_code):
            return True
    return False


def _resolve_execution_type(problem, source_code: str, language: str) -> str:
    """
    Determine execution type.
    Priority: problem.execution_type (if not 'auto') > auto-detect from code.
    """
    if problem:
        et = getattr(problem, "execution_type", EXEC_AUTO) or EXEC_AUTO
        if et != EXEC_AUTO:
            return et

    # Auto-detect from code structure
    if _has_entrypoint(source_code, language):
        return EXEC_STDIN

    if language == "Python":
        if "class Solution" in source_code:
            return EXEC_CLASS
        if re.search(r'\bdef\s+\w+\s*\(', source_code):
            return EXEC_FUNCTION

    elif language == "Java":
        if re.search(r'\bclass\s+Solution\b', source_code):
            return EXEC_CLASS
        if re.search(r'(?:public|private|static).*\w+\s+\w+\s*\(', source_code):
            return EXEC_FUNCTION

    elif language in ("C", "C++", "CPP"):
        if re.search(
            r'\b(?:int|long|float|double|char|void|bool|auto|string|vector|deque|stack|queue|priority_queue|'
            r'unordered_map|unordered_set|pair|tuple|[A-Za-z_]\w*\*)\b[^;{}]*\w+\s*\(',
            source_code,
        ):
            return EXEC_FUNCTION

    else:
        # For other languages, if has function-like pattern, treat as function
        if re.search(r'\bfunc\s+\w+|def\s+\w+|fn\s+\w+|fun\s+\w+', source_code):
            return EXEC_FUNCTION

    return EXEC_STDIN


def _resolve_candidates(problem, source_code: str) -> list:
    """
    Build function-name candidates.
    problem.function_name takes priority over slug-based auto-detection.
    """
    slug = getattr(problem, "slug", "") or ""
    fn_name = getattr(problem, "function_name", "") or ""
    candidates = build_function_name_candidates(slug, source_code)
    if fn_name and fn_name not in candidates:
        candidates.insert(0, fn_name)
    return candidates


# ── Language adapter dispatch table ──────────────────────────────────────────
# Populated after all _looks_like_* and _build_* functions are defined above.
# Maps language name → (detection_fn, driver_builder_fn)
_ADAPTERS: dict = {}  # filled by _init_adapters() called below


def _init_adapters():
    global _ADAPTERS
    _ADAPTERS = {
        "Python":     (_looks_like_python_function_solution, _build_python_wrapper),
        "Java":       (_looks_like_java_solution,            _build_java_wrapper),
        "C":          (_looks_like_c_solution,               _build_c_wrapper),
        "C++":        (_looks_like_cpp_solution,             _build_cpp_wrapper),
        "CPP":        (_looks_like_cpp_solution,             _build_cpp_wrapper),
        "Go":         (_looks_like_go_solution,              _build_go_wrapper),
        "Rust":       (_looks_like_rust_solution,            _build_rust_wrapper),
        "Kotlin":     (_looks_like_kotlin_solution,          _build_kotlin_wrapper),
        "Swift":      (_looks_like_swift_solution,           _build_swift_wrapper),
        "C#":         (_looks_like_csharp_solution,          _build_csharp_wrapper),
        "CSharp":     (_looks_like_csharp_solution,          _build_csharp_wrapper),
        "Haskell":    (_looks_like_haskell_solution,         _build_haskell_wrapper),
        "Lua":        (_looks_like_lua_solution,             _build_lua_wrapper),
        "Perl":       (_looks_like_perl_solution,            _build_perl_wrapper),
        "Scala":      (_looks_like_scala_solution,           _build_scala_wrapper),
        "R":          (_looks_like_r_solution,               _build_r_wrapper),
    }


_init_adapters()


# Typed driver builders, keyed by language — consulted only when a problem has
# a param_schema. Only C has one today (the language with no other type-safe
# marshalling mechanism); Python/Java/JS reuse their existing, already generic
# builders unmodified (see _prepare_typed_execution_payload). A language with
# no entry here simply falls back to its existing untyped builder.
_TYPED_ADAPTERS = {
    "C": _build_c_wrapper_typed,
    "Python": _build_python_wrapper_typed,
    "Java": _build_java_wrapper_typed,
    "C++": _build_cpp_wrapper_typed,
    "CPP": _build_cpp_wrapper_typed,
}


def _prepare_typed_execution_payload(
    source_code: str,
    language: str,
    input_data: dict,
    schema: dict,
    exec_type: str,
    candidates: list[str],
    build_driver,
) -> dict:
    """Build an execution payload from an explicit param_schema instead of
    guessing types out of a free-text stdin string. Arg order is taken from
    the schema (not the heuristic stdin parser); the wire format handed to
    the sandboxed process is unchanged (a JSON array on stdin), so any
    language without its own typed builder just reuses build_driver — the
    same driver-builder function the untyped path would have used — with
    these schema-ordered args."""
    ordered_names = param_types.ordered_param_names(schema)
    args = [input_data.get(name) for name in ordered_names]
    serialized_stdin = json.dumps(args, separators=(",", ":"), ensure_ascii=False)

    typed_builder = _TYPED_ADAPTERS.get(language)
    driver = typed_builder(source_code, candidates, schema) if typed_builder else None
    if driver is None:
        driver = build_driver(source_code, candidates)

    return {
        "source_code": driver,
        "stdin": serialized_stdin,
        "adapted": True,
        "exec_type": exec_type,
    }


_C_DESIGN_RUNTIME = r'''
/* ---- Minimal recursive-descent JSON parser for the design-problem wire
   format ([operations, arguments]) — C has no vector/string/dynamic-typing
   to lean on like the other three languages, so this is genuinely new
   parsing code rather than a small delta on existing C helpers (which only
   ever parse one flat, non-nested bracketed list at a time — see
   _c_parse_int_array and friends — not a document containing strings,
   nested arrays, and mixed types together). ---- */
typedef enum { C2D_J_INT, C2D_J_DOUBLE, C2D_J_BOOL, C2D_J_STR, C2D_J_ARR, C2D_J_NUL } C2DJType;

typedef struct C2DJVal {
    C2DJType type;
    long long ival;
    double dval;
    int bval;
    char* sval;
    struct C2DJVal* items;
    int count;
} C2DJVal;

static const char* __c2d_j_src;
static int __c2d_j_pos;

static void __c2d_j_skip_ws(void) {
    while (__c2d_j_src[__c2d_j_pos] != '\0' && isspace((unsigned char)__c2d_j_src[__c2d_j_pos])) __c2d_j_pos++;
}

static C2DJVal __c2d_j_parse_value(void);

static C2DJVal __c2d_j_parse_array(void) {
    C2DJVal v; v.type = C2D_J_ARR; v.items = NULL; v.count = 0; v.sval = NULL;
    int cap = 0;
    __c2d_j_pos++; /* skip [ */
    __c2d_j_skip_ws();
    if (__c2d_j_src[__c2d_j_pos] == ']') { __c2d_j_pos++; return v; }
    while (1) {
        __c2d_j_skip_ws();
        if (v.count >= cap) {
            cap = cap ? cap * 2 : 4;
            v.items = (C2DJVal*)realloc(v.items, cap * sizeof(C2DJVal));
        }
        v.items[v.count++] = __c2d_j_parse_value();
        __c2d_j_skip_ws();
        if (__c2d_j_src[__c2d_j_pos] == ',') { __c2d_j_pos++; continue; }
        break;
    }
    __c2d_j_skip_ws();
    if (__c2d_j_src[__c2d_j_pos] == ']') __c2d_j_pos++;
    return v;
}

static C2DJVal __c2d_j_parse_string(void) {
    C2DJVal v; v.type = C2D_J_STR; v.items = NULL; v.count = 0;
    __c2d_j_pos++; /* skip opening quote */
    int cap = 32, len = 0;
    char* buf = (char*)malloc(cap);
    while (__c2d_j_src[__c2d_j_pos] != '\0' && __c2d_j_src[__c2d_j_pos] != '"') {
        char c = __c2d_j_src[__c2d_j_pos];
        if (c == '\\' && __c2d_j_src[__c2d_j_pos + 1] != '\0') { __c2d_j_pos++; c = __c2d_j_src[__c2d_j_pos]; }
        if (len + 1 >= cap) { cap *= 2; buf = (char*)realloc(buf, cap); }
        buf[len++] = c;
        __c2d_j_pos++;
    }
    if (__c2d_j_src[__c2d_j_pos] == '"') __c2d_j_pos++;
    buf[len] = '\0';
    v.sval = buf;
    return v;
}

static C2DJVal __c2d_j_parse_value(void) {
    __c2d_j_skip_ws();
    char c = __c2d_j_src[__c2d_j_pos];
    if (c == '[') return __c2d_j_parse_array();
    if (c == '"') return __c2d_j_parse_string();
    if (c == 't') { __c2d_j_pos += 4; C2DJVal v; v.type = C2D_J_BOOL; v.bval = 1; v.items = NULL; v.count = 0; v.sval = NULL; return v; }
    if (c == 'f') { __c2d_j_pos += 5; C2DJVal v; v.type = C2D_J_BOOL; v.bval = 0; v.items = NULL; v.count = 0; v.sval = NULL; return v; }
    if (c == 'n') { __c2d_j_pos += 4; C2DJVal v; v.type = C2D_J_NUL; v.items = NULL; v.count = 0; v.sval = NULL; return v; }
    {
        int start = __c2d_j_pos;
        int is_float = 0;
        if (__c2d_j_src[__c2d_j_pos] == '-') __c2d_j_pos++;
        while (isdigit((unsigned char)__c2d_j_src[__c2d_j_pos]) || __c2d_j_src[__c2d_j_pos] == '.' ||
               __c2d_j_src[__c2d_j_pos] == 'e' || __c2d_j_src[__c2d_j_pos] == 'E' ||
               __c2d_j_src[__c2d_j_pos] == '+' || __c2d_j_src[__c2d_j_pos] == '-') {
            if (__c2d_j_src[__c2d_j_pos] == '.' || __c2d_j_src[__c2d_j_pos] == 'e' || __c2d_j_src[__c2d_j_pos] == 'E') is_float = 1;
            __c2d_j_pos++;
        }
        {
            int n = __c2d_j_pos - start;
            char numbuf[64];
            C2DJVal v; v.items = NULL; v.count = 0; v.sval = NULL;
            if (n > 63) n = 63;
            memcpy(numbuf, __c2d_j_src + start, n);
            numbuf[n] = '\0';
            if (is_float) { v.type = C2D_J_DOUBLE; v.dval = atof(numbuf); }
            else { v.type = C2D_J_INT; v.ival = atoll(numbuf); }
            return v;
        }
    }
}

static C2DJVal __c2d_j_parse(const char* s) {
    __c2d_j_src = s;
    __c2d_j_pos = 0;
    return __c2d_j_parse_value();
}

static int __c2d_j_int(C2DJVal* v) { return (int)v->ival; }
static double __c2d_j_double(C2DJVal* v) { return v->type == C2D_J_DOUBLE ? v->dval : (double)v->ival; }
static int __c2d_j_bool(C2DJVal* v) { return v->bval; }
static char* __c2d_j_str(C2DJVal* v) { return v->sval ? v->sval : ""; }

static int* __c2d_j_int_array(C2DJVal* v, int* out_size) {
    int n = v->count;
    int* arr = (int*)malloc((n > 0 ? n : 1) * sizeof(int));
    for (int i = 0; i < n; i++) arr[i] = __c2d_j_int(&v->items[i]);
    *out_size = n;
    return arr;
}
static double* __c2d_j_double_array(C2DJVal* v, int* out_size) {
    int n = v->count;
    double* arr = (double*)malloc((n > 0 ? n : 1) * sizeof(double));
    for (int i = 0; i < n; i++) arr[i] = __c2d_j_double(&v->items[i]);
    *out_size = n;
    return arr;
}
static int* __c2d_j_bool_array(C2DJVal* v, int* out_size) {
    int n = v->count;
    int* arr = (int*)malloc((n > 0 ? n : 1) * sizeof(int));
    for (int i = 0; i < n; i++) arr[i] = __c2d_j_bool(&v->items[i]);
    *out_size = n;
    return arr;
}
static char** __c2d_j_string_array(C2DJVal* v, int* out_size) {
    int n = v->count;
    char** arr = (char**)malloc((n > 0 ? n : 1) * sizeof(char*));
    for (int i = 0; i < n; i++) arr[i] = __c2d_j_str(&v->items[i]);
    *out_size = n;
    return arr;
}

/* ---- Growable string builder for the results JSON array ---- */
typedef struct { char* data; int len; int cap; } __c2d_sb;
static void __c2d_sb_init(__c2d_sb* sb) { sb->cap = 256; sb->len = 0; sb->data = (char*)malloc(sb->cap); sb->data[0] = '\0'; }
static void __c2d_sb_raw(__c2d_sb* sb, const char* s) {
    int n = (int)strlen(s);
    while (sb->len + n + 1 > sb->cap) { sb->cap *= 2; sb->data = (char*)realloc(sb->data, sb->cap); }
    memcpy(sb->data + sb->len, s, n + 1);
    sb->len += n;
}
static void __c2d_sb_append(__c2d_sb* sb, const char* s) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw(sb, s);
}
/* Writes one escaped, quoted string with NO comma logic — used both by
   __c2d_sb_append_escaped (which adds the comma itself, for a top-level/
   scalar string result) and inside __c2d_sb_append_string_array's loop
   (which already adds its own "if (i) comma" between elements — calling
   the comma-aware version there would double up on every element after
   the first). */
static void __c2d_sb_raw_escaped(__c2d_sb* sb, const char* s) {
    __c2d_sb_raw(sb, "\"");
    {
        char one[2]; one[1] = '\0';
        for (const char* p = s; *p; p++) {
            if (*p == '"' || *p == '\\') { one[0] = '\\'; __c2d_sb_raw(sb, one); }
            one[0] = *p;
            __c2d_sb_raw(sb, one);
        }
    }
    __c2d_sb_raw(sb, "\"");
}
static void __c2d_sb_append_escaped(__c2d_sb* sb, const char* s) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw_escaped(sb, s);
}
static void __c2d_sb_append_int_array(__c2d_sb* sb, int* arr, int size) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw(sb, "[");
    for (int i = 0; i < size; i++) {
        char buf[32];
        if (i) __c2d_sb_raw(sb, ",");
        snprintf(buf, sizeof(buf), "%d", arr[i]);
        __c2d_sb_raw(sb, buf);
    }
    __c2d_sb_raw(sb, "]");
}
static void __c2d_sb_append_double_array(__c2d_sb* sb, double* arr, int size) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw(sb, "[");
    for (int i = 0; i < size; i++) {
        char buf[64];
        if (i) __c2d_sb_raw(sb, ",");
        snprintf(buf, sizeof(buf), "%g", arr[i]);
        __c2d_sb_raw(sb, buf);
    }
    __c2d_sb_raw(sb, "]");
}
static void __c2d_sb_append_bool_array(__c2d_sb* sb, int* arr, int size) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw(sb, "[");
    for (int i = 0; i < size; i++) {
        if (i) __c2d_sb_raw(sb, ",");
        __c2d_sb_raw(sb, arr[i] ? "true" : "false");
    }
    __c2d_sb_raw(sb, "]");
}
static void __c2d_sb_append_string_array(__c2d_sb* sb, char** arr, int size) {
    if (sb->len > 0 && sb->data[sb->len - 1] != '[') __c2d_sb_raw(sb, ",");
    __c2d_sb_raw(sb, "[");
    for (int i = 0; i < size; i++) {
        if (i) __c2d_sb_raw(sb, ",");
        __c2d_sb_raw_escaped(sb, arr[i]);
    }
    __c2d_sb_raw(sb, "]");
}
'''

_C_DESIGN_SCALAR_C_TYPE = {"int": "int", "float": "double", "double": "double", "boolean": "int", "string": "char*"}
_C_DESIGN_ARRAY_PARSE_FN = {
    "int": "__c2d_j_int_array", "float": "__c2d_j_double_array", "double": "__c2d_j_double_array",
    "boolean": "__c2d_j_bool_array", "string": "__c2d_j_string_array",
}
_C_DESIGN_ARRAY_ELEM_TYPE = {"int": "int", "float": "double", "double": "double", "boolean": "int", "string": "char*"}
_C_DESIGN_ARRAY_SB_FN = {
    "int": "__c2d_sb_append_int_array", "double": "__c2d_sb_append_double_array",
    "boolean": "__c2d_sb_append_bool_array", "string": "__c2d_sb_append_string_array",
}


def _c_design_param_binding(ptype: str, idx: int, argsfor_expr: str) -> tuple[list[str], list[str]]:
    """Returns (decl_lines, call_arg_names) for one schema param, reading
    from argsfor_expr[idx] (a C2DJVal). Scalars produce one call arg; 1D
    arrays produce two — (ptr, size) — matching the same convention
    _build_c_wrapper_typed already uses for ordinary function-style C
    problems (LeetCode's own C stubs take an array size as a companion int
    parameter the same way). Raises KeyError for a 2D array (not supported
    — no existing C 2D-array support anywhere on this platform to extend;
    caller catches this and falls back to the usual #error)."""
    base = param_types.base_scalar_type(ptype)
    dims = param_types.array_dimensions(ptype)
    src = f"(&{argsfor_expr}[{idx}])"
    var = f"_c2d_a{idx}"
    if dims == 0:
        if base == "string":
            return [f"    char* {var} = __c2d_j_str({src});"], [var]
        if base == "boolean":
            return [f"    int {var} = __c2d_j_bool({src});"], [var]
        if base in ("float", "double"):
            return [f"    double {var} = __c2d_j_double({src});"], [var]
        return [f"    int {var} = __c2d_j_int({src});"], [var]
    if dims == 1:
        parse_fn = _C_DESIGN_ARRAY_PARSE_FN[base]
        elem_type = _C_DESIGN_ARRAY_ELEM_TYPE[base]
        size_var = f"{var}_size"
        decl = [f"    int {size_var} = 0;", f"    {elem_type}* {var} = {parse_fn}({src}, &{size_var});"]
        return decl, [var, size_var]
    raise KeyError(f"2D array param ({ptype!r}) not supported for C design problems")


def _c_design_prefix(class_name: str) -> str:
    """LeetCode's real C convention for design problems: a lowerCamelCase
    prefix derived from the class name, e.g. "Vector2D" -> "vector2D",
    "MyHashSet" -> "myHashSet" — every function is {prefix}Create(...) /
    {prefix}<Method>(obj, ...)."""
    if not class_name:
        return "obj"
    return class_name[0].lower() + class_name[1:]


def _c_design_method_fn(prefix: str, method_name: str) -> str:
    if not method_name:
        return prefix
    return prefix + method_name[0].upper() + method_name[1:]


def _build_c_design_wrapper(source_code: str, schema: dict) -> str:
    """Design/OOP driver for C — the trickiest of the four languages, since
    C has no classes at all. Follows LeetCode's own real convention for C
    design-problem stubs: {prefix}Create(...) returns a `{ClassName}*`
    handle, {prefix}<Method>(obj, ...) operates on it — e.g. Vector2D ->
    vector2DCreate/vector2DNext/vector2DHasNext. {prefix}Free is never
    called here (a short-lived judge process doesn't need cleanup, and
    requiring students to have implemented it would reject an otherwise-
    correct submission for no execution-correctness reason).

    Only scalar and 1D-array types are supported (raises KeyError for
    anything else, e.g. a 2D array) — caught by the caller
    (_prepare_design_execution_payload) and turned into the same #error
    fallback every other unbuildable design driver gets, rather than
    emitting broken C. This mirrors C's pre-existing, accepted "no 2D
    arrays" limit in _build_c_wrapper_typed — not a new gap introduced
    here."""
    class_name = schema.get("class_name")
    methods = schema.get("methods", {})
    prefix = _c_design_prefix(class_name)

    dispatch = []
    for name, spec in methods.items():
        params = spec.get("params", [])
        return_type = spec.get("return_type", "void")

        decls = []
        call_args = []
        for i, ptype in enumerate(params):
            d, names = _c_design_param_binding(ptype, i, "argsFor")
            decls.extend(d)
            call_args.extend(names)
        decl_code = "\n".join(decls)

        if name == class_name:
            call_expr = f"{prefix}Create({', '.join(call_args)})"
            body = f"{decl_code}\n        obj = {call_expr};\n        __c2d_sb_append(&__c2d_results, \"null\");"
        else:
            fn = _c_design_method_fn(prefix, name)
            base = param_types.base_scalar_type(return_type) if return_type != "void" else "void"
            dims = param_types.array_dimensions(return_type) if return_type != "void" else 0

            if return_type == "void":
                call_expr = f"{fn}({', '.join(['obj'] + call_args)})"
                body = f"{decl_code}\n        {call_expr};\n        __c2d_sb_append(&__c2d_results, \"null\");"
            elif dims == 1:
                sb_fn = _C_DESIGN_ARRAY_SB_FN[base]  # KeyError -> unsupported, caught by caller
                call_expr = f"{fn}({', '.join(['obj'] + call_args + ['&_c2d_rsize'])})"
                elem_type = _C_DESIGN_ARRAY_ELEM_TYPE[base]
                body = (
                    f"{decl_code}\n"
                    f"        int _c2d_rsize = 0;\n"
                    f"        {elem_type}* _c2d_r = {call_expr};\n"
                    f"        {sb_fn}(&__c2d_results, _c2d_r, _c2d_rsize);"
                )
            elif base == "boolean":
                call_expr = f"{fn}({', '.join(['obj'] + call_args)})"
                body = f"{decl_code}\n        __c2d_sb_append(&__c2d_results, ({call_expr}) ? \"true\" : \"false\");"
            elif base == "string":
                call_expr = f"{fn}({', '.join(['obj'] + call_args)})"
                body = f"{decl_code}\n        __c2d_sb_append_escaped(&__c2d_results, {call_expr});"
            elif base in ("float", "double"):
                call_expr = f"{fn}({', '.join(['obj'] + call_args)})"
                body = (
                    f"{decl_code}\n"
                    f"        {{ char _c2d_buf[64]; snprintf(_c2d_buf, sizeof(_c2d_buf), \"%g\", (double)({call_expr})); "
                    f"__c2d_sb_append(&__c2d_results, _c2d_buf); }}"
                )
            else:
                call_expr = f"{fn}({', '.join(['obj'] + call_args)})"
                body = (
                    f"{decl_code}\n"
                    f"        {{ char _c2d_buf[32]; snprintf(_c2d_buf, sizeof(_c2d_buf), \"%d\", (int)({call_expr})); "
                    f"__c2d_sb_append(&__c2d_results, _c2d_buf); }}"
                )

        keyword = "if" if not dispatch else "else if"
        dispatch.append(f'        {keyword} (strcmp(op, {json.dumps(name)}) == 0) {{\n{body}\n        }}')
    dispatch_code = "\n".join(dispatch)

    return (
        "#include <stdio.h>\n"
        "#include <stdlib.h>\n"
        "#include <string.h>\n"
        "#include <ctype.h>\n\n"
        f"{_C_DESIGN_RUNTIME}\n"
        "/* ---- Solution code ---- */\n"
        f"{source_code}\n\n"
        "/* ---- Driver ---- */\n"
        "int main(void) {\n"
        "    char* __c2d_input = (char*)malloc(1 << 20);\n"
        "    size_t __c2d_len = fread(__c2d_input, 1, (1 << 20) - 1, stdin);\n"
        "    __c2d_input[__c2d_len] = '\\0';\n"
        "    C2DJVal __c2d_top = __c2d_j_parse(__c2d_input); /* stdin is [operations, arguments] */\n"
        "    C2DJVal* operations = &__c2d_top.items[0];\n"
        "    C2DJVal* arguments = &__c2d_top.items[1];\n\n"
        f"    {class_name}* obj = NULL;\n"
        "    __c2d_sb __c2d_results;\n"
        "    __c2d_sb_init(&__c2d_results);\n"
        "    __c2d_sb_raw(&__c2d_results, \"[\");\n\n"
        "    for (int __i = 0; __i < operations->count; __i++) {\n"
        "        char* op = __c2d_j_str(&operations->items[__i]);\n"
        "        C2DJVal* argsFor = arguments->items[__i].items;\n"
        f"{dispatch_code}\n"
        "        else {\n"
        "            fprintf(stderr, \"Unknown operation: %s\\n\", op);\n"
        "            return 1;\n"
        "        }\n"
        "    }\n\n"
        "    __c2d_sb_raw(&__c2d_results, \"]\");\n"
        "    printf(\"%s\\n\", __c2d_results.data);\n"
        "    return 0;\n"
        "}\n"
    )


_DESIGN_ADAPTERS = {
    "Python": _build_python_design_wrapper,
    "Java": _build_java_design_wrapper,
    "C++": _build_cpp_design_wrapper,
    "CPP": _build_cpp_design_wrapper,
    "C": _build_c_design_wrapper,
}


def _prepare_design_execution_payload(source_code: str, language: str, input_data: dict, schema: dict) -> dict:
    """Design/OOP problems (LRU Cache, Trie, ...) — completely bypasses the
    function-shape typed path above; see the _DESIGN_ADAPTERS builders for
    the wire format and per-language driver shape."""
    operations = input_data.get("operations", [])
    arguments = input_data.get("arguments", [])
    serialized_stdin = json.dumps([operations, arguments], separators=(",", ":"), ensure_ascii=False)

    builder = _DESIGN_ADAPTERS.get(language)
    try:
        driver = builder(source_code, schema) if builder else None
    except KeyError as exc:
        driver = None
        _unsupported_reason = f"parameter type not supported for this language yet: {exc}"
    else:
        _unsupported_reason = f"design-problem execution not yet supported for {language}"

    if driver is None:
        # Fail the compile step cleanly rather than silently produce wrong
        # output — #error is understood by every C-family compiler; for a
        # language without one at all (not currently reachable, since every
        # _DESIGN_ADAPTERS-missing case above already returns None before
        # this point) this at least fails loudly instead of executing junk.
        driver = f'#error "Design/OOP problem: {_unsupported_reason}"'

    return {"source_code": driver, "stdin": serialized_stdin, "adapted": True, "exec_type": "design"}


def prepare_execution_payload(*, problem, source_code: str, language: str, stdin: str, input_data: dict | None = None) -> dict:
    """
    Route a submission through the correct execution pipeline.

    Architecture
    ────────────
    Problem ──► Execution Type ──► Language Adapter ──► Driver Generator
                                                              │
                                                    Compile / Interpret
                                                              │
                                                    Sandbox (Docker)
                                                              │
                                                    Execute Test Cases
                                                              │
                                                    Compare Expected Output

    Execution Types
    ───────────────
    stdin       — code reads from stdin and writes to stdout (no driver injected)
    function    — code defines a function; engine injects a driver to call it
    class       — code defines a class; engine injects a driver to instantiate + call methods
    interactive — back-and-forth with judge (pass-through, future)
    design      — construct once, replay a sequence of operations (LRU Cache-style)
    """
    schema = getattr(problem, "param_schema", None) if problem else None
    
    # ── Design Auto-Detection ─────────────────────────────────────────────
    is_design_payload = False
    effective_input_data = input_data

    if effective_input_data and isinstance(effective_input_data, dict) and "operations" in effective_input_data and "arguments" in effective_input_data:
        is_design_payload = True
    elif not effective_input_data and stdin:
        try:
            parsed_stdin = json.loads(stdin)
            if isinstance(parsed_stdin, list) and len(parsed_stdin) == 2 and isinstance(parsed_stdin[0], list) and isinstance(parsed_stdin[1], list):
                if parsed_stdin[0] and isinstance(parsed_stdin[0][0], str) and parsed_stdin[0][0][0].isupper():
                    is_design_payload = True
                    effective_input_data = {"operations": parsed_stdin[0], "arguments": parsed_stdin[1]}
        except Exception:
            pass

    if is_design_payload:
        ops = effective_input_data.get("operations", [])
        class_name = ops[0] if ops else "Solution"
        if not schema or not param_types.is_design_schema(schema):
            schema = {
                "kind": "design",
                "class_name": class_name,
                "methods": {op: {"params": [], "return_type": "auto"} for op in set(ops)}
            }
        return _prepare_design_execution_payload(source_code, language, effective_input_data, schema)

    exec_type = _resolve_execution_type(problem, source_code, language)

    # ── STDIN / INTERACTIVE — pass through unchanged ──────────────────────────
    if exec_type in (EXEC_STDIN, EXEC_INTERACTIVE):
        return {
            "source_code": source_code,
            "stdin": stdin,
            "adapted": False,
            "exec_type": exec_type,
        }

    # ── FUNCTION / CLASS — inject driver ─────────────────────────────────────
    candidates = _resolve_candidates(problem, source_code)
    if not candidates:
        return {"source_code": source_code, "stdin": stdin, "adapted": False, "exec_type": EXEC_STDIN}

    adapter = _ADAPTERS.get(language)
    if not adapter:
        # Language not in adapter table → treat as stdin
        return {"source_code": source_code, "stdin": stdin, "adapted": False, "exec_type": EXEC_STDIN}

    looks_like_fn, build_driver = adapter
    schema = getattr(problem, "param_schema", None) if problem else None

    # The "looks like a solution" heuristic exists to guess intent when
    # nothing else is known. A declared param_schema is explicit, authoritative
    # proof of intent from staff — skip the heuristic gate in that case (it
    # has real false negatives, e.g. it never matches a pointer-returning C
    # function like `int* twoSum(...)`, which is exactly the shape a schema's
    # array return type needs). Schema-less problems keep the exact original
    # gate, unchanged.
    if not schema and not looks_like_fn(source_code, candidates):
        return {"source_code": source_code, "stdin": stdin, "adapted": False, "exec_type": EXEC_STDIN}

    # ── Typed path — only when both the problem declares a schema AND this
    # call passed structured input_data (e.g. a stored TestCase.input_data).
    # The ad-hoc "Run with custom stdin" flow never has input_data, so it
    # keeps using the heuristic path below even for schema-enabled problems.
    if schema and input_data is not None:
        return _prepare_typed_execution_payload(
            source_code, language, input_data, schema, exec_type, candidates, build_driver,
        )

    try:
        args = parse_argument_list(stdin)
        serialized_stdin = json.dumps(args, separators=(",", ":"), ensure_ascii=False)
    except Exception:
        return {"source_code": source_code, "stdin": stdin, "adapted": False, "exec_type": EXEC_STDIN}

    driver = build_driver(source_code, candidates)
    return {
        "source_code": driver,
        "stdin": serialized_stdin,
        "adapted": True,
        "exec_type": exec_type,
    }
