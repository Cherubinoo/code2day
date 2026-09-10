import React, { useState, useEffect } from "react";
import MilestoneQuiz from "./MilestoneQuiz";
import CompanyTracker from "./CompanyTracker";
import CustomSkillPage from "./CustomSkillPage";

const SRM_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap");

.srm-page-wrapper {
  font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
  background-color: #F6F3EE;
  color: #1F2022;
  min-height: 100vh;
  padding: 24px 36px 48px;
  box-sizing: border-box;
}

.srm-page-wrapper * {
  box-sizing: border-box;
}

/* TOP HEADER */
.srm-top-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 20px;
  margin-bottom: 24px;
  border-bottom: 1px solid #E6E0D7;
}

.srm-brand {
  display: flex;
  flex-direction: column;
}

.srm-brand-title {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 1.5px;
  color: #1F2022;
  margin: 0;
  text-transform: uppercase;
}

.srm-brand-tagline {
  font-size: 11px;
  color: #8C857B;
  font-weight: 600;
  margin-top: 2px;
  letter-spacing: 0.5px;
}

.srm-search-bar {
  position: relative;
  width: 440px;
}

.srm-search-input {
  width: 100%;
  background: #EBE5DC;
  border: 1px solid #DFD8CE;
  border-radius: 24px;
  padding: 10px 18px 10px 42px;
  font-size: 13px;
  color: #1F2022;
  outline: none;
  font-family: inherit;
}

.srm-search-input::placeholder {
  color: #9C9488;
}

.srm-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #7D766C;
  font-size: 14px;
}

.srm-top-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.srm-icon-btn {
  background: transparent;
  border: none;
  color: #4A4640;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.srm-user-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.srm-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #2E3135;
  color: #FFF;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.srm-user-name {
  font-size: 13px;
  font-weight: 700;
  color: #1F2022;
}

/* MAIN HEADER */
.srm-main-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.srm-main-title {
  font-size: 32px;
  font-weight: 900;
  color: #1F2022;
  margin: 0 0 6px;
  letter-spacing: -0.8px;
}

.srm-main-sub {
  font-size: 14px;
  color: #7D766C;
  margin: 0;
  font-weight: 500;
}

.srm-header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.srm-level-card {
  background: #EBE5DC;
  border: 1px solid #DFD8CE;
  border-radius: 14px;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.srm-level-icon-box {
  width: 32px;
  height: 32px;
  background: #DFD8CE;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1F2022;
}

.srm-level-info {
  display: flex;
  flex-direction: column;
}

.srm-level-title {
  font-size: 13px;
  font-weight: 800;
  color: #1F2022;
}

.srm-level-sub {
  font-size: 11px;
  color: #7D766C;
  font-weight: 600;
}

.srm-regen-btn {
  background: #2E3135;
  color: #F6F3EE;
  border: none;
  border-radius: 12px;
  padding: 12px 22px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  font-family: inherit;
}

.srm-regen-btn:hover {
  background: #1F2022;
  transform: translateY(-1px);
}

/* PROGRESS SUMMARY CARD */
.srm-summary-card {
  background: #EBE5DC;
  border: 1px solid #DFD8CE;
  border-radius: 18px;
  padding: 20px 28px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 28px;
}

.srm-summary-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-right: 20px;
  border-right: 1px solid #DFD8CE;
}

.srm-summary-item:last-child {
  border-right: none;
  padding-right: 0;
}

.srm-radial-box {
  position: relative;
  width: 54px;
  height: 54px;
  flex-shrink: 0;
}

.srm-radial-val {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
  color: #1F2022;
}

.srm-summary-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #DFD8CE;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1F2022;
  flex-shrink: 0;
}

.srm-summary-label {
  font-size: 13px;
  font-weight: 800;
  color: #1F2022;
  margin-bottom: 2px;
}

.srm-summary-desc {
  font-size: 11px;
  color: #7D766C;
  font-weight: 500;
}

/* LAYOUT */
.srm-two-col {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 24px;
  align-items: start;
}

@media (max-width: 1024px) {
  .srm-two-col { grid-template-columns: 1fr; }
  .srm-summary-card { grid-template-columns: repeat(2, 1fr); }
  .srm-search-bar { width: 280px; }
}

/* CARDS COMMON */
.srm-card {
  background: #EBE5DC;
  border: 1px solid #DFD8CE;
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 20px;
}

.srm-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.srm-card-title {
  font-size: 18px;
  font-weight: 800;
  color: #1F2022;
  margin: 0 0 4px;
}

.srm-card-sub {
  font-size: 12px;
  color: #7D766C;
  margin: 0;
  font-weight: 500;
}

.srm-badge {
  background: #DFD8CE;
  color: #1F2022;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 12px;
}

/* LEFT TIMELINE */
.srm-timeline {
  position: relative;
  padding-left: 48px;
  margin-top: 10px;
}

.srm-timeline-line {
  position: absolute;
  left: 18px;
  top: 24px;
  bottom: 24px;
  width: 2px;
  background: #DFD8CE;
}

.srm-milestone-item {
  position: relative;
  margin-bottom: 16px;
}

.srm-milestone-item:last-child {
  margin-bottom: 0;
}

.srm-milestone-node {
  position: absolute;
  left: -48px;
  top: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #EBE5DC;
  border: 2px solid #DFD8CE;
  color: #1F2022;
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}

.srm-milestone-node.active {
  background: #2E3135;
  border-color: #2E3135;
  color: #F6F3EE;
}

.srm-milestone-node.completed {
  background: #1F2022;
  border-color: #1F2022;
  color: #FFF;
}

.srm-mcard {
  background: #F6F3EE;
  border: 1px solid #DFD8CE;
  border-radius: 14px;
  padding: 16px 20px;
  transition: all 0.2s ease;
}

.srm-mcard:hover {
  border-color: #C2B9AC;
  box-shadow: 0 4px 12px rgba(0,0,0,0.03);
}

.srm-mcard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.srm-mcard-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}

.srm-tag-cat {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #EBE5DC;
  color: #4A4640;
  border: 1px solid #DFD8CE;
}

.srm-tag-diff {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 3px 8px;
  border-radius: 4px;
  background: #EBE5DC;
  color: #7D766C;
  border: 1px solid #DFD8CE;
}

.srm-mcard-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.srm-mcard-duration {
  font-size: 12px;
  color: #7D766C;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.srm-mcard-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 110px;
}

.srm-progress-bar {
  flex: 1;
  height: 6px;
  background: #EBE5DC;
  border-radius: 3px;
  overflow: hidden;
}

.srm-progress-fill {
  height: 100%;
  background: #2E3135;
  border-radius: 3px;
}

.srm-progress-pct {
  font-size: 11px;
  font-weight: 800;
  color: #1F2022;
  width: 28px;
}

.srm-mcard-title {
  font-size: 15px;
  font-weight: 800;
  color: #1F2022;
  margin: 0 0 4px;
}

.srm-mcard-desc {
  font-size: 12px;
  color: #7D766C;
  margin: 0;
  line-height: 1.4;
}

.srm-quiz-btn {
  margin-top: 12px;
  background: #2E3135;
  color: #F6F3EE;
  border: none;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  transition: all 0.2s ease;
}

.srm-quiz-btn:hover {
  background: #1F2022;
}

/* RIGHT COLUMN - CUSTOM SKILL ROADMAP */
.srm-custom-card {
  position: relative;
  overflow: hidden;
}

.srm-custom-header-icon {
  width: 44px;
  height: 44px;
  background: #DFD8CE;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #1F2022;
}

.srm-custom-input-box {
  position: relative;
  margin-top: 16px;
  margin-bottom: 12px;
}

.srm-custom-input {
  width: 100%;
  background: #F6F3EE;
  border: 1px solid #DFD8CE;
  border-radius: 12px;
  padding: 12px 16px 12px 42px;
  font-size: 13px;
  color: #1F2022;
  outline: none;
  font-family: inherit;
}

.srm-custom-btn {
  width: 100%;
  background: #2E3135;
  color: #F6F3EE;
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 16px;
  font-family: inherit;
  transition: all 0.2s ease;
}

.srm-custom-btn:hover {
  background: #1F2022;
}

.srm-pills-label {
  font-size: 11px;
  color: #7D766C;
  font-weight: 600;
  margin-bottom: 8px;
}

.srm-pills {
  display: flex;
  gap: 8px;
}

.srm-pill {
  background: #DFD8CE;
  color: #1F2022;
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
}

.srm-pill:hover {
  background: #D4C5B5;
}

/* COMPANY-BASED TRACKER CARD */
.srm-company-card {
  background: #2E3135;
  border: 1px solid #1F2022;
  border-radius: 20px;
  padding: 24px;
  color: #F6F3EE;
}

.srm-company-icon {
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #F6F3EE;
}

.srm-company-logos {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}

.srm-company-logo-chip {
  background: #FFF;
  color: #1F2022;
  font-weight: 900;
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
}

.srm-company-plus {
  background: rgba(255, 255, 255, 0.1);
  color: #FFF;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
}

.srm-company-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 20px;
}

.srm-cmetric {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
}

.srm-cmetric-icon {
  font-size: 14px;
  margin-bottom: 4px;
}

.srm-cmetric-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 600;
}

.srm-company-go-btn {
  width: 100%;
  background: transparent;
  color: #F6F3EE;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
  font-family: inherit;
}

.srm-company-go-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.6);
}

/* ANALYTICS SUMMARY CARD */
.srm-analytics-card {
  background: #EBE5DC;
  border: 1px solid #DFD8CE;
  border-radius: 20px;
  padding: 24px;
}

.srm-analytics-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  padding: 10px 0;
  border-bottom: 1px solid #DFD8CE;
}

.srm-analytics-row:last-child {
  border-bottom: none;
}

.srm-analytics-label {
  color: #7D766C;
  font-weight: 600;
}

.srm-analytics-val {
  font-weight: 800;
  color: #1F2022;
}
`;

const RadialCircle = ({ pct, size = 54, stroke = 5 }) => {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#DFD8CE" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2E3135" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
};

const SmartRoadmap = ({ token, API_BASE, user, setUser, fetchWithAuth, setActiveTab, activeSkillTarget, setActiveSkillTarget }) => {
  const [advisorData, setAdvisorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [targetCompany] = useState("Zoho");
  const [customInput, setCustomInput] = useState("");
  const [subPage, setSubPage] = useState(null);
  const [quizMilestone, setQuizMilestone] = useState(null);

  useEffect(() => {
    fetchAdvisorData(targetCompany, activeSkillTarget);
  }, [token, targetCompany, activeSkillTarget]);

  const fetchAdvisorData = async (company, skill = "") => {
    if (!token || !fetchWithAuth) return;
    setLoading(true);
    try {
      const url = skill
        ? `${API_BASE}/api/learning/advisor/?learn_skill=${encodeURIComponent(skill)}`
        : `${API_BASE}/api/learning/advisor/?target_company=${company}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
      if (res.ok) setAdvisorData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    if (!token) return;
    if (advisorData) {
      const updated = advisorData.milestones.map(m => m.id === taskId ? { ...m, completed: true, progress_percentage: 100 } : m);
      const done = updated.filter(m => m.completed).length;
      setAdvisorData(p => ({ ...p, milestones: updated, weekly_review: { ...p.weekly_review, tasks_completed: done, progress_percentage: Math.round((done / updated.length) * 100) } }));
    }
    setQuizMilestone(null);
    try {
      await fetch(`${API_BASE}/api/learning/tasks/${taskId}/complete/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    } catch (e) { console.error(e); }
  };

  const handleCreateCustom = (skillName) => {
    const target = skillName || customInput;
    if (!target) return;
    if (setActiveSkillTarget) setActiveSkillTarget(target);
    setSubPage("custom_skill");
  };

  if (subPage === "company_tracker") return <CompanyTracker onBack={() => setSubPage(null)} />;
  if (subPage === "custom_skill") return (
    <CustomSkillPage
      onBack={() => setSubPage(null)}
      activeSkillTarget={activeSkillTarget}
      setActiveSkillTarget={sk => { if (setActiveSkillTarget) setActiveSkillTarget(sk); }}
      onCreateRoadmap={sk => { if (setActiveSkillTarget) setActiveSkillTarget(sk); setSubPage(null); }}
    />
  );

  // Fallback milestone data matching the clean prompt specs if API loading or default
  const milestonesList = advisorData?.milestones && advisorData.milestones.length > 0 ? advisorData.milestones : [
    { id: 1, num: "01", milestone_name: "DSA Foundations", category: "DSA", difficulty: "Medium", duration: "2 Weeks", progress_percentage: 40, description: "Master core arrays, strings, hashing, and sliding window concepts." },
    { id: 2, num: "02", milestone_name: "Advanced DSA & Graphs", category: "DSA", difficulty: "Hard", duration: "2 Weeks", progress_percentage: 0, description: "Understand complex tree hierarchies, depth-first traversals, and dynamic programming." },
    { id: 3, num: "03", milestone_name: "System Design Basics", category: "System Design", difficulty: "Medium", duration: "1 Week", progress_percentage: 0, description: "Learn vertical/horizontal scaling, client-server models, and caching layers." },
    { id: 4, num: "04", milestone_name: "Interview Readiness", category: "Mock Interviews", difficulty: "Easy", duration: "1 Week", progress_percentage: 0, description: "Simulate technical questions and formulate soft-skills using the STAR framework." },
    { id: 5, num: "05", milestone_name: "Resume Optimization", category: "Resume", difficulty: "Medium", duration: "1 Week", progress_percentage: 0, description: "Tailor resume summaries and keyword structures to match target company hiring requirements." }
  ];

  return (
    <div className="srm-page-wrapper">
      <style>{SRM_CSS}</style>

      {/* TOP HEADER */}
      <header className="srm-top-header">
        <div className="srm-brand">
          <span className="srm-brand-title">Learn2Lead</span>
          <span className="srm-brand-tagline">Learn · Practice · Grow</span>
        </div>

        <div className="srm-search-bar">
          <span className="srm-search-icon">🔍</span>
          <input className="srm-search-input" placeholder="Search for skills, companies, or anything..." />
        </div>

        <div className="srm-top-right">
          <button className="srm-icon-btn">🔔</button>
          <div className="srm-user-pill">
            <div className="srm-avatar">H</div>
            <span className="srm-user-name">Hello, Harish</span>
            <span style={{ fontSize: 10, color: "#7D766C" }}>▼</span>
          </div>
        </div>
      </header>

      {/* MAIN TITLE HEADER */}
      <div className="srm-main-header">
        <div>
          <h1 className="srm-main-title">Smart Career Roadmap</h1>
          <p className="srm-main-sub">A personalized learning path to bridge skill gaps and achieve your placement goals.</p>
        </div>

        <div className="srm-header-actions">
          <div className="srm-level-card">
            <div className="srm-level-icon-box">📊</div>
            <div className="srm-level-info">
              <span className="srm-level-title">Level 1</span>
              <span className="srm-level-sub">70 XP · 2 Days Active</span>
            </div>
          </div>

          <button className="srm-regen-btn" onClick={() => fetchAdvisorData(targetCompany)}>
            <span>↻</span> Regenerate Roadmap
          </button>
        </div>
      </div>

      {/* PROGRESS SUMMARY BAR */}
      <div className="srm-summary-card">
        <div className="srm-summary-item">
          <div className="srm-radial-box">
            <RadialCircle pct={79} />
            <div className="srm-radial-val">79%</div>
          </div>
          <div>
            <div className="srm-summary-label">Placement Readiness</div>
            <div className="srm-summary-desc">Based on your profile analysis</div>
          </div>
        </div>

        <div className="srm-summary-item">
          <div className="srm-radial-box">
            <RadialCircle pct={32} />
            <div className="srm-radial-val">32%</div>
          </div>
          <div>
            <div className="srm-summary-label">Roadmap Progress</div>
            <div className="srm-summary-desc">2 of 5 milestones completed</div>
          </div>
        </div>

        <div className="srm-summary-item">
          <div className="srm-summary-icon">🎯</div>
          <div>
            <div className="srm-summary-label">Current Focus</div>
            <div className="srm-summary-desc" style={{ fontWeight: 800, color: "#1F2022" }}>DSA Foundations</div>
          </div>
        </div>

        <div className="srm-summary-item">
          <div className="srm-summary-icon">📅</div>
          <div>
            <div className="srm-summary-label">Target Timeline</div>
            <div className="srm-summary-desc" style={{ fontWeight: 800, color: "#1F2022" }}>2 Weeks</div>
            <div className="srm-summary-desc">for current milestone</div>
          </div>
        </div>
      </div>

      {/* TWO COLUMN CONTENT */}
      <div className="srm-two-col">

        {/* LEFT COLUMN: YOUR CAREER ROADMAP */}
        <div className="srm-card">
          <div className="srm-card-header">
            <div>
              <h2 className="srm-card-title">Your Career Roadmap</h2>
              <p className="srm-card-sub">A step-by-step learning path tailored to your goals.</p>
            </div>
            <span className="srm-badge">5 Milestones</span>
          </div>

          <div className="srm-timeline">
            <div className="srm-timeline-line"></div>
            {milestonesList.map((m, idx) => {
              const numStr = m.num || `0${idx + 1}`;
              const isFirst = idx === 0;
              const pct = m.completed ? 100 : (m.progress_percentage || 0);

              return (
                <div key={m.id || idx} className="srm-milestone-item">
                  <div className={`srm-milestone-node ${isFirst ? 'active' : ''} ${m.completed ? 'completed' : ''}`}>
                    {m.completed ? '✓' : numStr}
                  </div>

                  <div className="srm-mcard">
                    <div className="srm-mcard-header">
                      <div className="srm-mcard-tags">
                        <span className="srm-tag-cat">{m.category}</span>
                        <span className="srm-tag-diff">{m.difficulty}</span>
                      </div>

                      <div className="srm-mcard-right">
                        <span className="srm-mcard-duration">🕒 {m.duration}</span>
                        <div className="srm-mcard-progress">
                          <div className="srm-progress-bar">
                            <div className="srm-progress-fill" style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="srm-progress-pct">{pct}%</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#7D766C" }}>▼</span>
                      </div>
                    </div>

                    <h3 className="srm-mcard-title">{m.milestone_name}</h3>
                    <p className="srm-mcard-desc">{m.description}</p>

                    {!m.completed && (
                      <button className="srm-quiz-btn" onClick={() => setQuizMilestone(m)}>
                        🧪 Take MCQ Quiz to Unlock
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* CUSTOM SKILL ROADMAP CARD */}
          <div className="srm-card srm-custom-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 className="srm-card-title">Custom Skill Roadmap</h2>
                <p className="srm-card-sub">Build a focused learning path for any skill.</p>
              </div>
              <div className="srm-custom-header-icon">📖</div>
            </div>

            <div className="srm-custom-input-box">
              <span className="srm-search-icon">🔍</span>
              <input
                className="srm-custom-input"
                placeholder="e.g. Kubernetes, LangChain, AWS..."
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
              />
            </div>

            <button className="srm-custom-btn" onClick={() => handleCreateCustom()}>
              Create Roadmap →
            </button>

            <div className="srm-pills-label">Popular suggestions</div>
            <div className="srm-pills">
              {["Python", "System Design", "Communication"].map((s) => (
                <button key={s} className="srm-pill" onClick={() => handleCreateCustom(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* COMPANY-BASED TRACKER CARD */}
          <div className="srm-company-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Company-Based Tracker</h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>Prepare for the skills required by your target company.</p>
              </div>
              <div className="srm-company-icon">🏢</div>
            </div>

            <div className="srm-company-logos">
              <div className="srm-company-logo-chip" style={{ color: "#E42527" }}>zoho</div>
              <div className="srm-company-logo-chip" style={{ color: "#00569B" }}>tcs</div>
              <div className="srm-company-logo-chip" style={{ color: "#007CC3" }}>Infosys</div>
              <div className="srm-company-logo-chip" style={{ color: "#FF9900" }}>amazon</div>
              <div className="srm-company-plus">+</div>
            </div>

            <div className="srm-company-metrics">
              <div className="srm-cmetric">
                <div className="srm-cmetric-icon">📊</div>
                <div className="srm-cmetric-text">Company-wise skill analysis</div>
              </div>
              <div className="srm-cmetric">
                <div className="srm-cmetric-icon">🎯</div>
                <div className="srm-cmetric-text">Readiness tracking</div>
              </div>
              <div className="srm-cmetric">
                <div className="srm-cmetric-icon">📋</div>
                <div className="srm-cmetric-text">Personalized practice plan</div>
              </div>
            </div>

            <button className="srm-company-go-btn" onClick={() => setSubPage("company_tracker")}>
              Go to Company Tracker →
            </button>
          </div>

          {/* ANALYTICS / WEEKLY REVIEW CARD */}
          <div className="srm-analytics-card" style={{ marginTop: 20 }}>
            <h2 className="srm-card-title">Analytics & Weekly Review</h2>
            <p className="srm-card-sub">Compiled performance summary across custom & career tracks.</p>

            <div className="srm-analytics-row">
              <span className="srm-analytics-label">Tasks Completed</span>
              <span className="srm-analytics-val">{advisorData?.weekly_review?.tasks_completed || 2} Milestones</span>
            </div>
            <div className="srm-analytics-row">
              <span className="srm-analytics-label">Roadmap Progress</span>
              <span className="srm-analytics-val">{advisorData?.weekly_review?.progress_percentage || 32}%</span>
            </div>
            <div className="srm-analytics-row">
              <span className="srm-analytics-label">Custom Skill Track</span>
              <span className="srm-analytics-val">{activeSkillTarget || "React (Active)"}</span>
            </div>
            <div className="srm-analytics-row">
              <span className="srm-analytics-label">Target Company</span>
              <span className="srm-analytics-val">Zoho</span>
            </div>
          </div>
        </div>

      </div>

      {/* MCQ QUIZ MODAL */}
      {quizMilestone && (
        <MilestoneQuiz
          milestone={quizMilestone}
          onClose={() => setQuizMilestone(null)}
          onPass={() => handleCompleteTask(quizMilestone.id)}
          API_BASE={API_BASE}
          token={token}
        />
      )}
    </div>
  );
};

export default SmartRoadmap;
