"""Learn Sprint — student list + final results. Each day is answered through
the *existing* contest workspace (day.contest_id routes straight into
CombinedContestWorkspacePage) — this file only exposes the sprint's
scheduling/lock state and, once it's over, the aggregate leaderboard/podium/
badges. See apps/learning/views/_shared.py for sprint_day_state and
finalize_learn_sprint_badges (called lazily by LearnSprint.update_status_if_ended)."""
from .._imports import *
from .._shared import *
from ...learn_sprint_badges import BADGE_CATALOG


def _sprint_matches_student(sprint, student):
    if sprint.department_id != student.department_id:
        return False
    if sprint.batch != student.batch:
        return False
    if sprint.section and sprint.section != student.section:
        return False
    return True


class StudentLearnSprintListView(APIView):
    """Sprints visible to the student — published/active/completed ones
    whose batch+section match. Each day shows only its own lock state and
    (once it's ended) the student's *own* score for it — never a ranking."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'student_profile'):
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)
        student = request.user.student_profile

        candidates = LearnSprint.objects.filter(
            department=student.department,
            batch=student.batch,
            status__in=['published', 'active', 'completed'],
        ).prefetch_related('days__contest')
        sprints = [s for s in candidates if _sprint_matches_student(s, student)]

        data = []
        for sprint in sprints:
            sprint.update_status_if_ended()
            days = []
            for day in sprint.days.all():
                state = sprint_day_state(day)
                student_score = None
                if day.contest_id and state == "completed":
                    participation = ContestParticipation.objects.filter(
                        contest_id=day.contest_id, student=student, has_started=True,
                    ).first()
                    if participation:
                        student_score = participation.total_score
                days.append({
                    "day_number": day.day_number,
                    "date": day.date,
                    "state": state,
                    "contest_id": day.contest_id if state in ("open", "completed") else None,
                    "student_score": student_score,
                })
            data.append({
                "id": sprint.id,
                "title": sprint.title,
                "description": sprint.description,
                "status": sprint.status,
                "day_count": sprint.day_count,
                "days": days,
                "results_available": sprint.status == "completed",
            })

        return Response({"sprints": data})


class StudentLearnSprintResultsView(APIView):
    """Final leaderboard + podium + this student's earned badges — gated on
    the sprint actually being over (same shape as StudentContestWinnersView's
    is_ended gate)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        if not hasattr(request.user, 'student_profile'):
            return Response({"detail": "Student access required."}, status=status.HTTP_403_FORBIDDEN)
        student = request.user.student_profile

        sprint = LearnSprint.objects.filter(id=pk).first()
        if not sprint or not _sprint_matches_student(sprint, student):
            return Response({"detail": "Learn Sprint not found."}, status=status.HTTP_404_NOT_FOUND)

        sprint.update_status_if_ended()
        if sprint.status != "completed":
            return Response({"detail": "This Learn Sprint is not yet completed."}, status=status.HTTP_400_BAD_REQUEST)

        totals = defaultdict(float)
        names = {}
        for day in sprint.days.select_related('contest').all():
            if not day.contest_id:
                continue
            rows = ContestParticipation.objects.filter(
                contest_id=day.contest_id, has_started=True,
            ).select_related('student')
            for p in rows:
                totals[p.student_id] += p.total_score
                names[p.student_id] = (p.student.name, p.student.register_number)

        ranking = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)
        leaderboard = [
            {
                "rank": i + 1,
                "student_id": student_id,
                "name": names[student_id][0],
                "register_number": names[student_id][1],
                "total_score": score,
            }
            for i, (student_id, score) in enumerate(ranking)
        ]
        podium = leaderboard[:3]
        my_result = next((row for row in leaderboard if row["student_id"] == student.id), None)

        my_badges = [
            {
                "code": award.badge_code,
                **BADGE_CATALOG.get(award.badge_code, {}),
                "awarded_at": award.awarded_at,
            }
            for award in LearnSprintBadgeAward.objects.filter(sprint=sprint, student=student)
        ]

        return Response({
            "sprint_title": sprint.title,
            "podium": podium,
            "leaderboard": leaderboard,
            "my_result": my_result,
            "my_badges": my_badges,
        })
