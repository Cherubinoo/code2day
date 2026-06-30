import { useState, useMemo } from 'react';

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
export function TopicRadarChart({ data }) {
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
      {dataPts.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.5}
          fill={ACCENT} stroke="rgba(255,255,255,0.2)" strokeWidth={0.8} />
      ))}

      {/* Labels */}
      {items.map((d, i) => {
        const a = ang(i);
        const [lx, ly] = polar(R + 17, a);
        const anchor = lx > CX + 6 ? 'start' : lx < CX - 6 ? 'end' : 'middle';
        const label = d.topic.length > 16 ? d.topic.slice(0, 15) + '…' : d.topic;
        return (
          <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} dy={3}
            textAnchor={anchor} fill="rgba(255,255,255,0.5)"
            fontSize={7} fontWeight="600">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Combined Performance Dashboard Panel ──────────────────────────────────────
export function PerformanceDashboard({ scoreHistory, topicAccuracy, testsCompleted, avgScore, peakScore }) {
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

// ── Aptitude Progress Radar (large, filterable) ───────────────────────────────
export function AptitudeProgressRadar({ topicAccuracy, aptitudeStats }) {
  const [mode, setMode] = useState('contest'); // 'contest' | 'study'
  const [activeCategory, setActiveCategory] = useState('All');
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const contestData = topicAccuracy || [];
  const studyData = useMemo(() => (aptitudeStats || []).map(s => ({
    topic: s.name,
    accuracy: Math.round(s.percentage || 0),
    total: null,
    correct: null,
    category: null,
  })), [aptitudeStats]);

  const categories = useMemo(() => {
    const cats = contestData.map(t => t.category).filter(Boolean);
    return ['All', ...Array.from(new Set(cats))];
  }, [contestData]);

  const filtered = useMemo(() => {
    if (mode === 'study') return studyData.slice(0, 12);
    const base = activeCategory === 'All' ? contestData : contestData.filter(t => t.category === activeCategory);
    return base.slice(0, 12);
  }, [mode, activeCategory, contestData, studyData]);

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

      {/* Category filter pills — contest mode only */}
      {mode === 'contest' && categories.length > 1 && (
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
            {mode === 'contest' && activeCategory !== 'All' ? ` · ${activeCategory}` : ''}
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
          <div style={{ fontSize: 28, fontWeight: 900, color: valueColor, lineHeight: 1 }}>{value}</div>
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
