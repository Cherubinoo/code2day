// Embedded coding workspace for a "Programming" resource inside Competitive
// Practice — same Monaco editor + /api/run/ execution + /api/problems/progress/
// persistence the main Problems page (App.jsx) uses, so solving a problem from
// here counts toward the exact same progress/streak/score. Deliberately a
// separate, self-contained component rather than reusing ProblemsPage's
// WorkspaceView directly — that component is tightly coupled to App.jsx's own
// giant prop tree, so duplicating just the editor+execution wiring here (all
// of it already-exported, reusable utilities — runCodeExecution, appUtils'
// buildJsonPostOptions, normalizeProblems) is the separate "track" asked for,
// without dragging Competitive Practice into App.jsx's state.
import React, { useState, useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { ChevronLeft, Loader2 } from "lucide-react";
import { runCodeExecution, editorLanguageMap } from "../../../lib/codeExecution";
import { starterCodeByLanguage } from "../../../lib/appData";
import { buildJsonPostOptions, extractApiError, configureEditorProtection, normalizeProblems } from "../../../lib/appUtils";

loader.config({ monaco });

// Matches ProblemsPage.jsx's own restriction — the platform's execution
// backend only actually supports these 4, regardless of what a problem's
// available_languages lists.
const POPULAR_LANGUAGES = ["C", "C++", "Java", "Python"];

export default function CompetitiveProblemWorkspace({ problemSlug, dashboard, onBack }) {
  const [problem, setProblem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("Python");
  const [code, setCode] = useState("");
  const [executionInput, setExecutionInput] = useState("");
  const [outputLog, setOutputLog] = useState("Run your code to see output here.");
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionMeta, setExecutionMeta] = useState({ status: "", time: "", memory: "" });
  // A ref, not a plain boolean — see appUtils.configureEditorProtection's
  // own docstring for why: Monaco's onMount fires once per editor
  // instance, so a boolean captured there would go stale the moment a
  // staff/HOD copy-paste permission change lands afterward.
  const allowCopyPasteRef = useRef(false);
  allowCopyPasteRef.current = Boolean(dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setLoadError("");
    fetch(`/api/problems/${encodeURIComponent(problemSlug)}/`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load this problem.");
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const normalized = normalizeProblems([data])[0];
        setProblem(normalized);
        const availableLangs = (normalized.available_languages || []).filter((l) => POPULAR_LANGUAGES.includes(l));
        const lang = (normalized.current_language && availableLangs.includes(normalized.current_language))
          ? normalized.current_language
          : (availableLangs[0] || "Python");
        setSelectedLanguage(lang);
        setCode(
          normalized.last_solutions?.[lang]?.source_code
          || normalized.starter_code?.[lang]
          || starterCodeByLanguage[lang]
          || "// Write your solution here",
        );
      })
      .catch((err) => { if (isMounted) setLoadError(err.message || "Failed to load this problem."); })
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [problemSlug]);

  function changeLanguage(lang) {
    setSelectedLanguage(lang);
    setCode(
      problem?.last_solutions?.[lang]?.source_code
      || problem?.starter_code?.[lang]
      || starterCodeByLanguage[lang]
      || "// Write your solution here",
    );
  }

  async function persistProgress(progressState) {
    try {
      const res = await fetch("/api/problems/progress/", buildJsonPostOptions({
        problem_slug: problemSlug, language: selectedLanguage, progress_state: progressState,
      }));
      const payload = await res.json();
      if (!res.ok) throw new Error(extractApiError(payload, "Could not save progress."));
      setProblem((prev) => (prev ? { ...prev, progress_state: payload.progress_state ?? progressState } : prev));
    } catch (err) {
      console.error("Could not save problem progress", err);
      setOutputLog((current) => `${current}\n\nProgress save failed.`);
    }
  }

  async function runOrSubmit(isSubmit) {
    setExecutionBusy(true);
    try {
      const result = await runCodeExecution({
        sourceCode: code, language: selectedLanguage, stdin: executionInput, problemSlug, isSubmit,
      });
      setExecutionMeta({
        status: result.status || "Unknown",
        time: result.time ? `${result.time}s` : "",
        memory: result.memory ? `${result.memory} KB` : "",
      });
      let displayOutput = result.output || "Execution finished with no output.";
      if (result.test_results && result.test_results.length > 0) {
        const lines = [`\n--- Test Cases (${result.passed_cases}/${result.total_cases} passed) ---`];
        result.test_results.forEach((tc, i) => {
          lines.push(
            `\nCase ${i + 1}: ${tc.passed ? "✓ Passed" : "✗ Failed"}`
            + (tc.stdin ? `\n  Input:    ${tc.stdin}` : "")
            + `\n  Expected: ${tc.expected}`
            + `\n  Got:      ${tc.actual || "(no output)"}`
            + (tc.time ? `\n  Time: ${tc.time}s` : ""),
          );
        });
        displayOutput += lines.join("");
      }
      setOutputLog(displayOutput);
      if (result.status !== "Unsupported Language") {
        if (isSubmit && result.status === "Accepted") {
          await persistProgress("completed");
        } else {
          await persistProgress("open");
        }
      }
    } catch (err) {
      setExecutionMeta({ status: "Error", time: "", memory: "" });
      setOutputLog(err.message || "Execution failed.");
    } finally {
      setExecutionBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--text-soft)" }}>
        <Loader2 size={24} className="spin" /> Loading problem…
      </div>
    );
  }

  if (loadError || !problem) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <button type="button" onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ color: "#dc2626" }}>{loadError || "Problem not found."}</div>
      </div>
    );
  }

  const availableLangs = (problem.available_languages || []).filter((l) => POPULAR_LANGUAGES.includes(l));
  const editorLanguage = editorLanguageMap[selectedLanguage] ?? "python";

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <button type="button" onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}>
          <ChevronLeft size={16} /> Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ margin: 0 }}>{problem.title}</h1>
          <span className={`difficulty-chip ${(problem.difficulty || "Easy").toLowerCase()}`}>{problem.difficulty || "Easy"}</span>
        </div>
      </section>

      <article className="surface-card statement-panel judge-statement">
        <div className="problem-description">
          {(problem.description || "").split("\n").map((line, i) => <p key={i} className="desc-paragraph">{line}</p>)}
        </div>
      </article>

      <article className="surface-card editor-main-card judge-editor">
        <div className="editor-topbar">
          <div>
            <h2>Code Workspace</h2>
            <span>{selectedLanguage} Workspace</span>
          </div>
          <select
            className="difficulty-select language-select editor-language-select"
            value={selectedLanguage}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            {availableLangs.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
          </select>
        </div>

        <div className="editor-frame" style={{ minHeight: "400px", height: "400px" }}>
          <Editor
            key={`${problemSlug}-${selectedLanguage}`}
            height="400px"
            language={editorLanguage}
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            onMount={(editor, monacoInstance) => {
              configureEditorProtection(editor, monacoInstance, allowCopyPasteRef);
              editor.focus();
              setTimeout(() => editor.layout(), 200);
            }}
            loading={(
              <div style={{ color: "#888", padding: 40, textAlign: "center", height: "400px", display: "flex", alignItems: "center", justifyContent: "center", background: "#1f1f1f" }}>
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
              formatOnPaste: false,
              formatOnType: true,
              quickSuggestions: true,
              tabCompletion: "on",
              parameterHints: { enabled: true },
              hover: { enabled: true },
            }}
          />
        </div>

        <div className="editor-actions compact-row">
          <div className="editor-status">
            <span>{problem.title}</span>
          </div>
          <div className="editor-buttons">
            <button type="button" className="ghost-button dense-action" onClick={() => runOrSubmit(false)} disabled={executionBusy}>
              {executionBusy ? "Running…" : "Run"}
            </button>
            <button type="button" className="primary-button dense-action" onClick={() => runOrSubmit(true)} disabled={executionBusy}>
              {executionBusy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </article>

      <article className="surface-card output-card judge-output">
        <div className="section-head">
          <h3>Console</h3>
          <span>Run output and execution notes</span>
        </div>
        <label htmlFor="competitive-execution-input" className="filter-label">Custom Input</label>
        <textarea
          id="competitive-execution-input"
          className="execution-input"
          value={executionInput}
          onChange={(e) => setExecutionInput(e.target.value)}
          placeholder="Optional stdin for a custom run. Leave blank to run the problem's sample cases."
        />
        <div className="output-panel-shell">
          {executionBusy ? (
            <div className="output-panel compiling-overlay">
              <div className="compiling-spinner" />
              <div className="compiling-label">Running…</div>
            </div>
          ) : (
            <pre className="output-panel compact-output">{outputLog}</pre>
          )}
        </div>
      </article>
    </div>
  );
}
