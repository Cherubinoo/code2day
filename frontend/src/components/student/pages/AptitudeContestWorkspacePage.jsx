import { useState, useEffect, useCallback, useRef } from "react";
import { Clock, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, Send } from "lucide-react";
import { formatDuration, buildJsonPostOptions } from "../../../lib/appUtils";
import DoubleConfirmModal from "../../common/DoubleConfirmModal";

const MAX_VIOLATIONS = 3;

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
      <style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
    </div>
  );
}

// ── Violation warning modal ───────────────────────────────────────────────────
function ViolationModal({ count, reason, onReEnterFullscreen }) {
  const isFinal = count >= MAX_VIOLATIONS;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15,23,42,0.97)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 999998, backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'white', borderRadius: 24, padding: '48px 40px',
        maxWidth: 480, width: '90%', textAlign: 'center',
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: isFinal ? '#fee2e2' : '#fef3c7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          color: isFinal ? '#dc2626' : '#d97706',
        }}>
          <AlertCircle size={40} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
          {isFinal ? 'Contest Auto-Submitted' : `Warning ${count} of ${MAX_VIOLATIONS}`}
        </h2>
        <p style={{ margin: '0 0 12px', color: '#dc2626', fontSize: 14, fontWeight: 600 }}>{reason}</p>
        {isFinal ? (
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            You have exceeded the maximum number of violations ({MAX_VIOLATIONS}). Your contest has been
            automatically submitted and your attempt has been recorded.
          </p>
        ) : (
          <>
            <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              {MAX_VIOLATIONS - count} warning(s) remaining before automatic submission.
            </p>
            <button
              onClick={onReEnterFullscreen}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: '#4f46e5', color: 'white', border: 'none',
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
              }}
            >
              Re-enter Full Screen &amp; Continue
            </button>
          </>
        )}
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 16 }}>
          Violations are recorded and reported to your institution.
        </p>
      </div>
    </div>
  );
}

// ── Register number watermark overlay ─────────────────────────────────────────
function Watermark({ registerNumber }) {
  if (!registerNumber) return null;
  const text = registerNumber.toUpperCase();
  const items = [];
  for (let r = -5; r < 20; r++) {
    for (let c = -5; c < 20; c++) {
      items.push(
        <span
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: `${c * 18}%`,
            top: `${r * 8}%`,
            transform: 'rotate(-30deg)',
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(99,102,241,0.12)',
            letterSpacing: '0.15em',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      );
    }
  }
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      pointerEvents: 'none', zIndex: 9000, overflow: 'hidden',
    }}>
      {items}
    </div>
  );
}

function AptitudeContestWorkspacePage({ contestId, onBack }) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({}); // {questionId: selectedOption}
  const [correctCount, setCorrectCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null, firstOk: false });
  const [toast, setToast] = useState(null);
  const autoSubmittedRef = useRef(false);
  const isContestActiveRef = useRef(true);

  // Violation tracking
  const violationCountRef = useRef(0);
  const [violationModal, setViolationModal] = useState(null); // { count, reason }
  const violationLockRef = useRef(false);

  // Register number watermark
  const registerNumber = (() => {
    try { return window.localStorage.getItem('code2day-register-number') || ''; } catch { return ''; }
  })();

  const showToast = (message, type = 'success') => setToast({ message, type });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });
  };

  // Camera & Snapshot state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const snapshotsTakenRef = useRef(0);

  // Lock State
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState('');

  // Camera initialization
  useEffect(() => {
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraActive(true);
      } catch (err) {
        console.warn('Camera access denied or unavailable:', err);
      }
    }
    initCamera();
    return () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Snapshot capture function
  const captureSnapshot = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        if (dataUrl && dataUrl.length > 100) {
          snapshotsTakenRef.current += 1;
          await fetch(`/api/student/contests/${contestId}/snapshot/`, {
            method: 'POST',
            ...buildJsonPostOptions({ image: dataUrl }),
          });
        }
      }
    } catch (err) {
      console.warn('Failed to capture snapshot:', err);
    }
  }, [contestId]);

  // Trigger random snapshot on question switch
  useEffect(() => {
    if (cameraActive && snapshotsTakenRef.current < 2) {
      const timer = setTimeout(() => {
        captureSnapshot();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [selectedQuestionIndex, cameraActive, captureSnapshot]);



  // Live polling for staff unlock status when contest workspace is locked
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/student/contests/${contestId}/session-status/`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.participation && data.participation.is_locked === false) {
            setIsLocked(false);
            setLockReason('');
            setUnlockPinInput('');
            violationCountRef.current = 0;
            violationLockRef.current = false;
            setViolationModal(null);
            isContestActiveRef.current = true;
            showToast('🔓 Staff unlocked your contest session! Resuming workspace...', 'success');
          }
        }
      } catch (err) {
        console.warn('Session status check error:', err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [contestId, isLocked]);

  const maxTabSwitches = contest?.max_tab_switches ?? 3;
  const enableTabCheck = contest?.enable_tab_switch_check !== false;
  const enableFullscreenLock = contest?.enable_fullscreen_lock !== false;
  const enableCopyPasteLock = contest?.enable_copy_paste_lock ?? false;

  // ── Violation handler ─────────────────────────────────────────────────────
  const recordViolation = useCallback(async (reason) => {
    if (!isContestActiveRef.current) return;
    if ((reason.includes('Tab switch') || reason.includes('blur')) && !enableTabCheck) return;
    if (reason.includes('Fullscreen') && !enableFullscreenLock) return;
    if (reason.includes('Paste') && !enableCopyPasteLock) return;
    if (violationLockRef.current) return;
    violationLockRef.current = true;

    violationCountRef.current += 1;
    const count = violationCountRef.current;

    if (count > maxTabSwitches) {
      violationLockRef.current = false;
      return;
    }

    setViolationModal({ count, reason });

    if (count >= maxTabSwitches) {
      isContestActiveRef.current = false;
      setIsLocked(true);
      setLockReason(reason);
      try {
        await fetch(`/api/student/contests/${contestId}/lock/`, {
          method: 'POST',
          ...buildJsonPostOptions({ reason }),
        });
      } catch {}
    }
  }, [contestId, enableCopyPasteLock, enableFullscreenLock, enableTabCheck, maxTabSwitches]);

  const dismissViolationModal = useCallback(() => {
    setViolationModal(null);
    violationLockRef.current = false;
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }, []);

  // ── Fullscreen + anti-cheat enforcement ──────────────────────────────────
  useEffect(() => {
    const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
    setIsFullscreen(isFull);

    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

    const blockPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      recordViolation('Paste detected — pasting is not allowed during a contest.');
    };
    document.addEventListener('paste', blockPaste, true);

    const handleVisibility = () => {
      if (document.hidden && isContestActiveRef.current) {
        recordViolation('Tab switch or window blur detected — you must stay on this page.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleWindowBlur = () => {
      if (isContestActiveRef.current) {
        recordViolation('Tab switch or window blur detected — you must stay on this page.');
      }
    };
    window.addEventListener('blur', handleWindowBlur);

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
      const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      setIsFullscreen(isFull);

      if (!isFull && isContestActiveRef.current) {
        recordViolation('Fullscreen exit detected — you must remain in fullscreen during the contest.');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    // Block drag and drop globally
    const blockDragDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragstart', blockDragDrop, true);
    document.addEventListener('dragover', blockDragDrop, true);
    document.addEventListener('drop', blockDragDrop, true);

    return () => {
      document.removeEventListener('paste', blockPaste, true);
      document.removeEventListener('dragstart', blockDragDrop, true);
      document.removeEventListener('dragover', blockDragDrop, true);
      document.removeEventListener('drop', blockDragDrop, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [recordViolation]);

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
        setQuestions(data.problems || []);

        // Load existing answers if any
        const initialAnswers = {};
        let initialCorrect = 0;
        if (data.problems) {
          data.problems.forEach(q => {
            if (q.student_answer) {
              initialAnswers[q.id] = q.student_answer;
              if (q.is_correct) initialCorrect++;
            }
          });
        }
        setAnswers(initialAnswers);
        setCorrectCount(initialCorrect);

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
    if (!contest?.participation?.session_end_time) {
      return;
    }

    const sessionEnd = new Date(contest.participation.session_end_time).getTime();

    function tick() {
      const remaining = Math.max(0, Math.floor((sessionEnd - Date.now()) / 1000));
      setContestSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        if (!autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          isContestActiveRef.current = false;
          fetch(`/api/student/contests/${contestId}/auto-submit/`, {
            method: "POST",
            ...buildJsonPostOptions({}),
          }).catch((err) => console.error("Auto-submit error:", err));
          showToast('⏰ Time is up! Your aptitude contest has been submitted automatically.', 'warning');
          setTimeout(() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            onBack();
          }, 3000);
        }
      }
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [contest?.participation?.session_end_time]);

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
          time_taken: 0
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (typeof data.correct_count === 'number') {
          setCorrectCount(data.correct_count);
        }
      } else {
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
          const response = await fetch(`/api/student/contests/${contestId}/stop/`, {
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
  const violationCount = violationCountRef.current;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#f8fafc',
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      {/* Register number watermark */}
      <Watermark registerNumber={registerNumber} />

      {/* Header */}
      <header style={{
        background: 'white',
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        position: 'relative',
        zIndex: 10,
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Violation badge */}
          {violationCount > 0 && (
            <div style={{
              background: violationCount >= MAX_VIOLATIONS ? '#dc2626' : '#f59e0b',
              color: 'white',
              padding: '4px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <AlertCircle size={14} />
              {violationCount}/{MAX_VIOLATIONS} Warnings
            </div>
          )}

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 2 }}>TIME REMAINING</div>
            <div style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: (contestSecondsLeft !== null && contestSecondsLeft < 300) ? '#ef4444' : '#1e293b',
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
              boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.1)',
            }}
          >
            <Send size={16} />
            Finish Contest
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 10 }}>
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
                width: `${questions.length > 0 ? (totalAnswered / questions.length) * 100 : 0}%`,
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
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
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
                          boxShadow: isSelected ? '0 4px 6px -1px rgba(79,70,229,0.1)' : 'none'
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
                        boxShadow: '0 4px 10px rgba(5,150,105,0.2)'
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

      {/* Violation warning modal */}
      {violationModal && (
        <ViolationModal
          count={violationModal.count}
          reason={violationModal.reason}
          onReEnterFullscreen={
            violationModal.count >= maxTabSwitches ? undefined : dismissViolationModal
          }
        />
      )}

      {/* Fullscreen Overlay Prompt when not in fullscreen */}
      {!isFullscreen && isContestActiveRef.current && !violationModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: 'white', padding: 24, textAlign: 'center',
        }}>
          <div style={{ maxWidth: 480, width: '100%', background: '#1e293b', borderRadius: 20, padding: 36, border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <AlertCircle size={36} />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px', color: '#f8fafc' }}>
              Fullscreen Mode Required
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              This contest is proctored. You must remain in fullscreen mode. Exiting fullscreen or switching tabs will trigger a security violation.
            </p>
            <button
              onClick={() => {
                const el = document.documentElement;
                if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                setIsFullscreen(true);
              }}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: '#4f46e5', color: 'white', border: 'none',
                fontWeight: 700, fontSize: 15, cursor: 'pointer',
                boxShadow: '0 10px 25px rgba(79,70,229,0.4)',
              }}
            >
              Click to Enter Fullscreen Mode
            </button>
          </div>
        </div>
      )}

      {/* Hidden camera & canvas elements for proctoring snapshots */}
      <video ref={videoRef} autoPlay playsInline muted style={{ display: 'none' }} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Lock Screen Overlay */}
      {isLocked && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99999, background: 'rgba(15, 23, 42, 0.97)',
          backdropFilter: 'blur(16px)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div style={{
            background: 'white', borderRadius: 20, maxWidth: 460, width: '100%',
            padding: '36px 32px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', background: '#fef2f2',
              color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <span style={{ fontSize: 36 }}>🔒</span>
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
              Contest Session Locked
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.5, marginBottom: 24 }}>
              {lockReason || 'Maximum proctoring warnings exceeded.'} Your contest workspace is locked. Please inform your staff member or lab invigilator to unlock your session from their Staff Dashboard.
            </p>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '12px 24px', borderRadius: 12, background: '#f1f5f9',
              color: '#334155', fontSize: 14, fontWeight: 700
            }}>
              <span>⏳</span> Waiting for Staff Unlock Authorization...
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default AptitudeContestWorkspacePage;
