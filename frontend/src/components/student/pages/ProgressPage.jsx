import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  TrendingUp, 
  Brain, 
  Target, 
  Clock, 
  Award, 
  ChevronRight, 
  Building2, 
  CheckCircle2, 
  Zap, 
  Hash, 
  X, 
  MapPin, 
  Calendar,
  Settings,
  Plus,
  Minus,
  Search,
  Trophy,
  Users,
  GraduationCap,
  UserCheck,
  Download,
  Loader2
} from 'lucide-react';
import ContestDashboardWidget from '../ContestDashboardWidget';
import { PerformanceDashboard, AptitudeProgressRadar, TopicRadarChart, DifficultyDistributionChart, RankedBarChart } from '../../common/PerformanceCharts';
import AnimatedNumber from '../../common/AnimatedNumber';
import { getCsrfToken, extractApiError } from '../../../lib/appUtils';
import { appUrlForPage } from '../../../lib/useHistoryNav';
import { useTabNav } from '../../../lib/useTabNav';

const shimmerStyles = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

const getBadgeVisuals = (name) => {
  const n = name.toLowerCase();
  if (n.includes('grandmaster')) 
    return { color: '#7e22ce', icon: <Award size={22} />, bg: 'linear-gradient(135deg, #f3e8ff, #e9d5ff)' };
  if (n.includes('veteran')) 
    return { color: '#0369a1', icon: <Award size={20} />, bg: 'linear-gradient(135deg, #e0f2fe, #bae6fd)' };
  if (n.includes('master') || n.includes('guru') || n.includes('ace')) 
    return { color: '#b45309', icon: <Trophy size={20} />, bg: 'linear-gradient(135deg, #fef3c7, #fde68a)' };
  if (n.includes('specialist') || n.includes('adept') || n.includes('practitioner')) 
    return { color: '#334155', icon: <Award size={20} />, bg: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' };
  if (n.includes('explorer') || n.includes('warrior') || n.includes('initiate')) 
    return { color: '#7c2d12', icon: <Target size={20} />, bg: 'linear-gradient(135deg, #ffedd5, #fed7aa)' };
  if (n.includes('streak')) 
    return { color: '#991b1b', icon: <TrendingUp size={20} />, bg: 'linear-gradient(135deg, #fee2e2, #fecaca)' };
  if (n.includes('contest')) 
    return { color: '#1e40af', icon: <Users size={20} />, bg: 'linear-gradient(135deg, #dbeafe, #bfdbfe)' };
  return { color: '#3730a3', icon: <CheckCircle2 size={20} />, bg: 'linear-gradient(135deg, #e0e7ff, #c7d2fe)' };
};

const BadgeCard = ({ badge, earned, setSelectedBadge }) => {
  const visuals = getBadgeVisuals(badge.name);
  return (
    <article 
      onClick={() => setSelectedBadge({
        name: badge.name,
        description: badge.description,
        icon: visuals.icon,
        date: badge.date || "In Progress",
        visuals: visuals,
        is_earned: earned
      })}
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem', 
        padding: '1rem',
        background: earned ? 'white' : 'var(--bg-2)',
        border: earned ? '2px solid var(--accent)' : '1px solid var(--border-soft)',
        borderRadius: '20px',
        cursor: 'pointer',
        opacity: earned ? 1 : 0.5,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: earned ? '0 10px 20px rgba(196, 151, 67, 0.1)' : 'none',
        transform: earned ? 'scale(1.02)' : 'scale(1)'
      }}
    >
      <div style={{ 
        width: '48px', 
        height: '48px', 
        background: earned ? visuals.bg : 'var(--text-muted)', 
        borderRadius: '14px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        color: earned ? visuals.color : '#fff',
        flexShrink: 0
      }}>
        {visuals.icon}
      </div>
      <div style={{ overflow: 'hidden' }}>
        <strong style={{ display: 'block', fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {badge.name}
        </strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 600 }}>
          {earned ? `Earned ${badge.date}` : 'Locked Milestone'}
        </span>
      </div>
    </article>
  );
};

// ─── Mentor & Class Advisor Card ─────────────────────────────────────────────

function useMentorAdvisor() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch('/api/student/mentor-advisor/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, []);
  return data;
}

function MentorAdvisorCard() {
  const data = useMentorAdvisor();
  if (!data) return null;
  const { mentor, class_advisor } = data;
  if (!mentor && !class_advisor) return null;

  return (
    <div className="surface-card" style={{ background: 'white', borderRadius: 32, padding: 32, boxShadow: '0 15px 35px rgba(0,0,0,0.03)', border: '1px solid var(--border-soft)' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 900, marginBottom: 20, color: 'var(--text-hard)' }}>My Faculty</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {mentor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#f0fdf4', borderRadius: 18, border: '1px solid #bbf7d0' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <UserCheck size={20} color="#065f46" />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Mentor</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>{mentor.name}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>{mentor.faculty_id}</div>
            </div>
          </div>
        )}

        {class_advisor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#eff6ff', borderRadius: 18, border: '1px solid #bfdbfe' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <GraduationCap size={20} color="#1d4ed8" />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Class Advisor</div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#111827' }}>{class_advisor.name}</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 500 }}>{class_advisor.faculty_id}</div>
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500, paddingTop: 4 }}>
          Batch <strong>{data.batch}</strong>{data.section ? <> · Section <strong>{data.section}</strong></> : ''} · {data.department}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProgressPage({ contestCards, contestHistory, dashboard, setDashboard, onNavigateToContest, problemSet }) {
  const [activeTab, setActiveTab] = useTabNav('overall');
  const [selectedBadge, setSelectedBadge] = useState(null);
  const [selectedCompanyDetail, setSelectedCompanyDetail] = useState(null);
  const [selectedTopicDetail, setSelectedTopicDetail] = useState(null);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [modalSearchTerm, setModalSearchTerm] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [selfAnalytics, setSelfAnalytics] = useState(null);
  const [localTracked, setLocalTracked] = useState(() => dashboard?.user?.tracked_companies || []);

  useEffect(() => {
    fetch('/api/student/analytics/', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSelfAnalytics(d.analytics); })
      .catch(() => {});
  }, []);

  // Sync local tracked list whenever dashboard loads / changes from the server
  useEffect(() => {
    if (Array.isArray(dashboard?.user?.tracked_companies)) {
      setLocalTracked(dashboard.user.tracked_companies);
    }
  }, [dashboard?.user?.tracked_companies]);

  if (!dashboard) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Loading unified progress...</div>;
  }

  const user = dashboard?.user || {};
  const stats = dashboard?.stats || {};

  const computedSolvedFromSet = useMemo(() => {
    if (!Array.isArray(problemSet)) return { easy: 0, medium: 0, hard: 0, total: 0 };
    const solved = problemSet.filter(p => p.progress_state === "completed");
    const e = solved.filter(p => p.difficulty === "Easy").length;
    const m = solved.filter(p => p.difficulty === "Medium").length;
    const h = solved.filter(p => p.difficulty === "Hard").length;
    return { easy: e, medium: m, hard: h, total: e + m + h };
  }, [problemSet]);

  const easy = Math.max(Number(stats.easy) || 0, computedSolvedFromSet.easy);
  const medium = Math.max(Number(stats.medium) || 0, computedSolvedFromSet.medium);
  const hard = Math.max(Number(stats.hard) || 0, computedSolvedFromSet.hard);
  const totalCodingSolved = easy + medium + hard;
  const totalSqlSolved = Number(stats.sql) || 0;
  const totalCodingInSystem = user.total_problems_count || problemSet?.length || 1;


  // Company Track - uses local state so UI updates instantly on toggle
  const trackedCompaniesList = localTracked;
  const trackedCompaniesListLower = useMemo(
    () => trackedCompaniesList.map(c => c.toLowerCase()),
    [trackedCompaniesList]
  );
  // Case-insensitive lowercase -> as-tracked-name lookup, so a problem's
  // company tag matches regardless of casing but aggregates under the name
  // the student actually tracked (not the tag's own casing).
  const trackedCompaniesLowerMap = useMemo(() => {
    const map = new Map();
    trackedCompaniesList.forEach(c => map.set(c.toLowerCase(), c));
    return map;
  }, [trackedCompaniesList]);

  const allAvailableCompanies = useMemo(() => {
    if (!problemSet) return [];
    const comps = new Set();
    problemSet.forEach(p => {
      if (p.companies) {
        p.companies.split(',').forEach(c => {
          const trimmed = c.trim();
          if (trimmed) comps.add(trimmed);
        });
      }
    });
    return Array.from(comps).sort();
  }, [problemSet]);

  const companyProgress = useMemo(() => {
    if (!problemSet) return [];
    const solvedComps = {};
    problemSet.forEach(p => {
      if (p.companies && p.progress_state === 'completed') {
        const comps = p.companies.split(',').map(c => c.trim()).filter(Boolean);
        comps.forEach(c => {
          // Only show if user has explicitly tracked this company (matched
          // case-insensitively, aggregated under the as-tracked name)
          const trackedName = trackedCompaniesLowerMap.get(c.toLowerCase());
          if (trackedName) {
            if (!solvedComps[trackedName]) solvedComps[trackedName] = [];
            solvedComps[trackedName].push({ title: p.title, difficulty: p.difficulty, slug: p.slug });
          }
        });
      }
    });

    // Ensure all tracked companies are represented even if 0 solved
    trackedCompaniesList.forEach(c => {
      if (!solvedComps[c]) solvedComps[c] = [];
    });

    return Object.entries(solvedComps)
      .map(([name, problems]) => ({ name, count: problems.length, problems }))
      .filter(comp => comp.name.toLowerCase().includes(companySearchTerm.toLowerCase()))
      .sort((a, b) => b.count - a.count);
  }, [problemSet, trackedCompaniesList, trackedCompaniesLowerMap, companySearchTerm]);

  // Coding topic mastery — solved/total per tag across the whole problem
  // bank, computed client-side from problemSet (same source companyProgress
  // uses) since the bank isn't otherwise topic-tagged with totals server-side.
  const codingTopicMastery = useMemo(() => {
    if (!problemSet) return [];
    const counts = {};
    problemSet.forEach(p => {
      (p.tags || []).forEach(tag => {
        if (!counts[tag]) counts[tag] = { solved: 0, total: 0 };
        counts[tag].total += 1;
        if (p.progress_state === 'completed') counts[tag].solved += 1;
      });
    });
    return Object.entries(counts)
      .map(([topic, c]) => ({
        topic,
        accuracy: c.total ? Math.round((c.solved / c.total) * 100) : 0,
        total: c.total,
        correct: c.solved,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 14);
  }, [problemSet]);

  // Clicking a point/label on the coding topic radar opens this — every
  // problem tagged with that topic, solved or not, so a click both selects
  // the topic and lets the student "check" it.
  function openTopicDetail(item) {
    const tag = item.topic;
    const problems = (problemSet || []).filter(p => (p.tags || []).includes(tag));
    setSelectedTopicDetail({ topic: tag, accuracy: item.accuracy, problems });
  }

  // Company readiness radar — same 20%-per-solved scaling already used for
  // each company card's progress bar, reused here across all tracked
  // companies at once.
  const companyReadinessRadar = useMemo(() => (
    companyProgress.map(c => ({ topic: c.name, accuracy: Math.min(c.count * 20, 100), total: undefined, correct: c.count }))
  ), [companyProgress]);

  const companyRankedBars = useMemo(() => (
    companyProgress.map(c => ({ label: c.name, value: c.count }))
  ), [companyProgress]);

  // Difficulty mix across every solved problem behind a tracked company
  // (a problem solved for two tracked companies counts once per company).
  const trackedDifficultyMix = useMemo(() => {
    const mix = { Easy: 0, Medium: 0, Hard: 0 };
    companyProgress.forEach(c => {
      c.problems.forEach(p => {
        if (mix[p.difficulty] !== undefined) mix[p.difficulty] += 1;
      });
    });
    return mix;
  }, [companyProgress]);

  const filteredModalCompanies = useMemo(() => {
    return allAvailableCompanies.filter(c => 
      c.toLowerCase().includes(modalSearchTerm.toLowerCase())
    );
  }, [allAvailableCompanies, modalSearchTerm]);

  const toggleTrackedCompany = async (companyName) => {
    if (isUpdating) return;

    const snapshot = [...localTracked];
    const isCurrentlyTracked = snapshot.some(c => c.toLowerCase() === companyName.toLowerCase());
    const newList = isCurrentlyTracked
      ? snapshot.filter(c => c.toLowerCase() !== companyName.toLowerCase())
      : [...snapshot, companyName];

    // Instant UI update — no prop-propagation delay
    setLocalTracked(newList);
    setIsUpdating(true);
    setTrackingError('');

    try {
      // getCsrfToken() (shared with the rest of the app) falls back to
      // fetching /api/csrf-token/ itself if the cookie isn't set yet —
      // reading document.cookie directly (the old approach here) silently
      // sends an empty token and gets a 403 if that cookie was missing,
      // which then rolled back with zero visible error.
      const response = await fetch('/api/dashboard/tracked-companies/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ companies: newList }),
        credentials: 'include',
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(extractApiError(data, `Server rejected the update (HTTP ${response.status}).`));
      }

      // Use authoritative list from server response
      const authoritative = Array.isArray(data?.tracked_companies) ? data.tracked_companies : newList;
      setLocalTracked(authoritative);

      if (setDashboard) {
        setDashboard(prev => prev ? {
          ...prev,
          user: { ...prev.user, tracked_companies: authoritative },
          student: { ...(prev.student || {}), tracked_companies: authoritative },
        } : prev);
      }
    } catch (error) {
      console.error('Failed to update tracked companies, rolling back:', error);
      setTrackingError(error.message || 'Failed to update tracked companies.');
      setLocalTracked(snapshot);
    } finally {
      setIsUpdating(false);
    }
  };

  const downloadCompanyReport = async () => {
    if (reportBusy) return;
    setReportBusy(true);
    setReportError("");
    try {
      const res = await fetch('/api/dashboard/tracked-companies/report/', { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to generate report.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'placement_preparation_report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err.message || 'Failed to generate report.');
    } finally {
      setReportBusy(false);
    }
  };

  const totalAptitudeInSystem = user.total_aptitude_count || 100;
  const totalAptitudeSolved = (dashboard?.aptitude_stats || []).reduce((sum, s) => sum + (s.solved || 0), 0);

  const codingRate = Math.min((totalCodingSolved / totalCodingInSystem) * 100, 100);
  const aptitudeRate = (dashboard?.aptitude_stats || []).length > 0 
    ? (dashboard.aptitude_stats.reduce((sum, s) => sum + (s.percentage || 0), 0) / dashboard.aptitude_stats.length)
    : 0;
  
  const contestsAttended = (contestHistory || []).length;
  const contestWins = (contestHistory || []).filter(c => c.solved > 0).length;

  const earnedCodingBadges = (dashboard?.achievements || []).filter(a => a.category === 'coding' && a.is_earned);
  const earnedAptitudeBadges = (dashboard?.achievements || []).filter(a => a.category === 'aptitude' && a.is_earned);

  // ── Performance charts data (from self-analytics API) ─────────────────────
  const scoreHistory = selfAnalytics?.score_history || [];
  const topicAccuracy = selfAnalytics?.topic_accuracy || [];
  const testsCompleted = selfAnalytics?.tests_completed || 0;
  const avgScore = selfAnalytics?.avg_score || 0;
  const peakScore = selfAnalytics?.peak_score || 0;

  const tabs = [
    { id: "overall", label: "Dashboard", icon: <TrendingUp size={18} /> },
    { id: "coding", label: "Coding", icon: <Brain size={18} /> },
    { id: "company", label: "Companies", icon: <Building2 size={18} /> },
    { id: "aptitude", label: "Aptitude", icon: <Target size={18} /> },
  ];

  return (
    <div className="page-stack animate-fade-in" style={{ padding: '40px 60px', background: '#f8f9fa' }}>
      <style>{shimmerStyles}</style>

      {/* Brighter Hero / Readiness Gauge */}
      <section style={{ marginBottom: 40 }}>
        <article className="surface-card" style={{ 
          background: 'white', 
          borderRadius: '32px', 
          padding: '48px', 
          border: '1px solid var(--border-soft)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.04)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Decorative accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '8px', background: 'linear-gradient(90deg, var(--accent), #fcd34d)' }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ maxWidth: '60%' }}>
              <p className="kicker" style={{ color: 'var(--accent)', fontWeight: 800, letterSpacing: '0.1em', marginBottom: 16 }}>PREPARATION OVERVIEW</p>
              <h1 style={{ fontSize: '3rem', fontWeight: 950, marginBottom: 16, color: 'var(--olive-950)', lineHeight: 1.1 }}>
                Analyze Your <br/><span style={{ color: 'var(--accent)' }}>Placement Performance</span>
              </h1>
              <p style={{ color: 'var(--text-soft)', fontSize: '1.2rem', marginBottom: 32, fontWeight: 500, maxWidth: 600 }}>
                Your preparation progress is measured by <strong>problems solved</strong> across coding and aptitude modules against the campus question bank.
              </p>
              
              <div style={{ display: 'flex', gap: 40 }}>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Coding Solved</span>
                  <div style={{ fontSize: '2.4rem', fontWeight: 950, color: 'var(--olive-900)' }}><AnimatedNumber value={totalCodingSolved} duration={1} /></div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Aptitude Solved</span>
                  <div style={{ fontSize: '2.4rem', fontWeight: 950, color: 'var(--olive-900)' }}><AnimatedNumber value={totalAptitudeSolved} duration={1} /></div>
                </div>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>Companies Tracked</span>
                  <div style={{ fontSize: '2.4rem', fontWeight: 950, color: 'var(--olive-900)' }}><AnimatedNumber value={companyProgress.length} duration={1} /></div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 220, height: 220 }}>
                <svg width="220" height="220" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  {/* Background Track */}
                  <circle
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke="#f1f5f9"
                    strokeWidth="10"
                  />
                  {/* Coding Segment (Accent Color) */}
                  <circle
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke="var(--accent)"
                    strokeWidth="10"
                    strokeDasharray={`${codingRate * 2.51} 251`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 1s ease-out' }}
                  />
                  {/* Aptitude Segment (Blue) */}
                  <circle
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke="#0ea5e9"
                    strokeWidth="10"
                    strokeDasharray={`${aptitudeRate * 2.51} 251`}
                    strokeLinecap="round"
                    style={{ 
                      transition: 'stroke-dasharray 1s ease-out',
                      transform: `rotate(${(codingRate / 100) * 360}deg)`,
                      transformOrigin: '50% 50%'
                    }}
                  />
                </svg>
                {/* Center Percentage */}
                <div style={{ 
                  position: 'absolute', 
                  inset: 0, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  textAlign: 'center'
                }}>
                  <span style={{ fontSize: '3rem', fontWeight: 950, color: 'var(--olive-950)', lineHeight: 1 }}>
                    <AnimatedNumber value={`${Math.round((codingRate * 0.75) + (aptitudeRate * 0.25))}%`} duration={1} />
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 4 }}>
                    Ready
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-soft)' }}>Coding</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0ea5e9' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-soft)' }}>Aptitude</span>
                </div>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Bright Tab Switcher */}
      <section className="surface-card" style={{ padding: 8, borderRadius: 24, marginBottom: 40, background: 'white', border: '1px solid var(--border-soft)', boxShadow: '0 10px 20px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '16px 24px',
                borderRadius: 18,
                border: 'none',
                background: activeTab === tab.id ? 'var(--olive-900)' : 'transparent',
                color: activeTab === tab.id ? 'white' : 'var(--text-soft)',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                fontSize: '1rem'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* Main Content Areas */}
      {activeTab === "overall" && (
        <>
        {/* Performance Charts — score history + topic radar */}
        <PerformanceDashboard
          scoreHistory={scoreHistory}
          topicAccuracy={topicAccuracy}
          testsCompleted={testsCompleted}
          avgScore={avgScore}
          peakScore={peakScore}
          solvedCount={selfAnalytics?.solved_count || totalCodingSolved}
          aptitude={selfAnalytics?.aptitude}
          overallPerformance={selfAnalytics?.overall_performance || []}
          profileRadar={selfAnalytics?.profile_radar}
          dailySolvedTrend={selfAnalytics?.daily_solved_trend || []}
          knowledgeDistribution={selfAnalytics?.knowledge_distribution}
          contestPerformance={selfAnalytics?.contest_performance || []}
          summaryCards={selfAnalytics?.summary_cards}
        />

        <div className="tab-fade" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            <div className="surface-card" style={{ background: 'white', borderRadius: 32, padding: 40, boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
              <div className="section-head">
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>Performance Distribution</h2>
                <span style={{ fontWeight: 600, color: 'var(--text-soft)' }}>Detailed breakdown of mastered areas</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 24 }}>
                <div style={{ padding: 32, borderRadius: 24, background: '#fffbeb', border: '2px solid #fef3c7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Brain size={24} />
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 950, color: 'var(--olive-900)' }}>{Math.round(codingRate)}%</span>
                  </div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 900 }}>Coding Mastery</h4>
                  <div style={{ height: 10, width: '100%', background: '#fef3c7', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${codingRate}%`, background: 'var(--accent)', height: '100%' }} />
                  </div>
                  <p style={{ margin: '16px 0 0 0', fontSize: '0.85rem', color: '#b45309', fontWeight: 700 }}>
                    <AnimatedNumber value={totalCodingSolved} duration={0.9} /> solved / <AnimatedNumber value={totalCodingInSystem} duration={0.9} /> total
                  </p>
                </div>

                <div style={{ padding: 32, borderRadius: 24, background: '#f0f9ff', border: '2px solid #e0f2fe' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: '#0ea5e9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Target size={24} />
                    </div>
                    <span style={{ fontSize: '1.2rem', fontWeight: 950, color: 'var(--olive-900)' }}>{Math.round(aptitudeRate)}%</span>
                  </div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: 900 }}>Aptitude Mastery</h4>
                  <div style={{ height: 10, width: '100%', background: '#e0f2fe', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${aptitudeRate}%`, background: '#0ea5e9', height: '100%' }} />
                  </div>
                  <p style={{ margin: '16px 0 0 0', fontSize: '0.85rem', color: '#0369a1', fontWeight: 700 }}>
                    <AnimatedNumber value={totalAptitudeSolved} duration={0.9} /> solved / <AnimatedNumber value={totalAptitudeInSystem} duration={0.9} /> total
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-card" style={{ background: 'white', borderRadius: 32, padding: 40, boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
              <div className="section-head">
                <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>Recent Achievements</h2>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginTop: 24 }}>
                {(dashboard?.achievements || []).filter(a => a.is_earned).slice(0, 4).map(badge => (
                  <BadgeCard key={badge.id} badge={badge} earned={true} setSelectedBadge={setSelectedBadge} />
                ))}
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            <div className="surface-card" style={{ background: 'white', borderRadius: 32, padding: 40, boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
              <div className="section-head">
                <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Contest Stats</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-soft)' }}>Attended</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 950 }}>{contestsAttended}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-soft)' }}>Wins / Podiums</span>
                  <span style={{ fontSize: '1.4rem', fontWeight: 950, color: '#059669' }}>{contestWins}</span>
                </div>
                <div style={{ height: 1, background: 'var(--border-soft)' }} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: 600, marginBottom: 12 }}>Keep participating to boost your skills!</p>
                </div>
              </div>
            </div>

            {/* Mentor & Class Advisor */}
            <MentorAdvisorCard />
          </div>
        </div>
        </>
      )}

      {/* Coding Tab */}
      {activeTab === "coding" && (
        <div className="tab-fade surface-card" style={{ background: 'white', borderRadius: 32, padding: 48, boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
          <div className="section-head">
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950 }}>Detailed Coding Analytics</h2>
            <span>Solved <AnimatedNumber value={totalCodingSolved} duration={0.9} /> out of <AnimatedNumber value={totalCodingInSystem} duration={0.9} /> problems</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, marginBottom: 48, marginTop: 32 }}>
            {['Easy', 'Medium', 'Hard'].map((diff, i) => {
               const val = diff === 'Easy' ? easy : diff === 'Medium' ? medium : hard;
               const color = diff === 'Easy' ? '#22c55e' : diff === 'Medium' ? '#f59e0b' : '#ef4444';
               const bg = diff === 'Easy' ? '#f0fdf4' : diff === 'Medium' ? '#fffbeb' : '#fef2f2';
               return (
                 <div key={diff} style={{ padding: 32, borderRadius: 28, background: bg, border: `1px solid ${color}22` }}>
                   <span style={{ fontSize: '0.85rem', color: color, fontWeight: 900, letterSpacing: '0.1em' }}>{diff.toUpperCase()}</span>
                   <div style={{ fontSize: '3rem', fontWeight: 950, marginTop: 8 }}>{val}</div>
                 </div>
               );
            })}
          </div>

          <div style={{ background: '#111827', borderRadius: 20, padding: '24px 28px', marginBottom: 48, display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 28 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                DIFFICULTY BREAKDOWN
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2, marginBottom: 20 }}>Problems Solved</div>
              <DifficultyDistributionChart easy={easy} medium={medium} hard={hard} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                SKILLS PROFILER
              </div>
              <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2 }}>Topic Mastery</div>
              <TopicRadarChart data={codingTopicMastery} onSelect={openTopicDetail} selectedTopic={selectedTopicDetail?.topic} />
              <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                Solved vs. total problems per topic tag — click a point to see its problems
              </div>
            </div>
          </div>
          <div className="section-head">
            <h3 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Coding Badges</h3>
          </div>
          {earnedCodingBadges.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginTop: 24, marginBottom: 48 }}>
              {earnedCodingBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} earned={true} setSelectedBadge={setSelectedBadge} />
              ))}
            </div>
          ) : (
            <p style={{ marginTop: 16, marginBottom: 48, color: 'var(--text-soft)', fontWeight: 600 }}>
              No coding badges earned yet — keep solving to unlock some!
            </p>
          )}

          <div className="section-head">
            <h3>Topic Wise Performance</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 24, marginTop: 24 }}>
            {(dashboard?.topicStats || []).map(topic => (
              <div key={topic.name} style={{ padding: 24, borderRadius: 20, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--olive-900)' }}>{topic.name}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 950 }}>{topic.count}</span>
                </div>
                <div style={{ height: 6, width: '100%', background: '#e2e8f0', borderRadius: 3, marginTop: 16 }}>
                  <div style={{ width: `${Math.min(topic.count * 10, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Company Tab */}
      {activeTab === "company" && (
        <div className="tab-fade surface-card" style={{ background: 'white', borderRadius: 32, padding: 48 }}>
          <div className="section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 950 }}>Placement Preparation Track</h2>
              <span style={{ display: 'block', marginTop: 8, color: 'var(--text-soft)', fontWeight: 500 }}>
                {trackedCompaniesList.length > 0 
                  ? `Focusing on ${trackedCompaniesList.length} companies. Track your progress against company-specific question banks.`
                  : "Select companies you're interested in to start tracking your preparation progress."}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input 
                  type="text"
                  placeholder="Search tracked..."
                  value={companySearchTerm}
                  onChange={(e) => setCompanySearchTerm(e.target.value)}
                  style={{ padding: '12px 16px 12px 48px', borderRadius: 16, border: '2px solid #f1f5f9', background: '#f8fafc', fontSize: '0.9rem', fontWeight: 600, width: 220 }}
                />
              </div>
              {trackedCompaniesList.length > 0 && (
                <button
                  onClick={downloadCompanyReport}
                  disabled={reportBusy}
                  className="secondary-button"
                  style={{ padding: '12px 24px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 10, cursor: reportBusy ? 'not-allowed' : 'pointer' }}
                >
                  {reportBusy ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                  Generate Report
                </button>
              )}
              <button
                onClick={() => setIsTrackingModalOpen(true)}
                className="primary-button"
                style={{ padding: '12px 24px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <Settings size={18} />
                Manage Tracks
              </button>
            </div>
          </div>

          {reportError && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: 12, fontWeight: 600, fontSize: '0.9rem' }}>
              {reportError}
            </div>
          )}

          {trackingError && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: 12, fontWeight: 600, fontSize: '0.9rem' }}>
              {trackingError}
            </div>
          )}

          {trackedCompaniesList.length > 0 && (
            <div style={{ background: '#111827', borderRadius: 20, padding: '24px 28px', marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  READINESS RADAR
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2 }}>Company Readiness</div>
                <TopicRadarChart data={companyReadinessRadar} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  COMPARISON
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2, marginBottom: 20 }}>Problems Solved by Company</div>
                <RankedBarChart
                  items={companyRankedBars}
                  onSelect={(r) => setSelectedCompanyDetail(companyProgress.find(c => c.name === r.label))}
                  color="#fbbf24"
                  emptyText="Track a company to see it here"
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                  DIFFICULTY MIX
                </div>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'white', marginTop: 2, marginBottom: 20 }}>Across Tracked Companies</div>
                <DifficultyDistributionChart easy={trackedDifficultyMix.Easy} medium={trackedDifficultyMix.Medium} hard={trackedDifficultyMix.Hard} />
              </div>
            </div>
          )}

          {companyProgress.length === 0 ? (
            <div style={{ padding: '80px 40px', textAlign: 'center', background: '#f8fafc', borderRadius: 32, marginTop: 40, border: '2px dashed #e2e8f0' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <Building2 size={40} color="#94a3b8" />
              </div>
              {trackedCompaniesList.length > 0 ? (
                <>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--olive-950)' }}>No Matches</h3>
                  <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', margin: '12px auto 32px', maxWidth: 400 }}>
                    None of your {trackedCompaniesList.length} tracked companies match "{companySearchTerm}". They're still tracked — clear the search to see them.
                  </p>
                  <button
                    onClick={() => setCompanySearchTerm('')}
                    className="primary-button"
                    style={{ padding: '16px 32px', borderRadius: 18 }}
                  >
                    Clear Search
                  </button>
                </>
              ) : (
                <>
                  <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--olive-950)' }}>No Companies Tracked</h3>
                  <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', margin: '12px auto 32px', maxWidth: 400 }}>
                    Select companies from the question bank to start measuring your readiness for specific recruitment drives.
                  </p>
                  <button
                    onClick={() => setIsTrackingModalOpen(true)}
                    className="primary-button"
                    style={{ padding: '16px 32px', borderRadius: 18 }}
                  >
                    Choose Companies to Track
                  </button>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 32, marginTop: 40 }}>
              {companyProgress.map(comp => (
                <div key={comp.name} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setSelectedCompanyDetail(comp)}
                    style={{ padding: 32, borderRadius: 28, background: 'white', border: '2px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 24, boxShadow: '0 10px 20px rgba(0,0,0,0.02)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.2s ease' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(196, 151, 67, 0.12)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #fef9c3, #fef3c7)', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', fontWeight: 950, flexShrink: 0 }}>
                      {comp.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--olive-950)' }}>{comp.name}</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-soft)', fontWeight: 700 }}>Problems Solved</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 950, color: 'var(--accent)' }}>{comp.count}</span>
                      </div>
                      <div style={{ height: 8, width: '100%', background: '#f1f5f9', borderRadius: 4, marginTop: 16 }}>
                        <div style={{ width: `${Math.min(comp.count * 20, 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                      <p style={{ margin: '12px 0 0 0', fontSize: '0.8rem', color: '#92400e', fontWeight: 700 }}>Click to view solved problems →</p>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTrackedCompany(comp.name);
                    }}
                    disabled={isUpdating}
                    title="Remove from tracking"
                    style={{ position: 'absolute', top: 12, right: 12, padding: 8, borderRadius: '50%', background: '#fff1f2', border: '1px solid #fecaca', color: '#ef4444', cursor: isUpdating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', zIndex: 10, opacity: isUpdating ? 0.6 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = 'white'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fff1f2'; e.currentTarget.style.color = '#ef4444'; }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aptitude Tab Content */}
      {activeTab === "aptitude" && (
        <div className="tab-fade surface-card" style={{ background: 'white', borderRadius: 32, padding: 48, boxShadow: '0 15px 35px rgba(0,0,0,0.03)' }}>
          <div className="section-head">
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950 }}>Aptitude Mastery Track</h2>
            <span>Solved <AnimatedNumber value={totalAptitudeSolved} duration={0.9} /> out of <AnimatedNumber value={totalAptitudeInSystem} duration={0.9} /> questions</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 32 }}>
            <div style={{ padding: 32, borderRadius: 28, background: '#f0f9ff', border: '1px solid #0ea5e922' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: '#0ea5e9', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Brain size={28} />
                </div>
                <span style={{ fontSize: '1.8rem', fontWeight: 950, color: 'var(--olive-900)' }}>{Math.round(aptitudeRate)}%</span>
              </div>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: 900 }}>Module Progress</h4>
              <div style={{ height: 12, width: '100%', background: '#e0f2fe', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${aptitudeRate}%`, background: '#0ea5e9', height: '100%' }} />
              </div>
              <p style={{ margin: '20px 0 0 0', fontSize: '0.9rem', color: '#0369a1', fontWeight: 700 }}>
                <AnimatedNumber value={totalAptitudeSolved} duration={0.9} /> units completed / <AnimatedNumber value={totalAptitudeInSystem} duration={0.9} /> available
              </p>
            </div>

            <div style={{ padding: 32, borderRadius: 28, background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', border: '1px solid rgba(134,239,172,0.2)' }}>
              <h4 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 800, color: '#166534' }}>Contest Performance</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[
                  ['Contests Attempted', testsCompleted],
                  ['Contest Solved', selfAnalytics?.summary_cards?.contest_solved || 0],
                  ['Avg Completion', `${(avgScore || 0).toFixed(1)}%`],
                  ['Topics Explored', topicAccuracy.length],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(134,239,172,0.15)' }}>
                    <span style={{ fontWeight: 600, color: '#166534', fontSize: '0.95rem' }}>{label}</span>
                    <span style={{ fontWeight: 900, color: '#15803d', fontSize: '1.15rem' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <AptitudeProgressRadar
            topicAccuracy={topicAccuracy}
            topicAccuracyPractice={selfAnalytics?.topic_accuracy_practice || []}
          />

          <div className="section-head" style={{ marginTop: 48 }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Aptitude Badges</h3>
          </div>
          {earnedAptitudeBadges.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginTop: 24, marginBottom: 48 }}>
              {earnedAptitudeBadges.map(badge => (
                <BadgeCard key={badge.id} badge={badge} earned={true} setSelectedBadge={setSelectedBadge} />
              ))}
            </div>
          ) : (
            <p style={{ marginTop: 16, marginBottom: 48, color: 'var(--text-soft)', fontWeight: 600 }}>
              No aptitude badges earned yet — keep practicing to unlock some!
            </p>
          )}

          <div style={{ marginTop: 48, textAlign: 'center' }}>
            <button 
              className="primary-button" 
              style={{ padding: '16px 32px', borderRadius: 16, fontSize: '1rem', fontWeight: 800 }}
              onClick={() => { window.location.href = appUrlForPage('aptitude'); }}
            >
              Continue Masterclass
            </button>
          </div>
        </div>
      )}

      {/* Company Detail Popup */}
      {selectedCompanyDetail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(57, 72, 42, 0.45)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 24 }}
          onClick={() => setSelectedCompanyDetail(null)}
        >
          <div
            style={{ background: 'white', maxWidth: 520, width: '100%', borderRadius: 40, boxShadow: '0 40px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', padding: '36px 40px 28px', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 950, color: 'white' }}>
                  {selectedCompanyDetail.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 950, color: 'white' }}>{selectedCompanyDetail.name}</h2>
                  <p style={{ margin: '6px 0 0 0', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{selectedCompanyDetail.count} problem{selectedCompanyDetail.count !== 1 ? 's' : ''} solved</p>
                </div>
              </div>
            </div>
            {/* Problem List */}
            <div style={{ padding: '28px 40px 40px', maxHeight: '55vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Solved Problems</h3>
              <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedCompanyDetail.problems.map((prob, idx) => {
                  const diffColor = prob.difficulty === 'Easy' ? '#22c55e' : prob.difficulty === 'Medium' ? '#f59e0b' : '#ef4444';
                  return (
                    <li key={prob.slug} style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--olive-950)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span>{prob.title}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: diffColor, background: `${diffColor}15`, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{prob.difficulty}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div style={{ padding: '0 40px 36px' }}>
              <button className="primary-button" style={{ width: '100%', padding: '16px', borderRadius: 20, fontSize: '1rem', fontWeight: 800 }} onClick={() => setSelectedCompanyDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Topic Detail Popup (from clicking a point on the coding topic radar) */}
      {selectedTopicDetail && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(57, 72, 42, 0.45)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 24 }}
          onClick={() => setSelectedTopicDetail(null)}
        >
          <div
            style={{ background: 'white', maxWidth: 520, width: '100%', borderRadius: 40, boxShadow: '0 40px 80px rgba(0,0,0,0.25)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ background: 'linear-gradient(135deg, #2D6A4F, #1b4332)', padding: '36px 40px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  <Brain size={32} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 950, color: 'white' }}>{selectedTopicDetail.topic}</h2>
                  <p style={{ margin: '6px 0 0 0', color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>
                    {selectedTopicDetail.accuracy}% mastery · {selectedTopicDetail.problems.length} problem{selectedTopicDetail.problems.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
            <div style={{ padding: '28px 40px 40px', maxHeight: '55vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Problems in This Topic</h3>
              <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {selectedTopicDetail.problems.map((prob) => {
                  const diffColor = prob.difficulty === 'Easy' ? '#22c55e' : prob.difficulty === 'Medium' ? '#f59e0b' : '#ef4444';
                  const solved = prob.progress_state === 'completed';
                  return (
                    <li key={prob.slug} style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--olive-950)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {solved && <CheckCircle2 size={16} color="#22c55e" />}
                        {prob.title}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 900, color: diffColor, background: `${diffColor}15`, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{prob.difficulty}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div style={{ padding: '0 40px 36px' }}>
              <button className="primary-button" style={{ width: '100%', padding: '16px', borderRadius: 20, fontSize: '1rem', fontWeight: 800 }} onClick={() => setSelectedTopicDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for badges */}
      {selectedBadge && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(57, 72, 42, 0.4)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: 'white', maxWidth: 440, width: '100%', padding: 48, borderRadius: 40, textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,0.2)' }}>
            <div style={{ 
              width: 100, 
              height: 100, 
              background: selectedBadge.visuals.bg, 
              borderRadius: 32, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: selectedBadge.visuals.color,
              margin: '0 auto 32px'
            }}>
              {selectedBadge.icon}
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 950, marginBottom: 16, color: 'var(--olive-950)' }}>{selectedBadge.name}</h2>
            <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', lineHeight: 1.6, marginBottom: 40, fontWeight: 500 }}>{selectedBadge.description}</p>
            <button className="primary-button" style={{ width: '100%', padding: '18px', borderRadius: 20, fontSize: '1.1rem', fontWeight: 800 }} onClick={() => setSelectedBadge(null)}>Great, Thanks!</button>
          </div>
        </div>
      )}
      {/* Tracking Management Modal */}
      {isTrackingModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="tab-fade" style={{ background: 'white', borderRadius: 32, width: '100%', maxWidth: 700, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ padding: 32, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 950, color: 'var(--olive-950)' }}>Select Placement Tracks</h3>
                <p style={{ margin: '4px 0 16px 0', color: 'var(--text-soft)', fontWeight: 500 }}>Choose the companies you are targeting for placements.</p>
                <div style={{ position: 'relative' }}>
                  <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="text"
                    placeholder="Search all companies..."
                    value={modalSearchTerm}
                    onChange={(e) => setModalSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '14px 16px 14px 48px', borderRadius: 16, border: '2px solid #f1f5f9', background: '#f8fafc', fontSize: '1rem', fontWeight: 600 }}
                  />
                </div>
              </div>
              <button onClick={() => setIsTrackingModalOpen(false)} style={{ padding: 12, borderRadius: '50%', background: '#f8fafc', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <div style={{ padding: 32, overflowY: 'auto', flex: 1 }}>
              {trackingError && (
                <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: 12, fontWeight: 600, fontSize: '0.85rem' }}>
                  {trackingError}
                </div>
              )}
              <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: 600 }}>
                Don't see a company below? Type its name above to add it manually — it doesn't need to already exist in the question bank.
              </p>
              {modalSearchTerm.trim() && !trackedCompaniesListLower.includes(modalSearchTerm.trim().toLowerCase()) && (
                <button
                  onClick={() => { toggleTrackedCompany(modalSearchTerm.trim()); setModalSearchTerm(''); }}
                  disabled={isUpdating}
                  style={{
                    width: '100%', padding: '14px 20px', borderRadius: 16, marginBottom: 20,
                    border: '2px dashed var(--accent)', background: '#fffbeb',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: isUpdating ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 800, color: 'var(--accent-dark)' }}>
                    Add "{modalSearchTerm.trim()}" as a new company to track
                  </span>
                  <Plus size={18} color="var(--accent-dark)" />
                </button>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {filteredModalCompanies.length > 0 ? (
                  filteredModalCompanies.map(comp => {
                    const isTracked = trackedCompaniesListLower.includes(comp.toLowerCase());
                    return (
                      <button
                        key={comp}
                        onClick={() => toggleTrackedCompany(comp)}
                        disabled={isUpdating}
                        style={{
                          padding: '16px 20px',
                          borderRadius: 16,
                          border: `2px solid ${isTracked ? 'var(--accent)' : '#f1f5f9'}`,
                          background: isTracked ? '#fefce8' : 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          opacity: isUpdating ? 0.7 : 1
                        }}
                      >
                        <span style={{ fontWeight: 800, color: isTracked ? 'var(--accent-dark)' : 'var(--olive-950)' }}>{comp}</span>
                        {isTracked ? <CheckCircle2 size={18} color="var(--accent)" /> : <Plus size={18} color="#94a3b8" />}
                      </button>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: 'var(--text-soft)' }}>
                    {allAvailableCompanies.length === 0
                      ? 'No companies are tagged in the problem bank yet — type a name above and add it manually.'
                      : `No companies found matching "${modalSearchTerm}".`}
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ padding: 24, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', background: '#f8fafc' }}>
              <button 
                onClick={() => setIsTrackingModalOpen(false)} 
                className="primary-button" 
                style={{ padding: '12px 48px', borderRadius: 16 }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProgressPage;
