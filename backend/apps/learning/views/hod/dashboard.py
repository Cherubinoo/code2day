"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/dashboard). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class ContestApprovalView(APIView):
    """HOD or Academic Coordinator can approve or reject contests"""
    permission_classes = [IsAuthenticated]

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
                {"detail": "You can only approve contests in your department."},
                status=status.HTTP_403_FORBIDDEN
            )

        action = request.data.get('action')  # 'approve' or 'reject'

        if action not in ('approve', 'reject'):
            return Response(
                {"detail": "Invalid action. Use 'approve' or 'reject'."},
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
            else:
                reason = request.data.get('reason', '')
                contest.reject(reason)
                return Response({
                    "detail": "Contest rejected.",
                    "contest_id": contest.id,
                    "status": contest.status,
                    "reason": reason,
                })
        except Exception:
            logger.exception(
                "Failed to %s contest %s for HOD %s",
                action, contest_id, profile.faculty_id,
            )
            return Response(
                {"detail": f"Failed to {action} contest. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

