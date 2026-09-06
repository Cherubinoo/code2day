// Combined Contest Workspace — one contest session covering Coding, Aptitude,
// and Reading Comprehension sections in a single tabbed workspace, sharing one
// timer and one submit action. Reading questions are AptitudeQuestion rows
// (question_type "RC") tied to a passage, so they ride along with regular
// aptitude questions in contest.aptitude_questions and are split out here by
// question_type / passage_id rather than needing a separate data source.
import Editor from "@monaco-editor/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { AlertCircle, CheckCircle, XCircle, BookOpen, Code2, Brain } from "lucide-react";
import { runCodeExecution, getLanguageIdForChoice } from "../../../lib/codeExecution";
import { starterCodeByLanguage, editorLanguageByChoice } from "../../../lib/appData";
import { formatDuration, buildJsonPostOptions, configureEditorProtection } from "../../../lib/appUtils";
import DoubleConfirmModal from "../../common/DoubleConfirmModal";
import { useDrillDownParam } from "../../../lib/useDrillDownParam";

loader.config({ monaco });

const MAX_VIOLATIONS = 3;
const POPULAR_LANGUAGES = ["C", "C++", "Java", "Python"];

// ── Toast notification ────────────────────────────────────────────────────────
function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bg = type === "success" ? "#059669" : type === "error" ? "#dc2626" : "#f59e0b";
  return (
    <div style={{
      position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
      background: bg, color: "white", padding: "14px 28px", borderRadius: 12,
      fontWeight: 700, fontSize: 16, zIndex: 99999,
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      {type === "success" ? "✅" : type === "error" ? "❌" : "⏰"} {message}
    </div>
  );
}

// ── Violation warning modal ───────────────────────────────────────────────────
function ViolationModal({ count, reason, onReEnterFullscreen }) {
  const isFinal = count >= MAX_VIOLATIONS;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(15,23,42,0.97)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 999998, backdropFilter: "blur(8px)",
    }}>
      <div style={{
        background: "white", borderRadius: 24, padding: "48px 40px",
        maxWidth: 480, width: "90%", textAlign: "center",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: isFinal ? "#fee2e2" : "#fef3c7",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", color: isFinal ? "#dc2626" : "#d97706",
        }}>
          <AlertCircle size={40} />
        </div>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 800, color: "#0f172a" }}>
          {isFinal ? "Contest Auto-Submitted" : `Warning ${count} of ${MAX_VIOLATIONS}`}
        </h2>
        <p style={{ margin: "0 0 12px", color: "#dc2626", fontSize: 14, fontWeight: 600 }}>{reason}</p>
        {isFinal ? (
          <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
            You have exceeded the maximum number of violations ({MAX_VIOLATIONS}). Your contest has been
            automatically submitted and your attempt has been recorded.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: 14, lineHeight: 1.6 }}>
              {MAX_VIOLATIONS - count} warning(s) remaining before automatic submission.
            </p>
            <button
              onClick={onReEnterFullscreen}
              style={{
                width: "100%", padding: "14px", borderRadius: 12,
                background: "#4f46e5", color: "white", border: "none",
                fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >
              Re-enter Full Screen &amp; Continue
            </button>
          </>
        )}
        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
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
            position: "absolute", left: `${c * 18}%`, top: `${r * 8}%`,
            transform: "rotate(-30deg)", fontSize: 12, fontWeight: 600,
            color: "rgba(99,102,241,0.12)", letterSpacing: "0.15em",
            userSelect: "none", whiteSpace: "nowrap",
          }}
        >
          {text}
        </span>
      );
    }
  }
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9000, overflow: "hidden" }}>
      {items}
    </div>
  );
}

// ── One MCQ / RC question card, shared by the Aptitude and Reading tabs ──────
function QuestionCard({ question, index, selected, onSelect }) {
  const isAnswered = selected !== undefined;
  const options = [
    { key: "A", value: question.option_a },
    { key: "B", value: question.option_b },
    { key: "C", value: question.option_c },
    { key: "D", value: question.option_d },
  ];
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>
        {index + 1}. {question.question_text}
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {options.map((opt) => {
          if (!opt.value) return null;
          const isSelected = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelect(question.id, opt.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                borderRadius: 10, border: `2px solid ${isSelected ? "#4f46e5" : "#e2e8f0"}`,
                background: isSelected ? "#eef2ff" : "#f8fafc",
                cursor: "pointer", textAlign: "left", fontSize: 14,
              }}
            >
              <span style={{
                width: 24, height: 24, borderRadius: 7, background: "white", display: "flex",
                alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0,
                border: "1px solid #e2e8f0",
              }}>
                {opt.key}
              </span>
              <span>{opt.value}</span>
              {isSelected && <CheckCircle size={16} color="#4f46e5" style={{ marginLeft: "auto" }} />}
            </button>
          );
        })}
      </div>
      {isAnswered && <div style={{ marginTop: 10, fontSize: 12, color: "#059669", fontWeight: 600 }}>Answer recorded</div>}
    </div>
  );
}

export default function CombinedContestWorkspacePage({ contestId, onBack }) {
  const [contest, setContest] = useState(null);
  const [problems, setProblems] = useState([]); // coding
  const [aptitudeQuestions, setAptitudeQuestions] = useState([]); // MCQ + RC combined, raw
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({}); // {questionId: selectedOption} — aptitude + reading

  // useDrillDownParam (not plain useState) on activeTab / selectedProblemIndex
  // / selectedPassageId below so the browser Back button steps back through
  // this combined workspace's sections instead of exiting it mid-contest.
  const [activeTab, setActiveTab] = useDrillDownParam("tab", { defaultValue: null, parse: (v) => v || null }); // 'coding' | 'aptitude' | 'reading'
  const [confirmState, setConfirmState] = useState({ show: false, m1: "", m2: "", onConfirm: null, firstOk: false });
  const [toast, setToast] = useState(null);
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const autoSubmittedRef = useRef(false);
  const isContestActiveRef = useRef(true);

  // Violation tracking
  const violationCountRef = useRef(0);
  const [violationModal, setViolationModal] = useState(null);
  const violationLockRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockReason, setLockReason] = useState("");

  // Camera
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);
  const snapshotsTakenRef = useRef(0);

  // Coding tab state
  const [selectedProblemIndex, setSelectedProblemIndex] = useDrillDownParam("p", {
    defaultValue: 0,
    parse: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n >= 1 ? n - 1 : 0;
    },
    serialize: (v) => String(v + 1),
  });
  const [selectedProblemDetails, setSelectedProblemDetails] = useState(null);
  const selectedProblem = problems[selectedProblemIndex] || null;
  const [code, setCode] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("C++");
  const [outputLog, setOutputLog] = useState("Run your code to see output here.");
  const [executionBusy, setExecutionBusy] = useState(false);
  const [executionPhase, setExecutionPhase] = useState("idle");
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);

  // Aptitude / Reading tab state
  const [selectedMcqIndex, setSelectedMcqIndex] = useState(0);
  const [selectedPassageId, setSelectedPassageId] = useDrillDownParam("passage", {
    defaultValue: null,
    parse: (v) => v || null,
  });

  const registerNumber = (() => {
    try { return window.localStorage.getItem("code2day-register-number") || ""; } catch { return ""; }
  })();

  const showToast = (message, type = "success") => setToast({ message, type });
  const askDouble = (onConfirm, m1, m2) => setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });

  // Derived: split aptitude_questions into plain MCQ vs Reading (RC), group RC by passage
  const mcqQuestions = aptitudeQuestions.filter((q) => q.question_type !== "RC");
  const readingQuestions = aptitudeQuestions.filter((q) => q.question_type === "RC");
  const passages = [];
  const passageMap = {};
  for (const q of readingQuestions) {
    if (!passageMap[q.passage_id]) {
      passageMap[q.passage_id] = { id: q.passage_id, title: q.passage_title, text: q.passage_text, questions: [] };
      passages.push(passageMap[q.passage_id]);
    }
    passageMap[q.passage_id].questions.push(q);
  }
  const selectedPassage = passages.find((p) => p.id === selectedPassageId) || null;

  const tabs = [
    problems.length > 0 && { id: "coding", label: "Coding", icon: Code2, count: problems.length },
    mcqQuestions.length > 0 && { id: "aptitude", label: "Aptitude", icon: Brain, count: mcqQuestions.length },
    passages.length > 0 && { id: "reading", label: "Reading", icon: BookOpen, count: passages.length },
  ].filter(Boolean);

  useEffect(() => {
    if (!activeTab && tabs.length > 0) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  const maxTabSwitches = contest?.max_tab_switches ?? 3;
  const enableTabCheck = contest?.enable_tab_switch_check !== false;
  const enableCopyPasteLock = contest?.enable_copy_paste_lock ?? false;
  // A ref, not a plain boolean — see appUtils.configureEditorProtection's
  // own docstring for why: Monaco's onMount fires once per editor
  // instance, so a boolean captured there would go stale if `contest`
  // finishes loading (or its lock setting changes) after that.
  const allowCopyPasteRef = useRef(false);
  allowCopyPasteRef.current = !enableCopyPasteLock;

  // ── Violation handler — fullscreen is always enforced, tab-switch/paste are contest-configurable ──
  const recordViolation = useCallback(async (reason) => {
    if (!isContestActiveRef.current) return;
    if ((reason.includes("Tab switch") || reason.includes("blur")) && !enableTabCheck) return;
    if (reason.includes("Paste") && !enableCopyPasteLock) return;
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
        await fetch(`/api/student/contests/${contestId}/lock/`, { method: "POST", ...buildJsonPostOptions({ reason }) });
      } catch {}
    }
  }, [contestId, enableCopyPasteLock, enableTabCheck, maxTabSwitches]);

  const dismissViolationModal = useCallback(() => {
    setViolationModal(null);
    violationLockRef.current = false;
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }, []);

  // ── Fullscreen + anti-cheat enforcement ──────────────────────────────────
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();

    const blockPaste = (e) => {
      e.preventDefault();
      e.stopPropagation();
      recordViolation("Paste detected — pasting is not allowed during a contest.");
    };
    document.addEventListener("paste", blockPaste, true);

    const handleVisibility = () => {
      if (document.hidden && isContestActiveRef.current) {
        recordViolation("Tab switch or window blur detected — you must stay on this page.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const handleWindowBlur = () => {
      if (isContestActiveRef.current) recordViolation("Tab switch or window blur detected — you must stay on this page.");
    };
    window.addEventListener("blur", handleWindowBlur);

    const blockKeys = (e) => {
      if (
        (e.ctrlKey && ["t", "w", "Tab"].includes(e.key)) ||
        (e.altKey && e.key === "Tab") ||
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", blockKeys, true);

    const handleBeforeUnload = (e) => {
      if (isContestActiveRef.current) {
        e.preventDefault();
        e.returnValue = "You are in an active contest. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement || !!document.webkitFullscreenElement;
      if (!isFull && isContestActiveRef.current) {
        recordViolation("Fullscreen exit detected — you must remain in fullscreen during the contest.");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

    const blockDragDrop = (e) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("dragstart", blockDragDrop, true);
    document.addEventListener("dragover", blockDragDrop, true);
    document.addEventListener("drop", blockDragDrop, true);

    return () => {
      document.removeEventListener("paste", blockPaste, true);
      document.removeEventListener("dragstart", blockDragDrop, true);
      document.removeEventListener("dragover", blockDragDrop, true);
      document.removeEventListener("drop", blockDragDrop, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("keydown", blockKeys, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [recordViolation]);

  // Camera — only when the contest requires webcam proctoring
  useEffect(() => {
    if (!contest?.enable_webcam_proctoring) return;
    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        cameraStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraActive(true);
      } catch (err) {
        console.warn("Camera access denied or unavailable:", err);
      }
    }
    initCamera();
    return () => {
      if (cameraStreamRef.current) cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [contest?.enable_webcam_proctoring]);

  const captureSnapshot = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        if (dataUrl && dataUrl.length > 100) {
          snapshotsTakenRef.current += 1;
          await fetch(`/api/student/contests/${contestId}/snapshot/`, { method: "POST", ...buildJsonPostOptions({ image: dataUrl }) });
        }
      }
    } catch (err) {
      console.warn("Failed to capture snapshot:", err);
    }
  }, [contestId]);

  useEffect(() => {
    if (cameraActive && snapshotsTakenRef.current < 2) {
      const t = setTimeout(captureSnapshot, 2500);
      return () => clearTimeout(t);
    }
  }, [activeTab, cameraActive, captureSnapshot]);

  // Staff-unlock polling while locked
  useEffect(() => {
    if (!isLocked) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/student/contests/${contestId}/session-status/`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.participation && data.participation.is_locked === false) {
            setIsLocked(false);
            setLockReason("");
            violationCountRef.current = 0;
            violationLockRef.current = false;
            setViolationModal(null);
            isContestActiveRef.current = true;
            showToast("🔓 Staff unlocked your contest session! Resuming workspace...", "success");
          }
        }
      } catch (err) {
        console.warn("Session status check error:", err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [contestId, isLocked]);

  // Fetch contest data
  useEffect(() => {
    async function fetchContestData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/student/contests/${contestId}/`, { credentials: "include" });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || "Failed to load contest");
        }
        const data = await response.json();
        setContest(data);
        setProblems(data.problems || []);
        setAptitudeQuestions(data.aptitude_questions || []);

        const initialAnswers = {};
        (data.aptitude_questions || []).forEach((q) => {
          if (q.student_answer) initialAnswers[q.id] = q.student_answer;
        });
        setAnswers(initialAnswers);

        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    fetchContestData();
  }, [contestId]);

  // Shared timer
  useEffect(() => {
    if (!contest?.participation?.session_end_time) return;
    const sessionEnd = new Date(contest.participation.session_end_time).getTime();

    function tick() {
      const remaining = Math.max(0, Math.floor((sessionEnd - Date.now()) / 1000));
      setContestSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        if (!autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          isContestActiveRef.current = false;
          fetch(`/api/student/contests/${contestId}/auto-submit/`, { method: "POST", ...buildJsonPostOptions({}) })
            .catch((err) => console.error("Auto-submit error:", err));
          showToast("⏰ Time is up! Your contest has been submitted automatically.", "warning");
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

  // Fetch coding problem detail when selection changes
  useEffect(() => {
    if (!selectedProblem) {
      setSelectedProblemDetails(null);
      return;
    }
    async function fetchProblemDetails() {
      try {
        const response = await fetch(`/api/student/contests/${contestId}/problems/${selectedProblem.slug}/`, { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setSelectedProblemDetails(data);
        }
      } catch (err) {
        console.error("Error fetching problem details:", err);
      }
    }
    fetchProblemDetails();
    setCode("");
  }, [contestId, selectedProblem]);

  const editorLanguage = editorLanguageByChoice[selectedLanguage] || "cpp";

  const handleRunCode = useCallback(async () => {
    if (!selectedProblem || !code.trim()) {
      setOutputLog("Please write some code first.");
      return;
    }
    setExecutionBusy(true);
    setElapsedTime(0);
    setExecutionPhase("running");
    setOutputLog("Running your code...");
    clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => setElapsedTime(Math.floor((Date.now() - start) / 1000)), 500);

    try {
      const result = await runCodeExecution({
        sourceCode: code, language: selectedLanguage, stdin: "", problemSlug: selectedProblem.slug, isSubmit: false,
      });
      setOutputLog(result.output || "No output");
    } catch (err) {
      setOutputLog(`Error: ${err.message}`);
    } finally {
      clearInterval(timerRef.current);
      setExecutionBusy(false);
      setExecutionPhase("idle");
    }
  }, [selectedProblem, code, selectedLanguage]);

  const handleSubmitCode = useCallback(async () => {
    if (!selectedProblem || !code.trim()) {
      setOutputLog("Please write some code first.");
      return;
    }
    setExecutionBusy(true);
    setElapsedTime(0);
    setExecutionPhase("compiling");
    setOutputLog("Submitting your solution...");
    clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setElapsedTime(elapsed);
      if (elapsed >= 3) setExecutionPhase("running");
    }, 500);

    try {
      const languageId = getLanguageIdForChoice(selectedLanguage);
      const response = await fetch(`/api/student/contests/${contestId}/problems/${selectedProblem.slug}/submit/`, {
        method: "POST",
        ...buildJsonPostOptions({ source_code: code, language: selectedLanguage, language_id: languageId }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Submission failed");
      }
      const result = await response.json();
      const sub = result.submission || result;

      const lines = [];
      if (sub.status === "Accepted") {
        lines.push(`✅ Accepted — All ${sub.total_cases} test case(s) passed!`);
      } else {
        lines.push(`❌ ${sub.status || "Wrong Answer"} — ${sub.passed_cases}/${sub.total_cases} test case(s) passed`);
      }
      setOutputLog(lines.join("\n"));

      const updated = [...problems];
      updated[selectedProblemIndex] = {
        ...updated[selectedProblemIndex],
        attempted: true,
        is_solved: updated[selectedProblemIndex].is_solved || sub.status === "Accepted",
      };
      setProblems(updated);
      showToast(
        sub.status === "Accepted" ? "🎉 Problem accepted!" : `Submitted: ${sub.status || "Wrong Answer"}`,
        sub.status === "Accepted" ? "success" : "error"
      );
    } catch (err) {
      setOutputLog(`Submission error: ${err.message}`);
    } finally {
      clearInterval(timerRef.current);
      setExecutionBusy(false);
      setExecutionPhase("idle");
    }
  }, [contestId, selectedProblem, code, selectedLanguage, problems, selectedProblemIndex]);

  // Aptitude / Reading answer submit — same endpoint for both, since reading
  // questions are just AptitudeQuestion rows with question_type "RC"
  const handleAnswerSelect = useCallback(async (questionId, option) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    try {
      await fetch(`/api/student/contests/${contestId}/aptitude/submit/`, {
        method: "POST",
        ...buildJsonPostOptions({ question_id: questionId, selected_option: option, time_taken: 0 }),
      });
    } catch (err) {
      console.error("Error saving answer:", err);
    }
  }, [contestId]);

  // Build a per-section pending/attempted/solved breakdown shown before final submission
  const buildSubmitSummary = useCallback(() => {
    const lines = [];
    if (problems.length) {
      const solved = problems.filter((p) => p.is_solved).length;
      const notAttempted = problems.filter((p) => !p.attempted).length;
      lines.push(`Coding: ${solved}/${problems.length} solved${notAttempted ? `, ${notAttempted} not attempted` : ""}`);
    }
    if (mcqQuestions.length) {
      const answered = mcqQuestions.filter((q) => answers[q.id] !== undefined).length;
      lines.push(`Aptitude: ${answered}/${mcqQuestions.length} answered`);
    }
    if (readingQuestions.length) {
      const answered = readingQuestions.filter((q) => answers[q.id] !== undefined).length;
      lines.push(`Reading: ${answered}/${readingQuestions.length} answered`);
    }
    return lines.join("\n") || "No questions in this contest.";
  }, [problems, mcqQuestions, readingQuestions, answers]);

  const submitContest = useCallback(async (successMessage) => {
    try {
      const response = await fetch(`/api/student/contests/${contestId}/stop/`, { method: "POST", ...buildJsonPostOptions({}) });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to submit contest");
      }
      isContestActiveRef.current = false;
      showToast(successMessage, "success");
      setTimeout(() => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        onBack();
      }, 2500);
    } catch (err) {
      showToast(`Failed to submit contest: ${err.message}`, "error");
    }
  }, [contestId, onBack]);

  const handleFinishContest = useCallback(() => {
    askDouble(
      () => submitContest("🎉 Contest submitted successfully! Redirecting..."),
      buildSubmitSummary(),
      "This action cannot be undone. Your attempt will be submitted for final evaluation exactly as it stands now."
    );
  }, [submitContest, buildSubmitSummary]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading contest...</div>;
  if (error) return <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>Error: {error}</div>;

  if (isLocked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
        <div style={{ background: "white", borderRadius: 20, padding: 40, maxWidth: 480, textAlign: "center" }}>
          <AlertCircle size={48} color="#dc2626" style={{ marginBottom: 16 }} />
          <h2 style={{ margin: "0 0 8px" }}>Session Locked</h2>
          <p style={{ color: "#64748b" }}>{lockReason || "Your session is locked by staff."}</p>
        </div>
      </div>
    );
  }

  const violationCount = violationCountRef.current;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
      <Watermark registerNumber={registerNumber} />
      {contest?.enable_webcam_proctoring && (
        <>
          <video ref={videoRef} autoPlay muted playsInline style={{ position: "fixed", bottom: 10, right: 10, width: 120, borderRadius: 8, zIndex: 500, opacity: 0.01, pointerEvents: "none" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </>
      )}

      {/* Header */}
      <header style={{ background: "white", padding: "14px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{contest?.title}</h1>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Combined Contest</p>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 8 }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
                  border: activeTab === t.id ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                  background: activeTab === t.id ? "#eef2ff" : "white",
                  color: activeTab === t.id ? "#4f46e5" : "#475569",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >
                <Icon size={15} /> {t.label} ({t.count})
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {violationCount > 0 && (
            <div style={{ background: violationCount >= MAX_VIOLATIONS ? "#dc2626" : "#f59e0b", color: "white", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {violationCount}/{MAX_VIOLATIONS} Warnings
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>TIME REMAINING</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: contestSecondsLeft !== null && contestSecondsLeft < 300 ? "#ef4444" : "#0f172a" }}>
              {contestSecondsLeft !== null ? formatDuration(contestSecondsLeft) : "--:--"}
            </div>
          </div>
          <button
            type="button"
            onClick={handleFinishContest}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#dc2626", color: "white", fontWeight: 700, cursor: "pointer" }}
          >
            Finish &amp; Submit
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {activeTab === "coding" && (
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, height: "100%" }}>
            <aside style={{ background: "white", borderRadius: 14, border: "1px solid #e2e8f0", padding: 12, overflowY: "auto" }}>
              {problems.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProblemIndex(idx)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6,
                    borderRadius: 8, border: idx === selectedProblemIndex ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                    background: idx === selectedProblemIndex ? "#eef2ff" : "white", cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {p.is_solved && <CheckCircle size={13} color="#16a34a" style={{ marginRight: 6, verticalAlign: -2 }} />}
                    {idx + 1}. {p.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.difficulty}</div>
                </button>
              ))}
            </aside>
            <section style={{ background: "white", borderRadius: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selectedProblem && (
                <>
                  <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selectedProblem.title}</h3>
                      {selectedProblemDetails?.description && (
                        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b", maxWidth: 600 }}>
                          {selectedProblemDetails.description.split("\\n")[0]}
                        </p>
                      )}
                    </div>
                    <select value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      {POPULAR_LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minHeight: 320 }}>
                    <Editor
                      key={`${selectedProblem.id}-${selectedLanguage}`}
                      height="100%"
                      language={editorLanguage}
                      theme="vs-dark"
                      value={code || starterCodeByLanguage[selectedLanguage] || "// Write your solution here"}
                      onChange={(v) => setCode(v ?? "")}
                      onMount={(editor, monacoInstance) => {
                        configureEditorProtection(editor, monacoInstance, allowCopyPasteRef);
                        editor.focus();
                      }}
                      options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true, wordWrap: "on" }}
                    />
                  </div>
                  <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button type="button" onClick={handleRunCode} disabled={executionBusy} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontWeight: 600 }}>
                      {executionBusy && executionPhase === "running" ? `Running… ${elapsedTime}s` : "Run"}
                    </button>
                    <button type="button" onClick={handleSubmitCode} disabled={executionBusy} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#4f46e5", color: "white", cursor: "pointer", fontWeight: 700 }}>
                      {executionBusy ? (executionPhase === "compiling" ? `Compiling… ${elapsedTime}s` : `Executing… ${elapsedTime}s`) : "Submit"}
                    </button>
                  </div>
                  <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", background: "#0f172a", color: "#e2e8f0", fontFamily: "monospace", fontSize: 12, maxHeight: 140, overflowY: "auto", whiteSpace: "pre-wrap" }}>
                    {outputLog}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {activeTab === "aptitude" && (
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            {mcqQuestions.map((q, idx) => (
              <QuestionCard key={q.id} question={q} index={idx} selected={answers[q.id]} onSelect={handleAnswerSelect} />
            ))}
          </div>
        )}

        {activeTab === "reading" && (
          selectedPassage ? (
            <div>
              <button type="button" onClick={() => setSelectedPassageId(null)} style={{ marginBottom: 16, background: "none", border: "none", color: "#4f46e5", fontWeight: 700, cursor: "pointer" }}>
                ← Passages
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
                <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, maxHeight: "70vh", overflowY: "auto" }}>
                  <h3 style={{ marginTop: 0 }}>{selectedPassage.title}</h3>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{selectedPassage.text}</p>
                </div>
                <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
                  {selectedPassage.questions.map((q, idx) => (
                    <QuestionCard key={q.id} question={q} index={idx} selected={answers[q.id]} onSelect={handleAnswerSelect} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {passages.map((p) => {
                const answered = p.questions.filter((q) => answers[q.id] !== undefined).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPassageId(p.id)}
                    style={{ textAlign: "left", background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, cursor: "pointer" }}
                  >
                    <BookOpen size={20} color="#4f46e5" style={{ marginBottom: 8 }} />
                    <h4 style={{ margin: "0 0 6px" }}>{p.title}</h4>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{answered}/{p.questions.length} answered</div>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
      {violationModal && <ViolationModal count={violationModal.count} reason={violationModal.reason} onReEnterFullscreen={dismissViolationModal} />}
      <DoubleConfirmModal
        show={confirmState.show}
        m1={confirmState.m1}
        m2={confirmState.m2}
        firstOk={confirmState.firstOk}
        setFirstOk={(v) => setConfirmState((prev) => ({ ...prev, firstOk: v }))}
        onCancel={() => setConfirmState({ show: false, m1: "", m2: "", onConfirm: null, firstOk: false })}
        onConfirm={() => {
          const fn = confirmState.onConfirm;
          setConfirmState({ show: false, m1: "", m2: "", onConfirm: null, firstOk: false });
          if (fn) fn();
        }}
      />
    </div>
  );
}
