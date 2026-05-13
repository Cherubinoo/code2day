import Editor from "@monaco-editor/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import { runCodeExecution, getLanguageIdForChoice } from "../../../lib/codeExecution";
import { starterCodeByLanguage, editorLanguageByChoice } from "../../../lib/appData";
import { formatDuration } from "../../../lib/appUtils";
import { buildJsonPostOptions } from "../../../lib/appUtils";
import { validateLanguageMatch, getLanguageMismatchError, detectLanguageFromCode } from "../../../lib/languageDetector";
import { AlertCircle } from "lucide-react";
import DoubleConfirmModal from "../../common/DoubleConfirmModal";

loader.config({ monaco });

const POPULAR_LANGUAGES = ["C", "C++", "Java", "JavaScript", "Python"];

// ── Toast notification component ──────────────────────────────────────────────
function Toast({ message, type = 'success', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  const bg = type === 'success' ? '#059669' : type === 'error' ? '#dc2626' : '#f59e0b';
  return (
    <div style={{
      position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
      background: bg, color: 'white', padding: '14px 28px', borderRadius: 12,
      fontWeight: 700, fontSize: 16, zIndex: 99999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'slideDown 0.3s ease',
    }}>
      {type === 'success' ? '✅' : type === 'error' ? '❌' : '⏰'} {message}
    </div>
  );
}

function ContestWorkspacePage({ contestId, onBack }) {
  // Contest data
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [contest, setContest] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null, firstOk: false });
  const [toast, setToast] = useState(null); // { message, type }
  const autoSubmittedRef = useRef(false);
  const isContestActiveRef = useRef(true); // tracks if we're still in contest

  const showToast = (message, type = 'success') => setToast({ message, type });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });
  };
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected problem
  const [selectedProblemIndex, setSelectedProblemIndex] = useState(0);
  const [selectedProblemDetails, setSelectedProblemDetails] = useState(null);
  const selectedProblem = problems[selectedProblemIndex] || null;

  // Editor state
  const [selectedLanguage, setSelectedLanguage] = useState("JavaScript");
  const [code, setCode] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Execution state
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionInput, setExecutionInput] = useState("");
  const [outputLog, setOutputLog] = useState("Run your code to see output here.");
  const [executionMeta, setExecutionMeta] = useState({
    status: "Ready",
    time: null,
    memory: null,
  });

  // Timer state
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [problemSecondsElapsed, setProblemSecondsElapsed] = useState(0);

  // Problem detail tab
  const [problemDetailTab, setProblemDetailTab] = useState("current");

  // ── Fullscreen + anti-cheat enforcement ──────────────────────────────────
  useEffect(() => {
    // Enter fullscreen on mount
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

    // Block paste globally
    const blockPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showToast('Pasting is not allowed during a contest.', 'error');
    };
    document.addEventListener('paste', blockPaste, true);

    // Detect tab/window visibility change
    const handleVisibility = () => {
      if (document.hidden && isContestActiveRef.current) {
        showToast('⚠️ Tab switching is not allowed! Return to the contest.', 'error');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Block keyboard shortcuts that could switch tabs or open devtools
    const blockKeys = (e) => {
      // Ctrl+T, Ctrl+W, Ctrl+Tab, Alt+Tab, F12, Ctrl+Shift+I/J/C
      if (
        (e.ctrlKey && ['t', 'w', 'Tab'].includes(e.key)) ||
        (e.altKey && e.key === 'Tab') ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', blockKeys, true);

    // Prevent accidental page exit (browser back/close)
    const handleBeforeUnload = (e) => {
      if (isContestActiveRef.current) {
        e.preventDefault();
        e.returnValue = 'You are in an active contest. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Re-enter fullscreen if user exits it
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      setIsFullscreen(isFull);
      
      if (!isFull && isContestActiveRef.current) {
        showToast('⚠️ Full screen exit detected! You must stay in full screen to continue.', 'error');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('paste', blockPaste, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      // Exit fullscreen when leaving contest
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Fetch problem details when selected problem changes
  useEffect(() => {
    if (!selectedProblem) {
      setSelectedProblemDetails(null);
      return;
    }

    async function fetchProblemDetails() {
      try {
        const response = await fetch(
          `/api/student/contests/${contestId}/problems/${selectedProblem.slug}/`,
          { credentials: "include" }
        );

        if (response.ok) {
          const data = await response.json();
          setSelectedProblemDetails(data);
        } else {
          console.error("Failed to fetch problem details");
        }
      } catch (err) {
        console.error("Error fetching problem details:", err);
      }
    }

    fetchProblemDetails();
  }, [contestId, selectedProblem]);

  // Fetch contest data
  useEffect(() => {
    async function fetchContestData() {
      try {
        console.log('Fetching contest data for ID:', contestId);
        const response = await fetch(`/api/student/contests/${contestId}/`, {
          credentials: "include",
        });

        console.log('Contest response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Contest error:', errorData);
          throw new Error(errorData.detail || "Failed to load contest");
        }

        const data = await response.json();
        console.log('Contest data:', data);
        setContest(data);
        setProblems(data.problems || []);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching contest:", err);
        setError(err.message);
        setLoading(false);
      }
    }

    fetchContestData();
  }, [contestId]);

  // Timer logic - countdown from contest duration
  useEffect(() => {
    if (!contest?.participation?.started_at || !contest?.duration_minutes) {
      return;
    }

    const startTime = new Date(contest.participation.started_at).getTime();
    const durationMs = contest.duration_minutes * 60 * 1000;

    const interval = setInterval(async () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const remaining = durationMs - elapsed;

      if (remaining <= 0) {
        setContestSecondsLeft(0);
        clearInterval(interval);
        // Auto-submit on time expiry
        if (!autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          isContestActiveRef.current = false;
          try {
            await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
              method: "POST",
              ...buildJsonPostOptions({}),
            });
          } catch (err) {
            console.error("Auto-submit error:", err);
          }
          showToast('⏰ Time is up! Your contest has been submitted automatically.', 'warning');
          setTimeout(() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            onBack();
          }, 3000);
        }
      } else {
        setContestSecondsLeft(Math.floor(remaining / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [contest]);

  // Problem timer
  useEffect(() => {
    const interval = setInterval(() => {
      setProblemSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedProblemIndex]);

  // Reset code when problem or language changes
  useEffect(() => {
    if (selectedProblem) {
      setCode(starterCodeByLanguage[selectedLanguage] || "// Write your solution here");
      setProblemSecondsElapsed(0);
      setOutputLog("Run your code to see output here.");
      setExecutionMeta({ status: "Ready", time: null, memory: null });
    }
  }, [selectedProblem, selectedLanguage]);

  // Handle run code
  const handleRunCode = useCallback(async () => {
    if (!selectedProblem || !code.trim()) {
      setOutputLog("Please write some code first.");
      return;
    }

    // Validate language match
    const detectedLang = detectLanguageFromCode(code);
    const isMatch = !detectedLang || validateLanguageMatch(detectedLang, selectedLanguage);
    if (!isMatch) {
      setOutputLog(getLanguageMismatchError(detectedLang, selectedLanguage));
      setExecutionMeta({ status: "Error", time: null, memory: null });
      return;
    }

    setExecutionBusy(true);
    setOutputLog("Running your code...");
    setExecutionMeta({ status: "Running", time: null, memory: null });

    try {
      const result = await runCodeExecution({
        sourceCode: code,
        language: selectedLanguage,
        stdin: executionInput || "",
        problemSlug: selectedProblem.slug,
        isSubmit: false,
      });

      setOutputLog(result.output || "No output");
      setExecutionMeta({
        status: result.status || "Completed",
        time: result.time || null,
        memory: result.memory || null,
      });
    } catch (err) {
      console.error("Run error:", err);
      setOutputLog(`Error: ${err.message}`);
      setExecutionMeta({ status: "Error", time: null, memory: null });
    } finally {
      setExecutionBusy(false);
    }
  }, [selectedProblem, code, selectedLanguage, executionInput]);

  // Handle submit code
  const handleSubmitCode = useCallback(async () => {
    if (!selectedProblem || !code.trim()) {
      setOutputLog("Please write some code first.");
      return;
    }

    // Validate language match before submission
    const detectedLang = detectLanguageFromCode(code);
    const isMatch = !detectedLang || validateLanguageMatch(detectedLang, selectedLanguage);
    if (!isMatch) {
      setOutputLog(getLanguageMismatchError(detectedLang, selectedLanguage));
      setExecutionMeta({ status: "Error", time: null, memory: null });
      alert(`Language mismatch detected! You selected ${selectedLanguage} but your code appears to be written in ${detectedLang}. Please select the correct language.`);
      return;
    }

    setExecutionBusy(true);
    setOutputLog("Submitting your solution...");
    setExecutionMeta({ status: "Submitting", time: null, memory: null });

    try {
      const languageId = getLanguageIdForChoice(selectedLanguage);
      
      const response = await fetch(`/api/student/contests/${contestId}/problems/${selectedProblem.slug}/submit/`, {
        method: "POST",
        ...buildJsonPostOptions({
          source_code: code,
          language: selectedLanguage,
          language_id: languageId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Submission failed");
      }

      const result = await response.json();
      const sub = result.submission || result;

      // Build rich output
      const lines = [];

      if (sub.status === 'Accepted') {
        lines.push(`✅ Accepted — All ${sub.total_cases} test case(s) passed!`);
        lines.push(`Score: ${sub.score}/100`);
      } else if (sub.status === 'Compilation Error') {
        lines.push(`🔴 Compilation Error`);
        lines.push('');
        lines.push(sub.compile_error || 'Check your syntax.');
      } else {
        lines.push(`❌ ${sub.status || 'Wrong Answer'} — ${sub.passed_cases}/${sub.total_cases} test case(s) passed`);
        lines.push(`Score: ${sub.score}/100`);
      }

      if (sub.test_results && sub.test_results.length > 0) {
        lines.push('');
        lines.push('─── Sample Test Cases ───');
        sub.test_results.forEach((tc) => {
          lines.push('');
          lines.push(`Case ${tc.case}: ${tc.passed ? '✓ Passed' : '✗ Failed'} [${tc.status}]${tc.time ? ` · ${tc.time}s` : ''}`);
          if (tc.stdin) lines.push(`  Input:    ${tc.stdin}`);
          lines.push(`  Expected: ${tc.expected || '(empty)'}`);
          lines.push(`  Got:      ${tc.actual || '(no output)'}`);
          if (tc.stderr) lines.push(`  Error:    ${tc.stderr}`);
          if (tc.compile_output) lines.push(`  Compile:  ${tc.compile_output}`);
        });
      }

      if (!sub.test_results?.length && sub.stderr) {
        lines.push('');
        lines.push('─── Runtime Error ───');
        lines.push(sub.stderr);
      }

      setOutputLog(lines.join('\n'));
      setExecutionMeta({
        status: sub.status || "Submitted",
        time: null,
        memory: null,
      });

      // Mark problem as solved if accepted
      if (sub.status === 'Accepted') {
        const updatedProblems = [...problems];
        updatedProblems[selectedProblemIndex] = {
          ...updatedProblems[selectedProblemIndex],
          solved: true,
          is_solved: true,
        };
        setProblems(updatedProblems);
        showToast('✅ Solution accepted! Problem solved.', 'success');
      } else {
        showToast(`Submitted: ${sub.status || 'Wrong Answer'} — ${sub.passed_cases}/${sub.total_cases} cases passed`, 'error');
      }
    } catch (err) {
      console.error("Submit error:", err);
      setOutputLog(`Submission error: ${err.message}`);
      setExecutionMeta({ status: "Error", time: null, memory: null });
    } finally {
      setExecutionBusy(false);
    }
  }, [contestId, selectedProblem, code, selectedLanguage, problems, selectedProblemIndex]);

  // Handle finish contest
  const handleFinishContest = useCallback(async () => {
    askDouble(
      async () => {
        try {
          const response = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
            method: "POST",
            ...buildJsonPostOptions({}),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to finish contest");
          }

          isContestActiveRef.current = false;
          showToast('🎉 Contest submitted successfully! Redirecting...', 'success');
          setTimeout(() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            onBack();
          }, 2500);
        } catch (err) {
          console.error("Error finishing contest:", err);
          showToast(`Failed to finish contest: ${err.message}`, 'error');
        }
      },
      "Are you sure you want to finish this contest?",
      "WARNING: This action cannot be undone. Your attempt will be submitted for final evaluation."
    );
  }, [contestId, onBack]);

  // Handle leave contest (same as finish but different messaging)
  const handleLeaveContest = useCallback(async () => {
    askDouble(
      async () => {
        try {
          const response = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
            method: "POST",
            ...buildJsonPostOptions({}),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Failed to finish contest");
          }

          isContestActiveRef.current = false;
          showToast('Contest submitted. Returning to contest list...', 'success');
          setTimeout(() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            onBack();
          }, 2500);
        } catch (err) {
          console.error("Error leaving contest:", err);
          showToast(`Failed to leave contest: ${err.message}`, 'error');
        }
      },
      "Are you sure you want to leave this contest?",
      "Your attempt will be submitted and you cannot return. Confirm departure?"
    );
  }, [contestId, onBack]);

  const editorLanguage = editorLanguageByChoice[selectedLanguage] || "javascript";

  if (loading) {
    return (
      <div className="page-stack">
        <div className="surface-card" style={{ padding: "40px", textAlign: "center" }}>
          <p>Loading contest...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <div className="surface-card" style={{ padding: "40px", textAlign: "center" }}>
          <h2>Error</h2>
          <p>{error}</p>
          <button type="button" className="primary-button" onClick={onBack}>
            Back to Contests
          </button>
        </div>
      </div>
    );
  }

  if (!contest || problems.length === 0) {
    return (
      <div className="page-stack">
        <div className="surface-card" style={{ padding: "40px", textAlign: "center" }}>
          <h2>No problems found</h2>
          <p>This contest has no problems.</p>
          <button type="button" className="primary-button" onClick={onBack}>
            Back to Contests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack problem-page">
      {/* ── Workspace Header ── */}
      <section className="page-header compact-header problem-page-header">
        <div className="workspace-title-row">
          <button
            type="button"
            className="back-to-list-btn"
            onClick={onBack}
          >
            ← Contests
          </button>
          <div>
            <p className="kicker">Contest Workspace</p>
            <h1>{selectedProblem?.title ?? "No problem selected"}</h1>
          </div>
        </div>
        <div className="problem-header-meta">
          <div className="workspace-brief contest-timer-brief">
            <span>{contest.title}</span>
            <strong className="timer-countdown">
              {contestSecondsLeft !== null ? formatDuration(contestSecondsLeft) : "00:00"}
            </strong>
          </div>
          {selectedProblem && (
            <span className={`difficulty-chip ${selectedProblem.difficulty.toLowerCase()}`}>
              {selectedProblem.difficulty}
            </span>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              type="button" 
              className="ghost-button dense-action" 
              onClick={handleLeaveContest}
              style={{ color: '#dc2626' }}
            >
              Leave Contest
            </button>
            <button type="button" className="primary-button dense-action" onClick={handleFinishContest}>
              Finish Contest
            </button>
          </div>
        </div>
      </section>

      {/* ── Filter / Concept toolbar ── */}
      <section className="surface-card code2day-toolbar">
        <div className="toolbar-row">
          <div className="toolbar-group wide">
            <span className="filter-label">Contest Problems</span>
            <div className="chip-scroll dense">
              {problems.map((problem, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={idx === selectedProblemIndex ? "switch-pill active dense" : "switch-pill dense"}
                  onClick={() => setSelectedProblemIndex(idx)}
                >
                  {idx + 1}. {problem.title}
                  {problem.is_solved && <span className="count-pill">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbar-group compact">
            <span className="filter-label">Timers</span>
            <div className="timer-stack">
              <span>Problem {formatDuration(problemSecondsElapsed)}</span>
              <span>Contest {contestSecondsLeft !== null ? formatDuration(contestSecondsLeft) : "00:00"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ──3-Column Layout ── */}
      <section className="problem-layout code2day-layout">
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
                <h3>Contest Problems</h3>
                <span>{problems.length} problems</span>
              </div>

              <div className="problem-section-list scroll-column">
                <div className="problem-section-card compact">
                  <div className="problem-list">
                    {problems.map((problem, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={
                          idx === selectedProblemIndex
                            ? "problem-list-row selected"
                            : "problem-list-row"
                        }
                        onClick={() => {
                          setSelectedProblemIndex(idx);
                          setProblemDetailTab("current");
                        }}
                      >
                        <div className="problem-index">{idx + 1}</div>
                        <div className="problem-meta">
                          <strong>{problem.title}</strong>
                          <p>{problem.tags?.join(" | ") || "Contest problem"}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {problem.is_solved && <span style={{ color: "#4ade80" }}>✓</span>}
                          <span className={`mini-pill ${problem.difficulty.toLowerCase()}`}>
                            {problem.difficulty}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
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
                  {POPULAR_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>

              <div className="editor-frame" style={{ minHeight: '400px', height: '400px' }}>
                <Editor
                  key={`${selectedProblem?.id}-${selectedLanguage}`}
                  height="400px"
                  language={editorLanguage}
                  theme="vs-dark"
                  value={code || starterCodeByLanguage[selectedLanguage] || "// Write your solution here"}
                  onChange={(value) => setCode(value ?? "")}
                  onMount={(editor) => {
                    editor.focus();
                    setTimeout(() => editor.layout(), 200);
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
                    automaticLayout: true,
                    wordWrap: "on",
                    lineNumbers: "on",
                  }}
                />
              </div>

              <div className="editor-actions compact-row">
                <div className="editor-status">
                  <span>{selectedProblem.title}</span>
                  <strong>Contest Problem {selectedProblemIndex + 1}</strong>
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
              placeholder="Optional stdin for a custom run."
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
              {["current", "hints"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={problemDetailTab === tab ? "tab-pill active dense" : "tab-pill dense"}
                  onClick={() => setProblemDetailTab(tab)}
                >
                  {tab === "current" ? "Problem" : "Hints"}
                </button>
              ))}
            </div>

            <div className="statement-scroll">
              {selectedProblemDetails ? (
                <>
                  {problemDetailTab === "current" && (
                    <>
                      <div className="problem-description">
                        {selectedProblemDetails.description.split('\\n').map((line, i) => (
                          <p key={i} className="desc-paragraph">{line}</p>
                        ))}
                      </div>
                      {selectedProblemDetails.examples && selectedProblemDetails.examples.length > 0 && (
                        <div className="info-box">
                          <h4>Examples</h4>
                          {selectedProblemDetails.examples.map((ex, idx) => (
                            <div key={idx} className="example-block">
                              <pre>{`Input: ${ex.input}\nOutput: ${ex.output}${ex.explanation ? `\nExplanation: ${ex.explanation}` : ''}`}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="info-box">
                        <h4>Tags</h4>
                        <div className="tag-row">
                          {(selectedProblemDetails.tags ?? []).map((tag) => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {problemDetailTab === "hints" && (
                    <>
                      {selectedProblemDetails.hints && selectedProblemDetails.hints.length > 0 ? (
                        <div className="hints-list">
                          {selectedProblemDetails.hints.map((hint, idx) => (
                            <div key={idx} className="hint-item">
                              <strong>Hint {idx + 1}</strong>
                              <p className="body-copy">{hint}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="body-copy">No hints available for this problem yet.</p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="body-copy">Loading problem details...</p>
              )}
            </div>
          </article>
        </section>
      </section>
      {confirmState.show && (
        <DoubleConfirmModal 
          show={confirmState.show}
          m1={confirmState.m1}
          m2={confirmState.m2}
          firstOk={confirmState.firstOk}
          setFirstOk={(val) => setConfirmState(prev => ({ ...prev, firstOk: val }))}
          onConfirm={async () => {
            const cb = confirmState.onConfirm;
            setConfirmState(prev => ({ ...prev, show: false }));
            if (cb) await cb();
          }}
          onCancel={() => setConfirmState(prev => ({ ...prev, show: false }))}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default ContestWorkspacePage;
