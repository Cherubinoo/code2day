import { useState, useEffect } from 'react';
import { Crown, Medal, Flame, Brain, Code2, Loader2, Trophy, ArrowUp, ArrowDown } from 'lucide-react';

const RANK_MEDAL_COLOR = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };
const RANK_MEDAL_EMOJI = { 1: '🥇', 2: '🥈', 3: '🥉' };
const ROW_GRID_FULL = '60px minmax(160px,1fr) 90px 90px 90px 90px';
const ROW_GRID_COMPACT = '44px minmax(0,1fr) 64px';
const LAST_RANK_KEY = 'code2day-leaderboard-last-rank';

// Simple points -> level/progress mapping so the table and "Your rank"
// banner can show an XP bar without a real leveling system on the backend.
function levelInfo(points) {
  const safePoints = Math.max(0, points || 0);
  return { level: Math.floor(safePoints / 100) + 1, progress: safePoints % 100 };
}

function XpBar({ points, height = 6, light = false }) {
  const { level, progress } = levelInfo(points);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: light ? 'rgba(255,255,255,0.9)' : 'var(--olive-700)', whiteSpace: 'nowrap' }}>Lv {level}</span>
      <div style={{
        flex: 1, height, borderRadius: height, minWidth: 32, overflow: 'hidden',
        background: light ? 'rgba(255,255,255,0.25)' : 'var(--bg-1)',
        border: light ? 'none' : '1px solid var(--border-soft)',
      }}>
        <div style={{
          width: `${progress}%`, height: '100%', borderRadius: height, transition: 'width 0.6s ease',
          background: light ? 'rgba(255,255,255,0.9)' : 'linear-gradient(90deg, var(--olive-500), var(--olive-700))',
        }} />
      </div>
    </div>
  );
}

function StreakChip({ streak }) {
  const active = streak > 0;
  return (
    <span className={`leaderboard-streak-chip${active ? ' active' : ''}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
      fontSize: 12, fontWeight: 800, color: active ? '#ea580c' : 'var(--text-soft)',
      background: active ? 'rgba(234, 88, 12, 0.1)' : 'var(--bg-1)',
    }}>
      <Flame size={12} color={active ? '#ea580c' : undefined} /> {streak}
    </span>
  );
}

function PodiumCard({ row }) {
  if (!row) return null;
  const isFirst = row.rank === 1;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: isFirst ? '20px 16px 16px' : '14px 12px 12px',
        borderRadius: 18,
        background: isFirst
          ? 'linear-gradient(160deg, #fef3c7, #fde68a)'
          : row.rank === 2 ? 'linear-gradient(160deg, #f1f5f9, #e2e8f0)' : 'linear-gradient(160deg, #fed7aa, #fdba74)',
        border: `2px solid ${RANK_MEDAL_COLOR[row.rank]}`,
        transform: isFirst ? 'translateY(-10px) scale(1.06)' : 'none',
        boxShadow: isFirst ? '0 12px 28px -8px rgba(245, 158, 11, 0.5)' : '0 6px 16px -6px rgba(0,0,0,0.15)',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: isFirst ? 34 : 26 }}>{RANK_MEDAL_EMOJI[row.rank]}</div>
      <div style={{
        fontWeight: 800, fontSize: isFirst ? 14 : 13, color: 'var(--olive-950)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center',
      }}>
        {row.name}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 900, fontSize: isFirst ? 18 : 15, color: RANK_MEDAL_COLOR[row.rank] }}>
        <Trophy size={isFirst ? 16 : 14} /> {row.points}
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCompact, setIsCompact] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
  ));
  const [rankChange, setRankChange] = useState(null); // 'up' | 'down' | null

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    const handleChange = () => setIsCompact(mql.matches);
    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

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

  const me = data?.current_student;

  // Compares against the last rank we saw on this device (localStorage —
  // per-viewer only, not shared) so a brief flash calls out that the
  // student's rank moved since their last visit here.
  useEffect(() => {
    if (!me) return;
    try {
      const prevRaw = window.localStorage.getItem(LAST_RANK_KEY);
      const prev = prevRaw ? parseInt(prevRaw, 10) : null;
      window.localStorage.setItem(LAST_RANK_KEY, String(me.rank));
      if (prev !== null && prev !== me.rank) {
        setRankChange(me.rank < prev ? 'up' : 'down');
        const t = setTimeout(() => setRankChange(null), 2400);
        return () => clearTimeout(t);
      }
    } catch { /* localStorage unavailable — skip the animation, not fatal */ }
  }, [me?.rank]);

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

  const { leaderboard = [], total_students = 0 } = data || {};
  const podium = [leaderboard.find((r) => r.rank === 2), leaderboard.find((r) => r.rank === 1), leaderboard.find((r) => r.rank === 3)];
  const rest = leaderboard.filter((r) => r.rank > 3);
  const rowGrid = isCompact ? ROW_GRID_COMPACT : ROW_GRID_FULL;

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

      {podium.some(Boolean) && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          {podium.map((row, i) => row ? <PodiumCard key={row.register_number || i} row={row} /> : null)}
        </div>
      )}

      {me && (
        <div className={rankChange ? 'leaderboard-rank-changed' : ''} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', marginBottom: 24,
          borderRadius: 16, background: 'linear-gradient(135deg, var(--olive-700), var(--olive-900))', color: 'white',
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, minWidth: 60, textAlign: 'center' }}>
            {RANK_MEDAL_EMOJI[me.rank] || `#${me.rank}`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              Your rank
              {rankChange && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 800, color: rankChange === 'up' ? '#bbf7d0' : '#fecaca' }}>
                  {rankChange === 'up' ? <ArrowUp size={13} /> : <ArrowDown size={13} />} rank {rankChange === 'up' ? 'up' : 'down'}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{me.points} points · {me.problems_solved} problems · {me.aptitude_solved} aptitude · {me.streak}-day streak</div>
            <div style={{ maxWidth: 220 }}>
              <XpBar points={me.points} light />
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 16, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
       <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 8, padding: '10px 16px', fontSize: 11, fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-soft)' }}>
          <span>Rank</span>
          <span>Student</span>
          <span style={{ textAlign: 'right' }}>Points</span>
          {!isCompact && (
            <>
              <span style={{ textAlign: 'right' }}>Problems</span>
              <span style={{ textAlign: 'right' }}>Aptitude</span>
              <span style={{ textAlign: 'right' }}>Streak</span>
            </>
          )}
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-soft)', fontSize: 13 }}>No students yet.</div>
        ) : (
          (rest.length > 0 ? rest : leaderboard).map((row) => (
            <div
              key={row.register_number || row.rank}
              style={{
                display: 'grid', gridTemplateColumns: rowGrid, gap: 8, alignItems: 'center',
                padding: '12px 16px', borderBottom: '1px solid var(--bg-1)',
                background: row.is_you ? 'var(--sage-50)' : 'transparent',
                borderLeft: row.is_you ? '3px solid var(--olive-700)' : '3px solid transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, color: RANK_MEDAL_COLOR[row.rank] || 'var(--text-soft)' }}>
                {row.rank <= 3 ? <Medal size={16} /> : null} {row.rank}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--olive-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}{row.is_you ? ' (You)' : ''}
                </div>
                {isCompact ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-soft)' }}><Code2 size={11} /> {row.problems_solved}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-soft)' }}><Brain size={11} /> {row.aptitude_solved}</span>
                    <StreakChip streak={row.streak} />
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.register_number}{row.department ? ` · ${row.department}` : ''}{row.batch ? ` · ${row.batch}` : ''}
                  </div>
                )}
                <XpBar points={row.points} />
              </span>
              <span style={{ textAlign: 'right', fontWeight: 900, color: 'var(--olive-700)' }}>{row.points}</span>
              {!isCompact && (
                <>
                  <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <Code2 size={12} /> {row.problems_solved}
                  </span>
                  <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <Brain size={12} /> {row.aptitude_solved}
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <StreakChip streak={row.streak} />
                  </span>
                </>
              )}
            </div>
          ))
        )}
       </div>
      </div>
    </div>
  );
}
