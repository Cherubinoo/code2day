import Editor from "@monaco-editor/react";

import { formatDuration } from "../../lib/appUtils";

function ProblemsPage({
  activeContest,
  code,
  conceptCounts,
  complexityInsight,
  contestSecondsLeft,
  dashboard,
  difficultyOrder,
  editorLanguage,
  expandedSections,
  groupedProblems,
  handleFinishContest,
  handleRunCode,
  handleSelectConcept,
  handleSubmitCode,
  outputLog,
  problemDetailTab,
  problemSecondsElapsed,
  selectedConcept,
  selectedDifficulty,
  selectedLanguage,
  selectedProblem,
  sessionMode,
  setCode,
  setProblemDetailTab,
  setSelectedDifficulty,
  setSelectedLanguage,
  setSelectedProblemSlug,
  setSidebarOpen,
  sidebarOpen,
  toggleProblemSection,
  totalSolved,
  conceptOptions,
}) {
  const noProblemsAvailable = groupedProblems.every((section) => section.items.length === 0);

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">
            {sessionMode === "contest" ? "Contest Workspace" : "Problem Solving"}
          </p>
          <h1>{selectedProblem?.title ?? "No problems to solve"}</h1>
        </div>
        <div className="problem-header-meta">
          <div className="workspace-brief">
            <span>{sessionMode === "contest" ? activeContest?.name : "Practice Session"}</span>
            <strong>
              {sessionMode === "contest" && contestSecondsLeft != null
                ? formatDuration(contestSecondsLeft)
                : formatDuration(problemSecondsElapsed)}
            </strong>
          </div>
          {selectedProblem ? (
            <span className={`difficulty-chip ${selectedProblem.difficulty.toLowerCase()}`}>
              {selectedProblem.difficulty}
            </span>
          ) : null}
        </div>
      </section>

      <section className="surface-card leetcode-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group wide">
            <span className="filter-label">Concepts</span>
            <div className="chip-scroll dense">
              {conceptOptions.map((concept) => (
                <button
                  key={concept}
                  type="button"
                  className={concept === selectedConcept ? "switch-pill active dense" : "switch-pill dense"}
                  onClick={() => handleSelectConcept(concept, "problems")}
                >
                  {concept}
                  <span className="count-pill">{conceptCounts[concept] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-group compact">
            <span className="filter-label">Difficulty</span>
            <select
              className="difficulty-select"
              value={selectedDifficulty}
              onChange={(event) => setSelectedDifficulty(event.target.value)}
            >
              {difficultyOrder.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="toolbar-group compact">
            <span className="filter-label">Timers</span>
            <div className="timer-stack">
              <span>Problem {formatDuration(problemSecondsElapsed)}</span>
              <span>
                {sessionMode === "contest" && contestSecondsLeft != null
                  ? `Contest ${formatDuration(contestSecondsLeft)}`
                  : `Session ${formatDuration(problemSecondsElapsed)}`}
              </span>
            </div>
          </div>

          {sessionMode === "contest" ? (
            <button type="button" className="primary-button dense-action" onClick={handleFinishContest}>
              Finish Contest
            </button>
          ) : null}
        </div>
      </section>

      <section className="problem-layout leetcode-layout">
        <aside className={sidebarOpen ? "surface-card problem-sidebar judge-sidebar" : "problem-sidebar-rail"}>
          <button
            type="button"
            className="sidebar-toggle compact-toggle"
            onClick={() => setSidebarOpen((current) => !current)}
          >
            {sidebarOpen ? "Hide" : "Show"}
          </button>

          {sidebarOpen ? (
            <>
              <div className="section-head">
                <h3>Problemset</h3>
                <span>{selectedDifficulty} track | {selectedConcept}</span>
              </div>

              <div className="problem-section-list scroll-column">
                {groupedProblems.map((section) => (
                  <div key={section.key} className="problem-section-card compact">
                    <button
                      type="button"
                      className="problem-section-header"
                      onClick={() => toggleProblemSection(section.key)}
                    >
                      <div>
                        <strong>{section.label}</strong>
                        <span>{section.items.length} problems</span>
                      </div>
                      <span>{expandedSections[section.key] ? "-" : "+"}</span>
                    </button>

                    {expandedSections[section.key] ? (
                      <div className="problem-list">
                        {section.items.length > 0 ? (
                          section.items.map((problem, index) => (
                            <button
                              key={problem.slug}
                              type="button"
                              className={
                                problem.slug === selectedProblem?.slug
                                  ? "problem-list-row selected"
                                  : "problem-list-row"
                              }
                              onClick={() => {
                                setSelectedProblemSlug(problem.slug);
                                setProblemDetailTab("current");
                              }}
                            >
                              <div className="problem-index">{index + 1}</div>
                              <div className="problem-meta">
                                <strong>{problem.title}</strong>
                                <p>{problem.tags?.join(" | ") || "Practice set"}</p>
                              </div>
                              <span className={`mini-pill ${problem.difficulty.toLowerCase()}`}>
                                {problem.difficulty}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="empty-section">No problems in this section yet.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </aside>

        <section className="center-column judge-center">
          {selectedProblem ? (
            <article className="surface-card editor-main-card judge-editor">
              <div className="editor-topbar">
                <div>
                  <h2>Code Workspace</h2>
                  <span>{selectedLanguage} Workspace</span>
                </div>
                <select
                  className="difficulty-select language-select editor-language-select"
                  value={selectedLanguage}
                  onChange={(event) => setSelectedLanguage(event.target.value)}
                >
                  {(selectedProblem.available_languages ?? [selectedLanguage]).map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </div>

              <div className="editor-frame">
                <Editor
                  height="100%"
                  language={editorLanguage}
                  theme="vs-dark"
                  value={code}
                  onChange={(value) => setCode(value ?? "")}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 10 },
                    scrollBeyondLastLine: false,
                    roundedSelection: true,
                  }}
                />
              </div>

              <div className="editor-actions compact-row">
                <div className="editor-status">
                  <span>{selectedProblem.title}</span>
                  <strong>{complexityInsight.time} / {complexityInsight.space}</strong>
                </div>
                <div className="editor-buttons">
                  <button type="button" className="ghost-button dense-action" onClick={handleRunCode}>
                    Run
                  </button>
                  <button type="button" className="primary-button dense-action" onClick={handleSubmitCode}>
                    Submit
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <article className="surface-card empty-workspace-card judge-empty">
              <h2>No problem selected</h2>
              <p>
                {noProblemsAvailable
                  ? "No problems match this concept, contest, or difficulty filter right now."
                  : "Choose a filtered problem from the left panel to open the coding workspace."}
              </p>
            </article>
          )}

          <article className="surface-card output-card judge-output">
            <div className="section-head">
              <h3>Console</h3>
              <span>Run output and execution notes</span>
            </div>
            <pre className="output-panel compact-output">{outputLog}</pre>
          </article>
        </section>

        <section className="right-column judge-right">
          <article className="surface-card statement-panel judge-statement">
            <div className="section-head">
              <h2>{selectedProblem?.title ?? "Problem details"}</h2>
              {selectedProblem ? (
                <span className={`difficulty-chip ${selectedProblem.difficulty.toLowerCase()}`}>
                  {selectedProblem.difficulty}
                </span>
              ) : null}
            </div>

            <div className="tab-strip dense">
              <button
                type="button"
                className={problemDetailTab === "current" ? "tab-pill active dense" : "tab-pill dense"}
                onClick={() => setProblemDetailTab("current")}
              >
                Current Problem
              </button>
              <button
                type="button"
                className={problemDetailTab === "editorial" ? "tab-pill active dense" : "tab-pill dense"}
                onClick={() => setProblemDetailTab("editorial")}
              >
                Editorial
              </button>
              <button
                type="button"
                className={problemDetailTab === "hints" ? "tab-pill active dense" : "tab-pill dense"}
                onClick={() => setProblemDetailTab("hints")}
              >
                Hints
              </button>
            </div>

            <div className="statement-scroll">
              {selectedProblem ? (
                <>
                  {problemDetailTab === "current" ? (
                    <>
                      <p className="body-copy">{selectedProblem.description}</p>
                      <p className="body-copy">
                        Solve the current problem here while keeping the editor in the center.
                      </p>
                    </>
                  ) : null}

                  {problemDetailTab === "editorial" ? (
                    <p className="body-copy">
                      Start with the simplest valid approach, identify the main structure, and then
                      optimize time and space before submission.
                    </p>
                  ) : null}

                  {problemDetailTab === "hints" ? (
                    <p className="body-copy">
                      Break the problem into lookup steps, think about repeated operations, and ask
                      which structure avoids scanning again.
                    </p>
                  ) : null}

                  <div className="info-box">
                    <h4>Example</h4>
                    <pre>{`Input: nums = [2, 7, 11, 15], target = 9\nOutput: [0, 1]\nExplanation: nums[0] + nums[1] = 9`}</pre>
                  </div>

                  <div className="info-box">
                    <h4>Status</h4>
                    <div className="tag-row">
                      <span className="tag">Current: {selectedProblem.progress_state.replace("_", " ")}</span>
                      {(selectedProblem.tags ?? []).map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="info-box">
                    <h4>Solution Complexity</h4>
                    <div className="complexity-grid">
                      <div>
                        <span>Estimated time</span>
                        <strong>{complexityInsight.time}</strong>
                      </div>
                      <div>
                        <span>Estimated space</span>
                        <strong>{complexityInsight.space}</strong>
                      </div>
                    </div>
                    <p className="body-copy">{complexityInsight.note}</p>
                    <p className="body-copy">{complexityInsight.confidence}</p>
                  </div>
                </>
              ) : (
                <p className="body-copy">Pick a problem to see the statement, hints, and editorial.</p>
              )}
            </div>
          </article>

          <article className="surface-card compact judge-stats">
            <div className="section-head">
              <h3>Stats</h3>
              <span>Easy / Medium / Hard</span>
            </div>
            <div className="progress-list">
              {Object.entries(dashboard.stats).map(([level, value]) => {
                const percentage = totalSolved > 0 ? Math.round((value / totalSolved) * 100) : 0;
                return (
                  <div key={level} className="progress-item">
                    <div className="progress-meta">
                      <span>{level}</span>
                      <strong>{value}</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>
      </section>
    </div>
  );
}

export default ProblemsPage;
