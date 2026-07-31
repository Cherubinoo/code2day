import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, X, Megaphone, Tag, Zap, Bug, Bell } from 'lucide-react';
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
  const [updates, setUpdates] = useState([]);
  const [visibleUpdates, setVisibleUpdates] = useState([]);
  const [expanded, setExpanded] = useState(false);
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
      setUpdates(all);
      setVisibleUpdates(all.filter(u => !dismissed.includes(u.id)));
    } catch (err) {
      console.error('Failed to fetch system updates', err);
    } finally {
      setLoading(false);
    }
  };

  const dismissUpdate = (id) => {
    addDismissedId(id);
    setVisibleUpdates(prev => prev.filter(u => u.id !== id));
  };

  const dismissAll = () => {
    visibleUpdates.forEach(u => addDismissedId(u.id));
    setVisibleUpdates([]);
  };

  // Nothing to show
  if (loading || visibleUpdates.length === 0) return null;

  const latest = visibleUpdates[0];
  const rest   = visibleUpdates.slice(1);
  const meta   = CATEGORY_META[latest.category] || CATEGORY_META.announcement;
  const Icon   = meta.icon;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      border: '1px solid #bae6fd',
      borderRadius: 16,
      padding: '16px 20px',
      marginBottom: 24,
      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
    }}>
      {/* ── Top row ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 240 }}>
          {/* Icon badge */}
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: meta.bg, color: meta.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={18} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{
                fontSize: '0.7rem', fontWeight: 800,
                background: meta.bg, color: meta.color,
                padding: '2px 8px', borderRadius: 8,
              }}>
                {meta.label}
              </span>
              {latest.version && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 6 }}>
                  {latest.version}
                </span>
              )}
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{latest.created_at}</span>
              {visibleUpdates.length > 1 && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 800, color: '#0284c7',
                  background: '#bae6fd', padding: '2px 8px', borderRadius: 20,
                }}>
                  +{visibleUpdates.length - 1} more
                </span>
              )}
            </div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
              {latest.title}
            </h4>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              padding: '5px 12px', borderRadius: 8,
              border: '1px solid #93c5fd', background: 'white', color: '#0284c7',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Collapse' : 'Details'}
          </button>
          <button
            onClick={() => dismissUpdate(latest.id)}
            title="Dismiss this update"
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: '1px solid #e2e8f0', background: 'white',
              color: '#94a3b8', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: '1px dashed #93c5fd',
          color: '#334155', fontSize: '0.88rem', lineHeight: 1.65,
        }}>
          {/* Latest update body */}
          <p style={{ margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{latest.content}</p>

          {/* Remaining updates */}
          {rest.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0369a1', marginBottom: 4 }}>
                Other pending updates ({rest.length}):
              </div>
              {rest.map(u => {
                const m = CATEGORY_META[u.category] || CATEGORY_META.announcement;
                return (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: 'white', borderRadius: 10, padding: '10px 14px',
                    border: '1px solid #e0f2fe',
                  }}>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6,
                      background: m.bg, color: m.color, flexShrink: 0, marginTop: 2,
                    }}>
                      {m.label}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>{u.title}</div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2, whiteSpace: 'pre-wrap' }}>{u.content}</div>
                    </div>
                    <button
                      onClick={() => dismissUpdate(u.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', flexShrink: 0 }}
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dismiss all */}
          {visibleUpdates.length > 1 && (
            <button
              onClick={dismissAll}
              style={{
                marginTop: 14, padding: '6px 16px', borderRadius: 8,
                border: '1px solid #bae6fd', background: 'white',
                color: '#64748b', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Dismiss all updates
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default UserSystemUpdatesWidget;
