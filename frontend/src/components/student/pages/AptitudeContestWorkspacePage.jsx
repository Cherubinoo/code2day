import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Play, Send } from "lucide-react";
import { formatDuration, buildJsonPostOptions } from "../../../lib/appUtils";
import DoubleConfirmModal from "../../common/DoubleConfirmModal";

// ── Toast notification ────────────────────────────────────────────────────────
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

function AptitudeContestWorkspacePage({ contestId, onBack }) {
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // {questionId: selectedOption}
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null, firstOk: false });
  const [toast, setToast] = useState(null);
  const autoSubmittedRef = useRef(false);
  const isContestActiveRef = useRef(true);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });
  };

  // ── Fullscreen + anti-cheat enforcement ──────────────────────────────────
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

    const blockPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showToast('Pasting is not allowed during a contest.', 'error');
    };
    document.addEventListener('paste', blockPaste, true);

    const handleVisibility = () => {
      if (document.hidden && isContestActiveRef.current) {
        showToast('⚠️ Tab switching is not allowed! Return to the contest.', 'error');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const blockKeys = (e) => {
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

    const handleBeforeUnload = (e) => {
      if (isContestActiveRef.current) {
        e.preventDefault();
        e.returnValue = 'You are in an active contest. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isContestActiveRef.current) {
        showToast('⚠️ Please stay in fullscreen during the contest!', 'error');
        setTimeout(() => {
          if (isContestActiveRef.current) {
            const el2 = document.documentElement;
            if (el2.requestFullscreen) el2.requestFullscreen().catch(() => {});
            else if (el2.webkitRequestFullscreen) el2.webkitRequestFullscreen();
          }
        }, 1500);
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
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  // Fetch contest data
  useEffect(() => {
    async function fetchContestData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/student/contests/${contestId}/`, {
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to load contest");
        }

        const data = await response.json();
        setContest(data);
        setQuestions(data.problems || []); // Note: Backend returns 'problems' field even for aptitude questions
        
        // Load existing answers if any
        const initialAnswers = {};
        if (data.problems) {
          data.problems.forEach(q => {
            if (q.student_answer) {
              initialAnswers[q.id] = q.student_answer;
            }
          });
        }
        setAnswers(initialAnswers);
        
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchContestData();
  }, [contestId]);

  // Timer logic
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
        // Auto-finish when time is up
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
          showToast('⏰ Time is up! Your aptitude contest has been submitted automatically.', 'warning');
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

  const handleOptionSelect = async (questionId, option) => {
    if (isSubmitting) return;
    
    // Optimistic update
    setAnswers(prev => ({ ...prev, [questionId]: option }));
    
    try {
      const res = await fetch(`/api/student/contests/${contestId}/aptitude/submit/`, {
        method: "POST",
        ...buildJsonPostOptions({
          question_id: questionId,
          selected_option: option,
          time_taken: 0 // Could track this if needed
        })
      });
      
      if (!res.ok) {
        console.error("Failed to save answer");
      }
    } catch (err) {
      console.error("Error saving answer:", err);
    }
  };

  const handleFinishContest = useCallback(async (isAuto = false) => {
    const action = () => {
      async function finish() {
        try {
          const response = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
            method: "POST",
            ...buildJsonPostOptions({}),
          });

          if (response.ok) {
            isContestActiveRef.current = false;
            showToast('🎉 Aptitude contest submitted successfully! Redirecting...', 'success');
            setTimeout(() => {
              if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
              onBack();
            }, 2500);
          } else {
            showToast('Failed to submit contest. Please try again.', 'error');
          }
        } catch (err) {
          console.error("Error finishing contest:", err);
          showToast('Error submitting contest.', 'error');
        }
      }
      finish();
    };

    if (isAuto) {
      action();
    } else {
      askDouble(
        action,
        "Are you sure you want to finish this aptitude contest?",
        "Your answers will be submitted for evaluation. You cannot change them after this."
      );
    }
  }, [contestId, onBack]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading contest...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}>Error: {error}</div>;

  const currentQuestion = questions[selectedQuestionIndex];
  const totalAnswered = Object.keys(answers).length;

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Header */}
      <header style={{ 
        background: 'white', 
        padding: '16px 24px', 
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button 
            onClick={() => handleFinishContest()}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 14,
              fontWeight: 500
            }}
          >
            <ChevronLeft size={18} />
            Exit
          </button>
          <div style={{ height: 24, width: 1, background: '#e2e8f0' }} />
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{contest.title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Aptitude Challenge • {questions.length} Questions</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>TIME REMAINING</div>
            <div style={{ 
              fontSize: 20, 
              fontWeight: 700, 
              fontFamily: 'monospace',
              color: (contestSecondsLeft < 300) ? '#ef4444' : '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <Clock size={20} />
              {contestSecondsLeft !== null ? formatDuration(contestSecondsLeft) : "00:00"}
            </div>
          </div>
          <button 
            onClick={() => handleFinishContest()}
            style={{ 
              background: '#4f46e5', 
              color: 'white', 
              border: 'none', 
              padding: '10px 20px', 
              borderRadius: 8, 
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.1), 0 2px 4px -1px rgba(79, 70, 229, 0.06)'
            }}
          >
            <Send size={16} />
            Finish Contest
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Panel: Question Navigator */}
        <aside style={{ 
          width: 320, 
          background: 'white', 
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: 20, borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Questions</span>
              <span style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 12 }}>
                {totalAnswered} / {questions.length} Answered
              </span>
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: '#4f46e5', 
                width: `${(totalAnswered / questions.length) * 100}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {questions.map((q, idx) => {
                const isSelected = selectedQuestionIndex === idx;
                const isAnswered = answers[q.id] !== undefined;
                
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuestionIndex(idx)}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 8,
                      border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                      background: isSelected ? '#eff6ff' : isAnswered ? '#f0fdf4' : 'white',
                      color: isSelected ? '#1e40af' : isAnswered ? '#15803d' : '#64748b',
                      fontWeight: 600,
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: 16, background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#64748b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, border: '1px solid #e2e8f0', background: 'white' }} />
                Unattempted
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: '#f0fdf4', border: '1px solid #dcfce7' }} />
                Answered
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, border: '2px solid #4f46e5', background: '#eff6ff' }} />
                Current
              </div>
            </div>
          </div>
        </aside>

        {/* Center Panel: Question Display */}
        <section style={{ flex: 1, overflow: 'auto', padding: 40, display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 800, width: '100%' }}>
            {currentQuestion && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <span style={{ 
                    background: '#4f46e5', 
                    color: 'white', 
                    padding: '4px 12px', 
                    borderRadius: 6, 
                    fontSize: 14, 
                    fontWeight: 700 
                  }}>
                    Question {selectedQuestionIndex + 1}
                  </span>
                  <span style={{ 
                    fontSize: 13, 
                    color: '#64748b', 
                    fontWeight: 500 
                  }}>
                    {currentQuestion.topic} • {currentQuestion.difficulty}
                  </span>
                </div>

                <div style={{ 
                  fontSize: 20, 
                  lineHeight: 1.6, 
                  color: '#1e293b', 
                  fontWeight: 500, 
                  marginBottom: 40,
                  whiteSpace: 'pre-wrap'
                }}>
                  {currentQuestion.question_text}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {['A', 'B', 'C', 'D'].map((opt) => {
                    const isSelected = answers[currentQuestion.id] === opt;
                    const optionKey = `option_${opt.toLowerCase()}`;
                    const optionText = currentQuestion[optionKey];

                    return (
                      <button
                        key={opt}
                        onClick={() => handleOptionSelect(currentQuestion.id, opt)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '20px 24px',
                          borderRadius: 12,
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                          background: isSelected ? '#eff6ff' : 'white',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          boxShadow: isSelected ? '0 4px 6px -1px rgba(79, 70, 229, 0.1)' : 'none'
                        }}
                      >
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #e2e8f0',
                          background: isSelected ? '#4f46e5' : 'white',
                          color: isSelected ? 'white' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          marginRight: 20,
                          flexShrink: 0
                        }}>
                          {opt}
                        </div>
                        <span style={{ 
                          fontSize: 16, 
                          color: isSelected ? '#1e40af' : '#475569',
                          fontWeight: isSelected ? 600 : 400
                        }}>
                          {optionText}
                        </span>
                        {isSelected && <CheckCircle size={20} style={{ marginLeft: 'auto', color: '#4f46e5' }} />}
                      </button>
                    );
                  })}
                </div>

                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  marginTop: 60,
                  paddingTop: 32,
                  borderTop: '1px solid #e2e8f0'
                }}>
                  <button
                    disabled={selectedQuestionIndex === 0}
                    onClick={() => setSelectedQuestionIndex(prev => prev - 1)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 24px',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      color: selectedQuestionIndex === 0 ? '#cbd5e1' : '#475569',
                      fontWeight: 600,
                      cursor: selectedQuestionIndex === 0 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <ChevronLeft size={20} />
                    Previous
                  </button>
                  
                  {selectedQuestionIndex < questions.length - 1 ? (
                    <button
                      onClick={() => setSelectedQuestionIndex(prev => prev + 1)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 24px',
                        borderRadius: 8,
                        border: '1px solid #4f46e5',
                        background: '#4f46e5',
                        color: 'white',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Next
                      <ChevronRight size={20} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleFinishContest()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '12px 32px',
                        borderRadius: 8,
                        border: 'none',
                        background: '#059669',
                        color: 'white',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 10px rgba(5, 150, 105, 0.2)'
                      }}
                    >
                      Complete Submission
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

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

export default AptitudeContestWorkspacePage;
