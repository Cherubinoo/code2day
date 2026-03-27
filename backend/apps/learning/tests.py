from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from datetime import timedelta

from django.utils import timezone

from .models import DiscussionMessage, Problem, StudentActivity, StudentProfile, Submission


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
        self.assertEqual(len(response.json()["activityCalendar"]), 35)

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
                "password": "secret123",
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
        self.user.set_password("secret123")
        self.user.save()
        response = self.client.post(
            reverse("student-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret123",
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
        self.user.set_password("secret123")
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
                "password": "secret123",
            },
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.profile.account.refresh_from_db()
        self.assertNotEqual(self.profile.account.password, "secret123")
        self.assertTrue(self.profile.account.password.startswith("pbkdf2_"))

        second_response = self.client.post(
            reverse("student-first-login"),
            {
                "register_number": self.profile.register_number,
                "password": "secret123",
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

    def test_discussion_post_is_anonymous_and_tracks_problem(self):
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
        self.assertEqual(response.json()["author"], "Anonymous")
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
