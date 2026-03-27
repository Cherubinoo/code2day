function ProgressPage({
  contestCards,
  contestHistory,
  dashboard,
  handleJoinContest,
  resultCards,
}) {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="kicker">Progress</p>
          <h1>Track coding growth like a real practice profile.</h1>
        </div>
      </section>

      <section className="content-grid two-column">
        <article className="surface-card">
          <div className="section-head">
            <h2>Practice Snapshot</h2>
            <span>Recent growth across problems and contests</span>
          </div>
          <div className="results-grid">
            {resultCards.map((card) => (
              <article key={card.title} className="result-card">
                <span>{card.title}</span>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </article>
            ))}
          </div>

          <div className="weekly-bars">
            {dashboard.weeklyActivity.map((item) => (
              <div key={item.day} className="bar-column">
                <span className="bar-fill" style={{ height: `${Math.max(item.count, 1) * 20}px` }} />
                <strong>{item.day}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <h2>Contest Progress</h2>
            <span>Your contests first, then participant progress</span>
          </div>

          <div className="thread-list">
            {contestCards.map((contest) => {
              const entry = contestHistory.find((item) => item.id === contest.id);
              return (
                <article key={contest.id} className="thread-card">
                  <div className="thread-top">
                    <strong>{contest.name}</strong>
                    <span className="tag">{entry ? entry.finishedLabel : contest.state}</span>
                  </div>
                  <p>{contest.detail}</p>
                  <div className="tag-row">
                    {(contest.problems ?? []).map((problemSlug, index) => (
                      <span key={problemSlug} className="tag">
                        {index + 1}. {problemSlug.replaceAll("-", " ")}
                      </span>
                    ))}
                  </div>
                  <div className="builder-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleJoinContest(contest)}
                    >
                      Solve
                    </button>
                  </div>
                </article>
              );
            })}

            {contestHistory.length > 0 ? (
              contestHistory.map((entry) => (
                <article key={`${entry.id}-history`} className="thread-card">
                  <div className="thread-top">
                    <strong>{entry.name}</strong>
                    <span className="tag">{entry.finishedLabel}</span>
                  </div>
                  <p>
                    Solved {entry.solved} of {entry.total} in {entry.durationMinutes} minutes.
                  </p>
                </article>
              ))
            ) : null}
          </div>
        </article>
      </section>

    </div>
  );
}

export default ProgressPage;
