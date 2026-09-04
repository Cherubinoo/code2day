// Contest Problem Solving Page - ProblemsPage workspace style layout
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Send, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import Editor from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { runCodeExecution, getLanguageIdForChoice } from '../../../lib/codeExecution';
import { getCsrfToken, formatDuration, configureEditorProtection } from '../../../lib/appUtils';
import { starterCodeByLanguage } from '../../../lib/appData';
import { useTabNav } from '../../../lib/useTabNav';

// Use the bundled ESM Monaco build instead of the AMD loader path.
loader.config({ monaco });

// Popular programming languages only
const POPULAR_LANGUAGES = [
  "C",
  "C++",
  "Java",
  "Python",
];

const ContestProblemPage = ({ contestId, problemSlug, onBack }) => {
  const [problem, setProblem] = useState(null);
  const [contest, setContest] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('Python');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [customInput, setCustomInput] = useState('');
  const [activeTab, setActiveTab] = useTabNav('current');
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [execElapsed, setExecElapsed] = useState(0);

  const timerRef = useRef(null);
  const execTimerRef = useRef(null);

  useEffect(() => () => clearInterval(execTimerRef.current), []);

  function startExecTimer() {
    setExecElapsed(0);
    clearInterval(execTimerRef.current);
    const start = Date.now();
    execTimerRef.current = setInterval(() => {
      setExecElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
  }

  function stopExecTimer() {
    clearInterval(execTimerRef.current);
  }

  useEffect(() => {
    loadProblemAndContest();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [contestId, problemSlug]);

  useEffect(() => {
    if (contest && contest.end_time) {
      updateTimer();
      timerRef.current = setInterval(updateTimer, 1000);
    }
  }, [contest]);

  function updateTimer() {
    if (!contest || !contest.end_time) return;
    
    const now = new Date().getTime();
    const end = new Date(contest.end_time).getTime();
    const remaining = end - now;

    if (remaining <= 0) {
      setTimeRemaining(0);
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      setTimeRemaining(remaining);
    }
  }

  function formatTime(ms) {
    if (ms === null || ms === undefined) return '--:--:--';
    if (ms <= 0) return '00:00:00';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async function handleStopContest() {
    if (!confirm('Are you sure you want to stop this contest? This action cannot be undone and your current progress will be saved.')) {
      return;
    }

    try {
      const res = await fetch(`/api/student/contests/${contestId}/stop/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
      });

      if (res.ok) {
        alert('Contest stopped successfully. Your progress has been saved.');
        // Go back to contest list
        onBack();
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to stop contest');
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  }

  async function loadProblemAndContest() {
    try {
      setLoading(true);
      
      console.log('Loading contest and problem:', { contestId, problemSlug }); // Debug log
      
      // Load contest details
      const contestRes = await fetch(`/api/student/contests/${contestId}/`, {
        credentials: 'include',
      });
      
      if (contestRes.ok) {
        const contestData = await contestRes.json();
        console.log('Contest loaded:', contestData); // Debug log
        setContest(contestData);
        
        // Check if contest has ended
        if (contestData.is_ended) {
          setError('This contest has ended. No more submissions allowed.');
          return;
        }
      } else {
        const data = await contestRes.json();
        console.error('Failed to load contest:', data); // Debug log
        setError(data.detail || 'Failed to load contest');
        return;
      }

      // Load problem details
      const problemRes = await fetch(`/api/student/contests/${contestId}/problems/${problemSlug}/`, {
        credentials: 'include',
      });

      if (problemRes.ok) {
        const problemData = await problemRes.json();
        console.log('Problem loaded:', problemData); // Debug log
        setProblem(problemData);
        
        // Set default code based on language
        setCode(getStarterCode(language));
      } else {
        const data = await problemRes.json();
        console.error('Failed to load problem:', data); // Debug log
        setError(data.detail || 'Failed to load problem');
      }
    } catch (err) {
      console.error('Error loading problem and contest:', err); // Debug log
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function getStarterCode(lang) {
    return starterCodeByLanguage[lang] || '// Write your solution here\n';
  }

  async function handleRunCode() {
    if (!code.trim()) {
      setOutput('Error: Please write some code first');
      return;
    }

    setIsRunning(true);
    startExecTimer();
    setOutput('Running code...');
    setTestResults(null); // clear previous submission results

    try {
      const result = await runCodeExecution({
        sourceCode: code,
        language: language,
        stdin: customInput,
        problemSlug: problemSlug,
        isSubmit: false,
      });
      
      if (result.stdout) {
        setOutput(result.stdout);
      } else if (result.stderr) {
        setOutput(`Error:\n${result.stderr}`);
      } else if (result.compile_output) {
        setOutput(`Compilation Error:\n${result.compile_output}`);
      } else {
        setOutput(result.status?.description || result.status || 'No output');
      }
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    } finally {
      stopExecTimer();
      setIsRunning(false);
    }
  }

  async function handleSubmit() {
    if (!code.trim()) {
      alert('Please write some code first');
      return;
    }

    if (timeRemaining !== null && timeRemaining <= 0) {
      alert('Contest has ended. No more submissions allowed.');
      return;
    }

    setIsSubmitting(true);
    startExecTimer();
    setOutput('Submitting and testing your code...');

    try {
      const languageId = getLanguageIdForChoice(language);
      
      const res = await fetch(`/api/student/contests/${contestId}/problems/${problemSlug}/submit/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        credentials: 'include',
        body: JSON.stringify({
          source_code: code,
          language: language,
          language_id: languageId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const sub = data.submission;
        setTestResults(sub);

        // Build a rich output string showing exactly what happened
        const lines = [];

        // Header
        if (sub.status === 'Accepted') {
          lines.push(`✅ Accepted — All ${sub.total_cases} test case(s) passed!`);
          lines.push(`Score: ${sub.score}/${sub.max_score ?? sub.score}`);
        } else if (sub.status === 'Compilation Error') {
          lines.push(`🔴 Compilation Error`);
          lines.push('');
          lines.push(sub.compile_error || 'Check your syntax.');
        } else {
          lines.push(`❌ ${sub.status} — ${sub.passed_cases}/${sub.total_cases} test case(s) passed`);
          lines.push(`Score: ${sub.score}/${sub.max_score ?? 100}`);
        }

        // Per-test-case breakdown (sample cases only)
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

        // Surface stderr if no test results (e.g. runtime crash on all cases)
        if (!sub.test_results?.length && sub.stderr) {
          lines.push('');
          lines.push('─── Runtime Error ───');
          lines.push(sub.stderr);
        }

        setOutput(lines.join('\n'));
        loadProblemAndContest();
      } else {
        const data = await res.json();
        setOutput(`Error: ${data.detail || 'Submission failed'}`);
      }
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    } finally {
      stopExecTimer();
      setIsSubmitting(false);
    }
  }

  // Render description with structured formatting (similar to ProblemsPage)
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

      elements.push(
        <p key={i} className="desc-paragraph" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
          {trimmed}
        </p>
      );
      i++;
    }
    return elements;
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading problem...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: 20 }}>{error}</p>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          Back to Contest
        </button>
      </div>
    );
  }

  if (!problem) return null;

  const isTimeWarning = timeRemaining !== null && timeRemaining < 5 * 60 * 1000; // Less than 5 minutes
  const isTimeUp = timeRemaining !== null && timeRemaining <= 0;
  const isProgrammingContest = contest?.contest_type === 'programming';

  return (
    <div className="page-stack problem-page">
      {/* Header - ProblemsPage style */}
      <section className="page-header compact-header problem-page-header">
        <div className="workspace-title-row">
          <button
            type="button"
            className="back-to-list-btn"
            onClick={onBack}
          >
            ← Contest
          </button>
          <div>
            <p className="kicker">Contest Problem</p>
            <h1>{problem.title}</h1>
          </div>
        </div>
        
        <div className="problem-header-meta">
          {/* Timer */}
          {timeRemaining !== null && (
            <div className="workspace-brief contest-timer-brief">
              <span>Time Remaining</span>
              <strong className={`timer-countdown ${isTimeUp ? 'time-up' : isTimeWarning ? 'time-warning' : ''}`}>
                {formatTime(timeRemaining)}
              </strong>
            </div>
          )}
          
          {/* Difficulty */}
          {problem && (
            <span className={`difficulty-chip ${(problem.difficulty || 'Easy').toLowerCase()}`}>
              {problem.difficulty || 'Easy'}
            </span>
          )}
          
          {/* Stop Contest Button - Only for programming contests */}
          {isProgrammingContest && !isTimeUp && contest?.participation?.is_active && (
            <button 
              type="button" 
              className="primary-button dense-action"
              onClick={handleStopContest}
              style={{ background: '#dc2626' }}
            >
              Stop Contest
            </button>
          )}
        </div>
      </section>

      {/* Time Up Warning */}
      {isTimeUp && (
        <section className="surface-card" style={{ marginBottom: 16 }}>
          <div style={{
            padding: 12,
            background: '#fee2e2',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Clock size={16} />
            Contest has ended. You can view the problem but cannot submit solutions.
          </div>
        </section>
      )}

      {/* Problem Statement Section - ProblemsPage style */}
      <section className="surface-card statement-panel judge-statement">
        <div className="section-head">
          <h2>{problem.title}</h2>
          <span className={`difficulty-chip ${(problem.difficulty || 'Easy').toLowerCase()}`}>
            {problem.difficulty || 'Easy'}
          </span>
        </div>

        <div className="tab-strip dense">
          {["current", "explanation", "submissions"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "tab-pill active dense" : "tab-pill dense"}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "current" ? "Problem" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div className="statement-scroll">
          {activeTab === "current" && (
            <>
              {/* Problem description */}
              <div className="problem-description">
                {renderDescription(problem.description)}
              </div>

              {/* Examples */}
              {problem.examples && problem.examples.length > 0 && (
                <div className="info-box">
                  <h4>Examples</h4>
                  {problem.examples.map((example, idx) => (
                    <div key={idx} className="example-block">
                      <pre>{`Input: ${example.input}\nOutput: ${example.output}${example.explanation ? `\nExplanation: ${example.explanation}` : ''}`}</pre>
                    </div>
                  ))}
                </div>
              )}

              {/* Tags */}
              <div className="info-box">
                <h4>Tags</h4>
                <div className="tag-row">
                  {(problem.tags || []).map((tag) => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "explanation" && (
            <>
              {problem.explanation ? (
                <div className="info-box">
                  <h4>Explanation</h4>
                  <div className="problem-description">
                    {renderDescription(problem.explanation)}
                  </div>
                </div>
              ) : (
                <p className="body-copy">No explanation available for this problem.</p>
              )}
              {problem.hints && problem.hints.length > 0 && (
                <div className="info-box" style={{ marginTop: 16 }}>
                  <h4>Hints</h4>
                  <ol className="desc-numbered">
                    {problem.hints.map((hint, idx) => <li key={idx}>{hint}</li>)}
                  </ol>
                </div>
              )}
            </>
          )}

          {activeTab === "submissions" && (
            <>
              <h4>Your Submissions</h4>
              {problem.submissions && problem.submissions.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {problem.submissions.map((sub) => (
                    <div key={sub.id} style={{
                      padding: 12,
                      background: '#f9fafb',
                      borderRadius: 8,
                      border: '1px solid #e5e7eb',
                      fontSize: 13,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: sub.status === 'Accepted' ? '#d1fae5' : '#fee2e2',
                          color: sub.status === 'Accepted' ? '#059669' : '#dc2626',
                          fontSize: 11,
                          fontWeight: 600,
                        }}>
                          {sub.status}
                        </span>
                        <span style={{ color: '#666', fontSize: 11 }}>
                          {new Date(sub.submitted_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <div style={{ color: '#666' }}>
                        Language: {sub.language} • Score: {sub.score}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#666', fontSize: 14 }}>No submissions yet</p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Code Editor Section - ProblemsPage style */}
      <section className="surface-card editor-main-card judge-editor">
        <div className="editor-topbar">
          <div>
            <h2>Code Workspace</h2>
            <span>{language} Workspace</span>
          </div>
          <select
            className="difficulty-select language-select editor-language-select"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setCode(getStarterCode(e.target.value));
            }}
            disabled={isTimeUp}
          >
            {POPULAR_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        </div>

        <div className="editor-frame" style={{ minHeight: '400px', height: '400px' }}>
          <Editor
            key={`${problem?.slug}-${language}`}
            height="400px"
            language={language.toLowerCase() === 'c++' ? 'cpp' : language.toLowerCase()}
            theme="vs-dark"
            value={code || getStarterCode(language)}
            onChange={(value) => setCode(value ?? "")}
            onMount={(editor, monaco) => {
              const allowCopyPaste = Boolean(user?.allow_copy_paste || student?.allow_copy_paste || dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste);
              configureEditorProtection(editor, monaco, allowCopyPaste);
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
              automaticLayout: true,
              readOnly: isTimeUp,
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
              contextmenu: Boolean(user?.allow_copy_paste || student?.allow_copy_paste || dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste),
              dragAndDrop: Boolean(user?.allow_copy_paste || student?.allow_copy_paste || dashboard?.user?.allow_copy_paste || dashboard?.student?.allow_copy_paste),
            }}
          />
        </div>

        <div className="editor-actions compact-row">
          <div className="editor-status">
            <span>{problem.title}</span>
          </div>
          <div className="editor-buttons">
            <button
              type="button"
              className="ghost-button dense-action"
              onClick={handleRunCode}
              disabled={isRunning || isTimeUp}
            >
              {isRunning ? `Running… ${execElapsed}s` : "Run"}
            </button>
            <button
              type="button"
              className="primary-button dense-action"
              onClick={handleSubmit}
              disabled={isSubmitting || isTimeUp}
            >
              {isSubmitting ? `Submitting… ${execElapsed}s` : "Submit"}
            </button>
          </div>
        </div>
      </section>

      {/* Console Section */}
      <section className="surface-card output-card judge-output">
        <div className="section-head">
          <h3>Console</h3>
          <span>
            {testResults
              ? `${testResults.passed_cases ?? 0}/${testResults.total_cases ?? 0} test cases passed`
              : 'Run output and execution notes'}
          </span>
        </div>

        <label htmlFor="execution-input" className="filter-label">Custom Input</label>
        <textarea
          id="execution-input"
          className="execution-input"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder="Optional stdin for a custom run. Leave blank to run the problem's sample cases."
          disabled={isTimeUp}
        />

        {/* ── Submission verdict + test case cards ── */}
        {testResults ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Overall verdict banner */}
            <div style={{
              padding: '12px 16px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: testResults.status === 'Accepted'
                ? 'linear-gradient(135deg,#d1fae5,#a7f3d0)'
                : testResults.status === 'Compilation Error'
                  ? 'linear-gradient(135deg,#fef3c7,#fde68a)'
                  : 'linear-gradient(135deg,#fee2e2,#fecaca)',
              border: `1px solid ${testResults.status === 'Accepted' ? '#6ee7b7' : testResults.status === 'Compilation Error' ? '#fcd34d' : '#fca5a5'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>
                  {testResults.status === 'Accepted' ? '✅' : testResults.status === 'Compilation Error' ? '🔴' : '❌'}
                </span>
                <div>
                  <div style={{
                    fontWeight: 800, fontSize: '1rem',
                    color: testResults.status === 'Accepted' ? '#065f46' : testResults.status === 'Compilation Error' ? '#92400e' : '#991b1b',
                  }}>
                    {testResults.status}
                  </div>
                  {testResults.status !== 'Compilation Error' && (
                    <div style={{ fontSize: '0.8rem', color: '#555', marginTop: 2 }}>
                      {testResults.passed_cases}/{testResults.total_cases} test cases passed
                    </div>
                  )}
                </div>
              </div>
              {testResults.status !== 'Compilation Error' && (
                <div style={{
                  fontWeight: 800, fontSize: '1.1rem',
                  color: testResults.status === 'Accepted' ? '#065f46' : '#991b1b',
                }}>
                  {testResults.score}/{testResults.max_score ?? 100}
                </div>
              )}
            </div>

            {/* Compilation error detail */}
            {testResults.status === 'Compilation Error' && testResults.compile_error && (
              <pre style={{
                background: '#1e1e1e', color: '#f87171',
                padding: '12px 14px', borderRadius: 8,
                fontSize: '0.82rem', overflowX: 'auto',
                margin: 0, lineHeight: 1.6,
              }}>
                {testResults.compile_error}
              </pre>
            )}

            {/* Runtime error (no test results) */}
            {!testResults.test_results?.length && testResults.stderr && (
              <pre style={{
                background: '#1e1e1e', color: '#f87171',
                padding: '12px 14px', borderRadius: 8,
                fontSize: '0.82rem', overflowX: 'auto',
                margin: 0, lineHeight: 1.6,
              }}>
                {testResults.stderr}
              </pre>
            )}

            {/* Per-test-case cards */}
            {testResults.test_results && testResults.test_results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  Test Cases
                </div>
                {testResults.test_results.map((tc) => (
                  <div key={tc.case} style={{
                    borderRadius: 10,
                    border: `1px solid ${tc.passed ? '#6ee7b7' : '#fca5a5'}`,
                    overflow: 'hidden',
                    background: tc.passed ? '#f0fdf4' : '#fff5f5',
                  }}>
                    {/* Case header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 14px',
                      background: tc.passed ? '#dcfce7' : '#fee2e2',
                      borderBottom: `1px solid ${tc.passed ? '#bbf7d0' : '#fecaca'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>{tc.passed ? '✓' : '✗'}</span>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: tc.passed ? '#166534' : '#991b1b' }}>
                          Case {tc.case}
                        </span>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600,
                          padding: '2px 7px', borderRadius: 6,
                          background: tc.passed ? '#bbf7d0' : '#fecaca',
                          color: tc.passed ? '#166534' : '#991b1b',
                        }}>
                          {tc.status}
                        </span>
                      </div>
                      {tc.time && (
                        <span style={{ fontSize: '0.75rem', color: '#888' }}>⏱ {tc.time}s</span>
                      )}
                    </div>

                    {/* Case body */}
                    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.82rem' }}>
                      {tc.stdin && tc.stdin !== '(hidden)' && (
                        <div>
                          <span style={{ fontWeight: 700, color: '#555', display: 'block', marginBottom: 2 }}>Input</span>
                          <pre style={{ margin: 0, background: '#f1f5f9', padding: '6px 10px', borderRadius: 6, color: '#334155', overflowX: 'auto', lineHeight: 1.5 }}>{tc.stdin}</pre>
                        </div>
                      )}
                      {tc.stdin === '(hidden)' && (
                        <div style={{ color: '#888', fontStyle: 'italic' }}>Hidden test case</div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#555', display: 'block', marginBottom: 2 }}>Expected</span>
                          <pre style={{ margin: 0, background: '#f1f5f9', padding: '6px 10px', borderRadius: 6, color: '#334155', overflowX: 'auto', lineHeight: 1.5 }}>{tc.expected || '(empty)'}</pre>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, color: tc.passed ? '#166534' : '#991b1b', display: 'block', marginBottom: 2 }}>Got</span>
                          <pre style={{ margin: 0, background: tc.passed ? '#f0fdf4' : '#fff1f2', padding: '6px 10px', borderRadius: 6, color: tc.passed ? '#166534' : '#991b1b', overflowX: 'auto', lineHeight: 1.5 }}>{tc.actual || '(no output)'}</pre>
                        </div>
                      </div>
                      {tc.stderr && (
                        <div>
                          <span style={{ fontWeight: 700, color: '#dc2626', display: 'block', marginBottom: 2 }}>Error</span>
                          <pre style={{ margin: 0, background: '#1e1e1e', padding: '6px 10px', borderRadius: 6, color: '#f87171', overflowX: 'auto', lineHeight: 1.5, fontSize: '0.78rem' }}>{tc.stderr}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Plain run output */
          <div className="output-panel-shell">
            {isRunning || isSubmitting ? (
              <div className="output-panel compiling-overlay">
                <div className="compiling-spinner" />
                <div className="compiling-label">
                  {isSubmitting ? 'Submitting…' : 'Running…'}
                  <span className="compiling-elapsed">{execElapsed}s</span>
                </div>
              </div>
            ) : (
              <pre className="output-panel compact-output">
                {output || 'Run your code to see output here...'}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

export default ContestProblemPage;
