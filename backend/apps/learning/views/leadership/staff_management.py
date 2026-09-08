"""Institution-wide staff management for TPU / Director / Principal — split
out from apps/learning/views/hod/staff_management.py, which handles the
department-scoped HOD/Academics equivalent. TPU, Director, and Principal are
explicitly one shared role-function (institution-wide visibility, no home
department of their own), so this module is used by all three rather than
being duplicated per role name."""
from .._imports import *
from .._shared import *


# TPU, Director, and Principal are the same function on this dashboard: full
# institution visibility, and the ability to add/edit/delete a staff member
# or HOD in any department (unlike HOD/Academics, who are scoped to their
# own department — see hod/staff_management.py for that version).
LEADERSHIP_ROLES = ("tpu", "director", "principal")


class LeadershipManageStaffView(APIView):
    """Add a new staff member (or HOD) to any department in the caller's
    institution. Since TPU/Director/Principal have no home department of
    their own, the caller must say which department the new staff/HOD
    belongs to."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        leader = _staff_from_request(request)
        if not leader or leader.role not in LEADERSHIP_ROLES:
            return Response({"error": "TPU/Director/Principal access required"}, status=403)
        if not leader.institution:
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

        department_id = data.get("department_id")
        if not department_id:
            return Response({"error": "department_id is required when adding staff institution-wide."}, status=400)
        department = Department.objects.filter(id=department_id, institution=leader.institution).first()
        if not department:
            return Response({"error": "Department not found in your institution."}, status=400)

        if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
            return Response({"error": "A staff member with this Faculty ID already exists."}, status=400)

        staff = StaffProfile.objects.create(
            faculty_id=faculty_id,
            name=name,
            role=role,
            department=department,
            institution=leader.institution,
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


class LeadershipManageStaffDetailView(APIView):
    """Edit or delete any staff member institution-wide (TPU/Director/
    Principal only) — looked up by faculty_id + institution rather than by
    department, since these roles aren't scoped to one department."""
    permission_classes = [IsAuthenticated]

    def _find_target(self, leader, faculty_id):
        return StaffProfile.objects.filter(faculty_id=faculty_id, institution=leader.institution).first()

    def put(self, request, faculty_id):
        leader = _staff_from_request(request)
        if not leader or leader.role not in LEADERSHIP_ROLES:
            return Response({"error": "TPU/Director/Principal access required"}, status=403)

        target = self._find_target(leader, faculty_id)
        if not target:
            return Response({"error": "Staff not found in your institution"}, status=404)

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
        leader = _staff_from_request(request)
        if not leader or leader.role not in LEADERSHIP_ROLES:
            return Response({"error": "TPU/Director/Principal access required"}, status=403)

        target = self._find_target(leader, faculty_id)
        if not target:
            return Response({"error": "Staff not found in your institution"}, status=404)

        if target.id == leader.id:
            return Response({"error": "You cannot delete your own account."}, status=400)

        account = target.account
        if account:
            account.delete()  # cascades to the StaffProfile
        else:
            target.delete()
        return Response({"message": "Staff deleted"})
