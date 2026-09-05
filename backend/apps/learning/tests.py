from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from .models import (
    DiscussionMessage,
    ExecutionRecord,
    Problem,
    ProblemSolution,
    StudentActivity,
    StudentProfile,
    Submission,
    TestCase as ProblemTestCase,
)


class DashboardApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="953624243083",
            password="secret123",
        )
        self.profile = StudentProfile.objects.create(
            account=self.user,
            name="Rithish",
            title="Imported",
            register_number="953624243083",
            personal_email="rithish@example.com",
            mobile_number="9999999999",
        )

    def test_dashboard_endpoint_requires_login(self):
        response = self.client.get(reverse("dashboard"))
        self.assertEqual(response.status_code, 401)

    def test_dashboard_endpoint_returns_authenticated_student(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["registerNumber"], self.profile.register_number)
        # Activity calendar should contain current month + padding days (28-42 days depending on month)
        calendar_length = len(response.json()["activityCalendar"])
        self.assertGreaterEqual(calendar_length, 28)  # Minimum: Feb in non-leap year
        self.assertLessEqual(calendar_length, 42)  # Maximum: 31 days + 6 days padding on each side

    def test_problem_list_requires_login(self):
        response = self.client.get(reverse("problem-list"))
        self.assertEqual(response.status_code, 401)

    def test_problem_list_returns_saved_progress_state(self):
        problem = Problem.objects.create(
            title="Two Sum Variants",
            slug="two-sum-variants",
            description="desc",
            difficulty="Easy",
            tags=["Array", "Hash Map"],
        )
        Submission.objects.create(
            student=self.profile,
            problem=problem,
            language="Python",
            status="Accepted",
        )

        self.client.force_login(self.user)
        response = self.client.get(reverse("problem-list"))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        problem_payload = next(item for item in payload if item["slug"] == problem.slug)
        self.assertEqual(problem_payload["progress_state"], "completed")
        self.assertIn("Python", problem_payload["available_languages"])
        self.assertNotIn("editorial", problem_payload)

    def test_problem_detail_returns_examples_and_editorial(self):
        problem = Problem.objects.create(
            title="Two Sum Variants",
            slug="two-sum-variants-detail",
            description="desc",
            difficulty="Easy",
            tags=["Array"],
            examples=[{"input": "1", "output": "1"}],
            hints=["Use a map"],
            editorial="<p>Detailed solution</p>",
        )

        self.client.force_login(self.user)
        response = self.client.get(reverse("problem-detail", kwargs={"slug": problem.slug}))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["examples"][0]["input"], "1")
        self.assertEqual(payload["hints"], ["Use a map"])
        self.assertEqual(payload["editorial"], "<p>Detailed solution</p>")


class StudentAuthApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(username="953624243083")
        self.user.set_unusable_password()
        self.user.save()
        self.profile = StudentProfile.objects.create(
            account=self.user,
            name="Rithish",
            title="Imported",
            register_number="953624243083",
            personal_email="rithish@example.com",
            mobile_number="9999999999",
        )

    def test_student_lookup_marks_first_login_required(self):
        response = self.client.get(
            reverse("student-lookup"),
            {"register_number": self.profile.register_number},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["first_login_required"])

    def test_register_number_list_returns_student(self):
        response = self.client.get(
            reverse("register-number-list"),
            {"q": self.profile.register_number[-4:]},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()[0]["register_number"], self.profile.register_number)

    def test_first_login_sets_password(self):
        response = self.client.post(
            reverse("student-first-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret1234",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.login_days, 1)
        self.assertTrue(self.profile.password_is_set)
        self.assertTrue(
            StudentActivity.objects.filter(
                student=self.profile,
                activity_type="login",
            ).exists()
        )
        self.assertEqual(
            int(self.client.session["_auth_user_id"]),
            self.profile.account_id,
        )

    def test_login_requires_password_after_first_setup(self):
        self.user.set_password("secret1234")
        self.user.save()
        response = self.client.post(
            reverse("student-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret1234",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.current_streak, 1)
        self.assertEqual(
            int(self.client.session["_auth_user_id"]),
            self.profile.account_id,
        )

    def test_logout_clears_authenticated_session(self):
        self.user.set_password("secret1234")
        self.user.save()
        self.client.force_login(self.user)

        response = self.client.post(reverse("student-logout"))

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_password_setup_is_stored_hashed_once(self):
        response = self.client.post(
            reverse("student-first-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret1234",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.account.refresh_from_db()
        self.assertNotEqual(self.profile.account.password, "secret1234")
        self.assertTrue(self.profile.account.password.startswith("pbkdf2_"))

        second_response = self.client.post(
            reverse("student-first-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret1234",
            },
            content_type="application/json",
        )

        self.assertEqual(second_response.status_code, 400)


class DiscussionApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="953624243083", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user,
            name="Rithish",
            title="Imported",
            register_number="953624243083",
            personal_email="rithish@example.com",
        )
        self.problem = Problem.objects.create(
            title="Two Sum Variants",
            slug="two-sum-variants",
            description="desc",
            difficulty="Easy",
            tags=["Array", "Hash Map"],
        )

    def test_discussion_requires_login(self):
        response = self.client.get(reverse("discussion-messages"))
        self.assertEqual(response.status_code, 401)

    def test_discussion_post_shows_author_and_tracks_problem(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("discussion-messages"),
            {
                "body": "I am getting a runtime error on the second loop.",
                "problem_slug": self.problem.slug,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        # Author should be "<name> …<last digit of reg number>"
        author = response.json()["author"]
        self.assertIn(self.profile.name, author)
        self.assertTrue(author.endswith(self.profile.register_number[-1]))
        self.assertEqual(response.json()["problem_slug"], self.problem.slug)
        self.assertTrue(
            DiscussionMessage.objects.filter(student=self.profile, problem=self.problem).exists()
        )

    def test_discussion_list_only_returns_last_24_hours(self):
        self.client.force_login(self.user)
        recent = DiscussionMessage.objects.create(
            student=self.profile,
            problem=self.problem,
            body="Recent anonymous doubt",
        )
        old = DiscussionMessage.objects.create(
            student=self.profile,
            problem=self.problem,
            body="Old anonymous doubt",
        )
        DiscussionMessage.objects.filter(id=old.id).update(
            created_at=timezone.now() - timedelta(hours=25)
        )

        response = self.client.get(reverse("discussion-messages"))

        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.json()]
        self.assertIn(recent.id, ids)
        self.assertNotIn(old.id, ids)


class ProblemProgressApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="953624243083", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user,
            name="Rithish",
            title="Imported",
            register_number="953624243083",
            personal_email="rithish@example.com",
        )
        self.problem = Problem.objects.create(
            title="Two Sum Variants",
            slug="two-sum-variants",
            description="desc",
            difficulty="Easy",
            tags=["Array", "Hash Map"],
        )

    def test_progress_update_requires_login(self):
        response = self.client.post(
            reverse("problem-progress-update"),
            {
                "problem_slug": self.problem.slug,
                "language": "Python",
                "progress_state": "open",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_progress_update_saves_submission_and_activity(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("problem-progress-update"),
            {
                "problem_slug": self.problem.slug,
                "language": "Python",
                "progress_state": "completed",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            Submission.objects.filter(
                student=self.profile,
                problem=self.problem,
                language="Python",
                status="Accepted",
            ).exists()
        )
        self.assertTrue(
            StudentActivity.objects.filter(
                student=self.profile,
                activity_type="solve",
            ).exists()
        )


class Judge0RunApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="953624243083", password="secret123")
        self.profile = StudentProfile.objects.create(
            account=self.user,
            name="Rithish",
            title="Imported",
            register_number="953624243083",
            personal_email="rithish@example.com",
        )
        self.problem = Problem.objects.create(
            title="Two Sum Variants",
            slug="two-sum-variants",
            description="desc",
            difficulty="Easy",
            tags=["Array", "Hash Map"],
        )

    @patch("apps.learning.services.judge0.urllib_request.urlopen")
    def test_run_endpoint_executes_code_and_stores_history(self, mocked_urlopen):
        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

            def read(self):
                return (
                    b'{"stdout":"Hello World\\n","stderr":null,"compile_output":null,'
                    b'"status":{"description":"Accepted"},"time":"0.01","memory":10240}'
                )

        mocked_urlopen.return_value = FakeResponse()
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": 'print("Hello World")',
                "language_id": 71,
                "stdin": "",
                "language": "Python",
                "problem_slug": self.problem.slug,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stdout"], "Hello World\n")
        self.assertEqual(response.json()["status"], "Accepted")
        self.assertTrue(
            ExecutionRecord.objects.filter(
                student=self.profile,
                problem=self.problem,
                language="Python",
                status_description="Accepted",
            ).exists()
        )

    def test_run_endpoint_validates_source_code(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": "   ",
                "language_id": 71,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("source_code", response.json())

    @patch("apps.learning.services.judging.judge0_service.Judge0Service")
    def test_submit_uses_problem_testcases_and_saves_solution(self, mock_service_cls):
        ProblemTestCase.objects.create(
            problem=self.problem,
            stdin="nums = [2,7,11,15], target = 9",
            expected_output="[0,1]",
            is_sample=True,
            order=1,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            stdin="nums = [3,2,4], target = 6",
            expected_output="[1,2]",
            is_sample=False,
            order=2,
        )
        mock_service_cls.return_value.batch_execute.return_value = [
            {
                "stdout": "[0,1]\n",
                "stderr": "",
                "compile_output": "",
                "status": "Accepted",
                "time": "0.01",
                "memory": "1000",
                "output": "[0,1]\n",
            },
            {
                "stdout": "[1,2]\n",
                "stderr": "",
                "compile_output": "",
                "status": "Accepted",
                "time": "0.02",
                "memory": "1001",
                "output": "[1,2]\n",
            },
        ]
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": 'print("placeholder")',
                "language_id": 71,
                "language": "Python",
                "problem_slug": self.problem.slug,
                "is_submit": True,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "Accepted")
        self.assertEqual(payload["passed_cases"], 2)
        self.assertEqual(payload["total_cases"], 2)
        self.assertTrue(
            ProblemSolution.objects.filter(
                student=self.profile,
                problem=self.problem,
                status="Accepted",
                passed_cases=2,
                total_cases=2,
            ).exists()
        )

    @patch("apps.learning.services.judging.judge0_service.Judge0Service")
    def test_run_without_stdin_uses_problem_examples_as_sample_cases(self, mock_service_cls):
        self.problem.examples = [
            {"input": "abc", "output": "abc"},
            {"input": "xyz", "output": "xyz"},
        ]
        self.problem.save(update_fields=["examples"])
        mock_service_cls.return_value.batch_execute.return_value = [
            {
                "stdout": "abc\n",
                "stderr": "",
                "compile_output": "",
                "status": "Accepted",
                "time": "0.01",
                "memory": "1000",
                "output": "abc\n",
            },
            {
                "stdout": "xyz\n",
                "stderr": "",
                "compile_output": "",
                "status": "Accepted",
                "time": "0.02",
                "memory": "1001",
                "output": "xyz\n",
            },
        ]
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": 'print("placeholder")',
                "language_id": 71,
                "language": "Python",
                "problem_slug": self.problem.slug,
                "stdin": "",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["test_case_mode"], "sample")
        self.assertEqual(payload["passed_cases"], 2)
        self.assertEqual(payload["total_cases"], 2)
        self.assertEqual(payload["output"], "Sample test cases passed: 2/2.")

    def test_submit_requires_problem_slug(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": 'print("placeholder")',
                "language_id": 71,
                "language": "Python",
                "is_submit": True,
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "problem_slug is required for submission.")

    @patch("apps.learning.services.judging.judge0_service.Judge0Service")
    def test_python_function_solution_is_wrapped_for_problem_examples(self, mock_service_cls):
        self.problem.slug = "two-sum"
        self.problem.examples = [
            {
                "input": "nums = [2,7,11,15], target = 9",
                "output": "[0,1]\nOutput: Because nums[0] + nums[1] == 9, we return [0, 1].",
            }
        ]
        self.problem.save(update_fields=["slug", "examples"])
        mock_service_cls.return_value.batch_execute.return_value = [{
            "stdout": "[0,1]",
            "stderr": "",
            "compile_output": "",
            "status": "Accepted",
            "time": "0.01",
            "memory": "1000",
            "output": "[0,1]",
        }]
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("code-run"),
            {
                "source_code": (
                    "def twoSum(nums, target):\n"
                    "    return [0, 1]\n"
                ),
                "language_id": 71,
                "language": "Python",
                "problem_slug": self.problem.slug,
                "stdin": "",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "Accepted")
        self.assertEqual(payload["passed_cases"], 1)
        self.assertEqual(payload["total_cases"], 1)

        submissions = mock_service_cls.return_value.batch_execute.call_args.args[0]
        self.assertEqual(submissions[0]["stdin"], "[[2,7,11,15],9]")
        self.assertIn("__code2day_find_solver", submissions[0]["source_code"])
