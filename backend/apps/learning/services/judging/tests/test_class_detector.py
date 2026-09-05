"""Permanent regression coverage for class_detector.py — the platform no
longer requires a submission's class to be named `Solution`. Falls back
to "Solution" whenever detection is ambiguous or finds nothing, rather
than guessing wrong."""

import os
import shutil
import subprocess
import tempfile

from django.test import SimpleTestCase

from ..class_detector import detect_class_name
from ..wrapper_generator import generate_source
from ..serializer import serialize_value
from ..type_system import parse_type
from ..comparator import compare_output

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


class ClassDetectorUnitTests(SimpleTestCase):
    def test_detects_arbitrary_class_name_per_language(self):
        cases = [
            ("python", "class MyAwesomeSolver:\n    def twoSum(self, a, b):\n        return []\n", "MyAwesomeSolver"),
            ("javascript", "class Whatever {\n    twoSum(a, b) { return []; }\n}\n", "Whatever"),
            ("java", "class MySolutionImpl {\n    public int[] twoSum(int a, int b) { return null; }\n}\n", "MySolutionImpl"),
            ("cpp", "class Impl {\npublic:\n    vector<int> twoSum(int a, int b) { return {}; }\n};\n", "Impl"),
        ]
        for lang_name, code, expected in cases:
            self.assertEqual(detect_class_name(lang_name, code, "twoSum"), expected, msg=lang_name)

    def test_falls_back_to_solution_when_ambiguous(self):
        code = (
            "class A:\n    def twoSum(self, a, b):\n        return []\n\n"
            "class B:\n    def twoSum(self, a, b):\n        return []\n"
        )
        self.assertEqual(detect_class_name("python", code, "twoSum"), "Solution")

    def test_falls_back_to_solution_when_no_class_found(self):
        code = "def twoSum(a, b):\n    return []\n"
        self.assertEqual(detect_class_name("python", code, "twoSum"), "Solution")

    def test_ignores_unrelated_helper_classes(self):
        code = (
            "class Helper:\n    def unrelated(self):\n        pass\n\n"
            "class MainImpl:\n    def twoSum(self, a, b):\n        return []\n"
        )
        self.assertEqual(detect_class_name("python", code, "twoSum"), "MainImpl")

    def test_java_inheritance_clause_does_not_break_detection(self):
        code = "class Impl extends Base implements Comparable<Impl> {\n    public int[] twoSum(int a, int b) { return null; }\n}\n"
        self.assertEqual(detect_class_name("java", code, "twoSum"), "Impl")

    def test_cpp_nested_braces_do_not_confuse_body_extent(self):
        code = (
            "class Impl {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n"
            "        if (nums.size() > 0) {\n            for (int i = 0; i < 5; i++) { }\n        }\n"
            "        return {};\n    }\n};\n"
        )
        self.assertEqual(detect_class_name("cpp", code, "twoSum"), "Impl")

    def test_existing_class_solution_convention_still_detected(self):
        code = "class Solution:\n    def twoSum(self, a, b):\n        return []\n"
        self.assertEqual(detect_class_name("python", code, "twoSum"), "Solution")


class ClassDetectorWrapperIntegrationTests(SimpleTestCase):
    """End-to-end: a submission using a non-Solution class name must
    actually execute correctly through the full wrapper, not just be
    detected in isolation."""

    def test_two_sum_with_arbitrary_class_names(self):
        schema = {"function_name": "twoSum", "params": [("nums", "vector<int>"), ("target", "int")], "return_type": "vector<int>"}
        stdin_text = serialize_value(parse_type("vector<int>"), [2, 7, 11, 15]) + serialize_value(parse_type("int"), 9)
        expected = [0, 1]
        return_node = parse_type("vector<int>")

        py_sol = (
            "class MyAwesomeSolver:\n"
            "    def twoSum(self, nums, target):\n"
            "        seen = {}\n"
            "        for i, x in enumerate(nums):\n"
            "            if target - x in seen:\n"
            "                return [seen[target - x], i]\n"
            "            seen[x] = i\n"
            "        return []\n"
        )
        js_sol = (
            "class Whatever {\n"
            "    twoSum(nums, target) {\n"
            "        const seen = new Map();\n"
            "        for (let i = 0; i < nums.length; i++) {\n"
            "            const need = target - nums[i];\n"
            "            if (seen.has(need)) return [seen.get(need), i];\n"
            "            seen.set(nums[i], i);\n"
            "        }\n"
            "        return [];\n"
            "    }\n"
            "}\n"
        )
        java_sol = (
            "class MySolutionImpl {\n"
            "    public List<Integer> twoSum(List<Integer> nums, int target) {\n"
            "        Map<Integer, Integer> seen = new HashMap<>();\n"
            "        for (int i = 0; i < nums.size(); i++) {\n"
            "            int need = target - nums.get(i);\n"
            "            if (seen.containsKey(need)) return Arrays.asList(seen.get(need), i);\n"
            "            seen.put(nums.get(i), i);\n"
            "        }\n"
            "        return new ArrayList<>();\n"
            "    }\n"
            "}\n"
        )

        if _HAS_PYTHON:
            r = _run_python(generate_source(schema, "python", py_sol), stdin_text)
            self.assertTrue(compare_output(return_node, r.stdout, expected).passed, msg=r.stderr)
        if _HAS_NODE:
            r = _run_node(generate_source(schema, "javascript", js_sol), stdin_text)
            self.assertTrue(compare_output(return_node, r.stdout, expected).passed, msg=r.stderr)
        if _HAS_JAVAC:
            r = _run_java(generate_source(schema, "java", java_sol), stdin_text)
            self.assertTrue(compare_output(return_node, r.stdout, expected).passed, msg=r.stderr)

    def test_cpp_arbitrary_class_name_generates_plausibly(self):
        schema = {"function_name": "twoSum", "params": [("nums", "vector<int>"), ("target", "int")], "return_type": "vector<int>"}
        cpp_sol = (
            "class Impl {\npublic:\n"
            "    vector<int> twoSum(vector<int>& nums, int target) {\n"
            "        unordered_map<int,int> seen;\n"
            "        for (int i = 0; i < (int)nums.size(); i++) {\n"
            "            int need = target - nums[i];\n"
            "            if (seen.count(need)) return {seen[need], i};\n"
            "            seen[nums[i]] = i;\n"
            "        }\n"
            "        return {};\n"
            "    }\n"
            "};\n"
        )
        src = generate_source(schema, "cpp", cpp_sol)
        self.assertIn("Impl sol;", src)
        self.assertNotIn("Solution sol;", src)
