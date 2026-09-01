import Editor from "@monaco-editor/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

import { runCodeExecution, getLanguageIdForChoice } from "../../../lib/codeExecution";
import { starterCodeByLanguage, editorLanguageByChoice } from "../../../lib/appData";
import { formatDuration, buildJsonPostOptions, configureEditorProtection } from "../../../lib/appUtils";
import { validateLanguageMatch, getLanguageMismatchError, detectLanguageFromCode } from "../../../lib/languageDetector";
import { AlertCircle } from "lucide-react";
import DoubleConfirmModal from "../../common/DoubleConfirmModal";

loader.config({ monaco });

const POPULAR_LANGUAGES = ["C", "C++", "Java", "Python"];
const MAX_VIOLATIONS = 3;

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

// ── Violation warning modal ────────────────────────────────────────────────────
function ViolationModal({ count, reason, onContinue, onReEnterFullscreen }) {
  const isFinal = count >= MAX_VIOLATIONS;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15,23,42,0.96)',
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
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          <strong style={{ color: '#dc2626' }}>{reason}</strong>
        </p>
        {isFinal ? (
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            You have exceeded the maximum number of violations ({MAX_VIOLATIONS}). Your contest has been
            automatically submitted and your attempt has been recorded.
          </p>
        ) : (
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            {MAX_VIOLATIONS - count} warning(s) remaining before automatic submission.
            Any further violation will be counted.
          </p>
        )}
        {!isFinal && (
          <button
            onClick={onReEnterFullscreen || onContinue}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              background: '#4f46e5', color: 'white', border: 'none',
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            Re-enter Full Screen &amp; Continue
          </button>
        )}
      </div>
    </div>
  );
}

// ── Register number watermark overlay ─────────────────────────────────────────
function Watermark({ registerNumber }) {
  if (!registerNumber) return null;
  const text = registerNumber.toUpperCase();
  // Build a repeating pattern using a single rotated stripe
  const rows = [];
  for (let r = -5; r < 20; r++) {
    for (let c = -5; c < 20; c++) {
      rows.push(
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
      pointerEvents: 'none',
      zIndex: 9000,
      overflow: 'hidden',
    }}>
      {rows}
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

  // Violation tracking
  const violationCountRef = useRef(0);
  const [violationModal, setViolationModal] = useState(null); // { count, reason } | null
  const violationLockRef = useRef(false); // prevent stacking violations during modal display

  // Register number watermark — read from localStorage (set at login via authStorageKey)
  const registerNumber = (() => {
    try { return window.localStorage.getItem('code2day-register-number') || ''; } catch { return ''; }
  })();

  const showToast = (message, type = 'success') => setToast({ message, type });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });
  };
  const [problems, setProblems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Cache helpers — keyed per contest + problem + language ───────────────
  const cacheKey = (slug, lang) => `c2d-contest-${contestId}-${slug}-${lang}`;
  const sessionKey = `c2d-contest-session-${contestId}`;

  // Selected problem — restore last position from cache
  const [selectedProblemIndex, setSelectedProblemIndex] = useState(() => {
    try { return parseInt(localStorage.getItem(`${sessionKey}-idx`) || '0', 10) || 0; } catch { return 0; }
  });
  const [selectedProblemDetails, setSelectedProblemDetails] = useState(null);
  const [problemDetailTab, setProblemDetailTab] = useState('current');
  const selectedProblem = problems[selectedProblemIndex] || null;

  // Editor state — restore language from cache
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    try { return localStorage.getItem(`${sessionKey}-lang`) || 'Python'; } catch { return 'Python'; }
  });
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
  const [executionPhase, setExecutionPhase] = useState("idle"); // "idle" | "compiling" | "running"
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);

  // Timer state
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [problemSecondsElapsed, setProblemSecondsElapsed] = useState(0);

  // Camera & Snapshot state
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const snapshotsTakenRef = useRef(0);

  // Lock State
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState('');

  // Camera initialization — only when the contest requires webcam proctoring
  useEffect(() => {
    if (!contest?.enable_webcam_proctoring) return;

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
  }, [contest?.enable_webcam_proctoring]);

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
  }, [selectedProblemIndex, cameraActive, captureSnapshot]);



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
  const enableCopyPasteLock = contest?.enable_copy_paste_lock ?? false;

  // ── Violation handler ─────────────────────────────────────────────────────
  // Fullscreen is always enforced — staying in fullscreen for the whole contest
  // is not an optional, per-contest setting like tab-switch/copy-paste checks.
  const recordViolation = useCallback(async (reason) => {
    if (!isContestActiveRef.current) return;
    if ((reason.includes('Tab switch') || reason.includes('blur')) && !enableTabCheck) return;
    if (reason.includes('Paste') && !enableCopyPasteLock) return;
    if (violationLockRef.current) return; // ignore while modal is shown
    violationLockRef.current = true;

    violationCountRef.current += 1;
    const count = violationCountRef.current;

    if (count > maxTabSwitches) {
      violationLockRef.current = false;
      return;
    }

    setViolationModal({ count, reason });

    if (count >= maxTabSwitches) {
      // Lock contest session instead of auto-submitting
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
  }, [contestId, enableCopyPasteLock, enableTabCheck, maxTabSwitches]);

  const dismissViolationModal = useCallback(() => {
    setViolationModal(null);
    violationLockRef.current = false;
    // re-enter fullscreen after dismissing
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }, []);

  // ── Fullscreen + anti-cheat enforcement ──────────────────────────────────
  useEffect(() => {
    // Check initial fullscreen status
    const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
    setIsFullscreen(isFull);

    // Enter fullscreen on mount
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

    // Block paste globally
    const blockPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      recordViolation('Paste detected — pasting is not allowed during a contest.');
    };
    document.addEventListener('paste', blockPaste, true);

    // Detect tab/window visibility change
    const handleVisibility = () => {
      if (document.hidden && isContestActiveRef.current) {
        recordViolation('Tab switch or window blur detected — you must stay on this page.');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Detect window blur / tab switch
    const handleWindowBlur = () => {
      if (isContestActiveRef.current) {
        recordViolation('Tab switch or window blur detected — you must stay on this page.');
      }
    };
    window.addEventListener('blur', handleWindowBlur);

    // Block keyboard shortcuts that could switch tabs or open devtools
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

    // Prevent accidental page exit (browser back/close)
    const handleBeforeUnload = (e) => {
      if (isContestActiveRef.current) {
        e.preventDefault();
        e.returnValue = 'You are in an active contest. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Block drag and drop globally
    const blockDragDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragstart', blockDragDrop, true);
    document.addEventListener('dragover', blockDragDrop, true);
    document.addEventListener('drop', blockDragDrop, true);

    // Re-enter fullscreen if user exits it
    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      setIsFullscreen(isFull);

      if (!isFull && isContestActiveRef.current) {
        recordViolation('Fullscreen exit detected — you must remain in fullscreen during the contest.');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

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
        const response = await fetch(`/api/student/contests/${contestId}/`, {
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to load contest");
        }

        const data = await response.json();
        setContest(data);
        setProblems(data.problems || []);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    fetchContestData();
  }, [contestId]);

  // Timer logic — use session_end_time from participation (already capped at access_end_time)
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
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith(`c2d-contest-${contestId}`))
              .forEach(k => localStorage.removeItem(k));
          } catch {}
          showToast('⏰ Time is up! Your contest has been submitted automatically.', 'warning');
          setTimeout(() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            onBack();
          }, 3000);
        }
      }
    }

    tick(); // run immediately so there's no 1-second blank
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [contest?.participation?.session_end_time]);

  // Problem timer
  useEffect(() => {
    const interval = setInterval(() => {
      setProblemSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedProblemIndex]);

  // Dirty-tracking so a restore never clobbers an in-progress edit — the
  // same method used on the practice-problems page: activeCodeKeyRef marks
  // which (problem, language) userEditedCodeRef applies to, and the
  // editor's onChange (handleEditorCodeChange below) tells a genuine
  // keystroke apart from the echo of our own setCode(...) calls.
  const activeCodeKeyRef = useRef("");
  const userEditedCodeRef = useRef(false);
  const lastProgrammaticCodeRef = useRef(null);

  const handleEditorCodeChange = useCallback((value) => {
    const next = value ?? "";
    if (next !== lastProgrammaticCodeRef.current) {
      userEditedCodeRef.current = true;
    }
    setCode(next);
  }, []);

  // Restore cached code when problem or language changes; fall back to starter code
  useEffect(() => {
    if (!selectedProblem) return;
    const key = cacheKey(selectedProblem.slug, selectedLanguage);
    if (activeCodeKeyRef.current !== key) {
      activeCodeKeyRef.current = key;
      userEditedCodeRef.current = false;
    } else if (userEditedCodeRef.current) {
      return;
    }
    const cached = (() => { try { return localStorage.getItem(key); } catch { return null; } })();
    const nextCode = cached || starterCodeByLanguage[selectedLanguage] || "// Write your solution here";
    lastProgrammaticCodeRef.current = nextCode;
    setCode(nextCode);
    setProblemSecondsElapsed(0);
    setOutputLog("Run your code to see output here.");
    setExecutionMeta({ status: "Ready", time: null, memory: null });
  }, [selectedProblem?.slug, selectedLanguage]);

  // Persist code to localStorage on every change
  useEffect(() => {
    if (!selectedProblem || !code) return;
    try { localStorage.setItem(cacheKey(selectedProblem.slug, selectedLanguage), code); } catch {}
  }, [code]);

  // Persist selected problem index and language so refresh restores position
  useEffect(() => {
    try { localStorage.setItem(`${sessionKey}-idx`, String(selectedProblemIndex)); } catch {}
  }, [selectedProblemIndex]);

  useEffect(() => {
    try { localStorage.setItem(`${sessionKey}-lang`, selectedLanguage); } catch {}
  }, [selectedLanguage]);

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
    setElapsedTime(0);
    setExecutionPhase("running");
    setOutputLog("Running your code...");
    setExecutionMeta({ status: "Running", time: null, memory: null });

    clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - start) / 1000));
    }, 500);

    try {
      const result = await runCodeExecution({
        sourceCode: code,
        language: selectedLanguage,
        stdin: executionInput || "",
        problemSlug: selectedProblem.slug,
        isSubmit: false,
      });
      let displayOutput = result.output || "No output";

      // Append test-case breakdown if the backend returned it
      if (result.test_results && result.test_results.length > 0) {
        const tcLines = [`\n─── Test Cases (${result.passed_cases ?? '?'}/${result.total_cases ?? result.test_results.length} passed) ───`];
        result.test_results.forEach((tc, i) => {
          tcLines.push('');
          tcLines.push(`Case ${tc.case ?? i + 1}: ${tc.passed ? '✓ Passed' : '✗ Failed'} [${tc.status || (tc.passed ? 'Accepted' : 'Wrong Answer')}]${tc.time ? ` · ${tc.time}s` : ''}`);
          if (tc.stdin) tcLines.push(`  Input:    ${tc.stdin}`);
          tcLines.push(`  Expected: ${tc.expected || '(empty)'}`);
          tcLines.push(`  Got:      ${tc.actual || '(no output)'}`);
          if (tc.stderr) tcLines.push(`  Error:    ${tc.stderr}`);
        });
        displayOutput += tcLines.join('\n');
      }

      setOutputLog(displayOutput);
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
      clearInterval(timerRef.current);
      setExecutionBusy(false);
      setExecutionPhase("idle");
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
    setElapsedTime(0);
    setExecutionPhase("compiling");
    setOutputLog("Submitting your solution...");
    setExecutionMeta({ status: "Submitting", time: null, memory: null });

    clearInterval(timerRef.current);
    const submitStart = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - submitStart) / 1000);
      setElapsedTime(elapsed);
      if (elapsed >= 3) setExecutionPhase("running");
    }, 500);

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
        lines.push(`Score: ${sub.score}/${sub.max_score ?? sub.score}`);
      } else if (sub.status === 'Compilation Error') {
        lines.push(`🔴 Compilation Error`);
        lines.push('');
        lines.push(sub.compile_error || 'Check your syntax.');
      } else {
        lines.push(`❌ ${sub.status || 'Wrong Answer'} — ${sub.passed_cases}/${sub.total_cases} test case(s) passed`);
        lines.push(`Score: ${sub.score}/${sub.max_score ?? 100}`);
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

      // Mark problem as attempted, and solved if accepted
      const updatedProblems = [...problems];
      updatedProblems[selectedProblemIndex] = {
        ...updatedProblems[selectedProblemIndex],
        attempted: true,
        solved: updatedProblems[selectedProblemIndex].is_solved || sub.status === 'Accepted',
        is_solved: updatedProblems[selectedProblemIndex].is_solved || sub.status === 'Accepted',
      };
      setProblems(updatedProblems);

      if (sub.status === 'Accepted') {
        // Find next unsolved problem
        const nextIdx = updatedProblems.findIndex(
          (p, i) => i !== selectedProblemIndex && !p.is_solved && !p.solved
        );

        if (nextIdx !== -1) {
          showToast(`✅ Accepted! Moving to problem ${nextIdx + 1}…`, 'success');
          setTimeout(() => {
            setSelectedProblemIndex(nextIdx);
            setProblemDetailTab('current');
          }, 1800);
        } else {
          // All problems solved
          showToast('🎉 All problems solved! Great work!', 'success');
        }
      } else {
        showToast(`Submitted: ${sub.status || 'Wrong Answer'} — ${sub.passed_cases}/${sub.total_cases} cases passed`, 'error');
      }
    } catch (err) {
      console.error("Submit error:", err);
      setOutputLog(`Submission error: ${err.message}`);
      setExecutionMeta({ status: "Error", time: null, memory: null });
    } finally {
      clearInterval(timerRef.current);
      setExecutionBusy(false);
      setExecutionPhase("idle");
    }
  }, [contestId, selectedProblem, code, selectedLanguage, problems, selectedProblemIndex]);

  // Build a pending/attempted/solved breakdown shown before final submission
  const buildSubmitSummary = useCallback(() => {
    const solved = problems.filter((p) => p.is_solved);
    const attemptedNotSolved = problems.filter((p) => p.attempted && !p.is_solved);
    const notAttempted = problems.filter((p) => !p.attempted);

    const lines = [`Solved: ${solved.length}/${problems.length}`];
    if (attemptedNotSolved.length) {
      lines.push(`Attempted but not solved (${attemptedNotSolved.length}): ${attemptedNotSolved.map((p) => p.title).join(', ')}`);
    }
    if (notAttempted.length) {
      lines.push(`Not attempted at all (${notAttempted.length}): ${notAttempted.map((p) => p.title).join(', ')}`);
    }
    if (!attemptedNotSolved.length && !notAttempted.length) {
      lines.push('All problems attempted.');
    }
    return lines.join('\n');
  }, [problems]);

  const submitContest = useCallback(async ({ successMessage }) => {
    try {
      const response = await fetch(`/api/student/contests/${contestId}/stop/`, {
        method: "POST",
        ...buildJsonPostOptions({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to finish contest");
      }

      isContestActiveRef.current = false;
      // Clear contest cache on completion
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith(`c2d-contest-${contestId}`))
          .forEach(k => localStorage.removeItem(k));
      } catch {}
      showToast(successMessage, 'success');
      setTimeout(() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        onBack();
      }, 2500);
    } catch (err) {
      console.error("Error submitting contest:", err);
      showToast(`Failed to submit contest: ${err.message}`, 'error');
    }
  }, [contestId, onBack]);

  // Handle finish contest
  const handleFinishContest = useCallback(async () => {
    askDouble(
      () => submitContest({ successMessage: '🎉 Contest submitted successfully! Redirecting...' }),
      buildSubmitSummary(),
      "WARNING: This action cannot be undone. Your attempt will be submitted for final evaluation as-is."
    );
  }, [submitContest, buildSubmitSummary]);

  // Handle leave contest — leaving is only ever possible by submitting; there is no plain exit
  const handleLeaveContest = useCallback(async () => {
    askDouble(
      () => submitContest({ successMessage: 'Contest submitted. Returning to contest list...' }),
      buildSubmitSummary(),
      "Your attempt will be submitted exactly as it stands now and you cannot return. Confirm departure?"
    );
  }, [submitContest, buildSubmitSummary]);

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
      {/* Register number watermark */}
      <Watermark registerNumber={registerNumber} />

      {/* ── Workspace Header ── */}
      <section className="page-header compact-header problem-page-header">
        <div className="workspace-title-row">
          <button
            type="button"
            className="back-to-list-btn"
            onClick={handleLeaveContest}
            title="Leaving submits your attempt as-is"
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
          {/* Violation indicator */}
          {violationCountRef.current > 0 && (
            <div style={{
              background: violationCountRef.current >= MAX_VIOLATIONS ? '#dc2626' : '#f59e0b',
              color: 'white', padding: '4px 12px', borderRadius: 20,
              fontSize: 12, fontWeight: 700,
            }}>
              ⚠ {violationCountRef.current}/{MAX_VIOLATIONS} Warnings
            </div>
          )}
          {selectedProblem && (
            <span className={`difficulty-chip ${(selectedProblem.difficulty || 'Easy').toLowerCase()}`}>
              {selectedProblem.difficulty || 'Easy'}
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
        <aside className="surface-card problem-sidebar judge-sidebar">
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
                          <span className={`mini-pill ${(problem.difficulty || 'Easy').toLowerCase()}`}>
                            {problem.difficulty || 'Easy'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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
                  onChange={handleEditorCodeChange}
                  onMount={(editor, monaco) => {
                    const allowCopyPaste = Boolean(contest?.enable_copy_paste_lock === false);
                    configureEditorProtection(editor, monaco, allowCopyPaste);
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
                    contextmenu: Boolean(contest?.enable_copy_paste_lock === false),
                    dragAndDrop: Boolean(contest?.enable_copy_paste_lock === false),
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
                    disabled={executionBusy || contestSecondsLeft === 0}
                  >
                    {executionBusy && executionPhase === "running" ? `Running… ${elapsedTime}s` : "Run"}
                  </button>
                  <button
                    type="button"
                    className="primary-button dense-action"
                    onClick={handleSubmitCode}
                    disabled={executionBusy || contestSecondsLeft === 0}
                  >
                    {executionBusy
                      ? executionPhase === "compiling"
                        ? `Compiling… ${elapsedTime}s`
                        : `Executing… ${elapsedTime}s`
                      : contestSecondsLeft === 0
                      ? "Time's Up"
                      : "Submit"}
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
              {executionBusy ? (
                <div className="output-panel compiling-overlay">
                  <div className="compiling-spinner" />
                  <div className="compiling-label">
                    {executionPhase === "compiling" ? "Compiling…" : "Executing…"}
                    <span className="compiling-elapsed">{elapsedTime}s</span>
                  </div>
                </div>
              ) : (
                <pre className="output-panel compact-output">{outputLog}</pre>
              )}
            </div>
          </article>
        </section>

        {/* RIGHT: problem statement */}
        <section className="right-column judge-right">
          <article className="surface-card statement-panel judge-statement">
            <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  {selectedProblem ? `Problem ${selectedProblemIndex + 1} of ${problems.length}: ${selectedProblem.title}` : "Problem details"}
                  {selectedProblem && (
                    <span className={`difficulty-chip ${(selectedProblem.difficulty || 'Easy').toLowerCase()}`}>
                      {selectedProblem.difficulty || 'Easy'}
                    </span>
                  )}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="ghost-button dense-action"
                  onClick={() => setSelectedProblemIndex(Math.max(0, selectedProblemIndex - 1))}
                  disabled={selectedProblemIndex === 0}
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  className="ghost-button dense-action"
                  onClick={() => setSelectedProblemIndex(Math.min(problems.length - 1, selectedProblemIndex + 1))}
                  disabled={selectedProblemIndex === problems.length - 1}
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="tab-strip dense">
              {["current", "explanation"].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={problemDetailTab === tab ? "tab-pill active dense" : "tab-pill dense"}
                  onClick={() => setProblemDetailTab(tab)}
                >
                  {tab === "current" ? "Problem" : "Explanation"}
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
                  {problemDetailTab === "explanation" && (
                    <>
                      {selectedProblemDetails.explanation ? (
                        <div className="info-box">
                          <h4>Explanation</h4>
                          <p className="body-copy formatted-explanation">{selectedProblemDetails.explanation}</p>
                        </div>
                      ) : (
                        <p className="body-copy">No explanation available for this problem yet.</p>
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

      {/* Violation warning modal */}
      {violationModal && (
        <ViolationModal
          count={violationModal.count}
          reason={violationModal.reason}
          onContinue={dismissViolationModal}
          onReEnterFullscreen={dismissViolationModal}
        />
      )}

      {/* Fullscreen Overlay Prompt when not in fullscreen */}
      {!isFullscreen && isContestActiveRef.current && !violationModal && !isLocked && (
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
