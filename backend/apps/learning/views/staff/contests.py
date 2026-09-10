"""Views extracted from the original monolithic apps/learning/views.py
(module: staff/contests). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class ContestListCreateView(APIView):
    """List contests for HOD/staff or create new contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """Get contests - filtered by role and department"""
        if request.user.is_superuser or getattr(request.user, 'username', '') in ('0001', 'staff_0001', 'admin'):
            contests = Contest.objects.all().select_related(
                'created_by', 'department', 'approved_by'
            ).order_by('-created_at')
        elif hasattr(request.user, 'staff_profile'):
            profile = request.user.staff_profile
            if profile.role in ("hod", "academics") and profile.department:
                contests = Contest.objects.filter(department=profile.department).select_related(
                    'created_by', 'department', 'approved_by'
                ).order_by('-created_at')
            elif profile.role == "staff":
                contests = Contest.objects.filter(created_by=profile).select_related(
                    'created_by', 'department', 'approved_by'
                ).order_by('-created_at')
            else:
                contests = Contest.objects.filter(institution=profile.institution).select_related(
                    'created_by', 'department', 'approved_by'
                ).order_by('-created_at')
        else:
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        data = []
        for contest in contests:
            # Compute live counts — stored fields may be stale
            live_participants = ContestParticipation.objects.filter(contest=contest).count()
            if contest.contest_type == 'aptitude':
                submitted_student_count = AptitudeContestSubmission.objects.filter(contest=contest).values('student').distinct().count()
                live_submissions = AptitudeContestSubmission.objects.filter(contest=contest).count()
            else:
                submitted_student_count = ContestSubmission.objects.filter(contest=contest).values('student').distinct().count()
                live_submissions = ContestSubmission.objects.filter(contest=contest).count()
            live_participants = max(live_participants, submitted_student_count)
            data.append({
                "id": contest.id,
                "title": contest.title,
                "description": contest.description,
                "created_by": {
                    "faculty_id": contest.created_by.faculty_id,
                    "name": contest.created_by.name or contest.created_by.faculty_id,
                } if contest.created_by else None,
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
                "problem_count": contest.problems.count() if contest.contest_type in ("programming", "combined") else 0,
                "aptitude_question_count": contest.aptitude_questions.count() if contest.contest_type in ("aptitude", "combined") else 0,
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

        contest_type = request.data.get('contest_type', 'programming')
        coding_weight = int(request.data.get('coding_weight_percent', 34) or 0)
        aptitude_weight = int(request.data.get('aptitude_weight_percent', 33) or 0)
        reading_weight = int(request.data.get('reading_weight_percent', 33) or 0)
        custom_weight = int(request.data.get('custom_weight_percent', 0) or 0)

        # `sections` is the new multi-select section list for combined contests
        # (["coding", "aptitude", "reading", "custom"]). An empty/absent list on
        # a combined contest keeps the legacy fixed 3-section behavior.
        raw_sections = request.data.get('sections', []) or []
        sections = [s for s in Contest.SECTION_KEYS if s in raw_sections]
        custom_questions_payload = request.data.get('custom_questions', []) or []

        if contest_type == 'combined':
            if sections:
                _weight_by_key = {
                    "coding": coding_weight,
                    "aptitude": aptitude_weight,
                    "reading": reading_weight,
                    "custom": custom_weight,
                }
                if sum(_weight_by_key[s] for s in sections) != 100:
                    return Response(
                        {"detail": "The weights of the selected sections must add up to 100%."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if "custom" in sections and not custom_questions_payload:
                    return Response(
                        {"detail": "Add at least one custom question or remove the Custom Questions section."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            elif (coding_weight + aptitude_weight + reading_weight) != 100:
                return Response(
                    {"detail": "Coding, aptitude, and reading weights must add up to 100%."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

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
            contest_type=contest_type,
            coding_weight_percent=coding_weight,
            aptitude_weight_percent=aptitude_weight,
            reading_weight_percent=reading_weight,
            custom_weight_percent=custom_weight,
            sections=sections if contest_type == 'combined' else [],
            submitted_for_approval_at=timezone.now() if submit_for_approval else None,
            # Security & Anti-cheat settings
            enable_tab_switch_check=request.data.get('enable_tab_switch_check', True),
            max_tab_switches=request.data.get('max_tab_switches', 3),
            enable_fullscreen_lock=request.data.get('enable_fullscreen_lock', False),
            enable_copy_paste_lock=request.data.get('enable_copy_paste_lock', False),
            enable_webcam_proctoring=request.data.get('enable_webcam_proctoring', False),
        )

        # For a combined contest whose sections were explicitly chosen, only
        # attach content for the selected sections (an empty `sections` list is
        # a legacy combined contest → attach everything, unchanged behavior).
        def _section_on(key):
            if contest.contest_type != 'combined':
                return True
            return not sections or key in sections

        # Add problems by slugs (for programming, and coding section of combined)
        if contest.contest_type in ('programming', 'combined') and _section_on('coding'):
            problem_slugs = request.data.get('problem_slugs', [])
            if problem_slugs:
                problems = Problem.objects.filter(slug__in=problem_slugs)
                contest.problems.set(problems)

        # Add aptitude questions (for aptitude, and aptitude+reading sections of combined)
        if contest.contest_type in ('aptitude', 'combined') and (_section_on('aptitude') or _section_on('reading')):
            aptitude_question_ids = list(request.data.get('aptitude_question_ids', [])) if _section_on('aptitude') else []
            # Reading passages expand to the RC questions belonging to them —
            # reading questions are just AptitudeQuestion rows (question_type
            # "RC") so they ride along in the same M2M as regular MCQs.
            reading_passage_ids = request.data.get('reading_passage_ids', []) if _section_on('reading') else []
            if reading_passage_ids:
                passage_question_ids = list(
                    AptitudeQuestion.objects.filter(
                        passage_id__in=reading_passage_ids, question_type='RC'
                    ).values_list('id', flat=True)
                )
                aptitude_question_ids += passage_question_ids
            if aptitude_question_ids:
                questions = AptitudeQuestion.objects.filter(id__in=aptitude_question_ids)
                contest.aptitude_questions.set(questions)

        # Custom Questions — MCQ-only, authored inline in the builder, contest-owned
        # (never touch the shared aptitude bank). Only for combined contests that
        # selected the "custom" section.
        if contest.contest_type == 'combined' and 'custom' in sections and custom_questions_payload:
            custom_rows = []
            for idx, cq in enumerate(custom_questions_payload):
                if not isinstance(cq, dict):
                    continue
                stem = (cq.get('question_text') or '').strip()
                correct = (cq.get('correct_option') or '').strip().upper()
                if not stem or correct not in ('A', 'B', 'C', 'D'):
                    continue
                custom_rows.append(ContestCustomQuestion(
                    contest=contest,
                    order=idx,
                    question_text=stem,
                    question_image=(cq.get('question_image') or '').strip(),
                    option_a=(cq.get('option_a') or '').strip(),
                    option_b=(cq.get('option_b') or '').strip(),
                    option_c=(cq.get('option_c') or '').strip(),
                    option_d=(cq.get('option_d') or '').strip(),
                    correct_option=correct,
                    explanation=(cq.get('explanation') or '').strip(),
                ))
            if custom_rows:
                ContestCustomQuestion.objects.bulk_create(custom_rows)

        # Assign batches & sections
        assigned_batches = request.data.get('assigned_batches', [])
        assigned_sections = request.data.get('assigned_sections', [])

        if assigned_batches or assigned_sections:
            contest.assigned_batches = assigned_batches
            contest.assigned_sections = assigned_sections
            contest.save(update_fields=['assigned_batches', 'assigned_sections'])

            # Determine which batches have specific section restrictions
            restricted_batches = set()
            section_filter = Q(pk__in=[])
            for entry in assigned_sections:
                if isinstance(entry, str) and '::' in entry:
                    batch, _, section = entry.partition('::')
                    if batch and section:
                        restricted_batches.add(batch)
                        section_filter |= Q(batch=batch, section=section)
                elif isinstance(entry, dict):
                    batch = entry.get('batch')
                    section = entry.get('section')
                    if batch and section:
                        if batch:
                            restricted_batches.add(batch)
                        section_filter |= Q(batch=batch, section=section)
                elif isinstance(entry, str):
                    section_filter |= Q(section=entry)

            unrestricted_batches = [b for b in assigned_batches if b not in restricted_batches]

            final_student_filter = Q(pk__in=[])
            if unrestricted_batches:
                final_student_filter |= Q(batch__in=unrestricted_batches)
            if section_filter != Q(pk__in=[]):
                final_student_filter |= section_filter

            if final_student_filter != Q(pk__in=[]):
                target_students = StudentProfile.objects.filter(
                    final_student_filter,
                    institution=profile.institution,
                    department=profile.department
                )
                contest.assigned_students.set(target_students)

        # Assign individual students
        assigned_student_ids = request.data.get('assigned_student_ids', [])
        if assigned_student_ids:
            individual_students = StudentProfile.objects.filter(
                id__in=assigned_student_ids,
                institution=profile.institution,
                department=profile.department
            )
            contest.assigned_students.add(*individual_students)

        # Auto-tag every question in this contest as "already used" for every
        # batch it's actually assigned to — so building a later contest for
        # the same batch shows these as used without the staff having to
        # hand-tick each one. Based on the resulting assigned_students set
        # (not just assigned_batches) so this also covers individual-student
        # and section-restricted assignment.
        target_batches = [
            b for b in contest.assigned_students.values_list('batch', flat=True).distinct() if b
        ]
        if target_batches:
            new_marks = []
            if contest.contest_type in ('programming', 'combined'):
                for problem in contest.problems.all():
                    for batch in target_batches:
                        new_marks.append(QuestionUsageMark(staff=profile, batch=batch, problem=problem))
            if contest.contest_type in ('aptitude', 'combined'):
                for question in contest.aptitude_questions.all():
                    for batch in target_batches:
                        new_marks.append(QuestionUsageMark(staff=profile, batch=batch, aptitude_question=question))
            if new_marks:
                QuestionUsageMark.objects.bulk_create(new_marks, ignore_conflicts=True)

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
        is_admin = request.user.is_superuser or getattr(request.user, 'username', '') in ('0001', 'staff_0001', 'admin')
        is_staff = hasattr(request.user, 'staff_profile')
        if not (is_admin or is_staff):
            return Response({"detail": "Staff or Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = getattr(request.user, 'staff_profile', None)
        contest = Contest.objects.filter(id=pk).first()
        
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions
        if not is_admin and profile and profile.role in ("hod", "academics") and profile.department and contest.department != profile.department:
            return Response({"detail": "You can only view contests in your department."}, status=status.HTTP_403_FORBIDDEN)

        problems_data = []
        aptitude_data = []
        if contest.contest_type in ('programming', 'combined'):
            for problem in contest.problems.all():
                problems_data.append({
                    "id": problem.id,
                    "slug": problem.slug,
                    "title": problem.title,
                    "difficulty": problem.difficulty,
                })
        if contest.contest_type in ('aptitude', 'combined'):
            for q in contest.aptitude_questions.all():
                aptitude_data.append({
                    "id": q.id,
                    "question_type": q.question_type,
                    "question_text": q.question_text,
                    "question_image": q.question_image,
                    "topic": q.topic.title if q.topic else "General",
                    "passage": q.passage.title if q.passage_id else None,
                    "difficulty": q.difficulty,
                    "option_a": q.option_a,
                    "option_a_image": q.option_a_image,
                    "option_b": q.option_b,
                    "option_b_image": q.option_b_image,
                    "option_c": q.option_c,
                    "option_c_image": q.option_c_image,
                    "option_d": q.option_d,
                    "option_d_image": q.option_d_image,
                    "correct_option": q.correct_option,
                })

        custom_data = []
        if contest.contest_type == 'combined':
            for cq in contest.custom_questions.all():
                custom_data.append({
                    "id": cq.id,
                    "order": cq.order,
                    "question_text": cq.question_text,
                    "question_image": cq.question_image,
                    "option_a": cq.option_a,
                    "option_b": cq.option_b,
                    "option_c": cq.option_c,
                    "option_d": cq.option_d,
                    "correct_option": cq.correct_option,
                    "explanation": cq.explanation,
                })

        data = {
            "id": contest.id,
            "title": contest.title,
            "description": contest.description,
            "contest_type": contest.contest_type,
            "sections": contest.sections,
            "coding_weight_percent": contest.coding_weight_percent,
            "aptitude_weight_percent": contest.aptitude_weight_percent,
            "reading_weight_percent": contest.reading_weight_percent,
            "custom_weight_percent": contest.custom_weight_percent,
            "custom_questions": custom_data,
            "status": contest.status,
            "start_time": contest.start_time,
            "end_time": contest.end_time,
            "duration_minutes": contest.duration_minutes,
            # "problems" stays coding-only (empty for pure-aptitude contests, unchanged
            # behavior); "aptitude_questions" is aptitude+reading data, new for combined
            # contests but also populated for pure-aptitude ones going forward.
            "problems": problems_data,
            "aptitude_questions": aptitude_data,
            "problem_count": contest.problem_count,
            "aptitude_question_count": contest.aptitude_question_count,
            "assigned_batches": contest.assigned_batches,
            "assigned_student_count": contest.assigned_student_count,
            "created_by": contest.created_by.name if contest.created_by else "Admin",
            "department": contest.department.name if contest.department else None,
            "approved_by": contest.approved_by.name if contest.approved_by else None,
            "approved_at": contest.approved_at,
            "rejection_reason": contest.rejection_reason,
        }
        return Response(data)

    def delete(self, request, pk):
        """Delete a contest — the creator or an admin only (not any staff
        in the department, unlike the read permission above, since this
        is destructive: it cascades to every participation/submission
        already recorded against it)."""
        is_admin = request.user.is_superuser or getattr(request.user, 'username', '') in ('0001', 'staff_0001', 'admin')
        profile = getattr(request.user, 'staff_profile', None)

        contest = Contest.objects.filter(id=pk).first()
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        is_creator = profile is not None and contest.created_by_id == profile.id
        if not (is_admin or is_creator):
            return Response({"detail": "Only the contest creator or an admin can delete this contest."}, status=status.HTTP_403_FORBIDDEN)

        title = contest.title
        contest.delete()
        return Response({"message": f'"{title}" deleted.'})

class ContestAnalyticsView(APIView):
    """Get analytics for a specific contest"""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        """Get contest analytics"""
        is_admin = request.user.is_superuser or getattr(request.user, 'username', '') in ('0001', 'staff_0001', 'admin')
        is_staff = hasattr(request.user, 'staff_profile')
        if not (is_admin or is_staff):
            return Response({"detail": "Staff or Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = getattr(request.user, 'staff_profile', None)
        contest = Contest.objects.filter(id=pk).first()
        
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        # Check permissions
        if not is_admin and profile and profile.role in ("hod", "academics") and profile.department and contest.department != profile.department:
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
        participations = list(ContestParticipation.objects.filter(contest=contest).select_related('student'))
        
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
                total_score = _best_score_per_problem(contest, student)
            
            participants_data.append({
                "register_number": student.register_number,
                "name": student.name,
                "batch": student.batch,
                "section": student.section,
                "problems_solved": solved_count,
                "score": total_score,
                "total_submissions": student_submissions.count(),
                "time_spent": participation.time_spent_seconds or 0,
                "is_locked": getattr(participation, 'is_locked', False),
                "lock_reason": getattr(participation, 'lock_reason', ''),
                "is_active": participation.is_active,
            })
        
        # Sort by score descending
        participants_data.sort(key=lambda x: (-x['score'], -x['problems_solved']))

        # Top performers (top 10)
        top_performers = participants_data[:10]

        # Per-section averages for combined contests — mean of each
        # participation.section_scores key across all participants.
        section_averages = {}
        if contest.contest_type == 'combined':
            active_sections = [s for s in (contest.sections or []) if s in Contest.SECTION_KEYS] \
                or ["coding", "aptitude", "reading"]
            sums = {s: 0.0 for s in active_sections}
            counts = {s: 0 for s in active_sections}
            for participation in participations:
                scores = participation.section_scores or {}
                for s in active_sections:
                    if s in scores:
                        sums[s] += float(scores[s] or 0)
                        counts[s] += 1
            section_averages = {
                s: round(sums[s] / counts[s], 1) if counts[s] else 0.0
                for s in active_sections
            }

        return Response({
            "contest": {
                "id": contest.id,
                "title": contest.title,
                "status": contest.status,
                "contest_type": contest.contest_type,
                "sections": contest.sections,
                "coding_weight_percent": contest.coding_weight_percent,
                "aptitude_weight_percent": contest.aptitude_weight_percent,
                "reading_weight_percent": contest.reading_weight_percent,
                "custom_weight_percent": contest.custom_weight_percent,
            },
            "summary": {
                "total_participants": len(participants_data),
                "total_submissions": submissions.count(),
                "accepted_submissions": submissions.filter(is_correct=True).count() if contest.contest_type == 'aptitude' else submissions.filter(status='Accepted').count(),
            },
            "section_averages": section_averages,
            "problem_stats": problem_stats,
            "top_performers": top_performers,
            "participants": participants_data,
        })

class ContestStudentUnlockView(APIView):
    """Unlock / re-activate a specific student's contest session"""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, register_number):
        raw_pin = request.data.get('pin', '')
        pin = str(raw_pin).strip()

        is_staff = hasattr(request.user, 'staff_profile') or getattr(request.user, 'is_staff', False) or request.user.is_superuser
        valid_pins = ["1234", "9999", "code2day", "admin", "0000"]
        if not is_staff and pin:
            is_staff = (pin in valid_pins) or StaffProfile.objects.filter(faculty_id__iexact=pin).exists()

        if not is_staff:
            return Response({"detail": "Staff access or valid PIN required."}, status=status.HTTP_403_FORBIDDEN)

        contest = Contest.objects.filter(id=pk).first()
        if not contest:
            return Response({"detail": "Contest not found."}, status=status.HTTP_404_NOT_FOUND)

        student = StudentProfile.objects.filter(register_number=register_number).first()
        if not student:
            return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)

        participation = ContestParticipation.objects.filter(contest=contest, student=student).first()
        if not participation:
            participation = ContestParticipation.objects.create(
                contest=contest,
                student=student,
                has_started=True,
                is_active=True
            )

        duration = contest.session_duration_minutes or contest.duration_minutes or 60
        now = timezone.now()
        
        # Unlock student and grant active session time from now
        participation.is_active = True
        participation.is_locked = False
        participation.lock_reason = ""
        participation.auto_submitted = False
        participation.manually_stopped = False
        participation.session_end_time = now + timezone.timedelta(minutes=duration)
        participation.save()

        return Response({
            "detail": f"Student {student.name} ({student.register_number}) has been unlocked successfully.",
            "register_number": student.register_number,
            "session_end_time": participation.session_end_time,
            "is_active": participation.is_active,
            "is_locked": False,
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

        if profile.role in ("hod", "academics") and contest.department != profile.department:
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

        # Check permissions - HOD/Academic Coordinator or contest creator can publish
        if profile.role in ("hod", "academics") and contest.department != profile.department:
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

        try:
            publish_contest_helper(contest)
        except Exception:
            logger.exception("Failed to publish contest %s for staff %s", contest_id, profile.faculty_id)
            return Response(
                {"detail": "Failed to publish contest. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({
            "detail": "Contest published successfully.",
            "contest_id": contest.id,
            "status": contest.status,
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

