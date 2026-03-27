from collections import defaultdict
from datetime import timedelta

from django.contrib.auth import authenticate, login, logout
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .data import FALLBACK_DASHBOARD, FALLBACK_PROBLEMS
from .models import DiscussionMessage, Problem, StudentActivity, StudentProfile, Submission
from .serializers import (
    DiscussionMessageCreateSerializer,
    DiscussionMessageSerializer,
    FirstLoginSerializer,
    ProblemSerializer,
    ProblemProgressUpdateSerializer,
    StudentLoginSerializer,
    StudentLookupListSerializer,
    StudentProfileSerializer,
)


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
    return DiscussionMessage.objects.filter(created_at__gte=cutoff).select_related("problem")


class DashboardView(APIView):
    def get(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        profile = request.user.student_profile
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


class ProblemListView(APIView):
    def get(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        difficulty = request.query_params.get("difficulty")
        queryset = Problem.objects.all()

        if difficulty:
            queryset = queryset.filter(difficulty__iexact=difficulty)

        if queryset.exists():
            progress_map = build_problem_progress_map(request.user.student_profile)
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


class EditorBootstrapView(APIView):
    def get(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(FALLBACK_DASHBOARD["editor"])


class ProblemProgressUpdateView(APIView):
    def post(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = ProblemProgressUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        profile = request.user.student_profile
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

        if progress_state == "completed":
            StudentActivity.objects.get_or_create(
                student=profile,
                activity_date=timezone.localdate(),
                activity_type="solve",
            )
        else:
            StudentActivity.objects.get_or_create(
                student=profile,
                activity_date=timezone.localdate(),
                activity_type="practice",
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


@method_decorator(ensure_csrf_cookie, name="dispatch")
class StudentLookupView(APIView):
    def get(self, request):
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


class DiscussionMessageListCreateView(APIView):
    def get(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        messages = get_recent_discussions_queryset()[:100]
        return Response(DiscussionMessageSerializer(messages, many=True).data)

    def post(self, request):
        if not request.user.is_authenticated or not hasattr(request.user, "student_profile"):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

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
        serializer = FirstLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        register_number = serializer.validated_data["register_number"].strip()
        password = serializer.validated_data["password"]
        profile = StudentProfile.objects.filter(register_number=register_number).select_related(
            "account"
        ).first()

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
        serializer = StudentLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        register_number = serializer.validated_data["register_number"].strip()
        password = serializer.validated_data["password"]
        profile = StudentProfile.objects.filter(register_number=register_number).select_related(
            "account"
        ).first()

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
