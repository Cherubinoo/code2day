import Editor from "@monaco-editor/react";
import { useState } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import { executionLanguageMap } from "../../lib/codeExecution";
import { starterCodeByLanguage } from "../../lib/appData";
import { formatDuration } from "../../lib/appUtils";

// Use the bundled ESM Monaco build instead of the AMD loader path.
loader.config({ monaco });

// Popular programming languages only (filtered from executionLanguageMap)
const POPULAR_LANGUAGES = [
  "JavaScript",
  "Python",
  "Java",
  "C",
  "C++",
  "C#",
  "Go",
  "Rust",
  "TypeScript",
  "PHP",
  "Ruby",
  "Swift",
  "Kotlin",
];

const ALL_CODE_LANGUAGES = Object.keys(executionLanguageMap).filter(
  (lang) => POPULAR_LANGUAGES.includes(lang)
);

// Status config
const STATUS_CONFIG = {
  completed: { label: "Solved", className: "status-solved" },
  open:      { label: "Attempted", className: "status-open" },
  not_completed: { label: "Todo", className: "status-todo" },
};

// ── Problem List View ──────────────────────────────────────────────────────

function ProblemListView({
  tagCounts,
  dynamicTags,
  difficultyOrder,
  groupedProblems,
  handleSelectTag,
  selectedTag,
  selectedDifficulty,
  setSelectedDifficulty,
  setSelectedLanguage,
  setSelectedProblemSlug,
  setProblemDetailTab,
  totalSolved,
  dashboard,
  sessionMode,
  activeContest,
  contestSecondsLeft,
  handleFinishContest,
}) {
  const allProblems = groupedProblems.flatMap((s) => s.items);
  const totalEasy   = dashboard?.stats?.easy   ?? 0;
  const totalMedium = dashboard?.stats?.medium ?? 0;
  const totalHard   = dashboard?.stats?.hard   ?? 0;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const problemsPerPage = 20;
  const totalProblems = allProblems.length;
  const totalPages = Math.ceil(totalProblems / problemsPerPage);
  
  const startIndex = (currentPage - 1) * problemsPerPage;
  const endIndex = Math.min(startIndex + problemsPerPage, totalProblems);
  const paginatedProblems = allProblems.slice(startIndex, endIndex);

  function openProblem(slug) {
    setSelectedProblemSlug(slug);
    setProblemDetailTab("current");
  }

  return (
    <div className="page-stack">
      {/* ── Page Header ── */}
      <section className="page-header compact-header">
        <div>
          <p className="kicker">
            {sessionMode === "contest" ? "Contest Workspace" : "Practice Problems"}
          </p>
          <h1>
            {sessionMode === "contest" ? (activeContest?.name ?? "Contest") : "Problemset"}
          </h1>
        </div>
        <div className="problem-header-meta">
          {sessionMode === "contest" && contestSecondsLeft != null && (
            <div className="workspace-brief contest-timer-brief">
              <span>Time left</span>
              <strong className="timer-countdown">{formatDuration(contestSecondsLeft)}</strong>
            </div>
          )}
          <div className="stats-summary-row">
            <span className="stat-chip easy">{totalEasy} Easy</span>
            <span className="stat-chip medium">{totalMedium} Medium</span>
            <span className="stat-chip hard">{totalHard} Hard</span>
            <span className="stat-chip total">{totalSolved} Total</span>
          </div>
          {sessionMode === "contest" && (
            <button type="button" className="primary-button dense-action" onClick={handleFinishContest}>
              Finish Contest
            </button>
          )}
        </div>
      </section>

      {/* ── Filters ── */}
      <section className="surface-card filter-bar-card">
        <div className="filter-row-main">
          {/* Topic chips - dynamic from problem tags */}
          <div className="filter-group stretch">
            <span className="filter-label">Topic</span>
            <div className="chip-scroll dense">
              {dynamicTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={tag === selectedTag ? "switch-pill active dense" : "switch-pill dense"}
                  onClick={() => handleSelectTag(tag, "problems")}
                >
                  {tag}
                  {tag !== "All Topics" && (
                    <span className="count-pill">{tagCounts[tag] ?? 0}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div className="filter-group narrow">
            <span className="filter-label">Difficulty</span>
            <select
              className="difficulty-select"
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              {difficultyOrder.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* ── Problem List ── */}
      <section className="surface-card problems-table-card">
        {allProblems.length === 0 ? (
          <div className="empty-problems-state">
            <span className="empty-icon">🔍</span>
            <h3>No problems found</h3>
            <p>Try adjusting the topic or difficulty filter.</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="problems-table-head">
              <span className="col-num">#</span>
              <span className="col-title">Title</span>
              <span className="col-tags">Tags</span>
              <span className="col-diff">Difficulty</span>
              <span className="col-status">Status</span>
              <span className="col-action" />
            </div>

            {/* Rows */}
            <div className="problems-table-body">
              {paginatedProblems.map((problem, index) => {
                const statusCfg = STATUS_CONFIG[problem.progress_state] ?? STATUS_CONFIG.not_completed;
                const actualIndex = startIndex + index;
                return (
                  <button
                    key={problem.slug}
                    type="button"
                    className="problem-table-row"
                    onClick={() => {
                      setSelectedLanguage("JavaScript");
                      openProblem(problem.slug);
                    }}
                  >
                    <span className="col-num">{actualIndex + 1}</span>

                    <span className="col-title">
                      <strong>{problem.title}</strong>
                      {problem.is_daily && <span className="daily-badge">Daily</span>}
                    </span>

                    <span className="col-tags">
                      {(problem.tags ?? []).map((tag) => (
                        <span key={tag} className="tag compact-tag">{tag}</span>
                      ))}
                    </span>

                    <span className="col-diff">
                      <span className={`difficulty-chip ${problem.difficulty.toLowerCase()}`}>
                        {problem.difficulty}
                      </span>
                    </span>

                    <span className="col-status">
                      <span className={`status-badge ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </span>

                    <span className="col-action">
                      <span className="solve-arrow">Solve →</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages} ({startIndex + 1}-{endIndex} of {totalProblems})
                </span>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}

            <p className="table-footer-note">
              {totalProblems} problem{totalProblems !== 1 ? "s" : ""} total
            </p>
          </>
        )}
      </section>
    </div>
  );
}

// ── Workspace / Editor View ────────────────────────────────────────────────

function WorkspaceView({
  activeContest,
  code,
  tagCounts,
  complexityInsight,
  contestSecondsLeft,
  dashboard,
  difficultyOrder,
  editorLanguage,
  executionBusy,
  executionInput,
  executionMeta,
  expandedSections,
  groupedProblems,
  handleFinishContest,
  handleRunCode,
  handleSelectTag,
  handleSubmitCode,
  outputLog,
  problemDetailTab,
  problemSecondsElapsed,
  selectedTag,
  selectedDifficulty,
  selectedLanguage,
  selectedProblem,
  sessionMode,
  setCode,
  setExecutionInput,
  setProblemDetailTab,
  setSelectedDifficulty,
  setSelectedLanguage,
  setSelectedProblemSlug,
  setSidebarOpen,
  sidebarOpen,
  toggleProblemSection,
  totalSolved,
  dynamicTags,
}) {
  // All code languages available for the editor (SQL removed)
  const editorLanguages = ALL_CODE_LANGUAGES;

  return (
    <div className="page-stack problem-page">
      {/* ── Workspace Header ── */}
      <section className="page-header compact-header problem-page-header">
        <div className="workspace-title-row">
          <button
            type="button"
            className="back-to-list-btn"
            onClick={() => setSelectedProblemSlug("")}
          >
            ← Problems
          </button>
          <div>
            <p className="kicker">
              {sessionMode === "contest" ? "Contest Workspace" : "Problem Solving"}
            </p>
            <h1>{selectedProblem?.title ?? "No problem selected"}</h1>
          </div>
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
          {selectedProblem && (
            <span className={`difficulty-chip ${selectedProblem.difficulty.toLowerCase()}`}>
              {selectedProblem.difficulty}
            </span>
          )}
          {sessionMode === "contest" && (
            <button type="button" className="primary-button dense-action" onClick={handleFinishContest}>
              Finish Contest
            </button>
          )}
        </div>
      </section>

      {/* ── Filter / Concept toolbar ── */}
      <section className="surface-card leetcode-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group wide">
            <span className="filter-label">Concepts</span>
            <div className="chip-scroll dense">
              {dynamicTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={tag === selectedTag ? "switch-pill active dense" : "switch-pill dense"}
                  onClick={() => handleSelectTag(tag, "problems")}
                >
                  {tag}
                  <span className="count-pill">{tagCounts[tag] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-group compact">
            <span className="filter-label">Difficulty</span>
            <select
              className="difficulty-select"
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              {difficultyOrder.map((d) => <option key={d} value={d}>{d}</option>)}
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
        </div>
      </section>

      {/* ──3-Column Layout ── */}
      <section className="problem-layout leetcode-layout">
        {/* LEFT: problem list sidebar */}
        <aside className={sidebarOpen ? "surface-card problem-sidebar judge-sidebar" : "problem-sidebar-rail"}>
          <button
            type="button"
            className="sidebar-toggle compact-toggle"
            onClick={() => setSidebarOpen((cur) => !cur)}
          >
            {sidebarOpen ? "Hide" : "Show"}
          </button>

          {sidebarOpen && (
            <>
              <div className="section-head">
                <h3>Problemset</h3>
                <span>{selectedDifficulty} | {selectedTag}</span>
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
                      <span>{expandedSections[section.key] ? "−" : "+"}</span>
                    </button>

                    {expandedSections[section.key] && (
                      <div className="problem-list">
                        {section.items.length > 0 ? (
                          section.items.map((problem, idx) => (
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
                              <div className="problem-index">{idx + 1}</div>
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
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* CENTER: editor */}
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
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  {editorLanguages.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="editor-frame" style={{ minHeight: '400px', height: '400px' }}>
                <Editor
                  key={`${selectedProblem?.slug}-${selectedLanguage}`}
                  height="400px"
                  language={editorLanguage}
                  theme="vs-dark"
                  value={code || starterCodeByLanguage[selectedLanguage] || "// Write your solution here"}
                  onChange={(value) => setCode(value ?? "")}
                  onMount={(editor, monaco) => {
                    console.log("Monaco editor mounted successfully");
                    editor.focus();
                    // Force layout update
                    setTimeout(() => {
                      editor.layout();
                      console.log("Monaco layout updated");
                    }, 200);
                  }}
                  beforeMount={(monaco) => {
                    console.log("Monaco loading...", monaco);
                  }}
                  loading={(
                    <div style={{
                      color: '#888',
                      padding: '40px',
                      textAlign: 'center',
                      height: '400px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#1f1f1f'
                    }}>
                      Loading Monaco Editor...
                    </div>
                  )}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 10 },
                    scrollBeyondLastLine: false,
                    roundedSelection: true,
                    automaticLayout: true,
                    readOnly: false,
                    renderLineHighlight: "all",
                    selectOnLineNumbers: true,
                    wordWrap: "on",
                    lineNumbers: "on",
                    folding: true,
                    matchBrackets: "always",
                    autoIndent: "full",
                    formatOnPaste: true,
                    formatOnType: true,
                    quickSuggestions: true,
                    tabCompletion: "on",
                    parameterHints: { enabled: true },
                    hover: { enabled: true },
                    contextmenu: true,
                  }}
                />
              </div>

              <div className="editor-actions compact-row">
                <div className="editor-status">
                  <span>{selectedProblem.title}</span>
                  <strong>{complexityInsight.time} / {complexityInsight.space}</strong>
                </div>
                <div className="editor-buttons">
                  <button
                    type="button"
                    className="ghost-button dense-action"
                    onClick={handleRunCode}
                    disabled={executionBusy}
                  >
                    {executionBusy ? "Running…" : "Run"}
                  </button>
                  <button
                    type="button"
                    className="primary-button dense-action"
                    onClick={handleSubmitCode}
                    disabled={executionBusy}
                  >
                    {executionBusy ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <article className="surface-card empty-workspace-card judge-empty">
              <h2>No problem selected</h2>
              <p>Choose a problem from the left panel to open the coding workspace.</p>
            </article>
          )}

          <article className="surface-card output-card judge-output">
            <div className="section-head">
              <h3>Console</h3>
              <span>Run output and execution notes</span>
            </div>
            <div className="execution-meta-row">
              <span>Status: {executionMeta.status}</span>
              <span>Time: {executionMeta.time || "−"}</span>
              <span>Memory: {executionMeta.memory || "−"}</span>
            </div>
            <label htmlFor="execution-input" className="filter-label">Custom Input</label>
            <textarea
              id="execution-input"
              className="execution-input"
              value={executionInput}
              onChange={(e) => setExecutionInput(e.target.value)}
              placeholder="Optional stdin for a custom run. Leave blank to run the problem's sample cases."
            />
            <div className="output-panel-shell">
              <pre className="output-panel compact-output">{outputLog}</pre>
            </div>
          </article>
        </section>

        {/* RIGHT: problem statement */}
        <section className="right-column judge-right">
          <article className="surface-card statement-panel judge-statement">
            <div className="section-head">
              <h2>{selectedProblem?.title ?? "Problem details"}</h2>
              {selectedProblem && (
                <span className={`difficulty-chip ${selectedProblem.difficulty.toLowerCase()}`}>
                  {selectedProblem.difficulty}
                </span>
              )}
            </div>

            <div className="tab-strip dense">
              {["current", "editorial", "hints"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={problemDetailTab === tab ? "tab-pill active dense" : "tab-pill dense"}
                  onClick={() => setProblemDetailTab(tab)}
                >
                  {tab === "current" ? "Problem" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="statement-scroll">
              {selectedProblem ? (
                <>
                  {problemDetailTab === "current" && (
                    <>
                      {/* Problem description with markdown-like formatting */}
                      <div className="problem-description">
                        {selectedProblem.description.split('\\n').map((line, i) => {
                          // Check if line starts with a number (1. 2. 3.)
                          if (/^\d+\./.test(line.trim())) {
                            return <p key={i} className="desc-list-item">{line}</p>;
                          }
                          return <p key={i} className="desc-paragraph">{line}</p>;
                        })}
                      </div>
                      {selectedProblem.examples && selectedProblem.examples.length > 0 && (
                        <div className="info-box">
                          <h4>Examples</h4>
                          {selectedProblem.examples.map((ex, idx) => (
                            <div key={idx} className="example-block">
                              <pre>{`Input: ${ex.input}\nOutput: ${ex.output}${ex.explanation ? `\nExplanation: ${ex.explanation}` : ''}`}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="info-box">
                        <h4>Status & Tags</h4>
                        <div className="tag-row">
                          <span className="tag">
                            {STATUS_CONFIG[selectedProblem.progress_state]?.label ?? "Todo"}
                          </span>
                          {(selectedProblem.tags ?? []).map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {problemDetailTab === "editorial" && (
                    <>
                      {selectedProblem.editorial ? (
                        <div className="body-copy editorial-content" dangerouslySetInnerHTML={{ __html: selectedProblem.editorial }} />
                      ) : (
                        <p className="body-copy">No editorial available for this problem yet.</p>
                      )}
                    </>
                  )}
                  {problemDetailTab === "hints" && (
                    <>
                      {selectedProblem.hints && selectedProblem.hints.length > 0 ? (
                        <div className="hints-list">
                          {selectedProblem.hints.map((hint, idx) => (
                            <div key={idx} className="hint-item">
                              <strong>Hint {idx + 1}</strong>
                              <p className="body-copy">{hint}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="body-copy">No hints available for this problem yet.</p>
                      )}
                      {/* Sample Output Section - shows first example */}
                      {selectedProblem.examples && selectedProblem.examples.length > 0 && (
                        <div className="info-box sample-output-box">
                          <h4>Sample Output</h4>
                          <pre className="sample-output-pre">{`Input: ${selectedProblem.examples[0].input}
Output: ${selectedProblem.examples[0].output}`}</pre>
                        </div>
                      )}
                    </>
                  )}
                  <div className="info-box">
                    <h4>Complexity Estimate</h4>
                    <div className="complexity-grid">
                      <div><span>Time</span><strong>{complexityInsight.time}</strong></div>
                      <div><span>Space</span><strong>{complexityInsight.space}</strong></div>
                    </div>
                    <p className="body-copy">{complexityInsight.note}</p>
                  </div>
                </>
              ) : (
                <p className="body-copy">Pick a problem to see the statement, hints, and editorial.</p>
              )}
            </div>
          </article>
        </section>
      </section>
    </div>
  );
}

// ── Main export: switches between list and workspace ───────────────────────

function ProblemsPage(props) {
  if (!props.selectedProblem) {
    return (
      <ProblemListView
        tagCounts={props.tagCounts}
        dynamicTags={props.dynamicTags}
        difficultyOrder={props.difficultyOrder}
        groupedProblems={props.groupedProblems}
        handleSelectTag={props.handleSelectTag}
        selectedTag={props.selectedTag}
        selectedDifficulty={props.selectedDifficulty}
        setSelectedDifficulty={props.setSelectedDifficulty}
        setSelectedLanguage={props.setSelectedLanguage}
        setSelectedProblemSlug={props.setSelectedProblemSlug}
        setProblemDetailTab={props.setProblemDetailTab}
        totalSolved={props.totalSolved}
        dashboard={props.dashboard}
        sessionMode={props.sessionMode}
        activeContest={props.activeContest}
        contestSecondsLeft={props.contestSecondsLeft}
        handleFinishContest={props.handleFinishContest}
      />
    );
  }

  return <WorkspaceView {...props} />;
}

export default ProblemsPage;
