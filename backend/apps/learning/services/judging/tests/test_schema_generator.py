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
from ..schema_generator import _parse_and_normalize_schema, validate_generic_schema


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
