"""Learn Sprint — staff creation/listing/monitoring. See apps/learning/models.py
(LearnSprint, LearnSprintDay, LearnSprintManualQuestion) and
apps/learning/views/_shared.py (allocate_learn_sprint_content,
publish_learn_sprint_helper, sprint_day_state) for the design."""
from .._imports import *
from .._shared import *


class LearnSprintListCreateView(APIView):
    """List Learn Sprints for staff/HOD/Academic Coordinator, or create one."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        profile = request.user.staff_profile

        if profile.role in ("hod", "academics") and profile.department:
            sprints = LearnSprint.objects.filter(department=profile.department)
        elif profile.role == "staff":
            sprints = LearnSprint.objects.filter(created_by=profile)
        else:
            sprints = LearnSprint.objects.filter(institution=profile.institution)
        sprints = sprints.select_related('created_by', 'department', 'approved_by')

        data = []
        for sprint in sprints:
            sprint.update_status_if_ended()
            data.append({
                "id": sprint.id,
                "title": sprint.title,
                "description": sprint.description,
                "created_by": {
                    "faculty_id": sprint.created_by.faculty_id,
                    "name": sprint.created_by.name or sprint.created_by.faculty_id,
                } if sprint.created_by else None,
                "status": sprint.status,
                "sections": sprint.sections,
                "batch": sprint.batch,
                "section": sprint.section,
                "day_count": sprint.day_count,
                "sprint_dates": sprint.sprint_dates,
                "daily_start_time": sprint.daily_start_time,
                "daily_end_time": sprint.daily_end_time,
                "rejection_reason": sprint.rejection_reason,
                "submitted_for_approval_at": sprint.submitted_for_approval_at,
                "created_at": sprint.created_at,
            })

        return Response({
            "sprints": data,
            "department": {
                "id": profile.department.id,
                "code": profile.department.code,
                "name": profile.department.name,
            } if profile.department else None,
            "user_role": profile.role,
        })

    def post(self, request):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        profile = request.user.staff_profile
        if not profile.department:
            return Response({"detail": "You must have a department to create a Learn Sprint."}, status=status.HTTP_400_BAD_REQUEST)

        title = (request.data.get('title') or '').strip()
        if not title:
            return Response({"detail": "Title is required."}, status=status.HTTP_400_BAD_REQUEST)

        batch = (request.data.get('batch') or '').strip()
        if not batch:
            return Response({"detail": "Batch is required."}, status=status.HTTP_400_BAD_REQUEST)
        section = (request.data.get('section') or '').strip()

        raw_sections = request.data.get('sections', []) or []
        sections = [s for s in LearnSprint.SECTION_KEYS if s in raw_sections]
        if not sections:
            return Response(
                {"detail": "Select at least one section (Programming, Aptitude, Reading, Manual)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sprint_dates = request.data.get('sprint_dates', []) or []
        if not sprint_dates:
            return Response({"detail": "Pick at least one date on the calendar."}, status=status.HTTP_400_BAD_REQUEST)
        day_count = len(sprint_dates)

        def _parse_time(value):
            from datetime import datetime as _dt
            try:
                return _dt.strptime(value, "%H:%M").time()
            except (TypeError, ValueError):
                return None

        daily_start_time = _parse_time(request.data.get('daily_start_time'))
        daily_end_time = _parse_time(request.data.get('daily_end_time'))
        if not daily_start_time or not daily_end_time:
            return Response(
                {"detail": "Daily start and end time are required (e.g. 18:00)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        per_day = {
            "programming": int(request.data.get('programming_per_day', 0) or 0),
            "aptitude": int(request.data.get('aptitude_per_day', 0) or 0),
            "reading": int(request.data.get('reading_per_day', 0) or 0),
            "manual": int(request.data.get('manual_per_day', 0) or 0),
        }
        for key in sections:
            if per_day[key] <= 0:
                return Response({"detail": f"Set a positive per-day count for {key}."}, status=status.HTTP_400_BAD_REQUEST)

        weight_by_key = {
            "programming": int(request.data.get('programming_weight_percent', 0) or 0),
            "aptitude": int(request.data.get('aptitude_weight_percent', 0) or 0),
            "reading": int(request.data.get('reading_weight_percent', 0) or 0),
            "manual": int(request.data.get('manual_weight_percent', 0) or 0),
        }
        if sum(weight_by_key[k] for k in sections) != 100:
            return Response(
                {"detail": "The weights of the selected sections must add up to 100%."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        topic_config = request.data.get('topic_config', {}) or {}
        for key in ("programming", "aptitude", "reading"):
            if key not in sections:
                continue
            cfg = topic_config.get(key) or {}
            topics = cfg.get('topics') or []
            if not topics:
                return Response({"detail": f"Select at least one topic for {key}."}, status=status.HTTP_400_BAD_REQUEST)
            if cfg.get('mode') == 'weighted' and sum(int(t.get('weight', 0) or 0) for t in topics) != 100:
                return Response(
                    {"detail": f"The topic weights for {key} must add up to 100%."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        manual_questions_payload = request.data.get('manual_questions', []) or []
        if "manual" in sections:
            needed = day_count * per_day["manual"]
            if len(manual_questions_payload) != needed:
                return Response(
                    {"detail": f"Author exactly {needed} manual question(s) — {len(manual_questions_payload)} given."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        submit_for_approval = request.data.get('submit_for_approval', False)
        initial_status = 'pending_approval' if submit_for_approval else 'draft'

        try:
            with transaction.atomic():
                sprint = LearnSprint.objects.create(
                    title=title,
                    description=request.data.get('description', ''),
                    created_by=profile,
                    department=profile.department,
                    institution=profile.institution,
                    sections=sections,
                    programming_per_day=per_day["programming"],
                    aptitude_per_day=per_day["aptitude"],
                    reading_per_day=per_day["reading"],
                    manual_per_day=per_day["manual"],
                    topic_config=topic_config,
                    daily_start_time=daily_start_time,
                    daily_end_time=daily_end_time,
                    sprint_dates=sprint_dates,
                    batch=batch,
                    section=section,
                    programming_weight_percent=weight_by_key["programming"],
                    aptitude_weight_percent=weight_by_key["aptitude"],
                    reading_weight_percent=weight_by_key["reading"],
                    manual_weight_percent=weight_by_key["manual"],
                    status=initial_status,
                    submitted_for_approval_at=timezone.now() if submit_for_approval else None,
                )

                if "manual" in sections and manual_questions_payload:
                    manual_rows = []
                    for idx, mq in enumerate(manual_questions_payload):
                        if not isinstance(mq, dict):
                            continue
                        stem = (mq.get('question_text') or '').strip()
                        correct = (mq.get('correct_option') or '').strip().upper()
                        if not stem or correct not in ('A', 'B', 'C', 'D'):
                            raise ValueError(f"Manual question #{idx + 1} is incomplete.")
                        manual_rows.append(LearnSprintManualQuestion(
                            sprint=sprint, order=idx,
                            question_text=stem,
                            question_image=(mq.get('question_image') or '').strip(),
                            option_a=(mq.get('option_a') or '').strip(),
                            option_b=(mq.get('option_b') or '').strip(),
                            option_c=(mq.get('option_c') or '').strip(),
                            option_d=(mq.get('option_d') or '').strip(),
                            correct_option=correct,
                            explanation=(mq.get('explanation') or '').strip(),
                        ))
                    LearnSprintManualQuestion.objects.bulk_create(manual_rows)

                allocate_learn_sprint_content(sprint)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "id": sprint.id,
            "title": sprint.title,
            "status": sprint.status,
            "detail": f"Learn Sprint created successfully{' and submitted for approval' if submit_for_approval else ''}.",
        }, status=status.HTTP_201_CREATED)


class LearnSprintDetailView(APIView):
    """Staff/HOD monitor view for one Learn Sprint — every day, its
    allocated-question summary, and (once published) its contest id so the
    frontend can deep-link into the existing ContestAnalyticsView for a
    live per-day leaderboard."""
    permission_classes = [IsAuthenticated]

    def _get_sprint(self, request, pk):
        if not hasattr(request.user, 'staff_profile'):
            return None, Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        sprint = LearnSprint.objects.filter(id=pk).first()
        if not sprint:
            return None, Response({"detail": "Learn Sprint not found."}, status=status.HTTP_404_NOT_FOUND)
        profile = request.user.staff_profile
        allowed = (
            request.user.is_superuser
            or sprint.department_id == profile.department_id
            or profile.role in ("director", "principal", "admin")
        )
        if not allowed:
            return None, Response(
                {"detail": "You can only manage Learn Sprints in your department."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return sprint, None

    def get(self, request, pk):
        sprint, err = self._get_sprint(request, pk)
        if err:
            return err
        sprint.update_status_if_ended()

        days = []
        for day in sprint.days.select_related('contest').all():
            days.append({
                "id": day.id,
                "day_number": day.day_number,
                "date": day.date,
                "contest_id": day.contest_id,
                "state": sprint_day_state(day),
                "problem_count": len(day.allocated_problem_ids or []),
                "aptitude_question_count": len(day.allocated_aptitude_question_ids or []),
                "manual_question_count": day.manual_questions.count(),
            })

        return Response({
            "id": sprint.id,
            "title": sprint.title,
            "description": sprint.description,
            "status": sprint.status,
            "sections": sprint.sections,
            "batch": sprint.batch,
            "section": sprint.section,
            "sprint_dates": sprint.sprint_dates,
            "daily_start_time": sprint.daily_start_time,
            "daily_end_time": sprint.daily_end_time,
            "rejection_reason": sprint.rejection_reason,
            "days": days,
        })

    def delete(self, request, pk):
        sprint, err = self._get_sprint(request, pk)
        if err:
            return err
        if sprint.status != "draft":
            return Response(
                {"detail": "Only a draft Learn Sprint can be deleted directly."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sprint.delete()
        return Response({"detail": "Learn Sprint deleted.", "deleted": True})


class LearnSprintSubmitForApprovalView(APIView):
    """Staff submits their draft/rejected Learn Sprint for HOD approval."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)
        profile = request.user.staff_profile
        sprint = LearnSprint.objects.filter(id=pk).first()
        if not sprint:
            return Response({"detail": "Learn Sprint not found."}, status=status.HTTP_404_NOT_FOUND)
        if sprint.created_by != profile:
            return Response(
                {"detail": "You can only submit your own Learn Sprints for approval."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if sprint.status not in ("draft", "rejected"):
            return Response(
                {"detail": f"Cannot submit a Learn Sprint with status '{sprint.status}' for approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sprint.submit_for_approval()
        return Response({"id": sprint.id, "status": sprint.status, "detail": "Learn Sprint submitted for approval."})
