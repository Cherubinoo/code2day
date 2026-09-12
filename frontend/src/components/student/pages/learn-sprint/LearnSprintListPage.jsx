// Learn Sprint list — every sprint the student can see, each showing only
// its own per-day lock state and (once a day has ended) the student's OWN
// score for it. No ranking/leaderboard is ever shown here — that only
// appears on LearnSprintResultsPage, and only once the whole sprint is
// completed (see StudentLearnSprintResultsView's is-completed gate).
import { useState, useEffect } from 'react';
import { CalendarClock, Lock, Unlock, CheckCircle2, Trophy } from 'lucide-react';

const STATE_META = {
  locked: { label: 'Locked', icon: Lock, color: '#94a3b8', bg: '#f1f5f9' },
  open: { label: 'Open now — play!', icon: Unlock, color: '#16a34a', bg: '#ecfdf5' },
  completed: { label: 'Completed', icon: CheckCircle2, color: '#2563eb', bg: '#eff6ff' },
};

export default function LearnSprintListPage({ onOpenDay, onOpenResults }) {
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/learn-sprints/', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setSprints(data.sprints || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Learn Sprints…</div>;
  }

  if (sprints.length === 0) {
    return (
      <div className="page-stack problem-page">
        <section className="page-header compact-header problem-page-header">
          <div>
            <p className="kicker">Scheduled Practice</p>
            <h1>🏃 Learn Sprint</h1>
          </div>
        </section>
        <div style={{ padding: 60, textAlign: 'center', borderRadius: 12, border: '1px dashed #d1d5db' }}>
          <CalendarClock size={36} style={{ color: '#94a3b8', marginBottom: 12 }} />
          <p style={{ margin: 0, color: '#94a3b8' }}>No Learn Sprints have been assigned to you yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Scheduled Practice</p>
          <h1>🏃 Learn Sprint</h1>
        </div>
        <p style={{ color: 'var(--text-soft)', margin: 0 }}>
          A new day unlocks on schedule — keep up your streak. Results and the leaderboard are revealed once the sprint is over.
        </p>
      </section>

      <div style={{ display: 'grid', gap: 20 }}>
        {sprints.map((sprint) => (
          <div key={sprint.id} className="surface-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: '0 0 4px' }}>{sprint.title}</h3>
                {sprint.description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-soft)' }}>{sprint.description}</p>}
              </div>
              {sprint.results_available && (
                <button onClick={() => onOpenResults(sprint.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#d97706', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  <Trophy size={15} /> View Final Results
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {sprint.days.map((day) => {
                const meta = STATE_META[day.state] || STATE_META.locked;
                const Icon = meta.icon;
                const clickable = day.state === 'open';
                return (
                  <button key={day.day_number} disabled={!clickable}
                    onClick={() => clickable && onOpenDay(day.contest_id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      minWidth: 110, padding: '14px 12px', borderRadius: 10, border: `1px solid ${meta.color}33`,
                      background: meta.bg, cursor: clickable ? 'pointer' : 'default',
                    }}>
                    <Icon size={18} style={{ color: meta.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Day {day.day_number}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{day.date}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    {day.state === 'completed' && day.student_score !== null && day.student_score !== undefined && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{day.student_score} pts</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
