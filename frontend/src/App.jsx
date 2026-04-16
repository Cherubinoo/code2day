import { useEffect, useMemo, useRef, useState } from "react";

import AdminDashboard from "./components/admin/AdminDashboard";
import InstitutionDetail from "./components/admin/InstitutionDetail";
import HODDashboard from "./components/hod/HODDashboard";
import StaffDashboard from "./components/staff/StaffDashboard";
import AuthScreen from "./components/common/AuthScreen";
import TopBar from "./components/common/TopBar";
import ContestContainer from "./components/student/pages/ContestContainer";
import DiscussPage from "./components/student/pages/DiscussPage";
import ExplorePage from "./components/student/pages/ExplorePage";
import ProblemsPage from "./components/student/pages/ProblemsPage";
import ProgressPage from "./components/student/pages/ProgressPage";
import RoadmapsPage from "./components/student/pages/RoadmapsPage";
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
  estimateComplexity,
  extractApiError,
  normalizeProblems,
} from "./lib/appUtils";
import { useHistoryNav } from "./lib/useHistoryNav";

function App() {
  const [activePage, navigate] = useHistoryNav(() => {
    // Restore saved page from localStorage on init
    return window.localStorage.getItem("code2day-active-page") || "explore";
  });
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [problemSet, setProblemSet] = useState(normalizeProblems(fallbackProblems));
  const [selectedDifficulty, setSelectedDifficulty] = useState("All Levels");
  const [selectedConcept, setSelectedConcept] = useState("All Topics");
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return window.localStorage.getItem("code2day-language") || "JavaScript";
  });
  const [selectedProblemSlug, setSelectedProblemSlug] = useState(() => {
    return window.localStorage.getItem("code2day-problem-slug") || "";
  });
  const [problemDetailTab, setProblemDetailTab] = useState("current");
  const [code, setCode] = useState(() => {
    const savedCode = window.localStorage.getItem("code2day-code");
    const savedLang = window.localStorage.getItem("code2day-language") || "JavaScript";
    // Return saved code if exists, otherwise use starter code for saved language
    return savedCode || starterCodeByLanguage[savedLang] || starterCodeByLanguage.JavaScript;
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
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionFeed, setDiscussionFeed] = useState([]);
  const [discussionBusy, setDiscussionBusy] = useState(false);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    open: true,
    completed: false,
    not_completed: true,
  });
  const [sessionMode, setSessionMode] = useState("practice");
  const [activeContestId, setActiveContestId] = useState("");
  const [contestSecondsLeft, setContestSecondsLeft] = useState(null);
  const [problemSecondsElapsed, setProblemSecondsElapsed] = useState(0);
  const [contestHistory, setContestHistory] = useState([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(
    () => window.localStorage.getItem("code2day-institution-id") || null,
  );

  const isLoggedIn = Boolean(activeRegisterNumber);

  function resetStudentSession() {
    window.localStorage.removeItem(authStorageKey);
    window.localStorage.removeItem("code2day-user-type");
    window.localStorage.removeItem("code2day-institution-id");
    setActiveRegisterNumber("");
    setRegisterNumber("");
    setPassword("");
    setAuthStudent(null);
    setUserType(null);
    setSelectedInstitutionId(null);
    setDiscussionFeed([]);
    setAuthMode("identify");
    setAuthError("");
    setAuthMessage("");
    setDashboard(fallbackDashboard);
    setProblemSet(normalizeProblems(fallbackProblems));
    setSelectedDifficulty("All Levels");
    setSelectedConcept("All Concepts");
    setSelectedLanguage("JavaScript");
    setSelectedProblemSlug("");
    setProblemDetailTab("current");
    setCode(starterCodeByLanguage.JavaScript);
    setOutputLog("Output panel ready. Run the code to see sample execution results here.");
    setExecutionInput("");
    setExecutionMeta({ status: "Idle", time: "", memory: "" });
    setExecutionBusy(false);
    setSessionMode("practice");
    setActiveContestId("");
    setContestSecondsLeft(null);
    setProblemSecondsElapsed(0);
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

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [activeRegisterNumber]);

  useEffect(() => {
    if (!isLoggedIn) {
      setProblemSet(normalizeProblems(fallbackProblems));
      return undefined;
    }

    let isMounted = true;

    async function loadProblems() {
      try {
        const response = await fetch("/api/problems/", {
          credentials: "include",
        });
        if (response.status === 401) {
          if (isMounted) {
            resetStudentSession();
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Problem request failed");
        }

        const payload = await response.json();
        if (isMounted) {
          setProblemSet(normalizeProblems(payload));
        }
      } catch (error) {
        console.error("Using fallback problem data", error);
        if (isMounted) {
          setProblemSet(normalizeProblems(fallbackProblems));
        }
      }
    }

    loadProblems();

    return () => {
      isMounted = false;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn || !selectedProblemSlug) {
      return undefined;
    }

    const existingProblem = problemSet.find((problem) => problem.slug === selectedProblemSlug);
    if (existingProblem?.examples?.length || existingProblem?.editorial || existingProblem?.hints?.length) {
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
  }, [isLoggedIn, problemSet, selectedProblemSlug]);

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
        selectedConcept === "All Topics" || (problem.tags ?? []).includes(selectedConcept);
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
    return ["All Topics", ...Array.from(allTags).sort()];
  }, [baseProblemPool]);

  const tagCounts = useMemo(() => {
    const counts = { "All Topics": baseProblemPool.length };
    dynamicTags.slice(1).forEach((tag) => {
      counts[tag] = baseProblemPool.filter((problem) =>
        (problem.tags ?? []).includes(tag),
      ).length;
    });
    return counts;
  }, [baseProblemPool, dynamicTags]);

  useEffect(() => {
    // Skip if user just manually changed language
    if (userChangedLanguage.current) {
      userChangedLanguage.current = false;
      return;
    }
    
    const availableLanguages =
      filteredProblemSet.find((problem) => problem.slug === selectedProblemSlug)
        ?.available_languages ?? languageOptions;

    if (!availableLanguages.includes(selectedLanguage)) {
      setSelectedLanguage(availableLanguages[0] ?? "JavaScript");
    }
  }, [filteredProblemSet, selectedProblemSlug]);

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

  // Handle language change - switch to starter code ONLY when user manually changes language
  useEffect(() => {
    // Skip on initial mount and on code restore
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (hasRestoredCode.current) {
      hasRestoredCode.current = false;
      return;
    }
    if (!selectedProblemSlug) return;
    
    // Mark that user changed language to prevent auto-reset
    userChangedLanguage.current = true;
    
    // User changed language - switch to new language's starter code
    const currentStarter = starterCodeByLanguage[selectedLanguage];
    setCode(currentStarter ?? starterCodeByLanguage.JavaScript);
  }, [selectedLanguage, selectedProblemSlug]);

  useEffect(() => {
    setExecutionMeta({ status: "Idle", time: "", memory: "" });
  }, [selectedProblemSlug, selectedLanguage]);

  useEffect(() => {
    if (activePage !== "problems" || !selectedProblemSlug) {
      return undefined;
    }

    setProblemSecondsElapsed(0);
    const timer = window.setInterval(() => {
      setProblemSecondsElapsed((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activePage, selectedProblemSlug, sessionMode, activeContestId]);

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

  useEffect(() => {
    if (!isLoggedIn || activePage !== "discuss") {
      return undefined;
    }

    let isMounted = true;

    async function loadDiscussions() {
      try {
        const response = await fetch("/api/discussions/", {
          credentials: "include",
        });
        if (response.status === 401) {
          if (isMounted) {
            resetStudentSession();
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Discussion request failed");
        }

        const payload = await response.json();
        if (isMounted) {
          setDiscussionFeed(payload);
        }
      } catch (error) {
        console.error("Could not load anonymous discussions", error);
      }
    }

    loadDiscussions();
    const poller = window.setInterval(loadDiscussions, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(poller);
    };
  }, [activePage, isLoggedIn]);

  // Save active page to localStorage whenever it changes
  useEffect(() => {
    window.localStorage.setItem("code2day-active-page", activePage);
  }, [activePage]);

  // Save code to localStorage whenever it changes
  useEffect(() => {
    if (code) {
      window.localStorage.setItem("code2day-code", code);
    }
  }, [code]);

  // Save problem slug to localStorage when it changes
  useEffect(() => {
    if (selectedProblemSlug) {
      window.localStorage.setItem("code2day-problem-slug", selectedProblemSlug);
    }
  }, [selectedProblemSlug]);

  // Save selected language to localStorage when it changes
  useEffect(() => {
    window.localStorage.setItem("code2day-language", selectedLanguage);
  }, [selectedLanguage]);

  const selectedProblem = useMemo(() => {
    if (!selectedProblemSlug) {
      return null;
    }
    return filteredProblemSet.find((problem) => problem.slug === selectedProblemSlug) ?? null;
  }, [filteredProblemSet, selectedProblemSlug]);

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
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(payload, "User lookup failed."));
      }

      console.log("Lookup response:", payload);
      console.log("User type detected:", payload.user_type);

      // Check if user type matches selected login type
      if (loginType === "student" && payload.user_type !== "student") {
        throw new Error("This ID is not a student account. Please use Staff Login.");
      }
      if (loginType === "staff" && payload.user_type === "student") {
        throw new Error("This ID is a student account. Please use Student Login.");
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
    } else if (authStudent?.user_type === "staff" || authStudent?.user_type === "hod") {
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
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Authentication failed."));
      }

      // Determine user type from response - prioritize user_type field, then check keys
      let type = payload.user_type || (payload.admin ? "admin" : payload.hod ? "hod" : payload.staff ? "staff" : "student");
      console.log("Login response payload:", payload);
      console.log("Login response - user type:", type, "admin:", !!payload.admin, "hod:", !!payload.hod, "staff:", !!payload.staff);

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
      // Navigate to role-specific dashboard
      const targetPage = type === "admin" ? "admin" : type === "hod" ? "hod" : type === "staff" ? "staff" : "explore";
      navigate(targetPage, { replace: true });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout/", {
        ...buildJsonPostOptions({}),
      });
    } catch (error) {
      console.error("Logout request failed", error);
    } finally {
      resetStudentSession();
    }
  }

  function toggleProblemSection(sectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
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

  function applyExecutionResult(result) {
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

    const result = await runCodeExecution({
      sourceCode: code,
      language: selectedLanguage,
      stdin: executionInput,
      problemSlug: selectedProblem.slug,
      isSubmit,
    });
    applyExecutionResult(result);
    return result;
  }

  async function handleRunCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to start coding.");
      return;
    }

    setExecutionBusy(true);
    try {
      const result = await executeCurrentCode(false);
      if (result.status !== "Unsupported Language") {
        const isSaved = await persistProblemProgress("open");
        if (!isSaved) {
          setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
        }
      }
    } catch (error) {
      setExecutionMeta({ status: "Error", time: "", memory: "" });
      setOutputLog(error.message ?? "Execution failed.");
    } finally {
      setExecutionBusy(false);
    }
  }

  async function handleSubmitCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to submit a solution.");
      return;
    }

    setExecutionBusy(true);
    try {
      const result = await executeCurrentCode(true);
      if (result.status === "Accepted") {
        const isSaved = await persistProblemProgress("completed");
        if (!isSaved) {
          setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
        }
      } else if (result.status !== "Unsupported Language") {
        const isSaved = await persistProblemProgress("open");
        if (!isSaved) {
          setOutputLog((current) => `${current}\n\nProgress save failed in the database.`);
        }
      }
    } catch (error) {
      setExecutionMeta({ status: "Error", time: "", memory: "" });
      setOutputLog(error.message ?? "Execution failed.");
    } finally {
      setExecutionBusy(false);
    }
  }

  function handleJoinContest(contest) {
    const firstContestProblem = problemSet.find((problem) => problem.slug === contest.problems[0]);
    const contestLanguage = firstContestProblem?.available_languages?.[0] ?? "JavaScript";

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
    // Navigate to contest page - this will be handled by the new contest system
    // For now, just navigate to the contest page
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

  async function handlePostDiscussion(event) {
    event.preventDefault();
    if (!discussionDraft.trim()) {
      return;
    }

    setDiscussionBusy(true);
    try {
      const response = await fetch("/api/discussions/", {
        ...buildJsonPostOptions({
          body: discussionDraft.trim(),
          problem_slug: selectedProblem?.slug ?? "",
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(extractApiError(payload, "Could not post your doubt."));
      }

      setDiscussionFeed((current) => [payload, ...current].slice(0, 100));
      setDiscussionDraft("");
    } catch (error) {
      console.error(error);
    } finally {
      setDiscussionBusy(false);
    }
  }

  function handleSelectConcept(nextTag, context = "general") {
    setSelectedConcept(nextTag);
    if (context === "problems" && nextTag !== "All Topics") {
      setSelectedProblemSlug("");
      setOutputLog("Choose a problem from the filtered list to open the coding workspace.");
    }
  }

  const groupedProblems = progressSections.map((section) => ({
    ...section,
    items: filteredProblemSet.filter((problem) => problem.progress_state === section.key),
  }));

  if (!isLoggedIn) {
    return (
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
      />
    );
  }

  let activeView = null;
  switch (activePage) {
    case "problems":
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
        <ProblemsPage
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
          setCode={setCode}
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
        />
      );
      break;
    case "contest":
      activeView = <ContestContainer />;
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
          contestHistory={contestHistory}
          dashboard={dashboard}
          handleJoinContest={handleJoinContest}
          onNavigateToContest={handleNavigateToContest}
          resultCards={resultCards}
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
    case "discuss":
      // Redirect staff, hod, and admin to their dashboards
      if (userType === "staff" || userType === "hod") {
        navigate("staff", { replace: true });
        break;
      }
      if (userType === "admin") {
        navigate("admin", { replace: true });
        break;
      }
      activeView = (
        <DiscussPage
          discussionDraft={discussionDraft}
          discussionBusy={discussionBusy}
          discussionThreads={discussionFeed}
          handlePostDiscussion={handlePostDiscussion}
          selectedProblem={selectedProblem}
          setDiscussionDraft={setDiscussionDraft}
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
      activeView = userType === "hod" ? (
        <HODDashboard institutionId={selectedInstitutionId} />
      ) : (
        <div style={{ padding: 40 }}>
          <h2>Access Denied</h2>
          <p>HOD access required.</p>
        </div>
      );
      break;
    case "staff":
      activeView = userType === "staff" ? (
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
      if (userType === "hod") {
        navigate("hod", { replace: true });
        break;
      }
      if (userType === "admin") {
        navigate("admin", { replace: true });
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
          conceptOptions={conceptOptions}
        />
      );
      break;
  }

  return (
    <div className="app-shell">
      <TopBar
        activePage={activePage}
        dashboard={dashboard}
        handleLogout={handleLogout}
        navItems={navItems}
        setActivePage={navigate}
        userType={userType}
      />
      <main className="main-shell">{activeView}</main>
    </div>
  );
}

export default App;
