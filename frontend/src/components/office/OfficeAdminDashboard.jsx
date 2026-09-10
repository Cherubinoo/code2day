// Office Admin Dashboard
// Single-purpose: institution-wide staff roster — add staff, search staff,
// assign each to a department, assign each a role. No other admin powers.
// Access: office_admin role only.

import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Plus, Trash2, RefreshCw, X, Building2,
  CheckCircle, XCircle, ShieldCheck,
} from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

const GREEN = '#2D6A4F';

const EMPTY_NEW_STAFF = {
  faculty_id: '', name: '', email: '', mobile_number: '', role: 'staff', department_id: '',
};

function Toast({ message, type, onClose }) {
  if (!message) return null;
  const ok = type !== 'error';
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: ok ? '#d1fae5' : '#fee2e2',
      color: ok ? '#065f46' : '#991b1b',
      border: `1px solid ${ok ? '#6ee7b7' : '#fca5a5'}`,
      borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxWidth: 420,
    }}>
      {ok ? <CheckCircle size={18} /> : <XCircle size={18} />}
      <span style={{ fontSize: 14, fontWeight: 600 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', marginLeft: 4 }}>
        <X size={16} />
      </button>
    </div>
  );
}

export default function OfficeAdminDashboard() {
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'success' });

  const [showAdd, setShowAdd] = useState(false);
  const [newStaff, setNewStaff] = useState(EMPTY_NEW_STAFF);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [pendingDelete, setPendingDelete] = useState(null); // staff row
  const [rowBusy, setRowBusy] = useState({}); // faculty_id -> bool

  const flash = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: '', type: 'success' }), 4000);
  };

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : '';
      const res = await fetch(`/api/office/staff/${params}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load staff.');
      setStaff(data.staff || []);
      setDepartments(data.departments || []);
      setAssignableRoles(data.assignable_roles || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const patchStaff = async (row, body) => {
    setRowBusy((b) => ({ ...b, [row.faculty_id]: true }));
    try {
      const res = await fetch(`/api/office/staff/${encodeURIComponent(row.faculty_id)}/`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Update failed.');
      setStaff((list) => list.map((s) => (s.faculty_id === row.faculty_id ? data.staff : s)));
      flash(data.detail || 'Staff updated.');
    } catch (e) {
      flash(e.message, 'error');
      load(query.trim()); // resync on failure
    } finally {
      setRowBusy((b) => ({ ...b, [row.faculty_id]: false }));
    }
  };

  const addStaff = async () => {
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/office/staff/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          ...newStaff,
          department_id: newStaff.department_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not create staff.');
      setStaff((list) => [data.staff, ...list]);
      setShowAdd(false);
      setNewStaff(EMPTY_NEW_STAFF);
      flash('Staff created.');
    } catch (e) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteStaff = async (row) => {
    try {
      const res = await fetch(`/api/office/staff/${encodeURIComponent(row.faculty_id)}/`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Delete failed.');
      setStaff((list) => list.filter((s) => s.faculty_id !== row.faculty_id));
      flash('Staff deleted.');
    } catch (e) {
      flash(e.message, 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' }}>
      <Toast {...toast} onClose={() => setToast({ message: '', type: 'success' })} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 14, background: GREEN + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldCheck size={24} color={GREEN} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#111827' }}>Office Admin</h1>
          <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 14 }}>
            Institution-wide staff roster — add staff, assign departments and roles.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '22px 0 16px' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 460 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#9ca3af' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by faculty ID or name…"
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
        <button
          onClick={() => load(query.trim())}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
            borderRadius: 8, border: '1px solid #d1d5db', background: 'white',
            cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
          }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
        <button
          onClick={() => { setNewStaff(EMPTY_NEW_STAFF); setAddError(''); setShowAdd(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
            borderRadius: 8, border: 'none', background: GREEN, color: 'white',
            cursor: 'pointer', fontSize: 14, fontWeight: 700,
          }}
        >
          <Plus size={16} /> Add Staff
        </button>
      </div>

      <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 10, display: 'flex', gap: 16 }}>
        <span><Users size={13} style={{ verticalAlign: -2 }} /> {staff.length} staff</span>
        <span><Building2 size={13} style={{ verticalAlign: -2 }} /> {departments.length} departments</span>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 820 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Faculty ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Contact</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Department</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Role</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Active</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Loading…</td></tr>
              ) : staff.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No staff found.</td></tr>
              ) : staff.map((s) => {
                const busy = !!rowBusy[s.faculty_id];
                return (
                  <tr key={s.faculty_id} style={{ borderTop: '1px solid #f1f5f9', opacity: busy ? 0.55 : 1 }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>{s.faculty_id}</td>
                    <td style={{ padding: '10px 16px' }}>{s.name}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>
                      {s.email || '—'}<br />
                      <span style={{ fontSize: 12 }}>{s.mobile_number || ''}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <select
                        value={s.department__id || ''}
                        disabled={busy}
                        onChange={(e) => patchStaff(s, { department_id: e.target.value || null })}
                        style={{ ...inputStyle, padding: '6px 8px', minWidth: 150 }}
                      >
                        <option value="">— Unassigned —</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <select
                        value={s.role}
                        disabled={busy}
                        onChange={(e) => patchStaff(s, { role: e.target.value })}
                        style={{ ...inputStyle, padding: '6px 8px', minWidth: 140 }}
                      >
                        {assignableRoles.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                        {!assignableRoles.some((r) => r.value === s.role) && (
                          <option value={s.role}>{s.role_display || s.role}</option>
                        )}
                      </select>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <button
                        onClick={() => patchStaff(s, { is_active: !s.is_active })}
                        disabled={busy}
                        title={s.is_active ? 'Click to disable' : 'Click to enable'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: s.is_active ? GREEN : '#9ca3af',
                        }}
                      >
                        {s.is_active ? <CheckCircle size={20} /> : <XCircle size={20} />}
                      </button>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => setPendingDelete(s)}
                        disabled={busy}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                        title="Delete staff"
                      >
                        <Trash2 size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff modal */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: 'white', borderRadius: 16, width: 460, maxWidth: '100%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Add Staff</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {addError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '9px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                {addError}
              </div>
            )}

            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Faculty ID *
                <input style={inputStyle} value={newStaff.faculty_id}
                  onChange={(e) => setNewStaff({ ...newStaff, faculty_id: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Name *
                <input style={inputStyle} value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Email
                <input style={inputStyle} type="email" value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Mobile number
                <input style={inputStyle} value={newStaff.mobile_number}
                  onChange={(e) => setNewStaff({ ...newStaff, mobile_number: e.target.value })} />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Role
                <select style={inputStyle} value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}>
                  {assignableRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                Department
                <select style={inputStyle} value={newStaff.department_id}
                  onChange={(e) => setNewStaff({ ...newStaff, department_id: e.target.value })}>
                  <option value="">— Unassigned —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}{d.code ? ` (${d.code})` : ''}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button
                onClick={addStaff}
                disabled={adding || !newStaff.faculty_id.trim() || !newStaff.name.trim()}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: 'none', background: GREEN, color: 'white',
                  cursor: 'pointer', fontWeight: 700, opacity: (adding || !newStaff.faculty_id.trim() || !newStaff.name.trim()) ? 0.5 : 1,
                }}
              >
                {adding ? 'Creating…' : 'Create Staff'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{ background: 'white', borderRadius: 16, width: 420, maxWidth: '100%', padding: 24 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Delete staff member</h2>
            <p style={{ color: '#4b5563', fontSize: 14, margin: '0 0 20px' }}>
              Permanently delete <strong>{pendingDelete.name}</strong> ({pendingDelete.faculty_id})?
              This removes their login account too.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setPendingDelete(null)}
                style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={() => deleteStaff(pendingDelete)}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', fontWeight: 700 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
