import { useState, useEffect } from 'react';
import { Trophy, Clock, Target, Award, Users, ChevronRight, X, MessageSquare } from 'lucide-react';

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toCalendarDate(date) {
  // Use local date components to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildMonthCalendar(activityCalendar) {
  const sortedActivity = [...(activityCalendar ?? [])]
    .filter((item) => item?.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  const today = toCalendarDate(new Date());
  const anchor = new Date(`${today}T00:00:00`);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const startOffset = monthStart.getDay();
  const endOffset = (7 - ((startOffset + monthEnd.getDate()) % 7)) % 7;

  const activityByDate = new Map(sortedActivity.map((item) => [item.date, item.count ?? 0]));
  const cells = [];

  for (let index = startOffset; index > 0; index -= 1) {
    const date = new Date(monthStart);
    date.setDate(monthStart.getDate() - index);
    cells.push({
      key: `prev-${toCalendarDate(date)}`,
      date: toCalendarDate(date),
      dayNumber: date.getDate(),
      count: activityByDate.get(toCalendarDate(date)) ?? 0,
      isCurrentMonth: false,
      isToday: false,
    });
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    const dateKey = toCalendarDate(date);
    cells.push({
      key: dateKey,
      date: dateKey,
      dayNumber: day,
      count: activityByDate.get(dateKey) ?? 0,
      isCurrentMonth: true,
      isToday: dateKey === today,
    });
  }

  for (let index = 1; index <= endOffset; index += 1) {
    const date = new Date(monthEnd);
    date.setDate(monthEnd.getDate() + index);
    cells.push({
      key: `next-${toCalendarDate(date)}`,
      date: toCalendarDate(date),
      dayNumber: date.getDate(),
      count: activityByDate.get(toCalendarDate(date)) ?? 0,
      isCurrentMonth: false,
      isToday: false,
    });
  }

  const monthLabel = anchor.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const activeDays = cells.filter((cell) => cell.isCurrentMonth && cell.count > 0).length;
  const totalActivity = cells
    .filter((cell) => cell.isCurrentMonth)
    .reduce((sum, cell) => sum + cell.count, 0);

  return {
    monthLabel,
    activeDays,
    totalActivity,
    cells,
  };
}

function ExplorePage({
  activityCalendar,
  dashboard,
  difficultyOrder,
  featuredPaths,
  filteredPreviewProblems,
  languageOptions,
  roleTracks,
  selectedConcept,
  selectedDifficulty,
  selectedLanguage,
  setActivePage,
  setSelectedRoadmapId,
  setSelectedConcept,
  setSelectedDifficulty,
  setSelectedLanguage,
  setSelectedProblemSlug,
  totalSolved,
  conceptOptions,
}) {
  const monthCalendar = buildMonthCalendar(activityCalendar);

  return (
    <div className="page-stack">
      <section className="hero-grid">
        <article className="hero-card hero-card-wide">
          <div className="eyebrow-row">
            <span className="badge badge-strong">Explore</span>
          </div>
          <h1>Meaningful practice, not random scrolling.</h1>
          <p>
            Build your day with concept-first practice, role-based learning, and
            language-ready preparation that fits placement training and interview prep.
          </p>
          <div className="hero-summary-grid">
            <div className="hero-summary-card">
              <span>Focus concept</span>
              <strong>{selectedConcept}</strong>
            </div>
            <div className="hero-summary-card">
              <span>Difficulty lane</span>
              <strong>{selectedDifficulty}</strong>
            </div>
            <div className="hero-summary-card">
              <span>Language lane</span>
              <strong>{selectedLanguage}</strong>
            </div>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => setActivePage("problems")}>
              Start Solving
            </button>
            <button type="button" className="ghost-button" onClick={() => setActivePage("contest")}>
              View Contest
            </button>
          </div>

          <div className="daily-highlight">
            <div>
              <p className="kicker">Today&apos;s featured problem</p>
              <h3>{dashboard.dailyProblem.title}</h3>
              <p>{dashboard.dailyProblem.description}</p>
              <div className="tag-row">
                {(dashboard.dailyProblem.tags ?? []).map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setSelectedConcept("All Concepts");
                  setSelectedDifficulty(dashboard.dailyProblem.difficulty);
                  setSelectedProblemSlug("");
                  if (dashboard.dailyProblem.preferredLanguage) {
                    setSelectedLanguage(dashboard.dailyProblem.preferredLanguage);
                  }
                  setActivePage("problems");
                }}
              >
                Solve Now
              </button>
            </div>
          </div>
        </article>

        <article className="hero-card hero-card-side">
          <div className="section-head">
            <h2>Practice Calendar</h2>
            <span>{monthCalendar.monthLabel}</span>
          </div>
          <div className="calendar-shell">
            <div className="calendar-topline">
              <div>
                <strong>{monthCalendar.monthLabel}</strong>
                <span>{monthCalendar.activeDays} active days this month</span>
              </div>
              <div className="calendar-legend" aria-hidden="true">
                <span>Low</span>
                <div className="calendar-legend-dots">
                  {[0, 1, 2, 3, 4].map((level) => (
                    <span key={level} className={`calendar-day-dot level-${level}`} />
                  ))}
                </div>
                <span>High</span>
              </div>
            </div>
            <div className="calendar-weekdays">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="calendar-month-grid">
              {monthCalendar.cells.map((item) => (
                <div
                  key={item.key}
                  className={[
                    "calendar-day",
                    item.isCurrentMonth ? "" : "is-outside-month",
                    item.isToday ? "is-today" : "",
                    item.count > 0 ? `level-${Math.min(item.count, 4)}` : "level-0",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={`${item.date} | ${item.count} activities`}
                >
                  <span className="calendar-day-number">{item.dayNumber}</span>
                  <span className={`calendar-day-dot level-${Math.min(item.count, 4)}`} />
                </div>
              ))}
            </div>
          </div>
          <div className="calendar-summary-grid">
            <div className="calendar-summary-card">
              <span>Current streak</span>
              <strong>{dashboard.user.streak} days</strong>
            </div>
            <div className="calendar-summary-card">
              <span>Days logged in</span>
              <strong>{dashboard.user.loginDays}</strong>
            </div>
            <div className="calendar-summary-card">
              <span>Total solved</span>
              <strong>{totalSolved}</strong>
            </div>
            <div className="calendar-summary-card">
              <span>This month</span>
              <strong>{monthCalendar.totalActivity} actions</strong>
              <small>{monthCalendar.activeDays} days with activity recorded</small>
            </div>
          </div>
        </article>
      </section>

      <section className="surface-card explore-company-strip">
        <div className="section-head">
          <h2>Role-Based Learning Roadmaps</h2>
          <span>Roadmap details will be expanded soon for each learning role</span>
        </div>
        <div className="company-scroll-row">
          {roleTracks.map((track) => (
            <article key={track.role} className="company-card company-card-wide">
              <div className="company-top">
                <strong>{track.role}</strong>
                <span>{track.status}</span>
              </div>
              <h3>{track.title}</h3>
              <p>{track.focus}</p>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSelectedRoadmapId(track.id);
                  setActivePage("roadmaps");
                }}
              >
                Explore more
              </button>
            </article>
          ))}
          <article className="company-card company-card-wide roadmap-more-card">
            <div className="company-top">
              <strong>Explore More Paths</strong>
              <span>All roles</span>
            </div>
            <h3>Open roadmap library</h3>
            <p>See all role learning paths together in one place before we attach the full roadmap.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSelectedRoadmapId("");
                setActivePage("roadmaps");
              }}
            >
              View all
            </button>
          </article>
        </div>
      </section>

      <section className="content-grid explore-content-grid">
        <article className="surface-card">
          <div className="section-head">
            <h2>Practice Builder</h2>
            <span>Select concept, difficulty, and language before opening problems</span>
          </div>

          <div className="filter-section">
            <span className="filter-label">Concepts</span>
            <div className="chip-scroll">
              {conceptOptions.map((concept) => (
                <button
                  key={concept}
                  type="button"
                  className={concept === selectedConcept ? "switch-pill active" : "switch-pill"}
                  onClick={() => setSelectedConcept(concept)}
                >
                  {concept}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-label">Difficulty</span>
            <div className="difficulty-switcher">
              {difficultyOrder.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={item === selectedDifficulty ? "switch-pill active" : "switch-pill"}
                  onClick={() => setSelectedDifficulty(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-label">Languages</span>
            <select
              className="difficulty-select language-select"
              value={selectedLanguage}
              onChange={(event) => setSelectedLanguage(event.target.value)}
            >
              {languageOptions.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </div>

          <div className="practice-preview-list">
            {filteredPreviewProblems.length > 0 ? (
              filteredPreviewProblems.map((problem) => (
                <button
                  key={problem.slug}
                  type="button"
                  className="practice-preview-item"
                  onClick={() => {
                    setSelectedProblemSlug("");
                    setActivePage("problems");
                  }}
                >
                  <div>
                    <strong>{problem.title}</strong>
                    <p>{(problem.tags ?? []).join(" | ")}</p>
                  </div>
                  <span className={`mini-pill ${(problem.difficulty || 'Easy').toLowerCase()}`}>
                    {problem.difficulty || 'Easy'}
                  </span>
                </button>
              ))
            ) : (
              <div className="empty-filter-state">
                <strong>No exact match yet.</strong>
                <p>Try another concept or switch the language lane.</p>
              </div>
            )}
          </div>

          <div className="builder-actions">
            <button type="button" className="primary-button" onClick={() => setActivePage("problems")}>
              Open Practice Board
            </button>
          </div>
        </article>

        <article className="surface-card">
          <div className="section-head">
            <h2>Announcements</h2>
            <span>Important practice updates and roadmap notes</span>
          </div>
          <div className="featured-path-list">
            {(dashboard.announcements && dashboard.announcements.length > 0) ? (
              dashboard.announcements.map((announcement) => (
                <article key={announcement.id} className={`lane-card lane-${
                  announcement.category === 'contest' ? 'olive' : 
                  announcement.category === 'leaderboard' ? 'purple' : 'neutral'
                }`}>
                  <div className="lane-header">
                    <span>{announcement.category.toUpperCase()}</span>
                    <span className="lane-date">{announcement.date}</span>
                  </div>
                  <strong>{announcement.title}</strong>
                  <p>{announcement.content}</p>
                </article>
              ))
            ) : (
              <div className="inbox-empty" style={{ gridColumn: '1 / -1', background: 'var(--bg-2)', borderRadius: '16px', padding: '40px', textAlign: 'center', width: '100%' }}>
                <MessageSquare size={32} style={{ marginBottom: '12px', color: 'var(--text-soft)', margin: '0 auto' }} />
                <p style={{ color: 'var(--text-soft)', margin: 0 }}>No active announcements for today.</p>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

export default ExplorePage;
