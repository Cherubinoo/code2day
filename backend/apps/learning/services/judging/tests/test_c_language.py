"""Coverage for C support in the generic judge — the fourth platform
language, added after "Convert BST to Greater Tree" and friends turned out
to have no C path at all (languages/registry.py only had python/javascript/
java/cpp). No local C compiler is available in this sandbox (checked:
no gcc/clang/tcc anywhere on PATH), so this verifies generated C
structurally — braces/parens balance and the exact call-site shape
LeetCode's own C convention expects (array params/returns decomposed into
a pointer + size, never a single struct/object argument) — the same
"verified structurally, not by an actual build" caveat this package's
README already documents for C++.

Scope intentionally excludes 2D arrays, graph, pair, map, set,
custom_struct, optional, random_list_node, doubly_linked_list_node, and
design/class-style problems — each must raise a clear ValueError rather
than emit subtly-broken C (matching the boundary the legacy
execution_adapter.py's own C path already draws)."""

from django.test import SimpleTestCase

from ..languages.registry import supported_languages
from ..wrapper_generator import generate_source, generate_design_source


def _balanced(src):
    return src.count("{") == src.count("}") and src.count("(") == src.count(")")


class CLanguageRegistrationTests(SimpleTestCase):
    def test_c_is_a_supported_language(self):
        self.assertIn("c", supported_languages())


class CScalarFunctionTests(SimpleTestCase):
    def test_scalar_params_and_return(self):
        schema = {
            "kind": "function", "function_name": "add",
            "params": [["a", "int"], ["b", "int"]], "return_type": "int", "custom_structs": {},
        }
        src = generate_source(schema, "c", "int add(int a, int b) { return a + b; }")
        self.assertTrue(_balanced(src))
        self.assertIn("int main(void)", src)
        self.assertIn("_c2d_load();", src)
        self.assertIn("int result = add(prim, prim2);", src)
        self.assertIn('printf("%s\\n", _c2d_sprintf_dup("%d", result));', src)

    def test_string_return_is_printed_unquoted(self):
        schema = {
            "kind": "function", "function_name": "greet",
            "params": [["name", "string"]], "return_type": "string", "custom_structs": {},
        }
        src = generate_source(schema, "c", "char* greet(char* name) { return name; }")
        self.assertTrue(_balanced(src))
        self.assertIn("char* result = greet(prim);", src)
        # Bare top-level strings print raw, never JSON-quoted (spec's own convention).
        self.assertIn('printf("%s\\n", result);', src)


class CArrayParamAndReturnTests(SimpleTestCase):
    def test_array_param_expands_to_pointer_and_size(self):
        schema = {
            "kind": "function", "function_name": "findKthLargest",
            "params": [["nums", "vector<int>"], ["k", "int"]], "return_type": "int", "custom_structs": {},
        }
        src = generate_source(schema, "c", "int findKthLargest(int* nums, int numsSize, int k) { return nums[0]; }")
        self.assertTrue(_balanced(src))
        self.assertIn("IntArray seq;", src)
        # LeetCode's own convention: (data pointer, size) as two separate args, never the struct itself.
        self.assertIn("int result = findKthLargest(seq.data, seq.size, prim2);", src)

    def test_array_return_uses_out_param_returnsize(self):
        schema = {
            "kind": "function", "function_name": "twoSum",
            "params": [["nums", "vector<int>"], ["target", "int"]], "return_type": "vector<int>", "custom_structs": {},
        }
        src = generate_source(
            schema, "c",
            "int* twoSum(int* nums, int numsSize, int target, int* returnSize) { "
            "*returnSize = 0; return NULL; }",
        )
        self.assertTrue(_balanced(src))
        self.assertIn("int returnSize;", src)
        self.assertIn("int* result = twoSum(seq.data, seq.size, prim2, &returnSize);", src)
        self.assertIn("_c2d_join_arr(out.data, out.size)", src)

    def test_mutated_array_param_reserializes_via_original_pointer(self):
        # void return -> mutated_input: the array is modified in place via
        # its own (data, size), and the OUTPUT re-reads from that same pair
        # afterward — never a captured return value.
        schema = {
            "kind": "function", "function_name": "moveZeroes",
            "params": [["nums", "vector<int>"]], "return_type": "void", "custom_structs": {},
        }
        src = generate_source(schema, "c", "void moveZeroes(int* nums, int numsSize) { }")
        self.assertTrue(_balanced(src))
        self.assertIn("moveZeroes(seq.data, seq.size);", src)
        self.assertIn("seq.size", src)
        self.assertIn("seq.data[i2]", src)

    def test_string_array_param(self):
        schema = {
            "kind": "function", "function_name": "longestCommonPrefix",
            "params": [["strs", "vector<string>"]], "return_type": "string", "custom_structs": {},
        }
        src = generate_source(
            schema, "c",
            "char* longestCommonPrefix(char** strs, int strsSize) { return strs[0]; }",
        )
        self.assertTrue(_balanced(src))
        self.assertIn("StringArray seq;", src)
        self.assertIn("longestCommonPrefix(seq.data, seq.size)", src)


class CLinkedListAndTreeTests(SimpleTestCase):
    def test_linked_list_param_and_return(self):
        schema = {
            "kind": "function", "function_name": "reverseList",
            "params": [["head", "ListNode"]], "return_type": "ListNode", "custom_structs": {},
        }
        src = generate_source(schema, "c", "struct ListNode* reverseList(struct ListNode* head) { return head; }")
        self.assertTrue(_balanced(src))
        self.assertIn("struct ListNode {", src)
        self.assertIn("struct ListNode* result = reverseList(head);", src)

    def test_binary_tree_param_and_return(self):
        schema = {
            "kind": "function", "function_name": "convertBST",
            "params": [["root", "TreeNode"]], "return_type": "TreeNode", "custom_structs": {},
        }
        src = generate_source(
            schema, "c",
            "struct TreeNode* convertBST(struct TreeNode* root) { return root; }",
        )
        self.assertTrue(_balanced(src))
        self.assertIn("struct TreeNode {", src)
        self.assertIn("TreeNodePtrArray", src)
        self.assertIn("struct TreeNode* result = convertBST(root);", src)

    def test_linked_list_of_string_is_rejected(self):
        schema = {
            "kind": "function", "function_name": "f",
            "params": [["head", "linked_list<string>"]], "return_type": "int", "custom_structs": {},
        }
        with self.assertRaisesMessage(ValueError, "scalar numeric T"):
            generate_source(schema, "c", "int f(void* head) { return 0; }")


class CUnsupportedShapesRaiseCleanErrors(SimpleTestCase):
    """A shape this package's C support was never built to handle must fail
    loudly at generation time — never silently emit broken C."""

    def _assert_rejected(self, ptype, message_fragment):
        schema = {
            "kind": "function", "function_name": "f",
            "params": [["x", ptype]], "return_type": "int", "custom_structs": {},
        }
        with self.assertRaisesMessage(ValueError, message_fragment):
            generate_source(schema, "c", "int f(void* x) { return 0; }")

    def test_2d_array_rejected(self):
        self._assert_rejected("vector<vector<int>>", "nested/2D array")

    def test_matrix_sugar_rejected(self):
        self._assert_rejected("matrix<int>", "nested/2D array")

    def test_graph_rejected(self):
        self._assert_rejected("graph", "does not support")

    def test_map_rejected(self):
        self._assert_rejected("map<string,int>", "does not support")

    def test_pair_rejected(self):
        self._assert_rejected("pair<int,int>", "does not support")

    def test_optional_rejected(self):
        self._assert_rejected("Optional<TreeNode>", "does not support")

    def test_custom_struct_rejected(self):
        schema = {
            "kind": "function", "function_name": "f",
            "params": [["p", "Point"]], "return_type": "int",
            "custom_structs": {"Point": {"x": "int", "y": "int"}},
        }
        with self.assertRaisesMessage(ValueError, "does not support"):
            generate_source(schema, "c", "int f(void* p) { return 0; }")


class CDesignNotSupportedTests(SimpleTestCase):
    def test_design_schema_raises_clear_error(self):
        schema = {
            "kind": "design", "class_name": "MinStack",
            "methods": {
                "MinStack": {"params": [], "return_type": "void"},
                "push": {"params": [["val", "int"]], "return_type": "void"},
            },
        }
        with self.assertRaisesMessage(ValueError, "not supported by the generic judge yet"):
            generate_design_source(schema, "c", "struct MinStack {};")
