import logging
from collections import defaultdict
from datetime import timedelta

from io import BytesIO
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum, Avg, Max, Max
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
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
    DailyProblem,
    Announcement,
    Notification,
    AptitudeTopic,
    AptitudeQuestion,
    Achievement,
    UserAchievement,
    SystemConfiguration,
    Department,
    SolvedAptitude,
    AptitudeContestSubmission,
)
from .db_manager import create_institution_db, delete_institution_db
from .serializers import (
    CodeRunSerializer,
    DiscussionMessageCreateSerializer,
    DiscussionMessageSerializer,
    FirstLoginSerializer,
    ProblemDetailSerializer,
    ProblemProgressUpdateSerializer,
    ProblemSerializer,
    StaffProfileSerializer,
    StudentLoginSerializer,
    StudentLookupListSerializer,
    StudentProfileSerializer,
)
from .services.executor import (
    ExecutorServiceError,
    ExecutorTimeoutError,
    execute_submission as execute_judge0_submission,
)
from .services.execution_adapter import (
    normalize_comparable_output,
    prepare_execution_payload,
)
from .services.problem_testcases import build_runtime_test_cases
from .services.complexity_analyzer import calculate_complexity
from .services.code_validator import validate_submission

# ReportLab imports for PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate
from reportlab.platypus.frames import Frame
from reportlab.lib.utils import ImageReader
import requests
from PIL import Image as PILImage
import io

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PDF Watermark Utility
# ---------------------------------------------------------------------------

class WatermarkDocTemplate(BaseDocTemplate):
    """Custom document template that adds watermark to all pages"""
    
    def __init__(self, filename, institution=None, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        self.institution = institution
        self.watermark_image = None
        
        # Try to get watermark image
        if institution and institution.logo_display_url:
            try:
                self.watermark_image = self._get_watermark_image(institution.logo_display_url)
            except Exception as e:
                logger.warning(f"Failed to load watermark image: {e}")
        
        # Add page template with frame
        frame = Frame(
            self.leftMargin, self.bottomMargin, 
            self.width, self.height, 
            id='normal'
        )
        template = PageTemplate(id='main', frames=frame, onPage=self._add_watermark)
        self.addPageTemplates([template])
    
    def _get_watermark_image(self, logo_url):
        """Download and prepare watermark image"""
        try:
            if logo_url.startswith('http'):
                # Download from URL
                response = requests.get(logo_url, timeout=10)
                response.raise_for_status()
                image_data = response.content
            else:
                # Local file path
                with open(logo_url, 'rb') as f:
                    image_data = f.read()
            
            # Process image with PIL
            pil_image = PILImage.open(io.BytesIO(image_data))
            
            # Convert to RGBA if needed
            if pil_image.mode != 'RGBA':
                pil_image = pil_image.convert('RGBA')
            
            # Make it semi-transparent for watermark effect
            alpha = pil_image.split()[-1]
            alpha = alpha.point(lambda p: p * 0.15)  # 15% opacity
            pil_image.putalpha(alpha)
            
            # Convert back to bytes
            output = io.BytesIO()
            pil_image.save(output, format='PNG')
            output.seek(0)
            
            return ImageReader(output)
        except Exception as e:
            logger.error(f"Error processing watermark image: {e}")
            return None
    
    def _add_watermark(self, canvas, doc):
        """Add watermark to each page"""
        if not self.watermark_image:
            return
        
        try:
            # Calculate watermark position (center of page)
            page_width, page_height = A4
            watermark_size = min(page_width, page_height) * 0.4  # 40% of page size
            
            x = (page_width - watermark_size) / 2
            y = (page_height - watermark_size) / 2
            
            # Draw watermark
            canvas.drawImage(
                self.watermark_image, 
                x, y, 
                width=watermark_size, 
                height=watermark_size,
                mask='auto'
            )
        except Exception as e:
            logger.error(f"Error adding watermark: {e}")


def create_watermarked_pdf(buffer, institution=None, **kwargs):
    """Create a PDF document with watermark support"""
    if institution and institution.logo_display_url:
        return WatermarkDocTemplate(buffer, institution=institution, **kwargs)
    else:
        return SimpleDocTemplate(buffer, **kwargs)


# ---------------------------------------------------------------------------
# Helper builders (pure functions — no HTTP side-effects)
# ---------------------------------------------------------------------------

def build_activity_calendar(profile):
    """
    Build a monthly activity calendar for the current month.
    Returns activity data for the entire current month plus padding days
    to fill the calendar grid (previous/next month days).
    """
    today = timezone.localdate()
    
    # Get the first and last day of the current month
    month_start = today.replace(day=1)
    if today.month == 12:
        month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
    else:
        month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
    
    # Calculate padding days to fill the calendar grid
    # Start from the Sunday before the first day of the month
    start_weekday = month_start.weekday()  # Monday=0, Sunday=6
    # Adjust to make Sunday=0
    start_offset = (start_weekday + 1) % 7
    calendar_start = month_start - timedelta(days=start_offset)
    
    # End on the Saturday after the last day of the month
    end_weekday = month_end.weekday()  # Monday=0, Sunday=6
    # Calculate days to add to reach Saturday (weekday=5)
    # If month ends on Saturday (5), add 0 days
    # If month ends on Sunday (6), add 6 days
    # If month ends on Monday (0), add 5 days, etc.
    end_offset = (5 - end_weekday) % 7
    calendar_end = month_end + timedelta(days=end_offset)
    
    # Fetch activity data for the entire range (including padding days)
    activity_rows = (
        StudentActivity.objects.filter(
            student=profile,
            activity_date__gte=calendar_start,
            activity_date__lte=calendar_end
        )
        .values("activity_date")
        .annotate(total=Count("id"))
        .order_by("activity_date")
    )

    daily_totals = {row["activity_date"]: row["total"] for row in activity_rows}

    # If no activity data exists but user has a streak, infer recent activity
    if not daily_totals and profile.last_login_on:
        inferred_days = min(max(profile.current_streak, 1), 30)
        for offset in range(inferred_days):
            inferred_day = profile.last_login_on - timedelta(days=offset)
            if calendar_start <= inferred_day <= calendar_end:
                daily_totals[inferred_day] = 1

    # Build the calendar array
    calendar = []
    current_day = calendar_start
    while current_day <= calendar_end:
        count = daily_totals.get(current_day, 0)
        calendar.append(
            {
                "date": current_day.isoformat(),
                "count": count,
                "weekday": current_day.strftime("%a"),
                "day": current_day.day,
            }
        )
        current_day += timedelta(days=1)
    
    return calendar


def build_student_stats(profile):
    # Count solved problems from SolvedProblem table (faster than scanning all solutions)
    solved_problems = Problem.objects.filter(
        solved_by__student=profile
    ).distinct()

    return solved_problems.aggregate(
        easy=Count("id", filter=Q(difficulty="Easy"), distinct=True),
        medium=Count("id", filter=Q(difficulty="Medium"), distinct=True),
        hard=Count("id", filter=Q(difficulty="Hard"), distinct=True), sql=Count("id", filter=Q(tags__contains="SQL"), distinct=True),
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


def build_topic_stats(profile):
    """Return count of problems solved by topic"""
    solutions = profile.solutions.filter(all_tests_passed=True).select_related("problem")
    topic_stats = {}
    solved_problems = set()
    for solution in solutions:
        if solution.problem_id not in solved_problems:
            tags = solution.problem.tags
            if isinstance(tags, list):
                for tag in tags:
                    topic_stats[tag] = topic_stats.get(tag, 0) + 1
            solved_problems.add(solution.problem_id)
    
    # Return top topics
    sorted_topics = sorted(topic_stats.items(), key=lambda x: x[1], reverse=True)
    return [{"name": name, "count": count} for name, count in sorted_topics[:6]]


def build_aptitude_stats(profile):
    """Calculate solved vs total questions for top-level aptitude categories"""
    categories = AptitudeTopic.objects.filter(parent=None)
    stats = []
    
    for cat in categories:
        # Get all related topic IDs (parent + 2 levels of subtopics)
        sub_ids = list(cat.subtopics.values_list('id', flat=True))
        sub_sub_ids = list(AptitudeTopic.objects.filter(parent_id__in=sub_ids).values_list('id', flat=True))
        all_ids = [cat.id] + sub_ids + sub_sub_ids
        
        total = AptitudeQuestion.objects.filter(topic_id__in=all_ids).count()
        solved = SolvedAptitude.objects.filter(student=profile, question__topic_id__in=all_ids).count()
        
        stats.append({
            "name": cat.title,
            "solved": solved,
            "total": total,
            "percentage": round((solved / total * 100), 1) if total > 0 else 0
        })
    return stats

def calculate_campus_rank_helper(student):
    """Dynamically calculate the campus-wide rank of a student."""
    from .models import StudentProfile, SolvedAptitude, ContestParticipation
    
    coding_solved = student.solved_problems.count()
    aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
    contests_attended = ContestParticipation.objects.filter(student=student).count()
    
    better_students = StudentProfile.objects.filter(
        institution=student.institution
    ).annotate(
        c_solved=Count('solutions', filter=Q(solutions__all_tests_passed=True), distinct=True),
        c_attended=Count('contest_participations', distinct=True),
        a_solved=Count('solved_aptitude', distinct=True)
    ).filter(
        Q(c_solved__gt=coding_solved) |
        Q(c_solved=coding_solved, c_attended__gt=contests_attended) |
        Q(c_solved=coding_solved, c_attended=contests_attended, a_solved__gt=aptitude_solved) |
        Q(c_solved=coding_solved, c_attended=contests_attended, a_solved=aptitude_solved, current_streak__gt=student.current_streak)
    ).count()
    
    return better_students + 1





def get_discussion_messages(user, profile, profile_type, thread_type="general", other_user_reg=None, batch_name=None, problem_slug=None):
    """
    Fetch and cleanup messages based on access rules.
    Messages older than 24h are deleted on every request for this view.
    """
    cutoff = timezone.now() - timedelta(hours=24)
    DiscussionMessage.objects.filter(created_at__lt=cutoff).delete()

    qs = DiscussionMessage.objects.filter(created_at__gte=cutoff).select_related(
        "sender", "recipient", "student", "problem",
        "sender__student_profile", "sender__staff_profile",
        "recipient__student_profile", "recipient__staff_profile"
    )

    # 3. Filter by Thread Type
    if thread_type == "general":
        if profile_type == "student":
            # For students, General = Their Batch Room
            return qs.filter(thread_type="general", batch_name=profile.batch)
        elif profile_type in ["staff", "hod", "ja", "tpu"]:
            # Staff/HOD see messages for the batch they requested
            if not batch_name:
                return qs.none() 
            return qs.filter(thread_type="general", batch_name=batch_name)
        return qs.none()
    
    if thread_type == "individual" and other_user_reg:
        # We filter the messages directly by matching the identifier against sender/recipient profile fields.
        # This handles collisions where a register number might match a username or faculty ID of a different user.
        return qs.filter(thread_type="individual").filter(
            (Q(sender=user) & (
                Q(recipient__student_profile__register_number__iexact=other_user_reg) |
                Q(recipient__staff_profile__faculty_id__iexact=other_user_reg) |
                Q(recipient__username=other_user_reg)
            )) |
            (Q(recipient=user) & (
                Q(sender__student_profile__register_number__iexact=other_user_reg) |
                Q(sender__staff_profile__faculty_id__iexact=other_user_reg) |
                Q(sender__username=other_user_reg)
            ))
        )

    if thread_type == "batch" and batch_name:
        return qs.filter(thread_type="batch", batch_name=batch_name)

    if thread_type == "staff":
        if profile_type in ["staff", "hod"] and profile.department:
            return qs.filter(thread_type="staff", department=profile.department)
        elif profile_type in ["admin", "ja", "tpu"]:
            return qs.filter(thread_type="staff", institution=profile.institution)
        return qs.none()

    if thread_type == "hod_tp_ja":
        if profile:
            return qs.filter(thread_type="hod_tp_ja", institution=profile.institution)
        return qs.none()

    if thread_type == "problem" and problem_slug:
        return qs.filter(thread_type="problem", problem__slug=problem_slug)

    return qs.none()

    return qs.none()


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
        "stdout": output,
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
        
        # Handle staff/hod/admin/director/tpu/ja users differently
        if profile_type in ["staff", "hod", "admin", "director", "tpu", "ja"]:
            # Get profile details
            profile_obj = profile if profile else None
            user_department = getattr(profile_obj, 'department', None) if profile_obj else None
            
            # Filter by institution for multi-tenant support
            inst = getattr(profile_obj, 'institution', None)
            
            # Filter student count by department for HOD, all for admin/staff within institution
            if profile_type == "hod" and user_department:
                students_qs = StudentProfile.objects.filter(department=user_department, institution=inst)
                student_count = students_qs.count()
                dept_contests = Contest.objects.filter(department=user_department, institution=inst)
                contest_count = dept_contests.count()
                pending_approvals = dept_contests.filter(status='pending_approval').count()
                
                # Department Weekly Activity (Total solved problems)
                seven_days_ago = (timezone.now() - timedelta(days=7)).date()
                activity_qs = SolvedProblem.objects.filter(
                    student__department=user_department,
                    student__institution=inst,
                    solved_at__date__gte=seven_days_ago
                ).values('solved_at__date').annotate(count=Count('id'))
                
                day_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
                activity_dict = {day: 0 for day in day_map.values()}
                for item in activity_qs:
                    day_name = day_map.get(item['solved_at__date'].weekday())
                    if day_name:
                        activity_dict[day_name] += item['count']
                
                weekly_activity = [{"day": day, "count": activity_dict[day]} for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]]
            else:
                student_count = StudentProfile.objects.filter(institution=inst).count() if inst else StudentProfile.objects.count()
                contest_count = Contest.objects.filter(institution=inst).count() if inst else Contest.objects.count()
                pending_approvals = Contest.objects.filter(status='pending_approval', institution=inst).count() if profile_type in ["admin", "director", "tpu", "ja"] and inst else 0
                
                # Institution Weekly Activity (Total solved problems)
                seven_days_ago = (timezone.now() - timedelta(days=7)).date()
                activity_filter = Q(solved_at__date__gte=seven_days_ago)
                if inst:
                    activity_filter &= Q(student__institution=inst)
                
                activity_qs = SolvedProblem.objects.filter(activity_filter).values('solved_at__date').annotate(count=Count('id'))
                
                day_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
                activity_dict = {day: 0 for day in day_map.values()}
                for item in activity_qs:
                    day_name = day_map.get(item['solved_at__date'].weekday())
                    if day_name:
                        activity_dict[day_name] += item['count']
                
                weekly_activity = [{"day": day, "count": activity_dict[day]} for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]]

            # Common analytics for HOD and staff dashboards
            recent_activity = []
            engagement_summary = {"active_today": 0, "avg_solved": 0, "participation_rate": 0}
            
            if user_department:
                # Recent Activity (Last 10 solved problems in department)
                recent_solved = SolvedProblem.objects.filter(
                    student__department=user_department
                ).select_related('student', 'problem').order_by('-solved_at')[:10]
                
                for solved in recent_solved:
                    recent_activity.append({
                        "student_name": solved.student.name,
                        "student_id": solved.student.register_number,
                        "problem_title": solved.problem.title,
                        "solved_at": solved.solved_at.isoformat(),
                    })
                
                # Engagement Summary
                today = timezone.now().date()
                active_today = StudentProfile.objects.filter(department=user_department, last_login_on=today).count()
                total_students = StudentProfile.objects.filter(department=user_department).count()
                
                if total_students > 0:
                    total_solved_count = SolvedProblem.objects.filter(student__department=user_department).count()
                    avg_solved = round(total_solved_count / total_students, 1)
                    engagement_summary = {
                        "active_today": active_today,
                        "avg_solved": avg_solved,
                        "participation_rate": round((active_today / total_students * 100), 1)
                    }
            elif inst:
                # Institutional Recent Activity
                recent_solved = SolvedProblem.objects.filter(
                    student__institution=inst
                ).select_related('student', 'problem').order_by('-solved_at')[:10]
                
                for solved in recent_solved:
                    recent_activity.append({
                        "student_name": solved.student.name,
                        "student_id": solved.student.register_number,
                        "problem_title": solved.problem.title,
                        "solved_at": solved.solved_at.isoformat(),
                    })
                
                # Institutional Engagement Summary
                today = timezone.now().date()
                active_today = StudentProfile.objects.filter(institution=inst, last_login_on=today).count()
                total_students = StudentProfile.objects.filter(institution=inst).count()
                
                if total_students > 0:
                    total_solved_count = SolvedProblem.objects.filter(student__institution=inst).count()
                    avg_solved = round(total_solved_count / total_students, 1)
                    engagement_summary = {
                        "active_today": active_today,
                        "avg_solved": avg_solved,
                        "participation_rate": round((active_today / total_students * 100), 1)
                    }
            
            # Get list of departments for institutional roles
            depts_list = []
            if profile_type in ["admin", "director", "tpu", "ja"]:
                depts_qs = Department.objects.filter(institution=inst) if inst else Department.objects.all()
                for d in depts_qs:
                    depts_list.append({
                        "id": d.id,
                        "name": d.name,
                        "code": d.code
                    })

            # Staff/HOD/Admin get simplified dashboard without student-specific stats
            user_payload = {
                "name": profile.name if profile else request.user.first_name,
                "title": (
                    "Administrator" if profile_type == "admin" else 
                    "Director" if profile_type == "director" else 
                    "TPU Coordinator" if profile_type == "tpu" else 
                    "Junior Admin" if profile_type == "ja" else
                    "HOD" if profile_type == "hod" else "Staff"
                ),
                "streak": 0,
                "loginDays": 0,
                "rank": 1,
                "totalStudents": student_count,
                "totalContests": contest_count,
                "pendingApprovals": pending_approvals,
                "registerNumber": profile.faculty_id if profile else request.user.username,
                "facultyId": profile.faculty_id if profile else request.user.username,
                "email": "",
                "role": profile.role if profile else "admin",
                "department": {
                    "name": user_department.name if user_department else None,
                    "code": user_department.code if user_department else None,
                } if user_department else None,
                "departments": depts_list
            }
            
            stats = {"easy": 0, "medium": 0, "hard": 0}
            activity_calendar = []
            
            daily_problem = problems.filter(is_daily=True).first() or problems.first()
            
            # For HOD and Institutional roles, include top performers
            leaderboard = []
            if profile_type == "hod" and user_department:
                top_students = students_qs.annotate(
                    solved=Count('solved_problems', distinct=True)
                ).order_by('-solved')[:10]
                for s in top_students:
                    leaderboard.append({
                        "id": s.register_number,
                        "name": s.name,
                        "score": s.solved,
                        "rank": 0
                    })
            elif profile_type in ["admin", "director", "tpu", "ja"] and inst:
                top_students = StudentProfile.objects.filter(institution=inst).annotate(
                    solved=Count('solved_problems', distinct=True)
                ).order_by('-solved')[:10]
                for s in top_students:
                    leaderboard.append({
                        "id": s.register_number,
                        "name": s.name,
                        "score": s.solved,
                        "rank": 0
                    })
            
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
                "consistencyLabel": "Department Activity",
                "tracks": FALLBACK_DASHBOARD["tracks"],
                "leaderboard": leaderboard if leaderboard else FALLBACK_DASHBOARD["leaderboard"],
                "editor": FALLBACK_DASHBOARD["editor"],
                "recentActivity": recent_activity,
                "engagementSummary": engagement_summary,
                "staff": StaffProfileSerializer(profile).data if profile and profile_type in ["staff", "hod"] else None,
            })

        # Student dashboard (original logic)
        activity_calendar = build_activity_calendar(profile)
        stats = build_student_stats(profile)
        aptitude_stats = build_aptitude_stats(profile)
        weekly_activity = build_weekly_activity(activity_calendar)
        topic_stats = build_topic_stats(profile)
        
        # Unified Performance Ranking (Coding + Contests + Consistency)
        students_with_counts = (
            StudentProfile.objects.filter(institution=profile.institution)
            .annotate(
                coding_solved=Count(
                    'solutions',
                    filter=Q(solutions__all_tests_passed=True),
                    distinct=True
                ),
                contests_attended=Count('contest_participations', distinct=True),
                aptitude_solved=Count('solved_aptitude', distinct=True),
            )
            .order_by('-coding_solved', '-contests_attended', '-aptitude_solved', '-current_streak', 'name')
        )
        
        campus_rank = 1
        for idx, student in enumerate(students_with_counts, start=1):
            if student.id == profile.id:
                campus_rank = idx
                break
        
        # Awards & Achievements Logic
        total_solved = SolvedProblem.objects.filter(student=profile).count()
        total_aptitude_solved = SolvedAptitude.objects.filter(student=profile).count()
        current_streak = profile.current_streak
        
        # Check for unearned achievements
        unearned = Achievement.objects.exclude(userachievement__user=request.user)
        for ach in unearned:
            should_award = False
            if ach.category == 'coding':
                if ach.criteria_type == 'solve_count' and total_solved >= ach.criteria_value:
                    should_award = True
                elif ach.criteria_type == 'streak' and current_streak >= ach.criteria_value:
                    should_award = True
            elif ach.category == 'aptitude':
                if ach.criteria_type == 'aptitude_solve_count' and total_aptitude_solved >= ach.criteria_value:
                    should_award = True
                elif ach.criteria_type == 'quant_solve_count':
                    quant_solved = SolvedAptitude.objects.filter(student=profile, question__topic__parent__parent__title__icontains='QUANTITATIVE').count()
                    if quant_solved >= ach.criteria_value:
                        should_award = True
            
            if should_award:
                UserAchievement.objects.get_or_create(user=request.user, achievement=ach)
        
        all_achievements = Achievement.objects.all()
        user_achievements = UserAchievement.objects.filter(user=request.user).select_related('achievement')
        earned_ids = {ua.achievement_id: ua.awarded_at for ua in user_achievements}

        achievements_data = []
        for ach in all_achievements:
            is_earned = ach.id in earned_ids
            achievements_data.append({
                "id": ach.id,
                "name": ach.name,
                "description": ach.description,
                "icon": ach.badge_icon,
                "category": ach.category,
                "is_earned": is_earned,
                "date": earned_ids[ach.id].strftime("%b %d, %Y") if is_earned else None
            })

        user_payload = {
            "name": profile.name,
            "title": profile.title,
            "streak": profile.current_streak,
            "loginDays": profile.login_days,
            "rank": campus_rank,
            "totalStudents": students_with_counts.count(),
            "registerNumber": profile.register_number,
            "email": profile.personal_email,
            "total_problems_count": Problem.objects.count(),
            "total_aptitude_count": AptitudeQuestion.objects.count(),
            "tracked_companies": profile.tracked_companies,
        }

        if not problems.exists():
            return Response(
                {
                    **FALLBACK_DASHBOARD,
                    "user": user_payload,
                    "stats": stats,
                    "aptitude_stats": aptitude_stats,
                    "weeklyActivity": weekly_activity,
                    "activityCalendar": activity_calendar,
                    "consistencyLabel": "Activity calendar",
                    "student": StudentProfileSerializer(profile).data,
                }
            )

        # Daily Problem Logic
        today = timezone.now().date()
        daily_instance = DailyProblem.objects.filter(date=today).first()
        
        if not daily_instance:
            # Pick a random problem that is not already a daily problem if possible
            random_problem = Problem.objects.order_by('?').first()
            if random_problem:
                daily_instance = DailyProblem.objects.create(date=today, problem=random_problem)
        
        daily_problem = daily_instance.problem if daily_instance else problems.first()
        
        # Mark as daily for visibility in list
        if daily_problem:
            Problem.objects.filter(id=daily_problem.id).update(is_daily=True)

        # Calculate Preferred Language
        user_submissions = Submission.objects.filter(student=profile)
        if user_submissions.exists():
            lang_stats = user_submissions.values('language').annotate(count=Count('language')).order_by('-count')
            preferred_language = lang_stats[0]['language']
        else:
            preferred_language = "JavaScript"

        # Announcements Logic (Fetch active announcements from last 7 days)
        seven_days_ago = timezone.now() - timedelta(days=7)
        announcements = Announcement.objects.filter(
            is_active=True, 
            created_at__gte=seven_days_ago
        ).order_by('-created_at')[:5]

        payload = {
            "user": user_payload,
            "achievements": achievements_data,
            "dailyProblem": {
                "id": daily_problem.id,
                "slug": daily_problem.slug,
                "title": daily_problem.title,
                "difficulty": daily_problem.difficulty,
                "description": daily_problem.description,
                "tags": daily_problem.tags,
                "preferredLanguage": preferred_language,
            },
            "stats": stats,
            "weeklyActivity": weekly_activity,
            "activityCalendar": activity_calendar,
            "topicStats": topic_stats,
            "consistencyLabel": "Activity calendar",
            "tracks": topic_stats if topic_stats else FALLBACK_DASHBOARD["tracks"],
            "aptitude_stats": aptitude_stats,
            "leaderboard": FALLBACK_DASHBOARD["leaderboard"],
            "announcements": [{
                "id": a.id,
                "title": a.title,
                "content": a.content,
                "category": a.category,
                "date": a.created_at.strftime("%b %d, %Y")
            } for a in announcements],
            "editor": FALLBACK_DASHBOARD["editor"],
            "student": StudentProfileSerializer(profile).data,
        }
        return Response(payload)


class UpdateTrackedCompaniesView(UnifiedAuthMixin, APIView):
    """Allow students to update their tracked companies list"""
    def post(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        
        if profile_type != "student":
            return Response({"detail": "Only students can track companies."}, status=status.HTTP_403_FORBIDDEN)
        
        companies = request.data.get("companies", [])
        if not isinstance(companies, list):
            return Response({"detail": "Companies must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        
        profile.tracked_companies = [c.strip() for c in companies if isinstance(c, str) and c.strip()]
        profile.save(update_fields=["tracked_companies"])
        
        return Response({"status": "success", "tracked_companies": profile.tracked_companies})


class DailyLeaderboardView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        today = timezone.now().date()
        daily_instance = DailyProblem.objects.filter(date=today).first()
        
        if not daily_instance:
            return Response({"leaderboard": []})

        # Get successful submissions for this daily problem
        # Only take the best (earliest) submission per student
        submissions = Submission.objects.filter(
            problem=daily_instance.problem,
            status="Accepted"
        ).order_by('student', 'submitted_at').distinct('student')

        leaderboard = []
        for idx, sub in enumerate(submissions, 1):
            leaderboard.append({
                "rank": idx,
                "name": sub.student.name,
                "registerNumber": sub.student.register_number,
                "language": sub.language,
                "time": sub.submitted_at.strftime("%I:%M %p"),
                "isUser": sub.student.id == profile.id
            })

        return Response({"leaderboard": leaderboard[:50]})  # Top 50


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
                "executor_configured": bool(getattr(settings, "EXECUTOR_BASE_URL", "").strip()),
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
            or "JavaScript"
        )
        status_label = "Accepted" if progress_state == "completed" else "Started"

        submission = Submission.objects.create(
            student=profile,
            problem=problem,
            language=language,
            status=status_label,
        )

        if progress_state == "completed":
            Notification.objects.create(
                recipient=profile.account,
                title="🎯 Problem Solved!",
                message=f"Congratulations! You've successfully solved '{problem.title}'.",
                link=f"/problems?slug={problem.slug}"
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
        source_code = validated["source_code"]
        language = validated.get("language", "")

        logger.debug(
            "CodeRunView: lang=%s, lang_id=%s, problem=%s, is_submit=%s, stdin=%r, source_len=%d",
            language, validated["language_id"], problem_slug, is_submit, stdin, len(source_code)
        )

        # ─────────────────────────────────────────────────────────────────
        # VALIDATION: Check code before execution
        # ─────────────────────────────────────────────────────────────────
        is_valid, validation_error = validate_submission(language, source_code, stdin)
        if not is_valid:
            logger.warning("Code validation failed for %s: %s", profile.student_id, validation_error)
            return Response(
                {"detail": f"Code validation failed: {validation_error}"},
                status=status.HTTP_400_BAD_REQUEST,
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
            
        except ExecutorTimeoutError as exc:
            logger.error("Executor timeout: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except ExecutorServiceError as exc:
            logger.error("Executor service error: %s", exc)
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

        thread_type = request.query_params.get("thread_type", "general")
        other_user_reg = request.query_params.get("other_user_reg")
        batch_name = request.query_params.get("batch_name")
        problem_slug = request.query_params.get("problem_slug")

        # Security check for staff/hod rooms
        if thread_type in ["staff", "hod_tp_ja"] and profile_type == "student":
            return Response({"detail": "Access denied to this channel."}, status=403)

        messages_qs = get_discussion_messages(
            request.user,
            profile,
            profile_type,
            thread_type=thread_type,
            other_user_reg=other_user_reg,
            batch_name=batch_name,
            problem_slug=problem_slug
        ).order_by("created_at")

        # Mark messages sent TO the current user as read when they view the thread
        if thread_type == "individual":
            messages_qs.filter(recipient=request.user, is_read=False).update(is_read=True)
            # Also clear notifications for this direct message thread
            Notification.objects.filter(
                recipient=request.user,
                is_read=False,
                link__icontains=f"other_user_reg={other_user_reg}"
            ).update(is_read=True)
        elif thread_type in ["general", "staff", "hod_tp_ja"]:
            # For group channels, just clear all notifications for that channel
            Notification.objects.filter(
                recipient=request.user,
                is_read=False,
                link=f"/discuss?thread_type={thread_type}"
            ).update(is_read=True)

        messages = messages_qs[:200]

        return Response(DiscussionMessageSerializer(messages, many=True, context={"request": request}).data)

    def post(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        serializer = DiscussionMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        thread_type = data.get("thread_type", "general")
        recipient_reg = data.get("recipient_reg")
        batch_name = data.get("batch_name")
        problem_slug = data.get("problem_slug")
        body = data["body"]

        # 1. Validation and Security
        if thread_type == "general" and profile_type == "student":
            batch_name = profile.batch

        if thread_type == "individual":
            if not recipient_reg:
                return Response({"detail": "Recipient required for individual message."}, status=400)

            # Students can only message staff from their department
            if profile_type == "student":
                recipient_staff = StaffProfile.objects.filter(
                    faculty_id__iexact=recipient_reg,
                    department=profile.department
                ).first()
                if not recipient_staff:
                    recipient_staff = StaffProfile.objects.filter(faculty_id__iexact=recipient_reg, institution=profile.institution).first()
                    if not recipient_staff:
                        return Response({"detail": "Staff member not found in your institution."}, status=403)
                
                recipient = recipient_staff.account
            else:
                recipient = User.objects.filter(
                    Q(student_profile__register_number__iexact=recipient_reg) |
                    Q(staff_profile__faculty_id__iexact=recipient_reg) |
                    Q(username=recipient_reg)
                ).first()

            if not recipient:
                return Response({"detail": "Recipient not found."}, status=404)

            # Students cannot DM other students
            if profile_type == "student" and hasattr(recipient, "student_profile"):
                return Response({"detail": "Students can only message Staff or HOD."}, status=403)
        else:
            recipient = None

        if thread_type in ["staff", "hod_tp_ja"] and profile_type == "student":
            return Response({"detail": "Students cannot post to this channel."}, status=403)

        # 2. Find problem if applicable
        problem = None
        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        is_poll = data.get("is_poll", False)
        poll_options = data.get("poll_options", [])

        if is_poll and profile_type == "student":
            return Response({"detail": "Only Staff/HOD/Admin can create polls."}, status=403)

        # 3. Create message
        message = DiscussionMessage.objects.create(
            sender=request.user,
            recipient=recipient,
            student=profile if profile_type == "student" else None,
            problem=problem,
            thread_type=thread_type,
            batch_name=batch_name,
            institution=getattr(profile, 'institution', None),
            department=getattr(profile, 'department', None),
            body=body,
            is_poll=is_poll,
            poll_options=poll_options
        )

        # 4. Notifications
        if recipient:
            # For individual messages, include the sender's reg in the link to allow auto-clearing
            sender_reg = profile.register_number if profile_type == "student" else (profile.faculty_id if profile else request.user.username)
            Notification.objects.create(
                recipient=recipient,
                title=f"New Message from {profile.name if profile else request.user.username}",
                message=body[:60] + "..." if len(body) > 60 else body,
                link=f"/discuss?thread_type=individual&other_user_reg={sender_reg}"
            )
        elif thread_type in ["staff", "hod_tp_ja", "general"]:
            # For group channels, we notify relevant people
            recipients_qs = User.objects.none()
            room_name = "General Chat"

            if thread_type == "staff" and profile and profile.department:
                recipients_qs = User.objects.filter(
                    staff_profile__department=profile.department
                )
                room_name = "Staff Room"
            elif thread_type == "hod_tp_ja" and profile:
                recipients_qs = User.objects.filter(
                    staff_profile__institution=profile.institution,
                    staff_profile__role__in=["hod", "admin", "ja", "tpu", "director"]
                )
                room_name = "HOD & Admin Panel"
            elif thread_type == "general" and profile:
                recipients_qs = User.objects.filter(
                    student_profile__batch=batch_name,
                    student_profile__institution=profile.institution
                )
                if batch_name:
                    room_name = f"Batch {batch_name} Chat"

            # Filter out the sender
            recipients = recipients_qs.exclude(id=request.user.id).distinct()

            # Create notifications in bulk
            notif_link = f"/discuss?thread_type={thread_type}"
            if thread_type == "general" and batch_name:
                notif_link += f"&batch_name={batch_name}"

            notifications = [
                Notification(
                    recipient=r,
                    title=f"New Message in {room_name}",
                    message=f"{profile.name}: {body[:50]}..." if len(body) > 50 else f"{profile.name}: {body}",
                    link=notif_link
                )
                for r in recipients
            ]
            Notification.objects.bulk_create(notifications)

        return Response(
            DiscussionMessageSerializer(message, context={"request": request}).data,
            status=status.HTTP_201_CREATED
        )

class DiscussionPollVoteView(UnifiedAuthMixin, APIView):
    def post(self, request, pk):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        message = get_object_or_404(DiscussionMessage, pk=pk)
        if not message.is_poll:
            return Response({"detail": "This message is not a poll."}, status=400)

        option_index = request.data.get("option_index")
        if option_index is None or not (0 <= option_index < len(message.poll_options)):
            return Response({"detail": "Invalid option index."}, status=400)

        # Record or update vote
        user_id = str(request.user.id)
        message.poll_votes[user_id] = option_index
        message.save(update_fields=["poll_votes"])

        return Response(DiscussionMessageSerializer(message, context={"request": request}).data)

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
        days_active = 0
        if target_staff.account and target_staff.account.date_joined:
            days_active = (timezone.now() - target_staff.account.date_joined).days + 1
        else:
            days_active = (timezone.now() - target_staff.created_at).days + 1 if hasattr(target_staff, 'created_at') else 1

        # Get students in this staff's department or entire institution if no department (Director/TPU)
        if target_staff.department:
            department_students = StudentProfile.objects.filter(
                institution=target_staff.institution,
                department=target_staff.department
            )
        else:
            department_students = StudentProfile.objects.filter(
                institution=target_staff.institution
            )

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
        # Get distinct batches
        batch_filter = Q(institution=target_staff.institution, batch__isnull=False)
        if target_staff.department:
            batch_filter &= Q(department=target_staff.department)
        
        batches = StudentProfile.objects.filter(batch_filter).exclude(batch='').values_list('batch', flat=True).distinct()

        for batch in batches:
            # Get all students for this batch with annotations
            batch_student_filter = Q(institution=target_staff.institution, batch=batch)
            if target_staff.department:
                batch_student_filter &= Q(department=target_staff.department)
                
            all_batch_students = StudentProfile.objects.filter(batch_student_filter).annotate(
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
            solved_filter = Q(solved_at__date=day.date())
            if target_staff.department:
                solved_filter &= Q(student__department=target_staff.department)
            else:
                solved_filter &= Q(student__institution=target_staff.institution)
                
            count = SolvedProblem.objects.filter(solved_filter).count()
            weekly_progress.append({
                "day": day.strftime("%a"),
                "count": count,
            })
        weekly_progress.reverse()

        # Recent Activity (Last 10 solved problems)
        recent_activity = []
        recent_filter = Q()
        if target_staff.department:
            recent_filter = Q(student__department=target_staff.department)
        else:
            recent_filter = Q(student__institution=target_staff.institution)
            
        recent_solved = SolvedProblem.objects.filter(recent_filter).select_related('student', 'problem').order_by('-solved_at')[:10]
        
        for solved in recent_solved:
            recent_activity.append({
                "student_name": solved.student.name,
                "student_id": solved.student.register_number,
                "problem_title": solved.problem.title,
                "solved_at": solved.solved_at.isoformat(),
            })

        # Engagement Summary
        today = timezone.now().date()
        active_today = department_students.filter(last_login_on=today).count()
        total_students = department_students.count()
        avg_solved = 0
        if total_students > 0:
            total_solved_filter = Q()
            if target_staff.department:
                total_solved_filter = Q(student__department=target_staff.department)
            else:
                total_solved_filter = Q(student__institution=target_staff.institution)
                
            total_solved_count = SolvedProblem.objects.filter(total_solved_filter).count()
            avg_solved = round(total_solved_count / total_students, 1)

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
                "assigned_students": total_students,
            },
            "analytics": {
                "total_solved": SolvedProblem.objects.filter(
                    student__department=target_staff.department
                ).count() if target_staff.department else 0,
                "weekly_progress": weekly_progress,
                "top_performers": top_students,
                "contests": recent_contests,
                "batch_wise": batch_wise_data,
                "recent_activity": recent_activity,
                "engagement_summary": {
                    "active_today": active_today,
                    "avg_solved": avg_solved,
                    "participation_rate": round((active_today / total_students * 100), 1) if total_students > 0 else 0
                }
            },
        })
        

class DepartmentDetailView(APIView):
    """Get detailed analytics for a specific department."""
    permission_classes = [IsAuthenticated]

    def get(self, request, dept_id):
        is_staff = hasattr(request.user, 'staff_profile')
        is_admin = request.user.is_superuser
        
        if not is_staff and not is_admin:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        user_profile = request.user.staff_profile if is_staff else None
        user_role = user_profile.role if user_profile else None
        inst = user_profile.institution if user_profile else None

        # Get the target department
        dept = get_object_or_404(Department, id=dept_id)
        
        # Check permissions: Institutional roles can view any department in their institution
        if is_staff:
            if user_role == "hod" and dept != user_profile.department:
                return Response({"detail": "You can only view your own department."}, status=status.HTTP_403_FORBIDDEN)
            if dept.institution != inst:
                return Response({"detail": "You do not have access to this department."}, status=status.HTTP_403_FORBIDDEN)

        # Get students in this department
        department_students = StudentProfile.objects.filter(
            institution=dept.institution,
            department=dept
        )

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

        # Get contests in department
        recent_contests = []
        dept_contests_qs = Contest.objects.filter(
            institution=dept.institution,
            department=dept
        ).order_by('-created_at')[:10]

        for contest in dept_contests_qs:
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

        # Batch-wise grouping
        batch_wise_data = []
        batches = department_students.filter(batch__isnull=False).exclude(batch='').values_list('batch', flat=True).distinct()

        for batch in batches:
            all_batch_students = department_students.filter(batch=batch).annotate(
                solved_count=Count('solved_problems', distinct=True)
            ).order_by('-solved_count')

            batch_count = all_batch_students.count()

            batch_top_performers = []
            for student in all_batch_students[:5]:
                batch_top_performers.append({
                    "register_number": student.register_number,
                    "name": student.name,
                    "solved_count": student.solved_count,
                    "current_streak": student.current_streak,
                })

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

        # Weekly progress
        weekly_progress = []
        for i in range(7):
            day = timezone.now() - timedelta(days=i)
            count = SolvedProblem.objects.filter(
                student__department=dept,
                solved_at__date=day.date()
            ).count()
            weekly_progress.append({
                "day": day.strftime("%a"),
                "count": count,
            })
        weekly_progress.reverse()

        # Recent Activity
        recent_activity = []
        recent_solved = SolvedProblem.objects.filter(
            student__department=dept
        ).select_related('student', 'problem').order_by('-solved_at')[:10]
        
        for solved in recent_solved:
            recent_activity.append({
                "student_name": solved.student.name,
                "student_id": solved.student.register_number,
                "problem_title": solved.problem.title,
                "solved_at": solved.solved_at.isoformat(),
            })

        # Engagement Summary
        today = timezone.now().date()
        active_today = department_students.filter(last_login_on=today).count()
        total_students = department_students.count()
        avg_solved = 0
        if total_students > 0:
            total_solved_count = SolvedProblem.objects.filter(student__department=dept).count()
            avg_solved = round(total_solved_count / total_students, 1)

        return Response({
            "department": {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
                "assigned_students": total_students,
            },
            "analytics": {
                "total_solved": SolvedProblem.objects.filter(student__department=dept).count(),
                "weekly_progress": weekly_progress,
                "top_performers": top_students,
                "contests": recent_contests,
                "batch_wise": batch_wise_data,
                "recent_activity": recent_activity,
                "engagement_summary": {
                    "active_today": active_today,
                    "avg_solved": avg_solved,
                    "participation_rate": round((active_today / total_students * 100), 1) if total_students > 0 else 0
                }
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
            # Compute live counts — stored fields may be stale
            live_participants = ContestParticipation.objects.filter(contest=contest).count()
            live_submissions = ContestSubmission.objects.filter(contest=contest).count()
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
                "total_participants": live_participants,
                "total_submissions": live_submissions,
                "approved_by": {
                    "faculty_id": contest.approved_by.faculty_id,
                    "name": contest.approved_by.name or contest.approved_by.faculty_id,
                } if contest.approved_by else None,
                "approved_at": contest.approved_at,
                "rejection_reason": contest.rejection_reason,
                "submitted_for_approval_at": contest.submitted_for_approval_at,
                "created_at": contest.created_at,
                "problem_count": contest.problems.count() if contest.contest_type == "programming" else 0,
                "aptitude_question_count": contest.aptitude_questions.count() if contest.contest_type == "aptitude" else 0,
                "contest_type": contest.contest_type,
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
        access_start_time_str = request.data.get('access_start_time')
        access_end_time_str = request.data.get('access_end_time')
        
        start_time = None
        end_time = None
        access_start_time = None
        access_end_time = None
        
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
        
        if access_start_time_str:
            try:
                naive_dt = datetime.fromisoformat(access_start_time_str)
                access_start_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())
            except (ValueError, TypeError):
                pass
        
        if access_end_time_str:
            try:
                naive_dt = datetime.fromisoformat(access_end_time_str)
                access_end_time = timezone.make_aware(naive_dt, timezone.get_current_timezone())
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
            # New session-based timing fields
            access_start_time=access_start_time,
            access_end_time=access_end_time,
            session_duration_minutes=request.data.get('session_duration_minutes', 60),
            status=initial_status,
            contest_type=request.data.get('contest_type', 'programming'),
            submitted_for_approval_at=timezone.now() if submit_for_approval else None,
        )

        # Add problems by slugs (for programming)
        if contest.contest_type == 'programming':
            problem_slugs = request.data.get('problem_slugs', [])
            if problem_slugs:
                problems = Problem.objects.filter(slug__in=problem_slugs)
                contest.problems.set(problems)
        
        # Add aptitude questions (for aptitude)
        elif contest.contest_type == 'aptitude':
            aptitude_question_ids = request.data.get('aptitude_question_ids', [])
            if aptitude_question_ids:
                questions = AptitudeQuestion.objects.filter(id__in=aptitude_question_ids)
                contest.aptitude_questions.set(questions)

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
        if contest.contest_type == 'programming':
            for problem in contest.problems.all():
                problems_data.append({
                    "id": problem.id,
                    "slug": problem.slug,
                    "title": problem.title,
                    "difficulty": problem.difficulty,
                })
        else:
            for q in contest.aptitude_questions.all():
                problems_data.append({
                    "id": q.id,
                    "question_text": q.question_text,
                    "topic": q.topic.title,
                    "difficulty": q.difficulty,
                    "option_a": q.option_a,
                    "option_b": q.option_b,
                    "option_c": q.option_c,
                    "option_d": q.option_d,
                    "correct_option": q.correct_option,
                })
        
        data = {
            "id": contest.id,
            "title": contest.title,
            "description": contest.description,
            "contest_type": contest.contest_type,
            "status": contest.status,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "duration_minutes": contest.duration_minutes,
            "problems": problems_data,
            "problem_count": contest.problem_count,
            "aptitude_question_count": contest.aptitude_question_count,
            "assigned_batches": contest.assigned_batches,
            "assigned_student_count": contest.assigned_student_count,
            "created_by": contest.created_by.name,
            "department": contest.department.name if contest.department else None,
            "approved_by": contest.approved_by.name if contest.approved_by else None,
            "approved_at": contest.approved_at,
            "rejection_reason": contest.rejection_reason,
        }
        return Response(data)


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

        # Get submission stats based on contest type
        if contest.contest_type == 'aptitude':
            submissions = AptitudeContestSubmission.objects.filter(contest=contest)
            
            # Question-wise stats
            problem_stats = []
            for question in contest.aptitude_questions.all():
                q_submissions = submissions.filter(question=question)
                accepted = q_submissions.filter(is_correct=True).count()
                total = q_submissions.count()
                problem_stats.append({
                    "problem_id": question.id,
                    "title": question.question_text[:50] + "...",
                    "slug": f"q-{question.id}",
                    "total_attempts": total,
                    "accepted": accepted,
                    "success_rate": round((accepted / total) * 100, 1) if total > 0 else 0,
                })
        else:
            submissions = ContestSubmission.objects.filter(contest=contest)
            
            # Problem-wise stats
            problem_stats = []
            for problem in contest.problems.all():
                p_submissions = submissions.filter(problem=problem)
                accepted = p_submissions.filter(status='Accepted').count()
                total = p_submissions.count()
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
            
            if contest.contest_type == 'aptitude':
                student_submissions = AptitudeContestSubmission.objects.filter(contest=contest, student=student)
                # For aptitude, we use fields from ContestParticipation directly if they were updated during submission
                # Or recalculate here for accuracy
                solved_count = student_submissions.filter(is_correct=True).count()
                total_score = student_submissions.aggregate(total=Sum('score'))['total'] or 0
            else:
                student_submissions = ContestSubmission.objects.filter(contest=contest, student=student)
                solved_count = student_submissions.filter(status='Accepted').values('problem').distinct().count()
                total_score = student_submissions.aggregate(total=Sum('score'))['total'] or 0
            
            # Only include students who have submitted
            if student_submissions.count() == 0:
                continue
            
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
                "contest_type": contest.contest_type,
            },
            "summary": {
                "total_participants": len(participants_data),
                "total_submissions": submissions.count(),
                "accepted_submissions": submissions.filter(is_correct=True).count() if contest.contest_type == 'aptitude' else submissions.filter(status='Accepted').count(),
            },
            "problem_stats": problem_stats,
            "top_performers": top_performers,
            "participants": participants_data,
        })


class AptitudeContestSubmitView(APIView):
    """Submit an answer for an aptitude contest question"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        is_student = hasattr(request.user, 'student_profile')
        if not is_student:
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile
        contest = Contest.objects.filter(
            Q(assigned_students=student) | Q(assigned_batches__contains=student.batch),
            id=contest_id
        ).first()
        
        if not contest:
            return Response({"detail": "Contest not found or not accessible."}, status=status.HTTP_404_NOT_FOUND)

        # Check if contest is active for the student
        if contest.status != "published" or not contest.is_active:
             return Response({"detail": "Contest is not active."}, status=status.HTTP_400_BAD_REQUEST)

        question_id = request.data.get('question_id')
        selected_option = request.data.get('selected_option') # A, B, C, D
        time_taken = request.data.get('time_taken', 0)

        question = contest.aptitude_questions.filter(id=question_id).first()
        if not question:
            return Response({"detail": "Question not found in this contest."}, status=status.HTTP_404_NOT_FOUND)

        is_correct = (selected_option == question.correct_option)
        score = 1 if is_correct else 0 # Simple scoring for now

        submission, created = AptitudeContestSubmission.objects.update_or_create(
            contest=contest,
            student=student,
            question=question,
            defaults={
                'selected_option': selected_option,
                'is_correct': is_correct,
                'score': score,
                'time_taken_seconds': time_taken
            }
        )

        # Update Participation stats
        participation, _ = ContestParticipation.objects.get_or_create(
            contest=contest,
            student=student,
            defaults={
                'has_started': True,
                'manually_stopped': False
            }
        )
        
        # Recalculate total score and solved count for accuracy
        all_subs = AptitudeContestSubmission.objects.filter(contest=contest, student=student)
        participation.total_score = all_subs.aggregate(total=Sum('score'))['total'] or 0
        participation.problems_solved = all_subs.filter(is_correct=True).count()
        participation.save(update_fields=['total_score', 'problems_solved'])

        return Response({
            "success": True,
            "is_correct": is_correct,
            "score": score
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
        if contest.contest_type == 'aptitude':
            submissions = AptitudeContestSubmission.objects.filter(
                contest=contest,
                student=student
            ).select_related('question').order_by('-submitted_at')

            submissions_data = []
            for sub in submissions:
                submissions_data.append({
                    "id": sub.id,
                    "problem_title": sub.question.question_text[:50] + "...",
                    "problem_slug": f"q-{sub.question.id}",
                    "status": "Correct" if sub.is_correct else "Incorrect",
                    "score": sub.score,
                    "submitted_at": sub.submitted_at,
                    "selected_option": sub.selected_option,
                    "time_taken": sub.time_taken_seconds,
                })
        else:
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
                    "score": sub.score,
                    "time_taken": sub.time_taken_seconds,
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
                "contest_type": contest.contest_type,
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
            if student.account and not student.account.is_active:
                return Response(
                    {"detail": "Your account has been blocked. Please contact your department staff."},
                    status=status.HTTP_403_FORBIDDEN,
                )
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
            if staff.account and not staff.account.is_active:
                return Response(
                    {"detail": "Your account has been blocked. Please contact the system administrator."},
                    status=status.HTTP_403_FORBIDDEN,
                )
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
# Executor Direct API Endpoints
# =============================================================================

class ExecutorSystemInfoView(APIView):
    """Get executor system information and status."""
    permission_classes = [AllowAny]

    def get(self, request):
        import urllib.request
        import json
        from django.conf import settings

        base_url = getattr(settings, 'EXECUTOR_BASE_URL', 'http://localhost:2358').rstrip('/')

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
                    "executor_info": data
                })
        except Exception as e:
            return Response(
                {"status": "offline", "error": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )


class ExecutorSubmitView(APIView):
    """Submit code directly to the executor for execution."""
    permission_classes = [AllowAny]

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
        """Execute code via the executor."""
        from .services.executor import (
            execute_submission,
            ExecutorTimeoutError,
            ExecutorServiceError,
        )

        language_id = request.data.get("language_id")
        source_code = request.data.get("source_code", "")
        stdin = request.data.get("stdin", "")
        language = request.data.get("language", "").lower()
        use_mock = request.data.get("mock", False)

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

        # ── Aptitude Insights ──────────────────────────────────────────────────
        aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
        total_aptitude = AptitudeQuestion.objects.count()
        
        # ── Company Insights ──────────────────────────────────────────────────
        company_counts = {}
        for solved in solved_problems:
            companies_str = solved.problem.companies or ""
            if companies_str:
                # Assuming comma-separated or space-separated list of companies
                clist = [c.strip() for c in companies_str.replace(',', ' ').split() if c.strip()]
                for comp in clist:
                    company_counts[comp] = company_counts.get(comp, 0) + 1
        
        sorted_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        company_insights = [{'name': name, 'count': count} for name, count in sorted_companies]

        # ── Project/Skill Insights ─────────────────────────────────────────────
        skill_counts = {}
        project_tags = {'project', 'real-world', 'application', 'system', 'database', 'web', 'api', 'full-stack'}
        for solved in solved_problems:
            tags = solved.problem.tags or []
            for tag in tags:
                tag_lower = tag.lower()
                skill_counts[tag_lower] = skill_counts.get(tag_lower, 0) + 1
        
        # Filter for "project-like" skills
        project_insights = []
        for skill, count in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True):
            if skill in project_tags or any(pt in skill for pt in project_tags):
                project_insights.append({'skill': skill, 'count': count})
        
        project_insights = project_insights[:8]

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
                'aptitude': {
                    'solved': aptitude_solved,
                    'total': total_aptitude,
                    'percentage': round((aptitude_solved / total_aptitude * 100), 1) if total_aptitude > 0 else 0
                },
                'company_insights': company_insights,
                'project_insights': project_insights,
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

        # ── Aptitude Insights ──────────────────────────────────────────────────
        aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
        total_aptitude = AptitudeQuestion.objects.count()
        
        # ── Company & Project Insights ────────────────────────────────────────
        company_counts = {}
        skill_counts = {}
        project_tags = {'project', 'real-world', 'application', 'system', 'database', 'web', 'api', 'full-stack'}
        
        for sp in solved_problems:
            # Company
            companies_str = sp.problem.companies or ""
            if companies_str:
                clist = [c.strip() for c in companies_str.replace(',', ' ').split() if c.strip()]
                for comp in clist:
                    company_counts[comp] = company_counts.get(comp, 0) + 1
            
            # Skills/Projects
            tags = sp.problem.tags or []
            for tag in tags:
                tag_lower = tag.lower()
                skill_counts[tag_lower] = skill_counts.get(tag_lower, 0) + 1

        sorted_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:8]
        company_insights = [{'name': name, 'count': count} for name, count in sorted_companies]

        project_insights = []
        for skill, count in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True):
            if skill in project_tags or any(pt in skill for pt in project_tags):
                project_insights.append({'skill': skill, 'count': count})
        project_insights = project_insights[:6]

        return Response({
            "student": {
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "department": student.department.name if student.department else None,
                "current_streak": student.current_streak,
                "login_days": student.login_days,
                "campus_rank": f"#{calculate_campus_rank_helper(student)}",
            },
            "analytics": {
                "solved_count": solved_problems.count(),
                "difficulty_breakdown": difficulty_breakdown,
                "recent_activity": recent_activity,
                "time_spent_total": total_time_spent,
                "time_spent_hours": round(total_time_spent / 3600, 2),
                "contest_participations": list(contest_participations),
                "aptitude": {
                    "solved": aptitude_solved,
                    "total": total_aptitude,
                    "percentage": round((aptitude_solved / total_aptitude * 100), 1) if total_aptitude > 0 else 0
                },
                "company_insights": company_insights,
                "project_insights": project_insights,
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
            # Auto-publish on approval
            publish_contest_helper(contest)
            return Response({
                "detail": "Contest approved and published successfully.",
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


def publish_contest_helper(contest):
    """Helper to publish a contest and notify students"""
    contest.publish()
    
    # Create Announcement
    Announcement.objects.create(
        title=f"🚀 New Contest: {contest.title}",
        content=f"A new contest '{contest.title}' is now live! Challenge yourself and climb the leaderboard.",
        category="contest"
    )

    # Create Notifications for assigned students
    # 1. Direct assignments
    student_users = list(contest.assigned_students.values_list('account', flat=True))
    
    # 2. Batch assignments
    if contest.assigned_batches:
        batch_students = StudentProfile.objects.filter(
            batch__in=contest.assigned_batches,
            institution=contest.institution
        ).values_list('account', flat=True)
        student_users.extend(list(batch_students))
    
    # Unique users
    unique_user_ids = set(filter(None, student_users))
    
    notifications = []
    for user_id in unique_user_ids:
        notifications.append(Notification(
            recipient_id=user_id,
            title="New Contest Assigned",
            message=f"You have been assigned to a new contest: {contest.title}. Check it out now!",
            link=f"/contests/{contest.id}" if contest.contest_type == 'programming' else f"/aptitude-contest/{contest.id}"
        ))
    
    if notifications:
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)


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

        publish_contest_helper(contest)
        
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

        # Get contests where student is assigned via:
        # 1. Direct assignment to student
        # 2. Assignment to student's batch AND department (both must match)
        # Only show contests that are published or completed (after HOD approval)
        contests = Contest.objects.filter(
            Q(assigned_students=student) | 
            Q(assigned_batches__contains=student.batch, department=student.department),
            status__in=['published', 'completed']  # Only published/completed contests visible to students
        ).distinct().select_related('created_by', 'department').prefetch_related('problems')

        data = []
        for contest in contests:
            # Update contest status if it has ended
            contest.update_status_if_ended()
            
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
            is_active = contest.is_active
            is_upcoming = contest.is_upcoming
            is_ended = contest.is_ended

            # Get question counts
            problem_count = contest.problems.count()
            aptitude_count = contest.aptitude_questions.count()

            data.append({
                "id": contest.id,
                "title": contest.title,
                "description": contest.description,
                "contest_type": contest.contest_type,
                "start_time": contest.start_time,
                "end_time": contest.end_time,
                "duration_minutes": contest.duration_minutes,
                "problem_count": problem_count,
                "aptitude_question_count": aptitude_count,
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
            Q(assigned_students=student) | 
            Q(assigned_batches__contains=student.batch, department=student.department),
            id=contest_id,
            status__in=['published', 'completed']  # Only published/completed contests
        ).select_related('created_by', 'department').prefetch_related('problems', 'aptitude_questions').first()

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
        is_active = contest.is_active
        is_ended = contest.is_ended

        # Get questions/problems with status
        problems_data = []
        if contest.contest_type == 'aptitude':
            for q in contest.aptitude_questions.all():
                # Check if student has answered this question in the contest
                submission = AptitudeContestSubmission.objects.filter(
                    contest=contest,
                    student=student,
                    question=q
                ).first()

                problems_data.append({
                    "id": q.id,
                    "question_text": q.question_text,
                    "option_a": q.option_a,
                    "option_b": q.option_b,
                    "option_c": q.option_c,
                    "option_d": q.option_d,
                    "explanation": q.explanation,
                    "difficulty": q.difficulty,
                    "is_solved": submission is not None,
                    "student_answer": submission.selected_option if submission else None,
                    "score": submission.score if submission else 0,
                })
        else:
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
            "contest_type": contest.contest_type,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "duration_minutes": contest.duration_minutes,
            "problem_count": contest.problems.count(),
            "aptitude_question_count": contest.aptitude_questions.count(),
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
    """Start a contest (creates participation record with session timing)"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        contest = Contest.objects.filter(
            Q(assigned_students=student) | 
            Q(assigned_batches__contains=student.batch, department=student.department),
            id=contest_id,
            status__in=['published', 'completed']  # Only published/completed contests
        ).first()

        if not contest:
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if contest access is available
        if contest.is_upcoming:
            return Response(
                {"detail": "Contest access has not started yet."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if contest.is_ended:
            return Response(
                {"detail": "Contest access has ended. No new participants allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if already started
        participation = ContestParticipation.objects.filter(
            contest=contest,
            student=student
        ).first()

        if participation:
            # If session has expired, auto-submit
            if participation.is_session_expired and participation.is_active:
                participation.end_participation(auto_submitted=True)
                return Response(
                    {"detail": "Your session has expired. Contest has been auto-submitted."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            return Response({
                "detail": "Contest session already started.",
                "participation": {
                    "started_at": participation.started_at,
                    "session_end_time": participation.session_end_time,
                    "remaining_time_seconds": participation.remaining_time_seconds,
                    "is_active": participation.is_active,
                    "contest_id": contest.id,
                }
            })

        # Create participation with session timing
        participation = ContestParticipation.objects.create(
            contest=contest,
            student=student,
            manually_stopped=False  # Explicitly set default value
        )

        return Response({
            "detail": "Contest session started successfully.",
            "participation": {
                "started_at": participation.started_at,
                "session_end_time": participation.session_end_time,
                "session_duration_minutes": contest.session_duration_minutes or contest.duration_minutes,
                "remaining_time_seconds": participation.remaining_time_seconds,
                "contest_id": contest.id,
            }
        })


class StudentContestAutoSubmitView(APIView):
    """Auto-submit contest when session time expires"""
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

        # Check if session has actually expired
        if not participation.is_session_expired:
            return Response(
                {"detail": "Session has not expired yet."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # End the participation with auto-submit flag
        participation.end_participation(auto_submitted=True)
        
        # Calculate final score and problems solved
        if participation.contest.contest_type == 'programming':
            submissions = ContestSubmission.objects.filter(
                contest_id=contest_id,
                student=student
            )
            participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
            participation.problems_solved = submissions.filter(status='Accepted').values('problem').distinct().count()
        else:
            # Aptitude contest
            submissions = AptitudeContestSubmission.objects.filter(
                contest_id=contest_id,
                student=student
            )
            participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
            participation.problems_solved = submissions.filter(is_correct=True).count()
        
        participation.save(update_fields=['total_score', 'problems_solved'])

        return Response({
            "detail": "Contest auto-submitted due to session expiry.",
            "participation": {
                "completed_at": participation.completed_at,
                "time_spent_seconds": participation.time_spent_seconds,
                "total_score": participation.total_score,
                "problems_solved": participation.problems_solved,
                "auto_submitted": participation.auto_submitted,
            }
        })


class StudentContestStopView(APIView):
    """Manually stop a contest (student can stop at any time during session)"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            contest = Contest.objects.get(id=contest_id)
        except Contest.DoesNotExist:
            return Response(
                {"detail": "Contest not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if student has an active participation
        try:
            participation = ContestParticipation.objects.get(
                contest=contest,
                student=request.user.student_profile,
                is_active=True
            )
        except ContestParticipation.DoesNotExist:
            return Response(
                {"detail": "No active participation found for this contest."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Allow both programming and aptitude contests to be stopped manually
        # (Previously this was restricted to programming only)
        
        # Stop the contest
        participation.is_active = False
        participation.completed_at = timezone.now()
        
        # Calculate time spent
        if participation.started_at:
            time_spent = timezone.now() - participation.started_at
            participation.time_spent_seconds = int(time_spent.total_seconds())
        
        # Recalculate final score and problems solved one last time
        if contest.contest_type == 'programming':
            from django.db.models import Sum
            submissions = ContestSubmission.objects.filter(
                contest=contest,
                student=request.user.student_profile
            )
            participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
            participation.problems_solved = submissions.filter(status='Accepted').values('problem').distinct().count()
        else:
            # Aptitude contest
            from django.db.models import Sum
            submissions = AptitudeContestSubmission.objects.filter(
                contest=contest,
                student=request.user.student_profile
            )
            participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
            participation.problems_solved = submissions.filter(is_correct=True).count()

        participation.manually_stopped = True
        participation.save()

        return Response({
            "detail": "Contest stopped successfully.",
            "participation": {
                "completed_at": participation.completed_at,
                "time_spent_seconds": participation.time_spent_seconds,
                "total_score": participation.total_score,
                "problems_solved": participation.problems_solved,
                "manually_stopped": True,
            }
        })


class StudentContestSessionStatusView(APIView):
    """Get current session status and remaining time"""
    permission_classes = [IsAuthenticated]

    def get(self, request, contest_id):
        if not hasattr(request.user, 'student_profile'):
            return Response(
                {"detail": "Student access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        student = request.user.student_profile

        # Get participation
        participation = ContestParticipation.objects.filter(
            contest_id=contest_id,
            student=student
        ).first()

        if not participation:
            return Response(
                {"detail": "No participation found."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if session has expired and auto-submit if needed
        if participation.is_session_expired and participation.is_active:
            participation.end_participation(auto_submitted=True)
            
            # Calculate final score
            if participation.contest.contest_type == 'programming':
                submissions = ContestSubmission.objects.filter(
                    contest_id=contest_id,
                    student=student
                )
                participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
                participation.problems_solved = submissions.filter(status='Accepted').values('problem').distinct().count()
            else:
                submissions = AptitudeContestSubmission.objects.filter(
                    contest_id=contest_id,
                    student=student
                )
                participation.total_score = submissions.aggregate(total=Sum('score'))['total'] or 0
                participation.problems_solved = submissions.filter(is_correct=True).count()
            
            participation.save(update_fields=['total_score', 'problems_solved'])

        return Response({
            "participation": {
                "started_at": participation.started_at,
                "session_end_time": participation.session_end_time,
                "completed_at": participation.completed_at,
                "remaining_time_seconds": participation.remaining_time_seconds,
                "is_active": participation.is_active,
                "is_session_expired": participation.is_session_expired,
                "auto_submitted": participation.auto_submitted,
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
            Q(assigned_students=student) | 
            Q(assigned_batches__contains=student.batch, department=student.department),
            id=contest_id,
            status__in=['published', 'completed']  # Only published/completed contests
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
        if contest.is_ended:
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
            Q(assigned_students=student) | 
            Q(assigned_batches__contains=student.batch, department=student.department),
            id=contest_id,
            status__in=['published', 'completed']  # Only published/completed contests
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
        if contest.is_ended:
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

        # Coerce language_id to int — request.data delivers it as a string
        # unlike CodeRunView which uses CodeRunSerializer (IntegerField)
        try:
            language_id = int(language_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": f"Invalid language_id: {language_id!r}. Must be an integer."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Execute code using the execution engine
        try:
            # Get test cases for the problem
            test_cases = list(problem.test_cases.all().order_by('order'))

            if not test_cases:
                return Response(
                    {"detail": "No test cases available for this problem."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Run against each test case — same pattern as CodeRunView
            passed_cases = 0
            total_cases = len(test_cases)
            test_results = []
            compile_error = ""
            first_stderr = ""

            for idx, test_case in enumerate(test_cases):
                prepared = prepare_execution_payload(
                    problem=problem,
                    source_code=source_code,
                    language=language,
                    stdin=test_case.stdin,
                )
                result = execute_judge0_submission(
                    source_code=prepared["source_code"],
                    language_id=language_id,
                    stdin=prepared["stdin"],
                )

                actual_raw = (result.get("stdout") or "").strip()
                expected = (test_case.expected_output or "").strip()
                exec_status = result.get("status", "Unknown")
                stderr = (result.get("stderr") or "").strip()
                compile_out = (result.get("compile_output") or "").strip()

                # Capture first compile error to surface it
                if compile_out and not compile_error:
                    compile_error = compile_out
                if stderr and not first_stderr:
                    first_stderr = stderr

                passed = (
                    exec_status == "Accepted"
                    and normalize_comparable_output(actual_raw)
                    == normalize_comparable_output(expected)
                )
                if passed:
                    passed_cases += 1

                # Include all test cases in the response (hidden ones show as "Hidden" input)
                test_results.append({
                    "case": idx + 1,
                    "passed": passed,
                    "status": exec_status,
                    "stdin": test_case.stdin if test_case.is_sample else "(hidden)",
                    "expected": expected if test_case.is_sample else "(hidden)",
                    "actual": actual_raw,
                    "stderr": stderr,
                    "compile_output": compile_out,
                    "time": result.get("time") or "",
                })

            # Determine overall status
            if compile_error:
                status_str = "Compilation Error"
            elif passed_cases == total_cases:
                status_str = "Accepted"
            else:
                status_str = "Wrong Answer"

            # Difficulty-based max score: Easy=100, Medium=200, Hard=300
            DIFFICULTY_MAX = {"Easy": 100, "Medium": 200, "Hard": 300}
            max_score = DIFFICULTY_MAX.get(problem.difficulty, 100)
            score = int((passed_cases / total_cases) * max_score) if total_cases > 0 else 0

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
                # Recalculate total_score as best score per problem (prevents score > 100 per problem)
                from django.db.models import Max as DMax
                best_scores = (
                    ContestSubmission.objects.filter(
                        contest=contest,
                        student=student,
                        status='Accepted',
                    )
                    .values('problem')
                    .annotate(best=DMax('score'))
                )
                new_total = sum(row['best'] for row in best_scores)
                new_solved = best_scores.count()

                participation.total_score = new_total
                participation.problems_solved = new_solved
                participation.save(update_fields=['problems_solved', 'total_score'])

            # Keep contest-level counters in sync
            try:
                contest.update_analytics()
            except Exception as analytics_err:
                logger.warning("Failed to update contest analytics: %s", analytics_err)

            return Response({
                "detail": "Code submitted successfully.",
                "submission": {
                    "id": submission.id,
                    "status": submission.status,
                    "score": submission.score,
                    "max_score": max_score,
                    "passed_cases": passed_cases,
                    "total_cases": total_cases,
                    "test_results": test_results,
                    "compile_error": compile_error,
                    "stderr": first_stderr,
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


class StudentContestWinnersView(APIView):
    """Get contest winners and participant results"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, contest_id):
        try:
            # Get student profile
            student_profile = get_object_or_404(StudentProfile, account=request.user)
            
            # Get contest and verify student has access
            contest = get_object_or_404(Contest, id=contest_id)
            
            # Check if student is assigned to this contest
            is_assigned = (
                contest.assigned_students.filter(id=student_profile.id).exists() or
                (student_profile.batch in contest.assigned_batches if contest.assigned_batches else False)
            )
            
            if not is_assigned:
                return Response({
                    'success': False,
                    'error': 'You are not assigned to this contest'
                }, status=403)
            
            # Check if contest is completed
            if not contest.is_ended:
                return Response({
                    'success': False,
                    'error': 'Contest is not yet completed'
                }, status=400)
            
            # Get all participations for this contest, ordered by performance
            participations = ContestParticipation.objects.filter(
                contest=contest,
                has_started=True
            ).select_related('student').order_by(
                '-problems_solved',  # More problems solved first
                'total_time_taken',  # Less time taken second
                '-total_score'       # Higher score third
            )
            
            # Get winners (top 3)
            winners = []
            for i, participation in enumerate(participations[:3]):
                winners.append({
                    'id': participation.id,
                    'student_name': participation.student.name,
                    'register_number': participation.student.register_number,
                    'problems_solved': participation.problems_solved,
                    'total_score': participation.total_score,
                    'completion_time': participation.total_time_taken,
                    'rank': i + 1
                })
            
            # Get all participants
            participants = []
            for i, participation in enumerate(participations):
                participants.append({
                    'id': participation.id,
                    'student_name': participation.student.name,
                    'register_number': participation.student.register_number,
                    'problems_solved': participation.problems_solved,
                    'total_score': participation.total_score,
                    'completion_time': participation.total_time_taken,
                    'rank': i + 1
                })
            
            return Response({
                'success': True,
                'contest_title': contest.title,
                'total_problems': contest.problems.count(),
                'total_participants': participations.count(),
                'winners': winners,
                'participants': participants
            })
            
        except Exception as e:
            logger.error(f"Error fetching contest winners: {str(e)}")
            return Response({
                'success': False,
                'error': 'Failed to fetch contest results'
            }, status=500)


class AnnouncementListView(UnifiedAuthMixin, APIView):
    def get(self, request):
        # Universal Table Refresh logic: 
        # Only show announcements from the last 7 days
        seven_days_ago = timezone.now() - timedelta(days=7)
        
        announcements = Announcement.objects.filter(
            is_active=True,
            created_at__gte=seven_days_ago
        ).order_by('-created_at')
        
        data = [{
            "id": a.id,
            "title": a.title,
            "content": a.content,
            "category": a.category,
            "time": a.created_at.strftime("%I:%M %p"),
            "date": a.created_at.strftime("%b %d")
        } for a in announcements]
        
        return Response({"announcements": data})


class NotificationListView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
            
        qs = Notification.objects.filter(recipient=request.user).order_by('-created_at')
        unread_count = qs.filter(is_read=False).count()
        notifications = qs[:20]
        
        data = [{
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "link": n.link,
            "is_read": n.is_read,
            "time": n.created_at.strftime("%b %d, %H:%M")
        } for n in notifications]
        
        return Response({
            "notifications": data,
            "unread_count": unread_count
        })


class NotificationMarkReadView(UnifiedAuthMixin, APIView):
    def post(self, request, notification_id):
        notification = get_object_or_404(Notification, id=notification_id, recipient=request.user)
        notification.delete()
        return Response({"success": True})


class AptitudeTopicListView(UnifiedAuthMixin, APIView):
    """List all available aptitude topics and their questions count + student progress"""
    def get(self, request):
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')
        
        # Optimization: Get solved question counts per topic for this student
        solved_counts = {}
        if is_student:
            from django.db.models import Count
            solved_qs = SolvedAptitude.objects.filter(student=profile).values('question__topic_id').annotate(count=Count('id'))
            solved_counts = {item['question__topic_id']: item['count'] for item in solved_qs}

        # Fetch top-level topics (Categories)
        categories = AptitudeTopic.objects.filter(parent=None).prefetch_related('subtopics__subtopics')
        
        category_list = []
        for cat in categories:
            subcategory_list = []
            cat_total_questions = 0
            cat_solved_questions = 0
            
            for subcat in cat.subtopics.all():
                topic_list = []
                subcat_total_questions = 0
                subcat_solved_questions = 0
                
                for topic in subcat.subtopics.all():
                    q_count = topic.questions.count()
                    s_count = solved_counts.get(topic.id, 0)
                    
                    subcat_total_questions += q_count
                    subcat_solved_questions += s_count
                    
                    topic_list.append({
                        "id": topic.id,
                        "title": topic.title,
                        "question_count": q_count,
                        "solved_count": s_count
                    })
                
                # If there are no Level 3 topics, check if questions are directly on Level 2
                if not topic_list:
                    q_count = subcat.questions.count()
                    s_count = solved_counts.get(subcat.id, 0)
                    subcat_total_questions = q_count
                    subcat_solved_questions = s_count
                
                cat_total_questions += subcat_total_questions
                cat_solved_questions += subcat_solved_questions
                
                subcategory_list.append({
                    "id": subcat.id,
                    "title": subcat.title,
                    "topics": topic_list,
                    "question_count": subcat_total_questions,
                    "solved_count": subcat_solved_questions
                })
                
            category_list.append({
                "id": cat.id,
                "title": cat.title,
                "subcategories": subcategory_list,
                "question_count": cat_total_questions,
                "solved_count": cat_solved_questions
            })
            
        return Response({"categories": category_list})


class AptitudeQuestionListView(UnifiedAuthMixin, APIView):
    """List aptitude questions for selection in contest creator"""
    def get(self, request):
        topic_id = request.query_params.get('topic_id')
        difficulty = request.query_params.get('difficulty')
        solved_status = request.query_params.get('status') # 'solved', 'unsolved', 'all'
        search = request.query_params.get('q')
        limit = request.query_params.get('limit', 1000) # Increased default limit
        
        profile, _, _ = self.get_authenticated_profile(request)
        is_student = hasattr(profile, 'register_number')
        
        topic_ids = request.query_params.getlist('topic_id')
        if not topic_ids and topic_id:
            topic_ids = topic_id.split(',')

        qs = AptitudeQuestion.objects.all().select_related('topic')
        
        if topic_ids:
            # Enhanced filtering: Include subtopics recursively if a parent topic is selected
            all_topic_ids = set()
            for tid in topic_ids:
                try:
                    all_topic_ids.add(int(tid))
                    # Get all subtopics (recursive-ish, 2 levels deep is enough for our structure)
                    subtopic_ids = AptitudeTopic.objects.filter(
                        Q(parent_id=tid) | Q(parent__parent_id=tid)
                    ).values_list('id', flat=True)
                    all_topic_ids.update(subtopic_ids)
                except ValueError:
                    continue
            qs = qs.filter(topic_id__in=all_topic_ids)

        if difficulty and difficulty != 'all' and difficulty != 'All':
            qs = qs.filter(difficulty__iexact=difficulty)
        if search:
            qs = qs.filter(question_text__icontains=search)
            
        solved_ids = []
        if is_student:
            solved_ids = list(SolvedAptitude.objects.filter(student=profile).values_list('question_id', flat=True))
            if solved_status == 'solved':
                qs = qs.filter(id__in=solved_ids)
            elif solved_status == 'unsolved':
                qs = qs.exclude(id__in=solved_ids)
            
        data = []
        # Limit the queryset to avoid memory issues, but use a larger default
        try:
            limit = int(limit)
        except ValueError:
            limit = 1000
            
        for q in qs[:limit]:
            data.append({
                "id": q.id,
                "topic": q.topic.title,
                "topic_id": q.topic.id,
                "question_text": q.question_text,
                "difficulty": q.difficulty,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "is_solved": q.id in solved_ids
            })
            
        return Response(data)

class AptitudeQuestionSubmitView(APIView):
    """Verify an aptitude question answer and record progress"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        question_id = request.data.get('question_id')
        selected_option = request.data.get('selected_option')
        
        if not question_id or not selected_option:
            return Response({"error": "question_id and selected_option are required"}, status=400)
            
        question = get_object_or_404(AptitudeQuestion, id=question_id)
        is_correct = question.correct_option.upper() == selected_option.upper()
        
        if is_correct:
            if hasattr(request.user, 'student_profile'):
                profile = request.user.student_profile
                SolvedAptitude.objects.get_or_create(
                    student=profile,
                    question=question
                )
                
                # Check for aptitude achievements
                total_aptitude_solved = SolvedAptitude.objects.filter(student=profile).count()
                unearned = Achievement.objects.filter(category='aptitude').exclude(userachievement__user=request.user)
                for ach in unearned:
                    should_award = False
                    if ach.criteria_type == 'aptitude_solve_count' and total_aptitude_solved >= ach.criteria_value:
                        should_award = True
                    elif ach.criteria_type == 'quant_solve_count':
                        # Check if category is quantitative
                        # Using topic__parent__parent because QUANTITATIVE is at the root (Level 1)
                        is_quant = False
                        t = question.topic
                        while t:
                            if 'QUANTITATIVE' in t.title.upper():
                                is_quant = True
                                break
                            t = t.parent
                        
                        if is_quant:
                            quant_solved = SolvedAptitude.objects.filter(
                                student=profile, 
                                question__topic__id__in=AptitudeTopic.objects.filter(title__icontains='QUANTITATIVE').values_list('id', flat=True)
                            ).count()
                            if quant_solved >= ach.criteria_value:
                                should_award = True
                    
                    if should_award:
                        UserAchievement.objects.get_or_create(user=request.user, achievement=ach)
        
        return Response({
            "is_correct": is_correct,
            "correct_option": question.correct_option,
            "explanation": question.explanation
        })


# ---------------------------------------------------------------------------
# PDF Report Generation
# ---------------------------------------------------------------------------

class StudentReportPDFView(APIView):
    """Generate a professional PDF performance report for a student with filtering options."""
    permission_classes = [IsAuthenticated]

    def get(self, request, register_number):
        # Check if user is staff (HOD or staff)
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=403)

        staff_profile = request.user.staff_profile

        # Get student
        student = get_object_or_404(StudentProfile, register_number=register_number)
        
        # Access control
        if student.institution != staff_profile.institution:
            return Response({"detail": "Access denied."}, status=403)
        if staff_profile.role == 'hod' and student.department != staff_profile.department:
            return Response({"detail": "Access denied (Department mismatch)."}, status=403)

        # Get filter parameters
        report_type = request.GET.get('type', 'overall')  # overall, aptitude, programming, contests
        topic_filter = request.GET.get('topic', '')
        date_from = request.GET.get('date_from', '')
        date_to = request.GET.get('date_to', '')

        # Create PDF with enhanced template and watermark
        buffer = BytesIO()
        doc = create_watermarked_pdf(
            buffer, 
            institution=student.institution,
            pagesize=A4, 
            topMargin=1.6*inch, 
            bottomMargin=0.6*inch
        )
        
        # Custom styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=1,  # Center
            textColor=colors.HexColor('#2d5016')
        )
        
        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.HexColor('#39482a')
        )
        
        elements = []
        
        # College Header
        institution = student.institution
        display_name = institution.display_name or institution.name
        elements.append(Paragraph(f"{display_name}", title_style))
        
        if institution.subheading:
            elements.append(Paragraph(f"{institution.subheading}", styles['Normal']))
        
        if institution.address:
            elements.append(Paragraph(f"{institution.address}", styles['Normal']))
        
        contact_info = []
        if institution.contact_email:
            contact_info.append(f"Email: {institution.contact_email}")
        if institution.contact_phone:
            contact_info.append(f"Phone: {institution.contact_phone}")
        if institution.website:
            contact_info.append(f"Website: {institution.website}")
        
        if contact_info:
            elements.append(Paragraph(" | ".join(contact_info), styles['Normal']))
        
        elements.append(Spacer(1, 0.3 * inch))
        
        # Report Title
        report_titles = {
            'overall': 'Comprehensive Student Performance Report',
            'aptitude': 'Aptitude Assessment Performance Report',
            'programming': 'Programming Performance Report',
            'contests': 'Contest Participation Report'
        }
        elements.append(Paragraph(report_titles.get(report_type, 'Student Performance Report'), title_style))
        elements.append(Spacer(1, 0.2 * inch))
        
        # Student Information
        elements.append(Paragraph("Student Information", header_style))
        student_data = [
            ["Name:", student.name],
            ["Register Number:", student.register_number],
            ["Department:", student.department.name if student.department else 'N/A'],
            ["Batch:", student.batch or 'N/A'],
            ["Report Period:", f"{date_from or 'All time'} to {date_to or 'Present'}"],
        ]
        
        if topic_filter:
            student_data.append(["Topic Filter:", topic_filter])
            
        student_table = Table(student_data, colWidths=[2*inch, 4*inch])
        student_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(student_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Get filtered data based on report type and filters
        report_data = self._get_filtered_student_data(student, report_type, topic_filter, date_from, date_to)
        
        # Performance Metrics
        elements.append(Paragraph("Performance Metrics", header_style))
        metrics_data = [
            ["Metric", "Value", "Details"],
            ["Problems Solved", str(report_data['total_solved']), f"Easy: {report_data['easy']}, Medium: {report_data['medium']}, Hard: {report_data['hard']}"],
            ["Current Streak", f"{report_data['current_streak']} days", f"Campus Rank: #{report_data['campus_rank']}"],
            ["Success Rate", f"{report_data['success_rate']:.1f}%", f"Based on {report_data['total_attempts']} attempts"],
        ]
        
        if report_type in ['aptitude', 'overall']:
            metrics_data.extend([
                ["Aptitude Questions", str(report_data['aptitude_solved']), f"Out of {report_data['total_aptitude']} ({report_data['aptitude_percentage']:.1f}%)"],
            ])
            
        if report_type in ['contests', 'overall']:
            metrics_data.extend([
                ["Contest Participation", str(report_data['contests_participated']), f"Total submissions: {report_data['contest_submissions']}"],
            ])
            
        metrics_table = Table(metrics_data, colWidths=[2.5*inch, 1.5*inch, 2.5*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Skills & Topics Analysis
        if report_data['top_skills']:
            elements.append(Paragraph("Skills & Topics Mastery", header_style))
            skills_data = [["Skill/Topic", "Problems Solved", "Proficiency"]]
            for skill_info in report_data['top_skills'][:8]:
                proficiency = "Expert" if skill_info['count'] >= 10 else "Intermediate" if skill_info['count'] >= 5 else "Beginner"
                skills_data.append([
                    skill_info['skill'],
                    str(skill_info['count']),
                    proficiency
                ])
            
            skills_table = Table(skills_data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch])
            skills_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(skills_table)
            elements.append(Spacer(1, 0.3 * inch))

        # Company Readiness
        if report_data['top_companies']:
            elements.append(Paragraph("Company Readiness", header_style))
            company_text = "Target Companies: " + ", ".join([f"{comp['company']} ({comp['count']} problems)" for comp in report_data['top_companies'][:5]])
            elements.append(Paragraph(company_text, styles['Normal']))
            elements.append(Spacer(1, 0.2 * inch))

        # Recent Activity Summary
        if report_data['recent_activities']:
            elements.append(Paragraph("Recent Activity (Last 30 Days)", header_style))
            activity_data = [["Date", "Activity", "Problem/Contest", "Result"]]
            for activity in report_data['recent_activities'][:10]:
                activity_data.append([
                    activity['date'],
                    activity['type'],
                    activity['subject'],
                    activity['result']
                ])
            
            activity_table = Table(activity_data, colWidths=[1.2*inch, 1.5*inch, 2*inch, 1.8*inch])
            activity_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(activity_table)

        # Footer
        elements.append(Spacer(1, 0.5 * inch))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=1
        )
        elements.append(Paragraph(f"Report generated on {timezone.now().strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        elements.append(Paragraph(f"Generated by: {staff_profile.name} ({staff_profile.faculty_id})", footer_style))

        doc.build(elements)
        buffer.seek(0)
        
        # Generate filename based on filters
        filename_parts = [f"Student_Report_{student.register_number}"]
        if report_type != 'overall':
            filename_parts.append(report_type.title())
        if topic_filter:
            filename_parts.append(topic_filter.replace(' ', '_'))
        filename_parts.append(timezone.now().strftime('%Y%m%d'))
        
        filename = "_".join(filename_parts) + ".pdf"
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _get_filtered_student_data(self, student, report_type, topic_filter, date_from, date_to):
        """Get comprehensive student data based on filters."""
        from datetime import datetime, timedelta
        from django.db.models import Q, Count
        
        # Date filtering
        date_filter = Q()
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                date_filter &= Q(solved_at__gte=date_from_obj)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                date_filter &= Q(solved_at__lte=date_to_obj)
            except ValueError:
                pass

        # Get solved problems with filters
        solved_problems = SolvedProblem.objects.filter(student=student)
        if date_filter:
            solved_problems = solved_problems.filter(date_filter)

        # Topic filtering
        if topic_filter:
            solved_problems = solved_problems.filter(problem__tags__icontains=topic_filter)

        # Calculate metrics
        total_solved = solved_problems.count()
        difficulty_counts = {'Easy': 0, 'Medium': 0, 'Hard': 0}
        company_counts = {}
        skill_counts = {}

        for sp in solved_problems.select_related('problem'):
            d = sp.problem.difficulty or 'Medium'
            difficulty_counts[d] = difficulty_counts.get(d, 0) + 1
            
            # Companies
            comps = sp.problem.companies or ""
            clist = [c.strip() for c in comps.replace(',', ' ').split() if c.strip()]
            for c in clist: 
                company_counts[c] = company_counts.get(c, 0) + 1
            
            # Skills
            tags = sp.problem.tags or []
            for t in tags: 
                skill_counts[t.lower()] = skill_counts.get(t.lower(), 0) + 1

        # Aptitude metrics
        aptitude_solved = SolvedAptitude.objects.filter(student=student)
        if date_filter:
            # Use solved_at field for aptitude questions
            date_filter_aptitude = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_aptitude &= Q(solved_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_aptitude &= Q(solved_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_aptitude:
                aptitude_solved = aptitude_solved.filter(date_filter_aptitude)
        aptitude_count = aptitude_solved.count()
        total_aptitude = AptitudeQuestion.objects.count()
        aptitude_percentage = (aptitude_count / total_aptitude * 100) if total_aptitude > 0 else 0

        # Contest metrics
        contest_participations = ContestParticipation.objects.filter(student=student)
        if date_filter:
            # Use started_at field for date filtering on contest participations
            date_filter_contests = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_contests &= Q(started_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_contests &= Q(started_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_contests:
                contest_participations = contest_participations.filter(date_filter_contests)
        
        contests_participated = contest_participations.count()
        contest_submissions = ContestSubmission.objects.filter(student=student)
        if date_filter:
            # Use submitted_at field for contest submissions
            date_filter_submissions = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_submissions &= Q(submitted_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_submissions &= Q(submitted_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_submissions:
                contest_submissions = contest_submissions.filter(date_filter_submissions)
        contest_submission_count = contest_submissions.count()

        # Calculate success rate based on solved problems vs execution records
        total_attempts = ExecutionRecord.objects.filter(student=student)
        if date_filter:
            # Use created_at field for execution records
            date_filter_attempts = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_attempts &= Q(created_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_attempts &= Q(created_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_attempts:
                total_attempts = total_attempts.filter(date_filter_attempts)
        total_attempt_count = total_attempts.count()
        success_rate = (total_solved / total_attempt_count * 100) if total_attempt_count > 0 else 0

        # Top skills and companies
        top_skills = [{'skill': skill.title(), 'count': count} for skill, count in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)]
        top_companies = [{'company': comp, 'count': count} for comp, count in sorted(company_counts.items(), key=lambda x: x[1], reverse=True)]

        # Recent activities
        recent_activities = []
        recent_solved = solved_problems.filter(
            solved_at__gte=timezone.now() - timedelta(days=30)
        ).order_by('-solved_at')[:20]
        
        for sp in recent_solved:
            recent_activities.append({
                'date': sp.solved_at.strftime('%m/%d'),
                'type': 'Problem Solved',
                'subject': sp.problem.title[:30],
                'result': 'Success'
            })

        return {
            'total_solved': total_solved,
            'easy': difficulty_counts['Easy'],
            'medium': difficulty_counts['Medium'],
            'hard': difficulty_counts['Hard'],
            'current_streak': student.current_streak,
            'campus_rank': calculate_campus_rank_helper(student),
            'success_rate': success_rate,
            'total_attempts': total_attempt_count,
            'aptitude_solved': aptitude_count,
            'total_aptitude': total_aptitude,
            'aptitude_percentage': aptitude_percentage,
            'contests_participated': contests_participated,
            'contest_submissions': contest_submission_count,
            'top_skills': top_skills,
            'top_companies': top_companies,
            'recent_activities': recent_activities,
        }


class StaffReportPDFView(APIView):
    """Generate a comprehensive PDF performance report with filtering options."""
    permission_classes = [IsAuthenticated]

    def get(self, request, faculty_id):
        # Check if user is staff (HOD or self)
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=403)

        user_profile = request.user.staff_profile
        target_staff = get_object_or_404(StaffProfile, faculty_id=faculty_id)

        # Access control
        if user_profile.role == 'hod' and target_staff.department != user_profile.department:
            return Response({"detail": "Access denied."}, status=403)
        if target_staff.institution != user_profile.institution:
            return Response({"detail": "Access denied."}, status=403)

        # Get filter parameters
        batch_filter = request.GET.get('batch', '')
        report_type = request.GET.get('type', 'overall')  # overall, aptitude, programming, contests
        topic_filter = request.GET.get('topic', '')
        date_from = request.GET.get('date_from', '')
        date_to = request.GET.get('date_to', '')

        # Create PDF with enhanced template and watermark
        buffer = BytesIO()
        doc = create_watermarked_pdf(
            buffer, 
            institution=target_staff.institution,
            pagesize=A4, 
            topMargin=1.6*inch, 
            bottomMargin=0.6*inch
        )
        
        # Custom styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=30,
            alignment=1,  # Center
            textColor=colors.HexColor('#2d5016')
        )
        
        header_style = ParagraphStyle(
            'CustomHeader',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=12,
            textColor=colors.HexColor('#39482a')
        )
        
        elements = []
        
        # College Header
        institution = target_staff.institution
        display_name = institution.display_name or institution.name
        elements.append(Paragraph(f"{display_name}", title_style))
        
        if institution.subheading:
            elements.append(Paragraph(f"{institution.subheading}", styles['Normal']))
        
        if institution.address:
            elements.append(Paragraph(f"{institution.address}", styles['Normal']))
        
        contact_info = []
        if institution.contact_email:
            contact_info.append(f"Email: {institution.contact_email}")
        if institution.contact_phone:
            contact_info.append(f"Phone: {institution.contact_phone}")
        if institution.website:
            contact_info.append(f"Website: {institution.website}")
        
        if contact_info:
            elements.append(Paragraph(" | ".join(contact_info), styles['Normal']))
        
        elements.append(Spacer(1, 0.3 * inch))
        
        # Report Title
        report_titles = {
            'overall': 'Comprehensive Faculty Performance Report',
            'aptitude': 'Aptitude Assessment Performance Report',
            'programming': 'Programming Contest Performance Report',
            'contests': 'Contest Management Report'
        }
        elements.append(Paragraph(report_titles.get(report_type, 'Faculty Performance Report'), title_style))
        elements.append(Spacer(1, 0.2 * inch))
        
        # Faculty Information
        elements.append(Paragraph("Faculty Information", header_style))
        faculty_data = [
            ["Name:", target_staff.name],
            ["Faculty ID:", target_staff.faculty_id],
            ["Department:", target_staff.department.name if target_staff.department else 'N/A'],
            ["Role:", target_staff.get_role_display() if hasattr(target_staff, 'get_role_display') else target_staff.role],
            ["Report Period:", f"{date_from or 'All time'} to {date_to or 'Present'}"],
        ]
        
        if batch_filter:
            faculty_data.append(["Batch Filter:", batch_filter])
        if topic_filter:
            faculty_data.append(["Topic Filter:", topic_filter])
            
        faculty_table = Table(faculty_data, colWidths=[2*inch, 4*inch])
        faculty_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(faculty_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Get filtered data based on report type and filters
        report_data = self._get_filtered_report_data(target_staff, report_type, batch_filter, topic_filter, date_from, date_to)
        
        # Performance Metrics
        elements.append(Paragraph("Performance Metrics", header_style))
        metrics_data = [
            ["Metric", "Value", "Details"],
            ["Total Students Managed", str(report_data['student_count']), f"Across {report_data['batch_count']} batches"],
            ["Contests Created", str(report_data['total_contests']), f"{report_data['active_contests']} active"],
            ["Student Submissions", str(report_data['total_submissions']), f"Avg: {report_data['avg_submissions_per_student']:.1f} per student"],
            ["Problems Solved", str(report_data['total_problems_solved']), f"Success rate: {report_data['success_rate']:.1f}%"],
        ]
        
        if report_type in ['aptitude', 'overall']:
            metrics_data.extend([
                ["Aptitude Tests Conducted", str(report_data['aptitude_tests']), f"{report_data['aptitude_participants']} participants"],
                ["Avg Aptitude Score", f"{report_data['avg_aptitude_score']:.1f}%", f"Best: {report_data['best_aptitude_score']:.1f}%"],
            ])
            
        metrics_table = Table(metrics_data, colWidths=[2.5*inch, 1.5*inch, 2.5*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(metrics_table)
        elements.append(Spacer(1, 0.3 * inch))

        # Batch-wise Performance (if applicable)
        if report_data['batch_performance']:
            elements.append(Paragraph("Batch-wise Performance", header_style))
            batch_data = [["Batch", "Students", "Avg Score", "Top Performer", "Completion Rate"]]
            for batch_info in report_data['batch_performance']:
                batch_data.append([
                    batch_info['batch'],
                    str(batch_info['student_count']),
                    f"{batch_info['avg_score']:.1f}%",
                    batch_info['top_performer'],
                    f"{batch_info['completion_rate']:.1f}%"
                ])
            
            batch_table = Table(batch_data, colWidths=[1.2*inch, 1*inch, 1.2*inch, 1.8*inch, 1.3*inch])
            batch_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(batch_table)
            elements.append(Spacer(1, 0.3 * inch))

        # Recent Activity Summary
        if report_data['recent_activities']:
            elements.append(Paragraph("Recent Activity (Last 30 Days)", header_style))
            activity_data = [["Date", "Activity", "Student/Contest", "Result"]]
            for activity in report_data['recent_activities'][:10]:  # Show top 10
                activity_data.append([
                    activity['date'],
                    activity['type'],
                    activity['subject'],
                    activity['result']
                ])
            
            activity_table = Table(activity_data, colWidths=[1.2*inch, 1.5*inch, 2*inch, 1.8*inch])
            activity_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
                ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#d0d9c2')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
            ]))
            elements.append(activity_table)

        # Footer
        elements.append(Spacer(1, 0.5 * inch))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=1
        )
        elements.append(Paragraph(f"Report generated on {timezone.now().strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        elements.append(Paragraph(f"Generated by: {user_profile.name} ({user_profile.faculty_id})", footer_style))

        doc.build(elements)
        buffer.seek(0)
        
        # Generate filename based on filters
        filename_parts = [f"Report_{target_staff.faculty_id}"]
        if batch_filter:
            filename_parts.append(f"Batch_{batch_filter}")
        if report_type != 'overall':
            filename_parts.append(report_type.title())
        filename_parts.append(timezone.now().strftime('%Y%m%d'))
        
        filename = "_".join(filename_parts) + ".pdf"
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    def _get_filtered_report_data(self, staff, report_type, batch_filter, topic_filter, date_from, date_to):
        """Get comprehensive report data based on filters."""
        from datetime import datetime, timedelta
        from django.db.models import Q, Avg, Count, Sum
        
        # Base queryset for students
        students_qs = StudentProfile.objects.filter(
            department=staff.department if staff.department else None
        )
        
        if batch_filter:
            students_qs = students_qs.filter(batch=batch_filter)
            
        # Date filtering
        date_filter = Q()
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                date_filter &= Q(created_at__date__gte=date_from_obj)
            except ValueError:
                pass
                
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                date_filter &= Q(created_at__date__lte=date_to_obj)
            except ValueError:
                pass

        # Get contests created by this staff
        contests_qs = staff.contests.all()
        if date_filter:
            contests_qs = contests_qs.filter(date_filter)

        # Calculate metrics
        student_count = students_qs.count()
        batch_count = students_qs.values('batch').distinct().count()
        total_contests = contests_qs.count()
        active_contests = contests_qs.filter(status='published').count()

        # Submission metrics
        submissions = ExecutionRecord.objects.filter(
            student__in=students_qs
        )
        if date_filter:
            submissions = submissions.filter(date_filter)
            
        total_submissions = submissions.count()
        # Use SolvedProblem for successful submissions instead
        successful_problems = SolvedProblem.objects.filter(student__in=students_qs)
        if date_filter:
            # Use solved_at field for SolvedProblem
            date_filter_solved = Q()
            if date_from:
                try:
                    date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                    date_filter_solved &= Q(solved_at__date__gte=date_from_obj)
                except ValueError:
                    pass
            if date_to:
                try:
                    date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                    date_filter_solved &= Q(solved_at__date__lte=date_to_obj)
                except ValueError:
                    pass
            if date_filter_solved:
                successful_problems = successful_problems.filter(date_filter_solved)
        successful_submissions = successful_problems.count()
        avg_submissions_per_student = total_submissions / student_count if student_count > 0 else 0
        success_rate = (successful_submissions / total_submissions * 100) if total_submissions > 0 else 0

        # Problem solving metrics
        solved_problems = SolvedProblem.objects.filter(student__in=students_qs)
        if date_filter:
            # Use solved_at field for SolvedProblem
            if date_filter_solved:
                solved_problems = solved_problems.filter(date_filter_solved)
        total_problems_solved = solved_problems.count()

        # Aptitude metrics
        aptitude_data = {'aptitude_tests': 0, 'aptitude_participants': 0, 'avg_aptitude_score': 0, 'best_aptitude_score': 0}
        if report_type in ['aptitude', 'overall']:
            aptitude_contests = contests_qs.filter(contest_type='aptitude')
            aptitude_submissions = ContestSubmission.objects.filter(
                contest__in=aptitude_contests,
                student__in=students_qs
            )
            if date_filter:
                # Use submitted_at field for contest submissions
                date_filter_aptitude_submissions = Q()
                if date_from:
                    try:
                        date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                        date_filter_aptitude_submissions &= Q(submitted_at__date__gte=date_from_obj)
                    except ValueError:
                        pass
                if date_to:
                    try:
                        date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                        date_filter_aptitude_submissions &= Q(submitted_at__date__lte=date_to_obj)
                    except ValueError:
                        pass
                if date_filter_aptitude_submissions:
                    aptitude_submissions = aptitude_submissions.filter(date_filter_aptitude_submissions)
                
            aptitude_data.update({
                'aptitude_tests': aptitude_contests.count(),
                'aptitude_participants': aptitude_submissions.values('student').distinct().count(),
                'avg_aptitude_score': aptitude_submissions.aggregate(avg=Avg('score'))['avg'] or 0,
                'best_aptitude_score': aptitude_submissions.aggregate(max=Max('score'))['max'] or 0,
            })

        # Batch-wise performance
        batch_performance = []
        for batch in students_qs.values('batch').distinct():
            batch_name = batch['batch']
            batch_students = students_qs.filter(batch=batch_name)
            batch_submissions = submissions.filter(student__in=batch_students)
            
            # Calculate success rate based on solved problems vs total submissions
            batch_solved = successful_problems.filter(student__in=batch_students)
            batch_success_rate = 0
            if batch_submissions.exists():
                batch_success_rate = (batch_solved.count() / batch_submissions.count() * 100)
            
            # Find top performer in batch
            top_performer = batch_students.annotate(
                solved_count=Count('solved_problems')
            ).order_by('-solved_count').first()
            
            batch_performance.append({
                'batch': batch_name,
                'student_count': batch_students.count(),
                'avg_score': batch_success_rate,
                'top_performer': top_performer.name if top_performer else 'N/A',
                'completion_rate': batch_success_rate
            })

        # Recent activities
        recent_activities = []
        recent_submissions = submissions.filter(
            created_at__gte=timezone.now() - timedelta(days=30)
        ).order_by('-created_at')[:20]
        
        for sub in recent_submissions:
            # Check if this submission resulted in a solved problem
            is_success = successful_problems.filter(
                student=sub.student, 
                problem=sub.problem,
                solved_at__date=sub.created_at.date()
            ).exists()
            
            recent_activities.append({
                'date': sub.created_at.strftime('%m/%d'),
                'type': 'Problem Solved' if is_success else 'Attempt',
                'subject': f"{sub.student.name} - {sub.problem.title[:30] if sub.problem else 'Unknown Problem'}",
                'result': 'Success' if is_success else 'Failed'
            })

        return {
            'student_count': student_count,
            'batch_count': batch_count,
            'total_contests': total_contests,
            'active_contests': active_contests,
            'total_submissions': total_submissions,
            'avg_submissions_per_student': avg_submissions_per_student,
            'success_rate': success_rate,
            'total_problems_solved': total_problems_solved,
            'batch_performance': batch_performance,
            'recent_activities': recent_activities,
            **aptitude_data
        }


# ---------------------------------------------------------------------------
# System Administration & Multi-Tenancy
# ---------------------------------------------------------------------------

class SystemAdminDashboardView(APIView):
    permission_classes = [AllowAny]  # In production, restrict to system admins

    def get(self, request):
        try:
            total_students = StudentProfile.objects.count()
            total_staff = StaffProfile.objects.count()
            total_problems = Problem.objects.count()
            total_aptitude = AptitudeQuestion.objects.count()
            
            # Fetch all institutions for the management table
            institutions = Institution.objects.all().values(
                'id', 'institution_id', 'name', 'short_code', 'is_active',
                'maintenance_staff', 'maintenance_students', 'maintenance_hod'
            )

            # Global maintenance config
            config, _ = SystemConfiguration.objects.get_or_create(id=1)
            
            return Response({
                "metrics": {
                    "total_users": total_students + total_staff,
                    "total_staff": total_staff,
                    "total_problems": total_problems,
                    "total_aptitude": total_aptitude
                },
                "institutions": list(institutions),
                "global_config": {
                    "staff": config.global_maintenance_staff,
                    "student": config.global_maintenance_students,
                    "hod": config.global_maintenance_hod
                }
            })
        except Exception as e:
            logger.error(f"Admin dashboard error: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class InstitutionManagementView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        """Create a new institution and its database"""
        data = request.data
        try:
            inst_id = data.get('institution_id')
            name = data.get('name')
            short_code = data.get('short_code', '')
            address = data.get('address', '')
            contact_email = data.get('contact_email', '')
            contact_phone = data.get('contact_phone', '')
            
            if not inst_id or not name:
                return Response({"error": "ID and Name required"}, status=400)
            
            # Sanitize DB name
            db_name = f"code2day_inst_{inst_id}"
            
            # Create Institution record
            institution = Institution.objects.create(
                institution_id=inst_id,
                name=name,
                short_code=short_code,
                address=address,
                contact_email=contact_email,
                contact_phone=contact_phone,
                database_name=db_name
            )
            
            # Create the actual database
            create_institution_db(db_name)
            
            return Response({"message": "Institution created", "id": institution.id})
        except Exception as e:
            logger.error(f"Failed to create institution: {e}")
            return Response({"error": str(e)}, status=500)

    def delete(self, request, pk):
        """Delete institution and its database"""
        try:
            institution = get_object_or_404(Institution, pk=pk)
            db_name = institution.database_name
            
            # Delete database first
            if db_name:
                delete_institution_db(db_name)
            
            institution.delete()
            return Response({"message": "Institution deleted"})
        except Exception as e:
            logger.error(f"Failed to delete institution: {e}")
            return Response({"error": str(e)}, status=500)

class InstitutionDetailManagementView(APIView):
    """Management within a specific institution"""
    permission_classes = [AllowAny]

    def get(self, request, pk):
        institution = get_object_or_404(Institution, pk=pk)
        
        # Get actual student count
        students_count = StudentProfile.objects.filter(institution=institution).count()
        
        # Get staff and HODs (Excluding default administrator '0001')
        staff_list = StaffProfile.objects.filter(institution=institution).exclude(faculty_id='0001').values(
            'id', 'faculty_id', 'name', 'role', 'department__name', 'department__id', 'department__code'
        )
        
        # Get departments
        depts = Department.objects.filter(institution=institution).values('id', 'name', 'code')
        
        # Get students
        student_list = []
        batches = set()
        for s in StudentProfile.objects.filter(institution=institution).select_related('account', 'department'):
            if s.batch:
                batches.add(s.batch)
            student_list.append({
                'id': s.id,
                'name': s.name,
                'register_number': s.register_number,
                'personal_email': s.personal_email,
                'mobile_number': s.mobile_number,
                'department_id': s.department_id,
                'batch': s.batch,
                'is_active': s.account.is_active if s.account else True
            })
        
        return Response({
            "staff": list(staff_list),
            "students": list(student_list),
            "departments": list(depts),
            "batches": sorted(list(batches)),
            "maintenance": {
                "staff": institution.maintenance_staff,
                "student": institution.maintenance_students,
                "hod": institution.maintenance_hod,
                "inst_admin": institution.maintenance_inst_admin,
                "ja": institution.maintenance_ja
            },
            "branding": {
                "display_name": institution.display_name,
                "subheading": institution.subheading,
                "logo_url": institution.logo_url,
                "logo_display_url": institution.logo_display_url,
                "website": institution.website,
                "established_year": institution.established_year,
                "address": institution.address,
                "contact_email": institution.contact_email,
                "contact_phone": institution.contact_phone
            },
            "metrics": {
                "students": students_count,
                "staff": StaffProfile.objects.filter(institution=institution).count(),
                "departments": depts.count()
            }
        })

    def patch(self, request, pk):
        """Update institution maintenance or staff roles/depts"""
        institution = get_object_or_404(Institution, pk=pk)
        action = request.data.get('action')
        
        if action == 'toggle_maintenance':
            role = request.data.get('role')
            value = request.data.get('value')
            if role == 'staff': institution.maintenance_staff = value
            elif role == 'student': institution.maintenance_students = value
            elif role == 'hod': institution.maintenance_hod = value
            elif role == 'inst_admin': institution.maintenance_inst_admin = value
            elif role == 'ja': institution.maintenance_ja = value
            institution.save()
            return Response({"message": "Maintenance updated"})
            
        elif action == 'update_role':
            staff_id = request.data.get('staff_id')
            new_role = request.data.get('role')
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            staff.role = new_role
            staff.save()
            return Response({"message": "Role updated"})

        elif action == 'update_dept':
            staff_id = request.data.get('staff_id')
            dept_id = request.data.get('dept_id')
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            if dept_id:
                dept = get_object_or_404(Department, id=dept_id, institution=institution)
                staff.department = dept
            else:
                staff.department = None
            staff.save()
            return Response({"message": "Department updated"})
            
        elif action == 'toggle_student_lock':
            student_id = request.data.get('student_id')
            student = get_object_or_404(StudentProfile, id=student_id, institution=institution)
            if student.account:
                student.account.is_active = not student.account.is_active
                student.account.save(update_fields=['is_active'])
            return Response({"message": f"Student {'unlocked' if student.account.is_active else 'locked'}"})
            
        elif action == 'delete_batch':
            batch_name = request.data.get('batch')
            dept_id = request.data.get('dept_id')
            
            queryset = StudentProfile.objects.filter(institution=institution, batch=batch_name)
            if dept_id:
                queryset = queryset.filter(department_id=dept_id)
            
            # Delete associated users (this will cascade delete profiles)
            user_ids = queryset.filter(account__isnull=False).values_list('account_id', flat=True)
            from django.contrib.auth.models import User
            User.objects.filter(id__in=user_ids).delete()
            # Delete any remaining profiles that had no account
            queryset.delete()
            
            return Response({"message": f"Batch {batch_name} deleted successfully"})
            
        elif action == 'update_branding':
            # Update branding information
            branding_data = request.data.get('branding', {})
            
            institution.display_name = branding_data.get('display_name', institution.display_name)
            institution.subheading = branding_data.get('subheading', institution.subheading)
            institution.logo_url = branding_data.get('logo_url', institution.logo_url)
            institution.website = branding_data.get('website', institution.website)
            institution.established_year = branding_data.get('established_year', institution.established_year)
            institution.address = branding_data.get('address', institution.address)
            institution.contact_email = branding_data.get('contact_email', institution.contact_email)
            institution.contact_phone = branding_data.get('contact_phone', institution.contact_phone)
            
            institution.save()
            return Response({"message": "Branding updated successfully"})
            
        elif action == 'upload_logo':
            # Handle logo file upload
            if 'logo' not in request.FILES:
                return Response({"error": "No logo file provided"}, status=400)
            
            logo_file = request.FILES['logo']
            
            # Validate file type
            allowed_types = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
            if logo_file.content_type not in allowed_types:
                return Response({"error": "Invalid file type. Please upload JPG, PNG, or GIF."}, status=400)
            
            # Validate file size (max 5MB)
            if logo_file.size > 5 * 1024 * 1024:
                return Response({"error": "File too large. Maximum size is 5MB."}, status=400)
            
            # Delete old logo file if exists
            if institution.logo_file:
                institution.logo_file.delete(save=False)
            
            # Save new logo
            institution.logo_file = logo_file
            institution.save()
            
            return Response({
                "message": "Logo uploaded successfully",
                "logo_url": institution.logo_display_url
            })
            
        return Response({"error": "Invalid action"}, status=400)

class GlobalMaintenanceControlView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        config, _ = SystemConfiguration.objects.get_or_create(id=1)
        role = request.data.get('role')
        value = request.data.get('value')
        
        if role == 'staff': config.global_maintenance_staff = value
        elif role == 'student': config.global_maintenance_students = value
        elif role == 'hod': config.global_maintenance_hod = value
        
        config.save()
        return Response({"message": "Global maintenance updated"})


class InstitutionBrandingPreviewView(APIView):
    """Generate PDF template preview for institution branding"""
    permission_classes = [AllowAny]
    
    def get(self, request, pk):
        institution = get_object_or_404(Institution, pk=pk)
        
        # Create PDF template preview with watermark
        buffer = BytesIO()
        doc = create_watermarked_pdf(
            buffer, 
            institution=institution,
            pagesize=A4, 
            topMargin=0.5*inch, 
            bottomMargin=0.5*inch
        )
        
        # Custom styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=1,  # Center
            textColor=colors.HexColor('#2d5016')
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Heading2'],
            fontSize=16,
            spaceAfter=20,
            alignment=1,  # Center
            textColor=colors.HexColor('#4f7942')
        )
        
        elements = []
        
        # College Header with Logo (if available)
        header_data = []
        
        # Logo section (left side)
        logo_cell = ""
        if institution.logo_display_url:
            try:
                # For now, we'll just show a placeholder for logo
                logo_cell = "LOGO"
            except:
                logo_cell = "LOGO"
        else:
            logo_cell = "LOGO"
        
        # College info section (right side)
        display_name = institution.get_display_name()
        info_lines = [display_name]
        
        if institution.subheading:
            info_lines.append(institution.subheading)
        
        if institution.address:
            info_lines.append(institution.address)
        
        contact_info = []
        if institution.contact_email:
            contact_info.append(f"Email: {institution.contact_email}")
        if institution.contact_phone:
            contact_info.append(f"Phone: {institution.contact_phone}")
        if institution.website:
            contact_info.append(f"Website: {institution.website}")
        
        if contact_info:
            info_lines.extend(contact_info)
        
        if institution.established_year:
            info_lines.append(f"Established: {institution.established_year}")
        
        # Create header table with logo on left, info on right
        header_table_data = [[logo_cell, "\n".join(info_lines)]]
        header_table = Table(header_table_data, colWidths=[1.5*inch, 5*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'CENTER'),  # Logo cell center
            ('ALIGN', (1, 0), (1, 0), 'LEFT'),    # Info cell left
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (0, 0), 14),
            ('FONTNAME', (1, 0), (1, 0), 'Helvetica'),
            ('FONTSIZE', (1, 0), (1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
        ]))
        
        elements.append(header_table)
        elements.append(Spacer(1, 0.5 * inch))
        
        # Sample Report Title
        elements.append(Paragraph("SAMPLE REPORT TEMPLATE", title_style))
        elements.append(Paragraph("This is how your college branding will appear in all generated reports", subtitle_style))
        elements.append(Spacer(1, 0.3 * inch))
        
        # Sample content
        sample_content = [
            "This template shows how your college branding information will be displayed in:",
            "• Student Performance Reports",
            "• Faculty Analytics Reports", 
            "• Contest Management Reports",
            "• All other PDF documents generated by the system",
            "",
            "The layout includes:",
            "• College logo positioned on the left",
            "• College name and details on the right",
            "• Professional formatting with consistent styling",
            "• Complete contact information",
            "",
            "You can customize all branding elements in the College Branding tab."
        ]
        
        for line in sample_content:
            if line:
                elements.append(Paragraph(line, styles['Normal']))
            else:
                elements.append(Spacer(1, 0.1 * inch))
        
        # Footer
        elements.append(Spacer(1, 0.5 * inch))
        footer_style = ParagraphStyle(
            'Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.grey,
            alignment=1
        )
        elements.append(Paragraph(f"Template generated on {timezone.now().strftime('%B %d, %Y at %I:%M %p')}", footer_style))
        
        doc.build(elements)
        buffer.seek(0)
        
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="College_Branding_Template_{institution.short_code}.pdf"'
        return response

class DepartmentManagementView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, inst_pk):
        institution = get_object_or_404(Institution, pk=inst_pk)
        name = request.data.get('name')
        code = request.data.get('code')
        
        if Department.objects.filter(code=code).exists():
            return Response({"error": "Code already exists"}, status=400)
            
        dept = Department.objects.create(institution=institution, name=name, code=code)
        return Response({"message": "Department added", "id": dept.id})

    def delete(self, request, inst_pk, pk):
        dept = get_object_or_404(Department, pk=pk, institution_id=inst_pk)
        dept.delete()
        return Response({"message": "Department deleted"})

class DiscussionThreadListView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        # Cleanup handled in global messages fetcher usually, but we filter here too
        cutoff = timezone.now() - timedelta(hours=24)
        messages = DiscussionMessage.objects.filter(
            thread_type="individual",
            created_at__gte=cutoff
        ).filter(
            Q(sender=request.user) | Q(recipient=request.user)
        ).order_by("-created_at")

        threads = {}
        for msg in messages:
            other_user = msg.recipient if msg.sender == request.user else msg.sender
            if not other_user:
                continue
            
            other_id = other_user.id
            if other_id not in threads:
                name = "Unknown"
                identifier = ""
                if hasattr(other_user, "student_profile"):
                    name = other_user.student_profile.name
                    identifier = other_user.student_profile.register_number
                elif hasattr(other_user, "staff_profile"):
                    name = other_user.staff_profile.name
                    identifier = other_user.staff_profile.faculty_id
                
                threads[other_id] = {
                    "other_user_id": other_id,
                    "other_user_name": name,
                    "other_user_reg": identifier,
                    "latest_message": msg.body[:50],
                    "timestamp": msg.created_at,
                    "unread_count": 0,
                    "is_self_latest": msg.sender == request.user
                }
            
            if msg.recipient == request.user and not msg.is_read:
                threads[other_id]["unread_count"] += 1

        thread_list = list(threads.values())
        thread_list.sort(key=lambda x: x["timestamp"], reverse=True)
        return Response(thread_list)

class StaffDeptListView(UnifiedAuthMixin, APIView):
    """Returns staff from the same department as the student for DM list."""
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        if profile_type == "student":
            staff_qs = StaffProfile.objects.filter(department=profile.department)
        else:
            staff_qs = StaffProfile.objects.filter(institution=profile.institution)
        
        data = []
        for s in staff_qs:
            data.append({
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.get_role_display(),
                "department": s.department.name if s.department else ""
            })
        return Response(data)


class CSRFTokenView(APIView):
    """
    Provides CSRF token for frontend authentication.
    """
    permission_classes = [AllowAny]
    
    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        from django.middleware.csrf import get_token
        token = get_token(request)
        return Response({"csrfToken": token})


# =============================================================================
# Password Reset and Public Views
# =============================================================================

class PasswordResetView(APIView):
    """
    Handle password reset requests for students and staff.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        """
        Reset password for a user (student or staff).
        """
        try:
            identifier = request.data.get('identifier', '').strip()
            user_type = request.data.get('user_type', 'student')  # 'student' or 'staff'
            
            if not identifier:
                return Response(
                    {'error': 'Identifier (register number or faculty ID) is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if user_type == 'student':
                # Find student by register number
                try:
                    student = StudentProfile.objects.get(register_number=identifier)
                    user = student.user
                    
                    # Generate a simple reset token (in production, use proper token generation)
                    reset_token = f"reset_{user.id}_{timezone.now().timestamp()}"
                    
                    return Response({
                        'message': 'Password reset initiated for student',
                        'user_type': 'student',
                        'identifier': identifier,
                        'reset_token': reset_token,
                        'instructions': 'Contact your administrator with this token to reset your password'
                    })
                    
                except StudentProfile.DoesNotExist:
                    return Response(
                        {'error': 'Student not found with this register number'}, 
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            elif user_type == 'staff':
                # Find staff by faculty ID
                try:
                    staff = StaffProfile.objects.get(faculty_id=identifier)
                    user = staff.user
                    
                    # Generate a simple reset token
                    reset_token = f"reset_{user.id}_{timezone.now().timestamp()}"
                    
                    return Response({
                        'message': 'Password reset initiated for staff',
                        'user_type': 'staff',
                        'identifier': identifier,
                        'reset_token': reset_token,
                        'instructions': 'Contact your administrator with this token to reset your password'
                    })
                    
                except StaffProfile.DoesNotExist:
                    return Response(
                        {'error': 'Staff not found with this faculty ID'}, 
                        status=status.HTTP_404_NOT_FOUND
                    )
            
            else:
                return Response(
                    {'error': 'Invalid user type. Must be "student" or "staff"'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
                
        except Exception as e:
            return Response(
                {'error': f'Password reset failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def put(self, request):
        """
        Complete password reset with token and new password.
        """
        try:
            reset_token = request.data.get('reset_token', '').strip()
            new_password = request.data.get('new_password', '').strip()
            
            if not reset_token or not new_password:
                return Response(
                    {'error': 'Reset token and new password are required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Parse the reset token (simplified - in production use proper token validation)
            if reset_token.startswith('reset_'):
                try:
                    parts = reset_token.split('_')
                    user_id = int(parts[1])
                    timestamp = float(parts[2])
                    
                    # Check if token is not too old (24 hours)
                    current_time = timezone.now().timestamp()
                    if current_time - timestamp > 86400:  # 24 hours
                        return Response(
                            {'error': 'Reset token has expired'}, 
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    
                    # Find and update user password
                    user = User.objects.get(id=user_id)
                    user.set_password(new_password)
                    user.save()
                    
                    return Response({
                        'message': 'Password reset successfully',
                        'username': user.username
                    })
                    
                except (ValueError, IndexError, User.DoesNotExist):
                    return Response(
                        {'error': 'Invalid reset token'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
            
            return Response(
                {'error': 'Invalid reset token format'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
                
        except Exception as e:
            return Response(
                {'error': f'Password reset completion failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PublicInstitutionListView(APIView):
    """
    Public endpoint to list all institutions.
    Used for registration and public information.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        """
        Get list of all institutions with basic information.
        """
        try:
            # Get query parameters for filtering
            search = request.query_params.get('search', '').strip()
            active_only = request.query_params.get('active_only', 'true').lower() == 'true'
            
            # Base queryset
            institutions = Institution.objects.all()
            
            # Filter by active status if requested
            if active_only:
                institutions = institutions.filter(is_active=True)
            
            # Search filter
            if search:
                institutions = institutions.filter(
                    Q(name__icontains=search) |
                    Q(code__icontains=search) |
                    Q(location__icontains=search)
                )
            
            # Prepare response data
            institution_list = []
            for institution in institutions:
                # Handle logo URL properly
                logo_url = None
                if hasattr(institution, 'logo_file') and institution.logo_file:
                    try:
                        logo_url = institution.logo_file.url
                    except ValueError:
                        logo_url = None
                
                institution_data = {
                    'id': institution.id,
                    'name': institution.name,
                    'code': getattr(institution, 'code', ''),
                    'location': getattr(institution, 'location', ''),
                    'is_active': getattr(institution, 'is_active', True),
                    'student_count': StudentProfile.objects.filter(institution=institution).count(),
                    'staff_count': StaffProfile.objects.filter(institution=institution).count(),
                    'logo_url': logo_url,
                    'primary_color': getattr(institution, 'primary_color', '#1f2937'),
                    'secondary_color': getattr(institution, 'secondary_color', '#3b82f6'),
                    # Branding fields
                    'display_name': getattr(institution, 'display_name', ''),
                    'subheading': getattr(institution, 'subheading', ''),
                    'address': getattr(institution, 'address', ''),
                    'contact_email': getattr(institution, 'contact_email', ''),
                    'contact_phone': getattr(institution, 'contact_phone', ''),
                    'established_year': getattr(institution, 'established_year', None),
                }
                
                # Add department count if available
                if hasattr(institution, 'departments'):
                    institution_data['department_count'] = institution.departments.count()
                else:
                    institution_data['department_count'] = Department.objects.filter(institution=institution).count()
                
                institution_list.append(institution_data)
            
            return Response({
                'institutions': institution_list,
                'total_count': len(institution_list),
                'search_query': search,
                'active_only': active_only
            })
            
        except Exception as e:
            return Response(
                {'error': f'Failed to fetch institutions: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def post(self, request):
        """
        Create a new institution (admin only in practice, but public endpoint for flexibility).
        """
        try:
            name = request.data.get('name', '').strip()
            code = request.data.get('code', '').strip()
            location = request.data.get('location', '').strip()
            
            if not name:
                return Response(
                    {'error': 'Institution name is required'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if institution with same name or code already exists
            if Institution.objects.filter(name=name).exists():
                return Response(
                    {'error': 'Institution with this name already exists'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if code and Institution.objects.filter(code=code).exists():
                return Response(
                    {'error': 'Institution with this code already exists'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create new institution
            institution = Institution.objects.create(
                name=name,
                code=code or name.upper()[:10],  # Generate code if not provided
                location=location,
                is_active=True
            )
            
            return Response({
                'message': 'Institution created successfully',
                'institution': {
                    'id': institution.id,
                    'name': institution.name,
                    'code': institution.code,
                    'location': institution.location,
                    'is_active': institution.is_active
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to create institution: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


# =============================================================================
# JA (Junior Admin) Views
# =============================================================================

def _ja_guard(request):
    """
    Returns (staff_profile, None) if the request is from an active JA,
    or (None, Response) with the appropriate error.
    """
    if not request.user.is_authenticated or not hasattr(request.user, 'staff_profile'):
        return None, Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    profile = request.user.staff_profile
    if profile.role != "ja":
        return None, Response({"detail": "Junior Admin access required."}, status=status.HTTP_403_FORBIDDEN)
    if not profile.is_active:
        return None, Response({"detail": "Your account has been disabled."}, status=status.HTTP_403_FORBIDDEN)
    if not profile.department:
        return None, Response({"detail": "No department assigned to your account."}, status=status.HTTP_400_BAD_REQUEST)
    return profile, None


class JADashboardView(APIView):
    """JA dashboard overview — student count, batch list, dept info."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        dept = profile.department
        institution = profile.institution

        # Batch summary
        batches = (
            StudentProfile.objects
            .filter(institution=institution, department=dept)
            .exclude(batch='')
            .values('batch')
            .annotate(student_count=Count('id'))
            .order_by('-batch')
        )

        total_students = StudentProfile.objects.filter(
            institution=institution, department=dept
        ).count()

        return Response({
            "ja": {
                "name": profile.name,
                "faculty_id": profile.faculty_id,
                "role": profile.role,
            },
            "department": {
                "id": dept.id,
                "name": dept.name,
                "code": dept.code,
            },
            "institution": {
                "id": institution.id if institution else None,
                "name": institution.name if institution else None,
            },
            "stats": {
                "total_students": total_students,
                "total_batches": len(batches),
            },
            "batches": list(batches),
        })


class JABatchListView(APIView):
    """JA: list all batches in their department with student counts."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        batches = (
            StudentProfile.objects
            .filter(institution=profile.institution, department=profile.department)
            .exclude(batch='')
            .values('batch')
            .annotate(student_count=Count('id'))
            .order_by('-batch')
        )
        return Response({"batches": list(batches)})

    def post(self, request):
        """Create a new (empty) batch — just validates the name is unique in dept."""
        profile, err = _ja_guard(request)
        if err:
            return err

        batch_name = (request.data.get('batch') or '').strip()
        if not batch_name:
            return Response({"detail": "Batch name is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Check if batch already exists in this department
        exists = StudentProfile.objects.filter(
            institution=profile.institution,
            department=profile.department,
            batch=batch_name
        ).exists()
        if exists:
            return Response(
                {"detail": f"Batch '{batch_name}' already exists in this department."},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            "detail": f"Batch '{batch_name}' is ready. Add students to populate it.",
            "batch": batch_name,
        }, status=status.HTTP_201_CREATED)


class JABatchDetailView(APIView):
    """JA: get students in a batch, or delete the entire batch."""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_code):
        profile, err = _ja_guard(request)
        if err:
            return err

        students = (
            StudentProfile.objects
            .filter(
                institution=profile.institution,
                department=profile.department,
                batch=batch_code
            )
            .select_related('account')
            .order_by('register_number')
        )

        data = []
        for s in students:
            data.append({
                "id": s.id,
                "register_number": s.register_number,
                "name": s.name,
                "batch": s.batch,
                "personal_email": s.personal_email,
                "mobile_number": s.mobile_number,
                "gender": s.gender,
                "is_active": s.account.is_active if s.account else True,
            })

        return Response({
            "batch": batch_code,
            "students": data,
            "total": len(data),
        })

    def delete(self, request, batch_code):
        """Delete all students in a batch (removes their profiles and accounts)."""
        profile, err = _ja_guard(request)
        if err:
            return err

        students = StudentProfile.objects.filter(
            institution=profile.institution,
            department=profile.department,
            batch=batch_code
        ).select_related('account')

        count = students.count()
        if count == 0:
            return Response({"detail": "Batch not found or already empty."}, status=status.HTTP_404_NOT_FOUND)

        # Delete associated User accounts first
        user_ids = list(students.values_list('account_id', flat=True))
        students.delete()
        User.objects.filter(id__in=user_ids).delete()

        logger.info("JA %s deleted batch '%s' (%d students)", profile.faculty_id, batch_code, count)

        return Response({
            "detail": f"Batch '{batch_code}' deleted. {count} student(s) removed.",
            "deleted_count": count,
        })


class JAStudentCreateView(APIView):
    """JA: add a single student to a batch."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        data = request.data
        register_number = (data.get('register_number') or '').strip()
        name = (data.get('name') or '').strip()
        batch = (data.get('batch') or '').strip()

        if not register_number or not name or not batch:
            return Response(
                {"detail": "register_number, name, and batch are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if StudentProfile.objects.filter(register_number=register_number).exists():
            return Response(
                {"detail": f"Student with register number '{register_number}' already exists."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create Django User account
        from django.contrib.auth.hashers import make_password
        user = User.objects.create(
            username=register_number,
            password=make_password(None),  # unusable password until first login
            is_active=True,
        )

        student = StudentProfile.objects.create(
            account=user,
            institution=profile.institution,
            department=profile.department,
            register_number=register_number,
            name=name,
            title=data.get('title', name),
            batch=batch,
            personal_email=data.get('personal_email', ''),
            mobile_number=data.get('mobile_number', ''),
            gender=data.get('gender', ''),
        )

        logger.info("JA %s created student %s in batch %s", profile.faculty_id, register_number, batch)

        return Response({
            "detail": "Student created successfully.",
            "student": {
                "id": student.id,
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
            },
        }, status=status.HTTP_201_CREATED)


class JAStudentDeleteView(APIView):
    """JA: remove a student from their department."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, register_number):
        profile, err = _ja_guard(request)
        if err:
            return err

        student = StudentProfile.objects.filter(
            register_number=register_number,
            institution=profile.institution,
            department=profile.department,
        ).select_related('account').first()

        if not student:
            return Response(
                {"detail": "Student not found in your department."},
                status=status.HTTP_404_NOT_FOUND
            )

        student_name = student.name
        user = student.account
        student.delete()
        if user:
            user.delete()

        logger.info("JA %s deleted student %s", profile.faculty_id, register_number)

        return Response({
            "detail": f"Student '{student_name}' ({register_number}) has been removed.",
        })


class JAStudentMoveView(APIView):
    """JA: move a student to a different batch within the same department."""
    permission_classes = [IsAuthenticated]

    def post(self, request, register_number):
        profile, err = _ja_guard(request)
        if err:
            return err

        new_batch = (request.data.get('batch') or '').strip()
        if not new_batch:
            return Response({"detail": "New batch name is required."}, status=status.HTTP_400_BAD_REQUEST)

        student = StudentProfile.objects.filter(
            register_number=register_number,
            institution=profile.institution,
            department=profile.department,
        ).first()

        if not student:
            return Response(
                {"detail": "Student not found in your department."},
                status=status.HTTP_404_NOT_FOUND
            )

        old_batch = student.batch
        student.batch = new_batch
        student.save(update_fields=['batch'])

        return Response({
            "detail": f"Student moved from batch '{old_batch}' to '{new_batch}'.",
            "register_number": register_number,
            "batch": new_batch,
        })


class JABulkImportView(APIView):
    """JA: bulk import students from an uploaded Excel (.xlsx) file.
    
    Optional POST param: default_batch — used when a row's batch column is empty.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        excel_file = request.FILES.get('file')
        if not excel_file:
            return Response({"detail": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)

        if not excel_file.name.endswith(('.xlsx', '.xls')):
            return Response({"detail": "Only .xlsx or .xls files are supported."}, status=status.HTTP_400_BAD_REQUEST)

        # Optional default batch — used when row's batch column is blank
        default_batch = (request.data.get('default_batch') or '').strip()

        try:
            import openpyxl
        except ImportError:
            return Response(
                {"detail": "openpyxl is not installed on the server."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        try:
            wb = openpyxl.load_workbook(excel_file, read_only=True, data_only=True)
            ws = wb.active
        except Exception as e:
            return Response({"detail": f"Could not read Excel file: {e}"}, status=status.HTTP_400_BAD_REQUEST)

        rows = list(ws.iter_rows(values_only=True))
        if not rows:
            return Response({"detail": "Excel file is empty."}, status=status.HTTP_400_BAD_REQUEST)

        # Parse header — batch is now optional if default_batch is provided
        header = [str(h).strip().lower().replace(' ', '_') if h else '' for h in rows[0]]
        required_cols = {'register_number', 'name'}
        if not default_batch:
            required_cols.add('batch')
        missing = required_cols - set(header)
        if missing:
            return Response(
                {"detail": f"Missing required columns: {', '.join(missing)}. See the template."},
                status=status.HTTP_400_BAD_REQUEST
            )

        col_idx = {col: header.index(col) for col in header if col}

        created = []
        created_details = []  # full details for report
        skipped = []
        errors = []

        from django.contrib.auth.hashers import make_password as _make_password

        for row_num, row in enumerate(rows[1:], start=2):
            def get_col(col_name):
                idx = col_idx.get(col_name)
                if idx is None:
                    return ''
                val = row[idx]
                return str(val).strip() if val is not None else ''

            register_number = get_col('register_number')
            name = get_col('name')
            batch = get_col('batch') or default_batch

            if not register_number or not name:
                errors.append({"row": row_num, "reason": "Missing register_number or name."})
                continue

            if not batch:
                errors.append({"row": row_num, "register_number": register_number, "reason": "No batch specified and no default batch set."})
                continue

            if StudentProfile.objects.filter(register_number=register_number).exists():
                skipped.append({"row": row_num, "register_number": register_number, "reason": "Already exists."})
                continue

            try:
                user = User.objects.create(
                    username=register_number,
                    password=_make_password(None),
                    is_active=True,
                )
                student = StudentProfile.objects.create(
                    account=user,
                    institution=profile.institution,
                    department=profile.department,
                    register_number=register_number,
                    name=name,
                    title=get_col('title') or name,
                    batch=batch,
                    personal_email=get_col('personal_email'),
                    mobile_number=get_col('mobile_number'),
                    gender=get_col('gender'),
                )
                created.append(register_number)
                created_details.append({
                    "register_number": register_number,
                    "name": name,
                    "batch": batch,
                    "title": student.title,
                    "personal_email": student.personal_email,
                    "mobile_number": student.mobile_number,
                    "gender": student.gender,
                    "department": profile.department.name if profile.department else '',
                })
            except Exception as e:
                errors.append({"row": row_num, "register_number": register_number, "reason": str(e)})

        logger.info(
            "JA %s bulk import: %d created, %d skipped, %d errors",
            profile.faculty_id, len(created), len(skipped), len(errors)
        )

        return Response({
            "detail": f"Import complete. {len(created)} created, {len(skipped)} skipped, {len(errors)} errors.",
            "created_count": len(created),
            "skipped_count": len(skipped),
            "error_count": len(errors),
            "created": created,
            "created_details": created_details,
            "skipped": skipped,
            "errors": errors,
        }, status=status.HTTP_200_OK)


class JAExcelTemplateView(APIView):
    """JA: download the Excel template for bulk student import."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        except ImportError:
            return Response(
                {"detail": "openpyxl is not installed on the server."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Students"

        # ── Header row ────────────────────────────────────────────────────────
        headers = [
            "register_number",
            "name",
            "batch",
            "title",
            "personal_email",
            "mobile_number",
            "gender",
        ]

        header_fill = PatternFill(start_color="2D6A4F", end_color="2D6A4F", fill_type="solid")
        header_font = Font(bold=True, color="FFFFFF", size=11)
        center_align = Alignment(horizontal="center", vertical="center")
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )

        for col_num, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col_num, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = center_align
            cell.border = thin_border

        # ── Sample rows ───────────────────────────────────────────────────────
        sample_rows = [
            ["953623243001", "Arun Kumar", "23-27", "Mr. Arun Kumar", "arun@example.com", "9876543210", "Male"],
            ["953623243002", "Priya Sharma", "23-27", "Ms. Priya Sharma", "priya@example.com", "9876543211", "Female"],
            ["953623243003", "Ravi Raj", "23-27", "Mr. Ravi Raj", "", "", "Male"],
        ]

        sample_fill = PatternFill(start_color="F0FFF4", end_color="F0FFF4", fill_type="solid")
        for row_num, row_data in enumerate(sample_rows, 2):
            for col_num, value in enumerate(row_data, 1):
                cell = ws.cell(row=row_num, column=col_num, value=value)
                cell.fill = sample_fill
                cell.border = thin_border
                cell.alignment = Alignment(vertical="center")

        # ── Column widths ─────────────────────────────────────────────────────
        col_widths = [20, 25, 12, 30, 30, 16, 10]
        for col_num, width in enumerate(col_widths, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = width

        ws.row_dimensions[1].height = 22

        # ── Instructions sheet ────────────────────────────────────────────────
        ws2 = wb.create_sheet("Instructions")
        instructions = [
            ("Column", "Required", "Description"),
            ("register_number", "YES", "Unique student register number (e.g. 953623243001)"),
            ("name", "YES", "Full name of the student"),
            ("batch", "YES", "Batch code (e.g. 23-27)"),
            ("title", "No", "Display title (e.g. Mr. John Doe). Defaults to name if blank."),
            ("personal_email", "No", "Personal email address"),
            ("mobile_number", "No", "10-digit mobile number"),
            ("gender", "No", "Male / Female / Other"),
        ]
        hdr_font = Font(bold=True)
        for r_idx, row_data in enumerate(instructions, 1):
            for c_idx, val in enumerate(row_data, 1):
                cell = ws2.cell(row=r_idx, column=c_idx, value=val)
                if r_idx == 1:
                    cell.font = hdr_font
                    cell.fill = PatternFill(start_color="D8F3DC", end_color="D8F3DC", fill_type="solid")
                cell.border = thin_border

        ws2.column_dimensions['A'].width = 22
        ws2.column_dimensions['B'].width = 12
        ws2.column_dimensions['C'].width = 55

        # ── Stream response ───────────────────────────────────────────────────
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        dept_code = profile.department.code if profile.department else "dept"
        filename = f"student_import_template_{dept_code}.xlsx"

        response = HttpResponse(
            output.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class JAStudentListView(APIView):
    """JA: list all students in their department with optional batch/search filter."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        students = StudentProfile.objects.filter(
            institution=profile.institution,
            department=profile.department,
        ).select_related('account').order_by('batch', 'register_number')

        batch = request.query_params.get('batch')
        search = request.query_params.get('search', '').strip()

        if batch:
            students = students.filter(batch=batch)
        if search:
            students = students.filter(
                Q(name__icontains=search) | Q(register_number__icontains=search)
            )

        data = []
        for s in students:
            data.append({
                "id": s.id,
                "register_number": s.register_number,
                "name": s.name,
                "batch": s.batch,
                "personal_email": s.personal_email,
                "mobile_number": s.mobile_number,
                "gender": s.gender,
                "is_active": s.account.is_active if s.account else True,
            })

        return Response({"students": data, "total": len(data)})


class JAImportReportView(APIView):
    """JA: generate and download an Excel report of a list of students (by register numbers)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        register_numbers = request.data.get('register_numbers', [])
        report_title = request.data.get('title', 'Student Report')

        if not register_numbers:
            return Response({"detail": "No register numbers provided."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            import openpyxl
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        except ImportError:
            return Response({"detail": "openpyxl not installed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        students = StudentProfile.objects.filter(
            register_number__in=register_numbers,
            institution=profile.institution,
            department=profile.department,
        ).order_by('batch', 'register_number')

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Students"

        # ── Styles ────────────────────────────────────────────────────────────
        hdr_fill  = PatternFill(start_color="2D6A4F", end_color="2D6A4F", fill_type="solid")
        hdr_font  = Font(bold=True, color="FFFFFF", size=11)
        meta_font = Font(bold=True, size=12, color="1A3C2A")
        center    = Alignment(horizontal="center", vertical="center")
        thin      = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
        row_fill  = PatternFill(start_color="F0FFF4", end_color="F0FFF4", fill_type="solid")

        # ── Title rows ────────────────────────────────────────────────────────
        dept_name = profile.department.name if profile.department else ''
        inst_name = profile.institution.name if profile.institution else ''

        ws.merge_cells('A1:H1')
        ws['A1'] = inst_name
        ws['A1'].font = Font(bold=True, size=14, color="1A3C2A")
        ws['A1'].alignment = center

        ws.merge_cells('A2:H2')
        ws['A2'] = f"{dept_name} — {report_title}"
        ws['A2'].font = meta_font
        ws['A2'].alignment = center

        ws.merge_cells('A3:H3')
        from django.utils import timezone as tz
        ws['A3'] = f"Generated: {tz.now().strftime('%d %b %Y, %I:%M %p')}"
        ws['A3'].font = Font(size=10, color="6B7280")
        ws['A3'].alignment = center

        ws.row_dimensions[1].height = 22
        ws.row_dimensions[2].height = 20
        ws.row_dimensions[3].height = 16

        # ── Header row ────────────────────────────────────────────────────────
        headers = ['#', 'Register Number', 'Name', 'Batch', 'Title', 'Email', 'Mobile', 'Gender']
        for col_num, h in enumerate(headers, 1):
            cell = ws.cell(row=5, column=col_num, value=h)
            cell.font = hdr_font
            cell.fill = hdr_fill
            cell.alignment = center
            cell.border = thin
        ws.row_dimensions[5].height = 20

        # ── Data rows ─────────────────────────────────────────────────────────
        for idx, student in enumerate(students, 1):
            row_num = idx + 5
            values = [
                idx,
                student.register_number,
                student.name,
                student.batch,
                student.title,
                student.personal_email,
                student.mobile_number,
                student.gender,
            ]
            for col_num, val in enumerate(values, 1):
                cell = ws.cell(row=row_num, column=col_num, value=val)
                cell.border = thin
                cell.alignment = Alignment(vertical="center")
                if idx % 2 == 0:
                    cell.fill = row_fill

        # ── Column widths ─────────────────────────────────────────────────────
        col_widths = [5, 20, 28, 10, 32, 30, 16, 10]
        for col_num, width in enumerate(col_widths, 1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = width

        # ── Summary row ───────────────────────────────────────────────────────
        summary_row = students.count() + 7
        ws.cell(row=summary_row, column=1, value=f"Total: {students.count()} student(s)").font = Font(bold=True, color="2D6A4F")

        # ── Stream ────────────────────────────────────────────────────────────
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        dept_code = profile.department.code if profile.department else 'dept'
        from django.utils import timezone as tz2
        ts = tz2.now().strftime('%Y%m%d_%H%M')
        filename = f"students_{dept_code}_{ts}.xlsx"

        response = HttpResponse(
            output.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response
