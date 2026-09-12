"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/dashboard). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class ContestApprovalView(APIView):
    """HOD or Academic Coordinator can approve / reject a contest, and
    approve / deny a staff member's request to delete an approved contest."""
    permission_classes = [IsAuthenticated]

    ACTIONS = ('approve', 'reject', 'approve_deletion', 'deny_deletion')

    def post(self, request, contest_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response(
                {"detail": "Staff access required."},
                status=status.HTTP_403_FORBIDDEN
            )

        profile = request.user.staff_profile

        # Only HOD/Academic Coordinator can approve contests
        if profile.role not in ("hod", "academics"):
            return Response(
                {"detail": "Only HOD or Academic Coordinator can approve contests."},
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
                {"detail": "You can only manage contests in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        action = request.data.get('action')  # see ACTIONS

        if action not in self.ACTIONS:
            return Response(
                {"detail": "Invalid action. Use 'approve', 'reject', 'approve_deletion' or 'deny_deletion'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if action in ('approve_deletion', 'deny_deletion') and not contest.deletion_requested:
            return Response(
                {"detail": "There's no pending deletion request for this contest."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if action == 'approve':
                contest.approve(profile)
                # Auto-publish on approval
                publish_contest_helper(contest)
                return Response({
                    "detail": "Contest approved and published successfully.",
                    "contest_id": contest.id,
                    "status": contest.status,
                })
            if action == 'reject':
                reason = request.data.get('reason', '')
                contest.reject(reason)
                return Response({
                    "detail": "Contest rejected.",
                    "contest_id": contest.id,
                    "status": contest.status,
                    "reason": reason,
                })
            if action == 'approve_deletion':
                title = contest.title
                requester = contest.deletion_requested_by.faculty_id if contest.deletion_requested_by else "?"
                contest.delete()
                logger.info(
                    "HOD %s approved deletion of contest %s (%s), requested by %s",
                    profile.faculty_id, contest_id, title, requester,
                )
                return Response({
                    "detail": f'"{title}" has been deleted.',
                    "contest_id": contest_id,
                    "deleted": True,
                })
            # deny_deletion
            reason = request.data.get('reason', '')
            contest.deny_deletion(reason)
            return Response({
                "detail": "Deletion request denied.",
                "contest_id": contest.id,
                "deletion_requested": False,
                "reason": reason,
            })
        except Exception:
            logger.exception(
                "Failed to %s contest %s for HOD %s",
                action, contest_id, profile.faculty_id,
            )
            return Response(
                {"detail": f"Failed to {action.replace('_', ' ')} contest. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class LearnSprintApprovalView(APIView):
    """HOD or Academic Coordinator can approve / reject a Learn Sprint —
    mirrors ContestApprovalView's approve/reject half (Learn Sprints don't
    have a deletion-request workflow, see models.py)."""
    permission_classes = [IsAuthenticated]

    ACTIONS = ('approve', 'reject')

    def post(self, request, sprint_id):
        if not hasattr(request.user, 'staff_profile'):
            return Response({"detail": "Staff access required."}, status=status.HTTP_403_FORBIDDEN)

        profile = request.user.staff_profile
        if profile.role not in ("hod", "academics"):
            return Response(
                {"detail": "Only HOD or Academic Coordinator can approve Learn Sprints."},
                status=status.HTTP_403_FORBIDDEN,
            )

        sprint = LearnSprint.objects.filter(id=sprint_id).first()
        if not sprint:
            return Response({"detail": "Learn Sprint not found."}, status=status.HTTP_404_NOT_FOUND)
        if sprint.department != profile.department:
            return Response(
                {"detail": "You can only manage Learn Sprints in your department."},
                status=status.HTTP_403_FORBIDDEN,
            )

        action = request.data.get('action')
        if action not in self.ACTIONS:
            return Response({"detail": "Invalid action. Use 'approve' or 'reject'."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if action == 'approve':
                sprint.approve(profile)
                publish_learn_sprint_helper(sprint)
                return Response({
                    "detail": "Learn Sprint approved and published successfully.",
                    "sprint_id": sprint.id,
                    "status": sprint.status,
                })
            reason = request.data.get('reason', '')
            sprint.reject(reason)
            return Response({
                "detail": "Learn Sprint rejected.",
                "sprint_id": sprint.id,
                "status": sprint.status,
                "reason": reason,
            })
        except Exception:
            logger.exception(
                "Failed to %s Learn Sprint %s for HOD %s",
                action, sprint_id, profile.faculty_id,
            )
            return Response(
                {"detail": f"Failed to {action} Learn Sprint. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

