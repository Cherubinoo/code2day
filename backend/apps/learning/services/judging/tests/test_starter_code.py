"""Tests for starter_code.py — the `class Solution: ...` skeleton shown in
the student editor for a generic-judge problem. Every "shape" the
generator handles is also verified end-to-end: fill in the generated
signature with a trivially correct body and run it through the *real*
wrapper_generator.generate_source, proving the signature shown to
students is genuinely what the judge expects, not just plausible-looking
text."""

import os
import shutil
import subprocess
import tempfile

from django.test import SimpleTestCase

from ..starter_code import generate_generic_starter_code
from ..wrapper_generator import generate_source, generate_design_source
from ..serializer import serialize_value
from ..type_system import parse_type
from ..comparator import compare_output

_HAS_PYTHON = shutil.which("python") is not None or shutil.which("python3") is not None


def _run_python(src, stdin_text):
    runner = shutil.which("python") or shutil.which("python3")
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(src)
        path = f.name
    try:
        return subprocess.run([runner, path], input=stdin_text, capture_output=True, text=True, timeout=15)
    finally:
        os.unlink(path)


class GenericStarterCodeFunctionShapeTests(SimpleTestCase):
    def _problem(self, schema):
        class _FakeProblem:
            uses_generic_judge = True
            generic_schema = schema
        return _FakeProblem()

    def test_scalar_params_all_languages(self):
        schema = {
            "kind": "function", "function_name": "add",
            "params": [["a", "int"], ["b", "int"]], "return_type": "int", "custom_structs": {},
        }
        problem = self._problem(schema)

        py = generate_generic_starter_code(problem, "Python")
        self.assertEqual(py, "class Solution:\n    def add(self, a: int, b: int) -> int:\n        pass\n")

        java = generate_generic_starter_code(problem, "Java")
        self.assertEqual(java, "class Solution {\n    public int add(int a, int b) {\n        \n    }\n}\n")

        cpp = generate_generic_starter_code(problem, "C++")
        self.assertEqual(cpp, "class Solution {\npublic:\n    int add(int a, int b) {\n        \n    }\n};\n")

        c = generate_generic_starter_code(problem, "C")
        self.assertEqual(c, "int add(int a, int b) {\n    \n}\n")

    def test_array_param_and_return_all_languages(self):
        schema = {
            "kind": "function", "function_name": "twoSum",
            "params": [["nums", "vector<int>"], ["target", "int"]], "return_type": "vector<int>", "custom_structs": {},
        }
        problem = self._problem(schema)

        self.assertEqual(
            generate_generic_starter_code(problem, "Python"),
            "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass\n",
        )
        self.assertEqual(
            generate_generic_starter_code(problem, "Java"),
            "class Solution {\n    public List<Integer> twoSum(List<Integer> nums, int target) {\n        \n    }\n}\n",
        )
        self.assertEqual(
            generate_generic_starter_code(problem, "C++"),
            "class Solution {\npublic:\n    vector<int> twoSum(vector<int> nums, int target) {\n        \n    }\n};\n",
        )
        # C: LeetCode's own real convention — array decomposed into pointer + size,
        # array return gets a trailing int* returnSize out-param.
        self.assertEqual(
            generate_generic_starter_code(problem, "C"),
            "int* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    \n}\n",
        )

    def test_tree_param_all_languages(self):
        schema = {
            "kind": "function", "function_name": "convertBST",
            "params": [["root", "TreeNode"]], "return_type": "TreeNode", "custom_structs": {},
        }
        problem = self._problem(schema)
        self.assertEqual(
            generate_generic_starter_code(problem, "Python"),
            "class Solution:\n    def convertBST(self, root: Optional[TreeNode]) -> Optional[TreeNode]:\n        pass\n",
        )
        self.assertEqual(
            generate_generic_starter_code(problem, "Java"),
            "class Solution {\n    public TreeNode convertBST(TreeNode root) {\n        \n    }\n}\n",
        )
        self.assertEqual(
            generate_generic_starter_code(problem, "C++"),
            "class Solution {\npublic:\n    TreeNode* convertBST(TreeNode* root) {\n        \n    }\n};\n",
        )
        self.assertEqual(
            generate_generic_starter_code(problem, "C"),
            "struct TreeNode* convertBST(struct TreeNode* root) {\n    \n}\n",
        )

    def test_void_mutated_input_c_starter(self):
        schema = {
            "kind": "function", "function_name": "moveZeroes",
            "params": [["nums", "vector<int>"]], "return_type": "void", "custom_structs": {},
        }
        problem = self._problem(schema)
        self.assertEqual(
            generate_generic_starter_code(problem, "C"),
            "void moveZeroes(int* nums, int numsSize) {\n    \n}\n",
        )

    def test_c_returns_none_for_unsupported_shapes(self):
        schema = {
            "kind": "function", "function_name": "f",
            "params": [["grid", "vector<vector<int>>"]], "return_type": "int", "custom_structs": {},
        }
        problem = self._problem(schema)
        self.assertIsNone(generate_generic_starter_code(problem, "C"))
        # But Java/C++/Python are unaffected — they support 2D arrays fine.
        self.assertIsNotNone(generate_generic_starter_code(problem, "Java"))
        self.assertIsNotNone(generate_generic_starter_code(problem, "C++"))
        self.assertIsNotNone(generate_generic_starter_code(problem, "Python"))

    def test_stdin_kind_returns_none(self):
        problem = self._problem({"kind": "stdin"})
        for language in ("Python", "Java", "C++", "C"):
            self.assertIsNone(generate_generic_starter_code(problem, language))

    def test_no_schema_returns_none(self):
        problem = self._problem(None)
        self.assertIsNone(generate_generic_starter_code(problem, "Python"))


class GenericStarterCodeDesignShapeTests(SimpleTestCase):
    def _problem(self, schema):
        class _FakeProblem:
            uses_generic_judge = True
            generic_schema = schema
        return _FakeProblem()

    def _schema(self):
        return {
            "kind": "design", "class_name": "MinStack",
            "methods": {
                "MinStack": {"params": [], "return_type": "void"},
                "push": {"params": [["val", "int"]], "return_type": "void"},
                "pop": {"params": [], "return_type": "void"},
                "top": {"params": [], "return_type": "int"},
                "getMin": {"params": [], "return_type": "int"},
            },
            "custom_structs": {},
        }

    def test_python_design_stub(self):
        problem = self._problem(self._schema())
        code = generate_generic_starter_code(problem, "Python")
        self.assertIn("class MinStack:", code)
        self.assertIn("    def __init__(self):", code)
        self.assertIn("    def push(self, val: int) -> None:", code)
        self.assertIn("    def getMin(self) -> int:", code)

    def test_java_design_stub(self):
        problem = self._problem(self._schema())
        code = generate_generic_starter_code(problem, "Java")
        self.assertIn("class MinStack {", code)
        self.assertIn("public MinStack() {", code)
        self.assertIn("public void push(int val) {", code)
        self.assertIn("public int getMin() {", code)

    def test_cpp_design_stub(self):
        problem = self._problem(self._schema())
        code = generate_generic_starter_code(problem, "C++")
        self.assertIn("class MinStack {", code)
        self.assertIn("public:", code)
        self.assertIn("MinStack() {", code)
        self.assertIn("int getMin() {", code)

    def test_c_design_returns_none(self):
        problem = self._problem(self._schema())
        self.assertIsNone(generate_generic_starter_code(problem, "C"))


class StarterCodeMatchesRealDriverEndToEndTests(SimpleTestCase):
    """The real correctness check: fill in the generated signature with a
    trivially correct body and run it through the actual judge — proving
    the signature isn't just plausible text but genuinely what the driver
    calls."""

    def test_python_tree_starter_actually_runs(self):
        if not _HAS_PYTHON:
            self.skipTest("no local python interpreter available")

        schema = {
            "kind": "function", "function_name": "convertBST",
            "params": [["root", "TreeNode"]], "return_type": "TreeNode", "custom_structs": {},
        }

        class _FakeProblem:
            uses_generic_judge = True
            generic_schema = schema

        stub = generate_generic_starter_code(_FakeProblem(), "Python")
        solution = stub.replace("        pass", "        return root")

        src = generate_source(schema, "python", solution)
        stdin_text = serialize_value(parse_type("TreeNode"), [1, None, 2])
        r = _run_python(src, stdin_text)
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        return_node = parse_type("TreeNode")
        self.assertTrue(compare_output(return_node, r.stdout, [1, None, 2]).passed, msg=r.stdout + r.stderr)

    def test_python_array_starter_actually_runs(self):
        if not _HAS_PYTHON:
            self.skipTest("no local python interpreter available")

        schema = {
            "kind": "function", "function_name": "twoSum",
            "params": [["nums", "vector<int>"], ["target", "int"]], "return_type": "vector<int>", "custom_structs": {},
        }

        class _FakeProblem:
            uses_generic_judge = True
            generic_schema = schema

        stub = generate_generic_starter_code(_FakeProblem(), "Python")
        solution = stub.replace(
            "        pass",
            "        seen = {}\n"
            "        for i, x in enumerate(nums):\n"
            "            if target - x in seen:\n"
            "                return [seen[target - x], i]\n"
            "            seen[x] = i\n"
            "        return []",
        )

        src = generate_source(schema, "python", solution)
        stdin_text = serialize_value(parse_type("vector<int>"), [2, 7, 11, 15]) + serialize_value(parse_type("int"), 9)
        r = _run_python(src, stdin_text)
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        return_node = parse_type("vector<int>")
        self.assertTrue(compare_output(return_node, r.stdout, [0, 1]).passed, msg=r.stdout + r.stderr)

    def test_python_design_starter_actually_runs(self):
        if not _HAS_PYTHON:
            self.skipTest("no local python interpreter available")

        schema = {
            "kind": "design", "class_name": "MinStack",
            "methods": {
                "MinStack": {"params": [], "return_type": "void"},
                "push": {"params": [["val", "int"]], "return_type": "void"},
                "pop": {"params": [], "return_type": "void"},
                "top": {"params": [], "return_type": "int"},
                "getMin": {"params": [], "return_type": "int"},
            },
            "custom_structs": {},
        }

        class _FakeProblem:
            uses_generic_judge = True
            generic_schema = schema

        stub = generate_generic_starter_code(_FakeProblem(), "Python")
        solution = (
            stub
            .replace("    def __init__(self):\n        pass", "    def __init__(self):\n        self.stack = []")
            .replace(
                "    def push(self, val: int) -> None:\n        pass",
                "    def push(self, val: int) -> None:\n"
                "        mn = val if not self.stack else min(val, self.stack[-1][1])\n"
                "        self.stack.append((val, mn))",
            )
            .replace("    def pop(self) -> None:\n        pass", "    def pop(self) -> None:\n        self.stack.pop()")
            .replace("    def top(self) -> int:\n        pass", "    def top(self) -> int:\n        return self.stack[-1][0]")
            .replace("    def getMin(self) -> int:\n        pass", "    def getMin(self) -> int:\n        return self.stack[-1][1]")
        )
        self.assertNotIn("pass", solution)  # sanity: every stub body was actually replaced

        operations = ["MinStack", "push", "push", "push", "getMin", "pop", "top", "getMin"]
        from .test_design_wrapper_generation import _build_design_stdin
        stdin_text = _build_design_stdin(schema["methods"], schema["custom_structs"], operations, [[], [-2], [0], [-3], [], [], [], []])

        src = generate_design_source(schema, "python", solution)
        r = _run_python(src, stdin_text)
        self.assertEqual(r.returncode, 0, msg=r.stderr)
        import json as _json
        self.assertEqual(_json.loads(r.stdout), [None, None, None, None, -3, None, 0, -2])
