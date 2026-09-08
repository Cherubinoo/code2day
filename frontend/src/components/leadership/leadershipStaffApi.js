// Institution-wide staff management network calls for TPU/Director/
// Principal — split out from HODDashboard.jsx's HOD/Academics staff
// fetches so the "leadership" role group's management logic lives in its
// own file, mirroring the backend's apps/learning/views/leadership/
// package. The UI (Add/Edit modal, Staff Directory table) stays shared
// with HOD/Academics in HODDashboard.jsx since it's visually identical —
// only the endpoint and payload shape differ (leadership always requires
// department_id, since these roles have no home department of their own).
import { getCsrfToken } from '../../lib/appUtils';

function jsonHeaders() {
  const csrfToken = getCsrfToken();
  const headers = { 'Content-Type': 'application/json' };
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  return headers;
}

export async function addLeadershipStaff({ faculty_id, name, role, password, department_id }) {
  const res = await fetch('/api/leadership/staff/', {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ faculty_id, name, role, password, department_id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add staff');
  return data;
}

export async function editLeadershipStaff(facultyId, { name, role, password }) {
  const res = await fetch(`/api/leadership/staff/${facultyId}/`, {
    method: 'PUT',
    credentials: 'include',
    headers: jsonHeaders(),
    body: JSON.stringify({ name, role, ...(password ? { password } : {}) }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save');
  return data;
}

export async function deleteLeadershipStaff(facultyId) {
  const csrfToken = getCsrfToken();
  const headers = {};
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  const res = await fetch(`/api/leadership/staff/${facultyId}/`, {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete staff');
  return data;
}
