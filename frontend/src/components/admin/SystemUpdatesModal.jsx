import { useState, useEffect } from 'react';
import { Sparkles, Megaphone, Plus, Trash2, X, Tag, CheckCircle2, ShieldAlert } from 'lucide-react';
import api from '../../lib/api';

const SystemUpdatesModal = ({ isOpen, onClose }) => {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    version: '',
    category: 'feature',
    target_role: 'all',
    content: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchUpdates();
    }
  }, [isOpen]);

  const fetchUpdates = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/system-updates/');
      setUpdates(res.data.updates || []);
    } catch (err) {
      console.error('Failed to fetch system updates', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      alert('Please fill in title and content.');
      return;
    }

    try {
      await api.post('/admin/system-updates/', form);
      setForm({ title: '', version: '', category: 'feature', target_role: 'all', content: '' });
      setShowCreate(false);
      fetchUpdates();
      alert('System update broadcasted successfully!');
    } catch (err) {
      alert('Failed to post update: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this broadcast update?')) return;
    try {
      await api.delete(`/admin/system-updates/${id}/`);
      fetchUpdates();
    } catch (err) {
      alert('Failed to delete update');
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2500, padding: 20
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: 24,
        width: '95vw',
        maxWidth: 850,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        border: '1px solid #e2e8f0'
      }} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Megaphone size={24} style={{ color: '#2563eb' }} />
              Role-Based System Updates & Broadcasts
            </h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
              Broadcast release notes, new features, and platform updates to students and staff
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                border: 'none',
                background: showCreate ? '#64748b' : '#2563eb',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {showCreate ? <X size={16} /> : <Plus size={16} />}
              {showCreate ? 'Cancel' : 'New Broadcast'}
            </button>

            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
          {/* CREATE FORM */}
          {showCreate && (
            <form onSubmit={handleCreate} style={{
              background: '#f0f9ff',
              padding: 24,
              borderRadius: 16,
              border: '1px solid #bae6fd',
              marginBottom: 32
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 800, color: '#0369a1' }}>
                📢 Post New Platform Update
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>Update Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Code Workspace Copy-Paste Controls Enabled"
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>Version Tag</label>
                  <input
                    type="text"
                    placeholder="e.g., v2.4.0"
                    value={form.version}
                    onChange={e => setForm({ ...form, version: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>Target Role</label>
                  <select
                    value={form.target_role}
                    onChange={e => setForm({ ...form, target_role: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 700 }}
                  >
                    <option value="all">🌐 All Roles</option>
                    <option value="student">🎓 Students Only</option>
                    <option value="staff">👨‍🏫 Faculty Only</option>
                    <option value="hod">👑 HODs Only</option>
                    <option value="ja">🛠️ Junior Admins Only</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>Update Details & Notes</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain what's new, key changes, or instructions for users..."
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.9rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="submit"
                  style={{
                    padding: '10px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: '#0284c7',
                    color: 'white',
                    fontWeight: 800,
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  Broadcast Update Now
                </button>
              </div>
            </form>
          )}

          {/* UPDATES LIST */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading broadcast updates...</div>
          ) : updates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: '#f8fafc', borderRadius: 16 }}>
              <Sparkles size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No system updates broadcasted yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {updates.map(up => (
                <div
                  key={up.id}
                  style={{
                    padding: 20,
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        background: up.target_role === 'student' ? '#dbeafe' : up.target_role === 'staff' ? '#fef3c7' : '#f3e8ff',
                        color: up.target_role === 'student' ? '#1e40af' : up.target_role === 'staff' ? '#92400e' : '#6b21a8',
                        fontSize: '0.75rem',
                        fontWeight: 800
                      }}>
                        {up.target_role === 'all' ? '🌐 All Users' : up.target_role.toUpperCase()}
                      </span>

                      {up.version && (
                        <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: '0.75rem', fontWeight: 700 }}>
                          {up.version}
                        </span>
                      )}

                      <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{up.created_at}</span>
                    </div>

                    <h4 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                      {up.title}
                    </h4>

                    <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                      {up.content}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDelete(up.id)}
                    style={{
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      color: '#e11d48',
                      padding: 8,
                      borderRadius: 10,
                      cursor: 'pointer'
                    }}
                    title="Delete update"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemUpdatesModal;
