import Editor from "@monaco-editor/react";
import { useState } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import { executionLanguageMap } from "../../../lib/codeExecution";
import { starterCodeByLanguage } from "../../../lib/appData";
import { formatDuration } from "../../../lib/appUtils";

// Use the bundled ESM Monaco build instead of the AMD loader path.
loader.config({ monaco });

// Popular programming languages only (filtered from executionLanguageMap)
const POPULAR_LANGUAGES = [
  "C",
  "C++",
  "Java",
  "Python",
];

const ALL_CODE_LANGUAGES = Object.keys(executionLanguageMap).filter(
  (lang) => POPULAR_LANGUAGES.includes(lang)
);

// ── Problem description Markdown-like renderer ───────────────────────────────
function renderInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderDescription(raw) {
  if (!raw) return null;
  const lines = raw.replace(/\\n/g, '\n').split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} style={{ height: 10 }} />);
      i++;
      continue;
    }

    if (trimmed.startsWith('>') || /^(constraints?|note:|follow up)/i.test(trimmed)) {
      elements.push(
        <div key={i} className="desc-constraint">
          <span className="desc-constraint-icon">{trimmed.startsWith('>') ? '📌' : '⚠️'}</span>
          <span dangerouslySetInnerHTML={{ __html: renderInline(trimmed.replace(/^>\s*/, '')) }} />
        </div>
      );
      i++;
      continue;
    }

    if (/^[-•*]\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-•*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-•*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="desc-bullets">
          {items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="desc-numbered">
          {items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed === trimmed.toUpperCase() && trimmed.length < 60 && !/[.?!,;]/.test(trimmed) && trimmed.length > 3) {
      elements.push(<p key={i} className="desc-section-label">{trimmed}</p>);
      i++;
      continue;
    }

    elements.push(
      <p key={i} className="desc-paragraph" dangerouslySetInnerHTML={{ __html: renderInline(trimmed) }} />
    );
    i++;
  }
  return elements;
}

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

  const solvedProblems = allProblems.filter((p) => p.progress_state === "completed");
  const computedEasy = solvedProblems.filter((p) => p.difficulty === "Easy").length;
  const computedMedium = solvedProblems.filter((p) => p.difficulty === "Medium").length;
  const computedHard = solvedProblems.filter((p) => p.difficulty === "Hard").length;

  const totalEasy   = Math.max(dashboard?.stats?.easy   ?? 0, computedEasy);
  const totalMedium = Math.max(dashboard?.stats?.medium ?? 0, computedMedium);
  const totalHard   = Math.max(dashboard?.stats?.hard   ?? 0, computedHard);
  const displayTotalSolved = totalEasy + totalMedium + totalHard;

  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const problemsPerPage = 20;
  const filteredProblems = showCompletedOnly 
    ? allProblems.filter(p => p.progress_state === 'completed')
    : allProblems;

  const totalProblems = filteredProblems.length;
  const totalPages = Math.ceil(totalProblems / problemsPerPage);
  
  const startIndex = (currentPage - 1) * problemsPerPage;
  const endIndex = Math.min(startIndex + problemsPerPage, totalProblems);
  const paginatedProblems = filteredProblems.slice(startIndex, endIndex);

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
            <span className="stat-chip total">{displayTotalSolved} Total</span>
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
                  {tag !== "All Concepts" && (
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

          <div className="filter-group narrow">
            <span className="filter-label">View</span>
            <button
              type="button"
              className={showCompletedOnly ? "switch-pill active dense" : "switch-pill dense"}
              onClick={() => setShowCompletedOnly(!showCompletedOnly)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {showCompletedOnly ? "✓ Solved Only" : "Show All"}
            </button>
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
                      setSelectedLanguage("Python");
                      openProblem(problem.slug);
                    }}
                  >
                    <span className="col-num">{actualIndex + 1}</span>

                    <span className="col-title">
                      <strong>{problem.title}</strong>
                      {problem.is_daily && <span className="daily-badge">Daily</span>}
                      {problem.progress_state === "completed" && (
                        <span className="completed-stamp" title="Solved">✓ Completed</span>
                      )}
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
                      {/* Language chip only ever shown for achieved (solved) problems —
                          in-progress/attempted problems show no extra badges. */}
                      {problem.progress_state === "completed" && problem.solved_languages?.length > 0 && (
                        <span className="status-languages">
                          {problem.solved_languages.join(", ")}
                        </span>
                      )}
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
  executionElapsed,
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
  sessionSecondsElapsed,
  activePage,
}) {
  const [showAllBatches, setShowAllBatches] = useState(false);
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
      <section className="surface-card code2day-toolbar">
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
                    : `Session ${formatDuration(sessionSecondsElapsed)}`}
                </span>
              </div>
            </div>
          </div>
        </section>
      <section
        className="problem-layout code2day-layout"
        style={{
          gridTemplateColumns: sidebarOpen ? "280px 1fr" : "40px 1fr",
          transition: 'grid-template-columns 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
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
                      <span>{expandedSections[section.key] !== false ? "−" : "+"}</span>
                    </button>

                    {expandedSections[section.key] !== false && (
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
                                <p>
                                  {problem.companies && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{problem.companies} | </span>}
                                  {problem.tags?.join(" | ") || "Practice set"}
                                </p>
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

                {/* Show All Toggle for Batches */}
                <div style={{ padding: '0.5rem', borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
                  <button 
                    type="button"
                    className="ghost-button"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setShowAllBatches(!showAllBatches)}
                  >
                    {showAllBatches ? "Hide Other Batches" : "Show All Batches"}
                  </button>
                </div>

                {/* Other batches shown only if toggled */}
                {showAllBatches && groupedProblems.filter(s => s.key !== 'completed').map((section) => (
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

      {/* RIGHT: vertical stack — question top, editor+console bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

          {/* TOP: Problem Statement */}
          <section className="right-column judge-right" style={{ minHeight: 0 }}>
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
                {["current", "explanation"].map((tab) => (
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
                        {/* Problem description with structured rendering */}
                        <div className="problem-description">
                          {renderDescription(selectedProblem.description)}
                        </div>
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
                    {problemDetailTab === "explanation" && (
                      <>
                        {selectedProblem.explanation ? (
                          <div className="info-box" style={{ background: 'none', padding: 0, border: 'none' }}>
                            <h4 style={{ color: '#38bdf8', marginBottom: 10 }}>💡 Detailed Explanation &amp; Walkthrough</h4>
                            <div style={{
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              fontSize: "13px",
                              lineHeight: "1.6",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              color: "#cbd5e1",
                              background: "#0f172a",
                              padding: "16px",
                              borderRadius: "8px",
                              border: "1px solid #1e293b"
                            }}>
                              {selectedProblem.explanation}
                            </div>
                          </div>
                        ) : (
                          <div className="info-box">
                            <p style={{ color: 'var(--text-soft)', fontStyle: 'italic' }}>No explanation writeup generated yet for this problem.</p>
                          </div>
                        )}

                        {selectedProblem.examples && selectedProblem.examples.length > 0 && (
                          <div className="info-box" style={{ marginTop: 20 }}>
                            <h4 style={{ color: '#a78bfa', marginBottom: 12 }}>🧪 Sample Test Cases & Worked Examples</h4>
                            {selectedProblem.examples.map((ex, idx) => (
                              <div key={idx} className="example-block" style={{ marginBottom: 12, padding: 14, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Example {idx + 1}</div>
                                <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#e2e8f0' }}><strong>Input:</strong> <code>{ex.input}</code></div>
                                <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#e2e8f0', marginTop: 4 }}><strong>Output:</strong> <code>{ex.output}</code></div>
                                {ex.explanation && (
                                  <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 6, paddingTop: 6, borderTop: '1px solid #334155' }}>
                                    <strong style={{ color: '#38bdf8' }}>Explanation:</strong> {ex.explanation}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="body-copy">Pick a problem to see the statement, explanation, and editorial.</p>
                )}
              </div>
            </article>
          </section>

          {/* BOTTOM: Code Editor + Console */}
          <section className="center-column judge-center" style={{ minHeight: 0 }}>
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
                  </div>
                  <div className="editor-buttons">
                    <button
                      type="button"
                      className="ghost-button dense-action"
                      onClick={handleRunCode}
                      disabled={executionBusy}
                    >
                      {executionBusy ? `Running… ${executionElapsed}s` : "Run"}
                    </button>
                    <button
                      type="button"
                      className="primary-button dense-action"
                      onClick={handleSubmitCode}
                      disabled={executionBusy}
                    >
                      {executionBusy ? `Submitting… ${executionElapsed}s` : "Submit"}
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

              <label htmlFor="execution-input" className="filter-label">Custom Input</label>
              <textarea
                id="execution-input"
                className="execution-input"
                value={executionInput}
                onChange={(e) => setExecutionInput(e.target.value)}
                placeholder="Optional stdin for a custom run. Leave blank to run the problem's sample cases."
              />
                <div className="output-panel-shell">
                  {executionBusy ? (
                    <div className="output-panel compiling-overlay">
                      <div className="compiling-spinner" />
                      <div className="compiling-label">
                        Running…
                        <span className="compiling-elapsed">{executionElapsed}s</span>
                      </div>
                    </div>
                  ) : (
                    <pre className="output-panel compact-output">{outputLog}</pre>
                  )}
                </div>
            </article>
          </section>

        </div>
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
