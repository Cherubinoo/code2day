import ContestDashboardWidget from '../ContestDashboardWidget';

function ProgressPage({ contestCards, contestHistory, dashboard, onNavigateToContest }) {
  // Stats are nested in dashboard.stats
  const stats = dashboard?.stats || {};
  const easy = stats.easy || 0;
  const medium = stats.medium || 0;
  const hard = stats.hard || 0;
  const totalSolved = easy + medium + hard;
  
  const { streak = 0, loginDays = 0, rank = "Beginner" } = dashboard?.user || {};

  const difficultyData = [
    { label: "Easy", count: easy, color: "#22c55e", bg: "#dcfce7" },
    { label: "Medium", count: medium, color: "#f59e0b", bg: "#fef3c7" },
    { label: "Hard", count: hard, color: "#ef4444", bg: "#fee2e2" },
  ];

  const maxCount = Math.max(easy, medium, hard, 1);
  const joinedContests = contestHistory?.length || 0;

  // Calculate dynamic rank based on total solved
  const getRank = (solved) => {
    if (solved >= 200) return { title: "Campus Legend 🏆", color: "#ffd700" };
    if (solved >= 100) return { title: "Campus Master 🥇", color: "#c0c0c0" };
    if (solved >= 50) return { title: "Campus Expert 🥈", color: "#cd7f32" };
    if (solved >= 30) return { title: "Campus Advanced 🥉", color: "#8b4513" };
    if (solved >= 15) return { title: "Campus Intermediate ⭐", color: "#4169e1" };
    if (solved >= 5) return { title: "Campus Novice 🌟", color: "#32cd32" };
    return { title: "Campus Beginner 🌱", color: "#808080" };
  };

  const userRank = getRank(totalSolved);
  
  // Use real campus rank from dashboard if available, otherwise calculate
  const campusRankNumber = dashboard?.user?.rank || Math.max(1, Math.ceil(100 - totalSolved * 0.5));
  const totalStudents = dashboard?.user?.totalStudents || 100;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDay = new Date().getDay();

  // Achievements with medals and badges
  const achievements = [
    // Streak Achievements
    { id: "streak-3", icon: "🔥", title: "3-Day Streak", desc: "Solve problems for 3 consecutive days", target: 3, current: Math.min(streak, 3), type: "streak" },
    { id: "streak-7", icon: "🔥🔥", title: "Week Warrior", desc: "Solve problems for 7 consecutive days", target: 7, current: Math.min(streak, 7), type: "streak" },
    { id: "streak-30", icon: "🔥🔥🔥", title: "Monthly Master", desc: "Solve problems for 30 consecutive days", target: 30, current: Math.min(streak, 30), type: "streak" },
    
    // Easy Problem Achievements
    { id: "easy-5", icon: "🥉", title: "Easy Bronze", desc: "Solve 5 Easy problems", target: 5, current: Math.min(easy, 5), type: "easy" },
    { id: "easy-10", icon: "🥈", title: "Easy Silver", desc: "Solve 10 Easy problems", target: 10, current: Math.min(easy, 10), type: "easy" },
    { id: "easy-25", icon: "🥇", title: "Easy Gold", desc: "Solve 25 Easy problems", target: 25, current: Math.min(easy, 25), type: "easy" },
    { id: "easy-50", icon: "💎", title: "Easy Diamond", desc: "Solve 50 Easy problems", target: 50, current: Math.min(easy, 50), type: "easy" },
    
    // Medium Problem Achievements
    { id: "medium-5", icon: "🥉", title: "Medium Bronze", desc: "Solve 5 Medium problems", target: 5, current: Math.min(medium, 5), type: "medium" },
    { id: "medium-10", icon: "🥈", title: "Medium Silver", desc: "Solve 10 Medium problems", target: 10, current: Math.min(medium, 10), type: "medium" },
    { id: "medium-25", icon: "🥇", title: "Medium Gold", desc: "Solve 25 Medium problems", target: 25, current: Math.min(medium, 25), type: "medium" },
    { id: "medium-50", icon: "💎", title: "Medium Diamond", desc: "Solve 50 Medium problems", target: 50, current: Math.min(medium, 50), type: "medium" },
    
    // Hard Problem Achievements
    { id: "hard-3", icon: "🥉", title: "Hard Bronze", desc: "Solve 3 Hard problems", target: 3, current: Math.min(hard, 3), type: "hard" },
    { id: "hard-5", icon: "🥈", title: "Hard Silver", desc: "Solve 5 Hard problems", target: 5, current: Math.min(hard, 5), type: "hard" },
    { id: "hard-10", icon: "🥇", title: "Hard Gold", desc: "Solve 10 Hard problems", target: 10, current: Math.min(hard, 10), type: "hard" },
    { id: "hard-25", icon: "💎", title: "Hard Diamond", desc: "Solve 25 Hard problems", target: 25, current: Math.min(hard, 25), type: "hard" },
    
    // Total Solved Achievements
    { id: "total-10", icon: "🌱", title: "First Steps", desc: "Solve 10 problems total", target: 10, current: Math.min(totalSolved, 10), type: "total" },
    { id: "total-25", icon: "🌿", title: "Growing Coder", desc: "Solve 25 problems total", target: 25, current: Math.min(totalSolved, 25), type: "total" },
    { id: "total-50", icon: "🌳", title: "Code Tree", desc: "Solve 50 problems total", target: 50, current: Math.min(totalSolved, 50), type: "total" },
    { id: "total-100", icon: "🏆", title: "Century Club", desc: "Solve 100 problems total", target: 100, current: Math.min(totalSolved, 100), type: "total" },
    { id: "total-200", icon: "👑", title: "Code King/Queen", desc: "Solve 200 problems total", target: 200, current: Math.min(totalSolved, 200), type: "total" },
    
    // Special Achievements
    { id: "balanced", icon: "⚖️", title: "Balanced Coder", desc: "Solve at least 5 of each difficulty", target: 5, current: easy >= 5 && medium >= 5 && hard >= 5 ? 5 : Math.min(easy, medium, hard), type: "special" },
    { id: "night-owl", icon: "🦉", title: "Night Owl", desc: "Solve problems after midnight", target: 1, current: 0, type: "special" },
    { id: "early-bird", icon: "🐦", title: "Early Bird", desc: "Solve problems before 6 AM", target: 1, current: 0, type: "special" },
    { id: "speed-demon", icon: "⚡", title: "Speed Demon", desc: "Solve a problem in under 5 minutes", target: 1, current: 0, type: "special" },
    { id: "perfect-run", icon: "✨", title: "Perfect Run", desc: "Get all test cases passed on first try", target: 1, current: 0, type: "special" },
    { id: "polyglot", icon: "🌐", title: "Polyglot", desc: "Solve problems in 5+ languages", target: 5, current: 1, type: "special" },
    { id: "contributor", icon: "🤝", title: "Helper", desc: "Post 5 helpful discussions", target: 5, current: 0, type: "special" },
    { id: "consistent", icon: "📅", title: "Consistent", desc: "Log in for 7 days", target: 7, current: Math.min(loginDays, 7), type: "special" },
  ];

  const getAchievementColor = (type) => {
    switch (type) {
      case "easy": return "#22c55e";
      case "medium": return "#f59e0b";
      case "hard": return "#ef4444";
      case "streak": return "#ff6b35";
      case "total": return "#8b5cf6";
      default: return "#6366f1";
    }
  };

  return (
    <div className="page-stack">
      {/* Hero Section */}
      <section className="hero-grid">
        <article className="hero-card hero-card-wide">
          <div className="eyebrow-row">
            <span className="badge badge-strong">Progress</span>
            <span className="badge" style={{ background: userRank.color + "20", color: userRank.color, border: `1px solid ${userRank.color}` }}>
              {userRank.title}
            </span>
            <span className="badge" style={{ background: "#ffd70020", color: "#b8860b", border: "1px solid #ffd700" }}>
              🏆 Campus Rank #{campusRankNumber}
            </span>
          </div>
          <h1>Track your growth, level by level.</h1>
          <p>
            See your solved problems by difficulty, active streaks, and contest progress.
            All your practice insights in one place.
          </p>
          <div className="hero-summary-grid">
            <div className="hero-summary-card" style={{ background: "rgba(34, 197, 94, 0.1)" }}>
              <span style={{ color: "#22c55e" }}>Easy Solved</span>
              <strong style={{ color: "#22c55e" }}>{easy}</strong>
            </div>
            <div className="hero-summary-card" style={{ background: "rgba(245, 158, 11, 0.1)" }}>
              <span style={{ color: "#f59e0b" }}>Medium Solved</span>
              <strong style={{ color: "#f59e0b" }}>{medium}</strong>
            </div>
            <div className="hero-summary-card" style={{ background: "rgba(239, 68, 68, 0.1)" }}>
              <span style={{ color: "#ef4444" }}>Hard Solved</span>
              <strong style={{ color: "#ef4444" }}>{hard}</strong>
            </div>
          </div>

          {/* Progress Bars */}
          <div style={{ marginTop: "1.5rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "1rem" }}>Problems by Difficulty</h3>
            {difficultyData.map(({ label, count, color, bg }) => (
              <div key={label} style={{ marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color }}>{count}</span>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: bg,
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      height: "100%",
                      background: color,
                      borderRadius: "4px",
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Stats Card */}
        <article className="hero-card hero-card-side">
          <div className="section-head">
            <h2>Your Stats</h2>
            <span>Practice Overview</span>
          </div>
          
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div style={{ fontSize: "4rem", fontWeight: 700, color: "var(--accent)", lineHeight: 1 }}>
              {totalSolved}
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.5rem" }}>
              Total Problems Solved
            </div>
          </div>

          <div className="calendar-summary-grid" style={{ marginTop: "1rem" }}>
            <div className="calendar-summary-card">
              <span>Current streak</span>
              <strong>{streak} days</strong>
            </div>
            <div className="calendar-summary-card">
              <span>Days logged</span>
              <strong>{loginDays}</strong>
            </div>
          </div>

          {/* Weekly Activity */}
          <div style={{ marginTop: "1.5rem" }}>
            <p className="kicker" style={{ marginBottom: "0.75rem" }}>This Week</p>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              {days.map((day, i) => {
                const isToday = i === currentDay;
                const hasActivity = [1, 3, 5].includes(i); // Mock activity
                return (
                  <div key={day} style={{ textAlign: "center", flex: 1 }}>
                    <div
                      style={{
                        height: "40px",
                        background: hasActivity ? "var(--accent)" : "var(--bg-2)",
                        borderRadius: "0.25rem",
                        opacity: isToday ? 1 : 0.7,
                        border: isToday ? "2px solid var(--accent)" : "none",
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </article>
      </section>

      {/* Difficulty Breakdown Cards */}
      <section className="content-grid three-column">
        {difficultyData.map(({ label, count, color, bg }) => (
          <article
            key={label}
            className="surface-card"
            style={{ background: bg, borderLeft: `4px solid ${color}` }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: color,
                }}
              />
              <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>{label}</span>
            </div>
            <strong style={{ fontSize: "2rem", color, display: "block" }}>{count}</strong>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>problems solved</span>
            <div style={{ marginTop: "1rem" }}>
              <div style={{ height: "4px", background: "rgba(255,255,255,0.5)", borderRadius: "2px" }}>
                <div
                  style={{
                    width: `${totalSolved > 0 ? (count / totalSolved) * 100 : 0}%`,
                    height: "100%",
                    background: color,
                    borderRadius: "2px",
                  }}
                />
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* Contest Section */}
      <section className="surface-card">
        <div className="section-head">
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <h2>My Contests</h2>
            <span
              style={{
                padding: "0.25rem 0.75rem",
                background: "var(--accent)",
                color: "#fff",
                borderRadius: "9999px",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              {joinedContests} Joined
            </span>
          </div>
          <span>Your contest participation and performance</span>
        </div>

        <ContestDashboardWidget onNavigateToContest={onNavigateToContest} />
      </section>

      {/* Achievement Section */}
      <section className="surface-card">
        <div className="section-head">
          <h2>Achievements & Badges</h2>
          <span>{achievements.filter(a => a.current >= a.target).length} of {achievements.length} unlocked</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {achievements.map((achievement) => {
            const isUnlocked = achievement.current >= achievement.target;
            const progress = (achievement.current / achievement.target) * 100;
            return (
              <article
                key={achievement.id}
                className="surface-card"
                style={{
                  padding: "1rem",
                  opacity: isUnlocked ? 1 : 0.6,
                  borderLeft: `4px solid ${getAchievementColor(achievement.type)}`,
                  background: isUnlocked ? `${getAchievementColor(achievement.type)}10` : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>{achievement.icon}</span>
                  <div>
                    <strong style={{ fontSize: "0.9rem", display: "block" }}>{achievement.title}</strong>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{achievement.desc}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ flex: 1, height: "6px", background: "var(--bg-2)", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%",
                        background: getAchievementColor(achievement.type),
                        borderRadius: "3px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, minWidth: "50px", textAlign: "right" }}>
                    {achievement.current}/{achievement.target}
                  </span>
                </div>
                {isUnlocked && (
                  <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: getAchievementColor(achievement.type), fontWeight: 600 }}>
                    ✓ Unlocked!
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default ProgressPage;
