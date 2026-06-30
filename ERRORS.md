# Error Reference — RamCoad Platform

This document catalogs every error class, HTTP status code, and error response format used across the backend. Use it to debug production issues, write frontend error handlers, and understand what each failure means.

---

## 1. Response Formats

All API errors follow one of two shapes:

```json
{ "detail": "Human-readable message." }
```

```json
{ "error": "Human-readable message." }
```

> **Preferred format is `detail`.** Some older views return `error` — new views always use `detail`. Frontend handlers should check both keys.

---

## 2. HTTP Status Code Reference

| Code | Meaning | Common causes |
|------|---------|---------------|
| `200 OK` | Success | Read / update succeeded |
| `201 Created` | Resource created | Student, submission, contest created |
| `400 Bad Request` | Invalid input | Missing field, wrong type, business rule violation |
| `401 Unauthorized` | Not authenticated | Missing or expired session cookie |
| `403 Forbidden` | Wrong role or scope | Staff acting as student, wrong department/institution |
| `404 Not Found` | Resource absent | Deleted or non-existent record |
| `429 Too Many Requests` | Rate limited | Login attempts, code-run flood |
| `500 Internal Server Error` | Unhandled exception | DB failure, helper crash — always logged |

---

## 3. Authentication Errors

### 3.1 Student Login (`POST /api/auth/login/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Register number not found | `400` | `{"detail": "Student not found."}` |
| Account locked | `403` | `{"detail": "Account is locked. Contact your administrator."}` |
| Wrong password | `400` | `{"detail": "Invalid credentials."}` |
| Rate limit exceeded (≥5 failed attempts / minute) | `429` | `{"detail": "Too many attempts. Try again later."}` |
| First-login password not set yet | `403` | `{"detail": "Please set your password on first login."}` |

### 3.2 Staff Login (`POST /api/auth/staff/login/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Faculty ID not found | `400` | `{"detail": "Staff member not found."}` |
| Account locked | `403` | `{"detail": "Account is locked."}` |
| Wrong password | `400` | `{"detail": "Invalid credentials."}` |
| Rate limit exceeded | `429` | `{"detail": "Too many attempts. Try again later."}` |

### 3.3 First Login (`POST /api/auth/first-login/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Register number absent | `400` | `{"detail": "register_number is required."}` |
| Password too short | `400` | Serializer validation detail |
| Password mismatch | `400` | `{"detail": "Passwords do not match."}` |
| Already completed | `400` | `{"detail": "First login already completed."}` |

---

## 4. Role-Guard Errors

Every protected view checks the caller's profile type. Mismatched roles return:

```json
{ "detail": "Student access required." }      // 403
{ "detail": "Staff access required." }         // 403
{ "detail": "Only HOD can approve contests." } // 403
{ "detail": "Access denied." }                 // 403 (generic)
```

---

## 5. Resource Errors

| Pattern | Status | Example message |
|---------|--------|-----------------|
| Object not in DB | `404` | `{"detail": "Contest not found."}` |
| Cross-institution access | `403` | `{"detail": "You can only view students in your institution."}` |
| Cross-department access | `403` | `{"detail": "You can only approve contests in your department."}` |

---

## 6. View-Specific Errors

### 6.1 UpdateTrackedCompaniesView (`POST /api/dashboard/tracked-companies/`)

| Scenario | Status | Response |
|----------|--------|----------|
| `companies` not a list | `400` | `{"detail": "Companies must be a list."}` |
| DB save failed | `500` | `{"detail": "Failed to update tracked companies. Please try again."}` |

---

### 6.2 ProblemProgressUpdateView (`POST /api/problems/progress/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Invalid serializer data | `400` | Serializer field errors |
| Problem slug not found | `404` | `{"detail": "Problem not found."}` |
| DB create failed (Submission / Notification / Activity) | `500` | `{"detail": "Failed to save progress. Please try again."}` |

---

### 6.3 AptitudeContestSubmitView (`POST /api/student/contests/<id>/aptitude/submit/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a student | `403` | `{"detail": "Student access required."}` |
| Contest not found / not assigned | `404` | `{"detail": "Contest not found or not accessible."}` |
| Contest not active | `400` | `{"detail": "Contest is not active."}` |
| Question not in contest | `404` | `{"detail": "Question not found in this contest."}` |
| DB failure (update_or_create, get_or_create, aggregate) | `500` | `{"detail": "Failed to record your answer. Please try again."}` |

---

### 6.4 StudentContestStartView (`POST /api/student/contests/<id>/start/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a student | `403` | `{"detail": "Student access required."}` |
| Contest not found / not assigned | `404` | `{"detail": "Contest not found or not accessible."}` |
| Contest upcoming (not started) | `400` | `{"detail": "Contest access has not started yet."}` |
| Contest ended | `400` | `{"detail": "Contest access has ended. No new participants allowed."}` |
| Session already active | `200` | Returns existing participation details |
| Session expired → auto-submitted | `400` | `{"detail": "Your session has expired. Contest has been auto-submitted."}` |
| Race-condition duplicate create | `400` | `{"detail": "Student with register number '...' already exists."}` |
| DB create failure | `500` | `{"detail": "Failed to start contest session. Please try again."}` |

---

### 6.5 StudentContestAutoSubmitView (`POST /api/student/contests/<id>/auto-submit/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a student | `403` | `{"detail": "Student access required."}` |
| No active participation found | `404` | `{"detail": "No active participation found."}` |
| Session not yet expired | `400` | `{"detail": "Session has not expired yet."}` |
| DB failure during end / score calculation | `500` | `{"detail": "Failed to auto-submit contest. Please contact support."}` |

---

### 6.6 ContestPublishView (`POST /api/contests/<id>/publish/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not staff | `403` | `{"detail": "Staff access required."}` |
| Contest not found | `404` | `{"detail": "Contest not found."}` |
| Wrong department (HOD) | `403` | `{"detail": "You can only publish contests in your department."}` |
| Not contest creator (staff) | `403` | `{"detail": "You can only publish your own contests."}` |
| Contest not approved | `400` | `{"detail": "Only approved contests can be published."}` |
| publish_contest_helper failure | `500` | `{"detail": "Failed to publish contest. Please try again."}` |

---

### 6.7 ContestApprovalView (`POST /api/contests/<id>/approve/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not staff | `403` | `{"detail": "Staff access required."}` |
| Not HOD | `403` | `{"detail": "Only HOD can approve contests."}` |
| Contest not found | `404` | `{"detail": "Contest not found."}` |
| Wrong department | `403` | `{"detail": "You can only approve contests in your department."}` |
| Invalid `action` value | `400` | `{"detail": "Invalid action. Use 'approve' or 'reject'."}` |
| approve / reject DB failure | `500` | `{"detail": "Failed to approve/reject contest. Please try again."}` |

---

### 6.8 JAStudentCreateView (`POST /api/ja/students/create/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a JA | `403` | `{"detail": "JA access required."}` |
| Missing register_number or name | `400` | `{"detail": "register_number and name are required."}` |
| Register number already exists | `400` | `{"detail": "Student with register number '...' already exists."}` |
| Race-condition IntegrityError on create | `400` | `{"detail": "Student with register number '...' already exists."}` |
| DB failure (User or StudentProfile create) | `500` | `{"detail": "Failed to create student. Please try again."}` |

---

### 6.9 JAMentorAssignView (`POST /api/ja/mentors/assign/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a JA | `403` | `{"detail": "JA access required."}` |
| Missing register_numbers list | `400` | `{"detail": "register_numbers list is required."}` |
| No valid register numbers | `400` | `{"detail": "No valid register numbers provided."}` |
| Mentor staff ID not found | `404` | `{"detail": "Staff member not found."}` |
| DB bulk-update failure | `500` | `{"detail": "Failed to update mentor assignment. Please try again."}` |
| 0 students matched | `400` | `{"detail": "No matching students found. They may not belong to your department."}` |

---

### 6.10 StudentIndividualAnalyticsView (`GET /api/students/<register_number>/analytics/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not staff | `403` | `{"detail": "Staff access required."}` |
| Student not found | `404` | `{"detail": "Student not found."}` |
| Cross-institution | `403` | `{"detail": "You can only view students in your institution."}` |
| topic_accuracy query failure | graceful | `topic_accuracy: []` (partial data, no 500) |
| Final response serialisation failure | `500` | `{"detail": "Failed to load analytics. Please try again."}` |

---

### 6.11 StudentSelfAnalyticsView (`GET /api/student/analytics/`)

| Scenario | Status | Response |
|----------|--------|----------|
| Not a student | `403` | `{"detail": "Student access required."}` |
| topic_accuracy query failure | graceful | `topic_accuracy: []` (partial data) |
| Final response serialisation failure | `500` | `{"detail": "Failed to load analytics. Please try again."}` |

---

## 7. Code Execution Errors

These originate from `backend/apps/learning/services/executor.py`.

### Exception Hierarchy

```
ExecutorError (base)
├── ExecutorTimeoutError   — Judge0 job timed out
└── ExecutorServiceError   — Judge0 unreachable / returned unexpected status
```

### ExecutorSubmitView (`POST /api/executor/submit/`)

| Exception | Status | Response |
|-----------|--------|----------|
| `ExecutorTimeoutError` | `408` | `{"detail": "Execution timed out."}` |
| `ExecutorServiceError` | `503` | `{"detail": "Code execution service unavailable."}` |
| Generic exception | `500` | `{"detail": "Execution failed."}` |

---

## 8. Rate Limiting

Implemented in `auth_utils.py` via `RateLimitExceeded`.

- **Threshold**: 5 failed login attempts per minute per IP
- **Exception class**: `RateLimitExceeded`
- **Response**: `HTTP 429` with `{"detail": "Too many attempts. Try again later."}`
- **Resets**: automatically after the sliding window expires

---

## 9. Logging

All `500` errors are logged at `ERROR` level with full tracebacks via:

```python
logger.exception("Context message with %s identifiers", value)
```

Log entries include:
- The view / action that failed
- The user or resource identifier (register number, faculty ID, contest ID)
- The full exception traceback

**Log location**: configured in `settings.py` — typically `django.log` in the project root or captured by the process supervisor (Gunicorn / systemd).

To find all logged 500s:

```bash
grep "ERROR" django.log | grep "views"
```

---

## 10. Frontend Error Handling Checklist

When consuming an API response in React:

```js
const res = await fetch('/api/...');
if (!res.ok) {
  const body = await res.json().catch(() => ({}));
  const msg = body.detail || body.error || 'Something went wrong. Please try again.';
  // show msg to user
  return;
}
```

| Status | UX action |
|--------|-----------|
| `400` | Show the `detail` message inline (user error) |
| `401` | Redirect to login |
| `403` | Show "Access denied" toast; do not redirect |
| `404` | Show "Not found" inline |
| `429` | Show cooldown timer |
| `500` | Show generic "Something went wrong" toast; log to console |

---

## 11. Adding a New Endpoint — Error Checklist

When writing a new API view, ensure:

- [ ] Role guard at the top (`hasattr(request.user, 'student_profile')` etc.)
- [ ] `404` check for any `.first()` lookup before using the result
- [ ] `try/except IntegrityError` around any `objects.create()` that could violate a unique constraint
- [ ] `try/except Exception` around any DB write path with a `logger.exception(...)` call and a `500` response
- [ ] Responses use `{"detail": "..."}` (not `{"error": "..."}`)
- [ ] Sensitive fields (passwords, tokens, personal emails) are never included in error bodies
