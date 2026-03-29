import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import RateLimitExceeded, StudentAuthMixin, check_rate_limit
from .data import FALLBACK_DASHBOARD, FALLBACK_PROBLEMS
from .models import (
    DiscussionMessage,
    ExecutionRecord,
    Problem,
    ProblemSolution,
    StudentActivity,
    StudentProfile,
    Submission,
)
from .serializers import (
    CodeRunSerializer,
    DiscussionMessageCreateSerializer,
    DiscussionMessageSerializer,
    FirstLoginSerializer,
    ProblemDetailSerializer,
    ProblemProgressUpdateSerializer,
    ProblemSerializer,
    StudentLoginSerializer,
    StudentLookupListSerializer,
    StudentProfileSerializer,
)
from .services.judge0 import (
    Judge0ServiceError,
    Judge0TimeoutError,
    execute_judge0_submission,
)
from .services.execution_adapter import (
    normalize_comparable_output,
    prepare_execution_payload,
)
from .services.problem_testcases import build_runtime_test_cases

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helper builders (pure functions — no HTTP side-effects)
# ---------------------------------------------------------------------------

def build_activity_calendar(profile, window_days=35):
    today = timezone.localdate()
    start_day = today - timedelta(days=window_days - 1)
    activity_rows = (
        StudentActivity.objects.filter(student=profile, activity_date__gte=start_day)
        .values("activity_date")
        .annotate(total=Count("id"))
        .order_by("activity_date")
    )

    daily_totals = {row["activity_date"]: row["total"] for row in activity_rows}

    if not daily_totals and profile.last_login_on:
        inferred_days = min(max(profile.current_streak, 1), window_days)
        for offset in range(inferred_days):
            inferred_day = profile.last_login_on - timedelta(days=offset)
            if inferred_day >= start_day:
                daily_totals[inferred_day] = 1

    calendar = []
    for offset in range(window_days):
        current_day = start_day + timedelta(days=offset)
        count = daily_totals.get(current_day, 0)
        calendar.append(
            {
                "date": current_day.isoformat(),
                "count": count,
                "weekday": current_day.strftime("%a"),
                "day": current_day.day,
            }
        )
    return calendar


def build_student_stats(profile):
    solved_problem_ids = Submission.objects.filter(
        student=profile,
        status__iexact="Accepted",
    ).values_list("problem_id", flat=True)
    solved_problems = Problem.objects.filter(id__in=solved_problem_ids).distinct()

    return solved_problems.aggregate(
        easy=Count("id", filter=Q(difficulty="Easy"), distinct=True),
        medium=Count("id", filter=Q(difficulty="Medium"), distinct=True),
        hard=Count("id", filter=Q(difficulty="Hard"), distinct=True),
    )


def build_problem_progress_map(profile):
    progress_map = {}
    submissions = (
        Submission.objects.filter(student=profile)
        .order_by("problem_id", "-submitted_at")
        .values("problem_id", "status")
    )

    for submission in submissions:
        if submission["problem_id"] in progress_map:
            continue
        progress_map[submission["problem_id"]] = (
            "completed" if submission["status"].lower() == "accepted" else "open"
        )

    return progress_map


def build_weekly_activity(activity_calendar):
    grouped = defaultdict(int)
    for item in activity_calendar:
        grouped[item["weekday"]] += item["count"]

    order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return [{"day": day, "count": grouped.get(day, 0)} for day in order]


def get_recent_discussions_queryset():
    cutoff = timezone.now() - timedelta(hours=24)
    return (
        DiscussionMessage.objects.filter(created_at__gte=cutoff)
        .select_related("student", "problem")
    )


def execute_problem_test_case_batch(
    *,
    problem,
    source_code,
    language,
    language_id,
    test_cases,
    batch_kind,
):
    test_results = []
    latest_time = ""
    latest_memory = ""

    for case in test_cases:
        prepared = prepare_execution_payload(
            problem=problem,
            source_code=source_code,
            language=language,
            stdin=case.stdin,
        )
        tc_result = execute_judge0_submission(
            source_code=prepared["source_code"],
            language_id=language_id,
            stdin=prepared["stdin"],
        )
        actual_raw = (tc_result["stdout"] or "").strip()
        expected = case.expected_output.strip()
        passed = (
            tc_result["status"] == "Accepted"
            and normalize_comparable_output(actual_raw)
            == normalize_comparable_output(expected)
        )

        latest_time = tc_result["time"] or latest_time
        latest_memory = tc_result["memory"] or latest_memory
        test_results.append(
            {
                "stdin": case.stdin,
                "expected": expected,
                "actual": actual_raw,
                "passed": passed,
                "status": tc_result["status"],
                "time": tc_result["time"],
                "memory": tc_result["memory"],
                "stderr": tc_result["stderr"],
                "compile_output": tc_result["compile_output"],
                "is_sample": case.is_sample,
                "source": case.source,
            }
        )

    total_cases = len(test_results)
    passed_cases = sum(1 for item in test_results if item["passed"])
    first_failure = next((item for item in test_results if not item["passed"]), None)

    if total_cases and passed_cases == total_cases:
        status_label = "Accepted"
    elif first_failure and first_failure["status"] != "Accepted":
        status_label = first_failure["status"]
    else:
        status_label = "Wrong Answer"

    if batch_kind == "sample":
        output = f"Sample test cases passed: {passed_cases}/{total_cases}."
    elif status_label == "Accepted":
        output = f"All {total_cases} test cases passed."
    else:
        output = f"{passed_cases}/{total_cases} test cases passed."

    return {
        "stdout": output if status_label == "Accepted" else "",
        "stderr": first_failure["stderr"] if first_failure else "",
        "compile_output": first_failure["compile_output"] if first_failure else "",
        "status": status_label,
        "time": latest_time,
        "memory": latest_memory,
        "output": output,
        "test_results": test_results,
        "passed_cases": passed_cases,
        "total_cases": total_cases,
        "test_case_mode": batch_kind,
    }


# ---------------------------------------------------------------------------
# Rate-limit settings helpers
# ---------------------------------------------------------------------------

def _auth_rate_limits():
    return (
        getattr(settings, "AUTH_RATE_LIMIT_MAX_ATTEMPTS", 5),
        getattr(settings, "AUTH_RATE_LIMIT_WINDOW_SECONDS", 60),
    )


def _lookup_rate_limits():
    return (
        getattr(settings, "LOOKUP_RATE_LIMIT_MAX_ATTEMPTS", 20),
        getattr(settings, "LOOKUP_RATE_LIMIT_WINDOW_SECONDS", 60),
    )


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class DashboardView(StudentAuthMixin, APIView):
    def get(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        problems = Problem.objects.all()
        activity_calendar = build_activity_calendar(profile)
        stats = build_student_stats(profile)
        weekly_activity = build_weekly_activity(activity_calendar)
        user_payload = {
            "name": profile.name,
            "title": profile.title,
            "streak": profile.current_streak,
            "loginDays": profile.login_days,
            "rank": profile.campus_rank,
            "registerNumber": profile.register_number,
            "email": profile.personal_email,
        }

        if not problems.exists():
            return Response(
                {
                    **FALLBACK_DASHBOARD,
                    "user": user_payload,
                    "stats": stats,
                    "weeklyActivity": weekly_activity,
                    "activityCalendar": activity_calendar,
                    "consistencyLabel": "Activity calendar",
                    "student": StudentProfileSerializer(profile).data,
                }
            )

        daily_problem = problems.filter(is_daily=True).first() or problems.first()

        payload = {
            "user": user_payload,
            "dailyProblem": {
                "title": daily_problem.title,
                "difficulty": daily_problem.difficulty,
                "description": daily_problem.description,
                "tags": daily_problem.tags,
            },
            "stats": stats,
            "weeklyActivity": weekly_activity,
            "activityCalendar": activity_calendar,
            "consistencyLabel": "Activity calendar",
            "tracks": FALLBACK_DASHBOARD["tracks"],
            "leaderboard": FALLBACK_DASHBOARD["leaderboard"],
            "editor": FALLBACK_DASHBOARD["editor"],
            "student": StudentProfileSerializer(profile).data,
        }
        return Response(payload)


class ProblemListView(StudentAuthMixin, APIView):
    def get(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        difficulty = request.query_params.get("difficulty")
        queryset = Problem.objects.all()

        if difficulty:
            queryset = queryset.filter(difficulty__iexact=difficulty)

        if queryset.exists():
            progress_map = build_problem_progress_map(profile)
            return Response(
                ProblemSerializer(
                    queryset,
                    many=True,
                    context={"progress_map": progress_map},
                ).data
            )

        fallback = FALLBACK_PROBLEMS
        if difficulty:
            fallback = [
                item for item in fallback if item["difficulty"].lower() == difficulty.lower()
            ]
        return Response(fallback)


class ProblemDetailView(StudentAuthMixin, APIView):
    def get(self, request, slug):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        problem = Problem.objects.filter(slug=slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        progress_map = build_problem_progress_map(profile)
        return Response(
            ProblemDetailSerializer(
                problem,
                context={"progress_map": progress_map},
            ).data
        )


class EditorBootstrapView(StudentAuthMixin, APIView):
    def get(self, request):
        _, error = self.get_authenticated_profile(request)
        if error:
            return error
        return Response(FALLBACK_DASHBOARD["editor"])


class HealthCheckView(APIView):
    def get(self, request):
        return Response(
            {
                "status": "ok",
                "judge0_configured": bool(getattr(settings, "JUDGE0_BASE_URL", "").strip()),
            }
        )


class ProblemProgressUpdateView(StudentAuthMixin, APIView):
    def post(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = ProblemProgressUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        problem = Problem.objects.filter(
            slug=serializer.validated_data["problem_slug"].strip()
        ).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        progress_state = serializer.validated_data["progress_state"]
        language = (
            serializer.validated_data.get("language")
            or ("SQL" if "SQL" in (problem.tags or []) else "JavaScript")
        )
        status_label = "Accepted" if progress_state == "completed" else "Started"

        submission = Submission.objects.create(
            student=profile,
            problem=problem,
            language=language,
            status=status_label,
        )

        activity_type = "solve" if progress_state == "completed" else "practice"
        StudentActivity.objects.get_or_create(
            student=profile,
            activity_date=timezone.localdate(),
            activity_type=activity_type,
        )

        return Response(
            {
                "detail": "Progress saved successfully.",
                "submission": {
                    "id": submission.id,
                    "status": submission.status,
                    "language": submission.language,
                    "submitted_at": submission.submitted_at,
                },
                "progress_state": progress_state,
            },
            status=status.HTTP_201_CREATED,
        )


class CodeRunView(StudentAuthMixin, APIView):
    def post(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = CodeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        validated = serializer.validated_data
        problem = None
        problem_slug = (validated.get("problem_slug") or "").strip()
        is_submit = validated.get("is_submit", False)
        stdin = validated.get("stdin", "")

        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        try:
            if is_submit and not problem:
                return Response(
                    {"detail": "problem_slug is required for submission."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            run_sample_cases = bool(problem and not is_submit and not stdin.strip())
            if is_submit or run_sample_cases:
                test_cases = build_runtime_test_cases(
                    problem,
                    sample_only=not is_submit,
                )
                if is_submit and not test_cases:
                    return Response(
                        {"detail": "No test cases are configured for this problem yet."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if test_cases:
                    result = execute_problem_test_case_batch(
                        problem=problem,
                        source_code=validated["source_code"],
                        language=validated.get("language", ""),
                        language_id=validated["language_id"],
                        test_cases=test_cases,
                        batch_kind="submit" if is_submit else "sample",
                    )
                else:
                    prepared = prepare_execution_payload(
                        problem=problem,
                        source_code=validated["source_code"],
                        language=validated.get("language", ""),
                        stdin=stdin,
                    )
                    result = execute_judge0_submission(
                        source_code=prepared["source_code"],
                        language_id=validated["language_id"],
                        stdin=prepared["stdin"],
                    )
            else:
                prepared = prepare_execution_payload(
                    problem=problem,
                    source_code=validated["source_code"],
                    language=validated.get("language", ""),
                    stdin=stdin,
                )
                result = execute_judge0_submission(
                    source_code=prepared["source_code"],
                    language_id=validated["language_id"],
                    stdin=prepared["stdin"],
                )
        except Judge0TimeoutError as exc:
            logger.error("Judge0 timeout: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Judge0ServiceError as exc:
            logger.error("Judge0 service error: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected execution error: %s", exc, exc_info=True)
            detail = (
                f"Unexpected execution error: {exc}"
                if settings.DEBUG
                else "Unexpected execution error."
            )
            return Response({"detail": detail}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            ExecutionRecord.objects.create(
                student=profile,
                problem=problem,
                language=validated.get("language") or str(validated["language_id"]),
                language_id=validated["language_id"],
                source_code=validated["source_code"],
                stdin=stdin,
                stdout=result["output"] if result.get("test_results") else result["stdout"],
                stderr=result["stderr"],
                compile_output=result["compile_output"],
                status_description=result["status"],
                execution_time=str(result["time"] or ""),
                memory=str(result["memory"] or ""),
            )
        except Exception as exc:
            logger.error("Error creating ExecutionRecord: %s", exc, exc_info=True)

        # ── Submit mode: run all test cases ────────────────────────────────
        if is_submit and problem and result.get("total_cases"):
            ProblemSolution.objects.create(
                problem=problem,
                student=profile,
                language=validated.get("language") or str(validated["language_id"]),
                language_id=validated["language_id"],
                source_code=validated["source_code"],
                status=result["status"],
                passed_cases=result["passed_cases"],
                total_cases=result["total_cases"],
                execution_time=str(result["time"] or ""),
                memory=str(result["memory"] or ""),
            )

        return Response(result, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class StudentLookupView(APIView):
    def get(self, request):
        max_attempts, window = _lookup_rate_limits()
        try:
            check_rate_limit(request, "student-lookup", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        register_number = (request.query_params.get("register_number") or "").strip()
        if not register_number:
            return Response(
                {"detail": "register_number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = StudentProfile.objects.filter(register_number=register_number).first()
        if not profile:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "student": StudentProfileSerializer(profile).data,
                "first_login_required": not profile.password_is_set,
            }
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class RegisterNumberListView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        queryset = StudentProfile.objects.exclude(register_number__isnull=True).exclude(
            register_number=""
        )

        if query:
            queryset = queryset.filter(
                Q(register_number__icontains=query) | Q(name__icontains=query)
            )

        students = queryset.order_by("register_number")[:50]
        return Response(StudentLookupListSerializer(students, many=True).data)


class DiscussionMessageListCreateView(StudentAuthMixin, APIView):
    def get(self, request):
        _, error = self.get_authenticated_profile(request)
        if error:
            return error

        messages = get_recent_discussions_queryset()[:100]
        return Response(DiscussionMessageSerializer(messages, many=True).data)

    def post(self, request):
        _, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = DiscussionMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        problem_slug = serializer.validated_data.get("problem_slug", "").strip()
        problem = None
        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        message = DiscussionMessage.objects.create(
            student=request.user.student_profile,
            problem=problem,
            body=serializer.validated_data["body"],
        )
        return Response(
            DiscussionMessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


class FirstLoginView(APIView):
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "first-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        serializer = FirstLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        register_number = serializer.validated_data["register_number"].strip()
        password = serializer.validated_data["password"]
        profile = (
            StudentProfile.objects.filter(register_number=register_number)
            .select_related("account")
            .first()
        )

        if not profile or not profile.account:
            return Response(
                {"detail": "Imported student account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if profile.password_is_set:
            return Response(
                {"detail": "Password already created. Please log in normally."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile.account.set_password(password)
        profile.account.save(update_fields=["password"])
        login(request, profile.account)
        profile.record_login()

        return Response(
            {
                "detail": "Password set successfully.",
                "student": StudentProfileSerializer(profile).data,
            }
        )


class StudentLoginView(APIView):
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "student-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        serializer = StudentLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        register_number = serializer.validated_data["register_number"].strip()
        password = serializer.validated_data["password"]
        profile = (
            StudentProfile.objects.filter(register_number=register_number)
            .select_related("account")
            .first()
        )

        if not profile or not profile.account:
            return Response(
                {"detail": "Student account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not profile.password_is_set:
            return Response(
                {"detail": "First-time password setup is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=register_number, password=password)
        if not user:
            return Response(
                {"detail": "Invalid register number or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        profile.record_login()
        return Response(
            {
                "detail": "Login successful.",
                "student": StudentProfileSerializer(profile).data,
            }
        )


class StudentLogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"detail": "Logout successful."})
