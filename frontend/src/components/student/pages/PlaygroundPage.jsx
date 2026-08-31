import React, { useState, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Play, Terminal } from "lucide-react";

import { executionLanguageMap, editorLanguageMap, runPlaygroundCode } from "../../../lib/codeExecution";

// Use the bundled ESM Monaco build instead of the AMD loader path.
loader.config({ monaco });

const LANGUAGES = Object.keys(executionLanguageMap);

// Simple, generic starter snippets — this is a free space to experiment,
// not a problem template, so these are just runnable "hello world" style
// programs rather than the stdin-parsing boilerplate used for problems.
const PLAYGROUND_STARTERS = {
  Python: `print("Hello, world!")\n`,
  "C": `#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n`,
  "C++": `#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n    return 0;\n}\n`,
  Java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n`,
  SQL: `-- Write and run any query here\nSELECT 1;\n`,
};

export default function PlaygroundPage() {
  const [language, setLanguage] = useState("Python");
  const [codeByLanguage, setCodeByLanguage] = useState({});
  const [stdin, setStdin] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("Run your code to see output here.");
  const [meta, setMeta] = useState({ status: "", time: "", memory: "" });
  const elapsedRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  const code = codeByLanguage[language] ?? PLAYGROUND_STARTERS[language] ?? "";
  const editorLanguage = editorLanguageMap[language] ?? "plaintext";

  function setCode(value) {
    setCodeByLanguage((prev) => ({ ...prev, [language]: value }));
  }

  async function handleRun() {
    if (busy) return;
    setBusy(true);
    setOutput("Running…");
    elapsedRef.current = 0;
    setElapsed(0);
    const timer = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);

    try {
      const result = await runPlaygroundCode({
        sourceCode: code,
        language,
        stdin,
      });
      setMeta({
        status: result.status || "",
        time: result.time ? `${result.time}s` : "",
        memory: result.memory ? `${result.memory} KB` : "",
      });
      setOutput(result.output || "Execution finished with no output.");
    } catch (err) {
      setMeta({ status: "Error", time: "", memory: "" });
      setOutput(err.message || "Something went wrong while running your code.");
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Free Practice</p>
          <h1>Code Playground</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          An open space to write and run any code, in any supported language — no problems, no grading, just practice.
        </p>
      </section>

      <section className="center-column judge-center" style={{ minHeight: 0 }}>
        <article className="surface-card editor-main-card judge-editor">
          <div className="editor-topbar">
            <div>
              <h2>Code Workspace</h2>
              <span>{language} Workspace</span>
            </div>
            <select
              className="difficulty-select language-select editor-language-select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          <div className="editor-frame" style={{ minHeight: "400px", height: "400px" }}>
            <Editor
              key={language}
              height="400px"
              language={editorLanguage}
              theme="vs-dark"
              value={code}
              onChange={(value) => setCode(value ?? "")}
              onMount={(editor) => {
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
                contextmenu: true,
                dragAndDrop: true,
              }}
            />
          </div>

          <div className="editor-actions compact-row">
            <div className="editor-status">
              {meta.status && <span>{meta.status}</span>}
              {meta.time && <span>{meta.time}</span>}
              {meta.memory && <span>{meta.memory}</span>}
            </div>
            <div className="editor-buttons">
              <button
                type="button"
                className="primary-button dense-action"
                onClick={handleRun}
                disabled={busy}
              >
                <Play size={14} /> {busy ? `Running… ${elapsed}s` : "Run"}
              </button>
            </div>
          </div>
        </article>

        <article className="surface-card output-card judge-output">
          <div className="section-head">
            <h3><Terminal size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />Console</h3>
            <span>Run output</span>
          </div>

          <label htmlFor="playground-stdin" className="filter-label">Custom Input (stdin)</label>
          <textarea
            id="playground-stdin"
            className="execution-input"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Optional input your program reads from stdin."
          />
          <div className="output-panel-shell">
            {busy ? (
              <div className="output-panel compiling-overlay">
                <div className="compiling-spinner" />
                <div className="compiling-label">
                  Running…
                  <span className="compiling-elapsed">{elapsed}s</span>
                </div>
              </div>
            ) : (
              <pre className="output-panel compact-output">{output}</pre>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
