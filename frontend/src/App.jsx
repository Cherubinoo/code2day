import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("React ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', background: '#fef2f2', color: '#991b1b', margin: '40px auto', maxWidth: 800, borderRadius: 16, border: '1px solid #fecaca' }}>
          <h2 style={{ margin: '0 0 12px' }}>Something went wrong loading this view</h2>
          <p style={{ fontFamily: 'monospace', fontSize: 13, background: 'white', padding: 12, borderRadius: 8, textAlign: 'left', overflowX: 'auto' }}>
            {this.state.error?.toString()}
          </p>
          <button 
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, marginTop: 16 }}
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import AdminDashboard from "./components/admin/AdminDashboard";
import InstitutionDetail from "./components/admin/InstitutionDetail";
import HODDashboard from "./components/hod/HODDashboard";
import JADashboard from "./components/ja/JADashboard";
import StaffDashboard from "./components/staff/StaffDashboard";
import TwoStepVerification from "./components/common/TwoStepVerification";
import AuthScreen from "./components/common/AuthScreen";
import MaintenanceScreen from "./components/common/MaintenanceScreen";
import TopBar from "./components/common/TopBar";
import ContestContainer from "./components/student/pages/ContestContainer";
import LabsPage from "./components/student/pages/LabsPage";
import AptitudePage from "./components/student/pages/AptitudePage";
import DiscussPage from "./components/student/pages/DiscussPage";
import ExplorePage from "./components/student/pages/ExplorePage";
import ProblemsPage from "./components/student/pages/ProblemsPage";
import CompanyPage from "./components/student/pages/CompanyPage";
import ProgressPage from "./components/student/pages/ProgressPage";
import RoadmapsPage from "./components/student/pages/RoadmapsPage";
import DevelopersProfile from "./components/common/DevelopersProfile";
import Footer from "./components/common/Footer";
import ClickBurstEffect from "./components/common/ClickBurstEffect";
import LoadingScreen from "./components/common/LoadingScreen";
import NotFoundPage from "./components/common/NotFoundPage";
import OfflineOverlay from "./components/common/OfflineOverlay";
import SuccessAnimation from "./components/common/SuccessAnimation";
import TargetCursor from "./components/common/TargetCursor";
import "./layout-fix.css";
import "./header-fix.css";
import {
  authStorageKey,
  conceptOptions,
  contestCards,
  difficultyOrder,
  editorLanguageByChoice,
  fallbackDashboard,
  fallbackProblems,
  featuredPaths,
  languageOptions,
  navItems,
  progressSections,
  resultCards,
  roleTracks,
  starterCodeByLanguage,
} from "./lib/appData";
import { runCodeExecution, editorLanguageMap } from "./lib/codeExecution";
import {
  buildJsonPostOptions,
  clearCsrfToken,
  refreshCsrfToken,
  estimateComplexity,
  extractApiError,
  safeParseJson,
  normalizeProblems,
} from "./lib/appUtils";
import { useHistoryNav } from "./lib/useHistoryNav";

function App() {
  const [activePage, navigate] = useHistoryNav(() => {
    // useHistoryNav reads from the URL path first; only fallback to explore
    return "explore";
  });
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  // Gates the branded boot animation — shown once on first entry, never
  // replayed on later in-app navigation (see the render below).
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [problemSet, setProblemSet] = useState(normalizeProblems(fallbackProblems));
  const [selectedDifficulty, setSelectedDifficulty] = useState("All Levels");
  const [selectedConcept, setSelectedConcept] = useState("All Concepts");
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return window.localStorage.getItem("code2day-language") || "Python";
  });
  const [selectedProblemSlug, setSelectedProblemSlug] = useState("");
  const [problemDetailTab, setProblemDetailTab] = useState("current");
  const [code, setCode] = useState(() => {
    const savedCode = window.localStorage.getItem("code2day-code");
    const savedLang = window.localStorage.getItem("code2day-language") || "Python";
    // Return saved code if exists, otherwise use starter code for saved language
    return savedCode || starterCodeByLanguage[savedLang] || starterCodeByLanguage.Python;
  });
  const [problemStartTime, setProblemStartTime] = useState(() => {
    const saved = window.localStorage.getItem("code2day-problem-start");
    return saved ? parseInt(saved, 10) : null;
  });
  const [registerNumber, setRegisterNumber] = useState(
    () => window.localStorage.getItem(authStorageKey) ?? "",
  );
  const [password, setPassword] = useState("");
  const [loginType, setLoginType] = useState("student"); // "student" or "staff"
  const [authMode, setAuthMode] = useState("identify");
  const [authStudent, setAuthStudent] = useState(null);
  const [userType, setUserType] = useState(() => {
    return window.localStorage.getItem("code2day-user-type") || null;
  });
  const [activeRegisterNumber, setActiveRegisterNumber] = useState(
    () => window.localStorage.getItem(authStorageKey) ?? "",
  );
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [studentMatches, setStudentMatches] = useState([]);
  const [staffMatches, setStaffMatches] = useState([]);
  // Holds the successful login payload for JA until 2-step verification passes
  const [pendingJaLogin, setPendingJaLogin] = useState(null);
  const [outputLog, setOutputLog] = useState(
    "Output panel ready. Run the code to see sample execution results here.",
  );
  const [executionInput, setExecutionInput] = useState("");
  const [executionMeta, setExecutionMeta] = useState({
    status: "Idle",
    time: "",
    memory: "",
  });
  const [executionBusy, setExecutionBusy] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [executionElapsed, setExecutionElapsed] = useState(0);
  const executionTimerRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => () => clearInterval(executionTimerRef.current), []);

  function startExecutionTimer() {
    setExecutionElapsed(0);
    clearInterval(executionTimerRef.current);
    const start = Date.now();
    executionTimerRef.current = setInterval(() => {
      setExecutionElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
  }

  function stopExecutionTimer() {
    clearInterval(executionTimerRef.current);
  }

  useEffect(() => {
    if (selectedProblemSlug) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [selectedProblemSlug]);
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = window.localStorage.getItem("code2day-expanded-sections");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing expanded sections:", e);
      }
    }
    return { "batch-1": true, completed: false };
  });
  const [sessionMode, setSessionMode] = useState("practice");
  const [activeContestId, setActiveContestId] = useState("");
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [problemSecondsElapsed, setProblemSecondsElapsed] = useState(0);
  const [sessionSecondsElapsed, setSessionSecondsElapsed] = useState(0);
  const [contestHistory, setContestHistory] = useState([]);
  const [realContestData, setRealContestData] = useState([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(
    () => window.localStorage.getItem("code2day-institution-id") || null,
  );

  const [targetContestId, setTargetContestId] = useState(null);
  const [isInsideWorkspace, setIsInsideWorkspace] = useState(false);
  const isLoggedIn = Boolean(activeRegisterNumber);

  // Initialize CSRF token on app startup
  useEffect(() => {
    async function initializeCsrfToken() {
      try {
        await refreshCsrfToken();
      } catch (error) {
        console.warn('Failed to initialize CSRF token:', error);
      }
    }
    initializeCsrfToken();
  }, []);

  function resetStudentSession() {
    window.localStorage.removeItem(authStorageKey);
    window.localStorage.removeItem("code2day-user-type");
    window.localStorage.removeItem("code2day-institution-id");
    window.localStorage.removeItem("code2day-active-page"); // clean up legacy key if present
    setActiveRegisterNumber("");
    setRegisterNumber("");
    setPassword("");
    setAuthStudent(null);
    setUserType(null);
    setSelectedInstitutionId(null);
    setAuthMode("identify");
    setAuthError("");
    setAuthMessage("");
    setDashboard(fallbackDashboard);
    setProblemSet(normalizeProblems(fallbackProblems));
    setSelectedDifficulty("All Levels");
    setSelectedConcept("All Concepts");
    setSelectedLanguage("Python");
    setSelectedProblemSlug("");
    setProblemDetailTab("current");
    setCode(starterCodeByLanguage.Python);
    setOutputLog("Output panel ready. Run the code to see sample execution results here.");
    setExecutionInput("");
    setExecutionMeta({ status: "Idle", time: "", memory: "" });
    setExecutionBusy(false);
    setSessionMode("practice");
    setActiveContestId("");
    setContestSecondsLeft(null);
    setProblemSecondsElapsed(0);
    setSessionSecondsElapsed(0);
    setContestHistory([]);
    setSelectedRoadmapId("");
    navigate("explore", { replace: true });
  }

  useEffect(() => {
    if (!activeRegisterNumber) {
      return undefined;
    }

    let isMounted = true;

    async function loadDashboard() {
      try {
        const response = await fetch("/api/dashboard/", {
          credentials: "include",
        });
        if (response.status === 401) {
          if (isMounted) {
            resetStudentSession();
          }
          return;
        }

        // Account blocked mid-session — force logout and show message
        if (response.status === 403) {
          if (isMounted) {
            const data = await response.json().catch(() => ({}));
            const msg = data.detail || 'Your account has been blocked. Contact your department staff.';
            resetStudentSession();
            setAuthMessage(msg);
          }
          return;
        }

        // Maintenance Mode — show full screen
        if (response.status === 503) {
          if (isMounted) {
            const data = await response.json().catch(() => ({}));
            const msg = data.message || data.detail || 'System is under maintenance. Please try again later.';
            setMaintenanceMessage(msg);
            setMaintenanceMode(true);
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Dashboard request failed");
        }

        const payload = await response.json();
        if (isMounted) {
          setDashboard(payload);
          if (payload.user?.registerNumber) {
            window.localStorage.setItem(authStorageKey, payload.user.registerNumber);
            setActiveRegisterNumber(payload.user.registerNumber);
          }
          if (payload.editor?.starter_code) {
            setCode(payload.editor.starter_code);
          }
        }
      } catch (error) {
        console.error("Using fallback dashboard data", error);
        if (isMounted) {
          setDashboard(fallbackDashboard);
        }
      }
    }

    async function loadRealContestData() {
      try {
        const response = await fetch("/api/student/contests/", {
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            setRealContestData(data.contests || []);
          }
        }
      } catch (error) {
        console.error("Failed to load contest data:", error);
        if (isMounted) {
          setRealContestData([]);
        }
      }
    }

    if (isLoggedIn) {
      loadDashboard();
      if (userType === "student") {
        loadRealContestData();
      }
    }

    return () => {
      isMounted = false;
    };
  }, [activeRegisterNumber, userType]);

  useEffect(() => {
    let isMounted = true;

    async function loadProblems() {
      try {
        const response = await fetch("/api/problems/", {
          credentials: "include",
        });

        if (response.status === 401 && isLoggedIn) {
          if (isMounted) {
            resetStudentSession();
          }
          return;
        }

        if (response.ok) {
          const payload = await response.json();
          if (isMounted && Array.isArray(payload) && payload.length > 0) {
            setProblemSet(normalizeProblems(payload));
            return;
          }
        }
      } catch (error) {
        console.error("Using fallback problem data", error);
      }

      if (isMounted) {
        setProblemSet(normalizeProblems(fallbackProblems));
      }
    }

    loadProblems();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, userType]);

  useEffect(() => {
    if (!selectedProblemSlug) {
      return undefined;
    }

    const existingProblem = problemSet.find((problem) => problem.slug === selectedProblemSlug);
    if (existingProblem?.examples?.length > 0 || existingProblem?.editorial) {
      return undefined;
    }

    let isMounted = true;

    async function loadProblemDetail() {
      try {
        const response = await fetch(`/api/problems/${encodeURIComponent(selectedProblemSlug)}/`, {
          credentials: "include",
        });
        if (response.status === 401) {
          if (isMounted) {
            resetStudentSession();
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Problem detail request failed");
        }

        const payload = await response.json();
        if (!isMounted) {
          return;
        }

        setProblemSet((current) =>
          current.map((problem) =>
            problem.slug === selectedProblemSlug
              ? {
                  ...problem,
                  ...normalizeProblems([payload])[0],
                }
              : problem,
          ),
        );
      } catch (error) {
        console.error("Could not load problem detail", error);
      }
    }

    loadProblemDetail();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, problemSet, selectedProblemSlug, userType]);

  useEffect(() => {
    if (isLoggedIn || registerNumber.trim().length < 2) {
      setStudentMatches([]);
      return undefined;
    }

    let isMounted = true;

    async function loadRegisterNumbers() {
      try {
        const response = await fetch(
          `/api/auth/register-numbers/?q=${encodeURIComponent(registerNumber.trim())}`,
          {
            credentials: "include",
          },
        );
        if (!response.ok) {
          throw new Error("Register number list request failed");
        }

        const payload = await response.json();
        if (isMounted) {
          setStudentMatches(payload);
        }
      } catch (error) {
        console.error("Could not load register number suggestions", error);
      }
    }

    loadRegisterNumbers();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, registerNumber]);

  const activeContest = useMemo(() => {
    return contestCards.find((contest) => contest.id === activeContestId) ?? null;
  }, [activeContestId]);

  const baseProblemPool = useMemo(() => {
    if (sessionMode === "contest" && activeContest) {
      return problemSet.filter((problem) => activeContest.problems.includes(problem.slug));
    }
    return problemSet;
  }, [activeContest, problemSet, sessionMode]);

  const filteredProblemSet = useMemo(() => {
    return baseProblemPool.filter((problem) => {
      const matchesDifficulty =
        selectedDifficulty === "All Levels" || problem.difficulty === selectedDifficulty;
      const matchesTag =
        selectedConcept === "All Concepts" || (problem.tags ?? []).includes(selectedConcept);
      return matchesDifficulty && matchesTag;
    });
  }, [baseProblemPool, selectedConcept, selectedDifficulty]);

  const conceptCounts = useMemo(() => {
    return conceptOptions.reduce(
      (counts, concept) => {
        if (concept === "All Concepts") {
          counts[concept] = baseProblemPool.length;
        } else {
          counts[concept] = baseProblemPool.filter((problem) =>
            (problem.tags ?? []).includes(concept),
          ).length;
        }
        return counts;
      },
      {},
    );
  }, [baseProblemPool]);

  // Extract unique tags from problems for dynamic topic filters
  const dynamicTags = useMemo(() => {
    const allTags = new Set();
    baseProblemPool.forEach((problem) => {
      (problem.tags ?? []).forEach((tag) => allTags.add(tag));
    });
    return ["All Concepts", ...Array.from(allTags).sort()];
  }, [baseProblemPool]);

  const tagCounts = useMemo(() => {
    const counts = { "All Concepts": baseProblemPool.length };
    dynamicTags.slice(1).forEach((tag) => {
      counts[tag] = baseProblemPool.filter((problem) =>
        (problem.tags ?? []).includes(tag),
      ).length;
    });
    return counts;
  }, [baseProblemPool, dynamicTags]);


  // Ref to track initial load - prevents overwriting saved code on refresh
  const isInitialLoad = useRef(true);
  const hasRestoredCode = useRef(false);
  const userChangedLanguage = useRef(false);

  useEffect(() => {
    // On initial load only: restore saved code
    if (isInitialLoad.current) {
      const savedCode = window.localStorage.getItem("code2day-code");
      const savedSlug = window.localStorage.getItem("code2day-problem-slug");
      
      if (savedSlug && savedCode) {
        // Restore saved code instead of starter code
        setCode(savedCode);
        hasRestoredCode.current = true;
      }
      // Mark initial load as done
      isInitialLoad.current = false;
    }
  }, []);

  // Tracks the (problem, language) pair the editor's code has already been
  // resolved for, so a problemSet update for an unrelated reason doesn't
  // clobber the student's in-progress edits.
  const codeResolvedForRef = useRef("");

  // Dirty-tracking for the race this fixes: problem detail (which carries
  // last_solutions) loads asynchronously, so if the student starts typing
  // before it arrives, the effect below used to re-run on the next
  // problemSet update and silently overwrite their in-progress edit with
  // starter/old code — the editor would look like it "reset itself" mid-type.
  // activeCodeKeyRef tracks which (problem, language) userEditedCodeRef
  // applies to; lastProgrammaticCodeRef lets the editor's onChange tell a
  // genuine keystroke apart from the echo of our own setCode(...) calls.
  const activeCodeKeyRef = useRef("");
  const userEditedCodeRef = useRef(false);
  const lastProgrammaticCodeRef = useRef(null);

  const handleEditorCodeChange = useCallback((value) => {
    const next = value ?? "";
    if (next !== lastProgrammaticCodeRef.current) {
      userEditedCodeRef.current = true;
    }
    setCode(next);
  }, [setCode]);

  // On opening a problem or switching language: restore the student's own
  // last-submitted code for that exact (problem, language) if the backend
  // has one, otherwise fall back to starter code. Problem detail (which
  // carries last_solutions) loads asynchronously, so this re-runs as
  // problemSet updates until detail has actually arrived — but never once
  // the student has actually typed something for this (problem, language).
  useEffect(() => {
    // Skip on initial mount and on localStorage-based code restore
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (hasRestoredCode.current) {
      hasRestoredCode.current = false;
      return;
    }
    if (!selectedProblemSlug) return;

    const key = `${selectedProblemSlug}::${selectedLanguage}`;
    if (activeCodeKeyRef.current !== key) {
      // Genuinely a new problem/language, not just a re-run of this effect
      // while waiting on detail to load — reset dirty tracking for it.
      activeCodeKeyRef.current = key;
      userEditedCodeRef.current = false;
    }
    if (codeResolvedForRef.current === key) return;
    if (userEditedCodeRef.current) return;

    const currentProblemData = problemSet.find((p) => p.slug === selectedProblemSlug);
    const lastSolution = currentProblemData?.last_solutions?.[selectedLanguage];

    // Mark that user changed language to prevent auto-reset
    userChangedLanguage.current = true;

    if (lastSolution?.source_code) {
      lastProgrammaticCodeRef.current = lastSolution.source_code;
      setCode(lastSolution.source_code);
      codeResolvedForRef.current = key;
    } else {
      const currentStarter = starterCodeByLanguage[selectedLanguage];
      const nextCode = currentStarter ?? starterCodeByLanguage.Python;
      lastProgrammaticCodeRef.current = nextCode;
      setCode(nextCode);
      // Detail (last_solutions) hasn't loaded yet for this problem — leave
      // unresolved so this effect re-checks once problemSet updates.
      if (currentProblemData?.last_solutions) {
        codeResolvedForRef.current = key;
      }
    }
  }, [selectedLanguage, selectedProblemSlug, problemSet]);

  useEffect(() => {
    setExecutionMeta({ status: "Idle", time: "", memory: "" });
    setOutputLog("Output panel ready. Run the code to see sample execution results here.");
  }, [selectedProblemSlug, selectedLanguage]);

  // Tracks the problem actually on screen, read inside async run/submit
  // continuations so a slow response for a problem the user has since
  // navigated away from can't overwrite the next problem's console.
  const selectedProblemSlugRef = useRef(selectedProblemSlug);
  useEffect(() => {
    selectedProblemSlugRef.current = selectedProblemSlug;
  }, [selectedProblemSlug]);

  // Session Timer - Tracks total time in the problems section
  useEffect(() => {
    if (activePage !== "problems") {
      setSessionSecondsElapsed(0);
      return undefined;
    }
    
    const timer = window.setInterval(() => {
      setSessionSecondsElapsed((current) => current + 1);
    }, 1000);
    
    return () => window.clearInterval(timer);
  }, [activePage]);

  // Problem Timer - Resets when problem changes
  useEffect(() => {
    if (activePage !== "problems" || !selectedProblemSlug) {
      setProblemSecondsElapsed(0);
      return undefined;
    }

    setProblemSecondsElapsed(0);
    const timer = window.setInterval(() => {
      setProblemSecondsElapsed((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activePage, selectedProblemSlug]);

  useEffect(() => {
    if (activePage !== "problems" || sessionMode !== "contest" || contestSecondsLeft == null) {
      return undefined;
    }

    if (contestSecondsLeft <= 0) {
      const solvedCount = problemSet.filter(
        (problem) =>
          activeContest?.problems.includes(problem.slug) &&
          problem.progress_state === "completed",
      ).length;

      setContestHistory((current) => [
        {
          id: activeContest?.id ?? `contest-${Date.now()}`,
          name: activeContest?.name ?? "Contest",
          solved: solvedCount,
          total: activeContest?.problems.length ?? 0,
          durationMinutes: activeContest?.durationMinutes ?? 0,
          finishedLabel: "Completed just now",
        },
        ...current,
      ]);
      setSessionMode("practice");
      setActiveContestId("");
      setContestSecondsLeft(null);
      navigate("progress");
      return undefined;
    }

    const timer = window.setInterval(() => {
      setContestSecondsLeft((current) => (current == null ? null : Math.max(current - 1, 0)));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeContest, activePage, contestSecondsLeft, problemSet, sessionMode]);


  // NOTE: activePage is synced via useHistoryNav (URL), not localStorage.
  // Removed localStorage save to prevent stale page on next visit causing blank screen.

  // Save code to localStorage whenever it changes
  useEffect(() => {
    if (code) {
      window.localStorage.setItem("code2day-code", code);
    }
  }, [code]);

  // Save problem slug to localStorage when it changes
  useEffect(() => {
    window.localStorage.removeItem("code2day-problem-slug");
  }, []);

  // Save selected language to localStorage when it changes
  useEffect(() => {
    window.localStorage.setItem("code2day-language", selectedLanguage);
  }, [selectedLanguage]);

  const selectedProblem = useMemo(() => {
    if (activePage === "sql-shell") {
      return {
        title: "Interactive SQL Shell",
        slug: "sql-shell",
        description: "## SQL Playground\nUse this interactive shell to run PostgreSQL queries. You can explore table structures using the **Schema** tab or try complex joins and aggregations here.",
        difficulty: "Practice",
        tags: ["SQL", "Shell"],
        available_languages: ["SQL"],
        schema_description: "## Database Schema\nTables available for practice: \n- `problems`\n- `submissions`\n- `users`\n\nRun `SELECT * FROM problems LIMIT 5;` to start exploring."
      };
    }
    if (!selectedProblemSlug) {
      return null;
    }
    return problemSet.find((problem) => problem.slug === selectedProblemSlug) ?? null;
  }, [problemSet, selectedProblemSlug, activePage]);

  const activityCalendar = dashboard.activityCalendar ?? fallbackDashboard.activityCalendar;
  const filteredPreviewProblems = filteredProblemSet.slice(0, 5);
  const complexityInsight = useMemo(
    () => estimateComplexity(code, selectedLanguage),
    [code, selectedLanguage],
  );
  const totalSolved = dashboard.stats.easy + dashboard.stats.medium + dashboard.stats.hard;
  async function handleLookup(event) {
    event.preventDefault();
    if (!registerNumber.trim()) {
      setAuthError(loginType === "staff" ? "Enter your Faculty ID to continue." : "Enter your register number to continue.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      // Use unified lookup endpoint
      const response = await fetch(
        `/api/auth/lookup/?user_id=${encodeURIComponent(registerNumber.trim())}`,
        {
          credentials: "include",
        },
      );
      const payload = await safeParseJson(response, "User lookup failed.");

      if (!response.ok) {
        if (response.status === 503) {
          setMaintenanceMessage(payload.message || payload.detail || "System is under maintenance.");
          setMaintenanceMode(true);
          return;
        }
        throw new Error(extractApiError(payload, "User lookup failed."));
      }

      console.log("Lookup response:", payload);
      console.log("User type detected:", payload.user_type);

      // If user type doesn't match the selected tab, auto-switch instead of erroring
      if (loginType === "student" && payload.user_type !== "student") {
        // Auto-switch to Staff Login tab and continue
        setLoginType("staff");
      }
      if (loginType === "staff" && payload.user_type === "student") {
        // Auto-switch to Student Login tab and continue
        setLoginType("student");
      }

      setAuthStudent({
        ...payload.user,
        user_type: payload.user_type,
      });
      console.log("AuthStudent set with user_type:", payload.user_type);
      setStudentMatches([]);
      setStaffMatches([]);
      setAuthMode(payload.first_login_required ? "first-login" : "login");
      setAuthMessage(
        payload.first_login_required
          ? "First login detected. Create your password to unlock the workspace."
          : "User found. Enter your password to continue.",
      );
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (!password.trim()) {
      setAuthError("Enter a password to continue.");
      return;
    }

    // Determine endpoint based on user type
    const isFirstLogin = authMode === "first-login";
    let endpoint;
    let requestBody;
    
    if (authStudent?.user_type === "admin") {
      endpoint = isFirstLogin ? "/api/auth/admin/first-login/" : "/api/auth/admin/login/";
      requestBody = {
        admin_id: registerNumber.trim(),
        password,
      };
    } else if (authStudent?.user_type === "staff" || authStudent?.user_type === "hod" || authStudent?.user_type === "director" || authStudent?.user_type === "tpu" || authStudent?.user_type === "ja") {
      endpoint = isFirstLogin ? "/api/auth/staff/first-login/" : "/api/auth/staff/login/";
      requestBody = {
        faculty_id: registerNumber.trim(),
        password,
      };
    } else {
      endpoint = isFirstLogin ? "/api/auth/first-login/" : "/api/auth/login/";
      requestBody = {
        register_number: registerNumber.trim(),
        password,
      };
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(endpoint, {
        ...buildJsonPostOptions(requestBody),
      });
      const payload = await safeParseJson(response, "Authentication failed.");

      if (!response.ok) {
        if (response.status === 503) {
          setMaintenanceMessage(payload.message || payload.detail || "System is under maintenance.");
          setMaintenanceMode(true);
          return;
        }
        throw new Error(extractApiError(payload, "Authentication failed."));
      }

      // Determine user type from response - prioritize user_type field, then check keys
      let type = payload.user_type || (payload.admin ? "admin" : payload.hod ? "hod" : payload.staff ? "staff" : "student");
      console.log("Login response payload:", payload);
      console.log("Login response - user type:", type, "admin:", !!payload.admin, "hod:", !!payload.hod, "staff:", !!payload.staff);

      // JA requires 2-step verification before completing login
      if (type === "ja") {
        setPendingJaLogin({ payload, type, registerNumberValue: registerNumber.trim() });
        setAuthBusy(false);
        return;
      }

      window.localStorage.setItem(authStorageKey, registerNumber.trim());
      window.localStorage.setItem("code2day-user-type", type);
      setUserType(type);
      // Store institution_id for staff/hod
      if (payload.institution_id) {
        setSelectedInstitutionId(payload.institution_id);
        window.localStorage.setItem("code2day-institution-id", payload.institution_id);
      }
      // Preserve user_type in authStudent by spreading existing authStudent first
      setAuthStudent({
        ...authStudent,
        ...(payload.student || payload.staff || payload.hod || payload.admin),
        user_type: type,
        institution_id: payload.institution_id,
      });
      setActiveRegisterNumber(registerNumber.trim());
      setPassword("");
      setAuthMessage(payload.detail);
      
      // Refresh CSRF token after successful login
      await refreshCsrfToken();
      
      // Navigate to role-specific dashboard
      const targetPage = type === "admin" ? "admin" :
                         (type === "director" || type === "tpu") ? "hod" :
                         type === "ja" ? "ja" :
                         type === "hod" ? "hod" :
                         type === "staff" ? "staff" : "explore";
      navigate(targetPage, { replace: true });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  // Called after JA passes 2-step verification
  function completeJaLogin() {
    if (!pendingJaLogin) return;
    const { payload, type, registerNumberValue } = pendingJaLogin;
    setPendingJaLogin(null);
    window.localStorage.setItem(authStorageKey, registerNumberValue);
    window.localStorage.setItem("code2day-user-type", type);
    setUserType(type);
    if (payload.institution_id) {
      setSelectedInstitutionId(payload.institution_id);
      window.localStorage.setItem("code2day-institution-id", payload.institution_id);
    }
    setAuthStudent(prev => ({
      ...prev,
      ...(payload.staff || {}),
      user_type: type,
      institution_id: payload.institution_id,
    }));
    setActiveRegisterNumber(registerNumberValue);
    setPassword("");
    setAuthMessage(payload.detail || "Login successful.");
    refreshCsrfToken();
    navigate("ja", { replace: true });
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout/", {
        ...buildJsonPostOptions({}),
      });
    } catch (error) {
      console.error("Logout request failed", error);
    } finally {
      // Clear CSRF token when logging out
      clearCsrfToken();
      resetStudentSession();
    }
  }

  function toggleProblemSection(sectionKey) {
    setExpandedSections((current) => {
      const next = {
        ...current,
        [sectionKey]: !current[sectionKey],
      };
      window.localStorage.setItem("code2day-expanded-sections", JSON.stringify(next));
      return next;
    });
  }

  function updateProblemProgress(nextState) {
    if (!selectedProblem) {
      return;
    }
    setProblemSet((current) =>
      current.map((problem) =>
        problem.slug === selectedProblem.slug
          ? {
              ...problem,
              progress_state: nextState,
            }
          : problem,
      ),
    );
  }

  async function persistProblemProgress(progressState) {
    if (!selectedProblem) {
      return false;
    }

    try {
      const response = await fetch(
        "/api/problems/progress/",
        buildJsonPostOptions({
          problem_slug: selectedProblem.slug,
          language: selectedLanguage,
          progress_state: progressState,
        }),
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Could not save problem progress."));
      }

      updateProblemProgress(payload.progress_state ?? progressState);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function applyExecutionResult(result, requestSlug) {
    // Ignore results for a problem the user has already navigated away from.
    if (requestSlug && requestSlug !== selectedProblemSlugRef.current) {
      return;
    }
    setExecutionMeta({
      status: result.status || "Unknown",
      time: result.time ? `${result.time}s` : "",
      memory: result.memory ? `${result.memory} KB` : "",
    });

    let displayOutput = result.output || "Execution finished with no output.";

    // If test case results are present, append a summary
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
      displayOutput = displayOutput + lines.join("");
    }

    setOutputLog(displayOutput);
  }

  async function executeCurrentCode(isSubmit = false) {
    if (!selectedProblem) {
      throw new Error("Select a problem first to start coding.");
    }

    const requestSlug = selectedProblem.slug;
    const result = await runCodeExecution({
      sourceCode: code,
      language: selectedLanguage,
      stdin: executionInput,
      problemSlug: requestSlug,
      isSubmit,
    });
    applyExecutionResult(result, requestSlug);

    // Reflect this submission locally so reopening/switching back to this
    // problem+language shows it immediately, without waiting on a re-fetch.
    if (isSubmit) {
      const passed = result.status === "Accepted";
      setProblemSet((current) =>
        current.map((problem) => {
          if (problem.slug !== requestSlug) return problem;
          const nextSolvedLanguages = passed
            ? [...new Set([...(problem.solved_languages || []), selectedLanguage])]
            : problem.solved_languages || [];
          return {
            ...problem,
            progress_state: passed ? "completed" : (problem.progress_state === "completed" ? "completed" : "open"),
            solved_languages: nextSolvedLanguages,
            current_language: passed ? problem.current_language : selectedLanguage,
            last_solutions: {
              ...(problem.last_solutions || {}),
              [selectedLanguage]: {
                source_code: code,
                status: result.status,
                all_tests_passed: passed,
                submitted_at: new Date().toISOString(),
              },
            },
          };
        }),
      );
    }
    return result;
  }

  async function handleRunCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to start coding.");
      return;
    }

    const requestSlug = selectedProblem.slug;
    const stillCurrent = () => requestSlug === selectedProblemSlugRef.current;

    setExecutionBusy(true);
    startExecutionTimer();
    try {
      const result = await executeCurrentCode(false);
      if (result.status !== "Unsupported Language") {
        // Skip global progress update for daily problems and contests
        if (!selectedProblem?.is_daily && sessionMode !== "contest") {
          const isSaved = await persistProblemProgress("open");
          if (!isSaved && stillCurrent()) {
            setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
          }
        }
      }
    } catch (error) {
      if (stillCurrent()) {
        setExecutionMeta({ status: "Error", time: "", memory: "" });
        setOutputLog(error.message ?? "Execution failed.");
      }
    } finally {
      stopExecutionTimer();
      setExecutionBusy(false);
    }
  }

  async function handleSubmitCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to submit a solution.");
      return;
    }

    const requestSlug = selectedProblem.slug;
    const stillCurrent = () => requestSlug === selectedProblemSlugRef.current;

    setExecutionBusy(true);
    startExecutionTimer();
    try {
      const result = await executeCurrentCode(true);
      if (result.status === "Accepted") {
        if (stillCurrent()) setShowSuccessAnimation(true);
        // Skip global progress update for daily problems and contests
        if (!selectedProblem?.is_daily && sessionMode !== "contest") {
          const isSaved = await persistProblemProgress("completed");
          if (!isSaved && stillCurrent()) {
            setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
          }
        } else if (stillCurrent()) {
          const context = selectedProblem?.is_daily ? "Daily Problem" : "Contest";
          setOutputLog((current) => `${current}\n\n[${context}] Solution accepted! Progress for ${context.toLowerCase()}s is tracked separately.`);
        }
      } else if (result.status !== "Unsupported Language") {
        // Skip global progress update for daily problems and contests
        if (!selectedProblem?.is_daily && sessionMode !== "contest") {
          const isSaved = await persistProblemProgress("open");
          if (!isSaved && stillCurrent()) {
            setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
          }
        }
      }
    } catch (error) {
      if (stillCurrent()) {
        setExecutionMeta({ status: "Error", time: "", memory: "" });
        setOutputLog(error.message ?? "Execution failed.");
      }
    } finally {
      stopExecutionTimer();
      setExecutionBusy(false);
    }
  }

  function handleJoinContest(contest) {
    const firstContestProblem = problemSet.find((problem) => problem.slug === contest.problems[0]);
    const contestLanguage = firstContestProblem?.available_languages?.[0] ?? "Python";

    setSessionMode("contest");
    setActiveContestId(contest.id);
    setContestSecondsLeft(contest.durationMinutes * 60);
    setSelectedDifficulty("All Levels");
    setSelectedConcept("All Concepts");
    setSelectedLanguage(contestLanguage);
    setSelectedProblemSlug(firstContestProblem?.slug ?? "");
    setProblemDetailTab("current");
    setOutputLog(
      firstContestProblem
        ? `Joined ${contest.name}\n\nContest timer started.\nSolve each contest problem before the countdown ends.`
        : `Joined ${contest.name}\n\nNo contest problems are available to solve right now.`,
    );
    navigate("problems");
  }

  function handleNavigateToContest(contestId) {
    setTargetContestId(contestId);
    navigate("contest");
  }

  function handleFinishContest() {
    if (!activeContest) {
      return;
    }

    const solvedCount = problemSet.filter(
      (problem) =>
        activeContest.problems.includes(problem.slug) &&
        problem.progress_state === "completed",
    ).length;

    setContestHistory((current) => [
      {
        id: activeContest.id,
        name: activeContest.name,
        solved: solvedCount,
        total: activeContest.problems.length,
        durationMinutes: activeContest.durationMinutes,
        finishedLabel: "Submitted manually",
      },
      ...current,
    ]);
    setSessionMode("practice");
    setActiveContestId("");
    setContestSecondsLeft(null);
    navigate("progress");
  }


  function handleSelectConcept(nextTag, context = "general") {
    setSelectedConcept(nextTag);
    if (context === "problems" && nextTag !== "All Concepts") {
      setSelectedProblemSlug("");
      setOutputLog("Choose a problem from the filtered list to open the coding workspace.");
    }
  }

  // Unified flat list instead of batches
  const groupedProblems = [
    { 
      key: 'all', 
      label: activePage === "sql-problems" ? "SQL Problems" : "All Problems", 
      items: filteredProblemSet 
    }
  ];

  let activeView = null;

  // Handle views that don't require login or are special
  if (activePage === "not-found") {
    activeView = <NotFoundPage onGoHome={() => navigate("explore", { replace: true })} />;
  } else if (activePage === "developers") {
    activeView = <DevelopersProfile isLoggedIn={isLoggedIn} onBack={() => navigate("explore")} />;
  } else if (!isLoggedIn) {
    activeView = (
      <AuthScreen
        authBusy={authBusy}
        authError={authError}
        authMessage={authMessage}
        authMode={authMode}
        authStudent={authStudent}
        handleLookup={handleLookup}
        handlePasswordSubmit={handlePasswordSubmit}
        loginType={loginType}
        password={password}
        registerNumber={registerNumber}
        setAuthError={setAuthError}
        setAuthMode={setAuthMode}
        setAuthStudent={setAuthStudent}
        setLoginType={setLoginType}
        setPassword={setPassword}
        setRegisterNumber={setRegisterNumber}
        setStaffMatches={setStaffMatches}
        staffMatches={staffMatches}
        setStudentMatches={setStudentMatches}
        studentMatches={studentMatches}
        selectedInstitutionId={selectedInstitutionId}
        setSelectedInstitutionId={setSelectedInstitutionId}
        onNavigate={navigate}
      />
    );
  } else {
    switch (activePage) {
    case "problems":
      activeView = (
        <ProblemsPage
          problemSet={problemSet}
          activeContest={activeContest}
          code={code}
          tagCounts={tagCounts}
          complexityInsight={complexityInsight}
          contestSecondsLeft={contestSecondsLeft}
          dashboard={dashboard}
          handleSelectTag={handleSelectConcept}
          difficultyOrder={difficultyOrder}
          editorLanguage={editorLanguageMap[selectedLanguage] ?? "javascript"}
          executionBusy={executionBusy}
          executionElapsed={executionElapsed}
          executionInput={executionInput}
          executionMeta={executionMeta}
          expandedSections={expandedSections}
          groupedProblems={groupedProblems}
          handleFinishContest={handleFinishContest}
          handleRunCode={handleRunCode}
          handleSubmitCode={handleSubmitCode}
          outputLog={outputLog}
          problemSecondsElapsed={problemSecondsElapsed}
          problemDetailTab={problemDetailTab}
          selectedTag={selectedConcept}
          selectedDifficulty={selectedDifficulty}
          selectedLanguage={selectedLanguage}
          selectedProblem={selectedProblem}
          sessionMode={sessionMode}
          setCode={handleEditorCodeChange}
          setExecutionInput={setExecutionInput}
          setProblemDetailTab={setProblemDetailTab}
          setSelectedDifficulty={setSelectedDifficulty}
          setSelectedLanguage={setSelectedLanguage}
          setSelectedProblemSlug={setSelectedProblemSlug}
          setSidebarOpen={setSidebarOpen}
          sidebarOpen={sidebarOpen}
          toggleProblemSection={toggleProblemSection}
          totalSolved={totalSolved}
          dynamicTags={dynamicTags}
          sessionSecondsElapsed={sessionSecondsElapsed}
          activePage={activePage}
        />
      );
      break;

    case "contest":
      activeView = (
        <ContestContainer
          targetContestId={targetContestId}
          setTargetContestId={setTargetContestId}
          onToggleWorkspace={setIsInsideWorkspace}
        />
      );
      break;
    case "progress":
      // Redirect staff and admin to their dashboards
      if (userType === "staff") {
        navigate("staff", { replace: true });
        break;
      }
      if (userType === "admin") {
        navigate("admin", { replace: true });
        break;
      }
      activeView = (
        <ProgressPage
          contestCards={contestCards}
          contestHistory={realContestData}
          dashboard={dashboard}
          setDashboard={setDashboard}
          handleJoinContest={handleJoinContest}
          onNavigateToContest={handleNavigateToContest}
          resultCards={resultCards}
          problemSet={problemSet}
        />
      );
      break;
    case "roadmaps":
      activeView = (
        <RoadmapsPage
          roleTracks={roleTracks}
          selectedRoadmapId={selectedRoadmapId}
          setActivePage={navigate}
          setSelectedRoadmapId={setSelectedRoadmapId}
        />
      );
      break;
    case "labs":
      activeView = <LabsPage dashboard={dashboard} />;
      break;
    case "aptitude":
      activeView = <AptitudePage onToggleWorkspace={setIsInsideWorkspace} />;
      break;
    case "discuss":
      activeView = (
        <DiscussPage
          userType={userType}
          studentProfile={dashboard?.student}
          staffProfile={dashboard?.staff}
        />
      );
      break;
    case "company":
      if (userType === "staff") {
        navigate("staff", { replace: true });
        break;
      }
      if (userType === "hod") {
        navigate("hod", { replace: true });
        break;
      }
      if (userType === "admin") {
        navigate("admin", { replace: true });
        break;
      }
      activeView = (
        <CompanyPage
          problemSet={problemSet}
          activeContest={activeContest}
          code={code}
          tagCounts={tagCounts}
          complexityInsight={complexityInsight}
          contestSecondsLeft={contestSecondsLeft}
          dashboard={dashboard}
          handleSelectTag={handleSelectConcept}
          difficultyOrder={difficultyOrder}
          editorLanguage={editorLanguageMap[selectedLanguage] ?? "javascript"}
          executionBusy={executionBusy}
          executionElapsed={executionElapsed}
          executionInput={executionInput}
          executionMeta={executionMeta}
          expandedSections={expandedSections}
          handleFinishContest={handleFinishContest}
          handleRunCode={handleRunCode}
          handleSubmitCode={handleSubmitCode}
          outputLog={outputLog}
          problemSecondsElapsed={problemSecondsElapsed}
          problemDetailTab={problemDetailTab}
          selectedTag={selectedConcept}
          selectedDifficulty={selectedDifficulty}
          selectedLanguage={selectedLanguage}
          selectedProblem={selectedProblem}
          sessionMode={sessionMode}
          setCode={handleEditorCodeChange}
          setExecutionInput={setExecutionInput}
          setProblemDetailTab={setProblemDetailTab}
          setSelectedDifficulty={setSelectedDifficulty}
          setSelectedLanguage={setSelectedLanguage}
          setSelectedProblemSlug={setSelectedProblemSlug}
          setSidebarOpen={setSidebarOpen}
          sidebarOpen={sidebarOpen}
          toggleProblemSection={toggleProblemSection}
          totalSolved={totalSolved}
          dynamicTags={dynamicTags}
          sessionSecondsElapsed={sessionSecondsElapsed}
          activePage={activePage}
        />
      );
      break;
    case "admin":
      activeView = userType === "admin" ? (
        <AdminDashboard />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>Admin access required.</p>
        </div>
      );
      break;
    case "hod":
      activeView = (userType === "hod" || userType === "director" || userType === "tpu") ? (
        <HODDashboard institutionId={selectedInstitutionId} />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>HOD access required.</p>
        </div>
      );
      break;
    case "ja":
      activeView = userType === "ja" ? (
        <JADashboard />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>Junior Admin access required.</p>
        </div>
      );
      break;
    case "staff":
      activeView = ["staff", "hod", "admin", "director", "tpu", "ja"].includes(userType) ? (
        <StaffDashboard institutionId={selectedInstitutionId} />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>Staff access required.</p>
        </div>
      );
      break;
    case "announcements":
      activeView = userType === "admin" ? (
        <AdminDashboard 
          onSelectInstitution={(instId) => {
            setSelectedInstitutionId(instId);
            navigate("institution");
          }}
        />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>Admin access required.</p>
        </div>
      );
      break;
    case "institution":
      console.log("Institution route debug - userType:", userType, "selectedInstitutionId:", selectedInstitutionId);
      activeView = userType === "admin" && selectedInstitutionId ? (
        <InstitutionDetail 
          institutionId={selectedInstitutionId} 
          onBack={() => {
            setSelectedInstitutionId(null);
            navigate("explore");
          }}
        />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>Admin access required or no institution selected.</p>
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: 10 }}>
            Debug: userType={userType}, institutionId={selectedInstitutionId || "null"}
          </p>
          <button 
            onClick={() => navigate("explore")}
            style={{ marginTop: 20, padding: '8px 16px', cursor: 'pointer' }}
          >
            Go Back
          </button>
        </div>
      );
      break;
    case "explore":
    default:
      console.log("Route debug - activePage:", activePage, "userType:", userType);
      // Redirect staff and hod to their dashboard if they land on explore
      if (userType === "staff") {
        navigate("staff", { replace: true });
        break;
      }
      if (userType === "admin") {
        navigate("admin", { replace: true });
        break;
      }
      if (userType === "hod" || userType === "director" || userType === "tpu") {
        navigate("hod", { replace: true });
        break;
      }
      if (userType === "ja") {
        navigate("ja", { replace: true });
        break;
      }
      activeView = (
        <ExplorePage
          activityCalendar={activityCalendar}
          conceptCounts={conceptCounts}
          dashboard={dashboard}
          difficultyOrder={difficultyOrder}
          featuredPaths={featuredPaths}
          filteredPreviewProblems={filteredPreviewProblems}
          languageOptions={languageOptions}
          roleTracks={roleTracks}
          selectedConcept={selectedConcept}
          selectedDifficulty={selectedDifficulty}
          selectedLanguage={selectedLanguage}
          setActivePage={navigate}
          setSelectedRoadmapId={setSelectedRoadmapId}
          setSelectedConcept={handleSelectConcept}
          setSelectedDifficulty={setSelectedDifficulty}
          setSelectedLanguage={setSelectedLanguage}
          setSelectedProblemSlug={setSelectedProblemSlug}
          totalSolved={totalSolved}
          conceptOptions={dynamicTags}
        />
      );
      break;
    }
  }

  const handleMaintenanceBack = () => {
    resetStudentSession();
    setMaintenanceMode(false);
    setMaintenanceMessage("");
    setAuthMessage("");
  };

  if (maintenanceMode) {
    return <MaintenanceScreen message={maintenanceMessage} onRetry={() => window.location.reload()} onBack={handleMaintenanceBack} />;
  }

  // ── Mobile blocker — require a proper desktop/laptop screen ──────────────
  if (typeof window !== 'undefined' && window.innerWidth < 900) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1f2816 0%, #39482a 100%)',
        padding: '32px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 20,
          padding: '40px 32px',
          maxWidth: 360,
          width: '100%',
        }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>🖥️</div>
          <h1 style={{
            color: '#f8f6ef',
            fontSize: '1.5rem',
            fontWeight: 900,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}>
            Desktop Only
          </h1>
          <p style={{
            color: 'rgba(248,246,239,0.65)',
            fontSize: '0.95rem',
            lineHeight: 1.6,
            margin: '0 0 24px',
          }}>
            code-2day is designed for laptops and desktops. Please open it on a larger screen for the best experience.
          </p>
          <div style={{
            background: 'rgba(196,151,67,0.15)',
            border: '1px solid rgba(196,151,67,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            color: '#c49743',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}>
            Minimum screen width: 900px
          </div>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginTop: 24 }}>
          code-2day · Ramco Institute of Technology
        </p>
      </div>
    );
  }

  // JA 2-step verification gate — shown after password is correct, before session is created
  if (pendingJaLogin) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f9fafb" }}>
        <TwoStepVerification
          user={pendingJaLogin.payload.staff || { faculty_id: pendingJaLogin.registerNumberValue }}
          userType="ja"
          onVerificationSuccess={completeJaLogin}
          onBack={() => {
            setPendingJaLogin(null);
            setAuthMode("login");
            setPassword("");
          }}
          onCancel={() => {
            setPendingJaLogin(null);
            setAuthMode("identify");
            setPassword("");
          }}
        />
      </div>
    );
  }

  // If a redirect branch fired (activeView still null), render nothing visible
  // while the navigate() call triggers the next render with the correct page.
  return (
    <div className="app-shell" style={!isLoggedIn ? { minHeight: "100vh", display: "flex", flexDirection: "column", padding: 0 } : {}}>
      <TargetCursor targetSelector=".hamburger-btn, button[type='submit'], .line-sidebar__item, .cursor-target" hideDefaultCursor={false} />
      <ClickBurstEffect />
      <OfflineOverlay />
      {showSuccessAnimation && (
        <SuccessAnimation onDone={() => setShowSuccessAnimation(false)} />
      )}
      {!firstLoadDone && (
        <LoadingScreen ready={Boolean(activeView)} onFinished={() => setFirstLoadDone(true)} />
      )}
      {isLoggedIn && (
        <TopBar
          activePage={activePage}
          dashboard={dashboard}
          handleLogout={handleLogout}
          navItems={navItems}
          setActivePage={navigate}
          userType={userType}
          hideNav={isInsideWorkspace || (sessionMode === "contest" && activePage === "problems")}
        />
      )}
      <main className="main-shell" style={!isLoggedIn ? { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } : {}}>
        <ErrorBoundary key={activePage}>
          {activeView ?? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh", color: "var(--text-soft)" }}>
              Loading…
            </div>
          )}
        </ErrorBoundary>
      </main>

      <Footer onNavigate={navigate} />
    </div>
  );
}

export default App;
