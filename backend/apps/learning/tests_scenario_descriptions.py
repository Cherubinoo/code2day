"""Tests for the "Generate Scenario Descriptions" admin sweep
(AdminProblemBankRegenerateScenarioDescriptionsView) and its underlying
generate_scenario_description() — rewrites Problem.description into an
original real-world scenario, same DB-flag-tracked-progress convention as
the existing "Regenerate All Explanations" sweep. LLM calls mocked
throughout, same approach as test_schema_generator.py."""

from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import LLMProvider, Problem
from .services.testcase_generator import TestCaseGenServiceError, generate_scenario_description


class GenerateScenarioDescriptionTests(TestCase):
    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_returns_stripped_llm_text(self, mocked_fallback):
        mocked_fallback.return_value = "  A dispatcher must pair delivery slots that sum to a deadline.  \n"
        result = generate_scenario_description(title="Two Sum", description="Given an array of integers...")
        self.assertEqual(result, "A dispatcher must pair delivery slots that sum to a deadline.")
        mocked_fallback.assert_called_once()
        prompt = mocked_fallback.call_args.args[0]
        self.assertIn("Two Sum", prompt)
        self.assertIn("Given an array of integers...", prompt)
        self.assertIn("LeetCode", prompt)  # the prompt itself instructs never to mention it

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_empty_response_raises(self, mocked_fallback):
        mocked_fallback.return_value = "   "
        with self.assertRaises(TestCaseGenServiceError):
            generate_scenario_description(title="X", description="Y")


class AdminRegenerateScenarioDescriptionsViewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin-scn", password="secret123", email="a@a.com")
        self.client.login(username="admin-scn", password="secret123")
        self.provider = LLMProvider.objects.create(
            name="Test Provider", base_url="https://example.test/v1", api_key="k", model_name="test-model",
        )
        self.problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-scenario-test",
            description="Given an array of integers nums and an integer target, return indices...\n"
                         "Note: This question is the same as 1: https://leetcode.com/problems/two-sum/",
            difficulty="Easy", tags=["Array"],
        )

    def _post(self):
        return self.client.post(reverse("admin-problem-bank-regenerate-scenario-descriptions"))

    def test_requires_superuser(self):
        User.objects.create_user(username="student-scn", password="secret123")
        self.client.logout()
        self.client.login(username="student-scn", password="secret123")
        response = self._post()
        self.assertEqual(response.status_code, 403)

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_rewrites_description_and_backs_up_original(self, mocked_fallback):
        mocked_fallback.return_value = "A cashier needs to find two price tags that sum to a customer's budget."

        response = self._post()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertTrue(data["processed"][0]["generated"])
        self.assertEqual(data["remaining_problems"], 0)

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.description, "A cashier needs to find two price tags that sum to a customer's budget.")
        self.assertTrue(self.problem.description_is_scenario)
        # Original preserved verbatim, including the leaked LeetCode note —
        # this is the one place that's still allowed to exist (a backup),
        # since it's never shown to students.
        self.assertIn("leetcode.com", self.problem.description_original)

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_second_run_does_not_touch_already_migrated_problems(self, mocked_fallback):
        mocked_fallback.return_value = "A cashier needs to find two price tags that sum to a customer's budget."
        self._post()
        self.problem.refresh_from_db()
        original_backup = self.problem.description_original

        other = Problem.objects.create(
            title="Other Problem", slug="other-problem-scenario-test",
            description="Some other original statement.", difficulty="Easy", tags=["Array"],
        )
        mocked_fallback.return_value = "A different scenario entirely."
        response = self._post()
        data = response.json()

        # Only the still-unmigrated problem gets touched.
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], other.id)

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.description, "A cashier needs to find two price tags that sum to a customer's budget.")
        self.assertEqual(self.problem.description_original, original_backup)  # never overwritten again

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_provider_failure_is_reported_without_crashing(self, mocked_fallback):
        mocked_fallback.side_effect = RuntimeError("provider unreachable")

        response = self._post()
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertIn("error", data["processed"][0])

        self.problem.refresh_from_db()
        self.assertFalse(self.problem.description_is_scenario)
        self.assertEqual(self.problem.description_original, "")  # never backed up — nothing was ever written

    def test_no_active_provider_returns_502(self):
        # Deactivate every LLMProvider, not just the one created in setUp —
        # a data migration seeds a real production provider row, so leaving
        # that one active would make this test silently fire a real
        # outbound API call instead of exercising the "no providers" path.
        LLMProvider.objects.update(is_active=False)
        response = self._post()
        self.assertEqual(response.status_code, 502)


class AdminTopicRegenerateScenarioDescriptionsViewTests(TestCase):
    """Same sweep as the bank-wide view, scoped to one topic's tag via
    _problems_in_topic — mirrors AdminProblemTopicGenerateGenericJudgeView's
    own test coverage pattern (none existed yet for that one either, so
    this establishes the pattern for both)."""

    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin-scn-topic", password="secret123", email="b@b.com")
        self.client.login(username="admin-scn-topic", password="secret123")
        self.provider = LLMProvider.objects.create(
            name="Test Provider Topic", base_url="https://example.test/v1", api_key="k", model_name="test-model",
        )
        self.array_problem = Problem.objects.create(
            title="Two Sum", slug="two-sum-topic-scenario-test",
            description="Given an array of integers nums...", difficulty="Easy", tags=["Array"],
        )
        self.tree_problem = Problem.objects.create(
            title="Invert Binary Tree", slug="invert-tree-topic-scenario-test",
            description="Given the root of a binary tree...", difficulty="Easy", tags=["Tree"],
        )

    def _post(self, topic, force=False):
        url = reverse("admin-problem-bank-topic-regenerate-scenario-descriptions", args=[topic])
        return self.client.post(url, {"force": True} if force else {})

    def test_requires_superuser(self):
        User.objects.create_user(username="student-scn-topic", password="secret123")
        self.client.logout()
        self.client.login(username="student-scn-topic", password="secret123")
        response = self._post("Array")
        self.assertEqual(response.status_code, 403)

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_only_touches_problems_in_the_given_topic(self, mocked_fallback):
        mocked_fallback.return_value = "A warehouse worker pairs two bin labels that sum to a target code."

        response = self._post("Array")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.assertEqual(data["processed"][0]["id"], self.array_problem.id)

        self.array_problem.refresh_from_db()
        self.tree_problem.refresh_from_db()
        self.assertTrue(self.array_problem.description_is_scenario)
        self.assertFalse(self.tree_problem.description_is_scenario)  # untouched — different topic

    @patch("apps.learning.services.testcase_generator.generate_text_with_fallback")
    def test_force_re_touches_already_migrated_problems_in_topic(self, mocked_fallback):
        mocked_fallback.return_value = "First scenario version."
        self._post("Array")
        self.array_problem.refresh_from_db()
        self.assertTrue(self.array_problem.description_is_scenario)

        # Without force, a second call finds nothing left to do in this topic.
        response = self._post("Array")
        self.assertEqual(response.json()["processed"], [])

        # With force, it re-touches the already-migrated problem.
        mocked_fallback.return_value = "Reworded scenario version."
        response = self._post("Array", force=True)
        data = response.json()
        self.assertEqual(len(data["processed"]), 1)
        self.array_problem.refresh_from_db()
        self.assertEqual(self.array_problem.description, "Reworded scenario version.")
