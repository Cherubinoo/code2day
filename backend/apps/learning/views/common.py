"""Views extracted from the original monolithic apps/learning/views.py
(module: common). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from ._imports import *
from ._shared import *


class DashboardView(UnifiedAuthMixin, APIView):
    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error

        problems = Problem.objects.all()

        range_start = parse_date_param(request.query_params.get('start_date'))
        range_end = parse_date_param(request.query_params.get('end_date'))

        # Handle staff/hod/academics/admin/director/tpu/principal/ja users differently
        if profile_type in ["staff", "hod", "academics", "admin", "director", "tpu", "principal", "ja"]:
            # Get profile details
            profile_obj = profile if profile else None
            user_department = getattr(profile_obj, 'department', None) if profile_obj else None

            # Institution-wide roles always see the whole institution, never
            # department-scoped data — even if their own StaffProfile record
            # happens to carry a department FK (stale/seed data), since their
            # dashboard is framed around "Overall Institution", not one dept.
            if profile_type in ["admin", "director", "tpu", "principal", "ja"]:
                user_department = None

            # Filter by institution for multi-tenant support
            inst = getattr(profile_obj, 'institution', None)

            # Filter student count by department for HOD / Academic Coordinator, all for admin/staff within institution
            if profile_type in ["hod", "academics"] and user_department:
                students_qs = StudentProfile.objects.filter(department=user_department, institution=inst)
                student_count = students_qs.count()
                dept_contests = Contest.objects.filter(department=user_department, institution=inst)
                contest_count = dept_contests.count()
                pending_approvals = dept_contests.filter(status='pending_approval').count()

                weekly_activity = build_solved_activity_series(
                    Q(student__department=user_department, student__institution=inst),
                    start_date=range_start, end_date=range_end,
                )
            else:
                student_count = StudentProfile.objects.filter(institution=inst).count() if inst else StudentProfile.objects.count()
                contest_count = Contest.objects.filter(institution=inst).count() if inst else Contest.objects.count()
                pending_approvals = Contest.objects.filter(status='pending_approval', institution=inst).count() if profile_type in ["admin", "director", "tpu", "principal", "ja"] and inst else 0

                weekly_activity = build_solved_activity_series(
                    Q(student__institution=inst) if inst else Q(),
                    start_date=range_start, end_date=range_end,
                )

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
            if profile_type in ["admin", "director", "tpu", "principal", "ja"]:
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
                    "Principal" if profile_type == "principal" else
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
            if profile_type in ["hod", "academics"] and user_department:
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
            elif profile_type in ["admin", "director", "tpu", "principal", "ja"] and inst:
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
                "staff": StaffProfileSerializer(profile).data if profile and profile_type in ["staff", "hod", "academics"] else None,
                "locked_modules": inst.locked_modules if inst else [],
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
            preferred_language = "Python"

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
            "locked_modules": profile.institution.locked_modules if profile.institution else [],
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

        try:
            profile.tracked_companies = [c.strip() for c in companies if isinstance(c, str) and c.strip()]
            profile.save(update_fields=["tracked_companies"])
        except Exception:
            logger.exception("Failed to save tracked companies for student %s", getattr(profile, 'register_number', '?'))
            return Response(
                {"detail": "Failed to update tracked companies. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"status": "success", "tracked_companies": profile.tracked_companies})

class HealthCheckView(APIView):
    def get(self, request):
        payload = {
            "status": "ok",
            "executor_configured": bool(getattr(settings, "EXECUTOR_BASE_URL", "").strip()),
        }
        # Opt-in diagnostics — kept off the default fast path so this endpoint
        # stays cheap for routine uptime checks.
        if request.query_params.get("executor") == "1":
            from ..services.judge0 import check_judge0_health
            payload["executor"] = check_judge0_health()
        if request.query_params.get("packages") == "1":
            # Judge0 doesn't have a packages endpoint like Piston
            payload["packages"] = {"note": "Not available with Judge0"}
        # Exercises the FUNCTION-style driver-injection path (prepare_execution_payload)
        # that a typical Problems-page submission goes through, to verify the
        # typed-argument C wrapper. Temporary — remove once confirmed fixed.
        if request.query_params.get("test_driver") == "c":
            import time
            from types import SimpleNamespace
            from ..services.judging.judge0_service import Judge0Service
            from ..services.execution_adapter import prepare_execution_payload
            fake_problem = SimpleNamespace(execution_type="auto", slug="add-two-numbers", function_name="addTwoNumbers")
            source = "int addTwoNumbers(int a, int b) {\n    return a + b;\n}"
            start = time.time()
            try:
                prepared = prepare_execution_payload(problem=fake_problem, source_code=source, language="C", stdin="2\n3")
                result = Judge0Service().execute_single(source_code=prepared["source_code"], language_name="c", stdin=prepared["stdin"])
                payload["test_driver"] = {
                    "elapsed_s": round(time.time() - start, 2),
                    "prepared_stdin": prepared["stdin"],
                    "adapted": prepared["adapted"],
                    "generated_source": prepared["source_code"][:3000],
                    "result": result,
                }
            except Exception as exc:
                payload["test_driver"] = {"elapsed_s": round(time.time() - start, 2), "error": f"{type(exc).__name__}: {exc}"}
        # Same as above but for the Java driver wrapper — verifies the
        # char/String literal fixes and array-initializer fix actually
        # compile+run in production. Temporary — remove once confirmed fixed.
        if request.query_params.get("test_driver") == "java":
            import time
            from types import SimpleNamespace
            from ..services.judging.judge0_service import Judge0Service
            from ..services.execution_adapter import prepare_execution_payload
            fake_problem = SimpleNamespace(execution_type="auto", slug="add-two-numbers", function_name="addTwoNumbers")
            source = "class Solution {\n    public int addTwoNumbers(int a, int b) {\n        return a + b;\n    }\n}"
            start = time.time()
            try:
                prepared = prepare_execution_payload(problem=fake_problem, source_code=source, language="Java", stdin="[2, 3]")
                result = Judge0Service().execute_single(source_code=prepared["source_code"], language_name="java", stdin=prepared["stdin"])
                payload["test_driver"] = {
                    "elapsed_s": round(time.time() - start, 2),
                    "prepared_stdin": prepared["stdin"],
                    "adapted": prepared["adapted"],
                    "generated_source": prepared["source_code"][:3000],
                    "result": result,
                }
            except Exception as exc:
                payload["test_driver"] = {"elapsed_s": round(time.time() - start, 2), "error": f"{type(exc).__name__}: {exc}"}
        return Response(payload)

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
        student = StudentProfile.objects.filter(register_number__iexact=user_id).first()
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
        staff = StaffProfile.objects.filter(faculty_id__iexact=user_id).first()
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
        admin = User.objects.filter(username__iexact=user_id, is_superuser=True).first()
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

class ExecutorSystemInfoView(APIView):
    """Get executor system information and status."""
    permission_classes = [AllowAny]

    def get(self, request):
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
                system_info = json.loads(response.read().decode('utf-8'))
                return Response({
                    "status": "online",
                    "executor_info": {
                        "engine": "judge0",
                        "system_info": system_info,
                    }
                })
        except Exception as e:
            return Response(
                {"status": "offline", "error": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

class ExecutorSubmitView(APIView):
    """Submit code directly for execution — via the real Judge0 client
    (services/judging/judge0_service.py), same as every other execution
    entry point in this app now. Used to call the Piston-backed
    services/executor.py under a misleadingly-named alias
    (`execute_judge0_submission`, which wasn't Judge0 at all); that module
    is gone — everything runs on the self-hosted Judge0 instance."""
    permission_classes = [AllowAny]

    LANGUAGE_IDS = {
        "c": 50, "cpp": 54, "c++": 54, "java": 62,
        "python": 71, "javascript": 63, "js": 63,
    }

    def post(self, request):
        """Execute code via Judge0."""
        from ..services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID

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

        # This endpoint is AllowAny (no login required) — the same
        # size/dangerous-pattern check CodeRunView applies to authenticated
        # submissions, so an anonymous caller can't do anything a logged-in
        # student couldn't already. CodeValidator's pattern tables are
        # keyed by Capitalized display names, not this view's lowercase
        # `language` values.
        _VALIDATOR_LANGUAGE_NAMES = {
            "c": "C", "cpp": "C++", "c++": "C++", "java": "Java",
            "python": "Python", "javascript": "JavaScript", "js": "JavaScript",
        }
        is_valid, validation_error = validate_submission(
            _VALIDATOR_LANGUAGE_NAMES.get(language, language), source_code, stdin,
        )
        if not is_valid:
            return Response(
                {"detail": f"Code validation failed: {validation_error}"},
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

        language_name = LANGUAGE_NAME_BY_ID.get(int(language_id))
        if not language_name:
            return Response(
                {"detail": f"Unsupported language_id: {language_id}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            result = Judge0Service().execute_single(
                source_code=source_code,
                language_name=language_name,
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

class BatchCopyPasteToggleView(APIView):
    """Bulk toggle allow_copy_paste permission for ALL students in a batch or all batches."""
    permission_classes = [IsAuthenticated]

    def post(self, request, batch_code):
        if not (request.user.is_superuser or request.user.is_staff or getattr(request.user, 'role', '') in ('admin', 'hod', 'tpu', 'director', 'principal', 'ja') or hasattr(request.user, 'staff_profile')):
            return Response({"detail": "Staff or HOD access required."}, status=status.HTTP_403_FORBIDDEN)

        staff_profile = getattr(request.user, 'staff_profile', None)
        
        student_qs = StudentProfile.objects.all()
        if batch_code != "all":
            student_qs = student_qs.filter(batch=batch_code)
        
        if staff_profile:
            student_qs = student_qs.filter(institution_id=staff_profile.institution_id)
            if staff_profile.role not in ['admin', 'ja', 'tpu', 'director', 'principal']:
                student_qs = student_qs.filter(department_id=staff_profile.department_id)

        if 'allow_copy_paste' in request.data:
            new_status = bool(request.data['allow_copy_paste'])
        else:
            sample_student = student_qs.first()
            new_status = not sample_student.allow_copy_paste if sample_student else True

        updated_count = student_qs.update(allow_copy_paste=new_status)

        action_word = "unlocked" if new_status else "blocked"
        batch_label = f"Batch {batch_code}" if batch_code != "all" else "all batches"
        return Response({
            "detail": f"Copy-paste successfully {action_word} for all {updated_count} students in {batch_label}.",
            "batch": batch_code,
            "allow_copy_paste": new_status,
            "updated_count": updated_count,
        })

class BatchBlockToggleView(APIView):
    """Bulk toggle is_active permission (block/unblock login) for ALL students in a batch or all batches."""
    permission_classes = [IsAuthenticated]

    def post(self, request, batch_code):
        if not (request.user.is_superuser or request.user.is_staff or getattr(request.user, 'role', '') in ('admin', 'hod', 'tpu', 'director', 'principal', 'ja') or hasattr(request.user, 'staff_profile')):
            return Response({"detail": "Staff or HOD access required."}, status=status.HTTP_403_FORBIDDEN)

        staff_profile = getattr(request.user, 'staff_profile', None)
        
        student_qs = StudentProfile.objects.all()
        if batch_code != "all":
            student_qs = student_qs.filter(batch=batch_code)
        
        if staff_profile:
            student_qs = student_qs.filter(institution_id=staff_profile.institution_id)
            if staff_profile.role not in ['admin', 'ja', 'tpu', 'director', 'principal']:
                student_qs = student_qs.filter(department_id=staff_profile.department_id)

        if 'is_active' in request.data:
            new_status = bool(request.data['is_active'])
        else:
            sample_student = student_qs.first()
            new_status = not sample_student.is_active if sample_student else True

        updated_count = student_qs.update(is_active=new_status)

        action_word = "unblocked (activated)" if new_status else "blocked"
        batch_label = f"Batch {batch_code}" if batch_code != "all" else "all batches"
        return Response({
            "detail": f"Account login successfully {action_word} for all {updated_count} students in {batch_label}.",
            "batch": batch_code,
            "is_active": new_status,
            "updated_count": updated_count,
        })

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
        dept_students = StudentProfile.objects.filter(
            institution=staff_profile.institution,
            department=staff_profile.department,
            batch__isnull=False
        ).exclude(batch='')

        batches = dept_students.values('batch').annotate(
            student_count=Count('id')
        ).order_by('-batch')

        sections_by_batch = {}
        for row in batches:
            batch = row['batch']
            secs = sorted(set(
                s for s in dept_students.filter(batch=batch).values_list('section', flat=True) if s
            ))
            sections_by_batch[batch] = secs

        return Response({"batches": list(batches), "sections_by_batch": sections_by_batch})

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
                "section": student.section,
                "solved_count": student.solved_count,
                "current_streak": student.current_streak,
                "last_active": student.last_login_on.isoformat() if student.last_login_on else None,
                "is_active": student.account.is_active if student.account else True,
                "allow_copy_paste": student.allow_copy_paste,
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

        sections = request.data.get('sections', [])
        if not isinstance(sections, list):
            return Response(
                {"detail": "Sections must be a list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        contest.assigned_batches = batches
        contest.assigned_sections = sections
        contest.save(update_fields=['assigned_batches', 'assigned_sections'])

        # Assign students from whole batches plus any specifically assigned sections
        student_filter = Q(pk__in=[])
        if batches:
            student_filter |= Q(batch__in=batches)
        for entry in sections:
            batch, _, section = str(entry).partition('::')
            if batch and section:
                student_filter |= Q(batch=batch, section=section)

        students = StudentProfile.objects.filter(
            student_filter,
            institution=staff_profile.institution,
            department=staff_profile.department,
        ) if (batches or sections) else StudentProfile.objects.none()
        contest.assigned_students.set(students)

        return Response({
            "detail": "Batches assigned successfully.",
            "contest_id": contest.id,
            "assigned_batches": contest.assigned_batches,
            "assigned_sections": contest.assigned_sections,
            "assigned_student_count": contest.assigned_students.count(),
        })

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

class NotificationMarkAllReadView(UnifiedAuthMixin, APIView):
    def post(self, request):
        Notification.objects.filter(recipient=request.user).delete()
        return Response({"success": True, "message": "All notifications marked as read."})

class UserSystemUpdatesView(UnifiedAuthMixin, APIView):
    """User endpoint to read active platform updates matching their role"""
    def get(self, request):
        profile, profile_type, _ = self.get_authenticated_profile(request)
        user_role = "student" if hasattr(profile, 'register_number') else getattr(profile, 'role', 'staff')

        updates = SystemUpdate.objects.filter(
            is_active=True
        ).filter(
            Q(target_role='all') | Q(target_role=user_role)
        ).order_by('-created_at')[:10]

        data = [{
            "id": u.id,
            "title": u.title,
            "version": u.version,
            "content": u.content,
            "category": u.category,
            "target_role": u.target_role,
            "created_at": u.created_at.strftime("%b %d, %Y"),
        } for u in updates]

        return Response({"updates": data, "user_role": user_role})

class BatchReportPDFView(APIView):
    """Generate a comprehensive PDF performance report for a batch of students."""
    permission_classes = [IsAuthenticated]

    def get(self, request, batch_code):
        if not (hasattr(request.user, 'staff_profile') or request.user.is_superuser):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        staff = getattr(request.user, 'staff_profile', None)
        section_filter = request.GET.get('section', '')
        date_from = request.GET.get('date_from', '')
        date_to = request.GET.get('date_to', '')
        report_type = request.GET.get('type', 'overall')

        # Filter students
        students_qs = StudentProfile.objects.filter(batch=batch_code)
        if staff and staff.department and getattr(staff, 'role', '') not in ['admin', 'superuser']:
            students_qs = students_qs.filter(department=staff.department)
        if section_filter:
            students_qs = students_qs.filter(section=section_filter)

        if not students_qs.exists():
            return Response({"error": f"No students found for batch {batch_code}."}, status=status.HTTP_404_NOT_FOUND)

        from ..pdf_reports import create_watermarked_pdf_contest
        buffer = BytesIO()
        first_student = students_qs.first()
        institution = first_student.institution or getattr(staff, 'institution', None)
        department = first_student.department or getattr(staff, 'department', None)

        doc = create_watermarked_pdf_contest(
            buffer,
            institution=institution,
            department=department,
            pagesize=A4,
            topMargin=2.1 * inch,
            bottomMargin=0.6 * inch,
        )

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('BTitle', parent=styles['Heading1'], fontSize=18, spaceAfter=14, alignment=1, textColor=colors.HexColor('#2d5016'))
        header_style = ParagraphStyle('BHeader', parent=styles['Heading2'], fontSize=12, spaceBefore=12, spaceAfter=6, textColor=colors.HexColor('#39482a'))

        elements = []
        elements.append(Paragraph(f"Batch Performance Report: {batch_code}", title_style))
        if section_filter:
            elements.append(Paragraph(f"Section: {section_filter}", header_style))

        # Metrics overview
        total_students = students_qs.count()
        solved_qs = SolvedProblem.objects.filter(student__in=students_qs)
        total_problems_solved = solved_qs.count()
        total_submissions = ExecutionRecord.objects.filter(student__in=students_qs).count()
        avg_solved = (total_problems_solved / total_students) if total_students > 0 else 0

        summary_data = [
            ["Metric", "Value"],
            ["Batch Code", str(batch_code)],
            ["Total Students", str(total_students)],
            ["Total Problems Solved", str(total_problems_solved)],
            ["Total Code Executions", str(total_submissions)],
            ["Avg Solved per Student", f"{avg_solved:.1f}"],
        ]
        elements.append(Paragraph("Batch Summary Overview", header_style))
        t_summary = Table(summary_data, colWidths=[3*inch, 3.5*inch])
        t_summary.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d9c2')),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(t_summary)
        elements.append(Spacer(1, 0.2 * inch))

        # Student Leaderboard Table for the Batch
        elements.append(Paragraph("Student Performance Leaderboard", header_style))
        student_rows = [["Reg No", "Name", "Section", "Problems Solved", "Streak"]]
        for st in students_qs.annotate(s_count=Count('solved_problems')).order_by('-s_count')[:50]:
            student_rows.append([
                st.register_number,
                st.name[:25],
                st.section or 'N/A',
                str(st.s_count),
                f"{st.current_streak} days",
            ])

        t_students = Table(student_rows, colWidths=[1.4*inch, 2.2*inch, 0.8*inch, 1.1*inch, 1*inch])
        t_students.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebdd')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#39482a')),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9f7')]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d0d9c2')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(t_students)

        doc.build(elements)
        buffer.seek(0)
        pdf_bytes = buffer.getvalue()

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="batch_report_{batch_code}.pdf"'
        return response

class SystemAdminDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user_role = str(getattr(request.user, 'role', '') or '').lower()
        is_admin_user = (
            request.user.is_superuser or 
            request.user.is_staff or 
            user_role in ('admin', 'superuser') or 
            getattr(request.user, 'username', '') in ('0001', 'staff_0001', 'admin')
        )
        if not is_admin_user:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        try:
            total_students = StudentProfile.objects.count()
            total_staff = StaffProfile.objects.count()
            total_problems = Problem.objects.count()
            total_aptitude = AptitudeQuestion.objects.count()
            total_competitive = CompetitiveQuestion.objects.count()
            total_interview_tracks = InterviewTrack.objects.count()

            # Fetch all institutions for the management table
            institutions = Institution.objects.all().values(
                'id', 'institution_id', 'name', 'short_code', 'is_active',
                'maintenance_staff', 'maintenance_students', 'maintenance_hod',
                'maintenance_inst_admin', 'maintenance_ja', 'maintenance_tpu', 'maintenance_director'
            )

            # Global maintenance config
            config, _ = SystemConfiguration.objects.get_or_create(id=1)

            return Response({
                "metrics": {
                    "total_users": total_students + total_staff,
                    "total_staff": total_staff,
                    "total_problems": total_problems,
                    "total_aptitude": total_aptitude,
                    "total_competitive": total_competitive,
                    "total_interview_tracks": total_interview_tracks
                },
                "institutions": list(institutions),
                "global_config": {
                    "staff": config.global_maintenance_staff,
                    "student": config.global_maintenance_students,
                    "hod": config.global_maintenance_hod,
                    "tpu": config.global_maintenance_tpu,
                    "director": config.global_maintenance_director,
                    "ja": config.global_maintenance_ja,
                    "admin": config.global_maintenance_admin
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
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
        institution = get_object_or_404(Institution, pk=pk)
        
        # Get actual student count
        students_count = StudentProfile.objects.filter(institution=institution).count()
        
        # Get staff, HODs, and Academic Coordinator (0001)
        staff_list = StaffProfile.objects.filter(institution=institution).values(
            'id', 'faculty_id', 'name', 'email', 'mobile_number', 'role', 'department__name', 'department__id', 'department__code'
        )
        
        # Get departments
        depts = Department.objects.filter(institution=institution).values('id', 'name', 'code', 'interview_track')
        
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
                "ja": institution.maintenance_ja,
                "tpu": institution.maintenance_tpu,
                "director": institution.maintenance_director
            },
            "module_registry": serializable_registry(),
            "locked_modules": institution.locked_modules,
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
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)
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
            elif role == 'tpu': institution.maintenance_tpu = value
            elif role == 'director': institution.maintenance_director = value
            institution.save()
            return Response({"message": "Maintenance updated"})

        elif action == 'toggle_module_lock':
            module_key = request.data.get('module')
            value = bool(request.data.get('value'))
            if module_key not in MODULE_KEYS:
                return Response({"error": f"Unknown module '{module_key}'."}, status=400)
            locked = set(institution.locked_modules or [])
            if value:
                locked.add(module_key)
            else:
                locked.discard(module_key)
            institution.locked_modules = sorted(locked)
            institution.save(update_fields=['locked_modules'])
            return Response({"message": "Module lock updated", "locked_modules": institution.locked_modules})

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

        elif action == 'update_department_interview_track':
            dept_id = request.data.get('dept_id')
            track = (request.data.get('interview_track') or '').strip()
            dept = get_object_or_404(Department, id=dept_id, institution=institution)
            dept.interview_track = track or dept.default_interview_track()
            dept.save(update_fields=['interview_track'])
            return Response({"message": "Interview track updated", "interview_track": dept.interview_track})

        elif action == 'create_staff':
            faculty_id = (request.data.get('faculty_id') or '').strip()
            name = (request.data.get('name') or '').strip()
            email = (request.data.get('email') or '').strip()
            mobile_number = (request.data.get('mobile_number') or '').strip()
            role = request.data.get('role', 'staff')
            dept_id = request.data.get('dept_id')

            if not faculty_id or not name:
                return Response({"error": "faculty_id and name are required."}, status=400)

            if role not in dict(StaffProfile.ROLE_CHOICES):
                return Response({"error": "Invalid role."}, status=400)

            if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
                return Response({"error": "A staff member with this faculty ID already exists."}, status=400)

            department = None
            if dept_id:
                department = get_object_or_404(Department, id=dept_id, institution=institution)

            staff = StaffProfile.objects.create(
                faculty_id=faculty_id,
                name=name,
                email=email,
                mobile_number=mobile_number,
                role=role,
                department=department,
                institution=institution,
            )
            return Response({
                "message": "Staff created successfully",
                "staff": {
                    "id": staff.id,
                    "faculty_id": staff.faculty_id,
                    "name": staff.name,
                    "email": staff.email,
                    "mobile_number": staff.mobile_number,
                    "role": staff.role,
                    "department__id": staff.department_id,
                    "department__name": staff.department.name if staff.department else None,
                    "department__code": staff.department.code if staff.department else None,
                },
            }, status=201)

        elif action == 'update_staff_email':
            staff_id = request.data.get('staff_id')
            email = (request.data.get('email') or '').strip()
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            staff.email = email
            staff.save(update_fields=['email'])
            return Response({"message": "Email updated", "email": staff.email})

        elif action == 'update_staff_mobile':
            staff_id = request.data.get('staff_id')
            mobile_number = (request.data.get('mobile_number') or '').strip()
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            staff.mobile_number = mobile_number
            staff.save(update_fields=['mobile_number'])
            return Response({"message": "Contact number updated", "mobile_number": staff.mobile_number})

        elif action == 'update_staff_name':
            staff_id = request.data.get('staff_id')
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({"error": "Name is required."}, status=400)
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            staff.name = name
            staff.save(update_fields=['name'])
            return Response({"message": "Name updated", "name": staff.name})

        elif action == 'delete_staff':
            staff_id = request.data.get('staff_id')
            staff = get_object_or_404(StaffProfile, id=staff_id, institution=institution)
            if staff.faculty_id == '0001':
                return Response({"error": "Cannot delete the system admin account."}, status=400)
            account = staff.account
            if account:
                account.delete()  # cascades to the StaffProfile
            else:
                staff.delete()
            return Response({"message": "Staff deleted"})

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
            new_logo_url = branding_data.get('logo_url', institution.logo_url)
            # The branding form's logo_url field doubles as the display value
            # after a file upload (which is our own /api/.../logo/ proxy
            # path, not a real external URL) — never persist that back into
            # the URLField meant for a pasted external link.
            if not (new_logo_url or '').startswith('/api/institutions/'):
                institution.logo_url = new_logo_url
            institution.website = branding_data.get('website', institution.website)

            # established_year is a nullable PositiveIntegerField, but the
            # frontend always sends "" (not omitted) when it's unset — assigning
            # that straight onto the model used to crash institution.save() with
            # an unhandled DB-level error (empty string into an integer column),
            # surfacing as an opaque "Failed to update branding:" with no message.
            if 'established_year' in branding_data:
                raw_year = branding_data.get('established_year')
                if raw_year in ('', None):
                    institution.established_year = None
                else:
                    try:
                        institution.established_year = int(raw_year)
                    except (TypeError, ValueError):
                        return Response({"error": "established_year must be a valid year, or left blank."}, status=400)

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
    """System Admin: toggle system-wide maintenance mode, per role. Covers
    every StudentProfile/StaffProfile role (student, staff, hod, tpu,
    director, ja, admin) — admin endpoints are already exempt from the
    maintenance check itself (see MaintenanceMiddleware), so a global admin
    flag can't lock system admins out of the one place that could undo it."""
    permission_classes = [IsAuthenticated]

    ROLE_FIELDS = {
        'student': 'global_maintenance_students',
        'staff': 'global_maintenance_staff',
        'hod': 'global_maintenance_hod',
        'tpu': 'global_maintenance_tpu',
        'director': 'global_maintenance_director',
        'ja': 'global_maintenance_ja',
        'admin': 'global_maintenance_admin',
    }

    def post(self, request):
        if not request.user.is_superuser:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        config, _ = SystemConfiguration.objects.get_or_create(id=1)
        role = request.data.get('role')
        value = bool(request.data.get('value'))

        field = self.ROLE_FIELDS.get(role)
        if not field:
            return Response({"error": f"Unknown role {role!r}."}, status=400)

        setattr(config, field, value)
        config.save()
        return Response({r: getattr(config, f) for r, f in self.ROLE_FIELDS.items()})

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

class PasswordResetView(APIView):
    """Forgot-password flow via a one-time code emailed to whatever
    address is already on file for the account (StudentProfile.personal_email
    or StaffProfile.email) — never an address typed in by the person
    requesting the reset, so only someone with access to that inbox can
    actually reset the password.

    POST: identify the account (register_number for students, faculty_id
    for staff) -> generate + email a 6-digit OTP, valid 5 minutes.
    PUT: submit that OTP + a new password -> verify and reset.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "password-reset-request", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        user_type = request.data.get('user_type', 'student')

        if user_type == 'student':
            register_number = (request.data.get('register_number') or '').strip()
            if not register_number:
                return Response({'error': 'Register number is required.'}, status=status.HTTP_400_BAD_REQUEST)
            student = StudentProfile.objects.select_related('account').filter(register_number=register_number).first()
            if not student or not student.account:
                return Response({'error': 'No account found with that register number.'}, status=status.HTTP_404_NOT_FOUND)
            user = student.account
            name = student.name
            email = (student.personal_email or student.account.email or '').strip()
        elif user_type == 'staff':
            faculty_id = (request.data.get('faculty_id') or '').strip()
            if not faculty_id:
                return Response({'error': 'Faculty ID is required.'}, status=status.HTTP_400_BAD_REQUEST)
            staff = StaffProfile.objects.select_related('account').filter(faculty_id=faculty_id).first()
            if not staff:
                return Response({'error': 'No staff account found with that faculty ID.'}, status=status.HTTP_404_NOT_FOUND)
            if not staff.account:
                # Staff added by an admin/HOD get no login User until their
                # first successful login (see StaffLoginView) — someone who's
                # never logged in yet but clicks "Forgot Password" would
                # otherwise dead-end here. Create it now so this doubles as
                # a valid way to set an initial password too.
                user = User.objects.create_user(username=staff.faculty_id, first_name=staff.name)
                staff.account = user
                staff.save(update_fields=['account'])
            else:
                user = staff.account
            name = staff.name
            email = (staff.email or user.email or '').strip()
        else:
            return Response({'error': 'Invalid user type.'}, status=status.HTTP_400_BAD_REQUEST)

        if not email:
            return Response(
                {'error': "No email is on file for this account yet. Ask your JA/HOD/Admin to add one, then try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Superseding any earlier unused code keeps only the latest one valid
        PasswordResetOTP.objects.filter(user=user, is_used=False).update(is_used=True)

        code = _generate_otp()
        PasswordResetOTP.objects.create(
            user=user, code=code,
            expires_at=timezone.now() + timedelta(minutes=PasswordResetOTP.OTP_VALIDITY_MINUTES),
        )

        try:
            _send_password_reset_otp_email(email, name, code)
        except Exception:
            logger.exception("Failed to send password reset OTP email")
            return Response(
                {'error': 'Could not send the reset email right now. Please try again shortly.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({'message': f'A 6-digit code was sent to {_mask_email(email)}. It expires in 5 minutes.'})

    def put(self, request):
        max_attempts, window = _auth_rate_limits()
        try:
            check_rate_limit(request, "password-reset-verify", max_attempts, window)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        user_type = request.data.get('user_type', 'student')
        otp = (request.data.get('otp') or '').strip()
        new_password = (request.data.get('new_password') or '').strip()

        if not otp or not new_password:
            return Response({'error': 'The code and a new password are both required.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_password) < 8:
            return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        if user_type == 'student':
            register_number = (request.data.get('register_number') or '').strip()
            student = StudentProfile.objects.select_related('account').filter(register_number=register_number).first()
            if not student or not student.account:
                return Response({'error': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)
            user = student.account
        elif user_type == 'staff':
            faculty_id = (request.data.get('faculty_id') or '').strip()
            staff = StaffProfile.objects.select_related('account').filter(faculty_id=faculty_id).first()
            if not staff or not staff.account:
                return Response({'error': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)
            user = staff.account
        else:
            return Response({'error': 'Invalid user type.'}, status=status.HTTP_400_BAD_REQUEST)

        otp_record = PasswordResetOTP.objects.filter(user=user, code=otp, is_used=False).order_by('-created_at').first()
        if not otp_record or not otp_record.is_valid():
            return Response({'error': 'That code is invalid or has expired. Request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        otp_record.is_used = True
        otp_record.save(update_fields=['is_used'])

        if user_type == 'staff' and hasattr(user, 'staff_profile'):
            # StaffProfile has its own password field, checked before
            # User.password at login — set_password() keeps both in sync.
            user.staff_profile.set_password(new_password)
        else:
            user.set_password(new_password)
            user.save()

        return Response({'message': 'Password reset successfully. You can now log in with your new password.'})

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
            params = getattr(request, 'query_params', getattr(request, 'GET', {}))
            search = params.get('search', '').strip()
            active_only = params.get('active_only', 'true').lower() == 'true'
            
            # Base queryset
            institutions = Institution.objects.all()
            
            # Filter by active status if requested
            if active_only:
                active_qs = institutions.filter(Q(is_active=True) | Q(is_active__isnull=True))
                if active_qs.exists():
                    institutions = active_qs
            
            # Search filter
            if search:
                institutions = institutions.filter(
                    Q(name__icontains=search) |
                    Q(short_code__icontains=search) |
                    Q(address__icontains=search)
                )
            
            # If database has zero institutions, auto-seed default institution
            if not institutions.exists():
                try:
                    default_inst, _ = Institution.objects.get_or_create(
                        institution_id=1,
                        defaults={
                            'name': 'Ramco Institute of Technology',
                            'short_code': 'RIT',
                            'address': 'Rajapalayam, Tamil Nadu, India - 626 117',
                            'display_name': 'Ramco Institute of Technology',
                            'subheading': '(An Autonomous Institution)',
                            'is_active': True,
                        }
                    )
                    institutions = Institution.objects.all()
                except Exception:
                    pass

            # Prepare response data
            institution_list = []
            for institution in institutions:
                logo_url = institution.logo_display_url or None

                dept_count = 0
                try:
                    if hasattr(institution, 'departments'):
                        dept_count = institution.departments.count()
                    else:
                        dept_count = Department.objects.filter(institution=institution).count()
                except Exception:
                    try:
                        dept_count = StudentProfile.objects.filter(institution=institution).values('department').distinct().count()
                    except Exception:
                        dept_count = 0

                try:
                    student_count = StudentProfile.objects.filter(institution=institution).count()
                except Exception:
                    student_count = 0

                try:
                    staff_count = StaffProfile.objects.filter(institution=institution).count()
                except Exception:
                    staff_count = 0

                institution_data = {
                    'id': institution.id,
                    'name': institution.name,
                    'code': getattr(institution, 'short_code', 'RIT'),
                    'institution_id': getattr(institution, 'institution_id', institution.id),
                    'location': getattr(institution, 'address', ''),
                    'is_active': getattr(institution, 'is_active', True),
                    'student_count': student_count,
                    'staff_count': staff_count,
                    'department_count': dept_count,
                    'logo_url': logo_url,
                    'primary_color': getattr(institution, 'primary_color', '#1f2937'),
                    'secondary_color': getattr(institution, 'secondary_color', '#3b82f6'),
                    # Branding fields
                    'display_name': getattr(institution, 'display_name', institution.name),
                    'subheading': getattr(institution, 'subheading', ''),
                    'address': getattr(institution, 'address', ''),
                    'contact_email': getattr(institution, 'contact_email', ''),
                    'contact_phone': getattr(institution, 'contact_phone', ''),
                    'established_year': getattr(institution, 'established_year', None),
                }
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
            institution_id = request.data.get('institution_id')
            
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
            
            if not institution_id:
                return Response(
                    {'error': 'Institution ID is required'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if code and Institution.objects.filter(short_code=code).exists():
                return Response(
                    {'error': 'Institution with this code already exists'}, 
                    status=status.HTTP_400_BAD_REQUEST
                )

            if Institution.objects.filter(institution_id=institution_id).exists():
                return Response(
                    {'error': 'Institution with this ID already exists'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Create new institution
            institution = Institution.objects.create(
                institution_id=institution_id,
                name=name,
                short_code=code or name.upper()[:10],  # Generate code if not provided
                address=location,
                is_active=True
            )
            
            return Response({
                'message': 'Institution created successfully',
                'institution': {
                    'id': institution.id,
                    'institution_id': institution.institution_id,
                    'name': institution.name,
                    'code': institution.short_code,
                    'location': institution.address,
                    'is_active': institution.is_active
                }
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to create institution: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class TempDataDiagnosticsView(APIView):
    """Read-only snapshot of the live DB connection + row counts, and every
    database visible on the same Postgres server. Gated by a one-off shared
    token (not real auth) so it can be checked from a browser with no login.
    Delete this view + its URL once the data-loss investigation is closed.
    """

    permission_classes = [AllowAny]

    def get(self, request, token):
        import os

        if token != "EiTSaBPnqIByYUEBYLsS1Eqlw4D_7flj":
            return Response({"detail": "Not found."}, status=404)

        from django.db import connection

        report = {}

        db = connection.settings_dict
        report["connected_to"] = {
            "name": db.get("NAME"),
            "host": db.get("HOST"),
            "user": db.get("USER"),
            "port": db.get("PORT"),
        }

        counts = {}
        for label, model in [
            ("students", StudentProfile),
            ("staff", StaffProfile),
            ("institutions", Institution),
            ("problems", Problem),
            ("solved_problems", SolvedProblem),
            ("problem_solutions", ProblemSolution),
            ("submissions", Submission),
        ]:
            try:
                counts[label] = model.objects.count()
            except Exception as exc:
                counts[label] = f"error: {exc}"
        report["row_counts_in_connected_db"] = counts

        try:
            from ..models import LabExercise, LabExerciseSubmission
            counts["lab_exercises"] = LabExercise.objects.count()
            counts["lab_exercise_submissions"] = LabExerciseSubmission.objects.count()
        except Exception as exc:
            counts["lab_models_error"] = str(exc)

        try:
            import psycopg2
            other_conn = psycopg2.connect(
                host=db.get("HOST"),
                port=db.get("PORT"),
                user=db.get("USER"),
                password=db.get("PASSWORD"),
                dbname="postgres",
                connect_timeout=5,
            )
            cur = other_conn.cursor()
            cur.execute(
                "SELECT datname, pg_size_pretty(pg_database_size(datname)) "
                "FROM pg_database WHERE datistemplate = false ORDER BY datname;"
            )
            report["all_databases_on_this_postgres_server"] = [
                {"name": row[0], "size": row[1]} for row in cur.fetchall()
            ]
            other_conn.close()
        except Exception as exc:
            report["all_databases_on_this_postgres_server"] = f"error: {exc}"

        report["env_db_vars_seen_by_backend"] = {
            "DB_HOST": os.getenv("DB_HOST"),
            "DB_NAME": os.getenv("DB_NAME"),
            "DB_USER": os.getenv("DB_USER"),
            "DB_PORT": os.getenv("DB_PORT"),
        }
        return Response(report)

