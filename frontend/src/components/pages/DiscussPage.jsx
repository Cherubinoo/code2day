function DiscussPage({
  discussionBusy,
  discussionDraft,
  discussionThreads,
  handlePostDiscussion,
  selectedProblem,
  setDiscussionDraft,
}) {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="kicker">Discuss</p>
          <h1>Post doubts anonymously. Only the last 24 hours stay visible.</h1>
        </div>
      </section>

      <section className="content-grid discuss-layout">
        <article className="surface-card">
          <div className="section-head">
            <h2>Anonymous Doubt Box</h2>
            <span>Public error sharing without exposing the student identity</span>
          </div>
          <form onSubmit={handlePostDiscussion}>
            <textarea
              className="discussion-box"
              placeholder={`Example: Runtime error on ${selectedProblem?.slug ?? "this problem"} when the second loop starts`}
              value={discussionDraft}
              onChange={(event) => setDiscussionDraft(event.target.value)}
            />
            <div className="tag-row">
              {selectedProblem?.slug ? <span className="tag">@{selectedProblem.slug}</span> : null}
              <span className="tag">Anonymous</span>
              <span className="tag">Visible for 24 hrs</span>
            </div>
            <div className="composer-actions">
              <button type="button" className="ghost-button" onClick={() => setDiscussionDraft("")}>
                Clear
              </button>
              <button type="submit" className="primary-button" disabled={discussionBusy}>
                {discussionBusy ? "Posting..." : "Post Doubt"}
              </button>
            </div>
          </form>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <h2>Last 24 Hours</h2>
            <span>Anonymous posts refresh automatically every minute</span>
          </div>
          <div className="thread-list">
            {discussionThreads.length > 0 ? (
              discussionThreads.map((thread) => (
                <article key={thread.id} className="thread-card">
                  <div className="thread-top">
                    <strong>{thread.author ?? "Anonymous"}</strong>
                    {thread.problem_slug ? <span className="tag">@{thread.problem_slug}</span> : null}
                  </div>
                  <p>{thread.body}</p>
                </article>
              ))
            ) : (
              <article className="thread-card">
                <strong>No recent doubts yet.</strong>
                <p>Once students post errors or questions, only the latest 24-hour messages appear here.</p>
              </article>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

export default DiscussPage;
