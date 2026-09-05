"""End-to-end tests for design-pattern (class + multiple method calls)
wrapper generation — the ZigzagIterator-style problems the generic judging
framework had zero support for before this. Same real-interpreter approach
as test_wrapper_generation.py: generate the full program, actually run it
via a local Python/Node/Java, and check its single JSON-array output line
against the expected per-operation results via compare_design_output()
(the same comparison function the legacy design-execution path already
uses). C++ gets a structural sanity check only (no local g++ here), same
caveat as the function-style tests.
"""

import json
import os
import shutil
import subprocess
import tempfile

from django.test import SimpleTestCase

from ..wrapper_generator import generate_design_source
from ..serializer import serialize_value
from ..type_system import parse_type
from ...execution_adapter import compare_design_output

_HAS_PYTHON = shutil.which("python") is not None or shutil.which("python3") is not None
_HAS_NODE = shutil.which("node") is not None
_HAS_JAVAC = shutil.which("javac") is not None and shutil.which("java") is not None


def _run_python(src, stdin_text):
    runner = shutil.which("python") or shutil.which("python3")
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(src)
        path = f.name
    try:
        return subprocess.run([runner, path], input=stdin_text, capture_output=True, text=True, timeout=15)
    finally:
        os.unlink(path)


def _run_node(src, stdin_text):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as f:
        f.write(src)
        path = f.name
    try:
        return subprocess.run(["node", path], input=stdin_text, capture_output=True, text=True, timeout=15)
    finally:
        os.unlink(path)


def _run_java(src, stdin_text):
    tmpdir = tempfile.mkdtemp()
    try:
        path = os.path.join(tmpdir, "Main.java")
        with open(path, "w") as f:
            f.write(src)
        compiled = subprocess.run(["javac", "Main.java"], cwd=tmpdir, capture_output=True, text=True, timeout=30)
        if compiled.returncode != 0:
            raise AssertionError(f"javac failed:\n{compiled.stderr}\n---\n{src}")
        return subprocess.run(["java", "Main"], cwd=tmpdir, input=stdin_text, capture_output=True, text=True, timeout=15)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _build_design_stdin(methods, custom_structs, operations, arguments):
    """Newline-token wire format generate_design_source's programs read:
    a count line, then per operation an op-name line followed by that
    operation's own params serialized via the same per-type wire format
    the function-style path already uses (serializer.serialize_value)."""
    lines = [str(len(operations))]
    for op, args in zip(operations, arguments):
        lines.append(op)
        param_specs = methods[op]["params"]
        for (_pname, ptype), value in zip(param_specs, args):
            node = parse_type(ptype, custom_structs)
            lines.append(serialize_value(node, value).rstrip("\n"))
    return "\n".join(lines) + "\n"


class DesignWrapperGenerationTests(SimpleTestCase):
    def _assert_cpp_generates_plausibly(self, schema, solution_code):
        cpp_src = generate_design_source(schema, "cpp", solution_code)
        self.assertIn("int main()", cpp_src)
        self.assertIn(schema["class_name"], cpp_src)
        for method_name in schema["methods"]:
            if method_name != schema["class_name"]:
                self.assertIn(method_name, cpp_src)

    def test_zigzag_iterator(self):
        # The exact problem shape that prompted this feature: a constructor
        # taking two int vectors, next() returning int, hasNext() returning
        # bool — interleaving the two lists in zigzag order.
        schema = {
            "kind": "design",
            "class_name": "ZigzagIterator",
            "methods": {
                "ZigzagIterator": {"params": [["v1", "vector<int>"], ["v2", "vector<int>"]], "return_type": "void"},
                "next": {"params": [], "return_type": "int"},
                "hasNext": {"params": [], "return_type": "bool"},
            },
            "custom_structs": {},
        }
        operations = ["ZigzagIterator", "next", "next", "next", "hasNext"]
        arguments = [[[1, 2], [3, 4, 5, 6]], [], [], [], []]
        expected = [None, 1, 3, 2, True]
        stdin_text = _build_design_stdin(schema["methods"], schema["custom_structs"], operations, arguments)
        expected_raw = json.dumps(expected)

        py_sol = (
            "class ZigzagIterator:\n"
            "    def __init__(self, v1, v2):\n"
            "        self.queue = []\n"
            "        if v1: self.queue.append((v1, 0))\n"
            "        if v2: self.queue.append((v2, 0))\n"
            "    def next(self):\n"
            "        vals, i = self.queue.pop(0)\n"
            "        if i + 1 < len(vals):\n"
            "            self.queue.append((vals, i + 1))\n"
            "        return vals[i]\n"
            "    def hasNext(self):\n"
            "        return len(self.queue) > 0\n"
        )
        js_sol = (
            "class ZigzagIterator {\n"
            "    constructor(v1, v2) {\n"
            "        this.queue = [];\n"
            "        if (v1.length) this.queue.push([v1, 0]);\n"
            "        if (v2.length) this.queue.push([v2, 0]);\n"
            "    }\n"
            "    next() {\n"
            "        const [vals, i] = this.queue.shift();\n"
            "        if (i + 1 < vals.length) this.queue.push([vals, i + 1]);\n"
            "        return vals[i];\n"
            "    }\n"
            "    hasNext() {\n"
            "        return this.queue.length > 0;\n"
            "    }\n"
            "}\n"
        )
        java_sol = (
            # No need for its own `import java.util.*;` — the wrapper's
            # own reader_prelude already imports it at the top of the
            # file, and Java requires every import before any class decl.
            "class ZigzagIterator {\n"
            "    Deque<int[]> queue = new ArrayDeque<>();\n"
            "    Map<Integer, List<Integer>> lists = new HashMap<>();\n"
            "    int nextId = 0;\n"
            "    public ZigzagIterator(List<Integer> v1, List<Integer> v2) {\n"
            "        if (!v1.isEmpty()) { lists.put(nextId, v1); queue.add(new int[]{nextId, 0}); nextId++; }\n"
            "        if (!v2.isEmpty()) { lists.put(nextId, v2); queue.add(new int[]{nextId, 0}); nextId++; }\n"
            "    }\n"
            "    public int next() {\n"
            "        int[] head = queue.poll();\n"
            "        List<Integer> vals = lists.get(head[0]);\n"
            "        int i = head[1];\n"
            "        if (i + 1 < vals.size()) queue.add(new int[]{head[0], i + 1});\n"
            "        return vals.get(i);\n"
            "    }\n"
            "    public boolean hasNext() {\n"
            "        return !queue.isEmpty();\n"
            "    }\n"
            "}\n"
        )

        if _HAS_PYTHON:
            r = _run_python(generate_design_source(schema, "python", py_sol), stdin_text)
            self.assertTrue(compare_design_output(r.stdout, expected_raw, schema, operations), msg=r.stderr or r.stdout)
        if _HAS_NODE:
            r = _run_node(generate_design_source(schema, "javascript", js_sol), stdin_text)
            self.assertTrue(compare_design_output(r.stdout, expected_raw, schema, operations), msg=r.stderr or r.stdout)
        if _HAS_JAVAC:
            r = _run_java(generate_design_source(schema, "java", java_sol), stdin_text)
            self.assertTrue(compare_design_output(r.stdout, expected_raw, schema, operations), msg=r.stderr or r.stdout)

        cpp_sol = (
            "class ZigzagIterator {\n"
            "public:\n"
            "    ZigzagIterator(vector<int>& v1, vector<int>& v2) {}\n"
            "    int next() { return 0; }\n"
            "    bool hasNext() { return false; }\n"
            "};\n"
        )
        self._assert_cpp_generates_plausibly(schema, cpp_sol)

    def test_min_stack_arbitrary_class_name_is_detected(self):
        # A student's class need not be named after the schema's class_name
        # (mirrors detect_class_name's existing leniency for the
        # function-style path) — this class is called "MyMinStack", not
        # "MinStack", and detect_class_name_for_methods must still find it
        # by its full method set (push/pop/top/getMin).
        schema = {
            "kind": "design",
            "class_name": "MinStack",
            "methods": {
                "MinStack": {"params": [], "return_type": "void"},
                "push": {"params": [["val", "int"]], "return_type": "void"},
                "pop": {"params": [], "return_type": "void"},
                "top": {"params": [], "return_type": "int"},
                "getMin": {"params": [], "return_type": "int"},
            },
            "custom_structs": {},
        }
        operations = ["MinStack", "push", "push", "push", "getMin", "pop", "top", "getMin"]
        arguments = [[], [-2], [0], [-3], [], [], [], []]
        expected = [None, None, None, None, -3, None, 0, -2]
        stdin_text = _build_design_stdin(schema["methods"], schema["custom_structs"], operations, arguments)
        expected_raw = json.dumps(expected)

        py_sol = (
            "class MyMinStack:\n"
            "    def __init__(self):\n"
            "        self.stack = []\n"
            "    def push(self, val):\n"
            "        mn = val if not self.stack else min(val, self.stack[-1][1])\n"
            "        self.stack.append((val, mn))\n"
            "    def pop(self):\n"
            "        self.stack.pop()\n"
            "    def top(self):\n"
            "        return self.stack[-1][0]\n"
            "    def getMin(self):\n"
            "        return self.stack[-1][1]\n"
        )
        if _HAS_PYTHON:
            r = _run_python(generate_design_source(schema, "python", py_sol), stdin_text)
            self.assertTrue(compare_design_output(r.stdout, expected_raw, schema, operations), msg=r.stderr or r.stdout)
