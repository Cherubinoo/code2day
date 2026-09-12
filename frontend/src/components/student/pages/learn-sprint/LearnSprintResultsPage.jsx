// Final Learn Sprint results — only reachable once the sprint is completed
// (StudentLearnSprintListView only shows the "View Final Results" button
// when results_available is true, and the backend re-checks this itself).
// Podium + full leaderboard + this student's earned badges.
import { useState, useEffect } from 'react';
import { ArrowLeft, Crown, Medal, CalendarCheck, Star } from 'lucide-react';

const RANK_MEDAL = { 1: '🥇', 2: '🥈', 3: '🥉' };
const RANK_COLOR = { 1: '#d4af37', 2: '#9ca3af', 3: '#b45309' };
const BADGE_ICONS = { Crown, Medal, CalendarCheck, Star };

function PodiumCard({ row }) {
  if (!row) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '14px 18px', borderRadius: 14, minWidth: 110,
      background: 'white', border: `2px solid ${RANK_COLOR[row.rank]}`,
    }}>
      <div style={{ fontSize: 26 }}>{RANK_MEDAL[row.rank]}</div>
      <div style={{ fontWeight: 800, fontSize: 13, textAlign: 'center' }}>{row.name}</div>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.register_number}</div>
      <div style={{ fontWeight: 900, fontSize: 15, color: RANK_COLOR[row.rank] }}>{row.total_score} pts</div>
    </div>
  );
}

function BadgeCard({ badge }) {
  const Icon = BADGE_ICONS[badge.icon] || Star;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a' }}>
      <Icon size={22} style={{ color: '#d97706' }} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{badge.label}</div>
        <div style={{ fontSize: 11, color: '#92400e' }}>{badge.description}</div>
      </div>
    </div>
  );
}

export default function LearnSprintResultsPage({ sprintId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/student/learn-sprints/${sprintId}/results/`, { credentials: 'include' })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [sprintId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading results…</div>;
  if (!data || data.detail) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#dc2626' }}>{data?.detail || 'Results are not available yet.'}</p>
        <button onClick={onBack} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer' }}>Back</button>
      </div>
    );
  }

  return (
    <div className="page-stack problem-page">
      <button onClick={onBack} className="ghost-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <ArrowLeft size={16} /> Learn Sprint
      </button>

      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Final Results</p>
          <h1>🏆 {data.sprint_title}</h1>
        </div>
      </section>

      {data.my_badges && data.my_badges.length > 0 && (
        <div className="surface-card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>Your Badges</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {data.my_badges.map((b) => <BadgeCard key={b.code} badge={b} />)}
          </div>
        </div>
      )}

      {data.my_result && (
        <div className="surface-card" style={{ padding: 20, marginBottom: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-soft)' }}>Your final rank</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 900 }}>#{data.my_result.rank}</p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-soft)' }}>{data.my_result.total_score} pts total</p>
        </div>
      )}

      <div className="surface-card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 14px' }}>Podium</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
          {data.podium.map((row) => <PodiumCard key={row.rank} row={row} />)}
        </div>

        <h3 style={{ margin: '0 0 10px' }}>Full Leaderboard</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: '6px 8px' }}>#</th>
              <th style={{ padding: '6px 8px' }}>Student</th>
              <th style={{ padding: '6px 8px' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((row) => (
              <tr key={row.student_id} style={{ borderTop: '1px solid #f1f5f9', fontWeight: row.student_id === data.my_result?.student_id ? 800 : 400 }}>
                <td style={{ padding: '6px 8px' }}>{row.rank}</td>
                <td style={{ padding: '6px 8px' }}>{row.name} <span style={{ color: '#94a3b8' }}>({row.register_number})</span></td>
                <td style={{ padding: '6px 8px' }}>{row.total_score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
