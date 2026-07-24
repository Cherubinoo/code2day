// JA (Junior Admin) Dashboard
// Features: Manage students in their department — batches, bulk import, add/delete/add individual students
//           Assign class advisors to batches, assign mentors to students
// Access: JA role only, department-scoped, requires 2-step verification on login

import { useState, useEffect, useRef } from 'react';
import {
  Users, FolderOpen, Upload, Download, Plus, Trash2, Search,
  ChevronRight, ArrowLeft, AlertTriangle, CheckCircle, XCircle,
  RefreshCw, FileSpreadsheet, UserPlus, MoveRight, Building2,
  BarChart3, Shield, UserCheck, GraduationCap, BookOpen, Edit2, X, Pencil
} from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';
import DoubleConfirmModal from '../common/DoubleConfirmModal';
import AnimatedNumber from '../common/AnimatedNumber';
import { useTabNav } from '../../lib/useTabNav';

const SECTIONS = ['A', 'B', 'C'];

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
        <div style={{ fontSize: 26, fontWeight: 900, color: '#111827' }}>
          <AnimatedNumber value={value} duration={0.9} />
        </div>
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
  const [form, setForm] = useState({ register_number: '', name: '', personal_email: '', mobile_number: '', gender: '', batch: batchCode, section: '' });
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [allBatches, setAllBatches] = useState([]);
  const [editingReg, setEditingReg] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', mobile_number: '', batch: '', section: '' });
  const [editSaving, setEditSaving] = useState(false);

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
      setForm({ register_number: '', name: '', personal_email: '', mobile_number: '', gender: '', batch: batchCode, section: '' });
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

  function startEdit(s) {
    setEditingReg(s.register_number);
    setEditForm({ name: s.name, mobile_number: s.mobile_number || '', batch: s.batch || '', section: s.section || '' });
  }

  async function handleEditSave(registerNumber) {
    if (!editForm.name.trim()) { setMsg({ type: 'error', text: 'Name cannot be empty.' }); return; }
    setEditSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/ja/students/${encodeURIComponent(registerNumber)}/update/`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ name: editForm.name.trim(), mobile_number: editForm.mobile_number.trim(), batch: editForm.batch.trim(), section: editForm.section.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update');
      setStudents(prev => prev.map(s => s.register_number === registerNumber ? { ...s, name: data.name, mobile_number: data.mobile_number, batch: data.batch, section: data.section } : s));
      setEditingReg(null);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setEditSaving(false);
    }
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
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Section <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select
                  value={form.section}
                  onChange={e => setForm(prev => ({ ...prev, section: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }}
                >
                  <option value="">— Select —</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
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
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Register No.', 'Name', 'Batch', 'Section', 'Mentor', 'Email', 'Mobile', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const isEditing = editingReg === s.register_number;
                return (
                <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', background: isEditing ? '#f0fdf4' : 'white' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, color: '#111827', fontFamily: 'monospace' }}>{s.register_number}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, color: '#111827' }}>
                    {isEditing
                      ? <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 13, width: 150, outline: 'none' }} autoFocus />
                      : s.name}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {isEditing
                      ? <input value={editForm.batch} onChange={e => setEditForm(f => ({ ...f, batch: e.target.value }))}
                          placeholder="e.g. 23-27"
                          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 13, width: 90, outline: 'none' }} />
                      : <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{s.batch || '—'}</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {isEditing
                      ? <select value={editForm.section} onChange={e => setEditForm(f => ({ ...f, section: e.target.value }))}
                          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 13, outline: 'none' }}>
                          <option value="">— None —</option>
                          {SECTIONS.map(sec => <option key={sec} value={sec}>Section {sec}</option>)}
                        </select>
                      : s.section ? <Badge color="blue">Sec {s.section}</Badge> : <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    {s.mentor_name
                      ? <span style={{ color: '#2D6A4F', fontWeight: 600 }}>{s.mentor_name}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{s.personal_email || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
                    {isEditing
                      ? <input value={editForm.mobile_number} onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value }))}
                          placeholder="Mobile number"
                          style={{ padding: '5px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 13, width: 120, outline: 'none' }} />
                      : (s.mobile_number || '—')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'Active' : 'Blocked'}</Badge>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => handleEditSave(s.register_number)}
                          disabled={editSaving}
                          style={{ padding: '6px 12px', borderRadius: 7, border: 'none', background: editSaving ? '#9ca3af' : '#2D6A4F', color: 'white', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}
                        >
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingReg(null)}
                          style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => startEdit(s)}
                          title="Edit student details"
                          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#eef2ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#4338ca' }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s.register_number, s.name)}
                          title="Delete student"
                          style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#dc2626' }}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [allBatches, setAllBatches] = useState([]);
  const [form, setForm] = useState({ register_number: '', name: '', batch: '', section: '', personal_email: '', mobile_number: '', gender: '' });
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAdded] = useState(null);
  const [editingReg, setEditingReg] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', mobile_number: '', batch: '', section: '' });
  const [editSaving, setEditSaving] = useState(false);

  const askDouble = (onConfirm, m1, m2) => setConfirmState({ show: true, m1, m2, onConfirm });

  function startEdit(s) {
    setEditingReg(s.register_number);
    setEditForm({ name: s.name, mobile_number: s.mobile_number || '', batch: s.batch || '', section: s.section || '' });
  }

  async function handleEditSave(registerNumber) {
    if (!editForm.name.trim()) { setMsg({ type: 'error', text: 'Name cannot be empty.' }); return; }
    setEditSaving(true); setMsg(null);
    try {
      const res = await fetch(`/api/ja/students/${encodeURIComponent(registerNumber)}/update/`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ name: editForm.name.trim(), mobile_number: editForm.mobile_number.trim(), batch: editForm.batch.trim(), section: editForm.section.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to update');
      setStudents(prev => prev.map(s => s.register_number === registerNumber ? { ...s, name: data.name, mobile_number: data.mobile_number, batch: data.batch, section: data.section } : s));
      setEditingReg(null);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setEditSaving(false);
    }
  }

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

  async function loadBatchList() {
    try {
      const res = await fetch('/api/ja/batches/', { credentials: 'include' });
      if (res.ok) {
        const d = await res.json();
        setAllBatches(d.batches || []);
      }
    } catch (_) {}
  }

  useEffect(() => { load(); loadBatchList(); }, [batchFilter]);

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.register_number || '').includes(search)
  );

  async function handleAddStudent(e) {
    e.preventDefault();
    if (!form.register_number.trim() || !form.name.trim()) {
      setMsg({ type: 'error', text: 'Register number and name are required.' });
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
      setMsg({ type: 'success', text: form.batch ? `Student "${form.name}" added to batch "${form.batch}".` : `Student "${form.name}" added (no batch assigned yet).` });
      setForm({ register_number: '', name: '', batch: '', section: '', personal_email: '', mobile_number: '', gender: '' });
      setShowAddForm(false);
      load();
      loadBatchList();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
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

      {/* Toolbar */}
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
        <button
          onClick={() => setShowAddForm(v => !v)}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <UserPlus size={16} /> Add Student
        </button>
      </div>

      {/* Add student inline form */}
      {showAddForm && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#065f46' }}>Add New Student</h4>
            <button onClick={() => setShowAddForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: '#6b7280' }}>Register number and name are required. Batch can be assigned later.</p>
          <form onSubmit={handleAddStudent}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Register Number *</label>
                <input value={form.register_number} onChange={e => setForm(p => ({ ...p, register_number: e.target.value }))} placeholder="953623243001" required style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Full Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Arun Kumar" required style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Batch <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Assign later —</option>
                  {allBatches.map(b => <option key={b.batch} value={b.batch}>{b.batch}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Email <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input type="email" value={form.personal_email} onChange={e => setForm(p => ({ ...p, personal_email: e.target.value }))} placeholder="arun@example.com" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Mobile <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input type="tel" value={form.mobile_number} onChange={e => setForm(p => ({ ...p, mobile_number: e.target.value }))} placeholder="9876543210" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Gender <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={form.gender} onChange={e => setForm(p => ({ ...p, gender: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Section <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={form.section} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Select —</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
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

      {lastAdded && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle size={16} color="#065f46" />
          <span style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>Student <code>{lastAdded}</code> added successfully.</span>
        </div>
      )}

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
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {['Register No.', 'Name', 'Batch', 'Section', 'Mentor', 'Email', 'Mobile', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const isEditing = editingReg === s.register_number;
                return (
                <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', background: isEditing ? '#f0fdf4' : 'white' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 700, fontSize: 12, color: '#111827', fontFamily: 'monospace' }}>{s.register_number}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13 }}>
                    {isEditing
                      ? <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 13, width: 150, outline: 'none' }} autoFocus />
                      : s.name}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {isEditing
                      ? <input value={editForm.batch} onChange={e => setEditForm(f => ({ ...f, batch: e.target.value }))}
                          placeholder="e.g. 23-27"
                          style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 12, width: 80, outline: 'none' }} />
                      : <Badge color="gray">{s.batch || '—'}</Badge>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {isEditing
                      ? <select value={editForm.section} onChange={e => setEditForm(f => ({ ...f, section: e.target.value }))}
                          style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 12, outline: 'none' }}>
                          <option value="">— None —</option>
                          {SECTIONS.map(sec => <option key={sec} value={sec}>Sec {sec}</option>)}
                        </select>
                      : s.section ? <Badge color="blue">Sec {s.section}</Badge> : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 12 }}>
                    {s.mentor_name
                      ? <span style={{ color: '#2D6A4F', fontWeight: 600 }}>{s.mentor_name}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>{s.personal_email || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>
                    {isEditing
                      ? <input value={editForm.mobile_number} onChange={e => setEditForm(f => ({ ...f, mobile_number: e.target.value }))}
                          placeholder="Mobile"
                          style={{ padding: '4px 8px', borderRadius: 7, border: '1.5px solid #2D6A4F', fontSize: 12, width: 120, outline: 'none' }} />
                      : (s.mobile_number || '—')}
                  </td>
                  <td style={{ padding: '11px 14px' }}><Badge color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'Active' : 'Blocked'}</Badge></td>
                  <td style={{ padding: '11px 14px' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => handleEditSave(s.register_number)}
                          disabled={editSaving}
                          style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: editSaving ? '#9ca3af' : '#2D6A4F', color: 'white', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700 }}
                        >
                          {editSaving ? '…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingReg(null)}
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => startEdit(s)}
                          style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #c7d2fe', background: '#eef2ff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4338ca', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s.register_number, s.name)}
                          style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          <Trash2 size={11} /> Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
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
  const [showSingleForm, setShowSingleForm] = useState(false);
  const [singleForm, setSingleForm] = useState({ register_number: '', name: '', batch: '', section: '', personal_email: '', mobile_number: '', gender: '' });
  const [singleSubmitting, setSingleSubmitting] = useState(false);
  const [singleMsg, setSingleMsg] = useState(null);

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

  async function handleAddSingle(e) {
    e.preventDefault();
    if (!singleForm.register_number.trim() || !singleForm.name.trim()) {
      setSingleMsg({ type: 'error', text: 'Register number and name are required.' });
      return;
    }
    setSingleSubmitting(true);
    setSingleMsg(null);
    try {
      const res = await fetch('/api/ja/students/create/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify(singleForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to add student');
      setSingleMsg({ type: 'success', text: `Student "${singleForm.name}" (${singleForm.register_number}) added successfully.` });
      setSingleForm({ register_number: '', name: '', batch: '', section: '', personal_email: '', mobile_number: '', gender: '' });
      setShowSingleForm(false);
      onRefresh();
    } catch (err) {
      setSingleMsg({ type: 'error', text: err.message });
    } finally {
      setSingleSubmitting(false);
    }
  }

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

      {/* Quick Add Single Student */}
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showSingleForm ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserPlus size={20} color="#1d4ed8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>Quick Add Single Student</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>Add one student without an Excel file</p>
            </div>
          </div>
          <button
            onClick={() => { setShowSingleForm(v => !v); setSingleMsg(null); }}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: showSingleForm ? '#f3f4f6' : '#1d4ed8', color: showSingleForm ? '#374151' : 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            {showSingleForm ? 'Cancel' : '+ Add Student'}
          </button>
        </div>

        {singleMsg && <Alert type={singleMsg.type} message={singleMsg.text} onClose={() => setSingleMsg(null)} />}

        {showSingleForm && (
          <form onSubmit={handleAddSingle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Register Number *</label>
                <input value={singleForm.register_number} onChange={e => setSingleForm(p => ({ ...p, register_number: e.target.value }))} placeholder="953623243001" required style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Full Name *</label>
                <input value={singleForm.name} onChange={e => setSingleForm(p => ({ ...p, name: e.target.value }))} placeholder="Arun Kumar" required style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Batch <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={singleForm.batch} onChange={e => setSingleForm(p => ({ ...p, batch: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Assign later —</option>
                  {batches.map(b => <option key={b.batch} value={b.batch}>{b.batch}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Section <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={singleForm.section} onChange={e => setSingleForm(p => ({ ...p, section: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Select —</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                  <option value="C">Section C</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Email <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input type="email" value={singleForm.personal_email} onChange={e => setSingleForm(p => ({ ...p, personal_email: e.target.value }))} placeholder="arun@example.com" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Mobile <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input type="tel" value={singleForm.mobile_number} onChange={e => setSingleForm(p => ({ ...p, mobile_number: e.target.value }))} placeholder="9876543210" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Gender <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <select value={singleForm.gender} onChange={e => setSingleForm(p => ({ ...p, gender: e.target.value }))} style={{ width: '100%', padding: '9px 10px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
                  <option value="">— Select —</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={singleSubmitting} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: singleSubmitting ? '#9ca3af' : '#1d4ed8', color: 'white', fontWeight: 700, fontSize: 13, cursor: singleSubmitting ? 'not-allowed' : 'pointer' }}>
              {singleSubmitting ? 'Adding...' : 'Add Student'}
            </button>
          </form>
        )}
      </div>

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
              Optional: <code>section</code> (A or B).
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
                      {['Register No.', 'Name', 'Batch', 'Section', 'Email'].map(h => (
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
                        <td style={{ padding: '7px 12px' }}>{s.section ? <Badge color="blue">Sec {s.section}</Badge> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
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

// --- Section Assignment Panel ------------------------------------------------

function SectionAssignPanel({ jaInfo }) {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [targetSection, setTargetSection] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterBatch, setFilterBatch] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBatch) params.set('batch', filterBatch);
      if (filterSection) params.set('section', filterSection);
      const [sRes, bRes] = await Promise.all([
        fetch(`/api/ja/students/?${params}`, { credentials: 'include' }),
        fetch('/api/ja/batches/', { credentials: 'include' }),
      ]);
      const sData = await sRes.json();
      const bData = await bRes.json();
      setStudents(sData.students || []);
      const bl = bData.batches || [];
      setBatches(bl);
      if (bl.length && !filterBatch) setFilterBatch(bl[0].batch);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterBatch, filterSection]);

  const toggleStudent = (regNo) => {
    setSelectedStudents(prev => {
      const next = new Set(prev); if (next.has(regNo)) next.delete(regNo); else next.add(regNo); return next;
    });
  };

  const toggleAll = (list) => {
    const allSel = list.every(s => selectedStudents.has(s.register_number));
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (allSel) list.forEach(s => next.delete(s.register_number)); else list.forEach(s => next.add(s.register_number));
      return next;
    });
  };

  // Only client-side search remains; batch+section now filtered server-side
  const displayed = students.filter(s => {
    const searchMatch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.register_number.includes(search);
    return searchMatch;
  });

  const unassignedCount = students.filter(s => !s.section).length;

  async function handleAssign() {
    if (!targetSection) { setMsg({ type: 'error', text: 'Select a target section first.' }); return; }
    if (selectedStudents.size === 0) { setMsg({ type: 'error', text: 'Select at least one student.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/ja/students/assign-section/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ section: targetSection, register_numbers: [...selectedStudents] }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Failed');
      setMsg({ type: 'success', text: d.detail });
      setSelectedStudents(new Set());
      setTargetSection('');
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#1e40af' }}>
        <strong>Section Assignment</strong> — Select a batch, pick students using checkboxes, choose a target section (A / B / C), and click Assign.
        {unassignedCount > 0 && <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>{unassignedCount} without section</span>}
      </div>

      {/* Action bar */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterBatch} onChange={e => { setFilterBatch(e.target.value); setSelectedStudents(new Set()); }} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, minWidth: 150 }}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.batch} value={b.batch}>Batch {b.batch}</option>)}
        </select>
        <select value={filterSection} onChange={e => { setFilterSection(e.target.value); setSelectedStudents(new Set()); }} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
          <option value="">All Sections</option>
          {SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
          <option value="__none__">No section assigned</option>
        </select>
        <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <select value={targetSection} onChange={e => setTargetSection(e.target.value)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13 }}>
          <option value="">— Assign to section —</option>
          {SECTIONS.map(s => <option key={s} value={s}>Section {s}</option>)}
        </select>
        <button
          onClick={handleAssign}
          disabled={saving || selectedStudents.size === 0 || !targetSection}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: (selectedStudents.size === 0 || !targetSection) ? '#e5e7eb' : '#2D6A4F', color: (selectedStudents.size === 0 || !targetSection) ? '#9ca3af' : 'white', fontWeight: 700, fontSize: 13, cursor: (selectedStudents.size === 0 || !targetSection) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {saving ? 'Assigning...' : `Assign (${selectedStudents.size} selected)`}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : (
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
              {filterBatch ? `Batch ${filterBatch}` : 'All Students'}
              {filterSection && filterSection !== '__none__' ? ` · Section ${filterSection}` : ''}
              {' '}<Badge color="blue">{displayed.length}</Badge>
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
              <input type="checkbox" onChange={() => toggleAll(displayed)} checked={displayed.length > 0 && displayed.every(s => selectedStudents.has(s.register_number))} />
              Select all
            </label>
          </div>
          {displayed.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>No students match the current filter.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['', 'Register No.', 'Name', 'Batch', 'Current Section'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((s, i) => (
                  <tr key={s.register_number} onClick={() => toggleStudent(s.register_number)} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', background: selectedStudents.has(s.register_number) ? '#eff6ff' : 'transparent' }}>
                    <td style={{ padding: '10px 14px', width: 40 }}>
                      <input type="checkbox" checked={selectedStudents.has(s.register_number)} onChange={() => toggleStudent(s.register_number)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#374151' }}>{s.register_number}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '10px 14px' }}><Badge color="gray">{s.batch || '—'}</Badge></td>
                    <td style={{ padding: '10px 14px' }}>
                      {s.section
                        ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>Sec {s.section}</span>
                        : <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 12 }}>Not assigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}


// --- Assignments Tab (Class Advisors + Mentor assignments) ------------------

function AssignmentsTab({ jaInfo }) {
  const [subTab, setSubTab] = useState('batch'); // 'batch' | 'advisors' | 'mentors'

  return (
    <div>
      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: '#f3f4f6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { id: 'batch',    label: 'Section Assignment', icon: MoveRight },
          { id: 'advisors', label: 'Class Advisors',   icon: GraduationCap },
          { id: 'mentors',  label: 'Mentor Assignment', icon: BookOpen },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none',
              background: subTab === t.id ? 'white' : 'transparent',
              color: subTab === t.id ? '#111827' : '#6b7280',
              fontWeight: subTab === t.id ? 700 : 500,
              fontSize: 13, cursor: 'pointer',
              boxShadow: subTab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {subTab === 'batch'    && <SectionAssignPanel jaInfo={jaInfo} />}
      {subTab === 'advisors' && <ClassAdvisorPanel jaInfo={jaInfo} />}
      {subTab === 'mentors'  && <MentorPanel jaInfo={jaInfo} />}
    </div>
  );
}

function ClassAdvisorPanel({ jaInfo }) {
  const [assignments, setAssignments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  // editing key = "batch:section"
  const [editing, setEditing] = useState(null);
  const [selectedAdvisor, setSelectedAdvisor] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [aRes, sRes] = await Promise.all([
        fetch('/api/ja/advisors/', { credentials: 'include' }),
        fetch('/api/ja/staff/', { credentials: 'include' }),
      ]);
      const aData = await aRes.json();
      const sData = await sRes.json();
      setAssignments(aData.assignments || []);
      setStaff(sData.staff || []);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(batch, section) {
    if (!selectedAdvisor) { setMsg({ type: 'error', text: 'Please select a staff member.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/ja/advisors/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ batch, section, advisor_id: parseInt(selectedAdvisor, 10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to assign advisor');
      setMsg({ type: 'success', text: data.detail });
      setEditing(null); setSelectedAdvisor('');
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(batch, section) {
    try {
      const res = await fetch(`/api/ja/advisors/${encodeURIComponent(batch)}/?section=${encodeURIComponent(section)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed');
      setMsg({ type: 'success', text: data.detail });
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  // Group rows by batch for display
  const batches = [...new Set(assignments.map(a => a.batch))].sort();
  const SECTION_COLORS = { A: '#dbeafe', B: '#d1fae5', C: '#fef3c7' };
  const SECTION_TEXT   = { A: '#1e40af', B: '#065f46', C: '#92400e' };

  return (
    <div>
      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: '#1e40af' }}>
        <strong>Class Advisor Assignment</strong> — Assign one staff member as class advisor for each section within a batch. Each section (A / B / C) can have its own advisor.
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : assignments.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
          <GraduationCap size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
          <p>No batches found. Create batches and assign students to sections first.</p>
        </div>
      ) : (
        batches.map(batch => {
          const batchRows = assignments.filter(a => a.batch === batch);
          return (
            <div key={batch} style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>Batch {batch}</span>
                <Badge color="gray">{batchRows.reduce((s, r) => s + r.student_count, 0)} students</Badge>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Section', 'Students', 'Class Advisor', 'Action'].map(h => (
                      <th key={h} style={{ padding: '11px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((a, i) => {
                    const key = `${a.batch}:${a.section}`;
                    return (
                      <tr key={key} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '13px 20px' }}>
                          <span style={{ background: SECTION_COLORS[a.section] || '#f3f4f6', color: SECTION_TEXT[a.section] || '#374151', padding: '4px 12px', borderRadius: 8, fontWeight: 800, fontSize: 13 }}>
                            Section {a.section}
                          </span>
                        </td>
                        <td style={{ padding: '13px 20px' }}><Badge color="blue">{a.student_count}</Badge></td>
                        <td style={{ padding: '13px 20px' }}>
                          {editing === key ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select value={selectedAdvisor} onChange={e => setSelectedAdvisor(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, minWidth: 180 }}>
                                <option value="">— Select staff —</option>
                                {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.faculty_id})</option>)}
                              </select>
                              <button onClick={() => handleSave(a.batch, a.section)} disabled={saving} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                                {saving ? '...' : 'Save'}
                              </button>
                              <button onClick={() => { setEditing(null); setSelectedAdvisor(''); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                            </div>
                          ) : a.advisor ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#1e40af' }}>
                                {a.advisor.name[0]}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{a.advisor.name}</div>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>{a.advisor.faculty_id}</div>
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: 13, color: '#9ca3af' }}>Not assigned</span>
                          )}
                        </td>
                        <td style={{ padding: '13px 20px' }}>
                          {editing !== key && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => { setEditing(key); setSelectedAdvisor(a.advisor?.id?.toString() || ''); }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Edit2 size={12} /> {a.advisor ? 'Change' : 'Assign'}
                              </button>
                              {a.advisor && (
                                <button onClick={() => handleRemove(a.batch, a.section)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff5f5', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <X size={12} /> Remove
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

function MentorPanel({ jaInfo }) {
  const [data, setData] = useState({ mentor_groups: [], unassigned: [], unassigned_count: 0 });
  const [staff, setStaff] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [bulkMentor, setBulkMentor] = useState('');
  const [saving, setSaving] = useState(false);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const mentorUrl = batchFilter ? `/api/ja/mentors/?batch=${encodeURIComponent(batchFilter)}` : '/api/ja/mentors/';
      const [mRes, sRes, bRes] = await Promise.all([
        fetch(mentorUrl, { credentials: 'include' }),
        fetch('/api/ja/staff/', { credentials: 'include' }),
        fetch('/api/ja/batches/', { credentials: 'include' }),
      ]);
      const mData = await mRes.json();
      const sData = await sRes.json();
      const bData = await bRes.json();
      setData(mData);
      setStaff(sData.staff || []);
      setBatches(bData.batches || []);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [batchFilter]);

  const toggleStudent = (regNo) => {
    setSelectedStudents(prev => {
      const next = new Set(prev);
      if (next.has(regNo)) next.delete(regNo); else next.add(regNo);
      return next;
    });
  };

  const toggleAll = (list) => {
    const allSelected = list.every(s => selectedStudents.has(s.register_number));
    if (allSelected) {
      setSelectedStudents(prev => { const next = new Set(prev); list.forEach(s => next.delete(s.register_number)); return next; });
    } else {
      setSelectedStudents(prev => { const next = new Set(prev); list.forEach(s => next.add(s.register_number)); return next; });
    }
  };

  async function handleAssign() {
    if (selectedStudents.size === 0) { setMsg({ type: 'error', text: 'Select at least one student.' }); return; }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ja/mentors/assign/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({
          mentor_id: bulkMentor ? parseInt(bulkMentor, 10) : null,
          register_numbers: [...selectedStudents],
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Failed');
      setMsg({ type: 'success', text: d.detail });
      setSelectedStudents(new Set());
      setBulkMentor('');
      load();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  // All students (flat) for search
  const allStudents = [
    ...data.unassigned,
    ...data.mentor_groups.flatMap(g => g.students),
  ];
  const filtered = search
    ? allStudents.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.register_number.includes(search))
    : null;

  return (
    <div>
      {msg && <Alert type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 13, color: '#92400e' }}>
          <strong>Mentor Assignment</strong> — Select students, choose a mentor, click Assign.
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#2D6A4F' }}>{data.mentor_groups.reduce((sum, g) => sum + g.students.length, 0)}</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Assigned</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#92400e' }}>{data.unassigned_count}</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Unassigned</div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={batchFilter} onChange={e => { setBatchFilter(e.target.value); setSelectedStudents(new Set()); }} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, minWidth: 150 }}>
          <option value="">All Batches</option>
          {batches.map(b => <option key={b.batch} value={b.batch}>Batch {b.batch}</option>)}
        </select>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..." style={{ width: '100%', padding: '9px 12px 9px 32px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <select value={bulkMentor} onChange={e => setBulkMentor(e.target.value)} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13, minWidth: 200 }}>
          <option value="">— Remove mentor —</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.faculty_id})</option>)}
        </select>
        <button
          onClick={handleAssign}
          disabled={saving || selectedStudents.size === 0}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: selectedStudents.size === 0 ? '#e5e7eb' : '#2D6A4F', color: selectedStudents.size === 0 ? '#9ca3af' : 'white', fontWeight: 700, fontSize: 13, cursor: selectedStudents.size === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {saving ? 'Saving...' : `Assign (${selectedStudents.size} selected)`}
        </button>
        <button
          onClick={() => setAssignedOnly(v => !v)}
          style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${assignedOnly ? '#2D6A4F' : '#d1d5db'}`, background: assignedOnly ? '#f0fdf4' : 'white', color: assignedOnly ? '#2D6A4F' : '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {assignedOnly ? '✓ Assigned only' : 'Assigned only'}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Search results override */}
          {filtered ? (
            <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Search Results ({filtered.length})</span>
                <input type="checkbox" onChange={() => toggleAll(filtered)} checked={filtered.length > 0 && filtered.every(s => selectedStudents.has(s.register_number))} />
              </div>
              <StudentMentorTable students={filtered} selectedStudents={selectedStudents} toggleStudent={toggleStudent} />
            </div>
          ) : (
            <>
              {/* Unassigned */}
              {data.unassigned_count > 0 && !assignedOnly && (
                <div style={{ background: 'white', borderRadius: 16, border: '1px solid #fde68a', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #fef3c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setShowUnassigned(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#92400e' }}>
                        {showUnassigned ? '▾' : '▸'} Unassigned Students
                      </button>
                      <Badge color="gray">{data.unassigned_count}</Badge>
                    </div>
                    <input type="checkbox" onChange={() => toggleAll(data.unassigned)} checked={data.unassigned.length > 0 && data.unassigned.every(s => selectedStudents.has(s.register_number))} />
                  </div>
                  {showUnassigned && <StudentMentorTable students={data.unassigned} selectedStudents={selectedStudents} toggleStudent={toggleStudent} />}
                </div>
              )}

              {/* Mentor groups */}
              {data.mentor_groups.map(g => (
                <div key={g.mentor.id} style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af' }}>
                        {g.mentor.name[0]}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{g.mentor.name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{g.mentor.faculty_id} · {g.mentor.role}</div>
                      </div>
                      <Badge color="blue">{g.students.length} mentees</Badge>
                    </div>
                    <input type="checkbox" onChange={() => toggleAll(g.students)} checked={g.students.length > 0 && g.students.every(s => selectedStudents.has(s.register_number))} />
                  </div>
                  <StudentMentorTable students={g.students} selectedStudents={selectedStudents} toggleStudent={toggleStudent} />
                </div>
              ))}

              {data.mentor_groups.length === 0 && data.unassigned_count === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                  <BookOpen size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <p>No students in the department yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StudentMentorTable({ students, selectedStudents, toggleStudent }) {
  if (!students.length) return <div style={{ padding: '16px 20px', color: '#9ca3af', fontSize: 13 }}>No students.</div>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {students.map((s, i) => (
          <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none', background: selectedStudents.has(s.register_number) ? '#f0fdf4' : 'transparent' }}>
            <td style={{ padding: '10px 14px', width: 40 }}>
              <input type="checkbox" checked={selectedStudents.has(s.register_number)} onChange={() => toggleStudent(s.register_number)} />
            </td>
            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 12, fontFamily: 'monospace', color: '#374151' }}>{s.register_number}</td>
            <td style={{ padding: '10px 14px', fontSize: 13, color: '#111827' }}>{s.name}</td>
            <td style={{ padding: '10px 14px' }}><Badge color="gray">{s.batch || '—'}</Badge></td>
            <td style={{ padding: '10px 14px' }}>{s.section ? <Badge color="blue">Sec {s.section}</Badge> : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  { id: 'overview',     label: 'Overview',     icon: BarChart3 },
  { id: 'batches',      label: 'Batches',      icon: FolderOpen },
  { id: 'students',     label: 'All Students', icon: Users },
  { id: 'assignments',  label: 'Assignments',  icon: UserCheck },
  { id: 'import',       label: 'Bulk Import',  icon: Upload },
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
  const [activeTab, setActiveTab] = useTabNav('overview');
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
            {activeTab === 'assignments' && (
              <AssignmentsTab jaInfo={jaInfo} />
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
