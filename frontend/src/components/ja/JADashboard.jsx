// JA (Junior Admin) Dashboard
// Features: Manage students in their department — batches, bulk import, add/delete students
// Access: JA role only, department-scoped, requires 2-step verification on login

import { useState, useEffect, useRef } from 'react';
import {
  Users, FolderOpen, Upload, Download, Plus, Trash2, Search,
  ChevronRight, ArrowLeft, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, FileSpreadsheet, UserPlus, MoveRight, Building2,
  BarChart3, Shield
} from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';
import DoubleConfirmModal from '../common/DoubleConfirmModal';

// ─── tiny helpers ────────────────────────────────────────────────────────────

function Badge({ children, color = 'green' }) {
  const colors = {
    green: { bg: '#d1fae5', text: '#065f46' },
    red:   { bg: '#fee2e2', text: '#991b1b' },
    blue:  { bg: '#dbeafe', text: '#1e40af' },
    gray:  { bg: '#f3f4f6', text: '#374151' },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{
      background: c.bg, color: c.text,
      padding: '2px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700,
    }}>{children}</span>
  );
}

function StatCard({ icon: Icon, label, value, color = '#2D6A4F' }) {
  return (
    <div style={{
      background: 'white', borderRadius: 16, padding: '20px 24px',
      border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#111827' }}>{value}</div>
        <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

function Alert({ type = 'error', message, onClose }) {
  if (!message) return null;
  const styles = {
    error:   { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', icon: XCircle },
    success: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46', icon: CheckCircle },
    warning: { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', icon: AlertTriangle },
  };
  const s = styles[type];
  const Icon = s.icon;
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10,
      padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 16, color: s.text,
    }}>
      <Icon size={18} />
      <span style={{ flex: 1, fontSize: 14 }}>{message}</span>
      {onClose && (
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.text }}>
          <XCircle size={16} />
        </button>
      )}
    </div>
  );
}

// --- Overview Tab -------------------------------------------------------------

function OverviewTab({ stats, batches, jaInfo, onSelectBatch }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard icon={Users} label="Total Students" value={stats.total_students} />
        <StatCard icon={FolderOpen} label="Total Batches" value={stats.total_batches} color="#1d4ed8" />
        <StatCard icon={Building2} label="Department" value={jaInfo?.department?.code || '�'} color="#7c3aed" />
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>Batches in {jaInfo?.department?.name}</h3>
        </div>
        {batches.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>No batches yet. Create one from the Batches tab.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Batch</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Students</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.batch} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '14px 24px', fontWeight: 700, color: '#111827' }}>{b.batch}</td>
                  <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                    <Badge color="green">{b.student_count} students</Badge>
                  </td>
                  <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                    <button
                      onClick={() => onSelectBatch(b.batch)}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, color: '#374151', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      View <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Batch Detail (students in one batch) ------------------------------------

function BatchDetailView({ batchCode, jaInfo, onBack, onRefresh }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(null);
  const [moveBatch, setMoveBatch] = useState('');
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null });
  const [form, setForm] = useState({ register_number: '', name: '', personal_email: '', mobile_number: '', gender: '', batch: batchCode });
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState(null); // register_number of last added student
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [allBatches, setAllBatches] = useState([]);

  const askDouble = (onConfirm, m1, m2) => setConfirmState({ show: true, m1, m2, onConfirm });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ja/batches/${encodeURIComponent(batchCode)}/`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setStudents(data.students || []);
      else setMsg({ type: 'error', text: data.detail || 'Failed to load students' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Load all batches for the move/batch selector
    fetch('/api/ja/batches/', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setAllBatches(d.batches || []))
      .catch(() => {});
  }, [batchCode]);

  // Reset form batch when batchCode changes
  useEffect(() => {
    setForm(f => ({ ...f, batch: batchCode }));
  }, [batchCode]);

  async function handleAddStudent(e) {
    e.preventDefault();
    if (!form.register_number.trim() || !form.name.trim()) {
      setMsg({ type: 'error', text: 'Register number and name are required.' });
      return;
    }
    if (!form.batch.trim()) {
      setMsg({ type: 'error', text: 'Batch is required.' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ja/students/create/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add student');
      setLastAdded(form.register_number);
      setMsg({ type: 'success', text: `Student "${form.name}" added to batch "${form.batch}" successfully.` });
      setForm({ register_number: '', name: '', personal_email: '', mobile_number: '', gender: '', batch: batchCode });
      setShowAddForm(false);
      load();
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownloadSingleReport(registerNumber) {
    setDownloadingReport(true);
    try {
      const res = await fetch('/api/ja/import/report/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          register_numbers: [registerNumber],
          title: 'New Student Addition Report',
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student_${registerNumber}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setDownloadingReport(false);
    }
  }

  async function handleDelete(registerNumber, name) {
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/ja/students/${encodeURIComponent(registerNumber)}/delete/`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to delete student');
          setMsg({ type: 'success', text: data.detail });
          if (lastAdded === registerNumber) setLastAdded(null);
          load();
          onRefresh();
        } catch (err) {
          setMsg({ type: 'error', text: err.message });
        }
      },
      `Remove student "${name}" (${registerNumber})?`,
      `FINAL WARNING: This permanently deletes the student account and all associated data.`
    );
  }

  async function handleMove(registerNumber) {
    if (!moveBatch.trim()) { setMsg({ type: 'error', text: 'Enter a batch name.' }); return; }
    try {
      const res = await fetch(`/api/ja/students/${encodeURIComponent(registerNumber)}/move/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ batch: moveBatch.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to move student');
      setMsg({ type: 'success', text: data.detail });
      setShowMoveModal(null);
      setMoveBatch('');
      load();
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.register_number || '').includes(search)
  );

  return (
    <div>
      {confirmState.show && (
        <DoubleConfirmModal
          message1={confirmState.m1}
          message2={confirmState.m2}
          onConfirm={() => { setConfirmState(s => ({ ...s, show: false })); confirmState.onConfirm(); }}
          onCancel={() => setConfirmState(s => ({ ...s, show: false }))}
        />
      )}

      {/* Move modal */}
      {showMoveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Move Student to Another Batch</h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b7280' }}>Moving: <strong>{showMoveModal}</strong></p>
            <input
              value={moveBatch}
              onChange={e => setMoveBatch(e.target.value)}
              placeholder="New batch (e.g. 24-28)"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowMoveModal(null); setMoveBatch(''); }} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={() => handleMove(showMoveModal)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#2D6A4F', color: 'white', cursor: 'pointer', fontWeight: 700 }}>Move</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 9, padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Batch: {batchCode}</h2>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{jaInfo?.department?.name} · {students.length} students</p>
        </div>
      </div>

      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      {/* Last-added report download banner */}
      {lastAdded && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle size={18} color="#065f46" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#065f46' }}>
              Student <code>{lastAdded}</code> added successfully.
            </span>
          </div>
          <button
            onClick={() => handleDownloadSingleReport(lastAdded)}
            disabled={downloadingReport}
            style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 700, fontSize: 13, cursor: downloadingReport ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
          >
            <Download size={14} /> {downloadingReport ? 'Generating...' : 'Download Report'}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or register number..."
            style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <UserPlus size={16} /> Add Student
        </button>
      </div>

      {/* Add student form */}
      {showAddForm && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: '#065f46' }}>Add New Student to Batch {batchCode}</h4>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>Fields marked * are required.</p>
          <form onSubmit={handleAddStudent}>
            {/* Required fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Register Number *</label>
                <input
                  value={form.register_number}
                  onChange={e => setForm(prev => ({ ...prev, register_number: e.target.value }))}
                  placeholder="953623243001"
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Full Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Arun Kumar"
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Batch *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={allBatches.some(b => b.batch === form.batch) ? form.batch : ''}
                    onChange={e => setForm(prev => ({ ...prev, batch: e.target.value }))}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}
                  >
                    <option value="">— Select batch —</option>
                    {allBatches.map(b => (
                      <option key={b.batch} value={b.batch}>{b.batch}</option>
                    ))}
                  </select>
                  <input
                    value={form.batch}
                    onChange={e => setForm(prev => ({ ...prev, batch: e.target.value }))}
                    placeholder="Or type new"
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>

            {/* Optional fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Email <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input
                  type="email"
                  value={form.personal_email}
                  onChange={e => setForm(prev => ({ ...prev, personal_email: e.target.value }))}
                  placeholder="arun@example.com"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Mobile <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input
                  type="tel"
                  value={form.mobile_number}
                  onChange={e => setForm(prev => ({ ...prev, mobile_number: e.target.value }))}
                  placeholder="9876543210"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Gender <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select
                  value={form.gender}
                  onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                >
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={submitting} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: submitting ? '#9ca3af' : '#2D6A4F', color: 'white', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer' }}>
                {submitting ? 'Adding...' : 'Add Student'}
              </button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: '9px 20px', borderRadius: 9, border: '1px solid #d1d5db', background: 'white', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Students table */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading students...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <Users size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p>{search ? 'No students match your search.' : 'No students in this batch yet.'}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Register No.', 'Name', 'Email', 'Mobile', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#111827', fontFamily: 'monospace' }}>{s.register_number}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: '#111827' }}>{s.name}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{s.personal_email || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{s.mobile_number || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'Active' : 'Blocked'}</Badge>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setShowMoveModal(s.register_number); setMoveBatch(''); }}
                        title="Move to another batch"
                        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151' }}
                      >
                        <MoveRight size={13} /> Move
                      </button>
                      <button
                        onClick={() => handleDelete(s.register_number, s.name)}
                        title="Delete student"
                        style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#dc2626' }}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Students Tab (all students in dept, cross-batch) ------------------------

function StudentsTab({ jaInfo }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [batches, setBatches] = useState([]);
  const [msg, setMsg] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null });

  const askDouble = (onConfirm, m1, m2) => setConfirmState({ show: true, m1, m2, onConfirm });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (batchFilter) params.set('batch', batchFilter);
      if (search) params.set('search', search);
      const res = await fetch(`/api/ja/students/?${params}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setStudents(data.students || []);
        // Derive batch list from students
        const batchSet = new Set((data.students || []).map(s => s.batch).filter(Boolean));
        setBatches([...batchSet].sort());
      } else {
        setMsg({ type: 'error', text: data.detail || 'Failed to load students' });
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [batchFilter]);

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.register_number || '').includes(search)
  );

  async function handleDelete(registerNumber, name) {
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/ja/students/${encodeURIComponent(registerNumber)}/delete/`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to delete');
          setMsg({ type: 'success', text: data.detail });
          load();
        } catch (err) {
          setMsg({ type: 'error', text: err.message });
        }
      },
      `Remove student "${name}" (${registerNumber})?`,
      `FINAL WARNING: This permanently deletes the student account and all data.`
    );
  }

  return (
    <div>
      {confirmState.show && (
        <DoubleConfirmModal
          message1={confirmState.m1}
          message2={confirmState.m2}
          onConfirm={() => { setConfirmState(s => ({ ...s, show: false })); confirmState.onConfirm(); }}
          onCancel={() => setConfirmState(s => ({ ...s, show: false }))}
        />
      )}

      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Search name or register number..."
            style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={batchFilter}
          onChange={e => setBatchFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, minWidth: 140 }}
        >
          <option value="">All Batches</option>
          {batches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={load} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>
            {jaInfo?.department?.name} — All Students
          </span>
          <Badge color="blue">{filtered.length} shown</Badge>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <Users size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <p>No students found.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Register No.', 'Name', 'Batch', 'Email', 'Mobile', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 12, color: '#111827', fontFamily: 'monospace' }}>{s.register_number}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>{s.name}</td>
                  <td style={{ padding: '11px 14px' }}><Badge color="gray">{s.batch || '—'}</Badge></td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>{s.personal_email || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>{s.mobile_number || '—'}</td>
                  <td style={{ padding: '11px 14px' }}><Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'Active' : 'Blocked'}</Badge></td>
                  <td style={{ padding: '11px 14px' }}>
                    <button
                      onClick={() => handleDelete(s.register_number, s.name)}
                      style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- Import Tab --------------------------------------------------------------

function ImportTab({ jaInfo, onRefresh }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const [defaultBatch, setDefaultBatch] = useState('');
  const [batches, setBatches] = useState([]);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const fileRef = useRef(null);

  // Load existing batches for the dropdown
  useEffect(() => {
    async function loadBatches() {
      try {
        const res = await fetch('/api/ja/batches/', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setBatches(data.batches || []);
        }
      } catch (_) {}
    }
    loadBatches();
  }, []);

  async function handleDownloadTemplate() {
    try {
      const res = await fetch('/api/ja/import/template/', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `student_import_template_${jaInfo?.department?.code || 'dept'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) { setMsg({ type: 'error', text: 'Please select an Excel file.' }); return; }
    setUploading(true);
    setMsg(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (defaultBatch.trim()) formData.append('default_batch', defaultBatch.trim());
      const res = await fetch('/api/ja/import/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function handleDownloadReport() {
    if (!result?.created?.length) return;
    setDownloadingReport(true);
    try {
      const res = await fetch('/api/ja/import/report/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          register_numbers: result.created,
          title: 'Bulk Import Report',
        }),
      });
      if (!res.ok) throw new Error('Failed to generate report');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dept = jaInfo?.department?.code || 'dept';
      a.download = `import_report_${dept}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setDownloadingReport(false);
    }
  }

  return (
    <div>
      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      {/* Template download */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileSpreadsheet size={22} color="#065f46" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#111827' }}>Step 1 — Download Template</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
              Download the Excel template for <strong>{jaInfo?.department?.name}</strong>.
              Required columns: <code>register_number</code>, <code>name</code>.
              The <code>batch</code> column is optional if you set a default batch below.
            </p>
            <button
              onClick={handleDownloadTemplate}
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Download size={16} /> Download Template (.xlsx)
            </button>
          </div>
        </div>
      </div>

      {/* Upload */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#111827' }}>Step 2 — Set Default Batch &amp; Upload</h3>

        {/* Default batch selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            Default Batch <span style={{ fontWeight: 400, color: '#9ca3af' }}>(used when a row has no batch column value)</span>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <select
              value={defaultBatch}
              onChange={e => setDefaultBatch(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }}
            >
              <option value="">— Select existing batch or type below —</option>
              {batches.map(b => (
                <option key={b.batch} value={b.batch}>{b.batch} ({b.student_count} students)</option>
              ))}
            </select>
            <input
              value={defaultBatch}
              onChange={e => setDefaultBatch(e.target.value)}
              placeholder="Or type new batch (e.g. 24-28)"
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14 }}
            />
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af' }}>
            If your Excel already has a <code>batch</code> column filled in, this is ignored for those rows.
          </p>
        </div>

        <form onSubmit={handleUpload}>
          <div
            style={{
              border: '2px dashed #d1d5db', borderRadius: 12, padding: 32, textAlign: 'center',
              background: file ? '#f0fdf4' : '#fafafa', marginBottom: 16, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={32} color={file ? '#2D6A4F' : '#9ca3af'} style={{ marginBottom: 10 }} />
            {file ? (
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: '#065f46', fontSize: 14 }}>{file.name}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>{(file.size / 1024).toFixed(1)} KB — Click to change</p>
              </div>
            ) : (
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: '#374151', fontSize: 14 }}>Click to select Excel file</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>Supports .xlsx and .xls</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files[0] || null)}
            />
          </div>
          <button
            type="submit"
            disabled={uploading || !file}
            style={{
              padding: '11px 24px', borderRadius: 10, border: 'none',
              background: uploading || !file ? '#9ca3af' : '#1d4ed8',
              color: 'white', fontWeight: 700, fontSize: 14,
              cursor: uploading || !file ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Upload size={16} /> {uploading ? 'Importing...' : 'Import Students'}
          </button>
        </form>
      </div>

      {/* Import result */}
      {result && (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>Import Results</h3>
            {result.created?.length > 0 && (
              <button
                onClick={handleDownloadReport}
                disabled={downloadingReport}
                style={{
                  padding: '9px 18px', borderRadius: 10, border: 'none',
                  background: downloadingReport ? '#9ca3af' : '#2D6A4F',
                  color: 'white', fontWeight: 700, fontSize: 13, cursor: downloadingReport ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <Download size={15} /> {downloadingReport ? 'Generating...' : `Download Report (${result.created.length} students)`}
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: '#d1fae5', borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#065f46' }}>{result.created_count}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>Created</div>
            </div>
            <div style={{ background: '#fef3c7', borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#92400e' }}>{result.skipped_count}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>Skipped</div>
            </div>
            <div style={{ background: '#fee2e2', borderRadius: 12, padding: '14px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#991b1b' }}>{result.error_count}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>Errors</div>
            </div>
          </div>

          {/* Created list preview */}
          {result.created_details?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#065f46' }}>
                Created Students ({result.created_details.length})
              </h4>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #d1fae5', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', position: 'sticky', top: 0 }}>
                      {['Register No.', 'Name', 'Batch', 'Email'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#065f46', borderBottom: '1px solid #d1fae5' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.created_details.map((s, i) => (
                      <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f0fdf4' : 'none' }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{s.register_number}</td>
                        <td style={{ padding: '7px 12px' }}>{s.name}</td>
                        <td style={{ padding: '7px 12px' }}><Badge color="green">{s.batch}</Badge></td>
                        <td style={{ padding: '7px 12px', color: '#6b7280' }}>{s.personal_email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.errors?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#991b1b' }}>Errors</h4>
              <div style={{ maxHeight: 160, overflowY: 'auto', background: '#fff5f5', borderRadius: 10, padding: 12 }}>
                {result.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#991b1b', padding: '3px 0', borderBottom: i < result.errors.length - 1 ? '1px solid #fecaca' : 'none' }}>
                    Row {e.row}: {e.register_number ? `[${e.register_number}] ` : ''}{e.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.skipped?.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>Skipped (already exist)</h4>
              <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 10, padding: 12 }}>
                {result.skipped.map(s => s.register_number).join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Batches Tab -------------------------------------------------------------

function BatchesTab({ batches, onRefresh, onSelectBatch, jaInfo }) {
  const [newBatch, setNewBatch] = useState('');
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null });

  const askDouble = (onConfirm, m1, m2) => setConfirmState({ show: true, m1, m2, onConfirm });

  async function handleCreate(e) {
    e.preventDefault();
    if (!newBatch.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ja/batches/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ batch: newBatch.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to create batch');
      setMsg({ type: 'success', text: data.detail });
      setNewBatch('');
      onRefresh();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(batchCode) {
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/ja/batches/${encodeURIComponent(batchCode)}/`, {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to delete batch');
          setMsg({ type: 'success', text: data.detail });
          onRefresh();
        } catch (err) {
          setMsg({ type: 'error', text: err.message });
        }
      },
      `Delete batch "${batchCode}"? This will permanently remove ALL students in this batch.`,
      `FINAL WARNING: This cannot be undone. All ${batches.find(b => b.batch === batchCode)?.student_count || 0} student(s) will be deleted.`
    );
  }

  return (
    <div>
      {confirmState.show && (
        <DoubleConfirmModal
          message1={confirmState.m1}
          message2={confirmState.m2}
          onConfirm={() => { setConfirmState(s => ({ ...s, show: false })); confirmState.onConfirm(); }}
          onCancel={() => setConfirmState(s => ({ ...s, show: false }))}
        />
      )}

      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      {/* Create batch */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 800, color: '#111827' }}>Create New Batch</h3>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 12 }}>
          <input
            value={newBatch}
            onChange={e => setNewBatch(e.target.value)}
            placeholder="e.g. 23-27"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
          />
          <button
            type="submit"
            disabled={creating || !newBatch.trim()}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: creating ? '#9ca3af' : '#2D6A4F', color: 'white',
              fontWeight: 700, fontSize: 14, cursor: creating ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <Plus size={16} /> {creating ? 'Creating...' : 'Create Batch'}
          </button>
        </form>
      </div>

      {/* Batch list */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f3f4f6' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>
            All Batches � {jaInfo?.department?.name}
          </h3>
        </div>
        {batches.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <FolderOpen size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>No batches yet.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '12px 24px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Batch</th>
                <th style={{ padding: '12px 24px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Students</th>
                <th style={{ padding: '12px 24px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b, i) => (
                <tr key={b.batch} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <td style={{ padding: '14px 24px', fontWeight: 700, color: '#111827', fontSize: 15 }}>{b.batch}</td>
                  <td style={{ padding: '14px 24px', textAlign: 'center' }}>
                    <Badge color="blue">{b.student_count}</Badge>
                  </td>
                  <td style={{ padding: '14px 24px', textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => onSelectBatch(b.batch)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Users size={14} /> View Students
                    </button>
                    <button
                      onClick={() => handleDelete(b.batch)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// =============================================================================
// Main JADashboard Component
// =============================================================================

const SIDEBAR_ITEMS = [
  { id: 'overview', label: 'Overview',     icon: BarChart3 },
  { id: 'batches',  label: 'Batches',      icon: FolderOpen },
  { id: 'students', label: 'All Students', icon: Users },
  { id: 'import',   label: 'Bulk Import',  icon: Upload },
];

function SidebarContent({ activeTab, setActiveTab, jaInfo, onClearBatch }) {
  return (
    <>
      <div className="sidebar-header">
        <div className="logo-container">
          <Shield size={26} color="var(--olive-500)" />
          <div className="logo-text">
            <span className="logo-main">CODE-2DAY</span>
            <span className="logo-sub">JA CONSOLE</span>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {SIDEBAR_ITEMS.map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); onClearBatch?.(); }}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
          >
            <item.icon size={20} className="nav-icon" />
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: '24px', borderTop: '1px solid var(--bg-2)', marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--sage-100)', color: 'var(--olive-700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 'bold',
          }}>
            {(jaInfo?.ja?.name || 'J')[0]}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hard)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {jaInfo?.ja?.name || 'Junior Admin'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{jaInfo?.ja?.faculty_id}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function JADashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [jaInfo, setJaInfo] = useState(null);
  const [stats, setStats] = useState({ total_students: 0, total_batches: 0 });
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ja/dashboard/', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load dashboard');
      setJaInfo(data);
      setStats(data.stats || { total_students: 0, total_batches: 0 });
      setBatches(data.batches || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []);

  if (selectedBatch) {
    return (
      <div className="admin-dashboard-layout">
        <aside className="admin-sidebar">
          <SidebarContent
            activeTab={activeTab}
            setActiveTab={(tab) => { setActiveTab(tab); setSelectedBatch(null); }}
            jaInfo={jaInfo}
            onClearBatch={() => setSelectedBatch(null)}
          />
        </aside>
        <main className="hod-main-content">
          <div className="admin-header">
            <h1>Batch: {selectedBatch}</h1>
            <p style={{ margin: 0 }}>{jaInfo?.department?.name} � Junior Admin Console</p>
          </div>
          <div className="tab-container">
            <BatchDetailView
              batchCode={selectedBatch}
              jaInfo={jaInfo}
              onBack={() => setSelectedBatch(null)}
              onRefresh={loadDashboard}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-layout">
      <aside className="admin-sidebar">
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={(tab) => { setActiveTab(tab); setSelectedBatch(null); }}
          jaInfo={jaInfo}
          onClearBatch={() => setSelectedBatch(null)}
        />
      </aside>

      <main className="hod-main-content">
        <div className="admin-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              <h1>{SIDEBAR_ITEMS.find(i => i.id === activeTab)?.label || 'Overview'}</h1>
              <p style={{ margin: 0 }}>
                Junior Admin Console � {jaInfo?.department?.name || '...'} � {jaInfo?.institution?.name || '...'}
              </p>
            </div>
            <button
              onClick={loadDashboard}
              style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            <div className="admin-loading-spinner" style={{ margin: '0 auto 16px' }} />
            Loading...
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: '#fee2e2', borderRadius: 10, color: '#991b1b', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <XCircle size={18} /> {error}
          </div>
        )}

        {!loading && !error && (
          <div className="tab-container">
            {activeTab === 'overview' && (
              <OverviewTab stats={stats} batches={batches} jaInfo={jaInfo} onSelectBatch={setSelectedBatch} />
            )}
            {activeTab === 'batches' && (
              <BatchesTab batches={batches} onRefresh={loadDashboard} onSelectBatch={setSelectedBatch} jaInfo={jaInfo} />
            )}
            {activeTab === 'students' && (
              <StudentsTab jaInfo={jaInfo} />
            )}
            {activeTab === 'import' && (
              <ImportTab jaInfo={jaInfo} onRefresh={loadDashboard} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default JADashboard;
