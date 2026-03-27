function ContestPage({ contestCards, contestHistory, handleJoinContest, setActivePage }) {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="kicker">Contest Arena</p>
          <h1>Compete regularly and sharpen speed.</h1>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => handleJoinContest(contestCards[0])}
        >
          Join Next Contest
        </button>
      </section>

      <section className="content-grid two-column">
        <article className="surface-card">
          <div className="section-head">
            <h2>Live and Upcoming Contests</h2>
            <span>Weekly coding momentum</span>
          </div>
          <div className="contest-grid">
            {contestCards.map((contest) => (
              <article key={contest.id} className="contest-card">
                <div className="contest-top">
                  <strong>{contest.name}</strong>
                  <span className={`status-pill ${contest.state.toLowerCase()}`}>
                    {contest.state}
                  </span>
                </div>
                <p className="contest-time">{contest.timing}</p>
                <p className="contest-detail">{contest.detail}</p>
                <div className="builder-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleJoinContest(contest)}
                  >
                    Join Contest
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setActivePage("progress")}
                  >
                    View Progress
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <h2>Contest Readiness</h2>
            <span>Live session status and recent finishes</span>
          </div>
          <div className="readiness-grid">
            <div className="readiness-card">
              <span>Speed rank</span>
              <strong>Top 18%</strong>
            </div>
            <div className="readiness-card">
              <span>Accuracy</span>
              <strong>87%</strong>
            </div>
            <div className="readiness-card">
              <span>Last finish</span>
              <strong>#12 campus</strong>
            </div>
            <div className="readiness-card dark">
              <span>Next target</span>
              <strong>Top 10%</strong>
            </div>
          </div>

          <div className="featured-path-list">
            {contestHistory.length > 0 ? (
              contestHistory.map((entry) => (
                <article key={`${entry.id}-${entry.finishedLabel}`} className="thread-card">
                  <div className="thread-top">
                    <strong>{entry.name}</strong>
                    <span className="tag">{entry.finishedLabel}</span>
                  </div>
                  <p>
                    Solved {entry.solved} of {entry.total} in {entry.durationMinutes} minutes.
                  </p>
                </article>
              ))
            ) : (
              <div className="empty-filter-state">
                <strong>No completed contest yet.</strong>
                <p>Join a contest to open the coding workspace and record results here.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

export default ContestPage;
