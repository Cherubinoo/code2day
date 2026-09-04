"""
The set of institution-lockable "modules" — content areas that an admin can
lock/unlock per institution (see Institution.locked_modules). A locked
module is unavailable to EVERY role at that institution (student, staff,
HOD, everyone) — this is a blanket institution-wide switch, not a per-role
one.

Some modules have sub-modules that need their own independent lock (e.g.
Labs has Practical/Company/University; Contests has Coding/Aptitude/
Combined) — those share the exact same URLs and are only distinguishable
by a field on the object the URL refers to (Lab.lab_type,
Contest.contest_type), not by the URL itself. Two shapes of entry exist:

- Prefix children (e.g. Aptitude Practice vs Reading Comprehension):
  distinguished purely by request.path, matched the same way top-level
  modules are.
- Typed children (e.g. Labs' three types): distinguished by a field on
  the object whose id appears in the URL. `id_pattern` extracts that id
  from the path; `type_model`/`type_field` says which model+field to look
  up; each child's `type_value` is the value that field must equal.
- Body-field children (Playground's per-language locks): distinguished by
  a field in the POST body itself rather than anything in the URL or a
  database object — Playground is a single stateless "run this code"
  endpoint, there's no object to look up. `body_field` names the JSON key
  (language_id, not the human-readable "language" string — the id is the
  required field, "language" is optional, so keying on it would let a
  request that omits "language" slip past the lock); `body_value` is what
  it must equal.

Locking a PARENT blocks everything under it, typed/prefixed children
included, whether or not those children are individually locked —
enforced in ModuleLockMiddleware. Locking only a child leaves the rest of
the parent (and its sibling children) untouched.

`key` matches the `id` used in frontend/src/lib/appData.js's `navItems`
for every top-level module that has a student-facing nav entry, so the
same key drives both nav-hiding (App.jsx filters `navItems` by
`locked_modules` directly, independent of anything below) and backend
enforcement without a separate mapping.

Nav-only entries: "explore", "roadmaps", and "progress" have
`api_path_prefixes: []` on purpose — they have no dedicated backend
surface of their own to block (Explore and Progress render off shared
dashboard/analytics endpoints other unlocked pages also depend on, so
blocking those endpoints would lock collateral pages too; Roadmaps is a
static page with no API at all). An empty prefix list makes
`_matches_prefix` never match, so `locked_module_for_request` always
skips these — they're locked from the nav only, same as before, just
now with an actual toggle in the admin UI instead of no toggle at all.
"""

import re

MODULE_REGISTRY = [
    {
        "key": "explore",
        "label": "Explore",
        "api_path_prefixes": [],  # nav-only — see module docstring
    },
    {
        "key": "roadmaps",
        "label": "Roadmaps",
        "api_path_prefixes": [],  # nav-only — see module docstring
    },
    {
        "key": "problems",
        "label": "Coding Practice",
        "api_path_prefixes": ["/api/problems/", "/api/run/", "/api/executor/", "/api/editor/"],
    },
    {
        "key": "playground",
        "label": "Code Playground",
        "api_path_prefixes": ["/api/playground/"],
        "children": [
            {"key": "playground_c", "label": "C", "body_field": "language_id", "body_value": 50},
            {"key": "playground_cpp", "label": "C++", "body_field": "language_id", "body_value": 54},
            {"key": "playground_java", "label": "Java", "body_field": "language_id", "body_value": 62},
            {"key": "playground_python", "label": "Python", "body_field": "language_id", "body_value": 71},
            {"key": "playground_sql", "label": "SQL", "body_field": "language_id", "body_value": 82},
        ],
    },
    {
        "key": "labs",
        "label": "Labs",
        "api_path_prefixes": ["/api/lab/"],
        "children": [
            {
                "key": "labs_practical", "label": "Practical Labs",
                "id_pattern": re.compile(r"/lab/v2/(?:[a-zA-Z]+/)*?(\d+)"),
                "type_model": "Lab", "type_field": "lab_type", "type_value": "practical",
            },
            {
                "key": "labs_company", "label": "Company Labs",
                "id_pattern": re.compile(r"/lab/v2/(?:[a-zA-Z]+/)*?(\d+)"),
                "type_model": "Lab", "type_field": "lab_type", "type_value": "company",
            },
            {
                "key": "labs_university", "label": "University Labs",
                "id_pattern": re.compile(r"/lab/v2/(?:[a-zA-Z]+/)*?(\d+)"),
                "type_model": "Lab", "type_field": "lab_type", "type_value": "university",
            },
        ],
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
        "children": [
            {
                "key": "aptitude_practice", "label": "Aptitude Practice",
                "api_path_prefixes": ["/api/aptitude/topics/", "/api/aptitude/questions/"],
            },
            {
                "key": "aptitude_reading", "label": "Reading Comprehension",
                "api_path_prefixes": ["/api/aptitude/reading-passages/"],
            },
        ],
    },
    {
        "key": "contest",
        "label": "Contests",
        "api_path_prefixes": ["/api/contests/", "/api/student/contests/"],
        "children": [
            {
                "key": "contest_programming", "label": "Coding Contests",
                "id_pattern": re.compile(r"/(?:student/)?contests/(\d+)"),
                "type_model": "Contest", "type_field": "contest_type", "type_value": "programming",
            },
            {
                "key": "contest_aptitude", "label": "Aptitude Contests",
                "id_pattern": re.compile(r"/(?:student/)?contests/(\d+)"),
                "type_model": "Contest", "type_field": "contest_type", "type_value": "aptitude",
            },
            {
                "key": "contest_combined", "label": "Combined Contests",
                "id_pattern": re.compile(r"/(?:student/)?contests/(\d+)"),
                "type_model": "Contest", "type_field": "contest_type", "type_value": "combined",
            },
        ],
    },
    {
        "key": "leaderboard",
        "label": "Leaderboard",
        "api_path_prefixes": ["/api/student/leaderboard/"],
    },
    {
        "key": "discuss",
        "label": "Discuss",
        "api_path_prefixes": ["/api/discussions/"],
    },
    {
        "key": "interview",
        "label": "Interview Practice",
        "api_path_prefixes": ["/api/interview/"],
    },
    {
        "key": "competitive",
        "label": "Competitive Practice",
        "api_path_prefixes": ["/api/competitive/"],
    },
    {
        "key": "progress",
        "label": "Progress",
        "api_path_prefixes": [],  # nav-only — see module docstring
    },
]

MODULE_KEYS = [m["key"] for m in MODULE_REGISTRY] + [
    c["key"] for m in MODULE_REGISTRY for c in m.get("children", [])
]


def _matches_prefix(path, prefixes):
    return any(path.startswith(p) for p in prefixes)


def locked_module_for_request(request, locked_keys):
    """Return the (module_key, label) that should block this request given
    the institution's locked_keys, or None if nothing locks it. Checks the
    parent module first (locking it blocks every child regardless of the
    children's own lock state), then each child.
    """
    if not locked_keys:
        return None

    path = request.path
    for module in MODULE_REGISTRY:
        if not _matches_prefix(path, module["api_path_prefixes"]):
            continue

        if module["key"] in locked_keys:
            return module["key"], module["label"]

        for child in module.get("children", []):
            if "api_path_prefixes" in child:
                if _matches_prefix(path, child["api_path_prefixes"]) and child["key"] in locked_keys:
                    return child["key"], child["label"]
            elif "id_pattern" in child and child["key"] in locked_keys:
                m = child["id_pattern"].search(path)
                if not m:
                    continue
                if _object_has_type(child["type_model"], int(m.group(1)), child["type_field"], child["type_value"]):
                    return child["key"], child["label"]
            elif "body_field" in child and child["key"] in locked_keys:
                if _body_field_equals(request, child["body_field"], child["body_value"]):
                    return child["key"], child["label"]

        return None  # matched the parent's prefix but no lock applies

    return None


def _object_has_type(model_name, object_id, field, value):
    from . import models as _models
    model = getattr(_models, model_name)
    return model.objects.filter(id=object_id).values_list(field, flat=True).first() == value


def _body_field_equals(request, field, value):
    """Best-effort read of one field from a JSON POST body — used for
    modules with no URL-visible id to key off (e.g. Playground's language).
    Accessing request.body here is safe: Django caches the raw bytes on
    first read, so the view (DRF's request.data included) still sees the
    same body afterward — this doesn't consume/replace anything."""
    import json
    try:
        return json.loads(request.body or b"{}").get(field) == value
    except (ValueError, TypeError):
        return False


def serializable_registry():
    """JSON-safe view of MODULE_REGISTRY for the admin API — module entries
    carry compiled regex objects (id_pattern) internally for enforcement,
    which aren't serializable, so this strips everything down to just
    key/label/children for the frontend to render toggles from."""
    return [
        {
            "key": m["key"],
            "label": m["label"],
            "children": [{"key": c["key"], "label": c["label"]} for c in m.get("children", [])],
        }
        for m in MODULE_REGISTRY
    ]


def path_to_module_key(path):
    """Legacy helper retained for callers that only need the top-level
    module a path belongs to (used for e.g. logging), independent of lock
    state. Prefer locked_module_for_path for enforcement."""
    for module in MODULE_REGISTRY:
        if _matches_prefix(path, module["api_path_prefixes"]):
            return module["key"]
    return None
