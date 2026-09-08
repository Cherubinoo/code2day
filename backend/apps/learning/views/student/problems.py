"""Views extracted from the original monolithic apps/learning/views.py
(module: student/problems). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
import math

from .._imports import *
from .._shared import *


class StudentLeaderboardView(UnifiedAuthMixin, APIView):
    """Institution-wide student leaderboard — every student at the caller's
    institution (not just their department/batch), ranked by a single
    composite "points" score combining problems solved, aptitude solved,
    contest performance, and activity streak. Previously these lived as
    disconnected numbers nowhere a student could see themselves ranked
    against the whole institution (DailyLeaderboardView below is scoped to
    just today's problem; the HOD dashboard's leaderboard is department-only
    and staff-facing)."""

    # Point weights: coding problems count for more than aptitude questions
    # (aptitude MCQs take less effort per item), a contest's total_score is
    # already 0-100 so it's added directly, and streak gives a modest
    # per-day bonus for consistency rather than dominating the ranking.
    POINTS_PER_PROBLEM = 10
    POINTS_PER_APTITUDE = 5
    POINTS_PER_STREAK_DAY = 2

    # Level curve: a flat "every 100 points is a level" produced an
    # uncapped, meaningless "Level 47" for anyone with a few thousand
    # points. Levels are now capped at 99 and each one costs more than the
    # last (level L requires 8*L*(L-1) cumulative points — 16 for level 2,
    # 720 for level 10, ~77,600 for the level-99 ceiling) so early levels
    # come fast off a handful of solves and the top end stays a long-term,
    # multi-semester goal rather than something a single active week clears.
    MAX_LEVEL = 99
    LEVEL_CURVE_SCALE = 8

    @classmethod
    def _level_threshold(cls, level):
        """Cumulative points required to REACH `level` (level 1 = 0 points)."""
        return cls.LEVEL_CURVE_SCALE * level * (level - 1)

    @classmethod
    def _level_for_points(cls, points):
        if points <= 0:
            return 1
        # Closed-form inverse of the threshold formula, then nudged to the
        # exact boundary to absorb float rounding at large point values.
        level = int((1 + math.sqrt(1 + 4 * points / cls.LEVEL_CURVE_SCALE)) / 2)
        level = max(1, level)
        while level < cls.MAX_LEVEL and cls._level_threshold(level + 1) <= points:
            level += 1
        while level > 1 and cls._level_threshold(level) > points:
            level -= 1
        return min(level, cls.MAX_LEVEL)

    def get(self, request):
        profile, profile_type, error = self.get_authenticated_profile(request)
        if error:
            return error
        if profile_type != "student":
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)
        if not profile.institution:
            return Response({"leaderboard": [], "current_student": None})

        from django.db.models.functions import Coalesce

        try:
            limit = int(request.query_params.get('limit', 10))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(100, limit))
        department_filter = (request.query_params.get('department') or '').strip()

        today = timezone.now().date()
        students = StudentProfile.objects.filter(institution=profile.institution).select_related('department').annotate(
            problems_solved=Count('solved_problems', distinct=True),
            solved_today=Count('solved_problems', filter=Q(solved_problems__solved_at__date=today), distinct=True),
            aptitude_solved=Count('solved_aptitude', distinct=True),
            contest_score=Coalesce(Sum('contest_participations__total_score'), 0),
            sql_frog_xp=Coalesce('sql_frog_progress__xp', 0),
        )

        # Every department with at least one student here, for the filter
        # dropdown — computed off the unfiltered set so switching filters
        # never makes an option disappear.
        available_departments = sorted({
            (s.department.code, s.department.name) for s in students if s.department
        }, key=lambda pair: pair[1])

        if department_filter:
            students = [s for s in students if s.department and s.department.code == department_filter]

        ranked = []
        for s in students:
            points = (
                s.problems_solved * self.POINTS_PER_PROBLEM
                + s.aptitude_solved * self.POINTS_PER_APTITUDE
                + s.contest_score
                + s.current_streak * self.POINTS_PER_STREAK_DAY
                + s.sql_frog_xp
            )
            ranked.append((points, s))
        ranked.sort(key=lambda t: (-t[0], t[1].name or ""))

        # A separate ranking by SQL Frog XP alone — "points" folds it into
        # one composite score, but a student who's put real time into the
        # SQL game specifically wants to see how that stacks up on its own,
        # not just as a few extra points buried in the total.
        sql_ranked = sorted(ranked, key=lambda t: (-t[1].sql_frog_xp, t[1].name or ""))
        sql_rank_by_id = {s.id: idx for idx, (_, s) in enumerate(sql_ranked, 1)}

        leaderboard = []
        current_entry = None
        for idx, (points, s) in enumerate(ranked, 1):
            level = self._level_for_points(points)
            current_floor = self._level_threshold(level)
            next_floor = self._level_threshold(level + 1) if level < self.MAX_LEVEL else current_floor
            points_into_level = points - current_floor
            points_for_level = max(1, next_floor - current_floor)
            level_progress = 100 if level >= self.MAX_LEVEL else round(points_into_level / points_for_level * 100, 1)
            entry = {
                "rank": idx,
                "register_number": s.register_number,
                "name": s.name,
                "department": s.department.code if s.department else "",
                "batch": s.batch,
                "points": points,
                "level": level,
                "level_max": level >= self.MAX_LEVEL,
                "level_progress": level_progress,  # 0-100, how far into the current level
                "points_into_level": points_into_level,
                "points_for_level": points_for_level,
                "problems_solved": s.problems_solved,
                "solved_today": s.solved_today,
                "aptitude_solved": s.aptitude_solved,
                "contest_score": s.contest_score,
                "streak": s.current_streak,
                "xp": s.sql_frog_xp,
                "sql_rank": sql_rank_by_id[s.id],
                "is_you": s.id == profile.id,
            }
            if s.id == profile.id:
                current_entry = entry
            if idx <= limit:
                leaderboard.append(entry)

        return Response({
            "leaderboard": leaderboard,
            "current_student": current_entry,
            "total_students": len(ranked),
            "limit": limit,
            "department_filter": department_filter,
            "available_departments": [{"code": code, "name": name} for code, name in available_departments],
            "max_level": self.MAX_LEVEL,
        })

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
        if request.user and request.user.is_authenticated:
            profile, profile_type, _ = self.get_authenticated_profile(request)
        else:
            profile, profile_type = None, None

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
        if request.user and request.user.is_authenticated:
            profile, profile_type, _ = self.get_authenticated_profile(request)
        else:
            profile, profile_type = None, None

        problem = Problem.objects.filter(slug=slug).first()
        if not problem:
            return Response(
                {"detail": "Problem not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Staff/Admin don't have progress, students do
        last_solutions_by_language = {}
        if profile_type == "student" and profile:
            progress_map = build_problem_progress_map(profile)
            # Most-recent-first so the first row seen per language is the
            # student's latest submission — lets the editor restore exactly
            # what they last had, per language, when they reopen a problem.
            solutions = (
                ProblemSolution.objects
                .filter(student=profile, problem=problem)
                .order_by("language", "-submitted_at")
            )
            for sol in solutions:
                if sol.language not in last_solutions_by_language:
                    last_solutions_by_language[sol.language] = {
                        "source_code": sol.source_code,
                        "status": sol.status,
                        "all_tests_passed": sol.all_tests_passed,
                        "submitted_at": sol.submitted_at,
                    }
        else:
            progress_map = {}
        return Response(
            ProblemDetailSerializer(
                problem,
                context={
                    "progress_map": progress_map,
                    "last_solutions": last_solutions_by_language,
                },
            ).data
        )

class EditorBootstrapView(StudentAuthMixin, APIView):
    def get(self, request):
        _, error = self.get_authenticated_profile(request)
        if error:
            return error
        return Response(FALLBACK_DASHBOARD["editor"])

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
            or "Python"
        )
        status_label = "Accepted" if progress_state == "completed" else "Started"

        try:
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
        except Exception:
            logger.exception(
                "Failed to save problem progress for student %s, problem %s",
                getattr(profile, 'register_number', '?'), problem.slug,
            )
            return Response(
                {"detail": "Failed to save progress. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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
            logger.warning("Code validation failed for %s: %s", profile.register_number, validation_error)
            return Response(
                {"detail": f"Code validation failed: {validation_error}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if problem_slug:
            problem = Problem.objects.filter(slug=problem_slug).first()

        from ...services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID
        language_name = LANGUAGE_NAME_BY_ID.get(validated["language_id"])
        if not language_name:
            return Response(
                {"detail": f"Unsupported language_id: {validated['language_id']}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
                    result = Judge0Service().execute_single(
                        source_code=prepared["source_code"],
                        language_name=language_name,
                        stdin=prepared["stdin"],
                    )
            else:
                prepared = prepare_execution_payload(
                    problem=problem,
                    source_code=validated["source_code"],
                    language=validated.get("language", ""),
                    stdin=stdin,
                )
                result = Judge0Service().execute_single(
                    source_code=prepared["source_code"],
                    language_name=language_name,
                    stdin=prepared["stdin"],
                )

        except Judge0TimeoutError as exc:
            logger.error("Executor timeout: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Judge0ServiceError as exc:
            logger.error("Executor service error: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected execution error: %s", exc, exc_info=True)
            return Response({"detail": f"Execution error: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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

class PlaygroundRunView(StudentAuthMixin, APIView):
    """Free-form code execution for the student Code Playground — no
    problem/test-case grading, no driver-injection rewriting of the
    source (unlike CodeRunView's LeetCode-style submission flow), and
    no code-content restrictions beyond the sandbox itself (the
    executor already runs every submission network-isolated with
    CPU/memory/pid limits). Rate-limited since there's no natural
    per-problem request ceiling here."""

    def post(self, request):
        profile, error = self.get_authenticated_profile(request)
        if error:
            return error

        try:
            check_rate_limit(request, "playground-run", max_attempts=30, window_seconds=60)
        except RateLimitExceeded as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(exc.retry_after_seconds)},
            )

        serializer = CodeRunSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        stdin = validated.get("stdin", "")

        from ...services.judging.judge0_service import Judge0Service, LANGUAGE_NAME_BY_ID
        language_name = LANGUAGE_NAME_BY_ID.get(validated["language_id"])
        if not language_name:
            return Response(
                {"detail": f"Unsupported language_id: {validated['language_id']}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = Judge0Service().execute_single(
                source_code=validated["source_code"],
                language_name=language_name,
                stdin=stdin,
            )
        except Judge0TimeoutError as exc:
            logger.error("Playground executor timeout: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Judge0ServiceError as exc:
            logger.error("Playground executor service error: %s", exc)
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Unexpected playground execution error: %s", exc, exc_info=True)
            return Response({"detail": f"Execution error: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        try:
            ExecutionRecord.objects.create(
                student=profile,
                problem=None,
                language=validated.get("language") or str(validated["language_id"]),
                language_id=validated["language_id"],
                source_code=validated["source_code"],
                stdin=stdin,
                stdout=result["stdout"],
                stderr=result["stderr"],
                compile_output=result["compile_output"],
                status_description=result["status"],
                execution_time=str(result["time"] or ""),
                memory=str(result["memory"] or ""),
            )
        except Exception as exc:
            logger.error("Error creating playground ExecutionRecord: %s", exc, exc_info=True)

        return Response(result, status=status.HTTP_200_OK)

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

class StudentSelfAnalyticsView(APIView):
    """Student views their own detailed analytics — mirrors staff view but self-scoped."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'student_profile'):
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile

        solved_problems = SolvedProblem.objects.filter(student=student).select_related('problem')

        difficulty_breakdown = {"Easy": 0, "Medium": 0, "Hard": 0}
        for sp in solved_problems:
            difficulty_breakdown[sp.problem.difficulty] = difficulty_breakdown.get(sp.problem.difficulty, 0) + 1

        thirty_days_ago = timezone.now() - timedelta(days=30)
        recent_activity = []
        recent_solutions = ProblemSolution.objects.filter(
            student=student, submitted_at__gte=thirty_days_ago
        ).select_related('problem').order_by('-submitted_at')[:20]
        for sol in recent_solutions:
            recent_activity.append({
                "date": sol.submitted_at.isoformat(),
                "problem": sol.problem.title,
                "difficulty": sol.problem.difficulty,
                "status": sol.status,
                "language": sol.language,
            })

        total_time_spent = ProblemSession.objects.filter(
            student=student, is_active=False
        ).aggregate(total=Sum('time_spent_seconds'))['total'] or 0

        aptitude_solved = SolvedAptitude.objects.filter(student=student).count()
        total_aptitude = AptitudeQuestion.objects.count()

        company_insights, project_insights = _compute_skill_insights(solved_problems)

        # Score history
        cp_qs = ContestParticipation.objects.filter(
            student=student, is_active=False
        ).select_related('contest').order_by('started_at')[:25]

        score_history = []
        for cp in cp_qs:
            contest = cp.contest
            if contest.contest_type == 'aptitude':
                total_q = contest.aptitude_questions.count()
                correct_q = AptitudeContestSubmission.objects.filter(
                    contest=contest, student=student, is_correct=True
                ).count()
                score_pct = round(correct_q / max(1, total_q) * 100, 1)
            else:
                total_p = contest.problems.count()
                score_pct = round(cp.problems_solved / max(1, total_p) * 100, 1)
            score_history.append({
                'label': contest.title[:18],
                'title': contest.title,
                'score_pct': score_pct,
                'date': cp.started_at.strftime('%Y-%m-%d'),
                'contest_type': contest.contest_type,
            })

        tests_completed = len(score_history)
        avg_score = round(sum(s['score_pct'] for s in score_history) / tests_completed, 2) if tests_completed else 0
        peak_score = max((s['score_pct'] for s in score_history), default=0)

        # Topic accuracy
        try:
            topic_acc_qs = AptitudeContestSubmission.objects.filter(
                student=student
            ).select_related('question__topic__parent').values(
                'question__topic__title', 'question__topic__parent__title'
            ).annotate(
                total=Count('id'),
                correct=Count('id', filter=Q(is_correct=True))
            ).order_by('-total')[:20]

            topic_accuracy = [
                {
                    'topic': t['question__topic__title'],
                    'category': t['question__topic__parent__title'] or t['question__topic__title'],
                    'accuracy': round(t['correct'] / t['total'] * 100, 1) if t['total'] else 0,
                    'total': t['total'],
                    'correct': t['correct'],
                }
                for t in topic_acc_qs
            ]
        except Exception:
            logger.exception("Failed to compute topic_accuracy for self-analytics (student %s)", getattr(student, 'register_number', '?'))
            topic_accuracy = []

        # Practice-mode topic accuracy — built from every logged attempt
        # (correct AND wrong), unlike SolvedAptitude which only records
        # correct answers. This is what makes the Study Progress radar real
        # and per-topic instead of a 3-category "% of bank solved" summary.
        try:
            practice_acc_qs = AptitudeAttempt.objects.filter(
                student=student
            ).select_related('question__topic__parent').values(
                'question__topic__title', 'question__topic__parent__title'
            ).annotate(
                total=Count('id'),
                correct=Count('id', filter=Q(is_correct=True))
            ).order_by('-total')[:20]

            topic_accuracy_practice = [
                {
                    'topic': t['question__topic__title'],
                    'category': t['question__topic__parent__title'] or t['question__topic__title'],
                    'accuracy': round(t['correct'] / t['total'] * 100, 1) if t['total'] else 0,
                    'total': t['total'],
                    'correct': t['correct'],
                }
                for t in practice_acc_qs
            ]
        except Exception:
            logger.exception("Failed to compute topic_accuracy_practice for self-analytics (student %s)", getattr(student, 'register_number', '?'))
            topic_accuracy_practice = []

        performance_charts = _build_student_performance_charts(student, solved_problems, topic_accuracy)

        try:
            return Response({
                "analytics": {
                    "solved_count": solved_problems.count(),
                    "difficulty_breakdown": difficulty_breakdown,
                    "recent_activity": recent_activity,
                    "time_spent_hours": round(total_time_spent / 3600, 2),
                    "aptitude": {
                        "solved": aptitude_solved,
                        "total": total_aptitude,
                        "percentage": round(aptitude_solved / total_aptitude * 100, 1) if total_aptitude else 0,
                    },
                    "company_insights": company_insights,
                    "project_insights": project_insights,
                    "score_history": score_history,
                    "topic_accuracy": topic_accuracy,
                    "topic_accuracy_practice": topic_accuracy_practice,
                    "tests_completed": tests_completed,
                    "avg_score": avg_score,
                    "peak_score": peak_score,
                    **performance_charts,
                }
            })
        except Exception:
            logger.exception("Failed to build self-analytics response for student %s", getattr(student, 'register_number', '?'))
            return Response(
                {"detail": "Failed to load analytics. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

class StudentMentorAdvisorView(APIView):
    """
    Student: get their assigned mentor and class advisor info.
    GET /api/student/mentor-advisor/
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'student_profile'):
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile

        # Mentor info
        mentor_info = None
        if student.mentor:
            m = student.mentor
            mentor_info = {
                "id": m.id,
                "faculty_id": m.faculty_id,
                "name": m.name,
                "email": m.email,
                "role": m.role,
                "role_display": m.get_role_display(),
                "department": m.department.name if m.department else "",
            }

        # Class advisor info
        advisor_info = None
        if student.batch and student.department:
            advisor_qs = BatchAdvisor.objects.filter(
                batch=student.batch,
                department=student.department,
            ).select_related('advisor', 'advisor__department')
            # Match the student's section first; fall back to unsectioned advisor
            if student.section:
                assignment = advisor_qs.filter(section=student.section).first()
                if not assignment:
                    assignment = advisor_qs.filter(section='').first()
            else:
                assignment = advisor_qs.filter(section='').first() or advisor_qs.first()
            if assignment:
                a = assignment.advisor
                advisor_info = {
                    "id": a.id,
                    "faculty_id": a.faculty_id,
                    "name": a.name,
                    "email": a.email,
                    "role": a.role,
                    "role_display": a.get_role_display(),
                    "department": a.department.name if a.department else "",
                }

        return Response({
            "mentor": mentor_info,
            "class_advisor": advisor_info,
            "batch": student.batch,
            "section": student.section,
            "department": student.department.name if student.department else "",
        })

class StudentExerciseRunView(APIView):
    """Student: run code for a LabExercise — against the exercise's own
    test cases when no custom stdin is given (same "Test Cases: X/Y
    passed" breakdown a Problem's Run button shows), or against custom
    stdin verbatim when the student provides one. Judge0-backed, same
    execution service Problems use — just without Problem's function/class
    driver-injection step, since lab exercises are always plain stdin
    programs."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, exercise_id):
        student = _student_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, department=student.department, batch=student.batch, is_active=True)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        if lab.is_expired:
            return Response({"error": "This lab has expired and no longer accepts submissions.", "is_expired": True}, status=403)

        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        if session.is_locked:
            reason = session.lock_reason or "Your session is locked. Please contact staff to unlock."
            return Response({"error": reason, "is_locked": True, "lock_reason": reason}, status=403)

        if lab.lab_type == "university":
            if session.allocated_exercises.exists() and not session.allocated_exercises.filter(id=exercise_id).exists():
                return Response({"error": "You are not allocated this exercise."}, status=403)
            try:
                exercise = LabExercise.objects.get(id=exercise_id)
            except LabExercise.DoesNotExist:
                return Response({"error": "Exercise not found"}, status=404)
        else:
            try:
                exercise = LabExercise.objects.get(id=exercise_id, lab=lab)
            except LabExercise.DoesNotExist:
                return Response({"error": "Exercise not found"}, status=404)

        source_code = (request.data.get("code") or "").strip()
        language = (request.data.get("language") or "").strip()
        stdin = request.data.get("stdin") or ""
        if not source_code:
            return Response({"detail": "Code is required."}, status=400)

        from ...services.judging.integration import normalize_language_name
        from ...services.judging.judge0_service import Judge0Service, LANGUAGE_IDS
        normalized_language = normalize_language_name(language)
        if normalized_language not in LANGUAGE_IDS or normalized_language == "sqlite":
            return Response({"detail": f"Unsupported language: {language}"}, status=400)
        language_id = LANGUAGE_IDS[normalized_language]

        # CodeValidator's pattern tables are keyed by Capitalized display
        # names, not judge0_service's lowercase canonical ones.
        _VALIDATOR_LANGUAGE_NAMES = {"c": "C", "cpp": "C++", "java": "Java", "python": "Python", "javascript": "JavaScript"}
        is_valid, validation_error = validate_submission(
            _VALIDATOR_LANGUAGE_NAMES.get(normalized_language, normalized_language), source_code, stdin,
        )
        if not is_valid:
            return Response({"detail": f"Code validation failed: {validation_error}"}, status=400)

        from ...services.problem_testcases import build_lab_runtime_test_cases

        try:
            if stdin.strip():
                result = Judge0Service().execute_single(
                    source_code=source_code, language_name=normalized_language, stdin=stdin,
                )
            else:
                # Run every configured test case, not just samples — a student
                # relying on the console to judge correctness needs to see the
                # full picture, not a subset that can pass while others fail.
                test_cases = build_lab_runtime_test_cases(exercise, sample_only=False)
                if test_cases:
                    result = execute_lab_test_case_batch(
                        source_code=source_code, language=language, language_id=language_id,
                        test_cases=test_cases, batch_kind="run",
                    )
                else:
                    result = Judge0Service().execute_single(
                        source_code=source_code, language_name=normalized_language, stdin="",
                    )
        except Judge0TimeoutError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Judge0ServiceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("Lab exercise run error for exercise %s: %s", exercise_id, exc, exc_info=True)
            return Response({"detail": f"Execution error: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response(result)

class StudentExerciseSubmitView(APIView):
    """Student: submit a LabExercise. Only actually recorded once at least
    the lab's pass_threshold_percent of the exercise's test cases pass —
    re-runs them here (the full set, same as the Run button now does) so a
    submission can't be stored on the strength of a subset that happened to
    pass while others silently failed. Exercises with no test cases
    configured yet have nothing to gate against, so those still submit
    best-effort as before."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id, exercise_id):
        student = _student_from_request(request)
        try:
            lab = Lab.objects.get(id=lab_id, department=student.department, batch=student.batch, is_active=True)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        if lab.is_expired:
            return Response({"error": "This lab has expired and no longer accepts submissions.", "is_expired": True}, status=403)

        session, _created = LabStudentSession.objects.get_or_create(lab=lab, student=student)
        if session.is_locked:
            reason = session.lock_reason or "Your session is locked. Please contact staff to unlock."
            return Response({"error": reason, "is_locked": True, "lock_reason": reason}, status=403)

        if lab.lab_type == "university":
            if session.allocated_exercises.exists() and not session.allocated_exercises.filter(id=exercise_id).exists():
                return Response({"error": "You are not allocated this exercise."}, status=403)
            try:
                exercise = LabExercise.objects.get(id=exercise_id)
            except LabExercise.DoesNotExist:
                return Response({"error": "Exercise not found"}, status=404)
        else:
            try:
                exercise = LabExercise.objects.get(id=exercise_id, lab=lab)
            except LabExercise.DoesNotExist:
                return Response({"error": "Exercise not found"}, status=404)
        data = request.data
        code = data.get("code", "")
        language = data.get("language", "")
        allowed_languages = exercise.lab.allowed_languages or list(LAB_LANGUAGE_CHOICES)
        if language and language not in allowed_languages:
            return Response(
                {"error": f"This lab only accepts submissions in: {', '.join(allowed_languages)}"}, status=400
            )
        if not code.strip():
            return Response({"error": "Code is required."}, status=400)

        from ...services.judging.integration import normalize_language_name
        from ...services.judging.judge0_service import LANGUAGE_IDS
        from ...services.problem_testcases import build_lab_runtime_test_cases

        normalized_language = normalize_language_name(language)
        if normalized_language not in LANGUAGE_IDS or normalized_language == "sqlite":
            return Response({"error": f"Unsupported language: {language}"}, status=400)
        language_id = LANGUAGE_IDS[normalized_language]

        _VALIDATOR_LANGUAGE_NAMES = {"c": "C", "cpp": "C++", "java": "Java", "python": "Python", "javascript": "JavaScript"}
        is_valid, validation_error = validate_submission(
            _VALIDATOR_LANGUAGE_NAMES.get(normalized_language, normalized_language), code, "",
        )
        if not is_valid:
            return Response({"error": f"Code validation failed: {validation_error}"}, status=400)

        test_cases = build_lab_runtime_test_cases(exercise, sample_only=False)
        result = None
        if test_cases:
            try:
                result = execute_lab_test_case_batch(
                    source_code=code, language=language, language_id=language_id,
                    test_cases=test_cases, batch_kind="submit",
                )
            except Judge0TimeoutError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_504_GATEWAY_TIMEOUT)
            except Judge0ServiceError as exc:
                return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
            except Exception as exc:
                logger.error(
                    "Lab submit test-case run error for exercise %s: %s", exercise_id, exc, exc_info=True,
                )
                return Response({"error": f"Execution error: {exc}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            passed = result["passed_cases"]
            total = result["total_cases"]
            threshold_pct = exercise.lab.pass_threshold_percent
            pass_pct = (passed / total * 100) if total else 0
            if total > 0 and pass_pct < threshold_pct:
                return Response(
                    {
                        "error": (
                            f"{passed}/{total} test case(s) passed ({round(pass_pct)}%). "
                            f"At least {threshold_pct}% of test cases must pass before this exercise can be submitted."
                        ),
                        "test_results": result["test_results"],
                        "passed_cases": passed,
                        "total_cases": total,
                    },
                    status=400,
                )

        sub, created = LabExerciseSubmission.objects.update_or_create(
            exercise=exercise, student=student,
            defaults={
                "code": code,
                "language": language,
                "passed_cases": result["passed_cases"] if result else 0,
                "total_cases": result["total_cases"] if result else 0,
                "test_results": result["test_results"] if result else [],
            },
        )

        def _pregen():
            try:
                _generate_lab_exercise_report(exercise, sub)
            except Exception as exc:
                logger.warning("Async lab report pre-generation failed for sub %s: %s", sub.id, exc)

        threading.Thread(target=_pregen, daemon=True).start()

        return Response({
            "submitted": True,
            "submitted_at": sub.submitted_at.isoformat(),
        }, status=201 if created else 200)

class StudentExerciseReportView(APIView):
    """Student: generate (or re-download) their lab record PDF — Exp No /
    Aim / Algorithm / Program / Output / Result, watermarked with their own
    register number — for a submitted LabExercise."""
    permission_classes = [IsAuthenticated]

    def _get_submission(self, lab_id, exercise_id, student):
        try:
            exercise = LabExercise.objects.select_related("lab").get(
                id=exercise_id, lab_id=lab_id,
                lab__department=student.department, lab__batch=student.batch,
            )
        except LabExercise.DoesNotExist:
            return None, None
        submission = LabExerciseSubmission.objects.filter(exercise=exercise, student=student).first()
        return exercise, submission

    def get(self, request, lab_id, exercise_id):
        """Download the lab exercise report PDF — serves cached file if available, or generates on demand."""
        student = _student_from_request(request)
        exercise, submission = self._get_submission(lab_id, exercise_id, student)
        if not exercise:
            return Response({"error": "Not found"}, status=404)
        if not submission or not (submission.code or "").strip():
            return Response({"error": "Submit your code for this exercise before generating a report."}, status=400)

        report = getattr(submission, "report", None)
        if report and report.pdf_file and _is_valid_algorithm(report.algorithm):
            try:
                report.pdf_file.open("rb")
                report.pdf_file.seek(0)
                pdf_bytes = report.pdf_file.read()
                report.pdf_file.close()
                if pdf_bytes and len(pdf_bytes) >= 1000:
                    response = HttpResponse(pdf_bytes, content_type="application/pdf")
                    response["Content-Length"] = str(len(pdf_bytes))
                    response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
                    return response
            except Exception:
                pass

        try:
            report, pdf_bytes = _generate_lab_exercise_report(exercise, submission)
        except Exception as exc:
            logger.exception("Lab report PDF rendering failed for exercise %s", exercise.id)
            return Response({"error": f"PDF rendering failed: {exc}"}, status=500)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Length"] = str(len(pdf_bytes))
        response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
        return response

    def post(self, request, lab_id, exercise_id):
        """Generate (or serve cached) report from the student's submission."""
        student = _student_from_request(request)
        exercise, submission = self._get_submission(lab_id, exercise_id, student)
        if not exercise:
            return Response({"error": "Not found"}, status=404)
        if not submission or not (submission.code or "").strip():
            return Response({"error": "Submit your code for this exercise before generating a report."}, status=400)

        report = getattr(submission, "report", None)
        force_regen = request.query_params.get("force", "").lower() in ("true", "1")
        if report and report.pdf_file and _is_valid_algorithm(report.algorithm) and not force_regen:
            try:
                report.pdf_file.open("rb")
                report.pdf_file.seek(0)
                pdf_bytes = report.pdf_file.read()
                report.pdf_file.close()
                if pdf_bytes and len(pdf_bytes) >= 1000:
                    response = HttpResponse(pdf_bytes, content_type="application/pdf")
                    response["Content-Length"] = str(len(pdf_bytes))
                    response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
                    return response
            except Exception:
                pass

        try:
            report, pdf_bytes = _generate_lab_exercise_report(exercise, submission)
        except Exception as exc:
            logger.exception("Lab report PDF rendering failed for exercise %s", exercise.id)
            return Response({"error": f"PDF rendering failed: {exc}"}, status=500)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Length"] = str(len(pdf_bytes))
        response["Content-Disposition"] = f'attachment; filename="lab_record_{exercise.id}_{student.register_number}.pdf"'
        return response

