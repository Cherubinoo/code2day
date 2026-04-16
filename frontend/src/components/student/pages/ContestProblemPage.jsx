// Contest Problem Solving Page - Integrated editor with Judge0
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, Send, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { runCodeExecution, getLanguageIdForChoice } from '../../../lib/codeExecution';
import { getCsrfToken } from '../../../lib/appUtils';

const ContestProblemPage = ({ contestId, problemSlug, onBack }) => {
  const [problem, setProblem] = useState(null);
  const [contest, setContest] = useState(null);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('JavaScript');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [customInput, setCustomInput] = useState('');
  const [activeTab, setActiveTab] = useState('description');
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const timerRef = useRef(null);

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
    const starters = {
      'JavaScript': '// Write your solution here\nfunction solution() {\n    \n}\n',
      'Python': '# Write your solution here\ndef solution():\n    pass\n',
      'Java': 'public class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n',
      'C++': '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
      'C': '#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n',
    };
    return starters[lang] || '// Write your solution here\n';
  }

  async function handleRunCode() {
    if (!code.trim()) {
      setOutput('Error: Please write some code first');
      return;
    }

    setIsRunning(true);
    setOutput('Running code...');
    setActiveTab('output');

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
    setActiveTab('output');
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
        setTestResults(data.submission);
        
        if (data.submission.status === 'Accepted') {
          setOutput(`✅ Success! All test cases passed.\n\nPassed: ${data.submission.passed_cases}/${data.submission.total_cases}\nScore: ${data.submission.score}`);
        } else {
          setOutput(`❌ Some test cases failed.\n\nPassed: ${data.submission.passed_cases}/${data.submission.total_cases}\nScore: ${data.submission.score}`);
        }
        
        // Reload problem to update submission history
        loadProblemAndContest();
      } else {
        const data = await res.json();
        setOutput(`Error: ${data.detail || 'Submission failed'}`);
      }
    } catch (err) {
      setOutput(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        background: 'white',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={onBack}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{problem.title}</h3>
            <span style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 12,
              background: problem.difficulty === 'Easy' ? '#d1fae5' :
                         problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
              color: problem.difficulty === 'Easy' ? '#059669' :
                     problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
            }}>
              {problem.difficulty}
            </span>
          </div>
        </div>

        {/* Timer */}
        {timeRemaining !== null && (
          <div style={{
            padding: '8px 16px',
            borderRadius: 8,
            background: isTimeUp ? '#fee2e2' : isTimeWarning ? '#fef3c7' : '#e0e7ff',
            color: isTimeUp ? '#dc2626' : isTimeWarning ? '#d97706' : '#4f46e5',
            fontWeight: 600,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Clock size={18} />
            {formatTime(timeRemaining)}
            {isTimeUp && ' - Time Up!'}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel - Problem Description */}
        <div style={{
          width: '40%',
          background: 'white',
          borderRight: '1px solid #e5e7eb',
          overflow: 'auto',
          padding: 20,
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
            {['description', 'submissions'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  background: activeTab === tab ? '#f0fdf4' : 'transparent',
                  color: activeTab === tab ? '#059669' : '#666',
                  cursor: 'pointer',
                  borderBottom: activeTab === tab ? '2px solid #059669' : 'none',
                  textTransform: 'capitalize',
                  fontWeight: activeTab === tab ? 600 : 400,
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Description Tab */}
          {activeTab === 'description' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Problem Description</h4>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: '#374151', whiteSpace: 'pre-wrap' }}>
                  {problem.description}
                </div>
              </div>

              {problem.examples && problem.examples.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Examples</h4>
                  {problem.examples.map((example, idx) => (
                    <div key={idx} style={{
                      padding: 12,
                      background: '#f9fafb',
                      borderRadius: 8,
                      marginBottom: 12,
                      fontSize: 13,
                      fontFamily: 'monospace',
                    }}>
                      <div style={{ marginBottom: 8 }}>
                        <strong>Input:</strong> {example.input}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <strong>Output:</strong> {example.output}
                      </div>
                      {example.explanation && (
                        <div style={{ color: '#666' }}>
                          <strong>Explanation:</strong> {example.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {problem.hints && problem.hints.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Hints</h4>
                  {problem.hints.map((hint, idx) => (
                    <div key={idx} style={{
                      padding: 12,
                      background: '#fef3c7',
                      borderRadius: 8,
                      marginBottom: 8,
                      fontSize: 13,
                      color: '#92400e',
                    }}>
                      💡 {hint}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submissions Tab */}
          {activeTab === 'submissions' && (
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Your Submissions</h4>
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
            </div>
          )}
        </div>

        {/* Right Panel - Code Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Editor Header */}
          <div style={{
            padding: '12px 20px',
            background: 'white',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <select
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value);
                setCode(getStarterCode(e.target.value));
              }}
              disabled={isTimeUp}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontSize: 14,
              }}
            >
              <option>JavaScript</option>
              <option>Python</option>
              <option>Java</option>
              <option>C++</option>
              <option>C</option>
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleRunCode}
                disabled={isRunning || isTimeUp}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: isRunning || isTimeUp ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 14,
                }}
              >
                <Play size={14} />
                {isRunning ? 'Running...' : 'Run'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isTimeUp}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: isSubmitting || isTimeUp ? '#d1d5db' : '#059669',
                  color: 'white',
                  cursor: isSubmitting || isTimeUp ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                <Send size={14} />
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>

          {/* Code Editor */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isTimeUp}
              style={{
                width: '100%',
                height: '100%',
                padding: 16,
                border: 'none',
                fontFamily: 'monospace',
                fontSize: 14,
                lineHeight: 1.6,
                resize: 'none',
                background: '#1e1e1e',
                color: '#d4d4d4',
              }}
              placeholder="Write your code here..."
            />
          </div>

          {/* Output Panel */}
          <div style={{
            height: '30%',
            borderTop: '1px solid #e5e7eb',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '8px 20px',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Output</span>
              <details style={{ fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', color: '#6366f1' }}>Custom Input</summary>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Enter custom input for testing..."
                  style={{
                    width: '300px',
                    height: '60px',
                    marginTop: 8,
                    padding: 8,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                />
              </details>
            </div>
            <div style={{
              flex: 1,
              padding: 16,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              color: '#374151',
            }}>
              {output || 'Run your code to see output here...'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContestProblemPage;
