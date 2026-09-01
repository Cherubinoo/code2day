import { useState } from 'react';
import { TrendingUp, Calendar } from 'lucide-react';

const PRESETS = [
  { key: '7', label: '7D', days: 7 },
  { key: '14', label: '14D', days: 14 },
  { key: '30', label: '30D', days: 30 },
];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function shortLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Shared "Weekly Solving Activity" bar chart + date-range filter, used by
 * both the HOD and Staff dashboards. `data` is the backend's
 * weekly_progress/weeklyActivity shape: [{ date, day, count }, ...].
 * `onRangeChange(startDate, endDate)` is called with ISO date strings
 * whenever the caller should refetch — either a preset or a custom range.
 */
export default function SolvingActivityChart({ data, onRangeChange, title = 'Weekly Solving Activity' }) {
  const [activePreset, setActivePreset] = useState('7');
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const series = data || [];
  const total = series.reduce((sum, d) => sum + (d.count || 0), 0);
  const avg = series.length ? (total / series.length) : 0;
  const maxCount = Math.max(...series.map(d => d.count || 0), 1);
  const showValueLabels = series.length <= 14;
  const labelStride = Math.max(1, Math.ceil(series.length / 10));

  const applyPreset = (preset) => {
    setActivePreset(preset.key);
    setShowCustom(false);
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (preset.days - 1));
    onRangeChange?.(toIsoDate(start), toIsoDate(end));
  };

  const applyCustom = () => {
    if (!customStart || !customEnd) return;
    setActivePreset('custom');
    onRangeChange?.(customStart, customEnd);
  };

  const rangeLabel = series.length > 0
    ? `${shortLabel(series[0].date)} – ${shortLabel(series[series.length - 1].date)}`
    : '';

  return (
    <div className="premium-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-hard)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} />
            {title}
          </h3>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: 13 }}>
            {total} solved{rangeLabel ? ` · ${rangeLabel}` : ''} · avg {avg.toFixed(1)}/day
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              style={{
                padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
                border: activePreset === p.key ? '1px solid var(--olive-700)' : '1px solid var(--border-soft)',
                background: activePreset === p.key ? 'var(--olive-700)' : 'white',
                color: activePreset === p.key ? 'white' : 'var(--text-soft)',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            title="Custom date range"
            style={{
              padding: '6px 10px', borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              border: activePreset === 'custom' ? '1px solid var(--olive-700)' : '1px solid var(--border-soft)',
              background: activePreset === 'custom' ? 'var(--olive-700)' : 'white',
              color: activePreset === 'custom' ? 'white' : 'var(--text-soft)',
            }}
          >
            <Calendar size={13} />
          </button>
        </div>
      </div>

      {showCustom && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0 4px', padding: 12, background: 'var(--bg-2)', borderRadius: 12 }}>
          <input
            type="date"
            value={customStart}
            max={toIsoDate(new Date())}
            onChange={(e) => setCustomStart(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', fontWeight: 600, fontSize: 13 }}
          />
          <span style={{ color: 'var(--text-soft)', fontSize: 13 }}>to</span>
          <input
            type="date"
            value={customEnd}
            max={toIsoDate(new Date())}
            onChange={(e) => setCustomEnd(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', fontWeight: 600, fontSize: 13 }}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!customStart || !customEnd}
            className="primary-button"
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13 }}
          >
            Apply
          </button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: series.length > 30 ? 2 : 6, height: 190, padding: '20px 4px 0', borderBottom: '1px solid var(--border-soft)' }}>
        {series.map((d, i) => {
          const heightPct = maxCount > 0 ? Math.max((d.count / maxCount) * 100, d.count > 0 ? 4 : 1) : 1;
          const showLabel = i % labelStride === 0 || i === series.length - 1;
          return (
            <div key={d.date || i} style={{ flex: 1, minWidth: series.length > 30 ? 2 : 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%' }}>
              {showValueLabels && (
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--olive-700)', minHeight: 12 }}>
                  {d.count > 0 ? d.count : ''}
                </div>
              )}
              <div
                title={`${shortLabel(d.date)}: ${d.count} solved`}
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  background: heightPct > 70 ? 'linear-gradient(180deg,#4f7942,#2d5016)' : heightPct > 30 ? 'linear-gradient(180deg,#7ca370,#4f7942)' : 'var(--sage-200)',
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                }}
              />
              {series.length <= 31 && (
                <div style={{ fontSize: 10, color: 'var(--text-soft)', fontWeight: 600, whiteSpace: 'nowrap', visibility: showLabel ? 'visible' : 'hidden' }}>
                  {series.length <= 10 ? (d.day || shortLabel(d.date)) : shortLabel(d.date)}
                </div>
              )}
            </div>
          );
        })}
        {series.length === 0 && (
          <div style={{ flex: 1, textAlign: 'center', color: 'var(--text-soft)', fontSize: 13, paddingBottom: 20 }}>No activity data yet.</div>
        )}
      </div>
    </div>
  );
}
