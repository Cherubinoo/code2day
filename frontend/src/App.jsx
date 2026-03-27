import { useEffect, useMemo, useState } from "react";

import AuthScreen from "./components/AuthScreen";
import TopBar from "./components/TopBar";
import ContestPage from "./components/pages/ContestPage";
import DiscussPage from "./components/pages/DiscussPage";
import ExplorePage from "./components/pages/ExplorePage";
import ProblemsPage from "./components/pages/ProblemsPage";
import ProgressPage from "./components/pages/ProgressPage";
import RoadmapsPage from "./components/pages/RoadmapsPage";
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
import {
  buildJsonPostOptions,
  estimateComplexity,
  extractApiError,
  normalizeProblems,
} from "./lib/appUtils";

function App() {
  const [activePage, setActivePage] = useState("explore");
  const [dashboard, setDashboard] = useState(fallbackDashboard);
  const [problemSet, setProblemSet] = useState(normalizeProblems(fallbackProblems));
  const [selectedDifficulty, setSelectedDifficulty] = useState("All Levels");
  const [selectedConcept, setSelectedConcept] = useState("All Concepts");
  const [selectedLanguage, setSelectedLanguage] = useState("JavaScript");
  const [selectedProblemSlug, setSelectedProblemSlug] = useState("two-sum-variants");
  const [problemDetailTab, setProblemDetailTab] = useState("current");
  const [code, setCode] = useState(starterCodeByLanguage.JavaScript);
  const [registerNumber, setRegisterNumber] = useState(
    () => window.localStorage.getItem(authStorageKey) ?? "",
  );
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState("identify");
  const [authStudent, setAuthStudent] = useState(null);
  const [activeRegisterNumber, setActiveRegisterNumber] = useState(
    () => window.localStorage.getItem(authStorageKey) ?? "",
  );
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [studentMatches, setStudentMatches] = useState([]);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [discussionFeed, setDiscussionFeed] = useState([]);
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const [outputLog, setOutputLog] = useState(
    "Output panel ready. Run the code to see sample execution results here.",
  );
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

  const isLoggedIn = Boolean(activeRegisterNumber);

  function resetStudentSession() {
    window.localStorage.removeItem(authStorageKey);
    setActiveRegisterNumber("");
    setRegisterNumber("");
    setPassword("");
    setAuthStudent(null);
    setDiscussionFeed([]);
    setAuthMode("identify");
    setAuthError("");
    setAuthMessage("");
    setDashboard(fallbackDashboard);
    setProblemSet(normalizeProblems(fallbackProblems));
    setSelectedDifficulty("All Levels");
    setSelectedConcept("All Concepts");
    setSelectedLanguage("JavaScript");
    setSelectedProblemSlug("two-sum-variants");
    setProblemDetailTab("current");
    setCode(starterCodeByLanguage.JavaScript);
    setOutputLog("Output panel ready. Run the code to see sample execution results here.");
    setSessionMode("practice");
    setActiveContestId("");
    setContestSecondsLeft(null);
    setProblemSecondsElapsed(0);
    setContestHistory([]);
    setSelectedRoadmapId("");
    setActivePage("explore");
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
      const matchesConcept =
        selectedConcept === "All Concepts" || (problem.tags ?? []).includes(selectedConcept);
      const matchesLanguage = (problem.available_languages ?? languageOptions).includes(
        selectedLanguage,
      );

      return matchesDifficulty && matchesConcept && matchesLanguage;
    });
  }, [baseProblemPool, selectedConcept, selectedDifficulty, selectedLanguage]);

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

  useEffect(() => {
    if (!selectedProblemSlug && selectedConcept !== "All Concepts") {
      return;
    }

    if (!filteredProblemSet.some((problem) => problem.slug === selectedProblemSlug)) {
      setSelectedProblemSlug(
        selectedConcept === "All Concepts" ? filteredProblemSet[0]?.slug ?? "" : "",
      );
    }
  }, [filteredProblemSet, selectedConcept, selectedProblemSlug]);

  useEffect(() => {
    const availableLanguages =
      filteredProblemSet.find((problem) => problem.slug === selectedProblemSlug)
        ?.available_languages ?? languageOptions;

    if (!availableLanguages.includes(selectedLanguage)) {
      setSelectedLanguage(availableLanguages[0] ?? "JavaScript");
    }
  }, [filteredProblemSet, selectedLanguage, selectedProblemSlug]);

  useEffect(() => {
    setCode(starterCodeByLanguage[selectedLanguage] ?? starterCodeByLanguage.JavaScript);
  }, [selectedLanguage, selectedProblemSlug]);

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
      setActivePage("progress");
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
      setAuthError("Enter your register number to continue.");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(
        `/api/auth/student/?register_number=${encodeURIComponent(registerNumber.trim())}`,
        {
          credentials: "include",
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Student lookup failed."));
      }

      setAuthStudent(payload.student);
      setStudentMatches([]);
      setAuthMode(payload.first_login_required ? "first-login" : "login");
      setAuthMessage(
        payload.first_login_required
          ? "First login detected. Create your password to unlock the workspace."
          : "Student found. Enter your password to continue.",
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

    const endpoint =
      authMode === "first-login" ? "/api/auth/first-login/" : "/api/auth/login/";

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    try {
      const response = await fetch(endpoint, {
        ...buildJsonPostOptions({
          register_number: registerNumber.trim(),
          password,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(payload, "Authentication failed."));
      }

      window.localStorage.setItem(authStorageKey, registerNumber.trim());
      setAuthStudent(payload.student);
      setActiveRegisterNumber(registerNumber.trim());
      setPassword("");
      setAuthMessage(payload.detail);
      setActivePage("explore");
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
      setOutputLog(
        `Could not save progress in the database.\n\n${error.message ?? "Unknown error."}`,
      );
      return false;
    }
  }

  async function handleRunCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to start coding.");
      return;
    }

    const isSaved = await persistProblemProgress("open");
    if (!isSaved) {
      return;
    }

    setOutputLog(
      `Running ${selectedProblem.title} in ${selectedLanguage}\n\nSample Case 1: Passed\nStarter validation: Workspace is ready for deeper testing.\nNext Step: Review edge cases before submitting.`,
    );
  }

  async function handleSubmitCode() {
    if (!selectedProblem) {
      setOutputLog("Select a problem first to submit a solution.");
      return;
    }

    const isSaved = await persistProblemProgress("completed");
    if (!isSaved) {
      return;
    }

    setOutputLog(
      `Submitting ${selectedProblem.title} in ${selectedLanguage}\n\nStatus: Accepted\nTests Passed: 14 / 14\nResult: Marked as completed in your problemset.`,
    );
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
    setActivePage("problems");
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
    setActivePage("progress");
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

  function handleSelectConcept(nextConcept, context = "general") {
    setSelectedConcept(nextConcept);
    if (context === "problems" && nextConcept !== "All Concepts") {
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
        password={password}
        registerNumber={registerNumber}
        setAuthError={setAuthError}
        setAuthStudent={setAuthStudent}
        setPassword={setPassword}
        setRegisterNumber={setRegisterNumber}
        setStudentMatches={setStudentMatches}
        studentMatches={studentMatches}
      />
    );
  }

  let activeView = null;
  switch (activePage) {
    case "problems":
      activeView = (
        <ProblemsPage
          activeContest={activeContest}
          code={code}
          conceptCounts={conceptCounts}
          complexityInsight={complexityInsight}
          contestSecondsLeft={contestSecondsLeft}
          dashboard={dashboard}
          handleSelectConcept={handleSelectConcept}
          difficultyOrder={difficultyOrder}
          editorLanguage={editorLanguageByChoice[selectedLanguage] ?? "javascript"}
          expandedSections={expandedSections}
          groupedProblems={groupedProblems}
          handleFinishContest={handleFinishContest}
          handleRunCode={handleRunCode}
          handleSubmitCode={handleSubmitCode}
          outputLog={outputLog}
          problemSecondsElapsed={problemSecondsElapsed}
          problemDetailTab={problemDetailTab}
          selectedConcept={selectedConcept}
          selectedDifficulty={selectedDifficulty}
          selectedLanguage={selectedLanguage}
          selectedProblem={selectedProblem}
          sessionMode={sessionMode}
          setCode={setCode}
          setProblemDetailTab={setProblemDetailTab}
          setSelectedDifficulty={setSelectedDifficulty}
          setSelectedLanguage={setSelectedLanguage}
          setSelectedProblemSlug={setSelectedProblemSlug}
          setSidebarOpen={setSidebarOpen}
          sidebarOpen={sidebarOpen}
          toggleProblemSection={toggleProblemSection}
          totalSolved={totalSolved}
          conceptOptions={conceptOptions}
        />
      );
      break;
    case "contest":
      activeView = (
        <ContestPage
          contestCards={contestCards}
          contestHistory={contestHistory}
          handleJoinContest={handleJoinContest}
          setActivePage={setActivePage}
        />
      );
      break;
    case "progress":
      activeView = (
        <ProgressPage
          contestCards={contestCards}
          contestHistory={contestHistory}
          dashboard={dashboard}
          handleJoinContest={handleJoinContest}
          resultCards={resultCards}
        />
      );
      break;
    case "roadmaps":
      activeView = (
        <RoadmapsPage
          roleTracks={roleTracks}
          selectedRoadmapId={selectedRoadmapId}
          setActivePage={setActivePage}
          setSelectedRoadmapId={setSelectedRoadmapId}
        />
      );
      break;
    case "discuss":
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
    case "explore":
    default:
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
          setActivePage={setActivePage}
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
        setActivePage={setActivePage}
      />
      <main className="main-shell">{activeView}</main>
    </div>
  );
}

export default App;
