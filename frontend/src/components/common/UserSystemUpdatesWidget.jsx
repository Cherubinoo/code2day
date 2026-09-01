import { useState, useEffect } from 'react';
import { Megaphone, Zap, Bug } from 'lucide-react';
import api from '../../lib/api';

const STORAGE_KEY = 'code2day-dismissed-updates';

function getDismissedIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function addDismissedId(id) {
  const ids = getDismissedIds();
  if (!ids.includes(id)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, id]));
  }
}

const CATEGORY_META = {
  feature:      { label: 'New Feature',       color: '#2563eb', bg: '#dbeafe', icon: Zap },
  bugfix:       { label: 'Improvement & Fix', color: '#059669', bg: '#d1fae5', icon: Bug },
  announcement: { label: 'Announcement',      color: '#d97706', bg: '#fef3c7', icon: Megaphone },
};

const UserSystemUpdatesWidget = () => {
  const [visibleUpdates, setVisibleUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserUpdates();
  }, []);

  const fetchUserUpdates = async () => {
    try {
      setLoading(true);
      const res = await api.get('/system-updates/');
      const all = res.data.updates || [];
      const dismissed = getDismissedIds();
      setVisibleUpdates(all.filter(u => !dismissed.includes(u.id)));
    } catch (err) {
      console.error('Failed to fetch system updates', err);
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeCurrent = () => {
    const current = visibleUpdates[0];
    if (!current) return;
    addDismissedId(current.id);
    setVisibleUpdates(prev => prev.slice(1));
  };

  if (loading || visibleUpdates.length === 0) return null;

  const current = visibleUpdates[0];
  const meta = CATEGORY_META[current.category] || CATEGORY_META.announcement;
  const Icon = meta.icon;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderRadius: 18,
          boxShadow: '0 20px 60px rgba(2, 132, 199, 0.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', padding: '22px 24px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: meta.bg, color: meta.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 800,
                  background: meta.bg, color: meta.color,
                  padding: '2px 8px', borderRadius: 8,
                }}>
                  {meta.label}
                </span>
                {current.version && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 6 }}>
                    {current.version}
                  </span>
                )}
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{current.created_at}</span>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {current.title}
              </h3>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 24px', color: '#334155', fontSize: '0.92rem', lineHeight: 1.65 }}>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{current.content}</p>
        </div>

        <div style={{
          padding: '14px 24px', borderTop: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
            {visibleUpdates.length > 1 ? `1 of ${visibleUpdates.length} updates` : ''}
          </span>
          <button
            onClick={acknowledgeCurrent}
            style={{
              padding: '9px 28px', borderRadius: 10,
              border: 'none', background: '#0284c7', color: '#fff',
              fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserSystemUpdatesWidget;
