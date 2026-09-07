"""Views extracted from the original monolithic apps/learning/views.py
(module: hod/company). Pure code motion — see apps/learning/views/_imports.py
and _shared.py for why this split can't hit a missing-name error."""
from .._imports import *
from .._shared import *


class HODCompanyListView(APIView):
    """HOD: list/create Companies for company-based lab practicals, scoped to their
    department. A Company and its practical (Lab) are created together — one company
    is exactly one practical (batch, staff, dates, languages)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = _staff_from_request(request)
        companies = Company.objects.filter(department=staff.department).select_related("lab", "lab__staff_in_charge")
        return Response([_serialize_company_practical(c) for c in companies])

    def post(self, request):
        staff = _staff_from_request(request)
        data = request.data

        name = (data.get("name") or "").strip()
        if not name:
            return Response({"error": "Company name is required"}, status=400)
        if Company.objects.filter(department=staff.department, name__iexact=name).exists():
            return Response({"error": "A company with this name already exists"}, status=400)

        if not data.get("batch"):
            return Response({"error": "Select a batch"}, status=400)
        start = _parse_dt(data.get("start_date"))
        end = _parse_dt(data.get("end_date"))
        if not start or not end:
            return Response({"error": "Valid start_date and end_date are required"}, status=400)

        staff_in_charge = None
        sic_id = data.get("staff_in_charge_id")
        if sic_id:
            try:
                staff_in_charge = StaffProfile.objects.get(id=sic_id, department=staff.department)
            except StaffProfile.DoesNotExist:
                return Response({"error": "Staff not found"}, status=400)

        allowed_languages = data.get("allowed_languages", list(LAB_LANGUAGE_CHOICES))
        if (not isinstance(allowed_languages, list) or not allowed_languages
                or any(lang not in LAB_LANGUAGE_CHOICES for lang in allowed_languages)):
            return Response(
                {"error": f"allowed_languages must be a non-empty list from {LAB_LANGUAGE_CHOICES}"}, status=400
            )

        with transaction.atomic():
            company = Company.objects.create(name=name, department=staff.department, created_by=staff)
            Lab.objects.create(
                name=f"{name} — Company Practical",
                department=staff.department,
                batch=data.get("batch", ""),
                section=data.get("section", ""),
                start_date=start,
                end_date=end,
                staff_in_charge=staff_in_charge,
                created_by=staff,
                lab_type="company",
                company=company,
                allowed_languages=allowed_languages,
            )
        company.refresh_from_db()
        return Response(_serialize_company_practical(company), status=201)

class HODCompanyDetailView(APIView):
    """HOD: edit (name + practical settings) or delete a Company, scoped to their department."""
    permission_classes = [IsAuthenticated]

    def _get(self, company_id, staff):
        try:
            return Company.objects.select_related("lab").get(id=company_id, department=staff.department)
        except Company.DoesNotExist:
            return None

    def put(self, request, company_id):
        staff = _staff_from_request(request)
        company = self._get(company_id, staff)
        if not company:
            return Response({"error": "Not found"}, status=404)
        data = request.data

        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                return Response({"error": "Company name is required"}, status=400)
            if Company.objects.filter(department=staff.department, name__iexact=name).exclude(id=company.id).exists():
                return Response({"error": "A company with this name already exists"}, status=400)
            company.name = name
            company.save(update_fields=["name"])

        lab = getattr(company, "lab", None)
        practical_fields = {"batch", "section", "start_date", "end_date", "staff_in_charge_id", "allowed_languages"}
        if lab:
            for field in ("batch", "section"):
                if field in data:
                    setattr(lab, field, data[field])
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
        elif practical_fields & set(data.keys()):
            # Legacy company created before a practical was required — create it now.
            if not data.get("batch"):
                return Response({"error": "Select a batch"}, status=400)
            start = _parse_dt(data.get("start_date"))
            end = _parse_dt(data.get("end_date"))
            if not start or not end:
                return Response({"error": "Valid start_date and end_date are required"}, status=400)
            staff_in_charge = None
            sic_id = data.get("staff_in_charge_id")
            if sic_id:
                try:
                    staff_in_charge = StaffProfile.objects.get(id=sic_id, department=staff.department)
                except StaffProfile.DoesNotExist:
                    return Response({"error": "Staff not found"}, status=400)
            allowed_languages = data.get("allowed_languages", list(LAB_LANGUAGE_CHOICES))
            if (not isinstance(allowed_languages, list) or not allowed_languages
                    or any(lang not in LAB_LANGUAGE_CHOICES for lang in allowed_languages)):
                return Response(
                    {"error": f"allowed_languages must be a non-empty list from {LAB_LANGUAGE_CHOICES}"}, status=400
                )
            Lab.objects.create(
                name=f"{company.name} — Company Practical",
                department=staff.department,
                batch=data.get("batch", ""),
                section=data.get("section", ""),
                start_date=start,
                end_date=end,
                staff_in_charge=staff_in_charge,
                created_by=staff,
                lab_type="company",
                company=company,
                allowed_languages=allowed_languages,
            )

        return Response(_serialize_company_practical(company))

    def delete(self, request, company_id):
        staff = _staff_from_request(request)
        company = self._get(company_id, staff)
        if not company:
            return Response({"error": "Not found"}, status=404)
        company.delete()
        return Response(status=204)

