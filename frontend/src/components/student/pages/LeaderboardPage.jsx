import { useState, useEffect } from 'react';
import { Crown, Medal, Flame, Code2, Zap, CalendarCheck, Loader2, ArrowUp, ArrowDown, ChevronDown, Gamepad2 } from 'lucide-react';

const RANK_MEDAL_COLOR = { 1: '#f59e0b', 2: '#94a3b8', 3: '#b45309' };
const RANK_MEDAL_EMOJI = { 1: '🥇', 2: '🥈', 3: '🥉' };
const ROW_GRID_FULL = '48px minmax(140px,1fr) 60px 56px 52px 60px';
const ROW_GRID_COMPACT = '36px minmax(0,1fr) 56px';
const LAST_RANK_KEY = 'code2day-leaderboard-last-rank';
const PAGE_SIZES = [10, 25, 50, 100];

// A small, flat "Lv N" pill — replaces the old full-width XP progress bar
// that used to render on every single row (heavy for a list of 100
// students). `level`/`level_progress` now come straight from the backend
// (StudentLeaderboardView computes them off a capped, curved level formula
// — small point gaps for the first few levels, much larger ones near the
// level-99 ceiling — instead of the old flat "every 100 points" scheme,
// which had no cap and made "Level 47" a meaningless number).
function LevelPill({ level, levelMax, light = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 800,
      padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap',
      color: light ? 'white' : levelMax ? '#92400e' : 'var(--olive-700)',
      background: light ? 'rgba(255,255,255,0.2)' : levelMax ? '#fef3c7' : 'var(--bg-1)',
      border: light ? 'none' : levelMax ? '1px solid #fde68a' : '1px solid var(--border-soft)',
    }}>
      {levelMax ? '★ ' : ''}Lv {level}
    </span>
  );
}

function XpBar({ progress, height = 5 }) {
  return (
    <div style={{
      flex: 1, height, borderRadius: height, minWidth: 32, overflow: 'hidden',
      background: 'rgba(255,255,255,0.25)',
    }}>
      <div style={{
        width: `${progress}%`, height: '100%', borderRadius: height, transition: 'width 0.6s ease',
        background: 'rgba(255,255,255,0.9)',
      }} />
    </div>
  );
}

function StreakChip({ streak }) {
  const active = streak > 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999,
      fontSize: 11, fontWeight: 800, color: active ? '#ea580c' : 'var(--text-soft)',
      background: active ? 'rgba(234, 88, 12, 0.1)' : 'var(--bg-1)',
    }}>
      <Flame size={11} color={active ? '#ea580c' : undefined} /> {streak}
    </span>
  );
}

// Flat, compact podium — the old version scaled/floated #1 up with a big
// drop shadow, which read as heavy for what's really just three small
// cards. This keeps the medal-color border as the only per-rank accent.
function PodiumCard({ row }) {
  if (!row) return null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      padding: '10px 14px', borderRadius: 14, minWidth: 96,
      background: 'white', border: `1.5px solid ${RANK_MEDAL_COLOR[row.rank]}`,
    }}>
      <div style={{ fontSize: 20 }}>{RANK_MEDAL_EMOJI[row.rank]}</div>
      <div style={{
        fontWeight: 800, fontSize: 12.5, color: 'var(--olive-950)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100, textAlign: 'center',
      }}>
        {row.name}
      </div>
      <div style={{ fontWeight: 900, fontSize: 14, color: RANK_MEDAL_COLOR[row.rank] }}>
        {row.points} pts
      </div>
      <LevelPill level={row.level} levelMax={row.level_max} />
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
  const [limit, setLimit] = useState(10);
  const [department, setDepartment] = useState('');
  const [refetching, setRefetching] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 640px)');
    const handleChange = () => setIsCompact(mql.matches);
    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefetching(true);
    (async () => {
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (department) params.set('department', department);
        const res = await fetch(`/api/student/leaderboard/?${params.toString()}`, { credentials: 'include' });
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
        if (!cancelled) { setLoading(false); setRefetching(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [limit, department]);

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-soft)' }}>
        <Loader2 size={18} className="spin" style={{ marginRight: 10 }} /> Loading leaderboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#dc2626' }}>{error}</div>
    );
  }

  const { leaderboard = [], total_students = 0, available_departments = [], max_level = 99 } = data || {};
  const podium = [leaderboard.find((r) => r.rank === 2), leaderboard.find((r) => r.rank === 1), leaderboard.find((r) => r.rank === 3)];
  const rest = leaderboard.filter((r) => r.rank > 3);
  const rowGrid = isCompact ? ROW_GRID_COMPACT : ROW_GRID_FULL;
  const canShowMore = limit < 100 && leaderboard.length >= limit && leaderboard.length < total_students;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '18px 16px 48px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Crown size={20} color="#f59e0b" />
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: 'var(--olive-950)' }}>Institution Leaderboard</h1>
      </div>
      <p style={{ margin: '0 0 14px', color: 'var(--text-soft)', fontSize: 12.5 }}>
        {total_students} student{total_students !== 1 ? 's' : ''}{department ? ' in this department' : ''} · levels run 1–{max_level}, ranked by problems, aptitude, contests, streak &amp; SQL Frog XP combined
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          style={{
            padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-soft)',
            fontSize: 12.5, fontWeight: 700, color: 'var(--olive-900)', background: 'white', cursor: 'pointer',
          }}
        >
          <option value="">All Departments</option>
          {available_departments.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
        {refetching && <Loader2 size={16} className="spin" style={{ color: 'var(--text-soft)', alignSelf: 'center' }} />}
      </div>

      {podium.some(Boolean) && (
        <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {podium.map((row, i) => row ? <PodiumCard key={row.register_number || i} row={row} /> : null)}
        </div>
      )}

      {me && (
        <div className={rankChange ? 'leaderboard-rank-changed' : ''} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 16,
          borderRadius: 12, background: 'linear-gradient(135deg, var(--olive-700), var(--olive-900))', color: 'white',
        }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, minWidth: 44, textAlign: 'center' }}>
            {RANK_MEDAL_EMOJI[me.rank] || `#${me.rank}`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              You · {me.points} pts
              <LevelPill level={me.level} levelMax={me.level_max} light />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 800, opacity: 0.85 }}>
                <Gamepad2 size={11} /> SQL Rank #{me.sql_rank}
              </span>
              {rankChange && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 800, color: rankChange === 'up' ? '#bbf7d0' : '#fecaca' }}>
                  {rankChange === 'up' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 1 }}>
              {me.problems_solved} problems ({me.solved_today} today) · {me.xp} SQL XP · {me.streak}-day streak
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: 260, marginTop: 4 }}>
              <XpBar progress={me.level_progress} />
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.8, whiteSpace: 'nowrap' }}>
                {me.level_max ? 'Max level' : `${me.points_into_level}/${me.points_for_level} to Lv ${me.level + 1}`}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
       <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: rowGrid, gap: 6, padding: '7px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-soft)' }}>
          <span>#</span>
          <span>Student</span>
          <span style={{ textAlign: 'right' }}>Pts</span>
          {!isCompact && (
            <>
              <span style={{ textAlign: 'right' }} title="Problems solved today">
                <CalendarCheck size={11} style={{ verticalAlign: '-2px' }} />
              </span>
              <span style={{ textAlign: 'right' }} title="SQL Frog XP">
                <Zap size={11} style={{ verticalAlign: '-2px' }} />
              </span>
              <span style={{ textAlign: 'right' }}>Streak</span>
            </>
          )}
        </div>
        {leaderboard.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-soft)', fontSize: 13 }}>No students yet.</div>
        ) : (
          (rest.length > 0 ? rest : leaderboard).map((row) => (
            <div
              key={row.register_number || row.rank}
              style={{
                display: 'grid', gridTemplateColumns: rowGrid, gap: 6, alignItems: 'center',
                padding: '7px 12px', borderBottom: '1px solid var(--bg-1)',
                background: row.is_you ? 'var(--sage-50)' : 'transparent',
                borderLeft: row.is_you ? '2px solid var(--olive-700)' : '2px solid transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontWeight: 800, fontSize: 12.5, color: RANK_MEDAL_COLOR[row.rank] || 'var(--text-soft)' }}>
                {row.rank <= 3 ? <Medal size={13} /> : null} {row.rank}
              </span>
              <span style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--olive-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.name}{row.is_you ? ' (You)' : ''}
                  </span>
                  <LevelPill level={row.level} levelMax={row.level_max} />
                </div>
                {isCompact ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, color: 'var(--text-soft)' }}><Code2 size={10} /> {row.problems_solved}<span style={{ opacity: 0.7 }}>({row.solved_today}td)</span></span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10.5, color: 'var(--text-soft)' }}><Zap size={10} /> {row.xp}</span>
                    <StreakChip streak={row.streak} />
                  </div>
                ) : (
                  <div style={{ fontSize: 10.5, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Code2 size={10} style={{ verticalAlign: '-1px' }} /> {row.problems_solved} solved{row.department ? ` · ${row.department}` : ''}
                  </div>
                )}
              </span>
              <span style={{ textAlign: 'right', fontWeight: 900, fontSize: 13, color: 'var(--olive-700)' }}>{row.points}</span>
              {!isCompact && (
                <>
                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-soft)' }}>{row.solved_today}</span>
                  <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-soft)' }}>{row.xp}</span>
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

      {canShowMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setLimit((prev) => PAGE_SIZES.find((size) => size > prev) || 100)}
            disabled={refetching}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
              border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-700)',
              fontSize: 12.5, fontWeight: 700, cursor: refetching ? 'default' : 'pointer',
            }}
          >
            <ChevronDown size={14} /> Show more ({Math.min(total_students, PAGE_SIZES.find((size) => size > limit) || 100)} of {total_students})
          </button>
        </div>
      )}
      {limit > 10 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setLimit(10)}
            style={{ background: 'none', border: 'none', color: 'var(--text-soft)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
          >
            Back to top 10
          </button>
        </div>
      )}
    </div>
  );
}
