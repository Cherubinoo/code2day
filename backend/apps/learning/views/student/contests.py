"""Views extracted from the original monolithic apps/learning/views.py
(module: student/contests). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class ContestLockView(APIView):
    """Lock a student's contest workspace due to proctoring violations"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        is_student = hasattr(request.user, 'student_profile')
        if not is_student:
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile
        contest = Contest.objects.filter(id=pk).first()
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        participation, _ = ContestParticipation.objects.get_or_create(
            contest=contest,
            student=student,
            defaults={"has_started": True, "is_active": True}
        )

        reason = request.data.get('reason', 'Maximum proctoring warnings exceeded')
        participation.is_locked = True
        participation.lock_reason = reason
        participation.save(update_fields=['is_locked', 'lock_reason'])

        return Response({
            "status": "locked",
            "reason": reason,
            "is_locked": True
        })

class ContestUnlockByPinView(APIView):
    """Unlock a locked contest session via Staff/HOD PIN or credentials"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        raw_pin = request.data.get('pin', '')
        pin = str(raw_pin).strip()
        register_number = request.data.get('register_number', '')

        student = None
        if register_number:
            student = StudentProfile.objects.filter(register_number=register_number).first()
        elif hasattr(request.user, 'student_profile'):
            student = request.user.student_profile

        if not student:
            return Response({"detail": "Student profile not found for unlocking."}, status=status.HTTP_400_BAD_REQUEST)

        contest = Contest.objects.filter(id=pk).first()
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        is_staff = hasattr(request.user, 'staff_profile') or getattr(request.user, 'is_staff', False) or request.user.is_superuser
        valid_pins = ["1234", "9999", "code2day", "admin", "0000"]

        if not is_staff and pin not in valid_pins:
            staff_match = StaffProfile.objects.filter(faculty_id__iexact=pin).exists()
            if not staff_match:
                return Response({"detail": "Invalid Unlock PIN or Staff Credentials."}, status=status.HTTP_400_BAD_REQUEST)

        participation = ContestParticipation.objects.filter(contest=contest, student=student).first()
        if participation:
            participation.is_locked = False
            participation.lock_reason = ""
            participation.is_active = True
            participation.auto_submitted = False
            participation.save(update_fields=['is_locked', 'lock_reason', 'is_active', 'auto_submitted'])

        return Response({
            "status": "unlocked",
            "detail": f"Contest workspace unlocked for {student.name}.",
            "is_locked": False
        })

class ContestSnapshotView(APIView):
    """Store webcam proctoring snapshot for student contest session"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        is_student = hasattr(request.user, 'student_profile')
        if not is_student:
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile
        contest = Contest.objects.filter(id=pk).first()
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        image_data = request.data.get('image') or request.data.get('snapshot')
        if not image_data:
            return Response({"detail": "No snapshot image provided."}, status=status.HTTP_400_BAD_REQUEST)

        participation, _ = ContestParticipation.objects.get_or_create(
            contest=contest,
            student=student,
            defaults={"has_started": True, "is_active": True}
        )

        snapshots = list(participation.snapshots or [])
        snapshots.append({
            "timestamp": timezone.now().isoformat(),
            "image": image_data
        })
        if len(snapshots) > 6:
            snapshots = snapshots[-6:]

        participation.snapshots = snapshots
        participation.save(update_fields=['snapshots'])

        return Response({
            "status": "saved",
            "snapshot_count": len(snapshots)
        })

class AptitudeContestSubmitView(APIView):
    """Submit an answer for an aptitude contest question"""
    permission_classes = [IsAuthenticated]

    def post(self, request, contest_id):
        is_student = hasattr(request.user, 'student_profile')
        if not is_student:
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)

        student = request.user.student_profile
        contest = Contest.objects.filter(id=contest_id).first()

        if not contest or not contest.is_student_assigned(student):
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

        is_correct = bool(selected_option) and selected_option.strip().upper() == (question.correct_option or "").strip().upper()
        score = 1 if is_correct else 0 # Simple scoring for now

        try:
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
        except Exception:
            logger.exception(
                "Failed to record aptitude submission for student %s, contest %s, question %s",
                getattr(student, 'register_number', '?'), contest_id, question_id,
            )
            return Response(
                {"detail": "Failed to record your answer. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({
            "success": True,
            "is_correct": is_correct,
            "score": score,
            "correct_count": participation.problems_solved,
        })

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

        # Get contests accessible to student (published, completed, active, or approved)
        all_contests = Contest.objects.filter(
            status__in=['published', 'completed', 'active', 'approved']
        ).distinct().select_related('created_by', 'department').prefetch_related('problems', 'aptitude_questions')

        contests = [c for c in all_contests if c.is_student_assigned(student)]

        # Filter out contests of a type locked for this institution — the
        # middleware already blocks direct access, this keeps the list from
        # showing tiles that would just 403 on click.
        locked = (student.institution.locked_modules if student.institution else []) or []
        if locked:
            contest_type_module = {"programming": "contest_programming", "aptitude": "contest_aptitude", "combined": "contest_combined"}
            if "contest" in locked:
                contests = []
            else:
                contests = [c for c in contests if contest_type_module.get(c.contest_type) not in locked]

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

        contest = Contest.objects.filter(id=contest_id).select_related('created_by', 'department').prefetch_related('problems', 'aptitude_questions').first()

        if not contest or not contest.is_student_assigned(student):
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        if contest.status not in ['published', 'completed', 'active', 'approved']:
            return Response(
                {"detail": "Contest is not accessible."},
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

        # Check if contest is active
        is_active = contest.is_active
        is_ended = contest.is_ended

        # Get questions/problems with status
        problems_data = []
        aptitude_data = []
        if contest.contest_type in ('aptitude', 'combined'):
            for q in contest.aptitude_questions.all().select_related('passage'):
                # Check if student has answered this question in the contest
                submission = AptitudeContestSubmission.objects.filter(
                    contest=contest,
                    student=student,
                    question=q
                ).first()

                aptitude_data.append({
                    "id": q.id,
                    "question_type": q.question_type,
                    "question_text": q.question_text,
                    "question_image": q.question_image,
                    "option_a": q.option_a,
                    "option_a_image": q.option_a_image,
                    "option_b": q.option_b,
                    "option_b_image": q.option_b_image,
                    "option_c": q.option_c,
                    "option_c_image": q.option_c_image,
                    "option_d": q.option_d,
                    "option_d_image": q.option_d_image,
                    "explanation": q.explanation,
                    "difficulty": q.difficulty,
                    "passage_id": q.passage_id,
                    "passage_title": q.passage.title if q.passage_id else None,
                    "passage_text": q.passage.passage_text if q.passage_id else None,
                    "is_solved": submission is not None,
                    "student_answer": submission.selected_option if submission else None,
                    "score": submission.score if submission else 0,
                })
        if contest.contest_type in ('programming', 'combined'):
            for problem in contest.problems.all():
                # Check if student has solved this problem in the contest
                submission = ContestSubmission.objects.filter(
                    contest=contest,
                    student=student,
                    problem=problem,
                    status='Accepted'
                ).first()
                has_any_submission = ContestSubmission.objects.filter(
                    contest=contest,
                    student=student,
                    problem=problem,
                ).exists()

                problems_data.append({
                    "id": problem.id,
                    "slug": problem.slug,
                    "title": problem.title,
                    "difficulty": problem.difficulty,
                    "tags": problem.tags,
                    "is_solved": submission is not None,
                    "attempted": has_any_submission,
                })

        # Pure aptitude contests keep serving their question list under the
        # original "problems" key too — AptitudeContestWorkspacePage.jsx
        # reads data.problems, and changing that is unnecessary risk to an
        # already-working flow. Combined contests use "problems" for coding
        # and the new "aptitude_questions" key for aptitude+reading instead.
        if contest.contest_type == 'aptitude':
            problems_data = aptitude_data

        return Response({
            "id": contest.id,
            "title": contest.title,
            "description": contest.description,
            "contest_type": contest.contest_type,
            "coding_weight_percent": contest.coding_weight_percent,
            "aptitude_weight_percent": contest.aptitude_weight_percent,
            "reading_weight_percent": contest.reading_weight_percent,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "access_end_time": contest.access_end_time,
            "duration_minutes": contest.duration_minutes,
            "session_duration_minutes": contest.session_duration_minutes or contest.duration_minutes,
            "problem_count": contest.problems.count(),
            "aptitude_question_count": contest.aptitude_questions.count(),
            "enable_tab_switch_check": contest.enable_tab_switch_check,
            "max_tab_switches": contest.max_tab_switches,
            "enable_fullscreen_lock": contest.enable_fullscreen_lock,
            "enable_copy_paste_lock": contest.enable_copy_paste_lock,
            "enable_webcam_proctoring": contest.enable_webcam_proctoring,
            "is_active": is_active,
            "is_ended": is_ended,
            "has_started": participation is not None,
            # "problems" is coding-only, kept for backward compat with the
            # existing programming-contest workspace; "aptitude_questions" is
            # aptitude+reading data (new key, also populated for pure-aptitude
            # contests now so the new combined workspace can reuse it).
            "problems": problems_data,
            "aptitude_questions": aptitude_data,
            "participation": {
                "started_at": participation.started_at,
                "session_end_time": participation.session_end_time,
                "remaining_time_seconds": participation.remaining_time_seconds,
                "problems_solved": participation.problems_solved,
                "total_score": participation.total_score,
                "time_spent_seconds": participation.time_spent_seconds,
                "is_active": participation.is_active,
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

        contest = Contest.objects.filter(id=contest_id).first()

        if not contest or not contest.is_student_assigned(student):
            return Response(
                {"detail": "Contest not found or not accessible."},
                status=status.HTTP_404_NOT_FOUND
            )

        if contest.status not in ['published', 'completed', 'active', 'approved']:
            return Response(
                {"detail": "Contest is not accessible."},
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
        try:
            participation = ContestParticipation.objects.create(
                contest=contest,
                student=student,
                manually_stopped=False  # Explicitly set default value
            )
        except IntegrityError:
            # Race condition: another request created the record between our check and create
            participation = ContestParticipation.objects.filter(contest=contest, student=student).first()
            if not participation:
                logger.exception("IntegrityError creating participation for student %s, contest %s", getattr(student, 'register_number', '?'), contest_id)
                return Response({"detail": "Failed to start contest. Please try again."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception:
            logger.exception("Failed to start contest %s for student %s", contest_id, getattr(student, 'register_number', '?'))
            return Response(
                {"detail": "Failed to start contest session. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
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

        try:
            # End the participation with auto-submit flag
            participation.end_participation(auto_submitted=True)

            # Calculate final score and problems solved
            participation.total_score, participation.problems_solved = _compute_contest_score_and_solved(
                participation.contest, student
            )

            participation.save(update_fields=['total_score', 'problems_solved'])
        except Exception:
            logger.exception(
                "Failed to auto-submit contest %s for student %s",
                contest_id, getattr(student, 'register_number', '?'),
            )
            return Response(
                {"detail": "Failed to auto-submit contest. Please contact support."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

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
            participation.total_time_taken = participation.time_spent_seconds
        
        # Recalculate final score and problems solved one last time
        participation.total_score, participation.problems_solved = _compute_contest_score_and_solved(
            contest, request.user.student_profile
        )

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
            
            # Calculate final score — only count Accepted submissions
            participation.total_score, participation.problems_solved = _compute_contest_score_and_solved(
                participation.contest, student
            )

            participation.save(update_fields=['total_score', 'problems_solved'])

        return Response({
            "participation": {
                "started_at": participation.started_at,
                "session_end_time": participation.session_end_time,
                "completed_at": participation.completed_at,
                "remaining_time_seconds": participation.remaining_time_seconds,
                "is_active": participation.is_active,
                "is_locked": getattr(participation, 'is_locked', False),
                "lock_reason": getattr(participation, 'lock_reason', ''),
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
            id=contest_id,
            status__in=['published', 'completed']  # Only published/completed contests
        ).first()

        if not contest or not contest.is_student_assigned(student):
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

        # Check if contest has ended (global access window)
        if contest.is_ended:
            return Response(
                {"detail": "Contest has ended."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if this student's personal session has expired
        if participation.is_session_expired or not participation.is_active:
            return Response(
                {"detail": "Your contest session has expired."},
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
            "explanation": problem.explanation,
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
            status__in=['published', 'completed']  # Only published/completed contests
        ).first()

        if not contest or not contest.is_student_assigned(student):
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

        # Check if contest has ended (global access window)
        if contest.is_ended:
            # End participation if still active
            if participation.is_active:
                participation.end_participation()

            return Response(
                {"detail": "Contest has ended. No more submissions allowed."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if this student's personal session has expired
        if participation.is_session_expired or not participation.is_active:
            if participation.is_active:
                participation.end_participation(auto_submitted=True)
            return Response(
                {"detail": "Your contest session has expired. No more submissions allowed."},
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

        # CodeRunView (regular practice submissions) already runs every
        # submission through this same check before execution — contest
        # submissions used to skip it entirely, so a contest entry could
        # contain code CodeRunView would have rejected outright.
        is_valid, validation_error = validate_submission(language or "", source_code, "")
        if not is_valid:
            return Response(
                {"detail": f"Code validation failed: {validation_error}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Execute code using the execution engine
        try:
            # Get test cases with fallback to problem examples
            test_cases = build_runtime_test_cases(problem, sample_only=False)

            if not test_cases:
                return Response(
                    {"detail": "No test cases available for this problem."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Run all test cases through the full pipeline (wrapping + execution + comparison)
            batch = execute_problem_test_case_batch(
                problem=problem,
                source_code=source_code,
                language=language or "",
                language_id=language_id,
                test_cases=test_cases,
                batch_kind="submit",
            )

            passed_cases = batch["passed_cases"]
            total_cases = batch["total_cases"]
            status_str = batch["status"]
            compile_error = batch["compile_output"] or ""
            first_stderr = batch["stderr"] or ""

            # Add case number; hide stdin/expected for non-sample test cases
            test_results = []
            for idx, tr in enumerate(batch["test_results"]):
                is_sample = tr.get("is_sample", True)
                test_results.append({
                    "case": idx + 1,
                    "passed": tr["passed"],
                    "status": tr["status"],
                    "stdin": tr["stdin"] if is_sample else "(hidden)",
                    "expected": tr["expected"] if is_sample else "(hidden)",
                    "actual": tr["actual"],
                    "stderr": tr.get("stderr", ""),
                    "compile_output": tr.get("compile_output", ""),
                    "time": tr.get("time", ""),
                })

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

