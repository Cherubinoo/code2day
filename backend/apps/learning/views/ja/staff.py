"""Views extracted from the original monolithic apps/learning/views.py
(module: ja/staff). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class JAStaffListView(APIView):
    """JA: list all active staff in their department (for advisor/mentor assignment)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        staff = StaffProfile.objects.filter(
            institution=profile.institution,
            department=profile.department,
            is_active=True,
        ).order_by('name')

        data = [
            {
                "id": s.id,
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
            }
            for s in staff
        ]
        return Response({"staff": data})

# Roles a JA is allowed to assign a staff member into.
_JA_ASSIGNABLE_ROLES = {"staff", "hod", "academics"}


class JAStaffSearchView(APIView):
    """JA: search every staff member in the institution (not just the JA's
    department) by faculty id / name, for the department-assignment screen.
    GET /api/ja/staff/all/?q=
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        q = (request.query_params.get('q') or '').strip()
        staff = StaffProfile.objects.filter(
            institution=profile.institution,
        ).exclude(role="admin").select_related('department').order_by('name')
        if q:
            staff = staff.filter(Q(faculty_id__icontains=q) | Q(name__icontains=q))
        staff = staff[:100]

        data = [
            {
                "id": s.id,
                "faculty_id": s.faculty_id,
                "name": s.name,
                "role": s.role,
                "role_display": s.get_role_display(),
                "department__name": s.department.name if s.department else None,
                "is_active": s.is_active,
                "in_my_department": s.department_id == profile.department_id,
            }
            for s in staff
        ]
        return Response({
            "staff": data,
            "my_department": profile.department.name if profile.department else None,
            "assignable_roles": [
                {"value": r, "label": dict(StaffProfile.ROLE_CHOICES)[r]}
                for r in ("staff", "hod", "academics")
            ],
        })


class JAStaffAssignView(APIView):
    """JA: assign a staff member into the JA's OWN department and optionally set
    a role. The department is always forced to the JA's department — never taken
    from the payload.
    POST /api/ja/staff/assign/   body: { faculty_id, role? }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        faculty_id = (request.data.get('faculty_id') or '').strip()
        role = request.data.get('role')

        if not faculty_id:
            return Response({"detail": "faculty_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            staff = StaffProfile.objects.select_related('department').get(
                faculty_id=faculty_id, institution=profile.institution,
            )
        except StaffProfile.DoesNotExist:
            return Response({"detail": "Staff member not found in your institution."}, status=status.HTTP_404_NOT_FOUND)

        if staff.role == "admin":
            return Response({"detail": "Cannot reassign a System Admin account."}, status=status.HTTP_403_FORBIDDEN)

        update_fields = ['department']
        staff.department = profile.department  # forced — JA's own department

        if role is not None and role != "":
            if role not in _JA_ASSIGNABLE_ROLES:
                return Response(
                    {"detail": "You can only assign the Staff, HOD or Academic Coordinator roles."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            staff.role = role
            update_fields.append('role')

        staff.save(update_fields=update_fields)
        logger.info(
            "JA %s assigned staff %s to department %s%s",
            profile.faculty_id, staff.faculty_id, profile.department,
            f" as {role}" if 'role' in update_fields else "",
        )
        return Response({
            "detail": f"{staff.name} assigned to {profile.department}.",
            "staff": {
                "id": staff.id,
                "faculty_id": staff.faculty_id,
                "name": staff.name,
                "role": staff.role,
                "role_display": staff.get_role_display(),
                "department__name": staff.department.name if staff.department else None,
            },
        })


class JABatchAdvisorView(APIView):
    """
    JA: get or set the class advisor for a batch section.
    GET  /api/ja/advisors/           → flat list of all batch+section→advisor rows
    POST /api/ja/advisors/           → assign/update advisor for a batch+section
         body: { batch, section, advisor_id }
    """
    permission_classes = [IsAuthenticated]

    SECTIONS = ["A", "B", "C"]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        # All existing advisor assignments
        assignments = BatchAdvisor.objects.filter(
            department=profile.department,
        ).select_related('advisor', 'assigned_by')
        advisor_map = {}  # (batch, section) → assignment obj
        for a in assignments:
            advisor_map[(a.batch, a.section)] = a

        # All batches that have students
        all_batches = list(
            StudentProfile.objects
            .filter(institution=profile.institution, department=profile.department)
            .exclude(batch='')
            .values_list('batch', flat=True)
            .distinct()
            .order_by('batch')
        )

        data = []
        for batch in all_batches:
            for section in self.SECTIONS:
                student_count = StudentProfile.objects.filter(
                    institution=profile.institution,
                    department=profile.department,
                    batch=batch,
                    section=section,
                ).count()
                a = advisor_map.get((batch, section))
                data.append({
                    "batch": batch,
                    "section": section,
                    "student_count": student_count,
                    "advisor": {
                        "id": a.advisor.id,
                        "faculty_id": a.advisor.faculty_id,
                        "name": a.advisor.name,
                        "role": a.advisor.role,
                    } if a else None,
                    "assigned_at": a.assigned_at.isoformat() if a else None,
                    "assigned_by": a.assigned_by.name if (a and a.assigned_by) else None,
                })

        return Response({"assignments": data})

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        batch = (request.data.get('batch') or '').strip()
        section = (request.data.get('section') or '').strip().upper()
        advisor_id = request.data.get('advisor_id')

        if not batch:
            return Response({"detail": "batch is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not section:
            return Response({"detail": "section is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not advisor_id:
            return Response({"detail": "advisor_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            advisor = StaffProfile.objects.get(id=advisor_id, institution=profile.institution)
        except StaffProfile.DoesNotExist:
            return Response({"detail": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)

        assignment, created = BatchAdvisor.objects.update_or_create(
            batch=batch,
            section=section,
            department=profile.department,
            defaults={"advisor": advisor, "assigned_by": profile},
        )

        action = "assigned" if created else "updated"
        logger.info(
            "JA %s %s class advisor %s to batch %s section %s",
            profile.faculty_id, action, advisor.faculty_id, batch, section
        )

        return Response({
            "detail": f"Class advisor {action} for batch '{batch}' section '{section}'.",
            "batch": batch,
            "section": section,
            "advisor": {"id": advisor.id, "faculty_id": advisor.faculty_id, "name": advisor.name},
        }, status=status.HTTP_200_OK)

class JABatchAdvisorDeleteView(APIView):
    """JA: remove a class advisor assignment for a batch+section.
    DELETE /api/ja/advisors/<batch_code>/?section=A
    """
    permission_classes = [IsAuthenticated]

    def delete(self, request, batch_code):
        profile, err = _ja_guard(request)
        if err:
            return err

        section = (request.query_params.get('section') or '').strip().upper()

        qs = BatchAdvisor.objects.filter(batch=batch_code, department=profile.department)
        if section:
            qs = qs.filter(section=section)

        deleted, _ = qs.delete()

        if not deleted:
            return Response({"detail": "No advisor assignment found."}, status=status.HTTP_404_NOT_FOUND)

        label = f"batch '{batch_code}' section '{section}'" if section else f"batch '{batch_code}'"
        return Response({"detail": f"Advisor removed from {label}."})

class JAMentorAssignView(APIView):
    """
    JA: assign or remove a mentor for one or more students.
    POST /api/ja/mentors/assign/
    body: { mentor_id: int|null, register_numbers: [str, ...] }
    - mentor_id null → remove mentor
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        mentor_id = request.data.get('mentor_id')  # None = unassign
        register_numbers = request.data.get('register_numbers', [])

        if not register_numbers:
            return Response({"detail": "register_numbers list is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Strip None/empty values that can't match a register_number
        valid_reg_numbers = [r for r in register_numbers if r]
        if not valid_reg_numbers:
            return Response({"detail": "No valid register numbers provided."}, status=status.HTTP_400_BAD_REQUEST)

        mentor = None
        if mentor_id:
            try:
                mentor = StaffProfile.objects.get(id=mentor_id, institution=profile.institution)
            except StaffProfile.DoesNotExist:
                return Response({"detail": "Staff member not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            updated = StudentProfile.objects.filter(
                register_number__in=valid_reg_numbers,
                institution=profile.institution,
                department=profile.department,
            ).update(mentor=mentor)
        except Exception:
            logger.exception("Failed to update mentor assignment for JA %s", profile.faculty_id)
            return Response(
                {"detail": "Failed to update mentor assignment. Please try again."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if updated == 0:
            return Response(
                {"detail": "No matching students found. They may not belong to your department."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        action = f"assigned mentor {mentor.name}" if mentor else "removed mentor"
        logger.info("JA %s %s for %d students", profile.faculty_id, action, updated)

        return Response({
            "detail": f"{action.capitalize()} for {updated} student(s).",
            "updated": updated,
        })

class JAMentorListView(APIView):
    """JA: list all mentor assignments in the department."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, err = _ja_guard(request)
        if err:
            return err

        # Group students by mentor
        batch_filter = (request.query_params.get('batch') or '').strip()
        qs = StudentProfile.objects.filter(institution=profile.institution, department=profile.department)
        if batch_filter:
            qs = qs.filter(batch=batch_filter)
        students = qs.select_related('mentor').order_by('batch', 'register_number')

        mentor_map = {}  # mentor_id → { mentor_info, students }
        unassigned = []

        for s in students:
            if s.mentor_id:
                if s.mentor_id not in mentor_map:
                    m = s.mentor
                    mentor_map[s.mentor_id] = {
                        "mentor": {
                            "id": m.id,
                            "faculty_id": m.faculty_id,
                            "name": m.name,
                            "role": m.role,
                        },
                        "students": [],
                    }
                mentor_map[s.mentor_id]["students"].append({
                    "id": s.id,
                    "register_number": s.register_number,
                    "name": s.name,
                    "batch": s.batch,
                    "section": s.section,
                })
            else:
                unassigned.append({
                    "id": s.id,
                    "register_number": s.register_number,
                    "name": s.name,
                    "batch": s.batch,
                    "section": s.section,
                })

        return Response({
            "mentor_groups": list(mentor_map.values()),
            "unassigned": unassigned,
            "unassigned_count": len(unassigned),
        })

