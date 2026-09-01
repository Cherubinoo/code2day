from django.http import JsonResponse
from .models import SystemConfiguration, Institution, StudentProfile, StaffProfile
from .module_registry import locked_module_for_request

class MaintenanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    # Public/pre-login endpoints that must stay reachable regardless of
    # maintenance mode (e.g. the login screen requires these).
    EXEMPT_PATHS = ('/api/institutions/', '/api/institutions', '/api/csrf-token/', '/api/csrf-token')

    def __call__(self, request):
        path = request.path.rstrip('/')
        # Skip for admin, auth, and always-public endpoints
        if (request.path.startswith('/admin/') or '/auth/' in request.path 
                or '/api/admin/' in request.path or request.path in self.EXEMPT_PATHS
                or path in ('/api/institutions', '/api/csrf-token')):
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

        # 1. Check Global Maintenance — one flag per role, covering every
        # StudentProfile/StaffProfile role (student, staff, hod, tpu,
        # director, ja, admin). Admin endpoints are already skipped at the
        # top of this middleware (/api/admin/), so a global admin flag can't
        # lock system admins out of the one place that could undo it.
        global_role_labels = {
            'student': 'student',
            'staff': 'staff',
            'hod': 'HOD',
            'tpu': 'TPU',
            'director': 'Director',
            'ja': 'JA',
            'admin': 'admin',
        }
        global_role_fields = {
            'student': 'global_maintenance_students',
            'staff': 'global_maintenance_staff',
            'hod': 'global_maintenance_hod',
            'tpu': 'global_maintenance_tpu',
            'director': 'global_maintenance_director',
            'ja': 'global_maintenance_ja',
            'admin': 'global_maintenance_admin',
        }
        global_field = global_role_fields.get(role)
        if global_field and getattr(config, global_field, False):
            return self.maintenance_response(f"System-wide {global_role_labels[role]} portal maintenance.")

        # 2. Check Institution Maintenance
        if institution:
            inst_role_fields = {
                'student': 'maintenance_students',
                'staff': 'maintenance_staff',
                'hod': 'maintenance_hod',
                'tpu': 'maintenance_tpu',
                'director': 'maintenance_director',
                'admin': 'maintenance_inst_admin',
                'ja': 'maintenance_ja',
            }
            field = inst_role_fields.get(role)
            if field and getattr(institution, field, False):
                return self.maintenance_response(f"{institution.name} {global_role_labels.get(role, role)} portal maintenance.")

        # 3. Check Module Lock — institution-wide, blocks every role alike
        # (unlike maintenance above, which is per-role). Admin ('admin' role,
        # already exempted above via the /api/admin/ path check) always keeps
        # access so the lock can be lifted again.
        if institution and institution.locked_modules:
            hit = locked_module_for_request(request, institution.locked_modules)
            if hit:
                module_key, label = hit
                return JsonResponse({
                    "error": "module_locked",
                    "module": module_key,
                    "message": f"{label} is currently unavailable for {institution.name}.",
                }, status=403)

        return self.get_response(request)

    def maintenance_response(self, message):
        return JsonResponse({
            "error": "maintenance",
            "message": message
        }, status=503)
