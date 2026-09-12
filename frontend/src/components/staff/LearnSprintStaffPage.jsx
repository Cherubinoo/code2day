// Self-contained "Learn Sprint" tab for the staff/HOD dashboard — lists the
// sprints this user can see, a create button, and opens the day-by-day
// monitor for one on click.
import { useState, useEffect } from 'react';
import { Plus, CalendarClock, ChevronRight } from 'lucide-react';
import LearnSprintCreator from './LearnSprintCreator';
import LearnSprintMonitor from './LearnSprintMonitor';

const STATUS_COLORS = {
  draft: '#94a3b8', pending_approval: '#d97706', approved: '#2563eb',
  rejected: '#dc2626', published: '#16a34a', active: '#16a34a',
  completed: '#475569', archived: '#94a3b8',
};

export default function LearnSprintStaffPage() {
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreator, setShowCreator] = useState(false);
  const [openSprintId, setOpenSprintId] = useState(null);

  function load() {
    setLoading(true);
    fetch('/api/learn-sprints/', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setSprints(data.sprints || []))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Learn Sprint</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
            Multi-day scheduled contest series — a new day unlocks on schedule automatically.
          </p>
        </div>
        <button onClick={() => setShowCreator(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 12,
            border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
          <Plus size={18} /> New Learn Sprint
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</p>
      ) : sprints.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', borderRadius: 12, border: '1px dashed #d1d5db' }}>
          <CalendarClock size={32} style={{ color: '#94a3b8', marginBottom: 10 }} />
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>No Learn Sprints yet — create your first one.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {sprints.map((s) => (
            <div key={s.id} onClick={() => setOpenSprintId(s.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16,
                borderRadius: 10, border: '1px solid #e5e7eb', cursor: 'pointer', background: 'white',
              }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {s.batch}{s.section ? ` / ${s.section}` : ' (full batch)'} · {s.day_count} day(s) · {s.sections.join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'white',
                  background: STATUS_COLORS[s.status] || '#94a3b8', textTransform: 'capitalize',
                }}>
                  {s.status.replace('_', ' ')}
                </span>
                <ChevronRight size={18} style={{ color: '#cbd5e1' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreator && (
        <LearnSprintCreator onClose={() => setShowCreator(false)} onSuccess={load} />
      )}
      {openSprintId && (
        <LearnSprintMonitor sprintId={openSprintId} onClose={() => { setOpenSprintId(null); load(); }} />
      )}
    </div>
  );
}
