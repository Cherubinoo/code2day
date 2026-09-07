"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/staff_management). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class HODDeptStaffView(APIView):
    """HOD: list staff in own department (for assignment staff picker)."""

    def get(self, request):
        staff = _staff_from_request(request)
        if not staff or staff.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)
        dept_staff = StaffProfile.objects.filter(department=staff.department).values(
            "id", "name", "faculty_id", "role"
        )
        return Response(list(dept_staff))

class HODManageStaffView(APIView):
    """HOD: add new staff member to own department."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        hod = _staff_from_request(request)
        if not hod or hod.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)
        if not hod.department or not hod.institution:
            return Response({"error": "HOD has no department assigned"}, status=400)

        data = request.data
        faculty_id = (data.get("faculty_id") or "").strip()
        name = (data.get("name") or "").strip()
        role = data.get("role", "staff")
        password = (data.get("password") or "").strip()

        if not faculty_id:
            return Response({"error": "Faculty ID is required"}, status=400)
        if not name:
            return Response({"error": "Name is required"}, status=400)
        if role not in ("staff", "hod", "academics", "tpu", "ja"):
            role = "staff"

        if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
            return Response({"error": "A staff member with this Faculty ID already exists."}, status=400)

        staff = StaffProfile.objects.create(
            faculty_id=faculty_id,
            name=name,
            role=role,
            department=hod.department,
            institution=hod.institution,
            is_active=True,
            password=password,
        )
        return Response({
            "faculty_id": staff.faculty_id,
            "name": staff.name,
            "role": staff.role,
            "role_display": staff.get_role_display(),
            "is_active": staff.is_active,
        }, status=201)

class HODManageStaffDetailView(APIView):
    """HOD: edit a staff member in own department."""
    permission_classes = [IsAuthenticated]

    def put(self, request, faculty_id):
        hod = _staff_from_request(request)
        if not hod or hod.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)

        try:
            target = StaffProfile.objects.get(faculty_id=faculty_id, department=hod.department)
        except StaffProfile.DoesNotExist:
            return Response({"error": "Staff not found in your department"}, status=404)

        data = request.data
        name = (data.get("name") or "").strip()
        if name:
            target.name = name
        if "role" in data and data["role"] in ("staff", "hod", "tpu", "ja"):
            target.role = data["role"]
        if "is_active" in data:
            target.is_active = bool(data["is_active"])
        pw = (data.get("password") or "").strip()
        if pw:
            target.password = pw

        target.save()
        return Response({
            "faculty_id": target.faculty_id,
            "name": target.name,
            "role": target.role,
            "role_display": target.get_role_display(),
            "is_active": target.is_active,
        })

    def delete(self, request, faculty_id):
        hod = _staff_from_request(request)
        if not hod or hod.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)

        try:
            target = StaffProfile.objects.get(faculty_id=faculty_id, department=hod.department)
        except StaffProfile.DoesNotExist:
            return Response({"error": "Staff not found in your department"}, status=404)

        if target.id == hod.id:
            return Response({"error": "You cannot delete your own account."}, status=400)

        account = target.account
        if account:
            account.delete()  # cascades to the StaffProfile
        else:
            target.delete()
        return Response({"message": "Staff deleted"})

