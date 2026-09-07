"""Views extracted from the original monolithic apps/learning/views.py
(module: ja/dashboard). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


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

