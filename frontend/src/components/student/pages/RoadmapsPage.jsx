import React from 'react';
import { 
  ChevronLeft, 
  PlayCircle, 
  ExternalLink, 
  Clock, 
  BookOpen, 
  Target, 
  CheckCircle2, 
  Youtube,
  Map
} from 'lucide-react';

function RoleRoadmapDetail({ roadmap, setSelectedRoadmapId, setActivePage }) {
  return (
    <div className="page-stack roadmap-detail-container" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <section className="page-header roadmap-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="kicker" style={{ margin: 0, background: 'var(--olive-100)', color: 'var(--olive-900)', padding: '4px 12px', borderRadius: '100px', fontSize: '0.8rem', fontWeight: 'bold' }}>
              Role Roadmap
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: '500' }}>
              <Clock size={14} /> {roadmap.duration}
            </span>
          </div>
          <h1 style={{ fontSize: '2.8rem', fontWeight: '900', letterSpacing: '-0.03em', margin: '8px 0' }}>{roadmap.role}</h1>
          <p className="body-copy" style={{ fontSize: '1.2rem', opacity: 0.8 }}>{roadmap.title}</p>
        </div>
        <div className="roadmap-header-actions" style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSelectedRoadmapId("")}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <ChevronLeft size={18} /> All Roadmaps
          </button>
          <button type="button" className="primary-button" onClick={() => setActivePage("explore")}>
            Back to Explore
          </button>
        </div>
      </section>

      <div className="roadmap-grid-layout" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '32px', padding: '0 0 60px' }}>
        {/* Left Column: Phases Timeline */}
        <div className="roadmap-phases-section">
          <div className="section-head" style={{ marginBottom: '24px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Target size={24} className="accent-olive" />
              Learning Journey
            </h2>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-soft)' }}>
              Step-by-step curriculum to master this role
            </span>
          </div>

          <div className="phases-timeline" style={{ position: 'relative', paddingLeft: '32px' }}>
            <div style={{ position: 'absolute', left: '7px', top: '10px', bottom: '10px', width: '2px', background: 'linear-gradient(to bottom, var(--olive-400), var(--border-soft))' }}></div>
            
            {roadmap.phases.map((phase, idx) => (
              <div key={idx} className="phase-node" style={{ position: 'relative', marginBottom: '40px' }}>
                <div style={{ 
                  position: 'absolute', 
                  left: '-32px', 
                  top: '4px', 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  background: 'white', 
                  border: '3px solid var(--olive-600)',
                  boxShadow: '0 0 0 4px var(--bg-1)',
                  zIndex: 2
                }}></div>
                
                <div className="surface-card phase-card" style={{ padding: '24px', transition: 'transform 0.2s', cursor: 'default' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: 'var(--olive-900)', fontSize: '1.25rem' }}>{phase.name}</h3>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', background: 'var(--bg-2)', padding: '4px 10px', borderRadius: '6px', color: 'var(--text-soft)' }}>
                      {phase.duration}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {phase.topics.map((topic, tidx) => (
                      <span key={tidx} style={{ 
                        fontSize: '0.85rem', 
                        background: 'var(--bg-2)', 
                        padding: '6px 12px', 
                        borderRadius: '8px',
                        border: '1px solid var(--border-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <CheckCircle2 size={12} className="accent-olive" /> {topic}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Resources */}
        <div className="roadmap-resources-section" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* YouTube Section */}
          <div className="resource-group">
            <div className="section-head" style={{ marginBottom: '16px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.4rem' }}>
                <Youtube size={24} style={{ color: '#FF0000' }} />
                Top YouTube Channels
              </h2>
            </div>
            <div className="surface-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {roadmap.youtube.map((yt, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '12px', transition: 'background 0.2s' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#FF000010', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PlayCircle size={20} style={{ color: '#FF0000' }} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{yt.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-soft)' }}>{yt.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Courses Section */}
          <div className="resource-group">
            <div className="section-head" style={{ marginBottom: '16px' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.4rem' }}>
                <BookOpen size={24} className="accent-olive" />
                Curated Courses
              </h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {roadmap.courses.map((course, idx) => (
                <a 
                  key={idx} 
                  href={`https://${course.link}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="surface-card course-link-card" 
                  style={{ 
                    padding: '20px', 
                    textDecoration: 'none', 
                    color: 'inherit',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--olive-900)' }}>{course.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>{course.detail}</p>
                  </div>
                  <ExternalLink size={18} style={{ opacity: 0.4 }} />
                </a>
              ))}
            </div>
          </div>

          {/* Practice Focus */}
          <div className="surface-card" style={{ padding: '24px', background: 'linear-gradient(135deg, var(--olive-900), var(--olive-800))', color: 'white' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={20} /> Practice Focus
            </h3>
            <p style={{ margin: 0, opacity: 0.9, fontSize: '0.95rem', lineHeight: '1.6' }}>
              {roadmap.focus}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapLibrary({ roleTracks, setActivePage, setSelectedRoadmapId }) {
  return (
    <div className="page-stack">
      <section className="page-header roadmap-header">
        <div>
          <p className="kicker">Role Roadmaps</p>
          <h1>Guided learning paths for 2025.</h1>
          <p className="body-copy" style={{ maxWidth: '700px' }}>
            Structured curriculums designed to take you from beginner to job-ready in your chosen field.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setActivePage("explore")}>
          Back to Explore
        </button>
      </section>

      <div className="roadmap-library-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px', paddingBottom: '60px' }}>
        {roleTracks.map((track) => (
          <article 
            key={track.id} 
            className="surface-card roadmap-library-card"
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between', 
              gap: '24px',
              padding: '32px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', right: '-20px', top: '-20px', opacity: 0.03 }}>
              <Map size={160} />
            </div>
            
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', background: 'var(--bg-2)', padding: '6px 12px', borderRadius: '100px', color: 'var(--olive-700)' }}>
                  {track.role}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-soft)' }}>
                  <Clock size={14} /> {track.duration}
                </span>
              </div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '12px', color: 'var(--olive-900)' }}>{track.title}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-soft)', lineHeight: '1.5' }}>{track.focus}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '20px', borderTop: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                <small style={{ fontWeight: 'bold', color: '#059669' }}>{track.status}</small>
              </div>
              <button
                type="button"
                className="primary-button"
                onClick={() => setSelectedRoadmapId(track.id)}
                style={{ padding: '10px 20px' }}
              >
                View Roadmap
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

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
