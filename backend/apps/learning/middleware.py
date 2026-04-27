from django.http import JsonResponse
from .models import SystemConfiguration, Institution, StudentProfile, StaffProfile

class MaintenanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Skip for admin and auth endpoints
        if request.path.startswith('/admin/') or '/auth/' in request.path or '/api/admin/' in request.path:
            return self.get_response(request)

        user = request.user
        if not user.is_authenticated:
            return self.get_response(request)

        # Get Global Config
        config, _ = SystemConfiguration.objects.get_or_create(id=1)
        
        # Check roles
        role = None
        institution = None

        if hasattr(user, 'student_profile'):
            role = 'student'
            institution = user.student_profile.institution
        elif hasattr(user, 'staff_profile'):
            role = user.staff_profile.role # staff, hod, admin
            institution = user.staff_profile.institution

        if not role:
            return self.get_response(request)

        # 1. Check Global Maintenance
        if role == 'student' and config.global_maintenance_students:
            return self.maintenance_response("System-wide student portal maintenance.")
        if role == 'staff' and config.global_maintenance_staff:
            return self.maintenance_response("System-wide staff portal maintenance.")
        if role == 'hod' and config.global_maintenance_hod:
            return self.maintenance_response("System-wide HOD portal maintenance.")

        # 2. Check Institution Maintenance
        if institution:
            if role == 'student' and institution.maintenance_students:
                return self.maintenance_response(f"{institution.name} student portal maintenance.")
            if role == 'staff' and institution.maintenance_staff:
                return self.maintenance_response(f"{institution.name} staff portal maintenance.")
            if role == 'hod' and institution.maintenance_hod:
                return self.maintenance_response(f"{institution.name} HOD portal maintenance.")
            if role == 'admin' and institution.maintenance_inst_admin:
                return self.maintenance_response(f"{institution.name} Institution Admin portal maintenance.")
            if role == 'ja' and institution.maintenance_ja:
                return self.maintenance_response(f"{institution.name} JA portal maintenance.")

        return self.get_response(request)

    def maintenance_response(self, message):
        return JsonResponse({
            "error": "maintenance",
            "message": message
        }, status=503)
