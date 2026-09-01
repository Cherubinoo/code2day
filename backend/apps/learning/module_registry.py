"""
The set of institution-lockable "modules" — content areas that an admin can
lock/unlock per institution (see Institution.locked_modules). A locked
module is unavailable to EVERY role at that institution (student, staff,
HOD, everyone) — this is a blanket institution-wide switch, not a per-role
one. Enforced in ModuleLockMiddleware by matching request.path against
each module's api_path_prefixes; the frontend uses `key` to filter the
student nav (appData.js navItems) and each staff-side dashboard's sidebar.

`key` matches the `id` used in frontend/src/lib/appData.js's `navItems` for
every module that has a student-facing nav entry, so the same key drives
both nav-hiding and backend enforcement without a separate mapping.

Not included: "roadmaps" (no backend API — a static page, nothing to
enforce) and "progress" (reads shared analytics endpoints also used
elsewhere, no clean boundary to lock without collateral effects).
"""

MODULE_REGISTRY = [
    {
        "key": "problems",
        "label": "Coding Practice",
        "api_path_prefixes": ["/api/problems/", "/api/run/", "/api/executor/", "/api/editor/"],
    },
    {
        "key": "playground",
        "label": "Code Playground",
        "api_path_prefixes": ["/api/playground/"],
    },
    {
        "key": "labs",
        "label": "Labs",
        "api_path_prefixes": ["/api/lab/"],
    },
    {
        "key": "company",
        "label": "Companies",
        "api_path_prefixes": ["/api/hod/companies/", "/api/dashboard/tracked-companies/"],
    },
    {
        "key": "aptitude",
        "label": "Aptitude & Reading Comprehension",
        "api_path_prefixes": ["/api/aptitude/"],
    },
    {
        "key": "contest",
        "label": "Contests",
        "api_path_prefixes": ["/api/contests/", "/api/student/contests/"],
    },
    {
        "key": "discuss",
        "label": "Discuss",
        "api_path_prefixes": ["/api/discussions/"],
    },
]

MODULE_KEYS = [m["key"] for m in MODULE_REGISTRY]


def path_to_module_key(path):
    """Return the module key a request path belongs to, or None if it
    doesn't belong to any lockable module."""
    for module in MODULE_REGISTRY:
        for prefix in module["api_path_prefixes"]:
            if path.startswith(prefix):
                return module["key"]
    return None
