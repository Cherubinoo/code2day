from __future__ import annotations

import ast
import json
import re


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
    "JavaScript": [r'\brequire\s*\(\s*[\'"]readline[\'"]', r'process\.stdin\.on'],
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
            return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
        except json.JSONDecodeError:
            pass

    # Try to parse as a literal first
    parsed = _coerce_literal(cleaned)

    if isinstance(parsed, str):
        return " ".join(parsed.split())
    if isinstance(parsed, (list, dict, bool, int, float)) or parsed is None:
        return json.dumps(parsed, separators=(",", ":"), ensure_ascii=False)
    return " ".join(cleaned.split())


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
    # Check for function definitions
    for name in candidates:
        if re.search(rf'\b{re.escape(name)}\s*\([^)]*\)\s*{{', source_code):
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
    """Build Java wrapper that reads from stdin and calls the solution method."""
    candidate_list = json.dumps(candidates)
    return f'''
import java.io.*;
import java.util.*;

{source_code}

class Main {{
    public static void main(String[] args) throws Exception {{
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line = reader.readLine();
        if (line == null || line.trim().isEmpty()) {{
            line = "[]";
        }}
        
        // Parse JSON-like array
        line = line.trim();
        List<Object> argList = new ArrayList<>();
        if (line.startsWith("[") && line.endsWith("]")) {{
            line = line.substring(1, line.length() - 1);
            // Simple parsing - split by comma but respect strings
            argList = parseArguments(line);
        }} else {{
            argList.add(parseValue(line));
        }}
        
        // Find and call the solution method
        Object result = callSolution(argList);
        System.out.println(serialize(result));
    }}
    
    static List<Object> parseArguments(String s) {{
        List<Object> result = new ArrayList<>();
        if (s.trim().isEmpty()) return result;
        
        // Simple comma-separated parsing respecting quotes
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inString = false;
        char stringChar = 0;
        int depth = 0;
        
        for (int i = 0; i < s.length(); i++) {{
            char c = s.charAt(i);
            if (!inString && (c == '"' || c == "'")) {{
                inString = true;
                stringChar = c;
                current.append(c);
            }} else if (inString && c == stringChar) {{
                inString = false;
                current.append(c);
            }} else if (!inString && (c == '[' || c == '{{')) {{
                depth++;
                current.append(c);
            }} else if (!inString && (c == ']' || c == '}}')) {{
                depth--;
                current.append(c);
            }} else if (!inString && c == ',' && depth == 0) {{
                parts.add(current.toString().trim());
                current = new StringBuilder();
            }} else {{
                current.append(c);
            }}
        }}
        if (current.length() > 0) {{
            parts.add(current.toString().trim());
        }}
        
        for (String part : parts) {{
            result.add(parseValue(part));
        }}
        return result;
    }}
    
    static Object parseValue(String s) {{
        s = s.trim();
        if (s.isEmpty()) return null;
        if (s.equals("null")) return null;
        if (s.equals("true")) return true;
        if (s.equals("false")) return false;
        if (s.startsWith("[") && s.endsWith("]")) {{
            // Array
            return parseArguments(s.substring(1, s.length() - 1));
        }}
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {{
            return s.substring(1, s.length() - 1);
        }}
        // Try number
        try {{
            if (s.contains(".")) {{
                return Double.parseDouble(s);
            }}
            return Integer.parseInt(s);
        }} catch (NumberFormatException e) {{
            return s;
        }}
    }}
    
    static Object callSolution(List<Object> args) throws Exception {{
        String[] candidateNames = {candidate_list};
        
        // Try to find Solution class
        Class<?> solutionClass = null;
        Object solutionInstance = null;
        try {{
            solutionClass = Class.forName("Solution");
            solutionInstance = solutionClass.getDeclaredConstructor().newInstance();
        }} catch (Exception e) {{
            // No Solution class, look for class with methods
            for (Class<?> cls : new Class<?>[]{{ Main.class }}) {{
                if (solutionClass != null) break;
                for (String name : candidateNames) {{
                    try {{
                        cls.getMethod(name, getParamTypes(args));
                        solutionClass = cls;
                        solutionInstance = solutionClass.getDeclaredConstructor().newInstance();
                        break;
                    }} catch (Exception ignored) {{}}
                }}
            }}
        }}
        
        if (solutionClass == null) {{
            // Try static methods
            for (String name : candidateNames) {{
                try {{
                    java.lang.reflect.Method m = Main.class.getMethod(name, getParamTypes(args));
                    return m.invoke(null, args.toArray());
                }} catch (Exception ignored) {{}}
            }}
            throw new RuntimeException("Could not find solution method");
        }}
        
        // Try instance methods on Solution
        for (String name : candidateNames) {{
            try {{
                java.lang.reflect.Method m = solutionClass.getMethod(name, getParamTypes(args));
                return m.invoke(solutionInstance, args.toArray());
            }} catch (Exception ignored) {{}}
        }}
        
        throw new RuntimeException("Could not find matching method");
    }}
    
    static Class<?>[] getParamTypes(List<Object> args) {{
        Class<?>[] types = new Class<?>[args.size()];
        for (int i = 0; i < args.size(); i++) {{
            Object arg = args.get(i);
            if (arg == null) types[i] = Object.class;
            else if (arg instanceof Integer) types[i] = int.class;
            else if (arg instanceof Double) types[i] = double.class;
            else if (arg instanceof Boolean) types[i] = boolean.class;
            else if (arg instanceof String) types[i] = String.class;
            else if (arg instanceof List) types[i] = List.class;
            else types[i] = arg.getClass();
        }}
        return types;
    }}
    
    static String serialize(Object obj) {{
        if (obj == null) return "null";
        if (obj instanceof Boolean) return ((Boolean) obj).toString();
        if (obj instanceof Number) return obj.toString();
        if (obj instanceof String) return (String) obj;
        if (obj instanceof List) {{
            StringBuilder sb = new StringBuilder();
            sb.append("[");
            List<?> list = (List<?>) obj;
            for (int i = 0; i < list.size(); i++) {{
                if (i > 0) sb.append(",");
                sb.append(serialize(list.get(i)));
            }}
            sb.append("]");
            return sb.toString();
        }}
        return obj.toString();
    }}
}}
'''.strip()


def _build_c_wrapper(source_code: str, candidates: list[str]) -> str:
    """Build C wrapper that reads from stdin and calls the solution function."""
    # Simple approach: try calling each candidate directly
    # Assume function signature: char* func(char*)
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


def _generate_cpp_call(func_name: str, sig_match, source_code: str) -> str:
    """
    Generate the typed call inside the C++ main lambda.
    Inspects the function signature to determine parameter types and builds
    the correct typed call with serialization of the return value.
    """
    import re as _re

    # Map C++ type strings to J accessor methods and serialize calls
    TYPE_MAP = {
        # int-like
        'int':              ('args[{i}].asInt()',    'serialize'),
        'long':             ('args[{i}].asLong()',   'serialize'),
        'long long':        ('args[{i}].asLong()',   'serialize'),
        'double':           ('args[{i}].asDouble()', 'serialize'),
        'float':            ('args[{i}].asDouble()', 'serialize'),
        'bool':             ('args[{i}].asBool()',   'serialize'),
        'string':           ('args[{i}].asStr()',    'serialize'),
        'vector<int>':      ('args[{i}].asVecInt()', 'serialize'),
        'vector<long long>':('args[{i}].asVecLong()','serialize'),
        'vector<double>':   ('args[{i}].asVecDouble()','serialize'),
        'vector<string>':   ('args[{i}].asVecStr()', 'serialize'),
        'vector<vector<int>>': ('args[{i}].asVecVecInt()', 'serialize'),
    }

    def normalize_type(t):
        t = t.strip()
        t = _re.sub(r'\s+', ' ', t)
        t = t.replace('std::', '')
        return t

    lines = []

    if sig_match:
        params_str = sig_match.group(2).strip()
        ret_type = normalize_type(sig_match.group(1))

        # Parse parameter types
        param_types = []
        if params_str:
            for param in params_str.split(','):
                param = param.strip()
                # Remove parameter name (last word) to get type
                parts = param.rsplit(None, 1)
                if len(parts) == 2:
                    ptype = normalize_type(parts[0].rstrip('&*'))
                else:
                    ptype = normalize_type(parts[0])
                param_types.append(ptype)

        # Build argument list
        call_args = []
        for i, ptype in enumerate(param_types):
            accessor = None
            for key, (acc, _) in TYPE_MAP.items():
                if ptype == key or ptype.startswith(key):
                    accessor = acc.format(i=i)
                    break
            if accessor is None:
                # Fallback: try int
                accessor = f'args[{i}].asInt()'
            call_args.append(accessor)

        call_str = f'sol.{func_name}({", ".join(call_args)})'

        # Determine how to serialize return value
        ret_norm = normalize_type(ret_type)
        if ret_norm == 'void':
            lines.append(f'        {call_str};')
            lines.append('        return "void";')
        elif ret_norm == 'bool':
            lines.append(f'        return serialize((bool)({call_str}));')
        elif ret_norm in ('int', 'long', 'long long'):
            lines.append(f'        return serialize((long long)({call_str}));')
        elif ret_norm in ('double', 'float'):
            lines.append(f'        return serialize((double)({call_str}));')
        elif ret_norm == 'string':
            lines.append(f'        return serialize({call_str});')
        elif 'vector' in ret_norm:
            lines.append(f'        return serialize({call_str});')
        else:
            # Unknown return type — try to_string
            lines.append(f'        auto __r = {call_str};')
            lines.append('        ostringstream __os; __os << __r; return __os.str();')
    else:
        # No signature found — try common single-arg patterns as fallback
        lines.append(f'        if (args.size() >= 2) {{')
        lines.append(f'            auto __r = sol.{func_name}(args[0].asInt(), args[1].asInt());')
        lines.append(f'            return serialize(__r);')
        lines.append(f'        }}')
        lines.append(f'        if (args.size() == 1) {{')
        lines.append(f'            auto __r = sol.{func_name}(args[0].asVecInt());')
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

// ── Serializer ────────────────────────────────────────────────────────────────
static string serialize(int v)         { return to_string(v); }
static string serialize(long long v)   { return to_string(v); }
static string serialize(double v)      { ostringstream s;s<<v;return s.str(); }
static string serialize(bool v)        { return v?"true":"false"; }
static string serialize(const string&v){ return v; }
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

// ── User solution ─────────────────────────────────────────────────────────────
""" + source_code + """

// ── Main: read args, call solution, print result ──────────────────────────────
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    string line;
    if (!getline(cin, line) || line.empty()) line = "[]";

    vector<J> args = parse_json_args(line);

    Solution sol;
    auto call = [&]() -> string {
""" + _generate_cpp_call(func_name, match, source_code) + """
        return "null";
    };

    cout << call() << endl;
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

# ── Solution code ─────────────────────────────────────────────────────────────
{source_code}

# ── Driver ────────────────────────────────────────────────────────────────────
import json as __code2day_json
import sys as __code2day_sys
import inspect as __code2day_inspect

def __code2day_find_solver():
    candidates = {candidate_list}
    for name in candidates:
        fn = globals().get(name)
        if callable(fn):
            return fn
    solution_cls = globals().get("Solution")
    if solution_cls:
        instance = solution_cls()
        for name in candidates:
            method = getattr(instance, name, None)
            if callable(method):
                return method
    raise NameError("Could not find a matching solver function for this problem.")

def __code2day_serialize(value):
    if value is None: return "null"
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, TreeNode):
        return __code2day_json.dumps(__c2d_from_tree(value), separators=(",", ":"))
    if isinstance(value, ListNode):
        return __code2day_json.dumps(__c2d_from_linked(value), separators=(",", ":"))
    if isinstance(value, str): return value
    return __code2day_json.dumps(value, separators=(",", ":"), ensure_ascii=False)

if __name__ == "__main__":
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
        if param_count == 1 and len(args) > 1:
            result = solver(args)
        elif param_count > 1 and len(args) == 1 and isinstance(args[0], list):
            result = solver(*args[0])
        else:
            result = solver(*args)
    except (TypeError, ValueError):
        result = solver(args)

    __code2day_sys.stdout.write(__code2day_serialize(result))
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
        if re.search(r'\b(?:int|long|float|double|char|void|bool|vector|string)\s+\w+\s*\(', source_code):
            return EXEC_FUNCTION

    elif language in ("JavaScript", "TypeScript", "Node.js"):
        if re.search(r'\bfunction\s+\w+\s*\(|const\s+\w+\s*=\s*(?:function|\()', source_code):
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
        "JavaScript": (_looks_like_javascript_solution,      _build_javascript_wrapper),
        "TypeScript": (_looks_like_javascript_solution,      _build_javascript_wrapper),
        "Node.js":    (_looks_like_javascript_solution,      _build_javascript_wrapper),
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


def prepare_execution_payload(*, problem, source_code: str, language: str, stdin: str) -> dict:
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
    """
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
    if not looks_like_fn(source_code, candidates):
        return {"source_code": source_code, "stdin": stdin, "adapted": False, "exec_type": EXEC_STDIN}

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
