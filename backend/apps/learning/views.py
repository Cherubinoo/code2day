import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_utils import RateLimitExceeded, StudentAuthMixin, UnifiedAuthMixin, check_rate_limit
from .data import FALLBACK_DASHBOARD, FALLBACK_PROBLEMS
from .models import (
    Contest,
    ContestParticipation,
    ContestSubmission,
    DiscussionMessage,
    ExecutionRecord,
    Institution,
    Problem,
    ProblemSession,
    ProblemSolution,
    SolvedProblem,
    StaffProfile,
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
from .services.complexity_analyzer import calculate_complexity

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
    # Count solved problems from SolvedProblem table (faster than scanning all solutions)
    solved_problems = Problem.objects.filter(
        solved_by__student=profile
    ).distinct()

    return solved_problems.aggregate(
        easy=Count("id", filter=Q(difficulty="Easy"), distinct=True),
        medium=Count("id", filter=Q(difficulty="Medium"), distinct=True),
        hard=Count("id", filter=Q(difficulty="Hard"), distinct=True),
    )


def build_problem_progress_map(profile):
    progress_map = {}
    # Get all problems solved by this student
    solved_ids = SolvedProblem.objects.filter(
        student=profile
    ).values_list("problem_id", flat=True)
    
    for problem_id in solved_ids:
        progress_map[problem_id] = "completed"

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
        logger.debug(
            "Test case %d: prepared stdin=%r, adapted=%s",
            case.order, prepared.get("stdin"), prepared.get("adapted")
        )
        tc_result = execute_judge0_submission(
            source_code=prepared["source_code"],
            language_id=language_id,
            stdin=prepared["stdin"],
        )
        logger.debug(
            "Test case %d result: status=%s, stdout=%r, stderr=%r",
            case.order, tc_result.get("status"), tc_result.get("stdout"), tc_result.get("stderr")
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

class DashboardView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        problems = Problem.objects.all()
        
        # Handle staff/hod/admin users differently
        if profile_type in ["staff", "hod", "admin"]:
            # Get profile details
            profile_obj = profile if profile else None
            user_department = getattr(profile_obj, 'department', None) if profile_obj else None
            
            # Filter student count by department for HOD, all for admin/staff
            if profile_type == "hod" and user_department:
                student_count = StudentProfile.objects.filter(department=user_department).count()
            else:
                student_count = StudentProfile.objects.count()
            
            # Staff/HOD/Admin get simplified dashboard without student-specific stats
            user_payload = {
                "name": profile.name if profile else request.user.first_name,
                "title": "Administrator" if profile_type == "admin" else "HOD" if profile_type == "hod" else "Staff",
                "streak": 0,
                "loginDays": 0,
                "rank": 1,
                "totalStudents": student_count,
                "registerNumber": profile.faculty_id if profile else request.user.username,
                "facultyId": profile.faculty_id if profile else request.user.username,  # Add explicit facultyId
                "email": "",
                "role": profile.role if profile else "admin",
            }
            
            stats = {"easy": 0, "medium": 0, "hard": 0}
            weekly_activity = [{"day": day, "count": 0} for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]]
            activity_calendar = []
            
            daily_problem = problems.filter(is_daily=True).first() or problems.first()
            
            return Response({
                "user": user_payload,
                "dailyProblem": {
                    "title": daily_problem.title if daily_problem else "",
                    "difficulty": daily_problem.difficulty if daily_problem else "",
                    "description": daily_problem.description if daily_problem else "",
                    "tags": daily_problem.tags if daily_problem else [],
                } if daily_problem else None,
                "stats": stats,
                "weeklyActivity": weekly_activity,
                "activityCalendar": activity_calendar,
                "consistencyLabel": "Activity calendar",
                "tracks": FALLBACK_DASHBOARD["tracks"],
                "leaderboard": FALLBACK_DASHBOARD["leaderboard"],
                "editor": FALLBACK_DASHBOARD["editor"],
            })

        # Student dashboard (original logic)
        activity_calendar = build_activity_calendar(profile)
        stats = build_student_stats(profile)
        weekly_activity = build_weekly_activity(activity_calendar)
        
        # Calculate real campus rank based on all students
        students_with_counts = (
            StudentProfile.objects.annotate(
                solved_count=Count(
                    'solutions',
                    filter=Q(solutions__all_tests_passed=True),
                    distinct=True
                )
            )
            .order_by('-solved_count', 'name')
        )
        
        campus_rank = 1
        for idx, student in enumerate(students_with_counts, start=1):
            if student.id == profile.id:
                campus_rank = idx
                break
        
        user_payload = {
            "name": profile.name,
            "title": profile.title,
            "streak": profile.current_streak,
            "loginDays": profile.login_days,
            "rank": campus_rank,
            "totalStudents": students_with_counts.count(),
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


class ProblemListView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        difficulty = request.query_params.get("difficulty")
        queryset = Problem.objects.all()

        if difficulty:
            queryset = queryset.filter(difficulty__iexact=difficulty)

        if queryset.exists():
            # Staff/Admin don't have progress, students do
            if profile_type == "student" and profile:
                progress_map = build_problem_progress_map(profile)
            else:
                progress_map = {}
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


class ProblemDetailView(UnifiedAuthMixin, APIView):
    def get(self, request, slug):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        problem = Problem.objects.filter(slug=slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Staff/Admin don't have progress, students do
        if profile_type == "student" and profile:
            progress_map = build_problem_progress_map(profile)
        else:
            progress_map = {}
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

        logger.debug(
            "CodeRunView: lang=%s, lang_id=%s, problem=%s, is_submit=%s, stdin=%r, source_len=%d",
            validated.get("language"), validated["language_id"], problem_slug, is_submit, stdin, len(validated["source_code"])
        )

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
            # Calculate complexity
            time_complexity, space_complexity = calculate_complexity(
                validated["source_code"],
                validated.get("language", "")
            )
            
            # Get time spent from active session
            time_spent = 0
            try:
                active_session = ProblemSession.objects.filter(
                    student=profile,
                    problem=problem,
                    is_active=True
                ).first()
                if active_session:
                    time_spent = active_session.end_session()
            except Exception as e:
                logger.error("Error ending problem session: %s", e)
            
            # Create solution record with complexity and timing data
            all_passed = result["passed_cases"] == result["total_cases"]
            ProblemSolution.objects.create(
                problem=problem,
                student=profile,
                language=validated.get("language") or str(validated["language_id"]),
                language_id=validated["language_id"],
                source_code=validated["source_code"],
                status=result["status"],
                passed_cases=result["passed_cases"],
                total_cases=result["total_cases"],
                all_tests_passed=all_passed,
                execution_time=str(result["time"] or ""),
                memory=str(result["memory"] or ""),
                time_complexity=time_complexity,
                space_complexity=space_complexity,
                time_spent_seconds=time_spent,
            )
            
            # Create SolvedProblem record when all tests pass
            if all_passed:
                try:
                    SolvedProblem.objects.get_or_create(
                        student=profile,
                        problem=problem,
                        defaults={
                            "language": validated.get("language") or str(validated["language_id"]),
                        },
                    )
                    # Update streak for solving activity (in case user stayed logged in)
                    profile.update_streak_for_activity()
                except Exception as e:
                    logger.error(f"Error creating SolvedProblem in view: {e}")
            
            # Include complexity info in response
            result["time_complexity"] = time_complexity
            result["space_complexity"] = space_complexity
            result["time_spent_seconds"] = time_spent

        return Response(result, status=status.HTTP_200_OK)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CampusRankingView(APIView):
    """Get campus-wide student rankings based on problems solved."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get all students with their solved problem counts using SolvedProblem table
        students_with_counts = (
            StudentProfile.objects.annotate(
                solved_count=Count(
                    'solved_problems',
                    distinct=True
                )
            )
            .values('id', 'name', 'register_number', 'solved_count')
            .order_by('-solved_count', 'name')
        )

        leaderboard = list(students_with_counts)

        # Calculate rank for current user (students only)
        user_rank = None
        if hasattr(request.user, 'student_profile'):
            current_student = request.user.student_profile
            for idx, student in enumerate(leaderboard, start=1):
                if student['id'] == current_student.id:
                    user_rank = idx
                    break

        # Get top 10 students for leaderboard
        top_students = leaderboard[:10]

        return Response({
            'userRank': user_rank or len(leaderboard),
            'totalStudents': len(leaderboard),
            'leaderboard': [
                {
                    'rank': idx + 1,
                    'name': s['name'],
                    'registerNumber': s['register_number'],
                    'solved': s['solved_count']
                }
                for idx, s in enumerate(top_students)
            ]
        })


class AdminStatsView(APIView):
    """Get admin dashboard statistics."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Only allow superusers
        if not request.user.is_superuser:
            return Response(
                {"detail": "Admin access required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        from .models import Institution, Problem, ProblemSolution, SolvedProblem, ProblemSession

        # User counts
        total_students = StudentProfile.objects.count()
        total_staff = StaffProfile.objects.count()
        total_users = total_students + total_staff

        # Institution counts - get all institutions
        institutions = Institution.objects.all().order_by('-institution_id')
        institution_list = []
        
        for inst in institutions:
            student_count = StudentProfile.objects.filter(institution=inst).count()
            staff_count = StaffProfile.objects.filter(institution=inst).count()
            staff_list = StaffProfile.objects.filter(institution=inst).values('faculty_id', 'name', 'role')
            active_sessions = ProblemSession.objects.filter(
                is_active=True,
                student__institution=inst
            ).count()
            
            institution_list.append({
                "id": inst.institution_id,
                "name": inst.name,
                "short_code": inst.short_code,
                "students": student_count,
                "staff": staff_count,
                "staff_list": list(staff_list),
                "total_members": student_count + staff_count,
                "active_sessions": active_sessions,
            })

        # Problem stats
        total_problems = Problem.objects.count()
        total_solutions = ProblemSolution.objects.count()
        total_solved_problems = SolvedProblem.objects.count()

        # Active sessions
        active_sessions = ProblemSession.objects.filter(is_active=True).count()

        # AWS stats (placeholder - will be updated with real data)
        aws_hits = 0
        aws_pricing = 0.0

        # Recent activity (last 7 days)
        from datetime import datetime, timedelta
        last_week = datetime.now() - timedelta(days=7)
        recent_logins = StudentProfile.objects.filter(last_login_on__gte=last_week.date()).count()

        return Response({
            "users": {
                "total": total_users,
                "students": total_students,
                "staff": total_staff,
                "recentLogins": recent_logins,
            },
            "institutions": {
                "total": len(institution_list),
                "list": institution_list,
            },
            "problems": {
                "total": total_problems,
                "solutions": total_solutions,
                "solved": total_solved_problems,
            },
            "activity": {
                "activeSessions": active_sessions,
                "recentLogins": recent_logins,
            },
            "aws": {
                "hits": aws_hits,
                "pricing": aws_pricing,
            }
        })


class AdminUserListView(APIView):
    """List all users (students and staff) for admin."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        user_type = request.query_params.get("type", "all")
        users = []

        if user_type in ["all", "students"]:
            students = StudentProfile.objects.select_related("institution").all()
            for s in students:
                users.append({
                    "id": s.register_number,
                    "name": s.name,
                    "type": "student",
                    "email": s.personal_email,
                    "institution": s.institution.name if s.institution else None,
                    "institution_id": s.institution.institution_id if s.institution else None,
                    "is_active": s.account.is_active if s.account else False,
                })

        if user_type in ["all", "staff"]:
            staff = StaffProfile.objects.select_related("institution").all()
            for s in staff:
                users.append({
                    "id": s.faculty_id,
                    "name": s.name,
                    "type": "staff",
                    "role": s.role,
                    "role_display": s.get_role_display(),
                    "email": "",
                    "institution": s.institution.name if s.institution else None,
                    "institution_id": s.institution.institution_id if s.institution else None,
                    "is_active": s.account.is_active if s.account else False,
                })

        return Response({"users": users, "count": len(users)})


class AdminInstitutionListCreateView(APIView):
    """List or create institutions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institutions = Institution.objects.all()
        data = []
        for inst in institutions:
            student_count = StudentProfile.objects.filter(institution=inst).count()
            staff_count = StaffProfile.objects.filter(institution=inst).count()
            data.append({
                "institution_id": inst.institution_id,
                "name": inst.name,
                "short_code": inst.short_code,
                "address": inst.address,
                "contact_email": inst.contact_email,
                "contact_phone": inst.contact_phone,
                "is_active": inst.is_active,
                "student_count": student_count,
                "staff_count": staff_count,
            })
        return Response({"institutions": data, "count": len(data)})

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        data = request.data
        institution_id = data.get("institution_id")
        name = data.get("name")
        short_code = data.get("short_code")

        if not institution_id or not name:
            return Response({"detail": "institution_id and name are required."}, status=status.HTTP_400_BAD_REQUEST)

        if Institution.objects.filter(institution_id=institution_id).exists():
            return Response({"detail": "Institution with this ID already exists."}, status=status.HTTP_400_BAD_REQUEST)

        institution = Institution.objects.create(
            institution_id=institution_id,
            name=name,
            short_code=short_code or "",
            address=data.get("address", ""),
            contact_email=data.get("contact_email", ""),
            contact_phone=data.get("contact_phone", ""),
            is_active=data.get("is_active", True),
        )

        return Response({
            "detail": "Institution created successfully.",
            "institution": {
                "institution_id": institution.institution_id,
                "name": institution.name,
                "short_code": institution.short_code,
            }
        }, status=status.HTTP_201_CREATED)


class AdminInstitutionDetailView(APIView):
    """Get, update or delete a specific institution."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        student_count = StudentProfile.objects.filter(institution=institution).count()
        staff_count = StaffProfile.objects.filter(institution=institution).count()

        return Response({
            "institution_id": institution.institution_id,
            "name": institution.name,
            "short_code": institution.short_code,
            "address": institution.address,
            "contact_email": institution.contact_email,
            "contact_phone": institution.contact_phone,
            "is_active": institution.is_active,
            "student_count": student_count,
            "staff_count": staff_count,
        })

    def put(self, request, institution_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        institution.name = data.get("name", institution.name)
        institution.short_code = data.get("short_code", institution.short_code)
        institution.address = data.get("address", institution.address)
        institution.contact_email = data.get("contact_email", institution.contact_email)
        institution.contact_phone = data.get("contact_phone", institution.contact_phone)
        institution.is_active = data.get("is_active", institution.is_active)
        institution.save()

        return Response({"detail": "Institution updated successfully."})

    def delete(self, request, institution_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        if institution.institution_id == 3000:
            return Response({"detail": "Cannot delete Ramco Institution (ID: 3000)."}, status=status.HTTP_400_BAD_REQUEST)

        institution.delete()
        return Response({"detail": "Institution deleted successfully."})


class AdminInstitutionStaffView(APIView):
    """Manage staff within an institution - list and create."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        """List all staff in an institution."""
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        staff = StaffProfile.objects.filter(institution=institution)
        data = []
        for s in staff:
            data.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
                "password_is_set": s.password_is_set,
            })
        return Response({
            "institution_id": institution_id,
            "institution_name": institution.name,
            "staff": data,
            "count": len(data),
        })

    def post(self, request, institution_id):
        """Create new staff member in institution."""
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        faculty_id = data.get("faculty_id")
        name = data.get("name")
        role = data.get("role", "staff")

        if not faculty_id or not name:
            return Response(
                {"detail": "faculty_id and name are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
            return Response(
                {"detail": "Staff with this faculty_id already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff = StaffProfile.objects.create(
            faculty_id=faculty_id,
            name=name,
            institution=institution,
            role=role,
        )

        return Response({
            "detail": "Staff created successfully.",
            "staff": {
                "faculty_id": staff.faculty_id,
                "name": staff.name,
                "role": staff.role,
                "role_display": staff.get_role_display(),
            },
        }, status=status.HTTP_201_CREATED)


class AdminStaffRoleUpdateView(APIView):
    """Update staff member's role."""
    permission_classes = [IsAuthenticated]

    def put(self, request, faculty_id):
        """Update staff role."""
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        staff = StaffProfile.objects.filter(faculty_id=faculty_id).first()
        if not staff:
            return Response({"detail": "Staff not found."}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get("role")
        if role not in ["staff", "hod", "admin"]:
            return Response(
                {"detail": "role must be 'staff', 'hod', or 'admin'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff.role = role
        staff.save(update_fields=["role"])

        return Response({
            "detail": f"Role updated to {staff.get_role_display()}.",
            "staff": {
                "faculty_id": staff.faculty_id,
                "name": staff.name,
                "role": staff.role,
                "role_display": staff.get_role_display(),
            },
        })


class AdminInstitutionFullDetailView(APIView):
    """Get full details of an institution including students and staff."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get students
        students = StudentProfile.objects.filter(institution=institution)
        student_list = []
        for s in students:
            student_list.append({
                "id": s.register_number,
                "name": s.name,
                "email": s.personal_email,
                "current_streak": s.current_streak,
                "login_days": s.login_days,
            })

        # Get staff
        staff = StaffProfile.objects.filter(institution=institution)
        staff_list = []
        for s in staff:
            staff_list.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
                "password_is_set": s.password_is_set,
            })

        # Get stats
        active_sessions = ProblemSession.objects.filter(
            is_active=True,
            student__institution=institution
        ).count()

        # Get problem stats for this institution
        solved_count = SolvedProblem.objects.filter(student__institution=institution).count()
        total_students = len(student_list)
        success_rate = round((solved_count / total_students) * 100) if total_students > 0 else 0

        return Response({
            "institution": {
                "id": institution.id,
                "institution_id": institution.institution_id,
                "name": institution.name,
                "short_code": institution.short_code,
                "address": institution.address,
                "is_active": institution.is_active,
            },
            "students": student_list,
            "staff": staff_list,
            "department": None,
            "stats": {
                "total_students": total_students,
                "total_staff": len(staff_list),
                "active_sessions": active_sessions,
                "problems_solved": solved_count,
                "success_rate": success_rate,
            },
            "active_students": len([s for s in student_list if s["current_streak"] > 0]),
            "avg_solved": solved_count / total_students if total_students > 0 else 0,
        })


class AdminAWSStatsView(APIView):
    """Get or update AWS usage statistics."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        # Get from ExecutionRecord for real data
        total_executions = ExecutionRecord.objects.count()
        total_api_calls = total_executions  # Each execution is an API call
        
        # Calculate estimated cost (placeholder pricing)
        cost_per_execution = 0.001  # $0.001 per execution
        estimated_cost = total_api_calls * cost_per_execution

        return Response({
            "hits": total_api_calls,
            "pricing": round(estimated_cost, 2),
            "executions": total_executions,
            "period": "all_time",
        })

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        # Update AWS stats (manual override)
        data = request.data
        hits = data.get("hits")
        pricing = data.get("pricing")

        return Response({
            "detail": "AWS stats updated.",
            "hits": hits,
            "pricing": pricing,
        })


class AdminAssignUserToInstitutionView(APIView):
    """Assign a student or staff to an institution."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get("user_id")
        user_type = request.data.get("user_type")  # "student" or "staff"
        institution_id = request.data.get("institution_id")

        if not user_id or not user_type or not institution_id:
            return Response({"detail": "user_id, user_type, and institution_id are required."}, status=status.HTTP_400_BAD_REQUEST)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        if user_type == "student":
            profile = StudentProfile.objects.filter(register_number=user_id).first()
            if not profile:
                return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)
            profile.institution = institution
            profile.save()
        elif user_type == "staff":
            profile = StaffProfile.objects.filter(faculty_id=user_id).first()
            if not profile:
                return Response({"detail": "Staff not found."}, status=status.HTTP_404_NOT_FOUND)
            profile.institution = institution
            profile.save()
        else:
            return Response({"detail": "user_type must be 'student' or 'staff'."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "detail": f"{user_type.capitalize()} assigned to {institution.name}.",
            "user_id": user_id,
            "institution_id": institution_id,
            "institution_name": institution.name,
        })


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


class DiscussionMessageListCreateView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        messages = get_recent_discussions_queryset()[:100]
        return Response(DiscussionMessageSerializer(messages, many=True).data)

    def post(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = DiscussionMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        problem_slug = serializer.validated_data.get("problem_slug", "").strip()
        problem = None
        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        # Only students can post discussions
        if profile_type != "student" or not profile:
            return Response(
                {"detail": "Only students can post discussions."},
                status=status.HTTP_403_FORBIDDEN,
            )

        message = DiscussionMessage.objects.create(
            student=profile,
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


@method_decorator(ensure_csrf_cookie, name="dispatch")
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

        # Check if the account is blocked BEFORE calling authenticate(),
        # because Django's ModelBackend silently returns None for inactive users
        # even with the correct password, which would show a misleading 401.
        if not profile.account.is_active:
            return Response(
                {"detail": "Your account has been blocked. Please contact your department staff."},
                status=status.HTTP_403_FORBIDDEN,
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
                "user_type": "student",
                "student": StudentProfileSerializer(profile).data,
            }
        )


class StudentLogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"detail": "Logout successful."})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ProblemSessionStartView(UnifiedAuthMixin, APIView):
    """Start a problem solving session to track time spent."""
    def post(self, request, slug):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        
        # Only students can have problem sessions
        if profile_type != "student" or not profile:
            return Response(
                {"detail": "Only students can start problem sessions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        problem = Problem.objects.filter(slug=slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # End any existing active session for this problem
        existing_session = ProblemSession.objects.filter(
            student=profile,
            problem=problem,
            is_active=True
        ).first()
        
        if existing_session:
            existing_session.end_session()
        
        # Create new session
        session = ProblemSession.objects.create(
            student=profile,
            problem=problem,
            is_active=True
        )
        
        return Response({
            "detail": "Session started.",
            "session_id": session.id,
            "started_at": session.started_at,
        })


@method_decorator(ensure_csrf_cookie, name="dispatch")
class ProblemSessionEndView(UnifiedAuthMixin, APIView):
    """End a problem solving session and return time spent."""
    def post(self, request, slug):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        
        # Only students can have problem sessions
        if profile_type != "student" or not profile:
            return Response(
                {"detail": "Only students can end problem sessions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        
        problem = Problem.objects.filter(slug=slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Find and end active session
        session = ProblemSession.objects.filter(
            student=profile,
            problem=problem,
            is_active=True
        ).first()
        
        if not session:
            return Response(
                {"detail": "No active session found for this problem."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        time_spent = session.end_session()
        
        return Response({
            "detail": "Session ended.",
            "time_spent_seconds": time_spent,
            "ended_at": session.ended_at,
        })


# =============================================================================
# Staff/Faculty Authentication Views (similar flow to students)
# =============================================================================

class StaffLookupView(APIView):
    """Lookup staff by faculty_id - returns first_login_required status."""
    def get(self, request):
        max_attempts, window = _lookup_rate_limits()
        try:
            check_rate_limit(request, "staff-lookup", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        faculty_id = (request.query_params.get("faculty_id") or "").strip()
        if not faculty_id:
            return Response(
                {"detail": "faculty_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = StaffProfile.objects.filter(faculty_id=faculty_id).first()
        if not profile:
            return Response(
                {"detail": "Staff member not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "staff": {
                "faculty_id": profile.faculty_id,
                "name": profile.name,
            },
            "first_login_required": not profile.password_is_set,
        })


@method_decorator(ensure_csrf_cookie, name="dispatch")
class StaffFirstLoginView(APIView):
    """First-time password setup for staff (like students)."""
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "staff-first-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        faculty_id = (request.data.get("faculty_id") or "").strip()
        password = request.data.get("password", "").strip()

        if not faculty_id or not password:
            return Response(
                {"detail": "faculty_id and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "Password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = (
            StaffProfile.objects.filter(faculty_id=faculty_id)
            .select_related("account")
            .first()
        )

        if not profile:
            return Response(
                {"detail": "Staff account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if profile.password_is_set:
            return Response(
                {"detail": "Password already set. Please log in normally."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store password in staff_profiles table
        profile.set_password(password)
        
        # Login using the associated account
        if profile.account:
            login(request, profile.account)
        
        return Response({
            "detail": "Password set successfully.",
            "staff": {
                "faculty_id": profile.faculty_id,
                "name": profile.name,
            },
        })


@method_decorator(ensure_csrf_cookie, name="dispatch")
class StaffLoginView(APIView):
    """Staff login with faculty_id and password."""
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "staff-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        faculty_id = (request.data.get("faculty_id") or "").strip()
        password = request.data.get("password", "").strip()

        if not faculty_id or not password:
            return Response(
                {"detail": "faculty_id and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = (
            StaffProfile.objects.filter(faculty_id=faculty_id)
            .select_related("account")
            .first()
        )

        if not profile:
            return Response(
                {"detail": "Staff account not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not profile.password_is_set:
            return Response(
                {"detail": "First-time password setup is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check password from staff_profiles table
        if not profile.check_password(password):
            return Response(
                {"detail": "Invalid faculty_id or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Ensure User account exists (for Django session auth)
        if not profile.account:
            user = User.objects.create_user(
                username=profile.faculty_id,
                first_name=profile.name,
            )
            user.set_password(password)
            user.save()
            profile.account = user
            profile.save(update_fields=["account"])
        else:
            # Sync password to User account if needed
            user = profile.account
            if not user.check_password(password):
                user.set_password(password)
                user.save()

        # Login directly using the verified user (bypass authenticate since we already checked password)
        if profile.account:
            # Ensure user is active
            if not profile.account.is_active:
                profile.account.is_active = True
                profile.account.save(update_fields=["is_active"])
            login(request, profile.account)
        
        # Check if linked account is superuser (staff can also be admin)
        is_admin = profile.account and profile.account.is_superuser if profile.account else False
        
        # Get institution_id for response
        institution_id = profile.institution.institution_id if profile.institution else None
        
        # Return response based on staff role
        response_data = {
            "detail": "Login successful.",
            "user_type": profile.role,  # staff, hod, or admin
            "institution_id": institution_id,
        }
        
        # Include appropriate data based on role
        user_data = {
            "id": profile.faculty_id,
            "name": profile.name,
            "institution_id": institution_id,
        }
        
        if profile.role == "admin":
            response_data["admin"] = user_data
        elif profile.role == "hod":
            response_data["hod"] = user_data
        else:
            response_data["staff"] = user_data
        
        return Response(response_data)


class StaffLogoutView(APIView):
    """Staff logout."""
    def post(self, request):
        logout(request)
        return Response({"detail": "Logout successful."})


class StaffInstitutionDetailView(APIView):
    """Get institution details for staff members."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        # Check if user is staff (has staff_profile) or admin
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser

        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        # If staff, verify they belong to this institution
        if is_staff and request.user.staff_profile.institution != institution:
            return Response({"detail": "You do not have access to this institution."}, status=status.HTTP_403_FORBIDDEN)

        # Get the user's staff profile if available
        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        user_department = user_profile.department if user_profile else None

        # For HOD, filter students by department
        if user_profile and user_profile.role == "hod" and user_profile.department:
            students_qs = StudentProfile.objects.filter(
                institution=institution,
                department=user_profile.department
            ).select_related('account', 'department')
        else:
            students_qs = StudentProfile.objects.filter(
                institution=institution
            ).select_related('account', 'department')

        # Build student list with metrics
        student_list = []
        for student in students_qs:
            student_list.append({
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "department": student.department.code if student.department else "N/A",
                "department_name": student.department.name if student.department else "N/A",
                "solved_count": student.solved_problems.count(),
                "current_streak": student.current_streak,
                "last_active": student.account.last_login if student.account else None,
                "is_active": student.account.is_active if student.account else True,
            })

        # Get staff (filter by department for HOD, all for admin/staff)
        if user_role == "hod" and user_department:
            staff = StaffProfile.objects.filter(institution=institution, department=user_department)
        else:
            staff = StaffProfile.objects.filter(institution=institution)
        staff_list = []
        for s in staff:
            staff_list.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
                "password_is_set": s.password_is_set,
                "is_active": s.is_active,
            })

        # Get stats
        active_sessions = ProblemSession.objects.filter(
            is_active=True,
            student__institution=institution
        ).count()

        # Get problem stats for this institution
        solved_count = SolvedProblem.objects.filter(student__institution=institution).count()
        total_students = len(student_list)
        success_rate = round((solved_count / total_students) * 100) if total_students > 0 else 0

        response_data = {
            "institution": {
                "id": institution.institution_id,
                "name": institution.name,
                "short_code": institution.short_code,
                "address": institution.address,
                "is_active": institution.is_active,
            },
            "students": student_list,
            "staff": staff_list,
            "stats": {
                "total_students": total_students,
                "total_staff": len(staff_list),
                "active_sessions": active_sessions,
                "total_solved": solved_count,
                "success_rate": success_rate,
            },
        }
        
        # Add department info for HOD users
        if user_role == "hod" and user_department:
            response_data["department"] = {
                "id": user_department.id,
                "code": user_department.code,
                "name": user_department.name,
            }
        
        return Response(response_data)


class StaffPerformanceView(APIView):
    """Get individual staff performance metrics for HOD."""
    permission_classes = [IsAuthenticated]

    def get(self, request, institution_id):
        # Check if user is HOD or staff
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile
        user_role = user_profile.role
        user_department = user_profile.department

        institution = Institution.objects.filter(institution_id=institution_id).first()
        if not institution:
            return Response({"detail": "Institution not found."}, status=status.HTTP_404_NOT_FOUND)

        # Verify staff belongs to this institution
        if user_profile.institution != institution:
            return Response({"detail": "You do not have access to this institution."}, status=status.HTTP_403_FORBIDDEN)

        # Filter by department for HOD, all for staff/admin
        if user_role == "hod" and user_department:
            staff_qs = StaffProfile.objects.filter(institution=institution, department=user_department)
        else:
            staff_qs = StaffProfile.objects.filter(institution=institution)

        staff_performance = []
        for staff in staff_qs:
            # Calculate days active (since account creation)
            days_active = 1
            if staff.account and staff.account.date_joined:
                days_active = (timezone.now() - staff.account.date_joined).days

            # Get number of students in this staff's department (managed by staff)
            assigned_students = StudentProfile.objects.filter(
                institution=institution,
                department=staff.department
            ).count() if staff.department else 0

            # Student progress (problems solved by students in department)
            student_progress = 0
            if staff.department:
                student_progress = SolvedProblem.objects.filter(
                    student__department=staff.department,
                    student__institution=institution
                ).count()

            # Contests created by this staff with top performers
            staff_contests = []
            contests_qs = staff.contests.filter(
                institution=institution
            ).order_by('-created_at')[:5]  # Last 5 contests

            for contest in contests_qs:
                # Get top performers for this contest (students with most accepted submissions)
                top_performers = []
                contest_leaders = ContestSubmission.objects.filter(
                    contest=contest,
                    status='Accepted'
                ).values('student').annotate(
                    solved_count=Count('id'),
                    total_score=Sum('score')
                ).order_by('-solved_count', '-total_score')[:5]

                for leader in contest_leaders:
                    student = StudentProfile.objects.filter(id=leader['student']).first()
                    if student:
                        top_performers.append({
                            "register_number": student.register_number,
                            "name": student.name,
                            "solved_in_contest": leader['solved_count'],
                            "score": leader['total_score'] or 0,
                        })

                staff_contests.append({
                    "id": contest.id,
                    "title": contest.title,
                    "status": contest.status,
                    "created_at": contest.created_at,
                    "total_participants": contest.total_participants,
                    "total_submissions": contest.total_submissions,
                    "top_performers": top_performers,
                })

            contests_created = staff.contests.filter(institution=institution).count()

            staff_performance.append({
                "faculty_id": staff.faculty_id,
                "name": staff.name or staff.faculty_id,
                "role": staff.role,
                "days_active": days_active,
                "assigned_students": assigned_students,
                "student_progress": student_progress,
                "contests_created": contests_created,
                "contests": staff_contests,
            })

        return Response({
            "staff_performance": staff_performance,
            "department": {
                "id": user_department.id,
                "code": user_department.code,
                "name": user_department.name,
            } if user_department else None,
        })


class StaffDetailView(APIView):
    """Get detailed analytics for a specific staff member."""
    permission_classes = [IsAuthenticated]

    def get(self, request, faculty_id):
        # Check if user is HOD or staff
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser
        
        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        user_department = user_profile.department if user_profile else None

        # Get the target staff member
        target_staff = StaffProfile.objects.filter(faculty_id=faculty_id).select_related('department', 'institution').first()
        if not target_staff:
            return Response({"detail": "Staff not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions: HOD can only view staff in their department, staff can view anyone in their institution
        if is_staff:
            if user_role == "hod" and target_staff.department != user_department:
                return Response({"detail": "You can only view staff in your department."}, status=status.HTTP_403_FORBIDDEN)
            if target_staff.institution != user_profile.institution:
                return Response({"detail": "You do not have access to this staff member."}, status=status.HTTP_403_FORBIDDEN)

        # Get staff activity (days since joining)
        days_active = 1  # Placeholder
        if target_staff.account and target_staff.account.date_joined:
            days_active = (timezone.now() - target_staff.account.date_joined).days

        # Get students in this staff's department
        department_students = StudentProfile.objects.filter(
            institution=target_staff.institution,
            department=target_staff.department
        ) if target_staff.department else []

        # Get top performers in department
        top_students = []
        for student in department_students.annotate(
            solved_count=Count('solved_problems', distinct=True)
        ).order_by('-solved_count')[:10]:
            top_students.append({
                "id": student.register_number,
                "name": student.name,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
            })

        # Get contests created by this staff with top performers
        recent_contests = []
        staff_contests_qs = target_staff.contests.filter(
            institution=target_staff.institution
        ).order_by('-created_at')[:10]

        for contest in staff_contests_qs:
            # Get top performers for this contest
            contest_top_performers = []
            contest_leaders = ContestSubmission.objects.filter(
                contest=contest,
                status='Accepted'
            ).values('student').annotate(
                solved_count=Count('id'),
                total_score=Sum('score')
            ).order_by('-solved_count', '-total_score')[:5]

            for leader in contest_leaders:
                student = StudentProfile.objects.filter(id=leader['student']).first()
                if student:
                    contest_top_performers.append({
                        "register_number": student.register_number,
                        "name": student.name,
                        "batch": student.batch,
                        "solved_in_contest": leader['solved_count'],
                        "score": leader['total_score'] or 0,
                    })

            recent_contests.append({
                "id": contest.id,
                "title": contest.title,
                "status": contest.status,
                "created_at": contest.created_at,
                "total_participants": contest.total_participants,
                "total_submissions": contest.total_submissions,
                "top_performers": contest_top_performers,
            })

        # Batch-wise grouping with top performers per batch
        batch_wise_data = []
        if target_staff.department:
            # Get distinct batches in this department
            batches = StudentProfile.objects.filter(
                institution=target_staff.institution,
                department=target_staff.department,
                batch__isnull=False
            ).exclude(batch='').values_list('batch', flat=True).distinct()

            for batch in batches:
                # Get all students for this batch with annotations
                all_batch_students = StudentProfile.objects.filter(
                    institution=target_staff.institution,
                    department=target_staff.department,
                    batch=batch
                ).annotate(
                    solved_count=Count('solved_problems', distinct=True)
                ).order_by('-solved_count')

                batch_count = all_batch_students.count()

                # Get top performers for this batch (first 5)
                batch_top_performers = []
                for student in all_batch_students[:5]:
                    batch_top_performers.append({
                        "register_number": student.register_number,
                        "name": student.name,
                        "solved_count": student.solved_count,
                        "current_streak": student.current_streak,
                    })

                # Get all students for the batch (for expanded view)
                all_students = []
                for student in all_batch_students:
                    all_students.append({
                        "register_number": student.register_number,
                        "name": student.name,
                        "solved_count": student.solved_count,
                        "current_streak": student.current_streak,
                        "last_active": student.last_login_on.isoformat() if student.last_login_on else None,
                    })

                batch_wise_data.append({
                    "batch": batch,
                    "student_count": batch_count,
                    "top_performers": batch_top_performers,
                    "students": all_students,
                })

        # Calculate weekly progress
        weekly_progress = []
        for i in range(7):
            day = timezone.now() - timedelta(days=i)
            count = SolvedProblem.objects.filter(
                student__department=target_staff.department,
                solved_at__date=day.date()
            ).count() if target_staff.department else 0
            weekly_progress.append({
                "day": day.strftime("%a"),
                "count": count,
            })
        weekly_progress.reverse()

        return Response({
            "staff": {
                "faculty_id": target_staff.faculty_id,
                "name": target_staff.name or target_staff.faculty_id,
                "role": target_staff.role,
                "department": {
                    "id": target_staff.department.id,
                    "code": target_staff.department.code,
                    "name": target_staff.department.name,
                } if target_staff.department else None,
                "institution": {
                    "id": target_staff.institution.institution_id,
                    "name": target_staff.institution.name,
                } if target_staff.institution else None,
                "days_active": days_active,
                "assigned_students": department_students.count(),
            },
            "analytics": {
                "total_solved": SolvedProblem.objects.filter(
                    student__department=target_staff.department
                ).count() if target_staff.department else 0,
                "weekly_progress": weekly_progress,
                "top_performers": top_students,
                "contests": recent_contests,
                "batch_wise": batch_wise_data,
            },
        })


class ContestListCreateView(APIView):
    """List contests for HOD/staff or create new contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get contests - filtered by role and department"""
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        
        # HOD sees all contests in their department
        # Staff sees only their own contests
        if profile.role == "hod" and profile.department:
            contests = Contest.objects.filter(department=profile.department).select_related(
                'created_by', 'department', 'approved_by'
            ).order_by('-created_at')
        elif profile.role == "staff":
            # Staff only sees their own contests
            contests = Contest.objects.filter(created_by=profile).select_related(
                'created_by', 'department', 'approved_by'
            ).order_by('-created_at')
        else:
            contests = Contest.objects.filter(institution=profile.institution).select_related(
                'created_by', 'department', 'approved_by'
            ).order_by('-created_at')

        data = []
        for contest in contests:
            data.append({
                "id": contest.id,
                "title": contest.title,
                "description": contest.description,
                "created_by": {
                    "faculty_id": contest.created_by.faculty_id,
                    "name": contest.created_by.name or contest.created_by.faculty_id,
                },
                "status": contest.status,
                "start_time": contest.start_time,
                "end_time": contest.end_time,
                "duration_minutes": contest.duration_minutes,
                "total_participants": contest.total_participants,
                "total_submissions": contest.total_submissions,
                "approved_by": {
                    "faculty_id": contest.approved_by.faculty_id,
                    "name": contest.approved_by.name or contest.approved_by.faculty_id,
                } if contest.approved_by else None,
                "approved_at": contest.approved_at,
                "rejection_reason": contest.rejection_reason,
                "submitted_for_approval_at": contest.submitted_for_approval_at,
                "created_at": contest.created_at,
                "problem_count": contest.problems.count(),
                "assigned_student_count": contest.assigned_students.count(),
            })

        return Response({
            "contests": data,
            "department": {
                "id": profile.department.id,
                "code": profile.department.code,
                "name": profile.department.name,
            } if profile.department else None,
            "user_role": profile.role,
        })

    def post(self, request):
        """Create new contest"""
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        if not profile.department:
            return Response({"detail": "You must have a department to create contests."}, status=status.HTTP_400_BAD_REQUEST)

        title = request.data.get('title')
        if not title:
            return Response({"detail": "Title is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Determine initial status
        submit_for_approval = request.data.get('submit_for_approval', False)
        initial_status = 'pending_approval' if submit_for_approval else 'draft'

        # Parse datetime strings to timezone-aware datetimes
        from datetime import datetime
        start_time_str = request.data.get('start_time')
        end_time_str = request.data.get('end_time')
        
        start_time = None
        end_time = None
        
        if start_time_str:
            try:
                # Parse ISO format datetime and make it timezone-aware
                naive_dt = datetime.fromisoformat(start_time_str)
                start_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())
            except (ValueError, TypeError):
                pass
        
        if end_time_str:
            try:
                naive_dt = datetime.fromisoformat(end_time_str)
                end_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())
            except (ValueError, TypeError):
                pass

        contest = Contest.objects.create(
            title=title,
            description=request.data.get('description', ''),
            created_by=profile,
            department=profile.department,
            institution=profile.institution,
            start_time=start_time,
            end_time=end_time,
            duration_minutes=request.data.get('duration_minutes', 60),
            status=initial_status,
            submitted_for_approval_at=timezone.now() if submit_for_approval else None,
        )

        # Add problems by slugs
        problem_slugs = request.data.get('problem_slugs', [])
        if problem_slugs:
            problems = Problem.objects.filter(slug__in=problem_slugs)
            contest.problems.set(problems)

        # Assign batches
        assigned_batches = request.data.get('assigned_batches', [])
        if assigned_batches:
            contest.assigned_batches = assigned_batches
            contest.save(update_fields=['assigned_batches'])
            
            # Auto-assign students from batches
            batch_students = StudentProfile.objects.filter(
                institution=profile.institution,
                department=profile.department,
                batch__in=assigned_batches
            )
            contest.assigned_students.add(*batch_students)

        # Assign individual students
        assigned_student_ids = request.data.get('assigned_student_ids', [])
        if assigned_student_ids:
            individual_students = StudentProfile.objects.filter(
                id__in=assigned_student_ids,
                institution=profile.institution,
                department=profile.department
            )
            contest.assigned_students.add(*individual_students)

        return Response({
            "id": contest.id,
            "title": contest.title,
            "status": contest.status,
            "detail": f"Contest created successfully{' and submitted for approval' if submit_for_approval else ''}.",
        }, status=status.HTTP_201_CREATED)


class ContestDetailView(APIView):
    """Get or update a specific contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get contest details"""
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        contest = Contest.objects.filter(id=pk).first()
        
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions
        if profile.role == "hod" and contest.department != profile.department:
            return Response({"detail": "You can only view contests in your department."}, status=status.HTTP_403_FORBIDDEN)

        problems_data = []
        for problem in contest.problems.all():
            problems_data.append({
                "id": problem.id,
                "slug": problem.slug,
                "title": problem.title,
                "difficulty": problem.difficulty,
            })

        return Response({
            "id": contest.id,
            "title": contest.title,
            "description": contest.description,
            "created_by": {
                "faculty_id": contest.created_by.faculty_id,
                "name": contest.created_by.name or contest.created_by.faculty_id,
            },
            "department": {
                "id": contest.department.id,
                "code": contest.department.code,
                "name": contest.department.name,
            } if contest.department else None,
            "status": contest.status,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "duration_minutes": contest.duration_minutes,
            "problems": problems_data,
            "total_participants": contest.total_participants,
            "total_submissions": contest.total_submissions,
            "created_at": contest.created_at,
            "updated_at": contest.updated_at,
        })


class ContestAnalyticsView(APIView):
    """Get analytics for a specific contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get contest analytics"""
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        contest = Contest.objects.filter(id=pk).first()
        
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions
        if profile.role == "hod" and contest.department != profile.department:
            return Response({"detail": "You can only view contests in your department."}, status=status.HTTP_403_FORBIDDEN)

        # Get submission stats
        submissions = ContestSubmission.objects.filter(contest=contest)
        
        # Problem-wise stats
        problem_stats = []
        for problem in contest.problems.all():
            problem_submissions = submissions.filter(problem=problem)
            accepted = problem_submissions.filter(status='Accepted').count()
            total = problem_submissions.count()
            problem_stats.append({
                "problem_id": problem.id,
                "title": problem.title,
                "slug": problem.slug,
                "total_attempts": total,
                "accepted": accepted,
                "success_rate": round((accepted / total) * 100, 1) if total > 0 else 0,
            })

        # Participant stats with detailed information
        participants_data = []
        participations = ContestParticipation.objects.filter(contest=contest).select_related('student')
        
        for participation in participations:
            student = participation.student
            student_submissions = submissions.filter(student=student)
            
            # Only include students who have submitted
            if student_submissions.count() == 0:
                continue
            
            solved_count = student_submissions.filter(status='Accepted').values('problem').distinct().count()
            total_score = student_submissions.aggregate(total=Sum('score'))['total'] or 0
            
            participants_data.append({
                "register_number": student.register_number,
                "name": student.name,
                "problems_solved": solved_count,
                "score": total_score,
                "total_submissions": student_submissions.count(),
                "time_spent": participation.time_spent_seconds or 0,
            })
        
        # Sort by score descending
        participants_data.sort(key=lambda x: (-x['score'], -x['problems_solved']))
        
        # Top performers (top 10)
        top_performers = participants_data[:10]

        return Response({
            "contest": {
                "id": contest.id,
                "title": contest.title,
                "status": contest.status,
            },
            "summary": {
                "total_participants": len(participants_data),
                "total_submissions": submissions.count(),
                "accepted_submissions": submissions.filter(status='Accepted').count(),
            },
            "problem_stats": problem_stats,
            "top_performers": top_performers,
            "participants": participants_data,  # All participants with submissions
        })


class ContestStudentSubmissionsView(APIView):
    """Get all submissions by a specific student in a contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request, contest_id, register_number):
        """Get student's submissions for a contest"""
        is_staff = hasattr(request.user, 'staff_profile')
        if not is_staff:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        contest = Contest.objects.filter(id=contest_id).first()
        
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions
        if profile.role == "staff" and contest.created_by != profile:
            return Response({"detail": "You can only view your own contests."}, status=status.HTTP_403_FORBIDDEN)
        
        if profile.role == "hod" and contest.department != profile.department:
            return Response({"detail": "You can only view contests in your department."}, status=status.HTTP_403_FORBIDDEN)

        # Get student
        student = StudentProfile.objects.filter(register_number=register_number).first()
        if not student:
            return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        # Get all submissions by this student for this contest
        submissions = ContestSubmission.objects.filter(
            contest=contest,
            student=student
        ).select_related('problem').order_by('-submitted_at')

        submissions_data = []
        for sub in submissions:
            submissions_data.append({
                "id": sub.id,
                "problem_title": sub.problem.title,
                "problem_slug": sub.problem.slug,
                "language": sub.language,
                "status": sub.status,
                "passed_cases": sub.passed_cases,
                "total_cases": sub.total_cases,
                "score": sub.score,
                "execution_time": sub.execution_time,
                "memory": sub.memory,
                "submitted_at": sub.submitted_at,
            })

        return Response({
            "student": {
                "register_number": student.register_number,
                "name": student.name,
            },
            "contest": {
                "id": contest.id,
                "title": contest.title,
            },
            "submissions": submissions_data,
        })


# =============================================================================
# Admin Authentication Views
# =============================================================================

class AdminLookupView(APIView):
    """Lookup admin by ID - returns first_login_required status."""
    def get(self, request):
        max_attempts, window = _lookup_rate_limits()
        try:
            check_rate_limit(request, "admin-lookup", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        admin_id = (request.query_params.get("admin_id") or "").strip()
        if not admin_id:
            return Response(
                {"detail": "admin_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check 1: Django superuser
        user = User.objects.filter(username=admin_id, is_superuser=True).first()
        if user:
            return Response({
                "admin": {
                    "id": user.username,
                    "name": user.first_name or "Administrator",
                },
                "first_login_required": not user.has_usable_password(),
            })
        
        # Check 2: StaffProfile with admin role
        staff = StaffProfile.objects.filter(faculty_id=admin_id, role="admin").first()
        if staff:
            return Response({
                "admin": {
                    "id": staff.faculty_id,
                    "name": staff.name or "Administrator",
                },
                "first_login_required": not staff.password_is_set,
            })
        
        return Response(
            {"detail": "Admin not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AdminFirstLoginView(APIView):
    """First-time password setup for admin."""
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "admin-first-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        admin_id = (request.data.get("admin_id") or "").strip()
        password = request.data.get("password", "").strip()

        if not admin_id or not password:
            return Response(
                {"detail": "admin_id and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(password) < 8:
            return Response(
                {"detail": "Password must be at least 8 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check 1: Django superuser
        user = User.objects.filter(username=admin_id, is_superuser=True).first()
        if user:
            if user.has_usable_password():
                return Response(
                    {"detail": "Password already set. Please log in normally."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.set_password(password)
            user.save(update_fields=["password"])
            login(request, user)
            return Response({
                "detail": "Password set successfully.",
                "admin": {
                    "id": user.username,
                    "name": user.first_name or "Administrator",
                },
            })
        
        # Check 2: StaffProfile with admin role
        staff = StaffProfile.objects.filter(faculty_id=admin_id, role="admin").first()
        if staff:
            if staff.password_is_set:
                return Response(
                    {"detail": "Password already set. Please log in normally."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            staff.set_password(password)
            # Ensure User account exists and sync password
            if not staff.account:
                user = User.objects.create_user(
                    username=staff.faculty_id,
                    first_name=staff.name,
                )
                user.set_password(password)
                user.save()
                staff.account = user
                staff.save(update_fields=["account"])
            login(request, staff.account)
            return Response({
                "detail": "Password set successfully.",
                "admin": {
                    "id": staff.faculty_id,
                    "name": staff.name or "Administrator",
                },
            })
        
        return Response(
            {"detail": "Admin account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AdminLoginView(APIView):
    """Admin login with ID and password."""
    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "admin-login", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        admin_id = (request.data.get("admin_id") or "").strip()
        password = request.data.get("password", "").strip()

        if not admin_id or not password:
            return Response(
                {"detail": "admin_id and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check 1: Django superuser
        user = User.objects.filter(username=admin_id, is_superuser=True).first()
        if user:
            if not user.has_usable_password():
                return Response(
                    {"detail": "First-time password setup is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Verify password and login directly
            if not user.check_password(password):
                return Response(
                    {"detail": "Invalid admin_id or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            # Ensure user is active
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=["is_active"])
            login(request, user)
            return Response({
                "detail": "Login successful.",
                "user_type": "admin",
                "admin": {
                    "id": user.username,
                    "name": user.first_name or "Administrator",
                },
            })
        
        # Check 2: StaffProfile with admin role
        staff = StaffProfile.objects.filter(faculty_id=admin_id, role="admin").select_related("account").first()
        if staff:
            if not staff.password_is_set:
                return Response(
                    {"detail": "First-time password setup is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # Check password against StaffProfile
            if not staff.check_password(password):
                return Response(
                    {"detail": "Invalid admin_id or password."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            # Ensure User account exists and sync password
            if not staff.account:
                user = User.objects.create_user(
                    username=staff.faculty_id,
                    first_name=staff.name,
                )
                user.set_password(password)
                user.save()
                staff.account = user
                staff.save(update_fields=["account"])
            else:
                # Sync password if needed
                if not staff.account.check_password(password):
                    staff.account.set_password(password)
                    staff.account.save()
            login(request, staff.account)
            return Response({
                "detail": "Login successful.",
                "user_type": "admin",
                "admin": {
                    "id": staff.faculty_id,
                    "name": staff.name or "Administrator",
                },
            })
        
        return Response(
            {"detail": "Admin account not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


class AdminLogoutView(APIView):
    """Admin logout."""
    def post(self, request):
        logout(request)
        return Response({"detail": "Logout successful."})


# =============================================================================
# Unified User Lookup (checks student, staff, and admin)
# =============================================================================

class UnifiedUserLookupView(APIView):
    """
    Unified lookup that checks student_profiles, staff_profiles, and admin users.
    Returns user type and first_login_required status.
    """
    def get(self, request):
        max_attempts, window = _lookup_rate_limits()
        try:
            check_rate_limit(request, "user-lookup", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        user_id = (request.query_params.get("user_id") or "").strip()
        if not user_id:
            return Response(
                {"detail": "user_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Check if it's a student (register_number)
        student = StudentProfile.objects.filter(register_number=user_id).first()
        if student:
            return Response({
                "user_type": "student",
                "user": {
                    "id": student.register_number,
                    "name": student.name,
                },
                "first_login_required": not student.password_is_set,
            })

        # 2. Check if it's staff (faculty_id) - return role from profile
        staff = StaffProfile.objects.filter(faculty_id=user_id).first()
        if staff:
            # Use the role from StaffProfile (staff, hod, or admin)
            return Response({
                "user_type": staff.role,  # staff, hod, or admin
                "user": {
                    "id": staff.faculty_id,
                    "name": staff.name,
                },
                "first_login_required": not staff.password_is_set,
            })

        # 3. Check if it's an admin (superuser)
        admin = User.objects.filter(username=user_id, is_superuser=True).first()
        if admin:
            return Response({
                "user_type": "admin",
                "user": {
                    "id": admin.username,
                    "name": admin.first_name or "Administrator",
                },
                "first_login_required": not admin.has_usable_password(),
            })

        return Response(
            {"detail": "User not found."},
            status=status.HTTP_404_NOT_FOUND,
        )


# =============================================================================
# Judge0 Direct API Endpoints
# =============================================================================

class Judge0SystemInfoView(APIView):
    """Get Judge0 system information and status."""
    permission_classes = [AllowAny]

    def get(self, request):
        """Fetch Judge0 system info."""
        import urllib.request
        import json
        from django.conf import settings

        base_url = getattr(settings, 'JUDGE0_BASE_URL', 'http://localhost:2358').rstrip('/')
        
        try:
            req = urllib.request.Request(
                f"{base_url}/system_info",
                headers={"Accept": "application/json"},
                method="GET"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                return Response({
                    "status": "online",
                    "judge0_info": data
                })
        except Exception as e:
            return Response(
                {"status": "offline", "error": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class Judge0SubmitView(APIView):
    """Submit code directly to Judge0 for execution."""
    permission_classes = [AllowAny]

    # Language ID mapping
    LANGUAGE_IDS = {
        "c": 50,
        "cpp": 54,
        "c++": 54,
        "java": 62,
        "python": 71,
        "javascript": 63,
        "js": 63,
    }

    def post(self, request):
        """Execute code via Judge0 with fallback mock mode."""
        from .services.judge0 import (
            execute_judge0_submission,
            Judge0TimeoutError,
            Judge0ServiceError,
        )

        language_id = request.data.get("language_id")
        source_code = request.data.get("source_code", "")
        stdin = request.data.get("stdin", "")
        language = request.data.get("language", "").lower()
        use_mock = request.data.get("mock", False)

        # If language_id not provided, try to map from language name
        if not language_id and language:
            language_id = self.LANGUAGE_IDS.get(language)

        if not language_id:
            return Response(
                {"detail": "language_id or valid language required. Supported: c(50), cpp/c++(54), java(62), python(71), javascript(63)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not source_code or not source_code.strip():
            return Response(
                {"detail": "source_code is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mock mode for testing when Judge0 is unavailable
        if use_mock:
            return Response({
                "status": "success (mock mode)",
                "execution": {
                    "stdout": f"Mock execution for language_id={language_id}. Code received: {len(source_code)} chars",
                    "stderr": "",
                    "output": f"Mock: {source_code[:50]}..." if len(source_code) > 50 else f"Mock: {source_code}",
                    "status": "Accepted",
                    "status_id": 3,
                    "time": "0.01",
                    "memory": 1024,
                    "token": "mock-token",
                },
                "note": "Running in mock mode. Judge0 server may be unavailable."
            })

        try:
            result = execute_judge0_submission(
                source_code=source_code,
                language_id=language_id,
                stdin=stdin,
            )
            return Response({
                "status": "success",
                "execution": result,
            })
        except Judge0TimeoutError as exc:
            return Response(
                {"status": "timeout", "detail": str(exc)},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Judge0ServiceError as exc:
            return Response(
                {"status": "error", "detail": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            return Response(
                {"status": "error", "detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class StaffLockToggleView(APIView):
    """HOD can lock or unlock staff members from accessing the system."""
    permission_classes = [IsAuthenticated]

    def post(self, request, faculty_id):
        """Toggle staff lock status (lock/unlock)."""
        # Get HOD's profile
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        hod_profile = request.user.staff_profile
        logger.debug(
            "Lock toggle requested by %s (role=%s, dept=%s) for %s",
            hod_profile.faculty_id, hod_profile.role, hod_profile.department_id, faculty_id
        )

        if hod_profile.role != 'hod':
            return Response(
                {"detail": f"Only HOD can lock/unlock staff. Your role: {hod_profile.role}"},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get target staff
        try:
            target_staff = StaffProfile.objects.get(faculty_id=faculty_id)
        except StaffProfile.DoesNotExist:
            return Response(
                {"detail": "Staff not found."},
                status=status.HTTP_404_NOT_FOUND
            )


        # HOD can only lock staff within their own department
        if target_staff.department_id != hod_profile.department_id:
            return Response(
                {"detail": "You can only lock/unlock staff in your own department."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD cannot lock staff from a different institution
        if target_staff.institution_id != hod_profile.institution_id:
            return Response(
                {"detail": "You can only manage staff within your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Cannot lock other HODs or admins
        if target_staff.role in ['hod', 'admin']:
            return Response(
                {"detail": "Cannot lock HOD or Admin accounts."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Toggle is_active status
        target_staff.is_active = not target_staff.is_active
        target_staff.save(update_fields=['is_active'])
        
        # If locking, also deactivate the associated user account
        if not target_staff.is_active and target_staff.account:
            target_staff.account.is_active = False
            target_staff.account.save(update_fields=['is_active'])
        elif target_staff.is_active and target_staff.account:
            # If unlocking, reactivate the account
            target_staff.account.is_active = True
            target_staff.account.save(update_fields=['is_active'])
        
        return Response({
            "detail": f"Staff {target_staff.name} has been {'unlocked' if target_staff.is_active else 'locked'}.",
            "faculty_id": target_staff.faculty_id,
            "is_active": target_staff.is_active,
        })


class StudentDetailView(APIView):
    """Get detailed student profile with solved problems breakdown by difficulty."""
    permission_classes = [IsAuthenticated]

    def get(self, request, register_number):
        """Get student details with difficulty-wise breakdown, achievements and contest data."""
        # Check if user is staff (HOD or staff)
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        # Get student
        try:
            student = StudentProfile.objects.select_related(
                'department', 'institution', 'account'
            ).get(register_number=register_number)
        except StudentProfile.DoesNotExist:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Staff can only view students in their institution
        if student.institution != staff_profile.institution:
            return Response(
                {"detail": "You do not have access to this student."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD/staff can view students in their department only
        if student.department != staff_profile.department:
            return Response(
                {"detail": "You can only view students in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        # ── Solved problems with difficulty breakdown ─────────────────────────
        solved_problems = SolvedProblem.objects.filter(
            student=student
        ).select_related('problem')

        difficulty_counts = {'Easy': 0, 'Medium': 0, 'Hard': 0}
        difficulty_problems = {'Easy': [], 'Medium': [], 'Hard': []}

        for solved in solved_problems:
            difficulty = solved.problem.difficulty or 'Medium'
            if difficulty in difficulty_counts:
                difficulty_counts[difficulty] += 1
                difficulty_problems[difficulty].append({
                    'id': solved.problem.id,
                    'title': solved.problem.title,
                    'slug': solved.problem.slug,
                    'solved_at': solved.solved_at.isoformat() if solved.solved_at else None,
                })

        total_solved = solved_problems.count()

        # ── Contests the student participated in ──────────────────────────────
        contest_submissions = ContestSubmission.objects.filter(
            student=student
        ).select_related('contest').order_by('-submitted_at')

        # Group by contest to find: participated, won (rank 1)
        contest_map = {}
        for sub in contest_submissions:
            cid = sub.contest_id
            if cid not in contest_map:
                contest_map[cid] = {
                    'id': cid,
                    'title': sub.contest.title if sub.contest else '',
                    'status': sub.contest.status if sub.contest else '',
                    'solved': 0,
                    'score': 0,
                }
            if sub.status == 'Accepted':
                contest_map[cid]['solved'] += 1
                contest_map[cid]['score'] = max(contest_map[cid]['score'], sub.score or 0)

        participated_contests = list(contest_map.values())

        # Find contests where this student was top scorer (rank 1)
        contests_won = []
        for cid, cdata in contest_map.items():
            # Check if this student has highest solved + score in the contest
            top = ContestSubmission.objects.filter(
                contest_id=cid, status='Accepted'
            ).values('student').annotate(
                solved=Count('id'), total_score=Sum('score')
            ).order_by('-solved', '-total_score').first()

            if top and top['student'] == student.id:
                contests_won.append({
                    'id': cid,
                    'title': cdata['title'],
                    'solved': cdata['solved'],
                    'score': cdata['score'],
                })

        # ── Recent submissions ────────────────────────────────────────────────
        recent_submissions_qs = ContestSubmission.objects.filter(
            student=student
        ).select_related('contest', 'problem').order_by('-submitted_at')[:10]

        submissions_data = []
        for sub in recent_submissions_qs:
            submissions_data.append({
                'contest': sub.contest.title if sub.contest else None,
                'problem': sub.problem.title if sub.problem else None,
                'status': sub.status,
                'score': sub.score,
                'submitted_at': sub.submitted_at.isoformat() if sub.submitted_at else None,
            })

        # ── Achievements (computed milestones) ────────────────────────────────
        achievements = []

        solve_milestones = [
            (1, '🎯', 'First Blood', 'Solved your first problem'),
            (5, '🔥', 'Getting Warm', 'Solved 5 problems'),
            (10, '⚡', 'Double Digits', 'Solved 10 problems'),
            (25, '🏅', 'Quarter Century', 'Solved 25 problems'),
            (50, '🥈', 'Halfway Hero', 'Solved 50 problems'),
            (100, '🏆', 'Century Club', 'Solved 100 problems'),
        ]
        for threshold, icon, title, desc in solve_milestones:
            achievements.append({
                'icon': icon, 'title': title, 'description': desc,
                'earned': total_solved >= threshold,
                'type': 'solve',
            })

        streak = student.current_streak or 0
        streak_milestones = [
            (3, '🌱', '3-Day Streak', '3 days in a row'),
            (7, '🔥', 'Week Warrior', '7-day streak'),
            (14, '💎', 'Fortnight Fire', '14-day streak'),
            (30, '👑', 'Month Master', '30-day streak'),
        ]
        for threshold, icon, title, desc in streak_milestones:
            achievements.append({
                'icon': icon, 'title': title, 'description': desc,
                'earned': streak >= threshold,
                'type': 'streak',
            })

        if participated_contests:
            achievements.append({
                'icon': '🎪', 'title': 'Contest Debut',
                'description': 'Participated in a contest', 'earned': True, 'type': 'contest',
            })
        if contests_won:
            achievements.append({
                'icon': '🥇', 'title': 'Contest Champion',
                'description': f'Won {len(contests_won)} contest(s)', 'earned': True, 'type': 'contest',
            })

        # Hard solver achievement
        if difficulty_counts['Hard'] >= 1:
            achievements.append({
                'icon': '🗡️', 'title': 'Hard Hitter',
                'description': f'Solved {difficulty_counts["Hard"]} hard problem(s)',
                'earned': True, 'type': 'difficulty',
            })

        return Response({
            'student': {
                'register_number': student.register_number,
                'name': student.name,
                'batch': student.batch,
                'department': student.department.code if student.department else None,
                'department_name': student.department.name if student.department else None,
                'current_streak': student.current_streak,
                'login_days': getattr(student, 'login_days', 0),
                'last_active': student.last_login_on.isoformat() if student.last_login_on else None,
                'is_active': student.account.is_active if student.account else True,
            },
            'analytics': {
                'total_solved': total_solved,
                'difficulty_breakdown': difficulty_counts,
                'problems_by_difficulty': difficulty_problems,
                'recent_submissions': submissions_data,
                'contests_participated': len(participated_contests),
                'contests_won': contests_won,
                'participated_contests': participated_contests,
            },
            'achievements': achievements,
        })


class StudentBlockToggleView(APIView):
    """HOD/Staff can block or unblock students in their department."""
    permission_classes = [IsAuthenticated]

    def post(self, request, register_number):
        """Toggle student account active status (block/unblock)."""
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        # Get target student
        student = StudentProfile.objects.filter(
            register_number=register_number
        ).select_related('account', 'department', 'institution').first()
        if not student:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Can only manage students in same institution
        if student.institution_id != staff_profile.institution_id:
            return Response(
                {"detail": "You can only manage students in your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # HOD can only block students in their own department
        if student.department_id != staff_profile.department_id:
            return Response(
                {"detail": "You can only block students in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not student.account:
            return Response(
                {"detail": "Student has no associated account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Toggle is_active on the auth user account
        student.account.is_active = not student.account.is_active
        student.account.save(update_fields=['is_active'])
        is_active = student.account.is_active

        logger.info(
            "Student %s %s by staff %s",
            student.register_number,
            'unblocked' if is_active else 'blocked',
            staff_profile.faculty_id,
        )

        return Response({
            "detail": f"Student {student.name} has been {'unblocked' if is_active else 'blocked'}.",
            "register_number": student.register_number,
            "is_active": is_active,
        })


# =============================================================================
# Batch Management & Student Assignment Views
# =============================================================================

class BatchListView(APIView):
    """Get all batches in staff's department with student counts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        if not staff_profile.department:
            return Response({"batches": []})

        # Get distinct batches with student counts
        batches = StudentProfile.objects.filter(
            institution=staff_profile.institution,
            department=staff_profile.department,
            batch__isnull=False
        ).exclude(batch='').values('batch').annotate(
            student_count=Count('id')
        ).order_by('-batch')

        return Response({"batches": list(batches)})


class BatchStudentsView(APIView):
    """Get all students in a specific batch."""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_code):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        students = StudentProfile.objects.filter(
            institution=staff_profile.institution,
            department=staff_profile.department,
            batch=batch_code
        ).annotate(
            solved_count=Count('solved_problems', distinct=True)
        ).order_by('register_number')

        data = []
        for student in students:
            data.append({
                "id": student.id,
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
                "last_active": student.last_login_on.isoformat() if student.last_login_on else None,
            })

        return Response({
            "batch": batch_code,
            "students": data,
            "total": len(data)
        })


class ContestBatchAssignView(APIView):
    """Assign batches to a contest."""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        contest = Contest.objects.filter(id=contest_id).first()
        if not contest:
            return Response(
                {"detail": "Contest not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if staff owns this contest
        if contest.created_by != staff_profile:
            return Response(
                {"detail": "You can only assign batches to your own contests."},
                status=status.HTTP_403_FORBIDDEN
            )

        batches = request.data.get('batches', [])
        if not isinstance(batches, list):
            return Response(
                {"detail": "Batches must be a list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        contest.assigned_batches = batches
        contest.save(update_fields=['assigned_batches'])

        # Also assign students from these batches
        students = StudentProfile.objects.filter(
            institution=staff_profile.institution,
            department=staff_profile.department,
            batch__in=batches
        )
        contest.assigned_students.set(students)

        return Response({
            "detail": "Batches assigned successfully.",
            "contest_id": contest.id,
            "assigned_batches": contest.assigned_batches,
            "assigned_student_count": contest.assigned_students.count(),
        })


class StudentIndividualAnalyticsView(APIView):
    """Get detailed analytics for an individual student."""
    permission_classes = [IsAuthenticated]

    def get(self, request, register_number):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_profile = request.user.staff_profile

        student = StudentProfile.objects.filter(
            register_number=register_number
        ).select_related('department', 'institution').first()

        if not student:
            return Response(
                {"detail": "Student not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check access
        if student.institution != staff_profile.institution:
            return Response(
                {"detail": "You can only view students in your institution."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Get solved problems breakdown by difficulty
        solved_problems = SolvedProblem.objects.filter(
            student=student
        ).select_related('problem')

        difficulty_breakdown = {"Easy": 0, "Medium": 0, "Hard": 0}
        for sp in solved_problems:
            difficulty_breakdown[sp.problem.difficulty] = difficulty_breakdown.get(sp.problem.difficulty, 0) + 1

        # Get recent activity (last 30 days)
        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_activity = []
        
        recent_solutions = ProblemSolution.objects.filter(
            student=student,
            submitted_at__gte=thirty_days_ago
        ).select_related('problem').order_by('-submitted_at')[:20]

        for solution in recent_solutions:
            recent_activity.append({
                "date": solution.submitted_at.isoformat(),
                "problem": solution.problem.title,
                "problem_slug": solution.problem.slug,
                "difficulty": solution.problem.difficulty,
                "status": solution.status,
                "language": solution.language,
            })

        # Calculate total time spent
        total_time_spent = ProblemSession.objects.filter(
            student=student,
            is_active=False
        ).aggregate(total=Sum('time_spent_seconds'))['total'] or 0

        # Get contest participation
        contest_participations = ContestSubmission.objects.filter(
            student=student
        ).values('contest__title', 'contest__id').annotate(
            submissions=Count('id'),
            solved=Count('id', filter=Q(status='Accepted'))
        ).order_by('-contest__id')[:10]

        return Response({
            "student": {
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "department": student.department.name if student.department else None,
                "current_streak": student.current_streak,
                "login_days": student.login_days,
                "campus_rank": student.campus_rank,
            },
            "analytics": {
                "solved_count": solved_problems.count(),
                "difficulty_breakdown": difficulty_breakdown,
                "recent_activity": recent_activity,
                "time_spent_total": total_time_spent,
                "time_spent_hours": round(total_time_spent / 3600, 2),
                "contest_participations": list(contest_participations),
            }
        })


class ContestApprovalView(APIView):
    """HOD can approve or reject contests"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile
        
        # Only HOD can approve contests
        if profile.role != "hod":
            return Response(
                {"detail": "Only HOD can approve contests."},
                status=status.HTTP_403_FORBIDDEN
            )

        contest = Contest.objects.filter(id=contest_id).first()
        if not contest:
            return Response(
                {"detail": "Contest not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if contest is in the HOD's department
        if contest.department != profile.department:
            return Response(
                {"detail": "You can only approve contests in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        action = request.data.get('action')  # 'approve' or 'reject'
        
        if action == 'approve':
            contest.approve(profile)
            return Response({
                "detail": "Contest approved successfully.",
                "contest_id": contest.id,
                "status": contest.status,
            })
        elif action == 'reject':
            reason = request.data.get('reason', '')
            contest.reject(reason)
            return Response({
                "detail": "Contest rejected.",
                "contest_id": contest.id,
                "status": contest.status,
                "reason": reason,
            })
        else:
            return Response(
                {"detail": "Invalid action. Use 'approve' or 'reject'."},
                status=status.HTTP_400_BAD_REQUEST
            )


class ContestPublishView(APIView):
    """Publish approved contest to students"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile

        contest = Contest.objects.filter(id=contest_id).first()
        if not contest:
            return Response(
                {"detail": "Contest not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check permissions - HOD or contest creator can publish
        if profile.role == "hod" and contest.department != profile.department:
            return Response(
                {"detail": "You can only publish contests in your department."},
                status=status.HTTP_403_FORBIDDEN
            )
        
        if profile.role == "staff" and contest.created_by != profile:
            return Response(
                {"detail": "You can only publish your own contests."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only publish approved contests
        if contest.status != "approved":
            return Response(
                {"detail": "Only approved contests can be published."},
                status=status.HTTP_400_BAD_REQUEST
            )

        contest.publish()
        
        return Response({
            "detail": "Contest published successfully.",
            "contest_id": contest.id,
            "status": contest.status,
        })


class DepartmentStudentsFilterView(APIView):
    """Get students in department with filtering options"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile

        # Base query - students in staff's department
        students = StudentProfile.objects.filter(
            institution=profile.institution,
            department=profile.department
        ).select_related('department')

        # Apply filters
        batch = request.query_params.get('batch')
        search = request.query_params.get('search')
        
        if batch:
            students = students.filter(batch=batch)
        
        if search:
            students = students.filter(
                Q(name__icontains=search) | 
                Q(register_number__icontains=search)
            )

        # Annotate with solved count
        students = students.annotate(
            solved_count=Count('solved_problems', distinct=True)
        ).order_by('register_number')

        # Limit results
        limit = int(request.query_params.get('limit', 100))
        students = students[:limit]

        data = []
        for student in students:
            data.append({
                "id": student.id,
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
            })

        return Response({
            "students": data,
            "total": len(data),
        })


class ContestSubmitForApprovalView(APIView):
    """Staff can submit their draft contest for HOD approval"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile

        contest = Contest.objects.filter(id=contest_id).first()
        if not contest:
            return Response(
                {"detail": "Contest not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Only contest creator can submit for approval
        if contest.created_by != profile:
            return Response(
                {"detail": "You can only submit your own contests for approval."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Can only submit draft or rejected contests
        if contest.status not in ["draft", "rejected"]:
            return Response(
                {"detail": f"Cannot submit contest with status '{contest.status}' for approval."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate contest has required fields
        if not contest.problems.exists():
            return Response(
                {"detail": "Contest must have at least one problem."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not contest.assigned_students.exists() and not contest.assigned_batches:
            return Response(
                {"detail": "Contest must have assigned students or batches."},
                status=status.HTTP_400_BAD_REQUEST
            )

        contest.submit_for_approval()

        return Response({
            "detail": "Contest submitted for approval successfully.",
            "contest_id": contest.id,
            "status": contest.status,
        })


# =============================================================================
# Student Contest Views
# =============================================================================

class StudentContestListView(APIView):
    """Get contests assigned to the student"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        # Get contests where student is assigned and status is published
        contests = Contest.objects.filter(
            assigned_students=student,
            status='published'
        ).select_related('created_by', 'department').prefetch_related('problems')

        data = []
        for contest in contests:
            # Check if student has started this contest
            participation = ContestParticipation.objects.filter(
                contest=contest,
                student=student
            ).first()

            # Auto-end participation if time has expired
            if participation and participation.is_active:
                time_elapsed = timezone.now() - participation.started_at
                max_duration = timedelta(minutes=contest.duration_minutes)
                
                if time_elapsed > max_duration:
                    participation.end_participation()
                    # Refresh participation object
                    participation.refresh_from_db()

            # Check if contest is currently active
            now = timezone.now()
            is_active = False
            is_upcoming = False
            is_ended = False
            
            if contest.start_time and contest.end_time:
                if now < contest.start_time:
                    is_upcoming = True
                elif contest.start_time <= now <= contest.end_time:
                    is_active = True
                else:
                    is_ended = True

            data.append({
                "id": contest.id,
                "title": contest.title,
                "description": contest.description,
                "start_time": contest.start_time,
                "end_time": contest.end_time,
                "duration_minutes": contest.duration_minutes,
                "problem_count": contest.problems.count(),
                "is_active": is_active,
                "is_upcoming": is_upcoming,
                "is_ended": is_ended,
                "has_started": participation is not None if participation else False,
                "participation": {
                    "started_at": participation.started_at,
                    "problems_solved": participation.problems_solved,
                    "total_score": participation.total_score,
                    "is_active": participation.is_active,
                } if participation else None,
            })

        return Response({"contests": data})


class StudentContestDetailView(APIView):
    """Get contest details for student"""
    permission_classes = [IsAuthenticated]

    def get(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        contest = Contest.objects.filter(
            id=contest_id,
            assigned_students=student,
            status='published'
        ).select_related('created_by', 'department').prefetch_related('problems').first()

        if not contest:
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check participation
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=student
        ).first()

        # Auto-end participation if time has expired
        if participation and participation.is_active:
            time_elapsed = timezone.now() - participation.started_at
            max_duration = timedelta(minutes=contest.duration_minutes)
            
            if time_elapsed > max_duration:
                participation.end_participation()
                # Refresh participation object
                participation.refresh_from_db()

        # Prevent access if participation has ended (one attempt only)
        if participation and not participation.is_active:
            return Response(
                {"detail": "You have already completed this contest. Each contest can only be attempted once."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Check if contest is active
        now = timezone.now()
        is_active = False
        is_ended = False
        
        if contest.start_time and contest.end_time:
            if contest.start_time <= now <= contest.end_time:
                is_active = True
            elif now > contest.end_time:
                is_ended = True

        # Get problems with submission status
        problems_data = []
        for problem in contest.problems.all():
            # Check if student has solved this problem in the contest
            submission = ContestSubmission.objects.filter(
                contest=contest,
                student=student,
                problem=problem,
                status='Accepted'
            ).first()

            problems_data.append({
                "id": problem.id,
                "slug": problem.slug,
                "title": problem.title,
                "difficulty": problem.difficulty,
                "tags": problem.tags,
                "is_solved": submission is not None,
            })

        return Response({
            "id": contest.id,
            "title": contest.title,
            "description": contest.description,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "duration_minutes": contest.duration_minutes,
            "is_active": is_active,
            "is_ended": is_ended,
            "has_started": participation is not None,
            "problems": problems_data,
            "participation": {
                "started_at": participation.started_at,
                "problems_solved": participation.problems_solved,
                "total_score": participation.total_score,
                "time_spent_seconds": participation.time_spent_seconds,
            } if participation else None,
        })


class StudentContestStartView(APIView):
    """Start a contest (creates participation record)"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        contest = Contest.objects.filter(
            id=contest_id,
            assigned_students=student,
            status='published'
        ).first()

        if not contest:
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if contest is active
        now = timezone.now()
        if contest.start_time and contest.end_time:
            if now < contest.start_time:
                return Response(
                    {"detail": "Contest has not started yet."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if now > contest.end_time:
                return Response(
                    {"detail": "Contest has ended."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Check if already started
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=student
        ).first()

        if participation:
            return Response(
                {"detail": "You have already started this contest."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create participation
        participation = ContestParticipation.objects.create(
            contest=contest,
            student=student
        )

        return Response({
            "detail": "Contest started successfully.",
            "participation": {
                "started_at": participation.started_at,
                "contest_id": contest.id,
            }
        })


class StudentContestAutoSubmitView(APIView):
    """Auto-submit contest when time expires"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        # Get participation
        participation = ContestParticipation.objects.filter(
            contest_id=contest_id,
            student=student,
            is_active=True
        ).first()

        if not participation:
            return Response(
                {"detail": "No active participation found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # End the participation
        participation.ended_at = timezone.now()
        participation.is_active = False
        
        # Calculate time spent
        duration = participation.ended_at - participation.started_at
        participation.time_spent_seconds = int(duration.total_seconds())
        
        # Calculate final score and problems solved
        submissions = ContestSubmission.objects.filter(
            contest_id=contest_id,
            student=student
        )
        
        participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
        participation.problems_solved = submissions.filter(status='Accepted').values('problem').distinct().count()
        
        participation.save()

        return Response({
            "detail": "Contest auto-submitted successfully.",
            "participation": {
                "ended_at": participation.ended_at,
                "time_spent_seconds": participation.time_spent_seconds,
                "total_score": participation.total_score,
                "problems_solved": participation.problems_solved,
            }
        })


class StudentContestProblemView(APIView):
    """Get problem details within a contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request, contest_id, problem_slug):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        contest = Contest.objects.filter(
            id=contest_id,
            assigned_students=student,
            status='published'
        ).first()

        if not contest:
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if student has started the contest
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=student
        ).first()

        if not participation:
            return Response(
                {"detail": "You must start the contest first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if contest has ended
        now = timezone.now()
        if contest.end_time and now > contest.end_time:
            return Response(
                {"detail": "Contest has ended."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get problem
        problem = contest.problems.filter(slug=problem_slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found in this contest."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get student's submissions for this problem in this contest
        submissions = ContestSubmission.objects.filter(
            contest=contest,
            student=student,
            problem=problem
        ).order_by('-submitted_at')[:10]

        submissions_data = []
        for sub in submissions:
            submissions_data.append({
                "id": sub.id,
                "status": sub.status,
                "language": sub.language,
                "submitted_at": sub.submitted_at,
                "score": sub.score,
            })

        return Response({
            "id": problem.id,
            "slug": problem.slug,
            "title": problem.title,
            "description": problem.description,
            "difficulty": problem.difficulty,
            "tags": problem.tags,
            "examples": problem.examples,
            "hints": problem.hints,
            "submissions": submissions_data,
        })


class StudentContestSubmitView(APIView):
    """Submit code for a problem in a contest"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id, problem_slug):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        contest = Contest.objects.filter(
            id=contest_id,
            assigned_students=student,
            status='published'
        ).first()

        if not contest:
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if student has started the contest
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=student
        ).first()

        if not participation:
            return Response(
                {"detail": "You must start the contest first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if contest has ended
        now = timezone.now()
        if contest.end_time and now > contest.end_time:
            # End participation if still active
            if participation.is_active:
                participation.end_participation()
            
            return Response(
                {"detail": "Contest has ended. No more submissions allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get problem
        problem = contest.problems.filter(slug=problem_slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found in this contest."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get submission data
        source_code = request.data.get('source_code')
        language = request.data.get('language')
        language_id = request.data.get('language_id')

        if not source_code or not language_id:
            return Response(
                {"detail": "source_code and language_id are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Execute code using Judge0 (similar to regular problem submission)
        try:
            # Get test cases for the problem
            test_cases = problem.test_cases.all()
            
            if not test_cases.exists():
                return Response(
                    {"detail": "No test cases available for this problem."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Run against test cases
            passed_cases = 0
            total_cases = test_cases.count()
            
            for test_case in test_cases:
                result = execute_judge0_submission(
                    source_code=source_code,
                    language_id=language_id,
                    stdin=test_case.stdin,
                    expected_output=test_case.expected_output
                )
                
                if result.get('status') == 'Accepted':
                    passed_cases += 1

            # Determine status
            status_str = 'Accepted' if passed_cases == total_cases else 'Wrong Answer'
            score = (passed_cases / total_cases) * 100 if total_cases > 0 else 0

            # Create contest submission
            submission = ContestSubmission.objects.create(
                contest=contest,
                student=student,
                problem=problem,
                code=source_code,
                language=language or 'Unknown',
                status=status_str,
                score=int(score),
            )

            # Update participation if problem is solved
            if status_str == 'Accepted':
                # Check if this is the first time solving this problem
                previous_accepted = ContestSubmission.objects.filter(
                    contest=contest,
                    student=student,
                    problem=problem,
                    status='Accepted'
                ).exclude(id=submission.id).exists()

                if not previous_accepted:
                    participation.problems_solved += 1
                    participation.total_score += int(score)
                    participation.save(update_fields=['problems_solved', 'total_score'])

            return Response({
                "detail": "Code submitted successfully.",
                "submission": {
                    "id": submission.id,
                    "status": submission.status,
                    "score": submission.score,
                    "passed_cases": passed_cases,
                    "total_cases": total_cases,
                },
            })

        except Exception as e:
            logger.error(f"Contest submission error: {e}")
            return Response(
                {"detail": f"Submission failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ProblemsByTopicView(APIView):
    """Get all problems grouped by topics/tags"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Get all problems
        problems = Problem.objects.all()

        # Group by tags
        topics = {}
        for problem in problems:
            for tag in problem.tags or []:
                if tag not in topics:
                    topics[tag] = []
                topics[tag].append({
                    "id": problem.id,
                    "slug": problem.slug,
                    "title": problem.title,
                    "difficulty": problem.difficulty,
                })

        # Convert to list format
        topics_list = [
            {"topic": topic, "problems": probs, "count": len(probs)}
            for topic, probs in sorted(topics.items())
        ]

        return Response({
            "topics": topics_list,
            "total_problems": problems.count(),
        })
