"""Tests for generic_testcase_generator.py — LLM call itself always
mocked (same pattern as test_schema_generator.py), the real thing under
test is: (1) the prompt-building/schema-to-params plumbing, (2) that
_check_shape actually rejects a mismatched value rather than silently
coercing it, (3) that valid cases convert to the correct wire format."""

import json
from contextlib import ExitStack
from unittest.mock import patch

from django.test import SimpleTestCase

from ..generic_testcase_generator import generate_generic_test_cases, _check_shape
from ..serializer import SerializationError
from ..type_system import parse_type


def _mock_llm(fake_response):
    stack = ExitStack()
    stack.enter_context(patch(
        "apps.learning.services.judging.generic_testcase_generator._providers_in_rotation_order",
        return_value=["fake_provider"],
    ))
    stack.enter_context(patch(
        "apps.learning.services.judging.generic_testcase_generator._try_providers_in_order",
        side_effect=lambda providers, prompt, transform, log_label: transform(fake_response),
    ))
    return stack


class ShapeCheckTests(SimpleTestCase):
    def test_accepts_matching_shapes(self):
        cases = [
            ("int", 5), ("string", "hi"), ("bool", True),
            ("vector<int>", [1, 2, 3]), ("vector<int>", []),
            ("linked_list<int>", [1, 2, 3]),
            ("binary_tree<int>", [1, 2, None, None, 3]),
            ("Optional<int>", None), ("Optional<int>", 5),
            ("graph", {"n": 3, "edges": [[0, 1]]}),
            ("Tuple[int,string]", [1, "x"]),
            ("map<string,int>", [["a", 1], ["b", 2]]),
        ]
        for type_str, value in cases:
            _check_shape(parse_type(type_str), value)  # must not raise

    def test_rejects_dict_where_list_expected(self):
        with self.assertRaises(SerializationError):
            _check_shape(parse_type("vector<int>"), {"not": "a list"})

    def test_rejects_float_where_int_expected(self):
        with self.assertRaises(SerializationError):
            _check_shape(parse_type("int"), 6.5)

    def test_rejects_bool_where_int_expected(self):
        # Python bool is an int subclass — must not sneak past an int check.
        with self.assertRaises(SerializationError):
            _check_shape(parse_type("int"), True)

    def test_rejects_malformed_graph_object(self):
        with self.assertRaises(SerializationError):
            _check_shape(parse_type("graph"), {"nodes": 3})  # wrong keys

    def test_rejects_wrong_arity_tuple(self):
        with self.assertRaises(SerializationError):
            _check_shape(parse_type("Tuple[int,int,int]"), [1, 2])

    def test_custom_struct_requires_all_fields(self):
        node = parse_type("Point", {"Point": {"x": "int", "y": "int"}})
        _check_shape(node, {"x": 1, "y": 2})
        with self.assertRaises(SerializationError):
            _check_shape(node, {"x": 1})


class GenerateGenericTestCasesTests(SimpleTestCase):
    def test_two_sum_valid_and_invalid_cases(self):
        schema = {"function_name": "twoSum", "params": [["nums", "vector<int>"], ["target", "int"]], "return_type": "vector<int>"}
        fake_response = json.dumps([
            {"params": {"nums": [2, 7, 11, 15], "target": 9}, "expected_output": [0, 1]},
            {"params": {"nums": [], "target": 0}, "expected_output": []},
            {"params": {"nums": [3, 2, 4], "target": 6.5}, "expected_output": [1, 2]},  # bad: float target
        ])
        with _mock_llm(fake_response):
            cases = generate_generic_test_cases(title="Two Sum", description="...", schema=schema)

        self.assertEqual(len(cases), 2)
        self.assertEqual(cases[0]["stdin"], "4\n2\n7\n11\n15\n9\n")
        self.assertEqual(json.loads(cases[0]["expected_output"]), [0, 1])

    def test_mutated_input_uses_mutated_param_type_not_return_type(self):
        schema = {
            "function_name": "recoverTree", "params": [["root", "Optional[TreeNode]"]],
            "return_type": "void", "comparison": {"type": "mutated_input"},
        }
        fake_response = json.dumps([
            {"params": {"root": [1, 3, None, None, 2]}, "expected_output": [3, 1, None, None, 2]},
            {"params": {"root": [1, 3, None, None, 2]}, "expected_output": {"not": "a tree"}},  # bad shape
        ])
        with _mock_llm(fake_response):
            cases = generate_generic_test_cases(title="Recover BST", description="...", schema=schema)

        self.assertEqual(len(cases), 1)
        self.assertEqual(json.loads(cases[0]["expected_output"]), [3, 1, None, None, 2])

    def test_case_missing_a_declared_param_is_dropped_before_shape_check(self):
        schema = {"function_name": "f", "params": [["a", "int"], ["b", "int"]], "return_type": "int"}
        # second case is missing "b" entirely
        fake_response = json.dumps([
            {"params": {"a": 1, "b": 2}, "expected_output": 3},
            {"params": {"a": 1}, "expected_output": 3},
        ])
        with _mock_llm(fake_response):
            cases = generate_generic_test_cases(title="f", description="...", schema=schema)
        self.assertEqual(len(cases), 1)

    def test_all_cases_malformed_returns_empty_list_not_an_exception(self):
        schema = {"function_name": "f", "params": [["a", "int"]], "return_type": "int"}
        fake_response = json.dumps([{"params": {"a": "not an int"}, "expected_output": 1}])
        with _mock_llm(fake_response):
            cases = generate_generic_test_cases(title="f", description="...", schema=schema)
        self.assertEqual(cases, [])
