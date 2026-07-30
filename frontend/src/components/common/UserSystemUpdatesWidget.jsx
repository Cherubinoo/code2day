import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Bell, Tag } from 'lucide-react';
import api from '../../lib/api';

const UserSystemUpdatesWidget = () => {
  const [updates, setUpdates] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchUserUpdates();
  }, []);

  const fetchUserUpdates = async () => {
    try {
      const res = await api.get('/system-updates/');
      setUpdates(res.data.updates || []);
    } catch (err) {
      console.error('Failed to fetch system updates', err);
    }
  };

  if (dismissed || updates.length === 0) return null;

  const latest = updates[0];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
      border: '1px solid #bae6fd',
      borderRadius: 16,
      padding: '16px 20px',
      marginBottom: 24,
      boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: '#0284c7',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#0284c7', color: 'white', padding: '2px 8px', borderRadius: 10 }}>
                NEW UPDATE {latest.version ? `(${latest.version})` : ''}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{latest.created_at}</span>
            </div>
            <h4 style={{ margin: '4px 0 0', fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
              {latest.title}
            </h4>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid #93c5fd',
              background: 'white',
              color: '#0284c7',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {expanded ? 'Hide Details' : 'View Details'}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px dashed #93c5fd',
          color: '#334155',
          fontSize: '0.88rem',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap'
        }}>
          <p style={{ margin: '0 0 12px' }}>{latest.content}</p>

          {updates.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#0369a1', marginBottom: 8 }}>
                Previous Updates ({updates.length - 1}):
              </div>
              {updates.slice(1, 4).map(u => (
                <div key={u.id} style={{ marginBottom: 6, fontSize: '0.82rem' }}>
                  <strong style={{ color: '#0f172a' }}>• {u.title}</strong> <span style={{ color: '#64748b' }}>({u.created_at})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserSystemUpdatesWidget;
