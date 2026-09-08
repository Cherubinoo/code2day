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


# Institution-wide leadership roles — TPU, Director, and Principal are all
# the same function: full institution visibility, and they can add a new
# staff member or HOD to any department, unlike HOD/Academics who are
# scoped to their own department.
INSTITUTION_WIDE_STAFF_ROLES = ("tpu", "director", "principal")


class HODManageStaffView(APIView):
    """HOD/Academics: add new staff member to own department. TPU/Director/
    Principal: add new staff member to any department in their institution
    (they have no home department themselves, so the caller must say which
    department the new staff/HOD belongs to)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        hod = _staff_from_request(request)
        if not hod or hod.role not in ("hod", "academics", "admin") + INSTITUTION_WIDE_STAFF_ROLES:
            return Response({"error": "HOD access required"}, status=403)
        if not hod.institution:
            return Response({"error": "No institution assigned to your account"}, status=400)

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

        if hod.role in INSTITUTION_WIDE_STAFF_ROLES:
            # TPU/Director/Principal: institution-wide, not scoped to a home
            # department (even if their own StaffProfile happens to carry a
            # department FK) — the new staff/HOD's department must always
            # be chosen explicitly.
            department_id = data.get("department_id")
            if not department_id:
                return Response({"error": "department_id is required when adding staff institution-wide."}, status=400)
            department = Department.objects.filter(id=department_id, institution=hod.institution).first()
            if not department:
                return Response({"error": "Department not found in your institution."}, status=400)
        else:
            # HOD/Academics: always their own department, same as before.
            department = hod.department

        if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
            return Response({"error": "A staff member with this Faculty ID already exists."}, status=400)

        staff = StaffProfile.objects.create(
            faculty_id=faculty_id,
            name=name,
            role=role,
            department=department,
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
            "department_id": staff.department_id,
        }, status=201)

class HODManageStaffDetailView(APIView):
    """HOD/Academics: edit a staff member in own department. TPU/Director/
    Principal: edit any staff member institution-wide."""
    permission_classes = [IsAuthenticated]

    def _find_target(self, hod, faculty_id):
        if hod.role in INSTITUTION_WIDE_STAFF_ROLES:
            return StaffProfile.objects.filter(faculty_id=faculty_id, institution=hod.institution).first()
        return StaffProfile.objects.filter(faculty_id=faculty_id, department=hod.department).first()

    def put(self, request, faculty_id):
        hod = _staff_from_request(request)
        if not hod or hod.role not in ("hod", "academics", "admin") + INSTITUTION_WIDE_STAFF_ROLES:
            return Response({"error": "HOD access required"}, status=403)

        target = self._find_target(hod, faculty_id)
        if not target:
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
        if not hod or hod.role not in ("hod", "academics", "admin") + INSTITUTION_WIDE_STAFF_ROLES:
            return Response({"error": "HOD access required"}, status=403)

        target = self._find_target(hod, faculty_id)
        if not target:
            return Response({"error": "Staff not found in your department"}, status=404)

        if target.id == hod.id:
            return Response({"error": "You cannot delete your own account."}, status=400)

        account = target.account
        if account:
            account.delete()  # cascades to the StaffProfile
        else:
            target.delete()
        return Response({"message": "Staff deleted"})

