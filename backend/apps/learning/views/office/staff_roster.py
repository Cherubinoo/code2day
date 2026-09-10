"""Office Admin: institution-wide staff roster management.

A dedicated role whose whole job is to add staff, search them, assign each to
a department and assign each a role — institution-wide. No other admin powers.
See _office_guard in .._shared (mirrors _ja_guard)."""
from .._imports import *
from .._shared import *


# Every role an office admin may assign — everything except the System Admin.
_OFFICE_ASSIGNABLE_ROLES = [
    key for key, _ in StaffProfile.ROLE_CHOICES if key != "admin"
]


def _serialize_office_staff(s):
    return {
        "id": s.id,
        "faculty_id": s.faculty_id,
        "name": s.name,
        "email": s.email,
        "mobile_number": s.mobile_number,
        "role": s.role,
        "role_display": s.get_role_display(),
        "is_active": s.is_active,
        "department__id": s.department_id,
        "department__name": s.department.name if s.department else None,
        "department__code": s.department.code if s.department else None,
    }


class OfficeStaffRosterView(APIView):
    """GET  /api/office/staff/?q=   — every staff member in the caller's institution
    POST /api/office/staff/        — create a staff member in the caller's institution
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _office_guard(request)
        if err:
            return err

        q = (request.query_params.get('q') or '').strip()
        staff = StaffProfile.objects.filter(
            institution=profile.institution,
        ).select_related('department').order_by('name')
        if q:
            staff = staff.filter(Q(faculty_id__icontains=q) | Q(name__icontains=q))

        departments = list(
            Department.objects.filter(institution=profile.institution)
            .order_by('name')
            .values('id', 'name', 'code')
        )

        return Response({
            "staff": [_serialize_office_staff(s) for s in staff],
            "departments": departments,
            "assignable_roles": [
                {"value": r, "label": dict(StaffProfile.ROLE_CHOICES)[r]}
                for r in _OFFICE_ASSIGNABLE_ROLES
            ],
        })

    def post(self, request):
        profile, err = _office_guard(request)
        if err:
            return err

        faculty_id = (request.data.get('faculty_id') or '').strip()
        name = (request.data.get('name') or '').strip()
        email = (request.data.get('email') or '').strip()
        mobile_number = (request.data.get('mobile_number') or '').strip()
        role = request.data.get('role', 'staff')
        dept_id = request.data.get('department_id') or request.data.get('dept_id')

        if not faculty_id or not name:
            return Response({"detail": "faculty_id and name are required."}, status=status.HTTP_400_BAD_REQUEST)

        if role not in _OFFICE_ASSIGNABLE_ROLES:
            return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)

        if StaffProfile.objects.filter(faculty_id=faculty_id).exists():
            return Response(
                {"detail": "A staff member with this faculty ID already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        department = None
        if dept_id:
            try:
                department = Department.objects.get(id=dept_id, institution=profile.institution)
            except Department.DoesNotExist:
                return Response({"detail": "Department not found in your institution."}, status=status.HTTP_404_NOT_FOUND)

        staff = StaffProfile.objects.create(
            faculty_id=faculty_id,
            name=name,
            email=email,
            mobile_number=mobile_number,
            role=role,
            department=department,
            institution=profile.institution,
        )
        logger.info("Office admin %s created staff %s (%s)", profile.faculty_id, staff.faculty_id, role)
        return Response({
            "detail": "Staff created successfully.",
            "staff": _serialize_office_staff(staff),
        }, status=status.HTTP_201_CREATED)


class OfficeStaffDetailView(APIView):
    """PATCH  /api/office/staff/<faculty_id>/  — reassign department / role / activation / details
    DELETE /api/office/staff/<faculty_id>/  — remove a staff member
    """
    permission_classes = [IsAuthenticated]

    def _lookup(self, profile, faculty_id):
        try:
            staff = StaffProfile.objects.select_related('department').get(
                faculty_id=faculty_id, institution=profile.institution,
            )
        except StaffProfile.DoesNotExist:
            return None, Response({"detail": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)
        if staff.role == "admin":
            return None, Response({"detail": "Cannot modify a System Admin account."}, status=status.HTTP_403_FORBIDDEN)
        if staff.id == profile.id:
            return None, Response({"detail": "You cannot modify your own account here."}, status=status.HTTP_403_FORBIDDEN)
        return staff, None

    def patch(self, request, faculty_id):
        profile, err = _office_guard(request)
        if err:
            return err
        staff, err = self._lookup(profile, faculty_id)
        if err:
            return err

        update_fields = []

        if 'department_id' in request.data or 'dept_id' in request.data:
            dept_id = request.data.get('department_id') or request.data.get('dept_id')
            if dept_id:
                try:
                    staff.department = Department.objects.get(id=dept_id, institution=profile.institution)
                except Department.DoesNotExist:
                    return Response({"detail": "Department not found in your institution."}, status=status.HTTP_404_NOT_FOUND)
            else:
                staff.department = None
            update_fields.append('department')

        if 'role' in request.data:
            role = request.data.get('role')
            if role not in _OFFICE_ASSIGNABLE_ROLES:
                return Response({"detail": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
            staff.role = role
            update_fields.append('role')

        if 'is_active' in request.data:
            staff.is_active = bool(request.data.get('is_active'))
            update_fields.append('is_active')

        if 'name' in request.data:
            name = (request.data.get('name') or '').strip()
            if not name:
                return Response({"detail": "Name cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
            staff.name = name
            update_fields.append('name')

        if 'email' in request.data:
            staff.email = (request.data.get('email') or '').strip()
            update_fields.append('email')

        if 'mobile_number' in request.data:
            staff.mobile_number = (request.data.get('mobile_number') or '').strip()
            update_fields.append('mobile_number')

        if not update_fields:
            return Response({"detail": "Nothing to update."}, status=status.HTTP_400_BAD_REQUEST)

        staff.save(update_fields=update_fields)
        logger.info(
            "Office admin %s updated staff %s (%s)",
            profile.faculty_id, staff.faculty_id, ", ".join(update_fields),
        )
        staff = StaffProfile.objects.select_related('department').get(id=staff.id)
        return Response({"detail": "Staff updated.", "staff": _serialize_office_staff(staff)})

    def delete(self, request, faculty_id):
        profile, err = _office_guard(request)
        if err:
            return err
        staff, err = self._lookup(profile, faculty_id)
        if err:
            return err

        label = staff.faculty_id
        account = staff.account
        if account:
            account.delete()  # cascades to the StaffProfile
        else:
            staff.delete()
        logger.info("Office admin %s deleted staff %s", profile.faculty_id, label)
        return Response({"detail": "Staff deleted."})
