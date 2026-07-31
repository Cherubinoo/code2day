import { useState, useEffect, useRef } from 'react';
import { Activity, Users, Briefcase, Calendar, TrendingUp, Filter, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import AnimatedNumber from '../common/AnimatedNumber';

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeMax(arr, fallback = 0) {
  if (!arr || arr.length === 0) return fallback;
  const m = Math.max(...arr);
  return isFinite(m) ? m : fallback;
}

function Tooltip({ item, visible, x, y }) {
  if (!visible || !item) return null;
  return (
    <div style={{
      position: 'fixed',
      left: x + 14,
      top: y - 10,
      background: '#0f172a',
      color: 'white',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 12,
      fontWeight: 600,
      pointerEvents: 'none',
      zIndex: 9999,
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      minWidth: 160,
      lineHeight: 1.7,
      whiteSpace: 'nowrap',
    }}>
      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: '#94a3b8' }}>
        {item.display_date} ({item.day_name})
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#10b981', display: 'inline-block' }} />
        Students: <strong style={{ color: '#34d399' }}>{item.students}</strong>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#6366f1', display: 'inline-block' }} />
        Faculty: <strong style={{ color: '#818cf8' }}>{item.staff}</strong>
      </div>
      <div style={{ borderTop: '1px solid #1e293b', marginTop: 6, paddingTop: 6, color: '#94a3b8' }}>
        Total: <strong style={{ color: 'white' }}>{item.total}</strong>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const DAUAnalyticsChart = ({ institutions = [] }) => {
  const [selectedInstId, setSelectedInstId] = useState('');
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dauData, setDauData] = useState([]);
  const [tooltip, setTooltip] = useState({ visible: false, item: null, x: 0, y: 0 });

  useEffect(() => {
    fetchDAUData();
  }, [selectedInstId, days]);

  const fetchDAUData = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = `/admin/analytics/dau/?days=${days}${selectedInstId ? `&institution_id=${selectedInstId}` : ''}`;
      const res = await api.get(url);
      setDauData(res.data.daily_active_users || []);
    } catch (err) {
      console.error('Failed to fetch DAU data', err);
      setError('Failed to load analytics data.');
      setDauData([]);
    } finally {
      setLoading(false);
    }
  };

  // ── derived stats (all safe against empty array) ──────────────────────────
  const hasData = dauData.length > 0;
  const maxStudents = safeMax(dauData.map(d => d.students));
  const maxStaff    = safeMax(dauData.map(d => d.staff));
  const maxTotal    = safeMax(dauData.map(d => d.total), 10);
  const chartMax    = Math.max(maxTotal, 1); // never divide by 0

  const todayStat     = hasData ? dauData[dauData.length - 1] : { students: 0, staff: 0, total: 0 };
  const peakStudents  = maxStudents;
  const peakStaff     = maxStaff;

  // Y-axis gridline values (0, 25%, 50%, 75%, 100%)
  const gridLines = [0, 25, 50, 75, 100];

  const CHART_HEIGHT = 220; // px — bar area only, labels sit below

  return (
    <div style={{
      background: 'white',
      borderRadius: 24,
      padding: 32,
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
      marginBottom: 48,
    }}>
      {/* ── HEADER & FILTERS ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 28,
      }}>
        <div>
          <h2 style={{
            fontSize: '1.35rem', fontWeight: 900, color: '#0f172a',
            margin: 0, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Activity size={22} style={{ color: '#10b981' }} />
            Daily Active Users (DAU)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.88rem' }}>
            Institution-wise daily active students vs faculty
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Institution filter */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#f8fafc', padding: '7px 12px', borderRadius: 10, border: '1px solid #e2e8f0',
          }}>
            <Filter size={14} color="#64748b" />
            <select
              value={selectedInstId}
              onChange={e => setSelectedInstId(e.target.value)}
              style={{
                background: 'transparent', border: 'none', fontWeight: 700,
                fontSize: '0.83rem', color: '#334155', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">All Institutions</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          </div>

          {/* Day range toggle */}
          <div style={{ display: 'flex', gap: 3, background: '#f1f5f9', padding: 3, borderRadius: 10 }}>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none',
                  background: days === d ? '#0f172a' : 'transparent',
                  color: days === d ? 'white' : '#64748b',
                  fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                }}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchDAUData}
            disabled={loading}
            style={{
              width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0',
              background: 'white', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b',
            }}
            title="Refresh"
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── SUMMARY STATS ────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 14,
        marginBottom: 28,
        background: '#f8fafc',
        padding: 18,
        borderRadius: 14,
        border: '1px solid #e2e8f0',
      }}>
        {[
          { label: 'Active Students Today', value: todayStat.students, color: '#10b981', bg: 'rgba(16,185,129,0.12)', Icon: Users },
          { label: 'Active Faculty Today',  value: todayStat.staff,    color: '#6366f1', bg: 'rgba(99,102,241,0.12)', Icon: Briefcase },
          { label: `Peak Students (${days}d)`, value: peakStudents,   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', Icon: TrendingUp },
          { label: `Peak Faculty (${days}d)`,  value: peakStaff,      color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', Icon: Calendar },
        ].map(({ label, value, color, bg, Icon }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 11, background: bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0,
            }}>
              <Icon size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, marginBottom: 1 }}>{label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                <AnimatedNumber value={value} duration={0.8} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── LEGEND ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16, fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#10b981' }} />
          Students
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: '#6366f1' }} />
          Faculty
        </div>
      </div>

      {/* ── CHART ────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{
          height: CHART_HEIGHT + 36, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600,
          background: '#f8fafc', borderRadius: 12,
        }}>
          <RefreshCw size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} />
          Loading analytics...
        </div>
      ) : error ? (
        <div style={{
          height: CHART_HEIGHT + 36, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#ef4444', fontSize: '0.9rem', fontWeight: 600,
          background: '#fff5f5', borderRadius: 12, border: '1px solid #fecaca',
        }}>
          {error}
        </div>
      ) : !hasData ? (
        <div style={{
          height: CHART_HEIGHT + 36, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600,
          background: '#f8fafc', borderRadius: 12,
        }}>
          No activity data for this period.
        </div>
      ) : (
        <div style={{ position: 'relative', userSelect: 'none' }}>
          {/* Y-axis gridlines */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', paddingBottom: 36 }}>
            {gridLines.map(pct => (
              <div
                key={pct}
                style={{
                  position: 'absolute',
                  left: 0, right: 0,
                  bottom: `${pct}%`,
                  borderTop: pct === 0 ? '2px solid #cbd5e1' : '1px dashed #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <span style={{
                  fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700,
                  position: 'absolute', right: '100%', paddingRight: 6, whiteSpace: 'nowrap',
                }}>
                  {pct === 0 ? '' : Math.round((pct / 100) * chartMax)}
                </span>
              </div>
            ))}
          </div>

          {/* Bar columns */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            height: CHART_HEIGHT + 36, // bars + label area
            paddingLeft: 28,           // space for y-axis labels
            gap: days <= 7 ? 14 : days <= 14 ? 8 : 4,
            paddingBottom: 0,
            overflowX: 'auto',
          }}>
            {dauData.map((item, idx) => {
              const studentH = Math.max((item.students / chartMax) * CHART_HEIGHT, item.students > 0 ? 4 : 0);
              const staffH   = Math.max((item.staff    / chartMax) * CHART_HEIGHT, item.staff    > 0 ? 4 : 0);
              const isWeekend = item.day_name === 'Sat' || item.day_name === 'Sun';

              return (
                <div
                  key={idx}
                  onMouseEnter={e => setTooltip({ visible: true, item, x: e.clientX, y: e.clientY })}
                  onMouseMove={e  => setTooltip(t => ({ ...t, x: e.clientX, y: e.clientY }))}
                  onMouseLeave={() => setTooltip({ visible: false, item: null, x: 0, y: 0 })}
                  style={{
                    flex: '1 1 0',
                    minWidth: days <= 7 ? 40 : days <= 14 ? 28 : 18,
                    maxWidth: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    height: CHART_HEIGHT + 36,
                    cursor: 'pointer',
                    borderRadius: 6,
                    padding: '0 1px',
                    background: isWeekend ? 'rgba(241,245,249,0.5)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  {/* Bars (fixed-height chart area) */}
                  <div style={{
                    width: '100%',
                    height: CHART_HEIGHT,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    gap: 2,
                  }}>
                    {/* Student bar */}
                    <div style={{
                      flex: 1,
                      maxWidth: 14,
                      height: studentH,
                      background: 'linear-gradient(180deg, #34d399 0%, #10b981 100%)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                    {/* Staff bar */}
                    <div style={{
                      flex: 1,
                      maxWidth: 14,
                      height: staffH,
                      background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    }} />
                  </div>

                  {/* Date label */}
                  <div style={{
                    height: 36,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 4,
                  }}>
                    <div style={{
                      fontSize: days <= 7 ? '0.72rem' : '0.62rem',
                      fontWeight: 700,
                      color: isWeekend ? '#94a3b8' : '#475569',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      maxWidth: '100%',
                      textAlign: 'center',
                    }}>
                      {days <= 14 ? item.display_date : item.day_name}
                    </div>
                    {days <= 14 && (
                      <div style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 600 }}>
                        {item.day_name}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tooltip (portal-style fixed positioning) */}
      <Tooltip {...tooltip} />

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default DAUAnalyticsChart;
