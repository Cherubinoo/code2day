import { useState, useEffect } from 'react';
import { Crown, Medal, Flame, Brain, Code2, Loader2 } from 'lucide-react';

const RANK_MEDAL_COLOR = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };

export default function LeaderboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/leaderboard/', { credentials: 'include' });
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(payload.detail || 'Failed to load the leaderboard.');
        } else {
          setData(payload);
        }
      } catch {
        if (!cancelled) setError('Network error loading the leaderboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--text-soft)' }}>
        <Loader2 size={20} className="spin" style={{ marginRight: 10 }} /> Loading leaderboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
    );
  }

  const { leaderboard = [], current_student: me, total_students = 0 } = data || {};

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Crown size={28} color="#f59e0b" />
        <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950)' }}>Institution Leaderboard</h1>
      </div>
      <p style={{ margin: '0 0 24px', color: 'var(--text-soft)', fontSize: 14 }}>
        Ranked by points across every student in your institution — {total_students} student{total_students !== 1 ? 's' : ''} total.
        Points combine problems solved, aptitude solved, contest scores, and your activity streak.
      </p>

      {me && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', marginBottom: 24,
          borderRadius: 16, background: 'linear-gradient(135deg, var(--olive-700), var(--olive-900))', color: 'white',
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, minWidth: 60, textAlign: 'center' }}>#{me.rank}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Your rank</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{me.points} points · {me.problems_solved} problems · {me.aptitude_solved} aptitude · {me.streak}-day streak</div>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 90px 90px', gap: 8, padding: '10px 16px', fontSize: 11, fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Rank</span>
          <span>Student</span>
          <span style={{ textAlign: 'right' }}>Points</span>
          <span style={{ textAlign: 'right' }}>Problems</span>
          <span style={{ textAlign: 'right' }}>Aptitude</span>
          <span style={{ textAlign: 'right' }}>Streak</span>
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-soft)', fontSize: 13 }}>No students yet.</div>
        ) : (
          leaderboard.map((row) => (
            <div
              key={row.register_number || row.rank}
              style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 90px 90px', gap: 8, alignItems: 'center',
                padding: '12px 16px', borderBottom: '1px solid var(--bg-1)',
                background: row.is_you ? 'var(--sage-50)' : 'transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, color: RANK_MEDAL_COLOR[row.rank] || 'var(--text-soft)' }}>
                {row.rank <= 3 ? <Medal size={16} /> : null} {row.rank}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--olive-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}{row.is_you ? ' (You)' : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>
                  {row.register_number}{row.department ? ` · ${row.department}` : ''}{row.batch ? ` · ${row.batch}` : ''}
                </div>
              </span>
              <span style={{ textAlign: 'right', fontWeight: 900, color: 'var(--olive-700)' }}>{row.points}</span>
              <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <Code2 size={12} /> {row.problems_solved}
              </span>
              <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <Brain size={12} /> {row.aptitude_solved}
              </span>
              <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                <Flame size={12} color={row.streak > 0 ? '#ea580c' : undefined} /> {row.streak}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
