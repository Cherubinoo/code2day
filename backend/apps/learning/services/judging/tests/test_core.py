"""Unit tests for the language-independent core: type_system, serializer,
comparator. No Judge0, no subprocess — pure Python, fast."""

from django.test import SimpleTestCase

from ..type_system import parse_type, TypeError_, is_null_aware
from ..serializer import serialize_value, deserialize_value, serialize_output, parse_output, SerializationError
from ..comparator import compare_output


class TypeSystemTests(SimpleTestCase):
    def test_every_spec_type_shape_parses(self):
        shapes = [
            "int", "long", "float", "double", "bool", "char", "string",
            "int[]", "int[][]", "vector<int>", "array<int>", "list<int>",
            "matrix<int>", "stack<int>", "queue<int>", "deque<int>",
            "vector<vector<int>>", "vector<vector<vector<int>>>",
            "linked_list<int>", "binary_tree<int>", "bst<int>", "graph",
            "pair<int,int>", "pair<int,string>", "vector<pair<int,int>>",
            "map<string,int>", "set<int>",
        ]
        for shape in shapes:
            node = parse_type(shape)
            self.assertEqual(node.raw, shape)

    def test_custom_struct_resolves_via_declared_fields(self):
        node = parse_type("Point", {"Point": {"x": "int", "y": "int"}})
        self.assertEqual(node.kind, "custom_struct")
        self.assertEqual(set(node.fields), {"x", "y"})

    def test_self_referential_custom_struct_raises_instead_of_recursing_forever(self):
        # A graph/trie/N-ary-tree node whose own field refers back to the
        # struct itself (e.g. Node.neighbors: vector<Node>) is a completely
        # natural shape for an LLM-generated schema to produce, and used to
        # blow the recursion stack instead of failing cleanly.
        structs = {"Node": {"val": "int", "neighbors": "vector<Node>"}}
        with self.assertRaises(TypeError_):
            parse_type("Node", structs)

    def test_indirect_custom_struct_cycle_raises(self):
        # A -> B -> A, not a direct self-reference — same underlying bug,
        # just one hop further away.
        structs = {"A": {"b": "B"}, "B": {"a": "A"}}
        with self.assertRaises(TypeError_):
            parse_type("A", structs)

    def test_non_cyclic_repeated_struct_reference_still_resolves(self):
        # The same non-recursive struct referenced twice by different
        # fields (a "diamond", not a cycle) must still parse fine — the
        # cycle guard should only fire on a genuine self-reference.
        structs = {"Point": {"x": "int", "y": "int"}, "Line": {"start": "Point", "end": "Point"}}
        node = parse_type("Line", structs)
        self.assertEqual(node.fields["start"].kind, "custom_struct")
        self.assertEqual(node.fields["end"].kind, "custom_struct")

    def test_unknown_type_raises(self):
        with self.assertRaises(TypeError_):
            parse_type("not_a_real_type<int>")

    def test_empty_type_string_raises(self):
        with self.assertRaises(TypeError_):
            parse_type("")

    def test_is_null_aware_only_for_binary_tree(self):
        self.assertTrue(is_null_aware(parse_type("binary_tree<int>")))
        self.assertFalse(is_null_aware(parse_type("linked_list<int>")))
        self.assertFalse(is_null_aware(parse_type("vector<int>")))


class SerializerRoundTripTests(SimpleTestCase):
    CASES = [
        ("int", 42), ("int", -1), ("int", 0),
        ("long", 9999999999999),
        ("double", 3.14), ("bool", True), ("bool", False),
        ("char", "x"), ("string", "hello world"), ("string", ""),
        ("vector<int>", [1, 2, 3]), ("vector<int>", []),
        ("vector<vector<int>>", [[1, 2], [3, 4]]),
        ("matrix<int>", [[1, 2, 3], [4, 5, 6]]),
        ("linked_list<int>", [1, 2, 3]), ("linked_list<int>", []),
        ("binary_tree<int>", [1, 2, 3, None, 4]), ("binary_tree<int>", []),
        ("pair<int,int>", (1, 2)),
        ("map<string,int>", {"a": 1, "b": 2}),
        ("set<int>", [1, 2, 3]),
    ]

    def test_input_wire_format_round_trips(self):
        for type_str, value in self.CASES:
            node = parse_type(type_str)
            wire = serialize_value(node, value)
            restored = deserialize_value(node, wire)
            self.assertEqual(restored, value, msg=type_str)

    def test_output_format_round_trips(self):
        for type_str, value in self.CASES:
            node = parse_type(type_str)
            text = serialize_output(node, value)
            restored = parse_output(node, text)
            self.assertEqual(restored, value, msg=type_str)

    def test_bare_top_level_string_is_unquoted(self):
        node = parse_type("string")
        self.assertEqual(serialize_output(node, "hello"), "hello")
        self.assertEqual(parse_output(node, "hello"), "hello")

    def test_graph_wire_format(self):
        node = parse_type("graph")
        value = {"n": 4, "edges": [[0, 1], [1, 2]]}
        wire = serialize_value(node, value)
        self.assertEqual(deserialize_value(node, wire), value)

    def test_custom_struct_round_trip(self):
        structs = {"Point": {"x": "int", "y": "int"}}
        node = parse_type("Point", structs)
        value = {"x": 1, "y": 2}
        wire = serialize_value(node, value)
        self.assertEqual(deserialize_value(node, wire), value)
        text = serialize_output(node, value)
        self.assertEqual(parse_output(node, text), value)

    def test_malformed_type_mismatched_input_raises(self):
        # A non-numeric token where a count/int was expected: not a
        # structural wire-format violation, so it surfaces as the
        # underlying conversion error (ValueError) rather than
        # SerializationError — comparator.compare_output() is the layer
        # that catches both uniformly for a Judge0 run's raw output.
        node = parse_type("vector<int>")
        with self.assertRaises(ValueError):
            deserialize_value(node, "not_a_number\n1\n")

    def test_truncated_input_raises_serialization_error(self):
        node = parse_type("vector<int>")
        with self.assertRaises(SerializationError):
            deserialize_value(node, "3\n1\n2\n")  # declares 3 elements, only gives 2


class ComparatorTests(SimpleTestCase):
    def test_array_order_sensitive_by_default(self):
        node = parse_type("vector<int>")
        self.assertTrue(compare_output(node, "[1,2]", [1, 2]).passed)
        self.assertFalse(compare_output(node, "[2,1]", [1, 2]).passed)

    def test_array_unordered_when_requested(self):
        node = parse_type("vector<int>")
        self.assertTrue(compare_output(node, "[2,1]", [1, 2], unordered=True).passed)

    def test_float_tolerance(self):
        node = parse_type("double")
        self.assertTrue(compare_output(node, "3.0000001", 3.0).passed)
        self.assertFalse(compare_output(node, "3.1", 3.0).passed)

    def test_binary_tree_trailing_nulls_ignored(self):
        node = parse_type("binary_tree<int>")
        self.assertTrue(compare_output(node, "[1,2,3,null,4]", [1, 2, 3, None, 4]).passed)
        self.assertTrue(compare_output(node, "[1,2,3,null,4,null,null]", [1, 2, 3, None, 4]).passed)
        self.assertFalse(compare_output(node, "[1,2,3,null,5]", [1, 2, 3, None, 4]).passed)

    def test_graph_edge_set_comparison_ignores_direction_and_order(self):
        node = parse_type("graph")
        actual = '{"n": 4, "edges": [[1,0],[2,1],[3,2]]}'
        expected = {"n": 4, "edges": [[0, 1], [1, 2], [2, 3]]}
        self.assertTrue(compare_output(node, actual, expected).passed)

    def test_large_integer_exact_comparison(self):
        node = parse_type("int")
        big = 9999999999999999999999999999
        self.assertTrue(compare_output(node, str(big), big).passed)

    def test_output_length_cap(self):
        node = parse_type("string")
        result = compare_output(node, "x" * 10, "x" * 10, max_output_len=5)
        self.assertFalse(result.passed)
        self.assertIn("exceeded", result.reason)

    def test_malformed_output_fails_gracefully_not_with_exception(self):
        node = parse_type("vector<int>")
        result = compare_output(node, "not json at all {{{", [1, 2])
        self.assertFalse(result.passed)
        self.assertIn("Could not parse", result.reason)
