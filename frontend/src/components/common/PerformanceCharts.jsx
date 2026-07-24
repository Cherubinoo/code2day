import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Bar, Line, Pie, Radar } from 'react-chartjs-2';
import AnimatedNumber from './AnimatedNumber';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  TimeScale,
  Tooltip
);

const DARK_BG = '#0d1117';
const DARK_CARD = '#161b27';
const ACCENT = '#2D6A4F';

// ── Score History Line Chart ───────────────────────────────────────────────────
export function ScoreLineChart({ data, avgScore }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, fontStyle: 'italic' }}>
        No test history yet
      </div>
    );
  }

  const W = 580, H = 210;
  const PL = 38, PR = 16, PT = 16, PB = 32;
  const CW = W - PL - PR, CH = H - PT - PB;
  const n = data.length;

  const xOf = i => PL + (n > 1 ? i / (n - 1) : 0.5) * CW;
  const yOf = v => PT + CH - (Math.max(0, Math.min(v, 100)) / 100) * CH;

  const pts = data.map((d, i) => [xOf(i), yOf(d.score_pct)]);
  const lineD = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${xOf(n - 1).toFixed(1)},${(PT + CH).toFixed(1)} L${xOf(0).toFixed(1)},${(PT + CH).toFixed(1)} Z`;

  const avgY = yOf(avgScore || 0);

  // X label indices: up to 6 evenly spaced + first + last
  const step = n <= 5 ? 1 : n <= 10 ? 2 : Math.ceil(n / 5);
  const xIdxs = [...new Set([0, ...Array.from({ length: n }, (_, i) => i).filter(i => i % step === 0), n - 1])];

  const hov = hoverIdx !== null ? data[hoverIdx] : null;
  const hovX = hoverIdx !== null ? xOf(hoverIdx) : 0;
  const hovY = hoverIdx !== null ? yOf(data[hoverIdx].score_pct) : 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Chart area bg */}
      <rect x={PL} y={PT} width={CW} height={CH} rx={3} fill={DARK_CARD} />

      {/* Y-axis grid + labels */}
      {[0, 25, 50, 75, 100].map(v => {
        const y = yOf(v);
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={PL + CW} y2={y}
              stroke="rgba(255,255,255,0.06)" strokeWidth={1}
              strokeDasharray={v === 0 ? '' : '3,5'} />
            <text x={PL - 5} y={y + 3.5} textAnchor="end"
              fill="rgba(255,255,255,0.28)" fontSize={8.5} fontFamily="monospace">{v}</text>
          </g>
        );
      })}

      {/* Average dashed line */}
      <line x1={PL} y1={avgY} x2={PL + CW} y2={avgY}
        stroke="rgba(255,255,255,0.38)" strokeWidth={1} strokeDasharray="5,4" />

      {/* Area fill under line */}
      <path d={areaD} fill="rgba(255,255,255,0.06)" />

      {/* The line itself */}
      <path d={lineD} fill="none" stroke="white" strokeWidth={2.2}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Hover vertical guide */}
      {hoverIdx !== null && (
        <line x1={hovX} y1={PT} x2={hovX} y2={PT + CH}
          stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
      )}

      {/* Dots + invisible hit areas */}
      {pts.map(([x, y], i) => (
        <g key={i}
          onMouseEnter={() => setHoverIdx(i)}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ cursor: 'crosshair' }}
        >
          <rect x={x - 10} y={PT} width={20} height={CH} fill="transparent" />
          <circle cx={x} cy={y} r={hoverIdx === i ? 5 : 3}
            fill="white" stroke={DARK_CARD} strokeWidth={1.5} />
        </g>
      ))}

      {/* X-axis labels */}
      {xIdxs.map(i => (
        <text key={i} x={xOf(i)} y={H - 7}
          textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={8.5}>
          {data[i].label}
        </text>
      ))}

      {/* Tooltip */}
      {hov && (() => {
        const tx = Math.max(60, Math.min(W - 68, hovX));
        const ty = hovY > PT + 60 ? hovY - 44 : hovY + 12;
        return (
          <g pointerEvents="none">
            <rect x={tx - 58} y={ty} width={116} height={36} rx={6}
              fill="#0d1117" stroke="rgba(255,255,255,0.15)" strokeWidth={0.8} />
            <text x={tx} y={ty + 14} textAnchor="middle"
              fill="white" fontSize={11} fontWeight="bold">
              {hov.label}: {Number(hov.score_pct).toFixed(1)}%
            </text>
            <text x={tx} y={ty + 27} textAnchor="middle"
              fill="rgba(255,255,255,0.4)" fontSize={8.5}>
              {(hov.title || '').slice(0, 24)}{(hov.title || '').length > 24 ? '…' : ''}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Topic Accuracy Radar Chart ─────────────────────────────────────────────────
// `onSelect(item)` is optional — when given, dots and labels become clickable
// (with a generous invisible hit-area) so the caller can show a detail view
// for whichever topic the student picks.
export function TopicRadarChart({ data, onSelect, selectedTopic }) {
  const items = (data || []).slice(0, 14);

  if (items.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, fontStyle: 'italic' }}>
        No topic data yet
      </div>
    );
  }

  const S = 300, CX = 150, CY = 150, R = 90;
  const N = items.length;
  const ang = i => (i / N) * 2 * Math.PI - Math.PI / 2;
  const polar = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const toPath = pts => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z';

  const gridPts = level => items.map((_, i) => polar(R * level, ang(i)));
  const dataPts = items.map((d, i) => polar((d.accuracy / 100) * R, ang(i)));

  return (
    <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Grid polygons */}
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <path key={lv} d={toPath(gridPts(lv))}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}

      {/* Spokes */}
      {items.map((_, i) => {
        const [x, y] = polar(R, ang(i));
        return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}
          stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
      })}

      {/* Data polygon */}
      <path d={toPath(dataPts)} fill={`${ACCENT}44`} stroke={ACCENT} strokeWidth={2} />

      {/* Data dots */}
      {dataPts.map(([x, y], i) => {
        const isSelected = selectedTopic === items[i].topic;
        return (
          <g key={i}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={onSelect ? () => onSelect(items[i]) : undefined}
          >
            {onSelect && <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={14} fill="transparent" />}
            <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={isSelected ? 5.5 : 3.5}
              fill={isSelected ? '#4ade80' : ACCENT} stroke="rgba(255,255,255,0.2)" strokeWidth={0.8} />
          </g>
        );
      })}

      {/* Labels */}
      {items.map((d, i) => {
        const a = ang(i);
        const [lx, ly] = polar(R + 17, a);
        const anchor = lx > CX + 6 ? 'start' : lx < CX - 6 ? 'end' : 'middle';
        const label = d.topic.length > 16 ? d.topic.slice(0, 15) + '…' : d.topic;
        const isSelected = selectedTopic === d.topic;
        return (
          <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} dy={3}
            textAnchor={anchor} fill={isSelected ? '#4ade80' : 'rgba(255,255,255,0.5)'}
            fontSize={7} fontWeight={isSelected ? 800 : 600}
            style={onSelect ? { cursor: 'pointer' } : undefined}
            onClick={onSelect ? () => onSelect(d) : undefined}
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Difficulty Distribution Bar Chart ──────────────────────────────────────────
export function DifficultyDistributionChart({ easy, medium, hard }) {
  const rows = [
    { label: 'Easy', value: easy || 0, color: '#4ade80' },
    { label: 'Medium', value: medium || 0, color: '#fbbf24' },
    { label: 'Hard', value: hard || 0, color: '#f87171' },
  ];
  const max = Math.max(1, ...rows.map(r => r.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 36px', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</span>
          <div style={{ height: 14, borderRadius: 7, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              width: `${(r.value / max) * 100}%`,
              height: '100%',
              background: r.color,
              borderRadius: 7,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, color: 'white', textAlign: 'right' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Ranked Horizontal Bar Chart ────────────────────────────────────────────────
// Generic label/value ranking (e.g. companies by problems solved). `onSelect`
// is optional — when given, each bar/label becomes clickable.
export function RankedBarChart({ items, onSelect, selected, color = ACCENT, emptyText = 'No data yet' }) {
  const rows = (items || []).slice(0, 10);
  if (rows.length === 0) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, fontStyle: 'italic' }}>
        {emptyText}
      </div>
    );
  }
  const max = Math.max(1, ...rows.map(r => r.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map(r => {
        const isSelected = selected === r.label;
        return (
          <div key={r.label}
            onClick={onSelect ? () => onSelect(r) : undefined}
            style={{
              display: 'grid', gridTemplateColumns: '110px 1fr 30px', alignItems: 'center', gap: 12,
              cursor: onSelect ? 'pointer' : 'default',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 800, color: isSelected ? '#4ade80' : 'rgba(255,255,255,0.55)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {r.label}
            </span>
            <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                width: `${(r.value / max) * 100}%`,
                height: '100%',
                background: isSelected ? '#4ade80' : color,
                borderRadius: 6,
                transition: 'width 0.5s ease, background 0.2s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'white', textAlign: 'right' }}>{r.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Combined Performance Dashboard Panel ──────────────────────────────────────
export function LegacyPerformanceDashboard({ scoreHistory, topicAccuracy, testsCompleted, avgScore, peakScore }) {
  const isAbovePar = (avgScore || 0) >= 60;

  return (
    <div style={{ background: '#111827', borderRadius: 20, padding: '24px 28px', marginBottom: 28 }}>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard
          label="TESTS COMPLETED"
          value={testsCompleted || 0}
          sub="All attempts graded"
          subColor="rgba(255,255,255,0.35)"
          valueColor="#e2e8f0"
          icon={<BookIcon />}
        />
        <StatCard
          label="AVERAGE SCORE"
          value={`${(avgScore || 0).toFixed(2)}%`}
          sub={isAbovePar ? 'Above Par' : 'Below Par'}
          subColor={isAbovePar ? '#4ade80' : '#fbbf24'}
          valueColor={isAbovePar ? '#4ade80' : '#fbbf24'}
          icon={<PctIcon />}
          note="Passing threshold is set to 60%"
        />
        <StatCard
          label="PEAK SCORE"
          value={`${(peakScore || 0).toFixed(2)}%`}
          sub="Highest score achieved"
          subColor="rgba(255,255,255,0.35)"
          valueColor="#c084fc"
          icon={<TrophyIcon />}
        />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20 }}>
        {/* Line chart */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              PERFORMANCE TREND
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2 }}>Score History</div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginBottom: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'white', display: 'inline-block' }} />
              Score %
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 16, height: 0, borderTop: '2px dashed rgba(255,255,255,0.4)', display: 'inline-block' }} />
              Average ({(avgScore || 0).toFixed(2)}%)
            </span>
          </div>
          <ScoreLineChart data={scoreHistory} avgScore={avgScore} />
        </div>

        {/* Radar chart */}
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              SKILLS PROFILER
            </div>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2 }}>Topic Accuracy</div>
          </div>
          <TopicRadarChart data={topicAccuracy} />
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
            Accuracy mapping based on category performance
          </div>
        </div>
      </div>
    </div>
  );
}

export function PerformanceDashboard({
  scoreHistory,
  topicAccuracy,
  testsCompleted,
  solvedCount = 0,
  aptitude,
  overallPerformance,
  profileRadar,
  dailySolvedTrend,
  knowledgeDistribution,
  contestPerformance,
  summaryCards,
}) {
  const contestRows = (contestPerformance || scoreHistory || []).map((item) => ({
    ...item,
    solved: item.solved ?? Math.round((Number(item.score_pct) || 0) / 20),
    total: item.total ?? 5,
  }));

  const solvedSummary = {
    programming_solved: summaryCards?.programming_solved ?? solvedCount ?? 0,
    aptitude_solved: summaryCards?.aptitude_solved ?? aptitude?.solved ?? 0,
    contest_solved: summaryCards?.contest_solved ?? contestRows.reduce((sum, c) => sum + (Number(c.solved) || 0), 0),
    active_days: summaryCards?.active_days ?? 0,
  };

  const pieRows = (overallPerformance?.length ? overallPerformance : [
    { label: 'Programming', value: solvedSummary.programming_solved },
    { label: 'Aptitude', value: solvedSummary.aptitude_solved },
    { label: 'Contest', value: solvedSummary.contest_solved },
  ]).filter((row) => Number(row.value) > 0);

  const trendRows = dailySolvedTrend || [];
  const topicLabels = knowledgeDistribution?.labels || (topicAccuracy || []).slice(0, 8).map((t) => t.topic);
  const topicProgramming = knowledgeDistribution?.programming || topicLabels.map(() => 0);
  const topicAptitude = knowledgeDistribution?.aptitude || (topicAccuracy || []).slice(0, 8).map((t) => t.correct || t.accuracy || 0);
  const profileLabels = profileRadar?.labels || ['Programming', 'Aptitude', 'Contest', 'Daily', 'Overall'];
  const profileDaily = profileRadar?.daily || [0, 0, 0, 0, 0];
  const profileOverall = profileRadar?.overall || [0, aptitude?.percentage || 0, 0, 0, 0];

  const chartText = '#cbd5e1';
  const grid = 'rgba(255,255,255,0.08)';
  const plugins = {
    legend: {
      position: 'bottom',
      labels: { color: chartText, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 11, weight: '700' } },
    },
    tooltip: {
      backgroundColor: '#0f172a',
      borderColor: 'rgba(255,255,255,0.14)',
      borderWidth: 1,
      titleColor: '#fff',
      bodyColor: '#dbeafe',
    },
  };
  const animation = { duration: 900, easing: 'easeOutQuart' };

  return (
    <div style={{ background: '#111827', borderRadius: 20, padding: '24px 28px', marginBottom: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard
          label="PROGRAMMING"
          value={solvedSummary.programming_solved}
          sub="Problems solved"
          subColor="rgba(255,255,255,0.45)"
          valueColor="#4ade80"
          icon={<BookIcon />}
        />
        <StatCard
          label="APTITUDE"
          value={solvedSummary.aptitude_solved}
          sub={`${(aptitude?.percentage || 0).toFixed(1)}% bank progress`}
          subColor="#93c5fd"
          valueColor="#60a5fa"
          icon={<PctIcon />}
        />
        <StatCard
          label="CONTEST"
          value={solvedSummary.contest_solved}
          sub={`${contestRows.length || testsCompleted || 0} participations`}
          subColor="rgba(255,255,255,0.45)"
          valueColor="#fbbf24"
          icon={<TrophyIcon />}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 20 }}>
        <ChartPanel kicker="OVERALL PERFORMANCE" title="Programming, Aptitude, Contest">
          {pieRows.length ? (
            <Pie
              data={{
                labels: pieRows.map((row) => row.label),
                datasets: [{
                  data: pieRows.map((row) => row.value),
                  backgroundColor: ['#4ade80', '#60a5fa', '#fbbf24'],
                  borderColor: '#111827',
                  borderWidth: 2,
                  hoverOffset: 10,
                }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, animation, plugins }}
            />
          ) : <EmptyChart text="No solved data yet" />}
        </ChartPanel>

        <ChartPanel kicker="PROFILE RADAR" title="Daily vs Overall Performance">
          <Radar
            data={{
              labels: profileLabels,
              datasets: [
                {
                  label: 'Daily',
                  data: profileDaily,
                  borderColor: '#f97316',
                  backgroundColor: 'rgba(249,115,22,0.18)',
                  pointBackgroundColor: '#f97316',
                  borderWidth: 2,
                  fill: true,
                },
                {
                  label: 'Overall',
                  data: profileOverall,
                  borderColor: '#22c55e',
                  backgroundColor: 'rgba(34,197,94,0.16)',
                  pointBackgroundColor: '#22c55e',
                  borderWidth: 2,
                  fill: true,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              animation,
              scales: {
                r: {
                  min: 0,
                  max: 100,
                  angleLines: { color: grid },
                  grid: { color: grid },
                  pointLabels: { color: chartText, font: { size: 11, weight: '700' } },
                  ticks: { display: false, stepSize: 25 },
                },
              },
              plugins,
            }}
          />
        </ChartPanel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        <ChartPanel kicker="SOLVED TIME SCALE" title="Daily and Overall Solved">
          {trendRows.length ? (
            <Line
              data={{
                datasets: [
                  {
                    label: 'Programming',
                    data: trendRows.map((row) => ({ x: row.date, y: row.programming })),
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74,222,128,0.16)',
                    tension: 0.35,
                    fill: true,
                  },
                  {
                    label: 'Aptitude',
                    data: trendRows.map((row) => ({ x: row.date, y: row.aptitude })),
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(96,165,250,0.12)',
                    tension: 0.35,
                  },
                  {
                    label: 'Overall',
                    data: trendRows.map((row) => ({ x: row.date, y: row.overall_total })),
                    borderColor: '#fbbf24',
                    backgroundColor: 'rgba(251,191,36,0.1)',
                    borderDash: [5, 5],
                    tension: 0.3,
                    yAxisID: 'y1',
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation,
                interaction: { mode: 'index', intersect: false },
                scales: {
                  x: {
                    type: 'time',
                    time: { unit: 'day', tooltipFormat: 'PP' },
                    ticks: { color: chartText, maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
                    grid: { color: grid },
                  },
                  y: {
                    beginAtZero: true,
                    ticks: { color: chartText, precision: 0 },
                    grid: { color: grid },
                  },
                  y1: {
                    beginAtZero: true,
                    position: 'right',
                    ticks: { color: '#fbbf24', precision: 0 },
                    grid: { drawOnChartArea: false },
                  },
                },
                plugins,
              }}
            />
          ) : <EmptyChart text="No daily solving history yet" />}
        </ChartPanel>

        <ChartPanel kicker="KNOWLEDGE DISTRIBUTION" title="Programming and Aptitude Topics">
          {topicLabels.length ? (
            <Bar
              data={{
                labels: topicLabels,
                datasets: [
                  {
                    label: 'Programming',
                    data: topicProgramming,
                    backgroundColor: '#2dd4bf',
                    borderRadius: 8,
                    borderSkipped: false,
                  },
                  {
                    label: 'Aptitude',
                    data: topicAptitude,
                    backgroundColor: '#818cf8',
                    borderRadius: 8,
                    borderSkipped: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation,
                scales: {
                  x: { stacked: true, ticks: { color: chartText, maxRotation: 35 }, grid: { display: false } },
                  y: { stacked: true, beginAtZero: true, ticks: { color: chartText, precision: 0 }, grid: { color: grid } },
                },
                plugins,
              }}
            />
          ) : <EmptyChart text="No topic solving data yet" />}
        </ChartPanel>
      </div>

      <div style={{ marginTop: 20 }}>
        <ChartPanel kicker="CONTEST PERFORMANCE" title="Contest Solved Trend" height={220}>
          {contestRows.length ? (
            <Bar
              data={{
                labels: contestRows.map((row) => row.label || row.title),
                datasets: [
                  {
                    label: 'Solved',
                    data: contestRows.map((row) => row.solved || 0),
                    backgroundColor: '#f59e0b',
                    borderRadius: 8,
                    borderSkipped: false,
                  },
                  {
                    label: 'Total',
                    data: contestRows.map((row) => row.total || 0),
                    backgroundColor: 'rgba(148,163,184,0.35)',
                    borderRadius: 8,
                    borderSkipped: false,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                animation,
                scales: {
                  x: { ticks: { color: chartText }, grid: { display: false } },
                  y: { beginAtZero: true, ticks: { color: chartText, precision: 0 }, grid: { color: grid } },
                },
                plugins,
              }}
            />
          ) : <EmptyChart text="No contest performance yet" />}
        </ChartPanel>
      </div>
    </div>
  );
}

function ChartPanel({ kicker, title, children, height = 260 }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
          {kicker}
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2 }}>{title}</div>
      </div>
      <div style={{
        height,
        padding: 12,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        {children}
      </div>
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.28)', fontSize: 13, fontStyle: 'italic' }}>
      {text}
    </div>
  );
}

// ── Aptitude Progress Radar (large, filterable) ───────────────────────────────
export function AptitudeProgressRadar({ topicAccuracy, topicAccuracyPractice }) {
  const [mode, setMode] = useState('contest'); // 'contest' | 'study'
  const [activeCategory, setActiveCategory] = useState('All');
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const contestData = topicAccuracy || [];
  const studyData = topicAccuracyPractice || [];

  const activeData = mode === 'study' ? studyData : contestData;
  const categories = useMemo(() => {
    const cats = activeData.map(t => t.category).filter(Boolean);
    return ['All', ...Array.from(new Set(cats))];
  }, [activeData]);

  const filtered = useMemo(() => {
    const base = activeCategory === 'All' ? activeData : activeData.filter(t => t.category === activeCategory);
    return base.slice(0, 12);
  }, [activeCategory, activeData]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => b.accuracy - a.accuracy), [filtered]);
  const strongest = sorted[0] || null;
  const needsWork = useMemo(() => sorted.slice().reverse().filter(t => t.accuracy < 60).slice(0, 4), [sorted]);
  const avgAcc = filtered.length ? Math.round(filtered.reduce((s, t) => s + t.accuracy, 0) / filtered.length) : 0;

  const S = 440, CX = 220, CY = 220, R = 148;
  const N = filtered.length;
  const ang = i => (i / (N || 1)) * 2 * Math.PI - Math.PI / 2;
  const polar = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  const toPath = pts => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + 'Z';

  const gridPts = lv => filtered.map((_, i) => polar(R * lv, ang(i)));
  const dataPts = filtered.map((d, i) => polar((d.accuracy / 100) * R, ang(i)));
  const hov = hoveredIdx !== null ? filtered[hoveredIdx] : null;
  const hovPt = hoveredIdx !== null ? dataPts[hoveredIdx] : null;

  const avgColor = avgAcc >= 80 ? '#4ade80' : avgAcc >= 60 ? '#a3e635' : avgAcc >= 40 ? '#fbbf24' : '#f87171';

  return (
    <div style={{ background: '#111827', borderRadius: 24, overflow: 'hidden', marginTop: 28 }}>
      {/* Header */}
      <div style={{ padding: '18px 26px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>APTITUDE ANALYTICS</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'white', marginTop: 2 }}>Skills Radar</div>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 3, gap: 2 }}>
          {[['contest', 'Contest Accuracy'], ['study', 'Study Progress']].map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setActiveCategory('All'); setHoveredIdx(null); }}
              style={{ padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: mode === m ? '#2D6A4F' : 'transparent',
                color: mode === m ? 'white' : 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Category filter pills — both modes now carry real category data */}
      {categories.length > 1 && (
        <div style={{ padding: '10px 26px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => { setActiveCategory(cat); setHoveredIdx(null); }}
              style={{ padding: '4px 13px', borderRadius: 20, border: `1px solid ${activeCategory === cat ? '#2D6A4F' : 'rgba(255,255,255,0.1)'}`,
                background: activeCategory === cat ? 'rgba(45,106,79,0.2)' : 'transparent',
                color: activeCategory === cat ? '#4ade80' : 'rgba(255,255,255,0.45)',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s' }}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Chart + Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', padding: '20px 24px', gap: 20 }}>
        {/* Radar SVG */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {filtered.length === 0 ? (
            <div style={{ height: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.22)', fontSize: 13, fontStyle: 'italic', gap: 10 }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              {mode === 'contest' ? 'Take an aptitude contest to see your skill radar' : 'Complete aptitude modules to see progress'}
            </div>
          ) : (
            <svg viewBox={`0 0 ${S} ${S}`} style={{ width: '100%', maxWidth: 440, height: 'auto', display: 'block' }}>
              {/* Concentric grid */}
              {[0.25, 0.5, 0.75, 1].map(lv => (
                <path key={lv} d={toPath(gridPts(lv))}
                  fill="none" stroke={lv === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}
                  strokeWidth={lv === 1 ? 1.5 : 1} />
              ))}

              {/* % labels on the top spoke */}
              {[25, 50, 75, 100].map(pct => {
                const [lx, ly] = polar(R * pct / 100, -Math.PI / 2);
                return (
                  <text key={pct} x={lx + 4} y={ly - 3} fill="rgba(255,255,255,0.18)"
                    fontSize={7.5} fontFamily="monospace">{pct}%</text>
                );
              })}

              {/* Spokes */}
              {filtered.map((_, i) => {
                const [x, y] = polar(R, ang(i));
                const isH = hoveredIdx === i;
                return <line key={i} x1={CX} y1={CY} x2={x.toFixed(1)} y2={y.toFixed(1)}
                  stroke={isH ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth={isH ? 1.5 : 1} />;
              })}

              {/* Data polygon */}
              <path d={toPath(dataPts)} fill="rgba(45,106,79,0.22)" stroke="#2D6A4F" strokeWidth={2} />

              {/* Dots with transparent hit areas */}
              {dataPts.map(([x, y], i) => {
                const isH = hoveredIdx === i;
                return (
                  <g key={i} style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}>
                    <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={18} fill="transparent" />
                    <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r={isH ? 6.5 : 4}
                      fill={isH ? '#4ade80' : '#2D6A4F'} stroke={isH ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.15)'}
                      strokeWidth={isH ? 2 : 1.5} />
                  </g>
                );
              })}

              {/* Labels */}
              {filtered.map((d, i) => {
                const a = ang(i);
                const [lx, ly] = polar(R + 28, a);
                const anchor = lx > CX + 10 ? 'start' : lx < CX - 10 ? 'end' : 'middle';
                const isH = hoveredIdx === i;
                const label = d.topic.length > 14 ? d.topic.slice(0, 13) + '…' : d.topic;
                return (
                  <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} dy={3}
                    textAnchor={anchor}
                    fill={isH ? '#4ade80' : 'rgba(255,255,255,0.55)'}
                    fontSize={isH ? 9 : 7.5} fontWeight={isH ? 800 : 600}>
                    {label}
                  </text>
                );
              })}

              {/* Hover tooltip */}
              {hov && hovPt && (() => {
                const [px, py] = hovPt;
                const tx = Math.max(80, Math.min(S - 80, px));
                const ty = py > CY + 30 ? py - 58 : py + 14;
                const hasCount = hov.total != null;
                return (
                  <g pointerEvents="none">
                    <rect x={tx - 76} y={ty} width={152} height={hasCount ? 44 : 32} rx={8}
                      fill="#0d1117" stroke="rgba(74,222,128,0.3)" strokeWidth={1} />
                    <text x={tx} y={ty + 14} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">
                      {hov.topic.length > 24 ? hov.topic.slice(0, 23) + '…' : hov.topic}
                    </text>
                    <text x={tx} y={ty + 27} textAnchor="middle" fill="#4ade80" fontSize={11} fontWeight="900">
                      {hov.accuracy}% accuracy
                    </text>
                    {hasCount && (
                      <text x={tx} y={ty + 40} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={8}>
                        {hov.correct}/{hov.total} correct
                      </text>
                    )}
                  </g>
                );
              })()}
            </svg>
          )}
        </div>

        {/* Insights panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
          {/* Avg accuracy */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px 18px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>AVG ACCURACY</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: avgColor, lineHeight: 1 }}>{avgAcc}%</div>
            <div style={{ fontSize: 11, color: avgColor, fontWeight: 700, marginTop: 5 }}>
              {avgAcc >= 80 ? 'Excellent' : avgAcc >= 60 ? 'Good standing' : avgAcc >= 40 ? 'Needs practice' : 'Critical — focus here'}
            </div>
          </div>

          {/* Strongest topic */}
          {strongest && (
            <div style={{ background: 'rgba(74,222,128,0.07)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(74,222,128,0.15)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(74,222,128,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>STRONGEST</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3, marginBottom: 4 }}>
                {strongest.topic.length > 20 ? strongest.topic.slice(0, 19) + '…' : strongest.topic}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#4ade80' }}>{strongest.accuracy}%</div>
            </div>
          )}

          {/* Needs attention */}
          {needsWork.length > 0 && (
            <div style={{ background: 'rgba(251,191,36,0.06)', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(251,191,36,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(251,191,36,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>NEEDS WORK</div>
              {needsWork.map((t, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: i > 0 ? 7 : 0 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                    {t.topic.length > 16 ? t.topic.slice(0, 15) + '…' : t.topic}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', flexShrink: 0 }}>{t.accuracy}%</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', textAlign: 'center', fontWeight: 600, marginTop: 4 }}>
            {filtered.length} topic{filtered.length !== 1 ? 's' : ''} plotted
            {activeCategory !== 'All' ? ` · ${activeCategory}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subColor, valueColor, icon, note }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', borderRadius: 14,
      padding: '18px 20px', border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: valueColor, lineHeight: 1 }}>
            <AnimatedNumber value={value} duration={0.9} />
          </div>
          <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: subColor }}>{sub}</div>
          {note && <div style={{ marginTop: 4, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{note}</div>}
        </div>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function PctIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="11" />
      <path d="M7 4H4v6a8 8 0 0 0 16 0V4h-3" /><line x1="7" y1="4" x2="17" y2="4" />
    </svg>
  );
}
