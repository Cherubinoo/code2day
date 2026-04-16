# Contest Creation CSRF Token Fix

## Problem
Staff users were unable to create contests, receiving a **403 Forbidden** error when submitting the contest creation form.

## Root Cause
The frontend contest creator components were making POST requests to `/api/contests/` without including the **CSRF token** in the request headers.

Django's CSRF middleware was rejecting these requests because:
1. The backend has `CsrfViewMiddleware` enabled (required for security)
2. The frontend was not sending the `X-CSRFToken` header
3. The CSRF cookie exists but wasn't being read and sent with the request

## Files Fixed

### 1. `frontend/src/components/staff/EnhancedContestCreator.jsx`
**Changes:**
- Added import: `import { buildJsonPostOptions } from '../../lib/appUtils';`
- Changed fetch call from manual headers to using `buildJsonPostOptions(formData)`

**Before:**
```javascript
const res = await fetch('/api/contests/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(formData),
});
```

**After:**
```javascript
const res = await fetch('/api/contests/', buildJsonPostOptions(formData));
```

### 2. `frontend/src/components/staff/ContestCreator.jsx`
**Changes:**
- Added import: `import { buildJsonPostOptions } from '../../lib/appUtils';`
- Changed fetch call from manual headers to using `buildJsonPostOptions(formData)`

Same pattern as above.

## How It Works

The `buildJsonPostOptions` utility function (in `frontend/src/lib/appUtils.js`):
1. Reads the CSRF token from the `csrftoken` cookie
2. Includes it in the `X-CSRFToken` header
3. Sets proper `Content-Type: application/json`
4. Includes `credentials: 'include'` for session cookies
5. Stringifies the payload

```javascript
export function buildJsonPostOptions(payload) {
  const csrfToken = getCsrfToken();
  const headers = {
    "Content-Type": "application/json",
  };

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  return {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  };
}
```

## Testing
After this fix:
1. Staff users can log in
2. Navigate to contest creation
3. Fill out the form (title, problems, batches)
4. Click "Submit for Approval" or "Save as Draft"
5. Request succeeds with HTTP 201 Created

## Related Components
Other components already using `buildJsonPostOptions` correctly:
- `HODDashboard.jsx` - for contest approval/rejection
- Most other POST requests in the app

## Security Note
This fix maintains proper CSRF protection while allowing legitimate requests from the authenticated frontend to succeed.
