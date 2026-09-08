"""Every top-level helper function/constant apps/learning/views.py used to
define (not a View class) — kept together rather than distributed by
"which role uses it most" since many are used across several role modules.
Every role/common module does `from ._shared import *`.

__all__ is required here: most of these names start with an underscore
(private-by-convention helpers, never meant for use outside this package),
and Python's `import *` silently EXCLUDES underscore-prefixed names unless
the module defines __all__ to say otherwise — without this, every module
below doing `from .._shared import *` would silently NOT receive them,
surfacing only as a NameError deep inside a view method at request time.
"""
from ._imports import *
from ..sql_games.frog import _village_schema_view as _sql_frog_village_schema_view

__all__ = [
    'logger',
    '_sql_frog_village_schema_view',
    'WatermarkDocTemplate',
    'create_watermarked_pdf',
    'build_activity_calendar',
    'build_student_stats',
    'build_problem_progress_map',
    'build_weekly_activity',
    'parse_date_param',
    'build_solved_activity_series',
    '_contest_live_summary',
    'build_topic_stats',
    'build_aptitude_stats',
    'calculate_campus_rank_helper',
    'get_discussion_messages',
    '_best_score_per_problem',
    '_CODING_DIFFICULTY_MAX',
    '_compute_contest_score_and_solved',
    '_display_actual_output',
    'execute_problem_test_case_batch',
    'execute_lab_test_case_batch',
    '_auth_rate_limits',
    '_lookup_rate_limits',
    'SQL_FROG_LANGUAGE_ID',
    'SQL_FROG_RANKS',
    '_sql_frog_rank',
    '_sql_frog_normalize_cell',
    '_sql_frog_normalize_row',
    '_parse_sql_frog_stdout',
    '_sql_frog_grade',
    'INTERVIEW_TRACK_LABELS',
    '_resolve_resource_display',
    '_media_kind',
    '_serialize_folder_media',
    '_serialize_syllabus_folder',
    '_count_folder_questions_recursive',
    '_serialize_examination_syllabus',
    '_clean_resource_items',
    '_serialize_competitive_question',
    '_RangeFileWrapper',
    '_RANGE_HEADER_RE',
    '_serve_media_file',
    'syllabus_folder_media_proxy',
    '_serialize_interview_question',
    '_serialize_interview_folder_media',
    '_serialize_interview_folder',
    '_serialize_interview_topic',
    '_serialize_interview_track',
    '_flatten_interview_folder_questions',
    '_flatten_interview_topic_questions',
    'interview_folder_media_proxy',
    'INTERVIEW_QUESTION_FIELDS',
    '_validate_interview_question_payload',
    '_compute_skill_insights',
    '_build_student_performance_charts',
    '_build_department_performance_charts',
    'publish_contest_helper',
    '_mask_api_key',
    '_extract_balanced_braces',
    '_parse_openai_snippet',
    '_fill_missing_problem_metadata',
    'UNTAGGED_PROBLEM_TOPIC',
    '_problems_in_topic',
    '_missing_metadata_q',
    '_missing_generic_schema_q',
    '_known_generic_schema_kind',
    '_run_scenario_description_sweep',
    '_missing_generic_starter_code_q',
    '_migrate_problem_to_generic_judge',
    '_topic_metadata_worker',
    '_run_topic_metadata_generation',
    '_DRIVE_FILE_ID_RE',
    '_DRIVE_SHARE_LINK_ID_RE',
    '_resolve_drive_image',
    'aptitude_drive_image_proxy',
    'institution_logo_proxy',
    '_resolve_aptitude_correct_option',
    'MAX_EXPLANATION_AUDIT_WORKERS',
    '_explanation_audit_worker',
    '_run_explanation_audit',
    '_generate_otp',
    '_mask_email',
    '_send_password_reset_otp_email',
    '_ja_guard',
    '_staff_guard',
    '_staff_from_request',
    '_student_from_request',
    '_serialize_assignment',
    '_parse_dt',
    '_serialize_lab_v2',
    '_serialize_exercise',
    '_serialize_test_case',
    '_nonnegative_int',
    '_serialize_company_practical',
    '_parse_lab_description',
    '_compile_lab_description',
    '_is_auto_placeholder',
    '_run_and_close_connections',
    '_auto_generate_lab_test_cases',
    '_LAB_REPORT_GEN_SEMAPHORE',
    '_is_valid_algorithm',
    '_fallback_algorithm',
    '_generate_lab_exercise_report',
]


logger = logging.getLogger(__name__)

class WatermarkDocTemplate(BaseDocTemplate):
    """Custom document template that adds watermark to all pages"""
    
    def __init__(self, filename, institution=None, **kwargs):
        BaseDocTemplate.__init__(self, filename, **kwargs)
        self.institution = institution
        self.watermark_image = None
        
        # Try to get watermark image
        if institution and (institution.logo_file or institution.logo_url):
            try:
                self.watermark_image = self._get_watermark_image(institution)
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
    
    def _get_watermark_image(self, institution):
        """Download and prepare watermark image. Reads an uploaded logo
        file directly (its real filesystem path, via Django's storage
        API) rather than through logo_display_url — that property now
        returns an /api/... proxy URL for uploaded logos (fixing the
        broken-image bug where the raw media path wasn't reachable
        through nginx/nginx in production), which isn't a URL this
        server-side PDF generator should loop back and fetch over HTTP."""
        try:
            if institution.logo_file:
                with institution.logo_file.open('rb') as f:
                    image_data = f.read()
            elif institution.logo_url.startswith('http'):
                # Pasted external URL — fetch it
                response = requests.get(institution.logo_url, timeout=10)
                response.raise_for_status()
                image_data = response.content
            else:
                return None
            
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
    """
    Returns {problem_id: {"state": "completed"|"open", "solved_languages": [...], "current_language": str|None}}.

    "completed" is sourced from SolvedProblem (the platform-wide source of
    truth for solved counts elsewhere), while per-language detail comes
    from ProblemSolution — a student can solve the same problem in more
    than one language, and SolvedProblem only records the first.
    """
    solved_ids = set(
        SolvedProblem.objects.filter(student=profile).values_list("problem_id", flat=True)
    )

    # Most-recent-first so the first row seen per problem is the latest attempt.
    solutions = (
        ProblemSolution.objects
        .filter(student=profile)
        .order_by("-submitted_at")
        .values("problem_id", "language", "all_tests_passed")
    )

    languages_by_problem = {}
    latest_language_by_problem = {}
    for row in solutions:
        pid = row["problem_id"]
        latest_language_by_problem.setdefault(pid, row["language"])
        if row["all_tests_passed"]:
            languages_by_problem.setdefault(pid, set()).add(row["language"])

    progress_map = {}
    for pid in solved_ids | set(latest_language_by_problem.keys()):
        if pid in solved_ids:
            progress_map[pid] = {
                "state": "completed",
                "solved_languages": sorted(languages_by_problem.get(pid, set())),
                "current_language": None,
            }
        else:
            progress_map[pid] = {
                "state": "open",
                "solved_languages": [],
                "current_language": latest_language_by_problem.get(pid),
            }

    return progress_map

def build_weekly_activity(activity_calendar):
    grouped = defaultdict(int)
    for item in activity_calendar:
        grouped[item["weekday"]] += item["count"]

    order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return [{"day": day, "count": grouped.get(day, 0)} for day in order]

def parse_date_param(value):
    """Parse a 'YYYY-MM-DD' query param into a date, or None if missing/invalid."""
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError):
        return None

def build_solved_activity_series(base_filter, start_date=None, end_date=None, default_days=7):
    """Daily SolvedProblem counts for the "Weekly Solving Activity" widget
    on HOD/Staff dashboards, scoped by `base_filter` (a Q object — e.g.
    department or institution). Defaults to the last `default_days` days
    ending today when no explicit range is given; a given range is capped
    at 90 days so the single grouped query stays cheap. Returns one entry
    per calendar day (oldest first) with both the ISO date and a short
    weekday label, so the frontend can label bars either way depending on
    how wide the selected range is.
    """
    today = timezone.now().date()
    if start_date and end_date:
        start, end = (start_date, end_date) if start_date <= end_date else (end_date, start_date)
        if (end - start).days > 89:
            start = end - timedelta(days=89)
    else:
        end = today
        start = end - timedelta(days=default_days - 1)

    counts = dict(
        SolvedProblem.objects.filter(base_filter, solved_at__date__range=(start, end))
        .values('solved_at__date')
        .annotate(count=Count('id'))
        .values_list('solved_at__date', 'count')
    )

    series = []
    cursor = start
    while cursor <= end:
        series.append({
            "date": cursor.isoformat(),
            "day": cursor.strftime("%a"),
            "count": counts.get(cursor, 0),
        })
        cursor += timedelta(days=1)
    return series

def _contest_live_summary(contest, limit=5):
    """Return contest counts/top performers for both programming and aptitude contests."""
    if contest.contest_type == 'aptitude':
        submissions = AptitudeContestSubmission.objects.filter(contest=contest)
        leaders = (
            submissions
            .values('student')
            .annotate(
                solved_count=Count('id', filter=Q(is_correct=True)),
                total_score=Sum('score'),
            )
            .filter(solved_count__gt=0)
            .order_by('-solved_count', '-total_score')[:limit]
        )
    else:
        submissions = ContestSubmission.objects.filter(contest=contest)
        leaders = (
            submissions
            .values('student')
            .annotate(
                solved_count=Count('problem', filter=Q(status='Accepted'), distinct=True),
                total_score=Sum('score'),
            )
            .filter(solved_count__gt=0)
            .order_by('-solved_count', '-total_score')[:limit]
        )

    top_performers = []
    for leader in leaders:
        student = StudentProfile.objects.filter(id=leader['student']).first()
        if student:
            top_performers.append({
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "solved_in_contest": leader['solved_count'],
                "score": leader['total_score'] or 0,
            })

    live_participants = max(
        ContestParticipation.objects.filter(contest=contest).count(),
        submissions.values('student').distinct().count(),
    )

    return {
        "total_participants": live_participants,
        "total_submissions": submissions.count(),
        "top_performers": top_performers,
    }

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
    from ..models import StudentProfile, SolvedAptitude, ContestParticipation
    
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

def get_discussion_messages(user, profile, profile_type, thread_type="general", other_user_reg=None, batch_name=None, problem_slug=None, section=None, mentor_id=None):
    """
    Fetch and cleanup messages based on access rules.
    Messages older than 24h are excluded from every response; the actual
    DELETE only runs on a small random fraction of requests rather than
    every single poll (clients re-poll this endpoint every few seconds), so
    concurrent posts aren't competing with a delete on the same table on
    every request — on SQLite that write contention can make a POST time
    out or fail silently right when a poll's cleanup delete is running.
    """
    import random

    cutoff = timezone.now() - timedelta(hours=24)
    if random.randint(1, 20) == 1:
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

    if thread_type == "section" and batch_name and section:
        # Section chat — scoped to a specific batch + section
        return qs.filter(thread_type="section", batch_name=batch_name, section=section)

    if thread_type == "mentor_group":
        # Mentor group chat — all messages for a given mentor's group
        # mentor_id identifies whose group room this is (the staff member)
        if not mentor_id:
            return qs.none()
        try:
            mentor_staff = StaffProfile.objects.get(id=mentor_id)
        except StaffProfile.DoesNotExist:
            return qs.none()
        # Verify access: must be the mentor themselves or one of their mentees
        if profile_type == "student":
            if not hasattr(profile, 'mentor') or profile.mentor_id != mentor_id:
                return qs.none()
        elif profile_type in ["staff", "hod", "tpu", "ja"]:
            if profile.id != mentor_id:
                return qs.none()
        return qs.filter(thread_type="mentor_group", batch_name=str(mentor_id))

    if thread_type == "staff":
        if profile_type in ["staff", "hod"] and profile.department:
            return qs.filter(thread_type="staff", department=profile.department)
        elif profile_type in ["admin", "ja", "tpu", "director", "principal"]:
            return qs.filter(thread_type="staff", institution=profile.institution)
        return qs.none()

    if thread_type == "hod_tp_ja":
        if profile:
            return qs.filter(thread_type="hod_tp_ja", institution=profile.institution)
        return qs.none()

    if thread_type == "problem" and problem_slug:
        return qs.filter(thread_type="problem", problem__slug=problem_slug)

    return qs.none()

def _best_score_per_problem(contest, student):
    """
    Return the sum of the best (highest) Accepted score per problem for a student.
    Only counts Accepted submissions — Wrong Answer partial scores are excluded.
    This is the canonical way to compute a student's contest total_score.
    """
    from django.db.models import Max
    rows = (
        ContestSubmission.objects.filter(
            contest=contest,
            student=student,
            status='Accepted',
        )
        .values('problem')
        .annotate(best=Max('score'))
    )
    return sum(r['best'] for r in rows)

_CODING_DIFFICULTY_MAX = {"Easy": 100, "Medium": 200, "Hard": 300}

def _compute_contest_score_and_solved(contest, student):
    """Canonical way to (re)compute a student's total_score and
    problems_solved for a contest, across all contest types.

    - programming: total_score is the raw best-per-problem sum (unchanged).
    - aptitude: total_score is the raw sum of AptitudeContestSubmission.score
      (unchanged).
    - combined: coding and aptitude/reading are each normalized to a 0-100%
      of that section's own maximum possible score, then blended using the
      contest's staff-set weight percentages into a single 0-100 total_score.
      Reading questions are AptitudeQuestion rows (question_type="RC") that
      ride along in aptitude_questions/AptitudeContestSubmission, so they're
      split out from regular aptitude ones by question_type here.
    """
    from django.db.models import Sum

    if contest.contest_type == "programming":
        score = _best_score_per_problem(contest, student)
        solved = ContestSubmission.objects.filter(
            contest=contest, student=student, status="Accepted",
        ).values("problem").distinct().count()
        return score, solved

    if contest.contest_type == "aptitude":
        subs = AptitudeContestSubmission.objects.filter(contest=contest, student=student)
        score = subs.aggregate(total=Sum("score"))["total"] or 0
        solved = subs.filter(is_correct=True).count()
        return score, solved

    # combined
    coding_raw = _best_score_per_problem(contest, student)
    coding_solved = ContestSubmission.objects.filter(
        contest=contest, student=student, status="Accepted",
    ).values("problem").distinct().count()
    coding_max = sum(
        _CODING_DIFFICULTY_MAX.get(p.difficulty, 100) for p in contest.problems.all()
    )
    coding_pct = (coding_raw / coding_max * 100) if coding_max else 0

    apt_questions = list(contest.aptitude_questions.all())
    apt_ids = {q.id for q in apt_questions if q.question_type != "RC"}
    read_ids = {q.id for q in apt_questions if q.question_type == "RC"}

    subs = AptitudeContestSubmission.objects.filter(contest=contest, student=student)
    apt_subs = [s for s in subs if s.question_id in apt_ids]
    read_subs = [s for s in subs if s.question_id in read_ids]

    apt_raw = sum(s.score for s in apt_subs)
    apt_pct = (apt_raw / len(apt_ids) * 100) if apt_ids else 0
    read_raw = sum(s.score for s in read_subs)
    read_pct = (read_raw / len(read_ids) * 100) if read_ids else 0

    weighted = (
        coding_pct * (contest.coding_weight_percent / 100)
        + apt_pct * (contest.aptitude_weight_percent / 100)
        + read_pct * (contest.reading_weight_percent / 100)
    )
    solved = coding_solved + sum(1 for s in apt_subs if s.is_correct) + sum(1 for s in read_subs if s.is_correct)
    return round(weighted), solved

def _display_actual_output(tc_result, actual_raw):
    """What to show as "Received Output" for one test case. On a clean run
    this is just the program's real stdout; on a failing run with no
    stdout at all (a crash, timeout, or compile error) it falls back to
    executor._normalize_result's unified `output` field — which now
    includes a plain-English reason for common crash signals (e.g. "SIGSEGV
    — likely a null pointer dereference...") — rather than leaving the
    console showing a blank "(no output)" with no indication anything
    actually went wrong."""
    if actual_raw:
        return actual_raw
    if tc_result.get("status") == "Accepted":
        return actual_raw
    return tc_result.get("output") or tc_result.get("stderr") or tc_result.get("compile_output") or actual_raw

def execute_problem_test_case_batch(
    *,
    problem,
    source_code,
    language,
    language_id,
    test_cases,
    batch_kind,
):
    if problem is not None and getattr(problem, "uses_generic_judge", False):
        from ..services.judging.integration import run_generic_batch
        return run_generic_batch(
            problem=problem, source_code=source_code, language=language,
            test_cases=test_cases, batch_kind=batch_kind,
        )

    from ..services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID

    language_name = LANGUAGE_NAME_BY_ID.get(language_id)
    if not language_name:
        raise Judge0ServiceError(f"Unsupported language_id: {language_id}")

    test_results = []
    latest_time = ""
    latest_memory = ""

    schema = getattr(problem, "param_schema", None) if problem else None

    # Each case still needs its own prepare_execution_payload() pass first
    # (Problem-specific function/class driver injection, input_data
    # adaptation) — the actual Judge0 calls are then one
    # Judge0Service.batch_execute() (create + poll) instead of N sequential
    # wait=true requests, same pattern services/judging/integration.py's
    # run_generic_batch() already uses for the new judge.
    prepared_cases = []
    for case in test_cases:
        case_input_data = getattr(case, "input_data", None)
        prepared = prepare_execution_payload(
            problem=problem,
            source_code=source_code,
            language=language,
            stdin=case.stdin,
            input_data=case_input_data,
        )
        logger.debug(
            "Test case %d: prepared stdin=%r, adapted=%s",
            case.order, prepared.get("stdin"), prepared.get("adapted")
        )
        prepared_cases.append((case, case_input_data, prepared))

    submissions = [
        {"source_code": prepared["source_code"], "language_name": language_name, "stdin": prepared["stdin"]}
        for _case, _input_data, prepared in prepared_cases
    ]
    run_results = Judge0Service().batch_execute(
        submissions,
        time_limit_seconds=getattr(problem, "time_limit_seconds", None),
        memory_limit_kb=getattr(problem, "memory_limit_kb", None),
    )

    for (case, case_input_data, _prepared), tc_result in zip(prepared_cases, run_results):
        logger.debug(
            "Test case %d result: status=%s, stdout=%r, stderr=%r",
            case.order, tc_result.get("status"), tc_result.get("stdout"), tc_result.get("stderr")
        )
        actual_raw = (tc_result["stdout"] or "").strip()
        expected = case.expected_output.strip()
        if schema and param_types.is_design_schema(schema) and case_input_data is not None:
            passed = (
                tc_result["status"] == "Accepted"
                and compare_design_output(actual_raw, expected, schema, case_input_data.get("operations", []))
            )
        elif schema and case_input_data is not None:
            passed = (
                tc_result["status"] == "Accepted"
                and compare_typed_output(actual_raw, expected, schema.get("return_type", ""))
            )
        else:
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
                "actual": _display_actual_output(tc_result, actual_raw),
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

def execute_lab_test_case_batch(*, source_code, language, language_id, test_cases, batch_kind):
    """Same result shape as execute_problem_test_case_batch(), for
    LabExercise test cases. Skips prepare_execution_payload()'s Problem-
    specific execution-type/driver-injection step — lab exercises are
    always plain stdin-in/stdout-out programs (the traditional lab-record
    style, unlike Problems which may be function/class-signature based),
    so the code runs as submitted, with each test case's stdin fed in
    directly.

    Runs every test case through one Judge0Service.batch_execute() call
    (create + poll, Judge0's own recommended pattern) instead of a
    blocking wait=true request per case — LabExercise has no
    time_limit_seconds/memory_limit_kb fields of its own, so neither limit
    is set here, matching this function's pre-batch behavior exactly."""
    from ..services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID
    from ..services.execution_adapter import normalize_comparable_output

    language_name = LANGUAGE_NAME_BY_ID.get(language_id)
    if not language_name:
        raise Judge0ServiceError(f"Unsupported language_id: {language_id}")

    submissions = [{"source_code": source_code, "language_name": language_name, "stdin": case.stdin} for case in test_cases]
    run_results = Judge0Service().batch_execute(submissions)

    test_results = []
    latest_time = ""
    latest_memory = ""

    for case, tc_result in zip(test_cases, run_results):
        actual_raw = (tc_result["stdout"] or "").strip()
        expected = case.expected_output.strip()

        passed = (
            tc_result["status"] == "Accepted"
            and normalize_comparable_output(actual_raw) == normalize_comparable_output(expected)
        )

        latest_time = tc_result["time"] or latest_time
        latest_memory = tc_result["memory"] or latest_memory
        test_results.append(
            {
                "stdin": case.stdin,
                "expected": expected,
                "actual": _display_actual_output(tc_result, actual_raw),
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

SQL_FROG_LANGUAGE_ID = 82  # Judge0 "SQL (SQLite 3.27.2)" — same id Playground's SQL mode already uses.

SQL_FROG_RANKS = [
    (0, "Egg"), (300, "Baby Frog"), (700, "Frog Explorer"), (1200, "Query Master"),
    (1800, "SQL Knight"), (2500, "Database Wizard"), (3200, "SQL Grandmaster"), (99999999, "SQL Master Frog"),
]

def _sql_frog_rank(xp):
    rank = SQL_FROG_RANKS[0][1]
    for threshold, name in SQL_FROG_RANKS:
        if xp >= threshold:
            rank = name
    return rank

def _sql_frog_normalize_cell(cell):
    """Numbers compare by value (so "20" vs "20.0" from however Judge0's
    SQLite runner formats a REAL column never fails a correct answer);
    text compares case-insensitively — same "don't punish harmless
    differences" spirit as every other validator in this file."""
    s = str(cell).strip()
    try:
        return ("num", float(s))
    except (TypeError, ValueError):
        return ("str", s.lower())

def _sql_frog_normalize_row(row):
    return tuple(_sql_frog_normalize_cell(c) for c in row)

def _parse_sql_frog_stdout(stdout):
    """Judge0's SQLite runner's exact output format can't be verified from
    this dev environment (Judge0 isn't reachable here) — this parses
    defensively: try '|'-splitting every non-empty line (SQLite CLI's
    classic default list mode) and use it only if every row comes out the
    same width; otherwise fall back to whitespace-splitting."""
    lines = [ln for ln in stdout.splitlines() if ln.strip() != ""]
    if not lines:
        return []
    pipe_rows = [[c.strip() for c in ln.split('|')] for ln in lines]
    if len({len(r) for r in pipe_rows}) == 1:
        return pipe_rows
    return [ln.split() for ln in lines]

def _sql_frog_grade(query, level):
    """Runs the player's query against the level's schema+seed via the
    existing Judge0 pipeline and grades it against the level's precomputed
    expected_result. Returns (success, error_category, message, rows)."""
    script = f"{level['schema_sql']}\n{level['seed_sql']}\n{query}"
    try:
        from ..services.judging.judge0_service import Judge0Service
        result = Judge0Service().execute_single(source_code=script, language_name="sqlite", stdin="")
    except (Judge0TimeoutError, Judge0ServiceError) as exc:
        return False, "execution_error", f"The pond's magic sputtered: {exc}", []

    if result["status_id"] != 3 or (result["stderr"] or "").strip():
        detail = (result["stderr"] or result["compile_output"] or result["message"] or result["status"]).strip()
        return False, "syntax_error", f"Something is wrong with the SQL structure: {detail}", []

    actual_rows = _parse_sql_frog_stdout(result["stdout"])
    expected_rows = level["expected_result"]

    actual_norm = [_sql_frog_normalize_row(r) for r in actual_rows]
    expected_norm = [_sql_frog_normalize_row(r) for r in expected_rows]

    if level.get("order_matters"):
        matched = actual_norm == expected_norm
    else:
        matched = sorted(actual_norm) == sorted(expected_norm)

    if not matched:
        return False, "wrong_result", "Your query runs, but it doesn't return what this mission needs yet.", actual_rows

    return True, None, "", actual_rows

INTERVIEW_TRACK_LABELS = {
    "civil": "Civil Engineering",
    "mech": "Mechanical Engineering",
    "eee": "Electrical & Electronics Engineering",
    "ece": "Electronics & Communication Engineering",
    "cs_common": "Computer Science Family",
}

def _resolve_resource_display(resource_links):
    """Attach friendly display fields (title/difficulty) to each resource
    item — the stored item only carries ids/slugs, so this fills in
    what's needed to render it without an extra round trip per item."""
    items = [r for r in (resource_links or []) if isinstance(r, dict)]
    apt_ids = [r['aptitude_topic_id'] for r in items if r.get('type') == 'aptitude_topic' and r.get('aptitude_topic_id')]
    slugs = [r['problem_slug'] for r in items if r.get('type') == 'problem' and r.get('problem_slug')]
    apt_titles = dict(AptitudeTopic.objects.filter(id__in=apt_ids).values_list('id', 'title')) if apt_ids else {}
    problems = {p.slug: p for p in Problem.objects.filter(slug__in=slugs)} if slugs else {}

    out = []
    for r in items:
        item = dict(r)
        if item.get('type') == 'aptitude_topic':
            item['aptitude_topic_title'] = apt_titles.get(item.get('aptitude_topic_id'), 'Unknown topic')
        elif item.get('type') == 'problem':
            p = problems.get(item.get('problem_slug'))
            item['problem_title'] = p.title if p else 'Unknown problem'
            item['problem_difficulty'] = p.difficulty if p else ''
        out.append(item)
    return out

def _media_kind(content_type):
    """Coarse category the frontend uses to pick a renderer (image tag,
    <video>, PDF viewer link, or a generic download link) — derived from
    the stored content_type since a folder's media can be anything, not
    just images like the older URL-pointer resources."""
    content_type = content_type or ""
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    if content_type == "application/pdf":
        return "pdf"
    return "file"

def _serialize_folder_media(m):
    return {
        "id": m.id,
        "title": m.title or m.file.name.rsplit('/', 1)[-1],
        "description": m.description,
        "url": f"/api/syllabus-media/{m.id}/",
        "content_type": m.content_type,
        "kind": _media_kind(m.content_type),
        "order": m.order,
    }

def _serialize_syllabus_folder(folder):
    return {
        "id": folder.id,
        "title": folder.title,
        "description": folder.description,
        "resource_links": _resolve_resource_display(folder.resource_links),
        "media": [_serialize_folder_media(m) for m in folder.media_items.all()],
        "question_count": len(folder.questions.all()),
        "subfolders": [_serialize_syllabus_folder(f) for f in folder.subfolders.all()],
    }

def _count_folder_questions_recursive(folder):
    """A folder's own questions plus every subfolder's, all the way down —
    used for the subtopic-level total below, which needs to reflect content
    added inside folders, not just the folder's own badge."""
    return len(folder.questions.all()) + sum(
        _count_folder_questions_recursive(f) for f in folder.subfolders.all()
    )

def _serialize_examination_syllabus(examination):
    """Full Section > Topic > Subtopic tree for one examination — shared by
    the admin management view and the student-facing browse view."""
    sections = []
    for section in examination.sections.prefetch_related(
        'topics__subtopics__questions',
        'topics__subtopics__folders__media_items',
        'topics__subtopics__folders__questions',
        'topics__subtopics__folders__subfolders__media_items',
        'topics__subtopics__folders__subfolders__questions',
    ):
        topics = []
        for topic in section.topics.all():
            topics.append({
                "id": topic.id,
                "title": topic.title,
                "resource_links": _resolve_resource_display(topic.resource_links),
                "subtopics": [
                    {
                        "id": st.id,
                        "title": st.title,
                        "description": st.description,
                        "resource_links": _resolve_resource_display(st.resource_links),
                        # Total across the whole subtopic — unfoldered questions
                        # plus everything nested inside its folders/subfolders,
                        # so this badge reflects adds made either way.
                        "question_count": (
                            len([q for q in st.questions.all() if q.folder_id is None])
                            + sum(_count_folder_questions_recursive(f) for f in st.folders.all() if f.parent_id is None)
                        ),
                        # Only top-level folders — nested ones are already
                        # included via each parent's own "subfolders" list
                        # (_serialize_syllabus_folder is recursive), so listing
                        # every depth here too would double them up.
                        "folders": [_serialize_syllabus_folder(f) for f in st.folders.all() if f.parent_id is None],
                    }
                    for st in topic.subtopics.all()
                ],
            })
        sections.append({"id": section.id, "title": section.title, "topics": topics})
    return sections

def _clean_resource_items(raw_items):
    """Validate/normalize a resource list — shared by the Topic and
    Subtopic resource endpoints, since both now support the same three
    kinds: an external link (frontend renders it as a YouTube embed,
    image, or video automatically depending on the URL), or a pointer at
    existing platform content (an Aptitude topic or a coding Problem)."""
    cleaned = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        item_type = item.get('type')
        label = (item.get('label') or '').strip()

        if item_type == 'link':
            url = (item.get('url') or '').strip()
            if not url:
                continue
            cleaned.append({"type": "link", "label": label, "url": url})

        elif item_type == 'aptitude_topic':
            apt_id = item.get('aptitude_topic_id')
            try:
                apt_id = int(apt_id)
            except (TypeError, ValueError):
                continue
            if not AptitudeTopic.objects.filter(id=apt_id).exists():
                continue
            cleaned.append({"type": "aptitude_topic", "label": label, "aptitude_topic_id": apt_id})

        elif item_type == 'problem':
            slug = (item.get('problem_slug') or '').strip()
            if not slug or not Problem.objects.filter(slug=slug).exists():
                continue
            cleaned.append({"type": "problem", "label": label, "problem_slug": slug})

    return cleaned

def _serialize_competitive_question(q, include_answer=True):
    data = {
        "id": q.id,
        "question_text": q.question_text,
        "question_image": q.question_image,
        "video_url": q.video_url,
        "option_a": q.option_a,
        "option_b": q.option_b,
        "option_c": q.option_c,
        "option_d": q.option_d,
    }
    if include_answer:
        data["correct_option"] = q.correct_option
        data["explanation"] = q.explanation
    return data

class _RangeFileWrapper:
    """Wraps an open file object so reads stop after `length` bytes have
    been served from wherever the file was seeked to — lets FileResponse
    stream exactly one HTTP Range (start-end) without reading the rest of
    the file into memory. FileResponse drives this by calling .read(size)
    in a loop until it gets back an empty bytes, same as a plain file."""
    def __init__(self, f, length):
        self.f = f
        self.remaining = length

    def read(self, size=-1):
        if self.remaining <= 0:
            return b''
        size = self.remaining if size is None or size < 0 else min(size, self.remaining)
        data = self.f.read(size)
        self.remaining -= len(data)
        return data

    def close(self):
        self.f.close()

_RANGE_HEADER_RE = re.compile(r'bytes=(\d*)-(\d*)')

def _serve_media_file(request, file_field, content_type):
    """Serve a FieldFile with HTTP Range support, so a <video> element can
    start playing immediately and seek without downloading the whole file
    first — a plain FileResponse (no Range handling) forces the browser to
    wait for the entire file before it can play anything, which is what
    made large video uploads feel slow to start."""
    file_size = file_field.size
    range_match = _RANGE_HEADER_RE.match(request.META.get('HTTP_RANGE', '').strip())

    if range_match:
        start_str, end_str = range_match.groups()
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        end = min(end, file_size - 1)
        if start > end or start >= file_size:
            response = HttpResponse(status=416)
            response['Content-Range'] = f'bytes */{file_size}'
            return response
        length = end - start + 1
        f = file_field.open('rb')
        f.seek(start)
        response = FileResponse(_RangeFileWrapper(f, length), content_type=content_type, status=206)
        response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response['Content-Length'] = str(length)
    else:
        response = FileResponse(file_field.open('rb'), content_type=content_type)
        response['Content-Length'] = str(file_size)

    response['Accept-Ranges'] = 'bytes'
    response['Cache-Control'] = 'public, max-age=86400'
    return response

def syllabus_folder_media_proxy(request, media_id):
    """Serve one folder-media file's bytes through the /api/ proxy path —
    same reasoning as institution_logo_proxy: production has no /media/
    passthrough, so ImageField/FileField.url 404s there. Public/no-auth
    like the logo proxy — this content is student-visible course material,
    not sensitive, and the frontend renders it as a plain <img>/<video>
    src, which can't attach auth headers anyway."""
    media = get_object_or_404(SyllabusFolderMedia, id=media_id)
    content_type = media.content_type or mimetypes.guess_type(media.file.name)[0] or "application/octet-stream"
    return _serve_media_file(request, media.file, content_type)

def _serialize_interview_question(q, progress_map=None):
    """progress_map: optional {question_id: "review_again"|"learned"} for
    the calling student — omitted entirely for admin callers (None), so
    `progress_status` only ever appears in student-facing responses."""
    data = {
        "id": q.id,
        "external_id": q.external_id,
        "question_type": q.question_type,
        "question_type_label": dict(InterviewQuestion.QUESTION_TYPE_CHOICES).get(q.question_type, q.question_type),
        "difficulty": q.difficulty,
        "question_text": q.question_text,
        "answer": q.answer,
        "follow_up_question": q.follow_up_question,
        "follow_up_answer": q.follow_up_answer,
        "tools_technologies": q.tools_technologies,
        "key_concepts": q.key_concepts,
        "source_reference": q.source_reference,
    }
    if progress_map is not None:
        data["progress_status"] = progress_map.get(q.id)
    return data

def _serialize_interview_folder_media(m):
    return {
        "id": m.id,
        "title": m.title or m.file.name.rsplit('/', 1)[-1],
        "description": m.description,
        "url": f"/api/interview-media/{m.id}/",
        "content_type": m.content_type,
        "kind": _media_kind(m.content_type),
        "order": m.order,
    }

def _serialize_interview_folder(folder, progress_map=None):
    return {
        "id": folder.id,
        "title": folder.title,
        "questions": [_serialize_interview_question(q, progress_map) for q in folder.questions.all()],
        "media": [_serialize_interview_folder_media(m) for m in folder.media_items.all()],
        "subfolders": [_serialize_interview_folder(f, progress_map) for f in folder.subfolders.all()],
    }

def _serialize_interview_topic(topic, progress_map=None):
    return {
        "id": topic.id,
        "title": topic.title,
        "question_count": len([q for q in topic.questions.all() if q.folder_id is None]),
        "questions": [_serialize_interview_question(q, progress_map) for q in topic.questions.all() if q.folder_id is None],
        "folders": [_serialize_interview_folder(f, progress_map) for f in topic.folders.all() if f.parent_id is None],
    }

def _serialize_interview_track(track, progress_map=None):
    return {
        "id": track.id,
        "key": track.key,
        "name": track.name,
        "description": track.description,
        "topics": [_serialize_interview_topic(t, progress_map) for t in track.topics.all()],
    }

def _flatten_interview_folder_questions(folder):
    ids = [q.id for q in folder.questions.all()]
    for sf in folder.subfolders.all():
        ids += _flatten_interview_folder_questions(sf)
    return ids

def _flatten_interview_topic_questions(topic):
    """Every question id under a topic, top-level and nested in folders —
    the queue a Practice Mode swipe deck pulls from."""
    ids = [q.id for q in topic.questions.all()]
    for f in topic.folders.all():
        if f.parent_id is None:
            ids += _flatten_interview_folder_questions(f)
    return ids

def interview_folder_media_proxy(request, media_id):
    """Serve one Interview folder-media file's bytes through the /api/
    proxy path — same reasoning as syllabus_folder_media_proxy: production
    has no /media/ passthrough, and this is student-visible course
    material rendered as a plain <img>/<video> src, not sensitive."""
    media = get_object_or_404(InterviewFolderMedia, id=media_id)
    content_type = media.content_type or mimetypes.guess_type(media.file.name)[0] or "application/octet-stream"
    return _serve_media_file(request, media.file, content_type)

INTERVIEW_QUESTION_FIELDS = (
    'external_id', 'question_type', 'difficulty', 'question_text', 'answer',
    'follow_up_question', 'follow_up_answer', 'tools_technologies', 'key_concepts', 'source_reference',
)

def _validate_interview_question_payload(data, require_core=True):
    """Shared field-cleaning for create/update — returns (cleaned_dict,
    error_response_or_None)."""
    cleaned = {}
    for field in INTERVIEW_QUESTION_FIELDS:
        if field in data:
            cleaned[field] = (data.get(field) or '').strip()
    if require_core:
        if not cleaned.get('question_text') and 'question_text' not in data:
            cleaned.setdefault('question_text', '')
        if not (cleaned.get('question_text') or '').strip():
            return None, Response({"error": "question_text is required."}, status=400)
        if not (cleaned.get('answer') or '').strip():
            return None, Response({"error": "answer is required."}, status=400)
    if 'question_type' in cleaned and cleaned['question_type'] and cleaned['question_type'] not in dict(InterviewQuestion.QUESTION_TYPE_CHOICES):
        return None, Response({"error": f"question_type must be one of {list(dict(InterviewQuestion.QUESTION_TYPE_CHOICES))}."}, status=400)
    if 'difficulty' in cleaned and cleaned['difficulty'] and cleaned['difficulty'] not in dict(InterviewQuestion.DIFFICULTY_CHOICES):
        return None, Response({"error": f"difficulty must be one of {list(dict(InterviewQuestion.DIFFICULTY_CHOICES))}."}, status=400)
    return cleaned, None

def _compute_skill_insights(solved_problems):
    """Aggregate company-tag and project/skill-tag counts across a
    student's solved problems — shared by the staff-facing individual
    analytics view and the student's own self-analytics view so both
    render the same "companies you've practiced for" / "skills
    demonstrated" breakdown."""
    company_counts = {}
    skill_counts = {}
    project_tags = {'project', 'real-world', 'application', 'system', 'database', 'web', 'api', 'full-stack'}

    for sp in solved_problems:
        companies_str = sp.problem.companies or ""
        for comp in (c.strip() for c in companies_str.split(',')):
            if comp:
                company_counts[comp] = company_counts.get(comp, 0) + 1

        for tag in (sp.problem.tags or []):
            tag_lower = tag.lower()
            skill_counts[tag_lower] = skill_counts.get(tag_lower, 0) + 1

    sorted_companies = sorted(company_counts.items(), key=lambda x: x[1], reverse=True)[:8]
    company_insights = [{'name': name, 'count': count} for name, count in sorted_companies]

    project_insights = []
    for skill, count in sorted(skill_counts.items(), key=lambda x: x[1], reverse=True):
        if skill in project_tags or any(pt in skill for pt in project_tags):
            project_insights.append({'skill': skill, 'count': count})
    project_insights = project_insights[:6]

    return company_insights, project_insights

def _build_student_performance_charts(student, solved_problems=None, topic_accuracy=None, days=30):
    """Chart-ready solved-first analytics for student/staff/HOD report views."""
    solved_problems = solved_problems if solved_problems is not None else SolvedProblem.objects.filter(student=student).select_related('problem')
    topic_accuracy = topic_accuracy or []

    total_programming = Problem.objects.count()
    total_aptitude = AptitudeQuestion.objects.count()
    programming_solved = solved_problems.count()
    aptitude_solved = SolvedAptitude.objects.filter(student=student).count()

    accepted_contest_solved = (
        ContestSubmission.objects
        .filter(student=student, status='Accepted')
        .values('contest_id', 'problem_id')
        .distinct()
        .count()
    )
    aptitude_contest_solved = AptitudeContestSubmission.objects.filter(student=student, is_correct=True).count()
    contest_solved = accepted_contest_solved + aptitude_contest_solved

    start_day = timezone.localdate() - timedelta(days=days - 1)
    date_labels = [(start_day + timedelta(days=i)) for i in range(days)]

    def counts_by_date(qs, date_field):
        key = f'{date_field}__date'
        rows = qs.filter(**{f'{date_field}__date__gte': start_day}).values(key).annotate(count=Count('id'))
        return {row[key]: row['count'] for row in rows}

    programming_by_day = counts_by_date(SolvedProblem.objects.filter(student=student), 'solved_at')
    aptitude_by_day = counts_by_date(SolvedAptitude.objects.filter(student=student), 'solved_at')
    contest_code_by_day = counts_by_date(ContestSubmission.objects.filter(student=student, status='Accepted'), 'submitted_at')
    contest_apt_by_day = counts_by_date(AptitudeContestSubmission.objects.filter(student=student, is_correct=True), 'submitted_at')

    cumulative = 0
    daily_solved_trend = []
    for day in date_labels:
        programming_count = programming_by_day.get(day, 0)
        aptitude_count = aptitude_by_day.get(day, 0)
        contest_count = contest_code_by_day.get(day, 0) + contest_apt_by_day.get(day, 0)
        cumulative += programming_count + aptitude_count
        daily_solved_trend.append({
            'date': day.isoformat(),
            'programming': programming_count,
            'aptitude': aptitude_count,
            'contest': contest_count,
            'daily_total': programming_count + aptitude_count,
            'overall_total': cumulative,
        })

    active_days = sum(1 for row in daily_solved_trend if row['daily_total'] > 0)
    overall_possible = max(1, total_programming + total_aptitude)
    overall_solved = programming_solved + aptitude_solved
    contest_attempts = ContestParticipation.objects.filter(student=student, is_active=False).count()
    contest_perf_pct = min(100, round((contest_solved / max(1, contest_attempts)) * 20, 1)) if contest_attempts else 0

    programming_tags = defaultdict(int)
    for sp in solved_problems:
        tags = sp.problem.tags or []
        if isinstance(tags, str):
            tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        if tags:
            for tag in list(tags)[:4]:
                programming_tags[str(tag).strip().title()] += 1
        else:
            programming_tags[sp.problem.difficulty or 'Programming'] += 1

    aptitude_topics = defaultdict(int)
    for row in SolvedAptitude.objects.filter(student=student).values('question__topic__title').annotate(count=Count('id')).order_by('-count')[:10]:
        topic = row['question__topic__title'] or 'Aptitude'
        aptitude_topics[topic] += row['count']

    topic_labels = []
    for label, _ in sorted(programming_tags.items(), key=lambda item: item[1], reverse=True)[:6]:
        if label not in topic_labels:
            topic_labels.append(label)
    for label, _ in sorted(aptitude_topics.items(), key=lambda item: item[1], reverse=True)[:6]:
        if label not in topic_labels:
            topic_labels.append(label)
    topic_labels = topic_labels[:8]

    knowledge_distribution = {
        'labels': topic_labels,
        'programming': [programming_tags.get(label, 0) for label in topic_labels],
        'aptitude': [aptitude_topics.get(label, 0) for label in topic_labels],
    }

    contest_performance = []
    cp_qs = (
        ContestParticipation.objects
        .filter(student=student, is_active=False)
        .select_related('contest')
        .order_by('started_at')[:25]
    )
    for cp in cp_qs:
        contest = cp.contest
        if contest.contest_type == 'aptitude':
            total_items = contest.aptitude_questions.count()
            solved_items = AptitudeContestSubmission.objects.filter(
                contest=contest, student=student, is_correct=True
            ).count()
        else:
            total_items = contest.problems.count()
            solved_items = ContestSubmission.objects.filter(
                contest=contest, student=student, status='Accepted'
            ).values('problem').distinct().count()
        contest_performance.append({
            'label': contest.title[:18],
            'title': contest.title,
            'date': cp.started_at.date().isoformat(),
            'contest_type': contest.contest_type,
            'solved': solved_items,
            'total': total_items,
            'score_pct': round(solved_items / max(1, total_items) * 100, 1),
        })

    return {
        'overall_performance': [
            {'label': 'Programming', 'value': programming_solved},
            {'label': 'Aptitude', 'value': aptitude_solved},
            {'label': 'Contest', 'value': contest_solved},
        ],
        'profile_radar': {
            'labels': ['Programming', 'Aptitude', 'Contest', 'Daily', 'Overall'],
            'daily': [
                round(programming_by_day.get(timezone.localdate(), 0) / max(1, programming_solved) * 100, 1),
                round(aptitude_by_day.get(timezone.localdate(), 0) / max(1, aptitude_solved) * 100, 1),
                round((contest_code_by_day.get(timezone.localdate(), 0) + contest_apt_by_day.get(timezone.localdate(), 0)) / max(1, contest_solved) * 100, 1),
                round(active_days / days * 100, 1),
                round((programming_by_day.get(timezone.localdate(), 0) + aptitude_by_day.get(timezone.localdate(), 0)) / max(1, overall_solved) * 100, 1),
            ],
            'overall': [
                round(programming_solved / max(1, total_programming) * 100, 1),
                round(aptitude_solved / max(1, total_aptitude) * 100, 1),
                contest_perf_pct,
                round(active_days / days * 100, 1),
                round(overall_solved / overall_possible * 100, 1),
            ],
        },
        'knowledge_distribution': knowledge_distribution,
        'daily_solved_trend': daily_solved_trend,
        'contest_performance': contest_performance,
        'summary_cards': {
            'programming_solved': programming_solved,
            'aptitude_solved': aptitude_solved,
            'contest_solved': contest_solved,
            'active_days': active_days,
        },
    }

def _build_department_performance_charts(department, institution, days=30):
    """Department-wide analogue of _build_student_performance_charts — same
    chart shapes (overall_performance / profile_radar / daily_solved_trend /
    knowledge_distribution / contest_performance), aggregated across every
    student in the department instead of one student. Feeds the HOD
    'Department Performance & Analytics' tab, which used to be wired to
    fabricated stand-ins (student-count-derived proxies) instead of real
    department solving data — this is the real thing."""
    student_ids = list(
        StudentProfile.objects.filter(department=department, institution=institution).values_list('id', flat=True)
    )
    num_students = max(1, len(student_ids))

    total_programming = Problem.objects.count()
    total_aptitude = AptitudeQuestion.objects.count()

    programming_solved = SolvedProblem.objects.filter(student_id__in=student_ids).count()
    aptitude_solved = SolvedAptitude.objects.filter(student_id__in=student_ids).count()

    accepted_contest_solved = (
        ContestSubmission.objects
        .filter(student_id__in=student_ids, status='Accepted')
        .values('contest_id', 'problem_id', 'student_id')
        .distinct()
        .count()
    )
    aptitude_contest_solved = AptitudeContestSubmission.objects.filter(student_id__in=student_ids, is_correct=True).count()
    contest_solved = accepted_contest_solved + aptitude_contest_solved

    start_day = timezone.localdate() - timedelta(days=days - 1)
    date_labels = [(start_day + timedelta(days=i)) for i in range(days)]

    def counts_by_date(qs, date_field):
        key = f'{date_field}__date'
        rows = qs.filter(**{f'{date_field}__date__gte': start_day}).values(key).annotate(count=Count('id'))
        return {row[key]: row['count'] for row in rows}

    programming_by_day = counts_by_date(SolvedProblem.objects.filter(student_id__in=student_ids), 'solved_at')
    aptitude_by_day = counts_by_date(SolvedAptitude.objects.filter(student_id__in=student_ids), 'solved_at')
    contest_code_by_day = counts_by_date(ContestSubmission.objects.filter(student_id__in=student_ids, status='Accepted'), 'submitted_at')
    contest_apt_by_day = counts_by_date(AptitudeContestSubmission.objects.filter(student_id__in=student_ids, is_correct=True), 'submitted_at')

    cumulative = 0
    daily_solved_trend = []
    for day in date_labels:
        programming_count = programming_by_day.get(day, 0)
        aptitude_count = aptitude_by_day.get(day, 0)
        contest_count = contest_code_by_day.get(day, 0) + contest_apt_by_day.get(day, 0)
        cumulative += programming_count + aptitude_count
        daily_solved_trend.append({
            'date': day.isoformat(),
            'programming': programming_count,
            'aptitude': aptitude_count,
            'contest': contest_count,
            'daily_total': programming_count + aptitude_count,
            'overall_total': cumulative,
        })

    active_days = sum(1 for row in daily_solved_trend if row['daily_total'] > 0)
    overall_possible = max(1, (total_programming + total_aptitude) * num_students)
    overall_solved = programming_solved + aptitude_solved
    contest_attempts = ContestParticipation.objects.filter(student_id__in=student_ids, is_active=False).count()
    contest_perf_pct = min(100, round((contest_solved / max(1, contest_attempts)) * 20, 1)) if contest_attempts else 0

    programming_tags = defaultdict(int)
    for sp in SolvedProblem.objects.filter(student_id__in=student_ids).select_related('problem'):
        tags = sp.problem.tags or []
        if isinstance(tags, str):
            tags = [tag.strip() for tag in tags.split(',') if tag.strip()]
        if tags:
            for tag in list(tags)[:4]:
                programming_tags[str(tag).strip().title()] += 1
        else:
            programming_tags[sp.problem.difficulty or 'Programming'] += 1

    aptitude_topics = defaultdict(int)
    for row in SolvedAptitude.objects.filter(student_id__in=student_ids).values('question__topic__title').annotate(count=Count('id')).order_by('-count')[:10]:
        topic = row['question__topic__title'] or 'Aptitude'
        aptitude_topics[topic] += row['count']

    topic_labels = []
    for label, _ in sorted(programming_tags.items(), key=lambda item: item[1], reverse=True)[:6]:
        if label not in topic_labels:
            topic_labels.append(label)
    for label, _ in sorted(aptitude_topics.items(), key=lambda item: item[1], reverse=True)[:6]:
        if label not in topic_labels:
            topic_labels.append(label)
    topic_labels = topic_labels[:8]

    knowledge_distribution = {
        'labels': topic_labels,
        'programming': [programming_tags.get(label, 0) for label in topic_labels],
        'aptitude': [aptitude_topics.get(label, 0) for label in topic_labels],
    }

    # One row per contest the department has participated in, built from
    # each participation's own cached problems_solved/total_score rather
    # than re-querying every submission per student — avoids an N+1 query
    # per participant across a whole department.
    by_contest = {}
    for cp in (
        ContestParticipation.objects
        .filter(student_id__in=student_ids, is_active=False)
        .select_related('contest')
        .order_by('started_at')
    ):
        c = cp.contest
        entry = by_contest.setdefault(c.id, {'contest': c, 'solved_sum': 0, 'participants': 0, 'started_at': cp.started_at})
        entry['solved_sum'] += cp.problems_solved
        entry['participants'] += 1
        entry['started_at'] = min(entry['started_at'], cp.started_at)

    contest_performance = []
    for entry in sorted(by_contest.values(), key=lambda e: e['started_at'])[-25:]:
        c = entry['contest']
        total_items = c.aptitude_questions.count() if c.contest_type == 'aptitude' else c.problems.count()
        avg_solved = round(entry['solved_sum'] / max(1, entry['participants']), 1)
        contest_performance.append({
            'label': c.title[:18],
            'title': c.title,
            'date': entry['started_at'].date().isoformat(),
            'contest_type': c.contest_type,
            'solved': avg_solved,
            'total': total_items,
            'score_pct': round(avg_solved / max(1, total_items) * 100, 1),
            'participants': entry['participants'],
        })

    return {
        'overall_performance': [
            {'label': 'Programming', 'value': programming_solved},
            {'label': 'Aptitude', 'value': aptitude_solved},
            {'label': 'Contest', 'value': contest_solved},
        ],
        'profile_radar': {
            'labels': ['Programming', 'Aptitude', 'Contest', 'Daily', 'Overall'],
            'daily': [
                round(programming_by_day.get(timezone.localdate(), 0) / max(1, programming_solved) * 100, 1),
                round(aptitude_by_day.get(timezone.localdate(), 0) / max(1, aptitude_solved) * 100, 1),
                round((contest_code_by_day.get(timezone.localdate(), 0) + contest_apt_by_day.get(timezone.localdate(), 0)) / max(1, contest_solved) * 100, 1),
                round(active_days / days * 100, 1),
                round((programming_by_day.get(timezone.localdate(), 0) + aptitude_by_day.get(timezone.localdate(), 0)) / max(1, overall_solved) * 100, 1),
            ],
            'overall': [
                round(programming_solved / max(1, total_programming * num_students) * 100, 1),
                round(aptitude_solved / max(1, total_aptitude * num_students) * 100, 1),
                contest_perf_pct,
                round(active_days / days * 100, 1),
                round(overall_solved / overall_possible * 100, 1),
            ],
        },
        'knowledge_distribution': knowledge_distribution,
        'daily_solved_trend': daily_solved_trend,
        'contest_performance': contest_performance,
        # Department-wide average bank progress (solved / (bank size * student
        # count)) rather than raw solved / bank size — the latter can exceed
        # 100% trivially once more than one student has solved the same
        # question, which reads as a broken percentage rather than a stat.
        'aptitude': {
            'solved': aptitude_solved,
            'total': total_aptitude,
            'percentage': round(aptitude_solved / max(1, total_aptitude * num_students) * 100, 1),
        },
        'summary_cards': {
            'programming_solved': programming_solved,
            'aptitude_solved': aptitude_solved,
            'contest_solved': contest_solved,
            'active_days': active_days,
            'student_count': num_students,
        },
    }

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
            link=(
                f"/contests/{contest.id}" if contest.contest_type == 'programming'
                else f"/combined-contest/{contest.id}" if contest.contest_type == 'combined'
                else f"/aptitude-contest/{contest.id}"
            )
        ))
    
    if notifications:
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)

def _mask_api_key(key):
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:6]}...{key[-4:]}"

def _extract_balanced_braces(text, open_brace_idx):
    """Given text and the index of an opening '{', return the substring
    from there to its matching closing '}' — handles nested dicts, unlike
    a naive non-greedy regex which would stop at the first '}'."""
    depth = 0
    for i in range(open_brace_idx, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[open_brace_idx:i + 1]
    return None

def _parse_openai_snippet(snippet):
    """Extract provider config fields from a pasted code snippet. Handles
    both common shapes these API docs hand out:
      1. OpenAI SDK style:  OpenAI(base_url="...", api_key="...");
         .chat.completions.create(model="...", stream=..., extra_body={...})
      2. Raw `requests` style: a URL variable ending in /chat/completions,
         an Authorization: Bearer <key> header, and a payload dict with
         "model"/"stream"/"temperature"/etc as dict keys rather than
         Python kwargs.
    So adding a new fallback provider is paste-and-review instead of
    manually re-typing every field, regardless of which shape the docs
    for that particular API used."""
    import ast

    def _find(pattern, text=snippet):
        m = re.search(pattern, text)
        return m.group(1) if m else None

    # base_url: prefer an explicit base_url=... kwarg (OpenAI style); else
    # fall back to any http(s) URL literal in the snippet, stripping a
    # trailing /chat/completions or /completions since _call_provider_once
    # appends that itself.
    base_url = _find(r'base_url\s*=\s*["\']([^"\']+)["\']')
    if not base_url:
        base_url = _find(r'["\'](\bhttps?://[^"\']+)["\']')
        if base_url:
            base_url = re.sub(r'/(chat/)?completions/?$', '', base_url)

    # api_key: an explicit api_key=... kwarg; else a Bearer token in a
    # header string; else any bare nvapi-... token anywhere (NVIDIA's
    # own key format, and every snippet seen so far has used it).
    api_key = (
        _find(r'api_key\s*=\s*["\']([^"\']+)["\']')
        or _find(r'Bearer\s+([A-Za-z0-9\-_.]+)')
        or _find(r'["\'](nvapi-[A-Za-z0-9\-_.]+)["\']')
    )

    # model: a model=... kwarg (SDK style) or a "model": "..." dict entry
    # (raw requests-style payload dict).
    model_name = (
        _find(r'\bmodel\s*=\s*["\']([^"\']+)["\']')
        or _find(r'["\']model["\']\s*:\s*["\']([^"\']+)["\']')
    )

    result = {"base_url": base_url, "api_key": api_key, "model_name": model_name}

    # Everything below may appear either as a Python kwarg (key=value) or
    # a dict literal entry ("key": value) — accept both.
    stream_match = re.search(r'["\']?\bstream["\']?\s*[:=]\s*(True|False)', snippet)
    result["use_streaming"] = stream_match.group(1) == "True" if stream_match else False

    for field, name, caster, default in (
        ("temperature", "temperature", float, 0.4),
        ("top_p", "top_p", float, 0.95),
        ("max_tokens", "max_tokens", int, 6000),
    ):
        m = re.search(rf'["\']?\b{name}["\']?\s*[:=]\s*([0-9.]+)', snippet)
        result[field] = caster(m.group(1)) if m else default

    extra_body = {}
    eb_match = re.search(r'extra_body\s*=\s*(\{)', snippet)
    if eb_match:
        brace_text = _extract_balanced_braces(snippet, eb_match.start(1))
        if brace_text:
            try:
                extra_body = ast.literal_eval(brace_text)
            except (ValueError, SyntaxError):
                extra_body = {}
    result["extra_body"] = extra_body

    return result

def _fill_missing_problem_metadata(problem):
    """Fills in whatever "necessary data" one Problem is missing — the
    typed param_schema, the explanation, and/or the hint ladder — via the
    LLM fallback chain. All three pieces are skip-if-exists: never
    overwrites a hand-authored schema, an already-generated explanation, or
    existing hints, only fills in what's actually missing. Shared by the
    single-problem admin action (AdminProblemGenerateSchemaAndDescriptionView)
    and the per-topic bulk generation background job below — one place, not
    multiple copies that can drift."""
    from ..services.testcase_generator import generate_param_schema, generate_explanation, generate_hints, TestCaseGenError

    result = {"schema_generated": False, "explanation_generated": False, "hints_generated": False, "errors": {}}

    if not problem.param_schema:
        try:
            schema = generate_param_schema(title=problem.title, description=problem.description, examples=problem.examples)
            problem.param_schema = schema
            problem.save(update_fields=["param_schema"])
            result["schema_generated"] = True
            result["param_schema"] = schema
        except TestCaseGenError as exc:
            result["errors"]["param_schema"] = str(exc)
    else:
        result["param_schema"] = problem.param_schema

    if not problem.explanation:
        try:
            explanation = generate_explanation(
                title=problem.title, description=problem.description,
                examples=problem.examples, difficulty=problem.difficulty,
            )
            problem.explanation = explanation
            problem.save(update_fields=["explanation"])
            result["explanation_generated"] = True
            result["explanation"] = explanation
        except TestCaseGenError as exc:
            result["errors"]["explanation"] = str(exc)
    else:
        result["explanation"] = problem.explanation

    if not problem.hints:
        try:
            hints = generate_hints(title=problem.title, description=problem.description)
            problem.hints = hints
            problem.save(update_fields=["hints"])
            result["hints_generated"] = True
            result["hints"] = hints
        except TestCaseGenError as exc:
            result["errors"]["hints"] = str(exc)
    else:
        result["hints"] = problem.hints

    return result

UNTAGGED_PROBLEM_TOPIC = "__untagged__"

def _problems_in_topic(topic):
    if topic == UNTAGGED_PROBLEM_TOPIC:
        return Problem.objects.filter(tags=[])
    return Problem.objects.filter(tags__contains=[topic])

def _missing_metadata_q():
    """Same skip-if-exists condition _fill_missing_problem_metadata checks
    per-field, as one filter — a problem needs a run if it's missing its
    schema, explanation, or hint ladder."""
    return Q(param_schema__isnull=True) | Q(explanation="") | Q(hints=[])

def _missing_generic_schema_q():
    return Q(generic_schema__isnull=True)

def _known_generic_schema_kind(problem):
    """The one shared source of truth for skipping generate_generic_schema()'s
    text heuristic entirely when the answer is already certain — used by
    every bulk sweep below rather than duplicating this logic. Checked in
    priority order: an explicit Problem.execution_type="stdin" (a staff
    decision, never something text-heuristics should guess — see
    schema_generator.generate_generic_schema's known_kind docstring) beats
    a design-shaped legacy param_schema, which beats "let the heuristic
    decide" (returns None)."""
    if getattr(problem, "execution_type", None) == "stdin":
        return "stdin"
    if param_types.is_design_schema(problem.param_schema):
        return "design"
    return None

def _run_scenario_description_sweep(base_qs, *, time_budget_seconds, max_actions, round_size_per_provider, force=False):
    """Shared by the bank-wide and per-topic "Generate Scenario
    Descriptions" views — everything except how `base_qs` gets scoped
    (whole bank vs. one topic's tag) is identical. Rewrites
    Problem.description into an original real-world scenario (same
    input/output contract, no source-platform branding/cross-references)
    and Problem.title to match the new scenario's framing, tracked via a
    real DB flag (Problem.description_is_scenario) rather than a
    client-held cursor, so a problem is only ever rewritten once — a later
    click (even a different admin session, even scoped to a different
    topic that happens to overlap) only touches problems still on the
    original statement, unless `force` re-touches already-migrated ones
    too (e.g. redoing one topic with a tweaked prompt). The pre-rewrite
    text is preserved once in description_original the first time a
    problem is touched, never overwritten again, so the original is never
    lost even though `description` (and `title`) get overwritten.

    Runs the batch through run_across_providers_in_parallel() — assigning
    problems round-robin across whichever LLMProviders are currently
    marked active is what "balances the work across models" here: mark
    exactly 2 providers active (e.g. two cheaper/faster models suited to a
    mostly-mechanical rewrite) and this sweep naturally splits the load
    between them, same as every other bulk sweep in this file.

    Returns the same {"processed", "elapsed_seconds", "remaining_problems"}
    shape every bulk-sweep view in this file already returns, or an
    {"error": ...} dict (caller decides the HTTP status) if no provider is
    available at all."""
    import time
    from ..services.testcase_generator import (
        generate_scenario_description_with_title, NoProvidersAvailableError,
        run_across_providers_in_parallel, _providers_in_rotation_order,
    )

    def scoped_qs():
        qs = base_qs
        if not force:
            qs = qs.filter(description_is_scenario=False)
        return qs

    try:
        provider_count = len(_providers_in_rotation_order())
    except NoProvidersAvailableError as exc:
        return {"error": str(exc)}

    start = time.monotonic()
    batch_size = min(max_actions, provider_count * round_size_per_provider)
    problems = list(scoped_qs().order_by("id")[:batch_size])

    def call_one(problem, provider):
        return generate_scenario_description_with_title(
            title=problem.title, description=problem.description,
            examples=problem.examples, providers=[provider],
        )

    results = run_across_providers_in_parallel(problems, call_one, timeout_seconds=time_budget_seconds)

    processed = []
    for problem, result, error in results:
        entry = {"id": problem.id, "title": problem.title}
        if error is not None:
            entry["error"] = str(error)
        else:
            new_title, rewritten = result
            update_fields = ["title", "description", "description_is_scenario"]
            if not problem.description_original:
                problem.description_original = problem.description
                update_fields.append("description_original")
            problem.title = new_title
            problem.description = rewritten
            problem.description_is_scenario = True
            problem.save(update_fields=update_fields)
            entry["generated"] = True
            entry["new_title"] = new_title
        processed.append(entry)

    return {
        "processed": processed,
        "elapsed_seconds": round(time.monotonic() - start, 1),
        "remaining_problems": scoped_qs().count(),
    }

def _missing_generic_starter_code_q(force=False):
    """Base scope for the "Generate Starter Code" sweep: only problems
    actually on the new judge with a schema to derive a stub from — a
    problem that hasn't migrated yet (or has no schema) has nothing this
    sweep could compute anyway. `force=False` (the normal click) further
    excludes problems that already have a snapshot, so a later click only
    reaches ones the sweep hasn't touched yet; `force=True` re-touches
    every eligible problem (e.g. after starter_code.py itself changes)."""
    q = Q(uses_generic_judge=True, generic_schema__isnull=False)
    if not force:
        q &= Q(generic_starter_code={})
    return q

def _migrate_problem_to_generic_judge(problem):
    """One problem's full pipeline onto the new type-driven judging
    framework: ensure a generic_schema exists (generate via LLM if
    missing — never regenerated if already present, that stays a
    separate, deliberate action), structurally validate it, generate
    fresh test cases in the new wire format via the LLM (always
    regenerated — a stale/legacy-format test case is worse than a fresh
    one), and only flip Problem.uses_generic_judge on once both the
    schema and at least one test case actually check out. Never raises —
    every failure mode is reported in the returned dict instead, so a
    per-topic sweep can keep going through the rest of the topic after
    one problem fails."""
    from ..services.judging.schema_generator import generate_generic_schema, validate_generic_schema
    from ..services.judging.generic_testcase_generator import generate_generic_test_cases
    from ..services.testcase_generator import TestCaseGenError

    entry = {"id": problem.id, "title": problem.title}

    schema = problem.generic_schema
    if not schema:
        try:
            schema = generate_generic_schema(
                title=problem.title, description=problem.description, examples=problem.examples,
                known_kind=_known_generic_schema_kind(problem),
            )
        except TestCaseGenError as exc:
            entry["error"] = f"Schema generation failed: {exc}"
            return entry
        problem.generic_schema = schema
        entry["schema_generated"] = True

    errors = validate_generic_schema(schema)
    if errors:
        entry["schema_errors"] = errors
        problem.uses_generic_judge = False
        problem.save(update_fields=["generic_schema", "uses_generic_judge"])
        return entry

    if schema.get("kind") == "stdin":
        # No function/class to speak of — the student's own program
        # handles all its I/O, so there's nothing for an LLM to generate
        # test cases FOR. Keep whatever TestCase rows this problem already
        # has (raw plain-input text, matching the problem's own stated
        # format) and just enable the judge directly.
        if not problem.test_cases.exists():
            entry["warning"] = "No test cases exist for this stdin-mode problem yet — add some before students can submit."
        problem.uses_generic_judge = True
        problem.save(update_fields=["generic_schema", "uses_generic_judge"])
        entry["enabled"] = True
        return entry

    try:
        cases = generate_generic_test_cases(title=problem.title, description=problem.description, schema=schema)
    except TestCaseGenError as exc:
        entry["error"] = f"Test case generation failed: {exc}"
        problem.uses_generic_judge = False
        problem.save(update_fields=["generic_schema", "uses_generic_judge"])
        return entry

    if not cases:
        entry["error"] = "All generated test cases failed structural validation."
        problem.uses_generic_judge = False
        problem.save(update_fields=["generic_schema", "uses_generic_judge"])
        return entry

    with transaction.atomic():
        problem.test_cases.all().delete()
        TestCase.objects.bulk_create([
            TestCase(problem=problem, stdin=c["stdin"], expected_output=c["expected_output"],
                     is_sample=(i == 0), order=i + 1, input_format=TestCase.INPUT_FORMAT_WIRE)
            for i, c in enumerate(cases)
        ])
        problem.uses_generic_judge = True
        problem.save(update_fields=["generic_schema", "uses_generic_judge"])

    entry["test_cases_generated"] = len(cases)
    entry["enabled"] = True
    return entry

def _topic_metadata_worker(run_id, work_queue):
    """One worker thread's loop — pulls a problem id off the shared queue
    and fills in whatever metadata it's missing. Mirrors
    _explanation_audit_worker's concurrency pattern exactly: several of
    these run at once (one per active LLM provider), each independent call
    naturally rotates to a different least-recently-used provider."""
    import queue as queue_module
    from django.db import close_old_connections
    from django.db.models import F
    from django.db.models.functions import Greatest

    close_old_connections()
    try:
        while True:
            try:
                pid = work_queue.get_nowait()
            except queue_module.Empty:
                return

            if ProblemMetadataGenerationRun.objects.filter(id=run_id, stop_requested=True).exists():
                return

            problem = Problem.objects.filter(id=pid).first()
            if not problem:
                continue

            schema_generated = False
            explanation_generated = False
            hints_generated = False
            error_text = ''
            try:
                result = _fill_missing_problem_metadata(problem)
                schema_generated = bool(result.get("schema_generated"))
                explanation_generated = bool(result.get("explanation_generated"))
                hints_generated = bool(result.get("hints_generated"))
                if result.get("errors"):
                    error_text = "; ".join(f"{k}: {v}" for k, v in result["errors"].items())[:2000]
            except Exception as exc:  # noqa: BLE001 — one bad problem must not kill the whole run
                logger.exception("Topic metadata generation failed on problem %s", pid)
                error_text = str(exc)[:2000]

            update_fields = {
                'processed_count': F('processed_count') + 1,
                'last_problem_id': Greatest(F('last_problem_id'), pid),
                'updated_at': timezone.now(),
            }
            if schema_generated:
                update_fields['schema_generated_count'] = F('schema_generated_count') + 1
            if explanation_generated:
                update_fields['explanation_generated_count'] = F('explanation_generated_count') + 1
            if hints_generated:
                update_fields['hints_generated_count'] = F('hints_generated_count') + 1
            if error_text:
                update_fields['failed_count'] = F('failed_count') + 1
                update_fields['last_error'] = error_text
            ProblemMetadataGenerationRun.objects.filter(id=run_id).update(**update_fields)
    finally:
        close_old_connections()

def _run_topic_metadata_generation(run_id, topic):
    """Background-thread worker for ProblemMetadataGenerationRun — balances
    every Problem in one topic (tags contains `topic`, or untagged) missing
    param_schema/explanation across a pool of concurrent workers, one per
    active LLM provider. Same checkpoint-per-problem, stop/resume-safe
    design as _run_explanation_audit."""
    import queue as queue_module
    from ..services.testcase_generator import _providers_in_rotation_order

    run = ProblemMetadataGenerationRun.objects.get(id=run_id)

    try:
        active_providers = _providers_in_rotation_order()
    except Exception:
        active_providers = []

    if not active_providers:
        run.status = 'stopped'
        run.last_error = 'No active LLM providers configured — add/activate one under LLM Providers first.'
        run.save(update_fields=['status', 'last_error', 'updated_at'])
        return

    worker_count = min(len(active_providers), MAX_EXPLANATION_AUDIT_WORKERS)

    problem_ids = list(
        _problems_in_topic(topic)
        .filter(_missing_metadata_q())
        .filter(id__gt=run.last_problem_id)
        .order_by('id')
        .values_list('id', flat=True)
    )
    work_queue = queue_module.Queue()
    for pid in problem_ids:
        work_queue.put(pid)

    threads = [
        threading.Thread(target=_topic_metadata_worker, args=(run_id, work_queue), daemon=True)
        for _ in range(worker_count)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    run.refresh_from_db()
    if run.stop_requested:
        run.status = 'stopped'
        run.stop_requested = False
        run.save(update_fields=['status', 'stop_requested', 'updated_at'])
    else:
        run.status = 'completed'
        run.save(update_fields=['status', 'updated_at'])

_DRIVE_FILE_ID_RE = re.compile(r'^[A-Za-z0-9_-]{20,}$')

_DRIVE_SHARE_LINK_ID_RE = re.compile(
    r'drive\.google\.com/(?:file/d/|thumbnail\?id=|uc\?(?:export=\w+&)?id=|open\?id=)([A-Za-z0-9_-]{20,})'
)

def _resolve_drive_image(raw_value):
    """The Aptitude Bank Excel Template's image columns can hold a
    ready-to-use image URL, a bare Google Drive file ID (e.g. a Figure
    Series export where every option is an image referenced by its Drive
    file ID rather than a URL), or — commonly, when someone pastes straight
    from Drive's Share dialog — a full Drive share/preview link with the
    file ID embedded in it. All three route through our own caching proxy
    (see aptitude_drive_image_proxy) once a file ID is found — Drive's
    endpoints are noticeably slow to serve cold, and with hundreds of
    image-based questions on one page that adds up fast; the proxy fetches
    from Drive once per file and serves every request after that from
    local disk with a long-lived Cache-Control header. Only a genuine
    non-Drive image URL (e.g. any other image host) passes through
    unchanged, since there's nothing Drive-specific to cache-proxy there."""
    val = (raw_value or "").strip().strip('*').strip()
    if not val:
        return ""
    if val.lower().startswith(("http://", "https://")):
        m = _DRIVE_SHARE_LINK_ID_RE.search(val)
        if m:
            return f"/api/aptitude/drive-image/{m.group(1)}/"
        return val
    if _DRIVE_FILE_ID_RE.match(val):
        return f"/api/aptitude/drive-image/{val}/"
    return val

def aptitude_drive_image_proxy(request, drive_id):
    """Serve a Google-Drive-hosted aptitude question/option image, caching
    it to local disk on first request so every request after that is a
    local file read instead of a round trip to Drive's thumbnail endpoint.
    Public/no-auth by design — these are the exact same files Drive itself
    already serves without authentication (that's what makes storing a bare
    file ID + resolving to a public thumbnail URL work at all), so proxying
    them adds no new exposure. Once `pull_drive_images` has been run,
    every referenced image is already cached and this never touches Drive
    at all — it only falls back to a live fetch for anything new."""
    if not _DRIVE_FILE_ID_RE.match(drive_id or ""):
        raise Http404("Invalid image id.")

    cached_path = cached_image_path(drive_id)
    if not cached_path:
        try:
            cached_path = fetch_and_cache_drive_image(drive_id)
        except DriveImageFetchError:
            raise Http404("Image could not be retrieved from Drive.")

    content_type = mimetypes.guess_type(cached_path)[0] or "image/png"
    response = FileResponse(open(cached_path, "rb"), content_type=content_type)
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response

def institution_logo_proxy(request, institution_id):
    """Serve an institution's uploaded logo file bytes through the /api/
    proxy path. Django's MEDIA_URL route only exists when DEBUG=True and
    the production nginx config has no /media/ passthrough, so serving
    ImageField.url directly 404s (or falls through to the SPA) in
    production — this rides the same /api/ path everything else already
    proxies correctly in both dev and prod. Public/no-auth: logos appear
    on public login screens before any authentication happens. Not
    marked immutable like the Drive image cache — a logo can be
    re-uploaded, so a short max-age keeps a stale one from sticking
    around in the browser cache for long."""
    institution = get_object_or_404(Institution, id=institution_id)
    if not institution.logo_file:
        raise Http404("No logo uploaded for this institution.")

    content_type = mimetypes.guess_type(institution.logo_file.name)[0] or "image/png"
    response = FileResponse(institution.logo_file.open("rb"), content_type=content_type)
    response["Cache-Control"] = "public, max-age=300"
    return response

def _resolve_aptitude_correct_option(raw_answer, option_a, option_b, option_c, option_d):
    """Verify/derive the correct option letter for an aptitude question —
    shared by the individual add/edit form and the bulk upload, so an
    existing question edited by hand gets the same verification as a
    freshly-bulk-uploaded one. Handles a bare letter (A/B/C/D), a prefixed
    form like "Option A" or "Ans: B", and an answer given as the option's
    own text rather than a letter. Returns None if nothing resolves to
    exactly one of the four options."""
    val = (raw_answer or "").strip()
    if not val:
        return None
    upper = val.upper()
    if upper in ("A", "B", "C", "D"):
        return upper
    m = re.search(r'(?<![A-Za-z0-9])([ABCD])(?![A-Za-z0-9])', upper)
    if m:
        return m.group(1)
    options = {"A": option_a, "B": option_b, "C": option_c, "D": option_d}
    matches = [letter for letter, text in options.items() if (text or "").strip().lower() == val.lower()]
    if len(matches) == 1:
        return matches[0]
    return None

MAX_EXPLANATION_AUDIT_WORKERS = 8

def _explanation_audit_worker(run_id, work_queue):
    """One worker thread's loop — pulls a question id at a time off the
    shared queue and checks/rewrites its explanation. Several of these run
    concurrently (one per active LLM provider, up to a cap); each call to
    check_aptitude_explanation independently rotates to whichever provider
    was least-recently-used, so with several calls in flight at once work
    naturally spreads across every active provider instead of the whole
    audit funneling through one provider at a time."""
    import queue as queue_module
    from django.db import close_old_connections
    from django.db.models import F
    from django.db.models.functions import Greatest
    from ..services.aptitude_validator import check_aptitude_explanation
    from ..services.testcase_generator import TestCaseGenError

    close_old_connections()
    try:
        while True:
            try:
                qid = work_queue.get_nowait()
            except queue_module.Empty:
                return

            if AptitudeExplanationAuditRun.objects.filter(id=run_id, stop_requested=True).exists():
                return

            q = AptitudeQuestion.objects.filter(id=qid).first()
            if not q:
                continue

            corrected = False
            error_text = ''
            try:
                result = check_aptitude_explanation(
                    question_text=q.question_text, option_a=q.option_a, option_b=q.option_b,
                    option_c=q.option_c, option_d=q.option_d, correct_option=q.correct_option,
                    explanation=q.explanation,
                )
                if not result['explanation_correct'] or not (q.explanation or '').strip():
                    q.explanation = result['corrected_explanation']
                    q.save(update_fields=['explanation'])
                    corrected = True
            except TestCaseGenError as exc:
                error_text = str(exc)[:2000]
            except Exception as exc:  # noqa: BLE001 — one bad question must not kill the whole run
                logger.exception("Explanation audit failed on question %s", qid)
                error_text = str(exc)[:2000]

            update_fields = {
                'processed_count': F('processed_count') + 1,
                # Greatest(), not a plain assignment — workers finish out of
                # order, so a slower worker on an earlier id must not walk
                # the resume cursor backwards past what a faster worker on a
                # later id already checkpointed.
                'last_question_id': Greatest(F('last_question_id'), qid),
                'updated_at': timezone.now(),
            }
            if corrected:
                update_fields['corrected_count'] = F('corrected_count') + 1
            if error_text:
                update_fields['failed_count'] = F('failed_count') + 1
                update_fields['last_error'] = error_text
            AptitudeExplanationAuditRun.objects.filter(id=run_id).update(**update_fields)
    finally:
        close_old_connections()

def _run_explanation_audit(run_id):
    """Background-thread worker for AptitudeExplanationAuditRun — balances
    every AptitudeQuestion (id > run.last_question_id) across a pool of
    concurrent workers, one per active LLM provider (capped), instead of
    processing them one at a time through a single provider. Progress is
    checkpointed atomically (via F()) after every question, so a server
    restart or explicit Stop never loses more than whatever was in flight
    at that instant."""
    import queue as queue_module
    from ..services.testcase_generator import _providers_in_rotation_order

    run = AptitudeExplanationAuditRun.objects.get(id=run_id)

    try:
        active_providers = _providers_in_rotation_order()
    except Exception:
        active_providers = []

    if not active_providers:
        run.status = 'stopped'
        run.last_error = 'No active LLM providers configured — add/activate one under LLM Providers first.'
        run.save(update_fields=['status', 'last_error', 'updated_at'])
        return

    worker_count = min(len(active_providers), MAX_EXPLANATION_AUDIT_WORKERS)

    question_ids = list(
        AptitudeQuestion.objects.filter(id__gt=run.last_question_id).order_by('id').values_list('id', flat=True)
    )
    work_queue = queue_module.Queue()
    for qid in question_ids:
        work_queue.put(qid)

    threads = [
        threading.Thread(target=_explanation_audit_worker, args=(run_id, work_queue), daemon=True)
        for _ in range(worker_count)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    run.refresh_from_db()
    if run.stop_requested:
        run.status = 'stopped'
        run.stop_requested = False
        run.save(update_fields=['status', 'stop_requested', 'updated_at'])
    else:
        run.status = 'completed'
        run.save(update_fields=['status', 'updated_at'])

def _generate_otp():
    import random
    return f"{random.randint(0, 999999):06d}"

def _mask_email(email):
    if '@' not in email:
        return email
    local, domain = email.split('@', 1)
    return f"{local[:2]}***@{domain}"

def _send_password_reset_otp_email(to_email, name, code):
    from django.core.mail import send_mail
    send_mail(
        subject="Your Code2Day password reset code",
        message=(
            f"Hi {name},\n\n"
            f"Your Code2Day password reset code is: {code}\n\n"
            f"This code expires in {PasswordResetOTP.OTP_VALIDITY_MINUTES} minutes. "
            "If you didn't request this, you can safely ignore this email — "
            "your password will not change unless this code is used."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=False,
    )

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

def _staff_guard(request):
    """Returns (staff_profile, None) or (None, Response)."""
    if not request.user.is_authenticated or not hasattr(request.user, 'staff_profile'):
        return None, Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)
    profile = request.user.staff_profile
    if not profile.is_active:
        return None, Response({"detail": "Your account has been disabled."}, status=status.HTTP_403_FORBIDDEN)
    return profile, None

def _staff_from_request(request):
    try:
        return request.user.staff_profile
    except Exception:
        return None

def _student_from_request(request):
    try:
        return request.user.student_profile
    except Exception:
        return None

def _serialize_assignment(a, student=None):
    """Compact assignment dict shared across HOD / staff / student views."""
    problems = list(a.lab_topic.problems.filter(is_active=True).values(
        "id", "slug", "title", "difficulty", "order"
    ))
    solved_slugs = set()
    if student:
        solved_slugs = set(
            LabAssignmentSubmission.objects.filter(
                assignment=a, student=student, all_passed=True
            ).values_list("problem__slug", flat=True)
        )
    for p in problems:
        p["solved"] = p["slug"] in solved_slugs

    return {
        "id":             a.id,
        "name":           a.name,
        "subject":        a.subject,
        "batch":          a.batch,
        "year":           a.year,
        "section":        a.section,
        "start_date":     a.start_date.isoformat() if a.start_date else None,
        "deadline":       a.deadline.isoformat(),
        "is_expired":     a.is_expired,
        "is_active":      a.is_active,
        "created_at":     a.created_at.isoformat(),
        "topic": {
            "id":   a.lab_topic.id,
            "name": a.lab_topic.name,
            "slug": a.lab_topic.slug,
            "icon": a.lab_topic.icon,
        },
        "assigned_staff": {
            "id":   a.assigned_staff.id,
            "name": a.assigned_staff.name,
        } if a.assigned_staff else None,
        "problems":       problems,
        "total_problems": len(problems),
        "solved_count":   len(solved_slugs),
        "all_complete":   len(problems) > 0 and len(solved_slugs) == len(problems),
    }

def _parse_dt(value):
    """Parse an ISO datetime string into a timezone-aware datetime. Returns None on failure."""
    if not value:
        return None
    if hasattr(value, "isoformat"):
        return value if value.tzinfo else timezone.make_aware(value)
    try:
        from datetime import datetime as _dt
        parsed = _dt.fromisoformat(str(value))
        return parsed if parsed.tzinfo else timezone.make_aware(parsed)
    except (ValueError, TypeError):
        return None

def _serialize_lab_v2(lab, student=None):
    try:
        ex_count = lab.exercises.count()
    except Exception:
        ex_count = 0
    result = {
        "id": lab.id,
        "name": lab.name,
        "batch": lab.batch,
        "section": lab.section,
        "start_date": lab.start_date.isoformat() if lab.start_date else None,
        "end_date": lab.end_date.isoformat() if lab.end_date else None,
        "is_active": lab.is_active,
        "is_expired": lab.is_expired,
        "exercise_count": ex_count,
        "created_at": lab.created_at.isoformat(),
        "lab_type": lab.lab_type,
        "company": {
            "id": lab.company.id,
            "name": lab.company.name,
        } if lab.company_id else None,
        "allowed_languages": lab.allowed_languages or list(LAB_LANGUAGE_CHOICES),
        "staff_in_charge": {
            "id": lab.staff_in_charge.id,
            "name": lab.staff_in_charge.name,
            "faculty_id": lab.staff_in_charge.faculty_id,
        } if lab.staff_in_charge else None,
        "created_by": {
            "id": lab.created_by.id,
            "name": lab.created_by.name,
        } if lab.created_by else None,
        "linked_lab_id": lab.linked_lab_id,
        "approval_status": lab.approval_status,
        "is_published": lab.is_published,
        "enable_tab_switch_check": lab.enable_tab_switch_check,
        "max_tab_switches": lab.max_tab_switches,
        "enable_fullscreen_lock": lab.enable_fullscreen_lock,
        "enable_copy_paste_lock": lab.enable_copy_paste_lock,
        "pass_threshold_percent": lab.pass_threshold_percent,
    }
    if student is not None:
        completed = LabExerciseSubmission.objects.filter(
            exercise__lab=lab, student=student
        ).count()
        result["student_progress"] = {"completed": completed, "total": ex_count}
    return result

def _serialize_exercise(ex):
    submission_count = getattr(ex, "submission_count", None)
    test_case_count = getattr(ex, "test_case_count", None)
    if submission_count is None and ex.pk:
        submission_count = ex.submissions.count()
    if test_case_count is None and ex.pk:
        test_case_count = ex.test_cases.count()
    return {
        "id": ex.id,
        "title": ex.title,
        "description": ex.description,
        "explanation": ex.explanation,
        "order": ex.order,
        "created_at": ex.created_at.isoformat(),
        "added_by": {"id": ex.added_by.id, "name": ex.added_by.name} if ex.added_by else None,
        "submission_count": submission_count,
        "test_case_count": test_case_count,
        "difficulty": ex.difficulty,
    }

def _serialize_test_case(tc):
    return {
        "id": tc.id,
        "exercise_id": tc.exercise_id,
        "stdin": tc.stdin,
        "expected_output": tc.expected_output,
        "is_sample": tc.is_sample,
        "order": tc.order,
    }

def _nonnegative_int(value, default=0):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default

def _serialize_company_practical(company):
    """A Company IS its one practical — this serializes the Company together
    with the single Lab (lab_type="company") that belongs to it."""
    lab = getattr(company, "lab", None)
    return {
        "id": company.id,
        "name": company.name,
        "created_at": company.created_at.isoformat(),
        "lab_id": lab.id if lab else None,
        "batch": lab.batch if lab else "",
        "section": lab.section if lab else "",
        "start_date": lab.start_date.isoformat() if lab and lab.start_date else None,
        "end_date": lab.end_date.isoformat() if lab and lab.end_date else None,
        "is_expired": lab.is_expired if lab else None,
        "exercise_count": lab.exercises.count() if lab else 0,
        "allowed_languages": (lab.allowed_languages if lab and lab.allowed_languages else list(LAB_LANGUAGE_CHOICES)),
        "staff_in_charge": {
            "id": lab.staff_in_charge.id,
            "name": lab.staff_in_charge.name,
            "faculty_id": lab.staff_in_charge.faculty_id,
        } if lab and lab.staff_in_charge else None,
    }

def _parse_lab_description(text):
    """Parse a LabExercise.description blob into {problem, examples,
    difficulty, hint} — a Python port of parseDescription() in
    StaffLabPanel.jsx. Keep the two in sync if the text format changes."""
    result = {"problem": "", "examples": [], "difficulty": "Medium", "hint": ""}
    if not text:
        return result

    section = "problem"
    problem_lines = []
    cur_ex = None

    for line in text.split("\n"):
        t = line.strip()
        if t == "Examples:":
            section = "examples"
            cur_ex = {"input": "", "output": "", "explanation": ""}
            continue
        if t == "Constraints:":
            if cur_ex:
                result["examples"].append(cur_ex)
                cur_ex = None
            section = "constraints"
            continue
        diff_match = re.match(r"^Difficulty:\s*(.*)", t)
        if diff_match:
            result["difficulty"] = diff_match.group(1).strip() or "Medium"
            continue
        hint_match = re.match(r"^Hint:\s*(.*)", t)
        if hint_match:
            result["hint"] = hint_match.group(1).strip()
            continue

        if section == "problem":
            problem_lines.append(line)
        elif section == "examples":
            im = re.match(r"^\s*Input:\s*(.*)", line)
            om = re.match(r"^\s*Output:\s*(.*)", line)
            em = re.match(r"^\s*Explanation:\s*(.*)", line)
            if im:
                if cur_ex and cur_ex["input"]:
                    result["examples"].append(cur_ex)
                    cur_ex = {"input": "", "output": "", "explanation": ""}
                if cur_ex is not None:
                    cur_ex["input"] = im.group(1)
            elif om and cur_ex is not None:
                cur_ex["output"] = om.group(1)
            elif em and cur_ex is not None:
                cur_ex["explanation"] = em.group(1)
        # section == "constraints": intentionally dropped, matching the JS port.

    if cur_ex:
        result["examples"].append(cur_ex)
    result["problem"] = "\n".join(problem_lines).strip()
    return result

def _compile_lab_description(parsed):
    """Rebuild a LabExercise.description blob from parsed fields — a
    Python port of compileDescription() in StaffLabPanel.jsx."""
    parts = []
    if parsed["problem"].strip():
        parts.append(parsed["problem"].strip())

    exs = [e for e in parsed["examples"] if e.get("input", "").strip() or e.get("output", "").strip()]
    if exs:
        parts.append("\nExamples:")
        for e in exs:
            if e.get("input", "").strip():
                parts.append(f"  Input:  {e['input'].strip()}")
            if e.get("output", "").strip():
                parts.append(f"  Output: {e['output'].strip()}")
            if e.get("explanation", "").strip():
                explanation = re.sub(r"\s+", " ", e["explanation"].strip())
                parts.append(f"  Explanation: {explanation}")

    if parsed.get("difficulty"):
        parts.append(f"\nDifficulty: {parsed['difficulty']}")
    if parsed.get("hint", "").strip():
        parts.append(f"\nHint: {parsed['hint'].strip()}")

    return "\n".join(parts)

def _is_auto_placeholder(value):
    return (value or "").strip().lower() in {"", "auto", "generate", "generated"}

def _run_and_close_connections(fn, **kwargs):
    """Thread-pool target wrapper — a worker thread that touches the ORM
    (as generate_test_cases/generate_hint do, for LLMProvider rotation)
    opens its own DB connection that Django never closes on its own,
    since the request-lifecycle cleanup signals only cover the main
    request thread. Close it explicitly once the call is done either way,
    or a connection leaks every time this runs."""
    from django.db import connections
    try:
        return fn(**kwargs)
    finally:
        connections.close_all()

def _auto_generate_lab_test_cases(exercise, num_cases=None, raise_on_error=False, replace_existing=False):
    """LLM test case generation for a LabExercise, plus a best-effort
    backfill of the description's Hint: line and Examples: section. Examples
    are derived from generated test cases; when replace_existing=True the
    staff Generate button intentionally replaces old examples. The hint is a
    separate LLM call made concurrently with test case generation.

    By default best-effort — a generation failure shouldn't block exercise
    creation. Pass raise_on_error=True for manual/on-demand triggers where
    the caller wants to surface the failure to the user instead of
    silently no-op'ing."""
    if exercise.test_cases.exists() and not replace_existing:
        return 0

    from concurrent.futures import ThreadPoolExecutor
    from ..services.testcase_generator import (
        generate_test_cases, generate_hint, derive_examples, extract_difficulty, TestCaseGenError,
    )

    parsed = _parse_lab_description(exercise.description)
    needs_hint = _is_auto_placeholder(parsed["hint"])
    needs_examples = replace_existing or not parsed["examples"]
    generation_description = exercise.description
    if replace_existing:
        generation_description = _compile_lab_description({
            **parsed,
            "examples": [],
            "hint": "" if needs_hint else parsed["hint"],
        })

    with ThreadPoolExecutor(max_workers=2) as pool:
        tc_future = pool.submit(
            _run_and_close_connections, generate_test_cases,
            title=exercise.title, description=generation_description,
            num_cases=num_cases, difficulty=extract_difficulty(exercise.description),
        )
        hint_future = (
            pool.submit(_run_and_close_connections, generate_hint, title=exercise.title, description=exercise.description)
            if needs_hint else None
        )

        try:
            generated = tc_future.result()
        except TestCaseGenError as exc:
            logger.warning("Auto test-case generation failed for lab exercise %r: %s", exercise.title, exc)
            if raise_on_error:
                raise
            return 0

        hint_text = None
        if hint_future is not None:
            try:
                hint_text = hint_future.result()
            except TestCaseGenError as exc:
                logger.warning("Auto hint generation failed for lab exercise %r: %s", exercise.title, exc)

    generated_rows = [
        LabExerciseTestCase(
            exercise=exercise,
            stdin=case["stdin"],
            expected_output=case["expected_output"],
            is_sample=case["is_sample"],
            order=order,
        )
        for order, case in enumerate(generated, start=1)
    ]
    with transaction.atomic():
        if replace_existing:
            exercise.test_cases.all().delete()
        LabExerciseTestCase.objects.bulk_create(generated_rows)

    if needs_examples or hint_text:
        if needs_examples:
            parsed["examples"] = derive_examples(generated)[:1]
        if hint_text:
            parsed["hint"] = hint_text
        exercise.description = _compile_lab_description(parsed)
        exercise.save(update_fields=["description"])

    return len(generated)

_LAB_REPORT_GEN_SEMAPHORE = threading.BoundedSemaphore(12)

def _is_valid_algorithm(alg):
    if not alg or not str(alg).strip():
        return False
    alg_str = str(alg).strip()
    if alg_str.startswith("(") or alg_str == "—" or len(alg_str) < 15:
        return False
    return True

def _fallback_algorithm(exercise_title, language):
    title_clean = (exercise_title or "the program").strip()
    return (
        f"1. Start the program execution in {language or 'the selected programming language'}.\n"
        f"2. Define and initialize required variables and input structures.\n"
        f"3. Read input data from standard input or arguments according to {title_clean}.\n"
        f"4. Process the input logic step-by-step and execute standard algorithmic operations.\n"
        f"5. Output the result to standard output and complete execution."
    )

def _generate_lab_exercise_report(exercise, submission):
    """Build (or rebuild) a LabExerciseReport + its PDF for one submission.
    Protected with _LAB_REPORT_GEN_SEMAPHORE to ensure max 12 heavy generations
    run concurrently under high load (e.g. 120+ simultaneous users).
    """
    with _LAB_REPORT_GEN_SEMAPHORE:
        submission.refresh_from_db()
        existing_report = getattr(submission, "report", None)
        if existing_report and existing_report.pdf_file and _is_valid_algorithm(existing_report.algorithm):
            try:
                existing_report.pdf_file.open("rb")
                existing_report.pdf_file.seek(0)
                pdf_bytes = existing_report.pdf_file.read()
                existing_report.pdf_file.close()
                if pdf_bytes and len(pdf_bytes) >= 1000:
                    return existing_report, pdf_bytes
            except Exception as exc:
                logger.warning("Failed reading cached PDF for report %s: %s, regenerating...", getattr(existing_report, "id", None), exc)

        from ..services.lab_report import (
            extract_problem_statement, build_aim, get_or_generate_question_algorithm, build_result,
        )
        from ..services.lab_report_pdf import build_lab_report_pdf

        problem_statement = extract_problem_statement(exercise.description)
        aim = build_aim(exercise.title, problem_statement)

        # Single canonical algorithm per Question (exercise), shared across all students
        algorithm = get_or_generate_question_algorithm(exercise)

        # Use the test-case results recorded at submit time — never re-run the
        # code here. Re-execution can legitimately differ from the graded run
        # (executor timing/flakiness), which previously caused a report to
        # show "Failed" for a submission the student was told had passed.
        # A LabExerciseSubmission only exists once it already cleared the
        # lab's pass_threshold_percent (or the exercise has no test cases),
        # so any existing submission is, by construction, an accepted one.
        passed_n = submission.passed_cases
        total_n = submission.total_cases
        test_case_rows = [
            (r.get("stdin", ""), r.get("expected", ""), r.get("actual", ""), "Passed" if r.get("passed") else "Failed")
            for r in (submission.test_results or [])
        ]
        result_text = build_result(exercise.title, all_passed=(True if test_case_rows else None))
        if test_case_rows:
            output_text = f"{passed_n}/{total_n} test case(s) passed."
            tc_note = ""
        else:
            output_text = "(No test cases configured for this exercise, or this submission predates result tracking.)"
            tc_note = "No stored test-case results for this submission — resubmit to generate an up-to-date record."

        status_label = "Passed" if test_case_rows else "Not Verified"
        details = {
            "language": submission.language or "—",
            "status": status_label,
            "score": f"{passed_n}/{total_n}" if total_n else "—",
            "percentage": f"{round(passed_n / total_n * 100)}%" if total_n else "—",
            "submitted_at": submission.submitted_at,
        }

        lab_exercise_ids = list(
            exercise.lab.exercises.order_by("order", "created_at").values_list("id", flat=True)
        )
        exp_no = lab_exercise_ids.index(exercise.id) + 1 if exercise.id in lab_exercise_ids else exercise.order + 1

        report, _created = LabExerciseReport.objects.update_or_create(
            submission=submission,
            defaults=dict(
                exp_no=exp_no,
                exp_name=exercise.title,
                aim=aim,
                algorithm=algorithm,
                program=submission.code,
                output=output_text,
                result=result_text,
            ),
        )

        buffer = BytesIO()
        build_lab_report_pdf(
            buffer, report=report, test_case_rows=test_case_rows, test_case_note=tc_note, details=details,
        )
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()
        report.pdf_file.save(f"lab_report_{report.id}.pdf", ContentFile(pdf_bytes), save=True)
        return report, pdf_bytes

