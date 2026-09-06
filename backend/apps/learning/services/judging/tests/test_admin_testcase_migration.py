"""Tests for the admin-facing test-case-generation / per-topic migration
views: AdminProblemGenerateGenericTestCasesView and
AdminProblemTopicGenerateGenericJudgeView (+ the shared
_migrate_problem_to_generic_judge helper). LLM calls mocked throughout —
same approach as test_schema_generator.py."""

import json
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from ....models import Problem


TWO_SUM_SCHEMA = {
    "function_name": "twoSum",
    "params": [["nums", "vector<int>"], ["target", "int"]],
    "return_type": "vector<int>",
    "custom_structs": {},
}
TWO_SUM_CASES = [
    {"stdin": "4\n2\n7\n11\n15\n9\n", "expected_output": "[0, 1]"},
    {"stdin": "0\n0\n", "expected_output": "[]"},
]


class AdminGenerateGenericTestCasesViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin0001", password="secret123", email="a@a.com")
        self.problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-tc", description="desc", difficulty="Easy", tags=["Array"],
            generic_schema=TWO_SUM_SCHEMA,
        )
        self.client.login(username="admin0001", password="secret123")

    def test_requires_generic_schema_first(self):
        no_schema_problem = Problem.objects.create(
            title="No Schema", slug="no-schema-tc", description="d", difficulty="Easy", tags=[],
        )
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-testcases", args=[no_schema_problem.id])
        )
        self.assertEqual(response.status_code, 400)

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_generates_and_replaces_test_cases(self, mocked_generate):
        mocked_generate.return_value = TWO_SUM_CASES
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-testcases", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["generated_count"], 2)
        self.assertEqual(data["test_case_count"], 2)

        self.problem.refresh_from_db()
        stored = list(self.problem.test_cases.order_by("order"))
        self.assertEqual(len(stored), 2)
        self.assertEqual(stored[0].stdin, TWO_SUM_CASES[0]["stdin"])
        self.assertTrue(stored[0].is_sample)
        self.assertFalse(stored[1].is_sample)

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_replaces_rather_than_appends_to_existing_test_cases(self, mocked_generate):
        from ....models import TestCase
        TestCase.objects.create(problem=self.problem, stdin="old-legacy-stdin", expected_output="old", order=1)
        mocked_generate.return_value = TWO_SUM_CASES

        self.client.post(reverse("admin-problem-bank-generate-generic-testcases", args=[self.problem.id]))

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.test_cases.count(), 2)
        self.assertFalse(self.problem.test_cases.filter(stdin="old-legacy-stdin").exists())

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_empty_result_is_reported_and_saves_nothing(self, mocked_generate):
        mocked_generate.return_value = []
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-testcases", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 502)
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.test_cases.count(), 0)

    def test_requires_admin(self):
        User.objects.create_user(username="student1", password="secret123")
        self.client.logout()
        self.client.login(username="student1", password="secret123")
        response = self.client.post(
            reverse("admin-problem-bank-generate-generic-testcases", args=[self.problem.id])
        )
        self.assertEqual(response.status_code, 403)


class AdminTopicGenerateGenericJudgeViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin0001", password="secret123", email="a@a.com")
        self.client.login(username="admin0001", password="secret123")

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_full_pipeline_enables_a_problem_missing_everything(self, mocked_schema, mocked_cases):
        problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-topic", description="desc", difficulty="Easy", tags=["Array"],
        )
        mocked_schema.return_value = TWO_SUM_SCHEMA
        mocked_cases.return_value = TWO_SUM_CASES

        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"])
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertTrue(data["processed"][0]["enabled"])
        self.assertTrue(data["processed"][0]["schema_generated"])

        problem.refresh_from_db()
        self.assertTrue(problem.uses_generic_judge)
        self.assertEqual(problem.generic_schema["function_name"], "twoSum")
        self.assertEqual(problem.test_cases.count(), 2)

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_reuses_existing_schema_without_regenerating(self, mocked_cases):
        problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-topic2", description="desc", difficulty="Easy", tags=["Array"],
            generic_schema=TWO_SUM_SCHEMA,
        )
        mocked_cases.return_value = TWO_SUM_CASES

        with patch("apps.learning.services.judging.schema_generator.generate_generic_schema") as mocked_schema:
            response = self.client.post(
                reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"])
            )
            mocked_schema.assert_not_called()

        self.assertEqual(response.status_code, 200)
        problem.refresh_from_db()
        self.assertTrue(problem.uses_generic_judge)

    def test_skips_already_enabled_problems_unless_forced(self):
        already = Problem.objects.create(
            title="Already Enabled", slug="already-enabled-topic", description="d", difficulty="Easy",
            tags=["Array"], generic_schema=TWO_SUM_SCHEMA, uses_generic_judge=True,
        )
        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"])
        )
        self.assertEqual(response.json()["processed"], [])

        with patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases", return_value=TWO_SUM_CASES):
            response = self.client.post(
                reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"]),
                data=json.dumps({"force": True}), content_type="application/json",
            )
        self.assertEqual(len(response.json()["processed"]), 1)

    @patch("apps.learning.services.judging.schema_generator.generate_generic_schema")
    def test_invalid_schema_leaves_judge_disabled_with_errors_reported(self, mocked_schema):
        problem = Problem.objects.create(
            title="Bad Schema Problem", slug="bad-schema-topic", description="d", difficulty="Easy", tags=["Array"],
        )
        mocked_schema.return_value = {
            "function_name": "2invalid", "params": [["x", "notARealType"]], "return_type": "int", "custom_structs": {},
        }
        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"])
        )
        data = response.json()
        self.assertFalse(data["processed"][0].get("enabled"))
        self.assertIn("schema_errors", data["processed"][0])

        problem.refresh_from_db()
        self.assertFalse(problem.uses_generic_judge)

    def test_only_touches_problems_in_the_given_topic(self):
        Problem.objects.create(title="Other Topic", slug="other-topic-tc", description="d", difficulty="Easy", tags=["Graph"])
        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Array"])
        )
        self.assertEqual(response.json()["processed"], [])


class AdminProblemBankRawTextFlagAndRegenerationTests(TestCase):
    """AdminProblemBankView's needs_test_case_regeneration flag (surfaced
    in the admin Problem Bank table) and the bulk fix for it,
    AdminProblemBankRegenerateRawTextTestCasesView — see models.py's
    TestCase.input_format and services/judging/integration.py's
    _effective_stdin() for why this class of problem needs regenerating
    at all."""

    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin0002", password="secret123", email="b@b.com")
        self.client.login(username="admin0002", password="secret123")

    def test_list_flags_generic_judge_problem_with_raw_text_case(self):
        from ....models import TestCase

        broken = Problem.objects.create(
            title="Distinct Subsequences", slug="distinct-subsequences-flag", description="d",
            difficulty="Hard", tags=["DP"], uses_generic_judge=True, generic_schema=TWO_SUM_SCHEMA,
        )
        TestCase.objects.create(
            problem=broken, stdin='s = "a", t = "b"', expected_output="1", order=1,
            input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        fine = Problem.objects.create(
            title="Two Sum", slug="two-sum-flag", description="d", difficulty="Easy", tags=["Array"],
            uses_generic_judge=True, generic_schema=TWO_SUM_SCHEMA,
        )
        TestCase.objects.create(
            problem=fine, stdin="4\n2\n7\n11\n15\n9\n", expected_output="[0, 1]", order=1,
            input_format=TestCase.INPUT_FORMAT_WIRE,
        )
        # A legacy-only problem with a raw_text row is fine as-is (the
        # legacy path adapts it on its own) — must NOT be flagged as
        # needing regeneration.
        legacy_only = Problem.objects.create(
            title="Legacy Problem", slug="legacy-flag", description="d", difficulty="Easy", tags=[],
        )
        TestCase.objects.create(
            problem=legacy_only, stdin="s = 1", expected_output="1", order=1,
            input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )

        response = self.client.get(reverse("admin-problem-bank"))
        data = response.json()
        by_slug = {p["slug"]: p for p in data["problems"]}

        self.assertTrue(by_slug["distinct-subsequences-flag"]["needs_test_case_regeneration"])
        self.assertFalse(by_slug["two-sum-flag"]["needs_test_case_regeneration"])
        self.assertFalse(by_slug["legacy-flag"]["needs_test_case_regeneration"])
        self.assertEqual(data["needs_test_case_regeneration_count"], 1)

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_bulk_regenerate_only_touches_flagged_problems(self, mocked_generate):
        from ....models import TestCase

        broken = Problem.objects.create(
            title="Distinct Subsequences", slug="distinct-subsequences-bulk", description="d",
            difficulty="Hard", tags=["DP"], uses_generic_judge=True, generic_schema=TWO_SUM_SCHEMA,
        )
        TestCase.objects.create(
            problem=broken, stdin='s = "a", t = "b"', expected_output="1", order=1,
            input_format=TestCase.INPUT_FORMAT_RAW_TEXT,
        )
        fine = Problem.objects.create(
            title="Two Sum", slug="two-sum-bulk", description="d", difficulty="Easy", tags=["Array"],
            uses_generic_judge=True, generic_schema=TWO_SUM_SCHEMA,
        )
        TestCase.objects.create(
            problem=fine, stdin="4\n2\n7\n11\n15\n9\n", expected_output="[0, 1]", order=1,
            input_format=TestCase.INPUT_FORMAT_WIRE,
        )

        mocked_generate.return_value = TWO_SUM_CASES
        response = self.client.post(reverse("admin-problem-bank-regenerate-raw-text-testcases"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], broken.id)
        self.assertTrue(data["processed"][0]["regenerated"])
        mocked_generate.assert_called_once()

        broken.refresh_from_db()
        stored = list(broken.test_cases.order_by("order"))
        self.assertEqual(len(stored), 2)
        self.assertEqual(stored[0].input_format, TestCase.INPUT_FORMAT_WIRE)

        # Untouched — was never flagged.
        self.assertEqual(fine.test_cases.count(), 1)
        self.assertEqual(fine.test_cases.first().stdin, "4\n2\n7\n11\n15\n9\n")


class StdinExecutionTypeMigrationTests(TestCase):
    """execution_type="stdin" problems (see services/judging/integration.py's
    kind=="stdin" branch): _known_generic_schema_kind() must resolve to
    "stdin" (no LLM call at all — generate_generic_schema short-circuits),
    and the per-topic migration must enable the judge directly, never
    calling generate_generic_test_cases (there's no function/class schema
    to build wire-format test cases from — the problem's existing raw
    stdin test cases are already exactly right)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin0003", password="secret123", email="c@c.com")
        self.client.login(username="admin0003", password="secret123")

    @patch("apps.learning.services.judging.generic_testcase_generator.generate_generic_test_cases")
    def test_topic_migration_enables_stdin_problem_without_generating_test_cases(self, mocked_cases):
        from ....models import TestCase

        problem = Problem.objects.create(
            title="A+B Problem", slug="a-plus-b-topic", description="Read two integers, print their sum.",
            difficulty="Easy", tags=["Basics"], execution_type="stdin",
        )
        TestCase.objects.create(problem=problem, stdin="2 3\n", expected_output="5", order=1)

        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Basics"])
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertTrue(data["processed"][0]["enabled"])
        self.assertNotIn("test_cases_generated", data["processed"][0])
        mocked_cases.assert_not_called()

        problem.refresh_from_db()
        self.assertTrue(problem.uses_generic_judge)
        self.assertEqual(problem.generic_schema, {"kind": "stdin"})
        # Its original test case is untouched, not replaced.
        self.assertEqual(problem.test_cases.count(), 1)
        self.assertEqual(problem.test_cases.first().stdin, "2 3\n")

    def test_topic_migration_warns_when_stdin_problem_has_no_test_cases(self):
        Problem.objects.create(
            title="Empty Stdin Problem", slug="empty-stdin-topic", description="d",
            difficulty="Easy", tags=["Basics2"], execution_type="stdin",
        )
        response = self.client.post(
            reverse("admin-problem-bank-topic-generate-generic-judge", args=["Basics2"])
        )
        data = response.json()
        self.assertTrue(data["processed"][0]["enabled"])
        self.assertIn("warning", data["processed"][0])
