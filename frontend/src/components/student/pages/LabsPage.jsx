import { useState, useEffect, useRef, useCallback } from "react";
import Editor from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { getCsrfToken, configureEditorProtection } from "../../../lib/appUtils";
import { editorLanguageMap } from "../../../lib/codeExecution";
import { starterCodeByLanguage, LAB_LANGUAGES } from "../../../lib/appData";
import SuccessAnimation from "../../common/SuccessAnimation";
import {
  FlaskConical, ChevronLeft, BookOpen, CheckCircle2,
  Circle, Clock, Calendar, UserCheck,
  ChevronDown, ChevronUp, Download, Loader2, AlertCircle,
} from "lucide-react";

// Use the bundled ESM Monaco build instead of the AMD loader path.
loader.config({ monaco });

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

function useCountdown(end) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(end) - new Date();
      if (diff <= 0) { setTxt("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const d = Math.floor(h / 24);
      if (d > 0) setTxt(`${d}d ${h % 24}h left`);
      else if (h > 0) setTxt(`${h}h ${m}m left`);
      else setTxt(`${m}m left`);
    }
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [end]);
  return txt;
}

// ─── Lab list card ────────────────────────────────────────────────────────────
function LabCard({ lab, onClick }) {
  const countdown = useCountdown(lab.end_date);
  const expired = lab.is_expired;
  const progress = lab.student_progress ?? { completed: 0, total: lab.exercise_count };
  const pct = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className={`slab-card${expired ? " expired" : ""}`} onClick={() => onClick(lab)}>
      <div className={`slab-card-stripe${expired ? " expired" : ""}`} />
      <div className="slab-card-body">
        <div className="slab-card-top">
          <span className="slab-card-name">{lab.name}</span>
          <span className={`slab-badge${expired ? " expired" : ""}`}>
            <Clock size={9} /> {countdown}
          </span>
        </div>

        <div className="slab-card-chips">
          {lab.staff_in_charge && (
            <span className="slab-chip"><UserCheck size={10} /> {lab.staff_in_charge.name}</span>
          )}
          <span className="slab-chip"><BookOpen size={10} /> {lab.exercise_count} exercises</span>
        </div>

        <div className="slab-card-dates">
          <Calendar size={11} />
          <span>{fmt(lab.start_date)}</span>
          <span className="slab-sep">→</span>
          <span>{fmt(lab.end_date)}</span>
        </div>

        {progress.total > 0 && (
          <div className="slab-progress">
            <div className="slab-progress-bar">
              <div className="slab-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="slab-progress-txt">{progress.completed}/{progress.total} done</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Problem statement renderer ───────────────────────────────────────────────
function parseExampleLines(lines) {
  const exLines = lines.filter(l => l.trim());
  const examples = [];
  let ex = null;
  for (const l of exLines) {
    const im = l.match(/^\s*Input:\s*(.*)/);
    const om = l.match(/^\s*Output:\s*(.*)/);
    const em = l.match(/^\s*Explanation:\s*(.*)/);
    if (im) { ex = { input: im[1], output: "", explanation: "" }; examples.push(ex); }
    else if (om && ex) ex.output = om[1];
    else if (em && ex) ex.explanation = em[1];
  }
  return examples;
}

function ProblemStatement({ text, explanation }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!text) return null;

  // Parse sections from the stored template format
  const sections = [];
  let cur = { type: "text", lines: [] };
  for (const raw of text.split("\n")) {
    const t = raw.trim();
    if (t === "Examples:") {
      if (cur.lines.length) sections.push(cur);
      cur = { type: "examples", lines: [] };
    } else if (t === "Constraints:") {
      if (cur.lines.length) sections.push(cur);
      cur = { type: "constraints", lines: [] };
    } else if (/^Difficulty:\s/.test(t)) {
      if (cur.lines.length) sections.push(cur);
      sections.push({ type: "difficulty", value: t.replace("Difficulty:", "").trim() });
      cur = { type: "text", lines: [] };
    } else if (/^Hint:\s/.test(t)) {
      if (cur.lines.length) sections.push(cur);
      sections.push({ type: "hint", value: t.replace("Hint:", "").trim() });
      cur = { type: "text", lines: [] };
    } else {
      cur.lines.push(raw);
    }
  }
  if (cur.lines.length) sections.push(cur);

  const diffColor = { Easy: "#16a34a", Medium: "#d97706", Hard: "#dc2626" };

  return (
    <div className="slab-problem-box">
      <div className="slab-problem-hdr" onClick={() => setCollapsed(c => !c)}>
        <span className="slab-problem-label"><BookOpen size={14} /> Problem Statement</span>
        {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </div>
      {!collapsed && (
        <div className="slab-problem-body">
          {sections.map((s, i) => {
            if (s.type === "text") {
              const body = s.lines.join("\n").trim();
              return body ? <p key={i} className="slab-problem-text">{body}</p> : null;
            }
            if (s.type === "difficulty") {
              const c = diffColor[s.value] || "#64748b";
              return <span key={i} className="slab-diff-chip" style={{ background: c }}>{s.value}</span>;
            }
            if (s.type === "hint") {
              const exSection = sections.find(sec => sec.type === "examples");
              const examples = exSection ? parseExampleLines(exSection.lines) : [];
              return (
                <div key={i} className="slab-hint-box">
                  <strong>Hint:</strong> {s.value}
                  {examples.length > 0 && (
                    <div className="slab-examples">
                      {examples.map((ex, j) => (
                        <div key={j} className="slab-example">
                          <div className="slab-io"><span>Input</span><code>{ex.input}</code></div>
                          <div className="slab-io"><span>Output</span><code>{ex.output}</code></div>
                          {ex.explanation && <div className="slab-io explanation"><span>Sample Note</span><span className="formatted-explanation">{ex.explanation}</span></div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            // Examples render inside the Hint box above. If this exercise has no
            // hint text (so no "hint" section exists at all), fall back to showing
            // the examples in the same box style on their own, so the data isn't lost.
            if (s.type === "examples") {
              const hasHintSection = sections.some(sec => sec.type === "hint");
              if (hasHintSection) return null;
              const examples = parseExampleLines(s.lines);
              if (!examples.length) return null;
              return (
                <div key={i} className="slab-hint-box">
                  <div className="slab-examples">
                    {examples.map((ex, j) => (
                      <div key={j} className="slab-example">
                        <div className="slab-io"><span>Input</span><code>{ex.input}</code></div>
                        <div className="slab-io"><span>Output</span><code>{ex.output}</code></div>
                        {ex.explanation && <div className="slab-io explanation"><span>Sample Note</span><span className="formatted-explanation">{ex.explanation}</span></div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            // Legacy exercises may still have a Constraints section in their stored
            // description — intentionally not rendered anywhere anymore.
            if (s.type === "constraints") return null;
            return null;
          })}
          {explanation && (
            <div style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              background: "#0f172a",
              border: "1px solid #1e293b",
              color: "#f8fafc"
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#38bdf8", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                💡 Detailed Explanation &amp; Walkthrough
              </div>
              <div style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "#cbd5e1"
              }}>
                {explanation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Exercise editor (mirrors the Problems page workspace + console) ─────────
function ExerciseEditor({ lab, exercise, onBack, onSubmitted, dashboard }) {
  const allowedLanguages = lab.allowed_languages?.length ? lab.allowed_languages : LAB_LANGUAGES;
  const initialLang = exercise.language || allowedLanguages[0];
  const [code, setCode] = useState(exercise.code || starterCodeByLanguage[initialLang] || "");
  const [lang, setLang] = useState(initialLang);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(exercise.submitted);
  const [submittedAt, setSubmittedAt] = useState(exercise.submitted_at);
  const [submitErr, setSubmitErr] = useState("");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportErr, setReportErr] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [outputLog, setOutputLog] = useState("Run your code to see output here.");
  const [elapsedTime, setElapsedTime] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [sessionLockReason, setSessionLockReason] = useState("");

  const recordViolation = useCallback(async (action, reason) => {
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/lab/v2/student/labs/${lab.id}/violation/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": token || "",
        },
        body: JSON.stringify({ action, reason }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.is_locked) {
          setSessionLocked(true);
          setSessionLockReason(d.lock_reason || "Security violation limit reached.");
        }
      }
    } catch (e) {
      console.error("Failed to record violation", e);
    }
  }, [lab.id]);

  const handleBack = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onBack();
  };

  // 1. Copy-Paste lock
  useEffect(() => {
    if (lab.lab_type !== "university" || !lab.enable_copy_paste_lock) return;
    const preventCopyPaste = (e) => {
      e.preventDefault();
      alert("Copy and paste is disabled for this proctored lab session.");
    };
    document.addEventListener("copy", preventCopyPaste);
    document.addEventListener("paste", preventCopyPaste);
    document.addEventListener("cut", preventCopyPaste);
    return () => {
      document.removeEventListener("copy", preventCopyPaste);
      document.removeEventListener("paste", preventCopyPaste);
      document.removeEventListener("cut", preventCopyPaste);
    };
  }, [lab.lab_type, lab.enable_copy_paste_lock]);

  // 2. Tab switch check
  useEffect(() => {
    if (lab.lab_type !== "university" || !lab.enable_tab_switch_check) return;
    const handleVisibility = () => {
      if (document.hidden) {
        recordViolation("tab_switch", "Tab switched or browser minimized");
      }
    };
    const handleBlur = () => {
      recordViolation("tab_switch", "Window lost focus");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [lab.lab_type, lab.enable_tab_switch_check, recordViolation]);

  // 3. Fullscreen lock
  useEffect(() => {
    if (lab.lab_type !== "university" || !lab.enable_fullscreen_lock) return;
    
    const checkFullscreen = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (!isFull) {
        recordViolation("fullscreen_exit", "Exited fullscreen mode");
      }
    };

    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    
    const handleFullscreenChange = () => {
      checkFullscreen();
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [lab.lab_type, lab.enable_fullscreen_lock, recordViolation]);

  const timerRef = useRef(null);
  useEffect(() => () => clearInterval(timerRef.current), []);

  const monacoLang = editorLanguageMap[lang] || "plaintext";

  // Same dirty-tracking method used on the practice-problems page: the
  // editor's onChange (below) distinguishes a genuine keystroke from the
  // echo of our own setCode(...) calls, so nothing here can silently
  // overwrite code the student actually typed.
  const lastProgrammaticCodeRef = useRef(code);

  const userEditedCodeRef = useRef(false);

  const handleEditorCodeChange = useCallback((value) => {
    const next = value ?? "";
    if (next !== lastProgrammaticCodeRef.current) {
      userEditedCodeRef.current = true;
    }
    setCode(next);
  }, []);

  function handleLangChange(newLang) {
    const isUntouched = !userEditedCodeRef.current || !code.trim() || code === starterCodeByLanguage[lang];
    setLang(newLang);
    if (isUntouched) {
      const nextCode = starterCodeByLanguage[newLang] || "";
      lastProgrammaticCodeRef.current = nextCode;
      userEditedCodeRef.current = false;
      setCode(nextCode);
    }
  }

  function startTimer() {
    setElapsedTime(0);
    clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - start) / 1000));
    }, 500);
  }

  function stopTimer() {
    clearInterval(timerRef.current);
  }

  async function runCode() {
    if (!code.trim()) return;
    setRunning(true);
    startTimer();
    setOutputLog("Running…");
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/lab/v2/${lab.id}/exercises/${exercise.id}/run/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
        credentials: "include",
        body: JSON.stringify({ code, language: lang, stdin: customInput }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOutputLog(result.detail || "Execution failed.");
        return;
      }
      let out = [
        result.stdout,
        result.stderr,
        result.compile_output,
      ].filter(Boolean).join("\n").trim() || result.output || "No output";

      // When run without custom input, the backend runs the exercise's own
      // test cases instead of a single stdin — show the same Case-by-case
      // Passed/Failed breakdown the Problems page shows for its Run button.
      if (result.test_results && result.test_results.length > 0) {
        const lines = [`\n--- Test Cases (${result.passed_cases}/${result.total_cases} passed) ---`];
        result.test_results.forEach((tc, i) => {
          lines.push(
            `\nCase ${i + 1}: ${tc.passed ? "✓ Passed" : "✗ Failed"}` +
            (tc.stdin ? `\n  Input:    ${tc.stdin}` : "") +
            `\n  Expected: ${tc.expected}` +
            `\n  Got:      ${tc.actual || "(no output)"}` +
            (tc.time ? `\n  Time: ${tc.time}s` : ""),
          );
        });
        out = out + lines.join("");
      }
      setOutputLog(out);
    } catch (e) {
      setOutputLog(e.message || "Execution error");
    } finally {
      stopTimer();
      setRunning(false);
    }
  }

  async function submit() {
    if (!code.trim()) { setSubmitErr("Write your solution before submitting"); return; }
    setBusy(true); setSubmitErr("");
    startTimer();
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/lab/v2/${lab.id}/exercises/${exercise.id}/submit/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-CSRFToken": token } : {}) },
        credentials: "include",
        body: JSON.stringify({ code, language: lang }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmitted(true);
        setSubmittedAt(d.submitted_at);
        setShowSuccessAnimation(true);
        onSubmitted(exercise.id, { code, language: lang, submitted_at: d.submitted_at });
      } else {
        setSubmitErr(d.error || "Submission failed. Please try again.");
        // Show the failing test cases in the console too, the same
        // Case-by-case breakdown the Run button shows, so the student can
        // see exactly why the submission was rejected without switching views.
        if (d.test_results && d.test_results.length > 0) {
          const lines = [`--- Test Cases (${d.passed_cases}/${d.total_cases} passed) ---`];
          d.test_results.forEach((tc, i) => {
            lines.push(
              `\nCase ${i + 1}: ${tc.passed ? "✓ Passed" : "✗ Failed"}` +
              (tc.stdin ? `\n  Input:    ${tc.stdin}` : "") +
              `\n  Expected: ${tc.expected}` +
              `\n  Got:      ${tc.actual || "(no output)"}`,
            );
          });
          setOutputLog(lines.join(""));
        }
      }
    } catch { setSubmitErr("Network error"); }
    finally { stopTimer(); setBusy(false); }
  }

  async function generateReport() {
    setReportBusy(true); setReportErr("");
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/lab/v2/${lab.id}/exercises/${exercise.id}/report/`, {
        method: "POST",
        headers: token ? { "X-CSRFToken": token } : {},
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Report generation failed.";
        try { msg = (await res.json()).error || msg; } catch { /* body wasn't JSON */ }
        setReportErr(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lab_record_${exercise.title.slice(0, 40).replace(/[^a-z0-9]+/gi, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setReportErr("Network error.");
    } finally {
      setReportBusy(false);
    }
  }

  if (sessionLocked) {
    return (
      <div className="slab-lab-detail" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{ marginTop: 60, display: "inline-block", padding: 30, background: "#1e1b4b", borderRadius: 12, border: "1px solid #dc2626", maxWidth: 500 }}>
          <AlertCircle size={48} style={{ color: "#dc2626", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, color: "#f8fafc", marginBottom: 8 }}>Session Locked</h2>
          <p style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 20 }}>
            {sessionLockReason}
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 20 }}>
            Please contact your laboratory staff or HOD to unlock your session.
          </p>
          <button type="button" className="slab-back" style={{ display: "block", width: "100%", textAlign: "center" }} onClick={handleBack}>
            Return to All Labs
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack problem-page">
      {showSuccessAnimation && (
        <SuccessAnimation onDone={() => setShowSuccessAnimation(false)} />
      )}
      {/* ── Workspace Header ── */}
      <section className="page-header compact-header problem-page-header">
        <div className="workspace-title-row">
          <button type="button" className="back-to-list-btn" onClick={handleBack}>
            ← All Exercises
          </button>
          <div>
            <p className="kicker">{lab.name}</p>
            <h1>{exercise.title}</h1>
          </div>
        </div>
        <div className="problem-header-meta" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {submitted && (
            <span className="difficulty-chip easy">
              <CheckCircle2 size={13} style={{ marginRight: 4, verticalAlign: "-2px" }} />
              Submitted {fmtDT(submittedAt)}
            </span>
          )}
          {submitted && (
            <button
              type="button"
              className="ghost-button dense-action"
              disabled={reportBusy}
              onClick={generateReport}
              title="Generate a printable lab record (Aim, Algorithm, Program, Output, Result)"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {reportBusy ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              {reportBusy ? "Generating…" : "Generate Lab Record"}
            </button>
          )}
          {reportErr && <span style={{ color: "#dc2626", fontSize: 12 }}>{reportErr}</span>}
        </div>
      </section>

      <section className="problem-layout code2day-layout" style={{ gridTemplateColumns: "1fr" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

          {/* TOP: Problem Statement */}
          <section className="right-column judge-right" style={{ minHeight: 0 }}>
            <article className="surface-card statement-panel judge-statement">
              <div className="section-head">
                <h2>{exercise.title}</h2>
              </div>
              <div className="statement-scroll">
                <div className="problem-description">
                  <ProblemStatement text={exercise.description} explanation={exercise.explanation} />
                </div>
              </div>
            </article>
          </section>

          {/* BOTTOM: Code Editor + Console */}
          <section className="center-column judge-center" style={{ minHeight: 0 }}>
            <article className="surface-card editor-main-card judge-editor">
              <div className="editor-topbar">
                <div>
                  <h2>Code Workspace</h2>
                  <span>{lang} Workspace</span>
                </div>
                <select
                  className="difficulty-select language-select editor-language-select"
                  value={lang}
                  onChange={(e) => handleLangChange(e.target.value)}
                >
                  {allowedLanguages.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="editor-frame" style={{ minHeight: "400px", height: "400px" }}>
                <Editor
                  key={`${exercise.id}-${lang}`}
                  height="400px"
                  language={monacoLang}
                  theme="vs-dark"
                  value={code}
                  onChange={handleEditorCodeChange}
                  onMount={(editor, monaco) => {
                    const allowCopyPaste = Boolean(dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste);
                    configureEditorProtection(editor, monaco, allowCopyPaste);
                    editor.focus();
                    setTimeout(() => editor.layout(), 200);
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    padding: { top: 10 },
                    scrollBeyondLastLine: false,
                    roundedSelection: true,
                    automaticLayout: true,
                    wordWrap: "on",
                    lineNumbers: "on",
                    folding: true,
                    matchBrackets: "always",
                    autoIndent: "full",
                    formatOnPaste: false,
                    formatOnType: true,
                    quickSuggestions: true,
                    tabCompletion: "on",
                    parameterHints: { enabled: true },
                    hover: { enabled: true },
                    contextmenu: Boolean(dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste),
                    dragAndDrop: Boolean(dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste),
                  }}
                />
              </div>

              <div className="editor-actions compact-row">
                <div className="editor-status">
                  <span>{exercise.title}</span>
                </div>
                <div className="editor-buttons">
                  <button
                    type="button"
                    className="ghost-button dense-action"
                    onClick={runCode}
                    disabled={running || busy}
                  >
                    {running ? `Running… ${elapsedTime}s` : "Run"}
                  </button>
                  <button
                    type="button"
                    className="primary-button dense-action"
                    onClick={submit}
                    disabled={busy || running}
                  >
                    {busy ? `Submitting… ${elapsedTime}s` : submitted ? "Resubmit" : "Submit"}
                  </button>
                </div>
              </div>
              {submitErr && <p className="slab-error" style={{ margin: 0 }}>{submitErr}</p>}
              {submitted && (
                <p className="slab-resubmit-note" style={{ margin: 0 }}>
                  Already submitted — submitting again updates your solution.
                </p>
              )}
            </article>

            <article className="surface-card output-card judge-output">
              <div className="section-head">
                <h3>Console</h3>
                <span>Run output and execution notes</span>
              </div>

              <label htmlFor="lab-execution-input" className="filter-label">Custom Input</label>
              <textarea
                id="lab-execution-input"
                className="execution-input"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Optional stdin for a custom run."
              />
              <div className="output-panel-shell">
                {running || busy ? (
                  <div className="output-panel compiling-overlay">
                    <div className="compiling-spinner" />
                    <div className="compiling-label">
                      {busy ? "Submitting…" : "Running…"}
                      <span className="compiling-elapsed">{elapsedTime}s</span>
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

// ─── Lab detail (exercise list) ───────────────────────────────────────────────
function LabDetail({ lab, onBack, dashboard }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeExercise, setActiveExercise] = useState(null);
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [downloadingReportId, setDownloadingReportId] = useState(null);
  const [downloadingFullReport, setDownloadingFullReport] = useState(false);
  const [reportErr, setReportErr] = useState("");

  useEffect(() => {
    fetch(`/api/lab/v2/${lab.id}/exercises/list/`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.is_locked) {
          setLocked(true);
          setLockReason(d.lock_reason || "Violation detected.");
        } else {
          setExercises(d.exercises ?? []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [lab.id]);

  async function handleDownloadExerciseReport(e, exId, title) {
    e.stopPropagation();
    setDownloadingReportId(exId);
    setReportErr("");
    try {
      const token = getCsrfToken();
      const res = await fetch(`/api/lab/v2/${lab.id}/exercises/${exId}/report/`, {
        method: "POST",
        headers: token ? { "X-CSRFToken": token } : {},
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Report download failed.";
        try { msg = (await res.json()).error || msg; } catch {}
        setReportErr(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lab_record_${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setReportErr("Network error downloading report.");
    } finally {
      setDownloadingReportId(null);
    }
  }

  async function handleDownloadFullLabReport() {
    setDownloadingFullReport(true);
    setReportErr("");
    try {
      const res = await fetch(`/api/lab/v2/student/labs/${lab.id}/full-report/`, {
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Full report download failed.";
        try { msg = (await res.json()).error || msg; } catch {}
        setReportErr(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Lab_Record_Notebook_${lab.name.slice(0, 40).replace(/[^a-z0-9]+/gi, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setReportErr("Network error downloading full report.");
    } finally {
      setDownloadingFullReport(false);
    }
  }

  function onSubmitted(exerciseId, { code, language, submitted_at }) {
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id === exerciseId ? { ...ex, submitted: true, code, language, submitted_at } : ex
      )
    );
  }

  if (locked) {
    return (
      <div className="slab-lab-detail" style={{ textAlign: "center", padding: "40px 20px" }}>
        <button type="button" className="slab-back" onClick={onBack}>
          <ChevronLeft size={15} /> All Labs
        </button>
        <div style={{ marginTop: 60, display: "inline-block", padding: 30, background: "#1e1b4b", borderRadius: 12, border: "1px solid #dc2626", maxWidth: 500 }}>
          <AlertCircle size={48} style={{ color: "#dc2626", margin: "0 auto 16px" }} />
          <h2 style={{ fontSize: 20, color: "#f8fafc", marginBottom: 8 }}>Session Locked</h2>
          <p style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 20 }}>
            {lockReason}
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            Please contact your laboratory staff or HOD to unlock your session.
          </p>
        </div>
      </div>
    );
  }

  if (activeExercise) {
    return (
      <ExerciseEditor
        lab={lab}
        exercise={activeExercise}
        dashboard={dashboard}
        onBack={() => setActiveExercise(null)}
        onSubmitted={(id, data) => {
          onSubmitted(id, data);
          setActiveExercise((e) => e && e.id === id ? { ...e, ...data, submitted: true } : e);
        }}
      />
    );
  }

  const done = exercises.filter((e) => e.submitted).length;

  return (
    <div className="slab-lab-detail">
      <button type="button" className="slab-back" onClick={onBack}>
        <ChevronLeft size={15} /> All Labs
      </button>

      <div className="slab-lab-hdr" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 className="slab-lab-title">{lab.name}</h2>
          <p className="slab-lab-meta">
            {lab.staff_in_charge ? `Staff: ${lab.staff_in_charge.name} · ` : ""}
            {fmt(lab.start_date)} → {fmt(lab.end_date)}
          </p>
        </div>
        {done > 0 && (
          <button
            type="button"
            className="primary-button dense-action"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={handleDownloadFullLabReport}
            disabled={downloadingFullReport}
            title="Download complete Laboratory Record Notebook PDF with all completed exercises"
          >
            {downloadingFullReport ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
            {downloadingFullReport ? "Generating Notebook…" : "Download Full Lab Record Notebook (PDF)"}
          </button>
        )}
      </div>

      {reportErr && (
        <div style={{ padding: "8px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          {reportErr}
        </div>
      )}

      {exercises.length > 0 && (
        <div className="slab-overall">
          <div className="slab-overall-bar">
            <div className="slab-overall-fill" style={{ width: `${exercises.length ? Math.round((done / exercises.length) * 100) : 0}%` }} />
          </div>
          <span>{done} / {exercises.length} completed</span>
        </div>
      )}

      {loading ? (
        <div className="slab-loading">Loading exercises…</div>
      ) : exercises.length === 0 ? (
        <div className="slab-no-exercises">
          <BookOpen size={36} />
          <p>No exercises added yet. Check back later.</p>
        </div>
      ) : (
        <div className="slab-ex-list">
          {exercises.map((ex, i) => (
            <div key={ex.id} className={`slab-ex-row${ex.submitted ? " done" : ""}`}
              onClick={() => setActiveExercise(ex)}>
              <div className="slab-ex-num">
                {ex.submitted
                  ? <CheckCircle2 size={18} className="slab-done-icon" />
                  : <Circle size={18} className="slab-pending-icon" />}
              </div>
              <div className="slab-ex-info">
                <div className="slab-ex-title">{ex.title}</div>
                {ex.description && (
                  <div className="slab-ex-preview">
                    {ex.description.slice(0, 80)}{ex.description.length > 80 ? "…" : ""}
                  </div>
                )}
              </div>
              <div className="slab-ex-right" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {ex.submitted ? (
                  <>
                    <span className="slab-done-tag">Done</span>
                    <button
                      type="button"
                      className="ghost-button dense-action"
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12 }}
                      disabled={downloadingReportId === ex.id}
                      onClick={(e) => handleDownloadExerciseReport(e, ex.id, ex.title)}
                      title="Download exercise PDF report"
                    >
                      {downloadingReportId === ex.id ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                      {downloadingReportId === ex.id ? "…" : "Report"}
                    </button>
                  </>
                ) : (
                  <span className="slab-open-tag">Open →</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const LAB_TYPE_TABS = [
  { id: "practical", label: "💻 Curriculum / Practice Lab" },
  { id: "university", label: "🏛️ University Practical Lab" },
  { id: "company", label: "🏢 Company Based Lab" },
];

export default function LabsPage({ dashboard }) {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLab, setSelectedLab] = useState(null);
  const [typeFilter, setTypeFilter] = useState("practical");

  useEffect(() => {
    fetch("/api/lab/v2/student/", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setLabs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (selectedLab) {
    return <LabDetail lab={selectedLab} dashboard={dashboard} onBack={() => setSelectedLab(null)} />;
  }

  const labsOfType = labs.filter((l) => (l.lab_type || "practical") === typeFilter);
  const active = labsOfType.filter((l) => !l.is_expired);
  const expired = labsOfType.filter((l) => l.is_expired);

  return (
    <div className="slab-root">
      <div className="slab-page-head">
        <div className="slab-page-title"><FlaskConical size={20} /> Lab</div>
        {!loading && (
          <span className="slab-head-stat">{active.length} active · {labsOfType.length} total</span>
        )}
      </div>

      <div className="slab-type-tabs">
        {LAB_TYPE_TABS.map((t) => (
          <button key={t.id} type="button"
            className={`slab-type-tab${typeFilter === t.id ? " active" : ""}`}
            onClick={() => setTypeFilter(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="slab-loading">Loading your labs…</div>
      ) : labsOfType.length === 0 ? (
        <div className="slab-empty">
          <FlaskConical size={48} />
          <h3>No labs assigned</h3>
          <p>
            {typeFilter === "company"
              ? "No company-based labs assigned yet. Check back later."
              : "Labs assigned to your batch will appear here."}
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="slab-section">
              <div className="slab-section-label">Active Labs</div>
              <div className="slab-grid">
                {active.map((l) => <LabCard key={l.id} lab={l} onClick={setSelectedLab} />)}
              </div>
            </section>
          )}
          {expired.length > 0 && (
            <section className="slab-section">
              <div className="slab-section-label">Expired</div>
              <div className="slab-grid">
                {expired.map((l) => <LabCard key={l.id} lab={l} onClick={setSelectedLab} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
