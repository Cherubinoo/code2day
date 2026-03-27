function RoleRoadmapDetail({ roadmap, setSelectedRoadmapId, setActivePage }) {
  return (
    <div className="page-stack">
      <section className="page-header roadmap-header">
        <div>
          <p className="kicker">Role Roadmap</p>
          <h1>{roadmap.role}</h1>
          <p className="body-copy">{roadmap.title}</p>
        </div>
        <div className="roadmap-header-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setSelectedRoadmapId("")}
          >
            All Roadmaps
          </button>
          <button type="button" className="ghost-button" onClick={() => setActivePage("explore")}>
            Back to Explore
          </button>
        </div>
      </section>

      <section className="content-grid roadmap-detail-layout">
        <article className="surface-card roadmap-detail-main">
          <div className="section-head">
            <h2>{roadmap.title}</h2>
            <span>{roadmap.status}</span>
          </div>

          <div className="info-box roadmap-soon-box">
            <h4>Will be updated soon</h4>
            <p className="body-copy">{roadmap.focus}</p>
          </div>
        </article>
      </section>
    </div>
  );
}

function RoadmapLibrary({ roleTracks, setActivePage, setSelectedRoadmapId }) {
  return (
    <div className="page-stack">
      <section className="page-header roadmap-header">
        <div>
          <p className="kicker">Role Roadmaps</p>
          <h1>Explore all roadmap paths in one place.</h1>
          <p className="body-copy">
            Each role opens as its own page view. Select a role below to open its dedicated roadmap
            screen.
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => setActivePage("explore")}>
          Back to Explore
        </button>
      </section>

      <section className="surface-card">
        <div className="section-head">
          <h2>All Role Paths</h2>
          <span>Each role opens as a full roadmap page</span>
        </div>

        <div className="roadmap-library-list">
          {roleTracks.map((track) => (
            <article key={track.id} className="roadmap-library-card">
              <div>
                <span>{track.role}</span>
                <h3>{track.title}</h3>
                <p>{track.focus}</p>
              </div>
              <div className="roadmap-library-actions">
                <small>{track.status}</small>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setSelectedRoadmapId(track.id)}
                >
                  Explore more
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
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
