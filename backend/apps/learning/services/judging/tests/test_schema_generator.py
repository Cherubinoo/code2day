"""Tests for the AI-assisted `generic_schema` generation/validation admin
flow: schema_generator.py's pure functions, plus the three admin views
(single-problem "one hit run", bulk generate, bulk validate-and-enable),
with the LLM call itself mocked — same approach as the existing
Judge0RunApiTests/aptitude-bank tests use for their own LLM/HTTP calls."""

from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from django.urls import reverse

from ....models import Problem
from ...testcase_generator import TestCaseGenServiceError
from ..schema_generator import (
    _parse_and_normalize_schema, _parse_and_normalize_design_schema,
    validate_generic_schema, detect_schema_kind, generate_generic_schema,
)


class DetectSchemaKindTests(SimpleTestCase):
    def test_plain_function_problem_is_function_kind(self):
        self.assertEqual(
            detect_schema_kind(title="Two Sum", description="Given an array of integers nums and an integer target..."),
            "function",
        )

    def test_design_phrase_in_title_is_design_kind(self):
        self.assertEqual(
            detect_schema_kind(title="Design a HashMap", description="Design a HashMap without using any built-in hash table libraries."),
            "design",
        )

    def test_implement_the_x_class_phrase_is_design_kind(self):
        self.assertEqual(
            detect_schema_kind(
                title="Zigzag Iterator",
                description="Implement the ZigzagIterator class: ZigzagIterator(List<int> v1, List<int> v2) initializes...",
            ),
            "design",
        )

    def test_design_wire_format_example_input_is_design_kind(self):
        # No design phrasing in the text at all — only the example's own
        # input shape (a 2-element array whose first element is a list of
        # operation-name strings) signals this is design-shaped.
        examples = [{"input": '[["MyClass","foo"],[[1],[]]]', "output": "[null,2]"}]
        self.assertEqual(
            detect_schema_kind(title="Untitled", description="Something something.", examples=examples),
            "design",
        )


class GenerateGenericSchemaKnownKindTests(SimpleTestCase):
    """known_kind must bypass detect_schema_kind's heuristic entirely —
    used by the admin bulk sweeps for a problem whose legacy param_schema
    already proves it's design-shaped, so a heuristic miss can't
    regenerate the original single-method-function bug."""

    @patch("apps.learning.services.judging.schema_generator._try_providers_in_order")
    def test_known_kind_design_skips_heuristic_even_with_function_like_text(self, mocked_try):
        mocked_try.return_value = {"class_name": "Foo", "methods": {"Foo": {"params": [], "return_type": "void"}, "bar": {"params": [], "return_type": "int"}}}
        schema = generate_generic_schema(
            title="Two Sum", description="Given an array of integers nums and an integer target, return indices.",
            known_kind="design", providers=["dummy-provider"],
        )
        self.assertEqual(schema["kind"], "design")
        prompt = mocked_try.call_args.args[1]
        self.assertIn("DESIGN A CLASS", prompt)

    @patch("apps.learning.services.judging.schema_generator._try_providers_in_order")
    def test_known_kind_function_skips_heuristic_even_with_design_phrasing(self, mocked_try):
        mocked_try.return_value = {"function_name": "foo", "params": [], "return_type": "int"}
        schema = generate_generic_schema(
            title="Design a HashMap", description="Design a HashMap without using any built-in hash table libraries.",
            known_kind="function", providers=["dummy-provider"],
        )
        self.assertEqual(schema["kind"], "function")
        prompt = mocked_try.call_args.args[1]
        self.assertNotIn("DESIGN A CLASS", prompt)

    @patch("apps.learning.services.judging.schema_generator._try_providers_in_order")
    def test_no_known_kind_falls_back_to_heuristic(self, mocked_try):
        mocked_try.return_value = {"function_name": "twoSum", "params": [], "return_type": "int"}
        schema = generate_generic_schema(title="Two Sum", description="Given an array of integers...", providers=["dummy-provider"])
        self.assertEqual(schema["kind"], "function")

    @patch("apps.learning.services.judging.schema_generator._try_providers_in_order")
    @patch("apps.learning.services.judging.schema_generator._providers_in_rotation_order")
    def test_known_kind_stdin_makes_no_llm_call_at_all(self, mocked_rotation, mocked_try):
        # The whole point of stdin-mode: there's nothing to infer (no
        # function/class, no types), so generation must be free — no
        # provider lookup, no prompt, no API call, not even when zero
        # providers are configured (which would otherwise raise
        # NoProvidersAvailableError).
        schema = generate_generic_schema(title="A+B Problem", description="Read two integers, print their sum.", known_kind="stdin")
        self.assertEqual(schema, {"kind": "stdin"})
        mocked_try.assert_not_called()
        mocked_rotation.assert_not_called()


class ValidateGenericSchemaTests(SimpleTestCase):
    def test_valid_schema_has_no_errors(self):
        schema = {
            "function_name": "twoSum",
            "params": [["nums", "vector<int>"], ["target", "int"]],
            "return_type": "vector<int>",
            "custom_structs": {},
        }
        self.assertEqual(validate_generic_schema(schema), [])

    def test_bad_function_name_and_types_are_reported(self):
        schema = {"function_name": "2sum", "params": [["nums", "vectorOfInt"]], "return_type": "notAType"}
        errors = validate_generic_schema(schema)
        self.assertTrue(any("function_name" in e for e in errors))
        self.assertTrue(any("nums" in e for e in errors))
        self.assertTrue(any("return_type" in e for e in errors))

    def test_void_return_type_is_not_parsed_as_a_real_type(self):
        # Regression: validate_generic_schema used to call parse_type("void")
        # unconditionally and reject every mutated-input schema outright
        # (e.g. recoverTree(root: Optional[TreeNode]) -> None) — "void" is
        # wrapper_generator.py's own sentinel, never a real type string.
        schema = {
            "function_name": "recoverTree", "params": [["root", "Optional[TreeNode]"]],
            "return_type": "void", "custom_structs": {},
            "comparison": {"type": "mutated_input", "mutated_param": "root"},
        }
        self.assertEqual(validate_generic_schema(schema), [])

    def test_mutated_param_must_match_a_declared_param_name(self):
        schema = {
            "function_name": "recoverTree", "params": [["root", "Optional[TreeNode]"]],
            "return_type": "void", "comparison": {"type": "mutated_input", "mutated_param": "notAParam"},
        }
        errors = validate_generic_schema(schema)
        self.assertTrue(any("mutated_param" in e for e in errors))

    def test_custom_struct_fields_are_validated(self):
        schema = {
            "function_name": "shift", "params": [["p", "Point"]], "return_type": "Point",
            "custom_structs": {"Point": {"x": "int", "y": "int"}},
        }
        self.assertEqual(validate_generic_schema(schema), [])

    def test_not_a_dict_is_rejected(self):
        self.assertEqual(validate_generic_schema("not a schema"), ["Schema is not a JSON object."])

    def test_normalizer_accepts_dict_shaped_params_from_llm(self):
        raw = (
            '{"function_name": "shift", "params": [{"name":"p","type":"Point"}], '
            '"return_type": "Point", "custom_structs": {"Point": {"x":"int","y":"int"}}}'
        )
        normalized = _parse_and_normalize_schema(raw)
        self.assertEqual(normalized["params"], [["p", "Point"]])
        self.assertEqual(validate_generic_schema(normalized), [])

    def test_normalizer_rejects_missing_params_list(self):
        with self.assertRaises(TestCaseGenServiceError):
            _parse_and_normalize_schema('{"function_name": "x", "return_type": "int"}')


class ValidateStdinSchemaTests(SimpleTestCase):
    def test_stdin_schema_is_always_valid(self):
        self.assertEqual(validate_generic_schema({"kind": "stdin"}), [])

    def test_stdin_schema_ignores_extra_junk_fields(self):
        # Nothing to check beyond the kind marker — a stdin schema has no
        # function/class/type shape to get wrong.
        self.assertEqual(validate_generic_schema({"kind": "stdin", "whatever": 123}), [])


class ValidateDesignSchemaTests(SimpleTestCase):
    def test_valid_design_schema_has_no_errors(self):
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
        self.assertEqual(validate_generic_schema(schema), [])

    def test_missing_constructor_entry_is_reported(self):
        schema = {
            "kind": "design", "class_name": "Foo",
            "methods": {"bar": {"params": [], "return_type": "int"}},
        }
        errors = validate_generic_schema(schema)
        self.assertTrue(any("constructor" in e for e in errors))

    def test_constructor_only_with_no_other_methods_is_rejected(self):
        # A "design" schema that's really just a function in disguise —
        # the whole point of this schema kind is a shared instance with
        # multiple operations.
        schema = {
            "kind": "design", "class_name": "Foo",
            "methods": {"Foo": {"params": [], "return_type": "void"}},
        }
        errors = validate_generic_schema(schema)
        self.assertTrue(any("at least one method besides the constructor" in e for e in errors))

    def test_bad_param_type_in_a_method_is_reported(self):
        schema = {
            "kind": "design", "class_name": "Foo",
            "methods": {
                "Foo": {"params": [], "return_type": "void"},
                "bar": {"params": [["x", "vectorOfInt"]], "return_type": "int"},
            },
        }
        errors = validate_generic_schema(schema)
        self.assertTrue(any("bar" in e and "x" in e for e in errors))

    def test_missing_kind_key_defaults_to_function_validation(self):
        # Backward compatibility: every schema saved before this feature
        # existed has no "kind" key at all — must still validate as a
        # function-style schema, not silently misbehave.
        schema = {"function_name": "twoSum", "params": [["nums", "vector<int>"], ["target", "int"]], "return_type": "vector<int>"}
        self.assertEqual(validate_generic_schema(schema), [])


class ParseAndNormalizeDesignSchemaTests(SimpleTestCase):
    def test_accepts_dict_shaped_methods_from_llm(self):
        raw = (
            '{"class_name": "MinStack", "methods": {'
            '"MinStack": {"params": [], "return_type": "void"}, '
            '"push": {"params": [{"name": "val", "type": "int"}], "return_type": "void"}, '
            '"top": {"params": [], "return_type": "int"}}}'
        )
        normalized = _parse_and_normalize_design_schema(raw)
        self.assertEqual(normalized["class_name"], "MinStack")
        self.assertEqual(normalized["methods"]["push"]["params"], [["val", "int"]])
        self.assertEqual(validate_generic_schema({**normalized, "kind": "design"}), [])

    def test_rejects_missing_methods_object(self):
        with self.assertRaises(TestCaseGenServiceError):
            _parse_and_normalize_design_schema('{"class_name": "Foo"}')


class AdminGenericSchemaViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin0001", password="secret123", email="a@a.com")
        self.problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-ai", description="desc", difficulty="Easy", tags=["Array"],
        )

    def test_generate_requires_admin(self):
        User.objects.create_user(username="student1", password="secret123")
        self.client.login(username="student1", password="secret123")
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-schema", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 403)

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_single_problem_generate_saves_schema_without_blocking_on_validation(self, mocked_generate):
        # Deliberately invalid (function_name isn't identifier-safe) — the
        # "one hit run" must still save it; validation is a separate step.
        mocked_generate.return_value = {
            "function_name": "2sum", "params": [["nums", "vector<int>"]], "return_type": "int", "custom_structs": {},
        }
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-schema", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["generic_schema"]["function_name"], "2sum")
        self.assertTrue(data["validation_errors"])  # reported, but not blocking

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.generic_schema["function_name"], "2sum")
        self.assertFalse(self.problem.uses_generic_judge)  # never auto-enabled by this endpoint

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_single_problem_generate_refuses_to_overwrite_without_force(self, mocked_generate):
        self.problem.generic_schema = {"function_name": "existing", "params": [], "return_type": "int"}
        self.problem.save(update_fields=["generic_schema"])
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-schema", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 400)
        mocked_generate.assert_not_called()

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_bulk_generate_only_touches_problems_missing_a_schema(self, mocked_generate):
        already_has = Problem.objects.create(
            title="Already Has One", slug="already-has-one", description="d", difficulty="Easy", tags=[],
            generic_schema={"function_name": "existing", "params": [], "return_type": "int"},
        )
        mocked_generate.return_value = {
            "function_name": "twoSum", "params": [["nums", "vector<int>"], ["target", "int"]],
            "return_type": "vector<int>", "custom_structs": {},
        }
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(reverse("admin-problem-bank-generate-generic-schemas"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], self.problem.id)
        mocked_generate.assert_called_once()

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.generic_schema["function_name"], "twoSum")
        already_has.refresh_from_db()
        self.assertEqual(already_has.generic_schema["function_name"], "existing")  # untouched

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_validate_pass_enables_a_valid_schema(self, mocked_generate):
        self.problem.generic_schema = {
            "function_name": "twoSum", "params": [["nums", "vector<int>"], ["target", "int"]],
            "return_type": "vector<int>", "custom_structs": {},
        }
        self.problem.save(update_fields=["generic_schema"])
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(reverse("admin-problem-bank-validate-generic-schemas"))
        self.assertEqual(response.status_code, 200)
        mocked_generate.assert_not_called()  # already valid — no need to regenerate

        self.problem.refresh_from_db()
        self.assertTrue(self.problem.uses_generic_judge)

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_validate_pass_regenerates_an_invalid_schema_once(self, mocked_generate):
        self.problem.generic_schema = {"function_name": "2sum", "params": [["nums", "vectorOfInt"]], "return_type": "int"}
        self.problem.save(update_fields=["generic_schema"])
        mocked_generate.return_value = {
            "function_name": "twoSum", "params": [["nums", "vector<int>"], ["target", "int"]],
            "return_type": "vector<int>", "custom_structs": {},
        }
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(reverse("admin-problem-bank-validate-generic-schemas"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["processed"][0]["regenerated"])
        self.assertTrue(data["processed"][0]["enabled"])
        mocked_generate.assert_called_once()

        self.problem.refresh_from_db()
        self.assertTrue(self.problem.uses_generic_judge)
        self.assertEqual(self.problem.generic_schema["function_name"], "twoSum")

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_validate_pass_leaves_disabled_when_still_invalid_after_retry(self, mocked_generate):
        self.problem.generic_schema = {"function_name": "2sum", "params": [["nums", "vectorOfInt"]], "return_type": "int"}
        self.problem.save(update_fields=["generic_schema"])
        # Regeneration still comes back bad.
        mocked_generate.return_value = {"function_name": "2sum", "params": [["nums", "vectorOfInt"]], "return_type": "int"}
        self.client.login(username="admin0001", password="secret123")
        response = self.client.post(reverse("admin-problem-bank-validate-generic-schemas"))
        data = response.json()
        self.assertFalse(data["processed"][0].get("enabled"))
        self.assertIn("errors", data["processed"][0])

        self.problem.refresh_from_db()
        self.assertFalse(self.problem.uses_generic_judge)
