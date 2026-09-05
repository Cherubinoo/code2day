"""Permanent regression coverage for the three newest additions to the
judging framework:

  1. Optional[T] / Nullable<T> — a generic nullable wrapper, with
     TreeNode/ListNode as a pure pass-through (already inherently nullable)
     and real null-wrapping codegen for everything else (primitives, etc.)
  2. Mutated-input problems (return_type "void", or an explicit
     comparison.type == "mutated_input") — the function is called for its
     side effect only, and the MUTATED PARAMETER's post-call value is
     serialized and compared, never a return value.
  3. bst as a distinct kind from binary_tree, with an additional
     unordered="verify BST property, not exact shape" comparison mode.

The `recoverTree(root: Optional[TreeNode]) -> None` case is the exact bug
this session's spec called out by name (section 32) — kept here as a
permanent, named regression test so it can never silently break again.
"""

import os
import shutil
import subprocess
import tempfile

from django.test import SimpleTestCase

from ..type_system import parse_type, TypeError_
from ..serializer import serialize_value, deserialize_value, serialize_output, parse_output
from ..comparator import compare_output
from ..wrapper_generator import generate_source

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


class TypeParsingTests(SimpleTestCase):
    def test_bracket_and_angle_generic_syntax_are_equivalent(self):
        pairs = [
            ("Optional[int]", "Optional<int>"),
            ("List[int]", "vector<int>"),
            ("Optional[TreeNode]", "Optional<TreeNode>"),
        ]
        for bracket, angle in pairs:
            self.assertEqual(parse_type(bracket).kind, parse_type(angle).kind, msg=f"{bracket} vs {angle}")

    def test_bare_treenode_and_listnode_default_to_int(self):
        self.assertEqual(parse_type("TreeNode").kind, "binary_tree")
        self.assertEqual(parse_type("TreeNode").element.name, "int")
        self.assertEqual(parse_type("ListNode").kind, "linked_list")
        self.assertEqual(parse_type("ListNode").element.name, "int")

    def test_optional_wraps_any_kind(self):
        for t in ["Optional[int]", "Optional[string]", "Optional[TreeNode]", "Optional[vector<int>]"]:
            node = parse_type(t)
            self.assertEqual(node.kind, "optional")

    def test_bst_is_a_distinct_kind_from_binary_tree(self):
        self.assertEqual(parse_type("bst<int>").kind, "bst")
        self.assertEqual(parse_type("binary_tree<int>").kind, "binary_tree")

    def test_tuple_accepts_more_than_two_elements(self):
        node = parse_type("Tuple[int,int,int]")
        self.assertEqual(node.kind, "pair")
        self.assertEqual(len(node.elements), 3)

    def test_dict_is_accepted_as_map_alias(self):
        self.assertEqual(parse_type("Dict[string,int]").kind, "map")

    def test_unknown_type_still_raises(self):
        with self.assertRaises(TypeError_):
            parse_type("NotARealType<int>")


class OptionalSerializerTests(SimpleTestCase):
    def test_optional_int_round_trips_both_present_and_null(self):
        node = parse_type("Optional<int>")
        for value in (5, None):
            wire = serialize_value(node, value)
            self.assertEqual(deserialize_value(node, wire), value)
            text = serialize_output(node, value)
            self.assertEqual(parse_output(node, text), value)

    def test_optional_string_null_vs_present(self):
        node = parse_type("Optional<string>")
        self.assertEqual(deserialize_value(node, serialize_value(node, "hi")), "hi")
        self.assertIsNone(deserialize_value(node, serialize_value(node, None)))

    def test_optional_treenode_is_a_pure_passthrough(self):
        # An empty tree ([]) and Optional[TreeNode]=None must serialize
        # identically — no extra wrapper wire format for inherently
        # nullable structures.
        tree_node = parse_type("binary_tree<int>")
        optional_node = parse_type("Optional[TreeNode]")
        self.assertEqual(serialize_value(tree_node, []), serialize_value(optional_node, []))


class OptionalComparatorTests(SimpleTestCase):
    def test_optional_none_only_equal_to_none(self):
        node = parse_type("Optional<int>")
        self.assertTrue(compare_output(node, "null", None).passed)
        self.assertFalse(compare_output(node, "null", 5).passed)
        self.assertFalse(compare_output(node, "5", None).passed)
        self.assertTrue(compare_output(node, "5", 5).passed)


class MutatedInputWrapperTests(SimpleTestCase):
    def test_recover_tree_regression(self):
        """The exact case named in this session's spec (section 32):
        recoverTree(root: Optional[TreeNode]) -> None. The generated
        wrapper must construct the tree, call the function for its side
        effect only, and compare the MUTATED tree — not a return value —
        without the problem author writing any of that by hand."""
        schema = {
            "function_name": "recoverTree",
            "params": [("root", "Optional[TreeNode]")],
            "return_type": "void",
            "comparison": {"type": "mutated_input"},
        }
        stdin_text = serialize_value(parse_type("Optional[TreeNode]"), [1, 3, None, None, 2])
        expected = [3, 1, None, None, 2]

        py_sol = (
            "class Solution:\n"
            "    def recoverTree(self, root):\n"
            "        nodes = []\n"
            "        def inorder(n):\n"
            "            if not n: return\n"
            "            inorder(n.left)\n"
            "            nodes.append(n)\n"
            "            inorder(n.right)\n"
            "        inorder(root)\n"
            "        first = second = None\n"
            "        for i in range(len(nodes) - 1):\n"
            "            if nodes[i].val > nodes[i+1].val:\n"
            "                second = nodes[i+1]\n"
            "                if first is None:\n"
            "                    first = nodes[i]\n"
            "        if first and second:\n"
            "            first.val, second.val = second.val, first.val\n"
        )
        return_node = parse_type("Optional[TreeNode]")

        results_2of2 = []
        if _HAS_PYTHON:
            src = generate_source(schema, "python", py_sol)
            r = _run_python(src, stdin_text)
            cmp = compare_output(return_node, r.stdout, expected)
            self.assertTrue(cmp.passed, msg=f"python: {cmp.reason} stderr={r.stderr}")
            results_2of2.append(cmp.passed)

        # Second independent case: an already-sorted tree needs no swap.
        stdin_ok = serialize_value(parse_type("Optional[TreeNode]"), [2, 1, 3])
        if _HAS_PYTHON:
            src = generate_source(schema, "python", py_sol)
            r = _run_python(src, stdin_ok)
            cmp = compare_output(return_node, r.stdout, [2, 1, 3])
            self.assertTrue(cmp.passed, msg=f"python (already sorted): {cmp.reason}")
            results_2of2.append(cmp.passed)

        if _HAS_PYTHON:
            self.assertEqual(results_2of2, [True, True], "expected 2/2 passed")

    def test_recover_tree_with_realistic_type_hinted_student_code(self):
        """Regression for a real production bug: every other test in this
        file uses a solution written WITHOUT type hints, which is why this
        went unnoticed. A student who copy-pastes LeetCode's own starter
        code writes `def recoverTree(self, root: Optional[TreeNode]) ->
        None:` — Python evaluates that annotation at class-definition
        time, so `Optional`/`TreeNode` must already be in scope or the
        whole submission fails with NameError before a single line of the
        student's actual logic runs. LeetCode itself runs `from typing
        import *` behind the scenes for exactly this reason; this
        framework's Python wrapper prelude must too (see
        languages/python_lang.py's reader_prelude)."""
        schema = {
            "function_name": "recoverTree",
            "params": [("root", "Optional[TreeNode]")],
            "return_type": "void",
            "comparison": {"type": "mutated_input"},
        }
        py_sol = (
            "class Solution:\n"
            "    def recoverTree(self, root: Optional[TreeNode]) -> None:\n"
            "        \"\"\"\n"
            "        Do not return anything, modify root in-place instead.\n"
            "        \"\"\"\n"
            "        nodes = []\n"
            "        def inorder(n):\n"
            "            if not n: return\n"
            "            inorder(n.left)\n"
            "            nodes.append(n)\n"
            "            inorder(n.right)\n"
            "        inorder(root)\n"
            "        first = second = None\n"
            "        for i in range(len(nodes) - 1):\n"
            "            if nodes[i].val > nodes[i+1].val:\n"
            "                second = nodes[i+1]\n"
            "                if first is None:\n"
            "                    first = nodes[i]\n"
            "        if first and second:\n"
            "            first.val, second.val = second.val, first.val\n"
        )
        if not _HAS_PYTHON:
            return
        stdin_text = serialize_value(parse_type("Optional[TreeNode]"), [1, 3, None, None, 2])
        src = generate_source(schema, "python", py_sol)
        self.assertIn("from typing import", src)
        r = _run_python(src, stdin_text)
        self.assertEqual(r.returncode, 0, msg=f"stderr={r.stderr}")
        cmp = compare_output(parse_type("Optional[TreeNode]"), r.stdout, [3, 1, None, None, 2])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")

    def test_mutated_input_defaults_to_first_param_without_explicit_comparison_block(self):
        # return_type "void" alone (no explicit "comparison" key at all)
        # must still trigger mutated-input mode.
        schema = {
            "function_name": "zeroOut",
            "params": [("nums", "vector<int>")],
            "return_type": "void",
        }
        if not _HAS_PYTHON:
            return
        sol = "class Solution:\n    def zeroOut(self, nums):\n        for i in range(len(nums)):\n            nums[i] = 0\n"
        stdin_text = serialize_value(parse_type("vector<int>"), [1, 2, 3])
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("vector<int>"), r.stdout, [0, 0, 0])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")

    def test_mutated_param_can_be_explicitly_named_when_not_first(self):
        schema = {
            "function_name": "fillSecond",
            "params": [("n", "int"), ("nums", "vector<int>")],
            "return_type": "void",
            "comparison": {"type": "mutated_input", "mutated_param": "nums"},
        }
        if not _HAS_PYTHON:
            return
        sol = "class Solution:\n    def fillSecond(self, n, nums):\n        for i in range(len(nums)):\n            nums[i] = n\n"
        stdin_text = serialize_value(parse_type("int"), 9) + serialize_value(parse_type("vector<int>"), [0, 0])
        src = generate_source(schema, "python", sol)
        r = _run_python(src, stdin_text)
        cmp = compare_output(parse_type("vector<int>"), r.stdout, [9, 9])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")

    def test_mutated_input_java(self):
        if not _HAS_JAVAC:
            return
        schema = {
            "function_name": "recoverTree",
            "params": [("root", "Optional[TreeNode]")],
            "return_type": "void",
        }
        java_sol = (
            "class Solution {\n"
            "    List<TreeNode> nodes = new ArrayList<>();\n"
            "    public void recoverTree(TreeNode root) {\n"
            "        inorder(root);\n"
            "        TreeNode first = null, second = null;\n"
            "        for (int i = 0; i < nodes.size() - 1; i++) {\n"
            "            if (nodes.get(i).val > nodes.get(i+1).val) {\n"
            "                second = nodes.get(i+1);\n"
            "                if (first == null) first = nodes.get(i);\n"
            "            }\n"
            "        }\n"
            "        if (first != null && second != null) {\n"
            "            int tmp = first.val; first.val = second.val; second.val = tmp;\n"
            "        }\n"
            "    }\n"
            "    void inorder(TreeNode n) {\n"
            "        if (n == null) return;\n"
            "        inorder(n.left); nodes.add(n); inorder(n.right);\n"
            "    }\n"
            "}\n"
        )
        stdin_text = serialize_value(parse_type("Optional[TreeNode]"), [1, 3, None, None, 2])
        src = generate_source(schema, "java", java_sol)
        r = _run_java(src, stdin_text)
        cmp = compare_output(parse_type("Optional[TreeNode]"), r.stdout, [3, 1, None, None, 2])
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")


class OptionalPrimitiveWrapperTests(SimpleTestCase):
    def test_optional_int_param_and_return_python(self):
        if not _HAS_PYTHON:
            return
        schema = {"function_name": "maybeDouble", "params": [("x", "Optional<int>")], "return_type": "Optional<int>"}
        sol = "class Solution:\n    def maybeDouble(self, x):\n        return None if x is None else x * 2\n"
        return_node = parse_type("Optional<int>")
        for value, expected in [(5, 10), (None, None)]:
            stdin_text = serialize_value(parse_type("Optional<int>"), value)
            src = generate_source(schema, "python", sol)
            r = _run_python(src, stdin_text)
            cmp = compare_output(return_node, r.stdout, expected)
            self.assertTrue(cmp.passed, msg=f"value={value}: {cmp.reason} stderr={r.stderr}")

    def test_optional_int_param_and_return_javascript(self):
        if not _HAS_NODE:
            return
        schema = {"function_name": "maybeDouble", "params": [("x", "Optional<int>")], "return_type": "Optional<int>"}
        sol = "class Solution {\n    maybeDouble(x) { return x === null ? null : x * 2; }\n}\n"
        return_node = parse_type("Optional<int>")
        for value, expected in [(5, 10), (None, None)]:
            stdin_text = serialize_value(parse_type("Optional<int>"), value)
            src = generate_source(schema, "javascript", sol)
            r = _run_node(src, stdin_text)
            cmp = compare_output(return_node, r.stdout, expected)
            self.assertTrue(cmp.passed, msg=f"value={value}: {cmp.reason} stderr={r.stderr}")

    def test_optional_int_param_and_return_java(self):
        if not _HAS_JAVAC:
            return
        schema = {"function_name": "maybeDouble", "params": [("x", "Optional<int>")], "return_type": "Optional<int>"}
        sol = "class Solution {\n    public Integer maybeDouble(Integer x) { return x == null ? null : x * 2; }\n}\n"
        return_node = parse_type("Optional<int>")
        for value, expected in [(5, 10), (None, None)]:
            stdin_text = serialize_value(parse_type("Optional<int>"), value)
            src = generate_source(schema, "java", sol)
            r = _run_java(src, stdin_text)
            cmp = compare_output(return_node, r.stdout, expected)
            self.assertTrue(cmp.passed, msg=f"value={value}: {cmp.reason} stderr={r.stderr}")

    def test_optional_int_cpp_generates_plausibly(self):
        schema = {"function_name": "maybeDouble", "params": [("x", "Optional<int>")], "return_type": "Optional<int>"}
        sol = "class Solution {\npublic:\n    int* maybeDouble(int* x) { if (x == nullptr) return nullptr; return new int(*x * 2); }\n};\n"
        src = generate_source(schema, "cpp", sol)
        self.assertIn("int main()", src)
        self.assertIn("maybeDouble", src)


class BSTComparatorTests(SimpleTestCase):
    def test_bst_exact_shape_by_default(self):
        node = parse_type("bst<int>")
        self.assertTrue(compare_output(node, "[2,1,3]", [2, 1, 3]).passed)
        self.assertFalse(compare_output(node, "[1,null,2,null,null,null,3]", [2, 1, 3]).passed)

    def test_bst_property_mode_accepts_any_valid_shape_with_same_values(self):
        node = parse_type("bst<int>")
        # [2,1,3] and [1,null,2,null,null,null,3] are different shapes but
        # both valid BSTs over the same value set {1,2,3}.
        cmp = compare_output(node, "[1,null,2,null,null,null,3]", [2, 1, 3], unordered=True)
        self.assertTrue(cmp.passed, msg=cmp.reason)

    def test_bst_property_mode_rejects_a_structure_that_isnt_a_valid_bst(self):
        node = parse_type("bst<int>")
        # [3,1,2]: right child (2) is less than root (3) but placed as if
        # it were >= — not a legal BST — must fail even though the value
        # multiset matches.
        cmp = compare_output(node, "[1,3,2]", [2, 1, 3], unordered=True)
        self.assertFalse(cmp.passed)


class TupleArityTests(SimpleTestCase):
    def test_three_element_tuple_round_trips(self):
        node = parse_type("Tuple[int,int,int]")
        from ..serializer import serialize_value as sv, deserialize_value as dv
        wire = sv(node, (1, 2, 3))
        self.assertEqual(dv(node, wire), (1, 2, 3))

    def test_three_element_tuple_java_generates_a_tuple_class(self):
        if not _HAS_JAVAC:
            return
        schema = {
            "function_name": "makeTriple",
            "params": [("a", "int"), ("b", "int"), ("c", "int")],
            "return_type": "Tuple[int,int,int]",
        }
        sol = "class Solution {\n    public _Tuple3<Integer,Integer,Integer> makeTriple(int a, int b, int c) {\n        return new _Tuple3<>(a, b, c);\n    }\n}\n"
        stdin_text = serialize_value(parse_type("int"), 1) + serialize_value(parse_type("int"), 2) + serialize_value(parse_type("int"), 3)
        src = generate_source(schema, "java", sol)
        r = _run_java(src, stdin_text)
        cmp = compare_output(parse_type("Tuple[int,int,int]"), r.stdout, (1, 2, 3))
        self.assertTrue(cmp.passed, msg=f"{cmp.reason} stderr={r.stderr}")
