"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/labs). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class HODLabAssignmentView(APIView):
    """HOD: list assignments for own department / create new assignment."""

    def _get_hod(self, request):
        staff = _staff_from_request(request)
        if not staff or staff.role not in ("hod", "academics", "admin"):
            return None
        return staff

    def get(self, request):
        staff = self._get_hod(request)
        if not staff:
            return Response({"error": "HOD access required"}, status=status.HTTP_403_FORBIDDEN)

        assignments = LabAssignment.objects.filter(
            department=staff.department
        ).select_related("lab_topic", "assigned_staff", "created_by").order_by("-created_at")

        data = []
        for a in assignments:
            d = _serialize_assignment(a)
            d["submission_count"] = a.submissions.values("student").distinct().count()
            data.append(d)
        return Response(data)

    def post(self, request):
        staff = self._get_hod(request)
        if not staff:
            return Response({"error": "HOD access required"}, status=status.HTTP_403_FORBIDDEN)

        topic_id       = request.data.get("topic_id")
        name           = (request.data.get("name") or "").strip()
        subject        = (request.data.get("subject") or "").strip()
        assigned_staff_id = request.data.get("assigned_staff_id")
        batch          = (request.data.get("batch") or "").strip()
        year           = (request.data.get("year") or "").strip()
        section        = (request.data.get("section") or "").strip()
        deadline_str   = (request.data.get("deadline") or "").strip()
        start_date_str = (request.data.get("start_date") or "").strip()

        if not all([topic_id, name, deadline_str]):
            return Response({"error": "topic_id, name and deadline are required"}, status=400)

        try:
            topic = LabTopic.objects.get(id=topic_id, is_active=True)
        except LabTopic.DoesNotExist:
            return Response({"error": "Topic not found"}, status=400)

        try:
            from django.utils.dateparse import parse_datetime
            deadline = parse_datetime(deadline_str)
            if not deadline:
                raise ValueError
        except (ValueError, TypeError):
            return Response({"error": "Invalid deadline format. Use ISO 8601."}, status=400)

        start_date = None
        if start_date_str:
            try:
                from django.utils.dateparse import parse_datetime as _pd
                start_date = _pd(start_date_str)
            except Exception:
                start_date = None

        assigned_staff = None
        if assigned_staff_id:
            try:
                assigned_staff = StaffProfile.objects.get(id=assigned_staff_id, department=staff.department)
            except StaffProfile.DoesNotExist:
                return Response({"error": "Staff not found in your department"}, status=400)

        assignment = LabAssignment.objects.create(
            lab_topic=topic,
            name=name,
            subject=subject,
            assigned_staff=assigned_staff,
            created_by=staff,
            department=staff.department,
            batch=batch,
            year=year,
            section=section,
            start_date=start_date,
            deadline=deadline,
        )
        return Response(_serialize_assignment(assignment), status=status.HTTP_201_CREATED)

class HODLabAssignmentDeleteView(APIView):
    """HOD: delete a lab assignment."""

    def delete(self, request, assignment_id):
        staff = _staff_from_request(request)
        if not staff or staff.role not in ("hod", "academics", "admin"):
            return Response({"error": "HOD access required"}, status=403)
        try:
            a = LabAssignment.objects.get(id=assignment_id, department=staff.department)
        except LabAssignment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
        a.delete()
        return Response({"ok": True})

class HODLabListView(APIView):
    """HOD: list/create plain "Lab Practical" and "University Lab" entries."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = _staff_from_request(request)
        labs = Lab.objects.filter(department=staff.department).select_related(
            "staff_in_charge", "created_by"
        ).prefetch_related("exercises")
        return Response([_serialize_lab_v2(lab) for lab in labs])

    def post(self, request):
        staff = _staff_from_request(request)
        data = request.data
        staff_in_charge = None
        sic_id = data.get("staff_in_charge_id")
        if sic_id:
            try:
                staff_in_charge = StaffProfile.objects.get(id=sic_id, department=staff.department)
            except StaffProfile.DoesNotExist:
                return Response({"error": "Staff not found"}, status=400)
        start = _parse_dt(data.get("start_date"))
        end = _parse_dt(data.get("end_date"))
        if not start or not end:
            return Response({"error": "Valid start_date and end_date are required"}, status=400)

        allowed_languages = data.get("allowed_languages", list(LAB_LANGUAGE_CHOICES))
        if (not isinstance(allowed_languages, list) or not allowed_languages
                or any(lang not in LAB_LANGUAGE_CHOICES for lang in allowed_languages)):
            return Response(
                {"error": f"allowed_languages must be a non-empty list from {LAB_LANGUAGE_CHOICES}"}, status=400
            )

        lab_type = data.get("lab_type", "practical")
        linked_lab = None
        linked_lab_id = data.get("linked_lab_id")
        if linked_lab_id:
            try:
                linked_lab = Lab.objects.get(id=linked_lab_id, department=staff.department)
            except Lab.DoesNotExist:
                pass

        is_univ = (lab_type == "university")
        try:
            pass_threshold_percent = max(1, min(100, int(data.get("pass_threshold_percent", 70))))
        except (TypeError, ValueError):
            pass_threshold_percent = 70
        lab = Lab.objects.create(
            name=data["name"],
            department=staff.department,
            batch=data.get("batch", ""),
            section=data.get("section", ""),
            start_date=start,
            end_date=end,
            staff_in_charge=staff_in_charge or staff,
            created_by=staff,
            lab_type=lab_type,
            approval_status="approved",
            is_published=False if lab_type == "university" else data.get("is_published", True),
            enable_tab_switch_check=bool(data.get("enable_tab_switch_check", False)) if is_univ else False,
            max_tab_switches=int(data.get("max_tab_switches", 3)) if is_univ else 3,
            enable_fullscreen_lock=bool(data.get("enable_fullscreen_lock", False)) if is_univ else False,
            enable_copy_paste_lock=bool(data.get("enable_copy_paste_lock", False)) if is_univ else False,
            pass_threshold_percent=pass_threshold_percent,
            allowed_languages=allowed_languages,
            linked_lab=linked_lab,
        )
        lab.refresh_from_db()
        return Response(_serialize_lab_v2(lab), status=201)

class HODLabDetailView(APIView):
    """HOD: edit/delete a plain "Lab Practical". See HODLabListView docstring —
    Company Based Lab Practicals are managed exclusively via the Company endpoints."""
    permission_classes = [IsAuthenticated]

    def _get(self, lab_id, staff):
        try:
            return Lab.objects.get(id=lab_id, department=staff.department)
        except Lab.DoesNotExist:
            return None

    def put(self, request, lab_id):
        staff = _staff_from_request(request)
        lab = self._get(lab_id, staff)
        if not lab:
            return Response({"error": "Not found"}, status=404)
        data = request.data
        is_univ = (lab.lab_type == "university")
        for field in ("name", "batch", "section", "is_active"):
            if field in data:
                setattr(lab, field, data[field])
        if is_univ:
            for field in ("enable_tab_switch_check", "max_tab_switches", "enable_fullscreen_lock", "enable_copy_paste_lock"):
                if field in data:
                    setattr(lab, field, data[field])
        else:
            lab.enable_tab_switch_check = False
            lab.enable_fullscreen_lock = False
            lab.enable_copy_paste_lock = False
        if "pass_threshold_percent" in data:
            try:
                lab.pass_threshold_percent = max(1, min(100, int(data["pass_threshold_percent"])))
            except (TypeError, ValueError):
                pass
        if "linked_lab_id" in data:
            linked_lab_id = data["linked_lab_id"]
            if linked_lab_id:
                try:
                    lab.linked_lab = Lab.objects.get(id=linked_lab_id, department=staff.department)
                except Lab.DoesNotExist:
                    lab.linked_lab = None
            else:
                lab.linked_lab = None
        if "start_date" in data:
            lab.start_date = _parse_dt(data["start_date"]) or lab.start_date
        if "end_date" in data:
            lab.end_date = _parse_dt(data["end_date"]) or lab.end_date
        if "staff_in_charge_id" in data:
            sic_id = data["staff_in_charge_id"]
            if sic_id:
                try:
                    lab.staff_in_charge = StaffProfile.objects.get(id=sic_id, department=staff.department)
                except StaffProfile.DoesNotExist:
                    return Response({"error": "Staff not found"}, status=400)
            else:
                lab.staff_in_charge = None

        if "allowed_languages" in data:
            allowed_languages = data["allowed_languages"]
            if (not isinstance(allowed_languages, list) or not allowed_languages
                    or any(lang not in LAB_LANGUAGE_CHOICES for lang in allowed_languages)):
                return Response(
                    {"error": f"allowed_languages must be a non-empty list from {LAB_LANGUAGE_CHOICES}"}, status=400
                )
            lab.allowed_languages = allowed_languages

        lab.save()
        return Response(_serialize_lab_v2(lab))

    def delete(self, request, lab_id):
        staff = _staff_from_request(request)
        lab = self._get(lab_id, staff)
        if not lab:
            return Response({"error": "Not found"}, status=404)
        lab.delete()
        return Response(status=204)

class HODLabApproveView(APIView):
    """HOD / Academic Coordinator: Approve a pending University Lab practical."""
    permission_classes = [IsAuthenticated]

    def post(self, request, lab_id):
        staff = _staff_from_request(request)
        if not staff or not getattr(staff, 'is_hod', False):
            return Response({"error": "HOD or Academic Coordinator access required"}, status=403)
        try:
            if getattr(staff, "is_academic_coordinator", False):
                lab = Lab.objects.get(id=lab_id)
            else:
                lab = Lab.objects.get(id=lab_id, department=staff.department)
        except Lab.DoesNotExist:
            return Response({"error": "Lab not found"}, status=404)

        lab.approval_status = "approved"
        lab.is_published = True
        lab.save(update_fields=["approval_status", "is_published"])
        return Response({"detail": "University Lab approved successfully!", "lab": _serialize_lab_v2(lab)})

