import React, { useState } from 'react';
import {
  ChevronLeft,
  PlayCircle,
  ExternalLink,
  Clock,
  BookOpen,
  Target,
  CheckCircle2,
  Video,
  Map,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

/* ─── Role emoji map ─────────────────────────────────────────────────── */
const ROLE_EMOJI = {
  'Frontend Developer':       '🖥️',
  'Backend Developer':        '⚙️',
  'Full Stack Developer':     '🔨',
  'Data Analyst':             '📊',
  'Software Engineer':        '🧩',
  'QA Automation Engineer':   '🧪',
};

/* ─── Phase card (collapsible) ───────────────────────────────────────── */
function PhaseCard({ phase, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen ?? index === 0);

  return (
    <div
      style={{
        position: 'relative',
        marginBottom: '20px',
      }}
    >
      {/* Timeline dot */}
      <div style={{
        position: 'absolute',
        left: '-32px',
        top: '18px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'white',
        border: '3px solid var(--olive-500)',
        boxShadow: '0 0 0 4px var(--bg-main)',
        zIndex: 2,
      }} />

      <div
        className="surface-card"
        style={{ padding: 0, overflow: 'hidden', transition: 'box-shadow 0.2s' }}
      >
        {/* Header row — always visible */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '18px 24px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
            <span style={{
              flexShrink: 0,
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'var(--olive-700)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: '800',
            }}>
              {index + 1}
            </span>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--olive-900)', lineHeight: 1.3 }}>
              {phase.name}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <span style={{
              fontSize: '0.78rem',
              fontWeight: '700',
              background: 'var(--sage-100)',
              padding: '4px 10px',
              borderRadius: '6px',
              color: 'var(--text-soft)',
              whiteSpace: 'nowrap',
            }}>
              {phase.duration}
            </span>
            {open
              ? <ChevronUp size={16} style={{ color: 'var(--text-soft)' }} />
              : <ChevronDown size={16} style={{ color: 'var(--text-soft)' }} />
            }
          </div>
        </button>

        {/* Topics — shown when open */}
        {open && (
          <div style={{
            padding: '0 24px 20px',
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '16px',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {phase.topics.map((topic, tidx) => (
                <span key={tidx} style={{
                  fontSize: '0.83rem',
                  background: 'var(--sage-100)',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--text-main)',
                }}>
                  <CheckCircle2 size={11} style={{ color: 'var(--olive-500)', flexShrink: 0 }} />
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Full roadmap detail view ───────────────────────────────────────── */
function RoleRoadmapDetail({ roadmap, setSelectedRoadmapId, setActivePage }) {
  const emoji = ROLE_EMOJI[roadmap.role] ?? '📌';

  return (
    <div className="page-stack roadmap-detail-container" style={{ animation: 'fadeIn 0.4s ease-out' }}>

      {/* ── Header ── */}
      <section className="page-header roadmap-header" style={{ paddingBottom: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '2rem' }}>{emoji}</span>
            <span className="kicker" style={{
              margin: 0,
              background: 'var(--sage-100)',
              color: 'var(--olive-700)',
              padding: '4px 12px',
              borderRadius: '100px',
              fontSize: '0.78rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Role Roadmap
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: '600' }}>
              <Clock size={13} /> {roadmap.duration}
            </span>
          </div>
          <h1 style={{ fontSize: '2.4rem', fontWeight: '900', letterSpacing: '-0.03em', margin: '4px 0 0' }}>
            {roadmap.role}
          </h1>
          <p className="body-copy" style={{ fontSize: '1.05rem', opacity: 0.75, margin: 0 }}>
            {roadmap.title}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexShrink: 0 }}>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSelectedRoadmapId('')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ChevronLeft size={16} /> All Roadmaps
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setActivePage('explore')}
          >
            Back to Explore
          </button>
        </div>
      </section>

      {/* ── Practice focus banner ── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--olive-900), var(--olive-700))',
        color: 'white',
        borderRadius: '14px',
        padding: '18px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '32px',
      }}>
        <Target size={22} style={{ flexShrink: 0, opacity: 0.9 }} />
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
            Practice Focus
          </span>
          <p style={{ margin: '2px 0 0', fontSize: '0.95rem', opacity: 0.95, lineHeight: 1.5 }}>
            {roadmap.focus}
          </p>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.55fr 1fr',
        gap: '32px',
        paddingBottom: '60px',
        alignItems: 'start',
      }}>

        {/* LEFT — Phases timeline */}
        <div>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', margin: '0 0 4px' }}>
              <Target size={20} style={{ color: 'var(--olive-500)' }} />
              Learning Journey
            </h2>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-soft)' }}>
              Step-by-step curriculum — click a phase to expand topics
            </p>
          </div>

          {/* Timeline track */}
          <div style={{ position: 'relative', paddingLeft: '32px' }}>
            <div style={{
              position: 'absolute',
              left: '7px',
              top: '18px',
              bottom: '18px',
              width: '2px',
              background: 'linear-gradient(to bottom, var(--olive-500), var(--border-soft))',
            }} />
            {roadmap.phases.map((phase, idx) => (
              <PhaseCard key={idx} phase={phase} index={idx} defaultOpen={idx === 0} />
            ))}
          </div>
        </div>

        {/* RIGHT — Resources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', position: 'sticky', top: '80px' }}>

          {/* YouTube channels */}
          <div>
            <h2 style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              fontSize: '1.1rem', margin: '0 0 14px',
            }}>
              <Video size={20} style={{ color: '#FF0000' }} />
              📺 Top YouTube Channels
            </h2>
            <div className="surface-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {roadmap.youtube.map((yt, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--sage-100)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '9px',
                    background: 'rgba(255,0,0,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <PlayCircle size={18} style={{ color: '#FF0000' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--text-main)' }}>{yt.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)', marginTop: '1px' }}>{yt.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Courses */}
          <div>
            <h2 style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              fontSize: '1.1rem', margin: '0 0 14px',
            }}>
              <BookOpen size={20} style={{ color: 'var(--olive-500)' }} />
              📚 Curated Courses
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {roadmap.courses.map((course, idx) => (
                <a
                  key={idx}
                  href={course.link ? `https://${course.link}` : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="surface-card"
                  style={{
                    padding: '16px 18px',
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(31,40,22,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: 'var(--olive-900)', marginBottom: '3px' }}>
                      {course.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>
                      {course.detail}
                      {course.link && (
                        <span style={{ marginLeft: '6px', color: 'var(--olive-500)', fontWeight: '600' }}>
                          → {course.link}
                        </span>
                      )}
                    </div>
                  </div>
                  <ExternalLink size={15} style={{ opacity: 0.35, flexShrink: 0 }} />
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ─── Roadmap library (card grid) ────────────────────────────────────── */
function RoadmapLibrary({ roleTracks, setActivePage, setSelectedRoadmapId }) {
  return (
    <div className="page-stack">
      <section className="page-header roadmap-header">
        <div>
          <p className="kicker">Role Roadmaps</p>
          <h1>Pick a role. Follow the path.</h1>
          <p className="body-copy" style={{ maxWidth: '680px' }}>
            Structured curriculums built around real job roles — from foundations to production-ready skills.
            Each roadmap breaks down into phases, curated courses, and YouTube channels worth your time.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setActivePage('explore')}>
          Back to Explore
        </button>
      </section>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '22px',
        paddingBottom: '60px',
      }}>
        {roleTracks.map((track) => {
          const emoji = ROLE_EMOJI[track.role] ?? '📌';
          return (
            <article
              key={track.id}
              className="surface-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '20px',
                padding: '28px',
                position: 'relative',
                overflow: 'hidden',
                transition: 'transform 0.2s, box-shadow 0.2s',
                cursor: 'default',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(31,40,22,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              {/* Background watermark */}
              <div style={{ position: 'absolute', right: '-16px', top: '-16px', opacity: 0.04, pointerEvents: 'none' }}>
                <Map size={140} />
              </div>

              <div style={{ position: 'relative', zIndex: 1 }}>
                {/* Role badge row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.5rem' }}>{emoji}</span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      background: 'var(--sage-100)',
                      padding: '5px 11px',
                      borderRadius: '100px',
                      color: 'var(--olive-700)',
                    }}>
                      {track.role}
                    </span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: '600' }}>
                    <Clock size={13} /> {track.duration}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.35rem', margin: '0 0 10px', color: 'var(--olive-900)', fontWeight: '800' }}>
                  {track.title}
                </h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-soft)', lineHeight: '1.55', margin: 0 }}>
                  {track.focus}
                </p>

                {/* Phase count pills */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '14px', flexWrap: 'wrap' }}>
                  {track.phases.map((ph, i) => (
                    <span key={i} style={{
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      background: 'var(--sage-100)',
                      color: 'var(--text-soft)',
                      padding: '3px 9px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-soft)',
                    }}>
                      Phase {i + 1}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '18px',
                borderTop: '1px solid var(--border-soft)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                  <small style={{ fontWeight: '700', color: '#059669', fontSize: '0.78rem' }}>{track.status}</small>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setSelectedRoadmapId(track.id)}
                  style={{ padding: '9px 18px', fontSize: '0.88rem' }}
                >
                  View Roadmap →
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Root export ────────────────────────────────────────────────────── */
function RoadmapsPage({ roleTracks, selectedRoadmapId, setActivePage, setSelectedRoadmapId }) {
  const selectedRoadmap = roleTracks.find((track) => track.id === selectedRoadmapId) ?? null;

  if (selectedRoadmap) {
    return (
      <RoleRoadmapDetail
        roadmap={selectedRoadmap}
        setActivePage={setActivePage}
        setSelectedRoadmapId={setSelectedRoadmapId}
      />
    );
  }

  return (
    <RoadmapLibrary
      roleTracks={roleTracks}
      setActivePage={setActivePage}
      setSelectedRoadmapId={setSelectedRoadmapId}
    />
  );
}

export default RoadmapsPage;
