"""Tests for the "Generate Starter Code" admin sweep
(AdminProblemBankGenerateStarterCodeView) — pre-computes and persists
Problem.generic_starter_code for every generic-judge problem, same
DB-flag-tracked-progress convention as the other bulk sweeps in views.py,
except this one calls no LLM at all (pure codegen off generic_schema via
services/judging/starter_code.generate_generic_starter_code)."""

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import Problem

_SCALAR_SCHEMA = {
    "kind": "function", "function_name": "add",
    "params": [["a", "int"], ["b", "int"]], "return_type": "int", "custom_structs": {},
}


class AdminGenerateStarterCodeSweepViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin-starter", password="secret123", email="s@s.com")
        self.client.login(username="admin-starter", password="secret123")

    def _post(self, force=False):
        url = reverse("admin-problem-bank-generate-starter-code")
        return self.client.post(url, {"force": True} if force else {})

    def test_requires_superuser(self):
        User.objects.create_user(username="student-starter", password="secret123")
        self.client.logout()
        self.client.login(username="student-starter", password="secret123")
        response = self._post()
        self.assertEqual(response.status_code, 403)

    def test_generates_and_persists_starter_code_for_generic_judge_problem(self):
        problem = Problem.objects.create(
            title="Add Two Numbers Scalar", slug="add-two-numbers-scalar-starter-test",
            description="Add a and b.", difficulty="Easy", tags=["Math"],
            uses_generic_judge=True, generic_schema=_SCALAR_SCHEMA,
        )
        response = self._post()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], problem.id)
        self.assertEqual(data["remaining_problems"], 0)

        problem.refresh_from_db()
        self.assertIn("Python", problem.generic_starter_code)
        self.assertIn("class Solution:", problem.generic_starter_code["Python"])
        self.assertIn("Java", problem.generic_starter_code)
        self.assertIn("C++", problem.generic_starter_code)
        self.assertIn("C", problem.generic_starter_code)

    def test_skips_problems_not_on_generic_judge(self):
        Problem.objects.create(
            title="Legacy Problem", slug="legacy-problem-starter-test",
            description="...", difficulty="Easy", tags=["Array"],
            uses_generic_judge=False, generic_schema=_SCALAR_SCHEMA,
        )
        Problem.objects.create(
            title="No Schema Yet", slug="no-schema-yet-starter-test",
            description="...", difficulty="Easy", tags=["Array"],
            uses_generic_judge=True, generic_schema=None,
        )
        response = self._post()
        data = response.json()
        self.assertEqual(data["processed"], [])
        self.assertEqual(data["remaining_problems"], 0)

    def test_second_run_does_not_touch_already_generated_problems(self):
        problem = Problem.objects.create(
            title="Add Two Numbers Scalar 2", slug="add-two-numbers-scalar-starter-test-2",
            description="Add a and b.", difficulty="Easy", tags=["Math"],
            uses_generic_judge=True, generic_schema=_SCALAR_SCHEMA,
        )
        self._post()
        problem.refresh_from_db()
        first_snapshot = problem.generic_starter_code

        other = Problem.objects.create(
            title="Other Scalar Problem", slug="other-scalar-problem-starter-test",
            description="...", difficulty="Easy", tags=["Math"],
            uses_generic_judge=True, generic_schema=_SCALAR_SCHEMA,
        )
        response = self._post()
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], other.id)

        problem.refresh_from_db()
        self.assertEqual(problem.generic_starter_code, first_snapshot)  # untouched by the second run

    def test_force_re_touches_already_generated_problems(self):
        problem = Problem.objects.create(
            title="Add Two Numbers Scalar 3", slug="add-two-numbers-scalar-starter-test-3",
            description="Add a and b.", difficulty="Easy", tags=["Math"],
            uses_generic_judge=True, generic_schema=_SCALAR_SCHEMA,
        )
        self._post()

        response = self._post(force=True)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], problem.id)

    def test_problem_with_unparseable_schema_reports_error_without_crashing(self):
        problem = Problem.objects.create(
            title="Malformed Schema Problem", slug="malformed-schema-starter-test",
            description="...", difficulty="Easy", tags=["Array"],
            uses_generic_judge=True,
            generic_schema={"kind": "function", "function_name": "f", "params": [["x", "not_a_real_type<<"]], "return_type": "int", "custom_structs": {}},
        )
        response = self._post()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        # A malformed type string is handled gracefully by generate_generic_starter_code
        # itself (returns None per-language), so this problem ends up with an empty
        # snapshot rather than an error — still counted as "processed", not crashed.
        self.assertNotIn("error", data["processed"][0])
        problem.refresh_from_db()
        self.assertEqual(problem.generic_starter_code, {})
