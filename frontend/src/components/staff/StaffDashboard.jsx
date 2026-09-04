// Staff Dashboard - Staff view with contests and batch-wise analytics
import { useState, useEffect } from 'react';
import { Users, Trophy, BookOpen, BarChart3, Plus, Eye, FileText, ChevronRight, Calendar, Activity, Brain, MessageSquare, GraduationCap, UserCheck, FlaskConical, Download, Loader2, Trash2, Library, Sparkles } from 'lucide-react';
import EnhancedContestCreator from './EnhancedContestCreator';
import StudentAnalyticsModal from './StudentAnalyticsModal';
import ContestDetailModal from '../common/ContestDetailModal';
import DiscussPage from '../student/pages/DiscussPage';
import StaffLabPanel from './StaffLabPanel';
import UserSystemUpdatesWidget from '../common/UserSystemUpdatesWidget';
import HourlyBatchReportModal from '../common/HourlyBatchReportModal';
import SolvingActivityChart from '../common/SolvingActivityChart';
import { useTabNav } from '../../lib/useTabNav';

const StaffDashboard = ({ institutionId, lockedModules = [] }) => {
  const [activeTab, setActiveTab] = useTabNav('overview');
  const [staffDetail, setStaffDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSection, setSelectedSection] = useState('');
  const [batchReportDateFrom, setBatchReportDateFrom] = useState('');
  const [batchReportDateTo, setBatchReportDateTo] = useState('');
  const [downloadingBatchReport, setDownloadingBatchReport] = useState(false);
  const [showContestCreator, setShowContestCreator] = useState(false);
  const [selectedStudentForAnalytics, setSelectedStudentForAnalytics] = useState(null);
  const [showContestDetail, setShowContestDetail] = useState(null);
  const [selectedDeptId, setSelectedDeptId] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [contestsList, setContestsList] = useState([]);
  const [contestSearch, setContestSearch] = useState('');
  const [contestDateFilter, setContestDateFilter] = useState('');
  const [contestLimit, setContestLimit] = useState(10);

  useEffect(() => {
    if (activeTab === 'contests') {
      fetchContests();
    }
  }, [activeTab]);

  async function fetchContests() {
    try {
      const res = await fetch('/api/contests/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setContestsList(data.contests || []);
      }
    } catch (err) {
      console.error("Failed to fetch contests:", err);
    }
  }

  async function handleDeleteContest(e, contest) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${contest.title}"? This also removes every submission recorded against it. This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/contests/${contest.id}/`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setContestsList((prev) => prev.filter((c) => c.id !== contest.id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to delete contest.');
      }
    } catch (err) {
      alert('Failed to delete contest.');
    }
  }

  // Downloads the batch performance report PDF — section-scoped if a
  // section is selected, otherwise the full batch — with an optional
  // submission-date range.
  async function downloadBatchReport(batchCode) {
    setDownloadingBatchReport(true);
    try {
      const params = new URLSearchParams();
      if (selectedSection) params.append('section', selectedSection);
      if (batchReportDateFrom) params.append('date_from', batchReportDateFrom);
      if (batchReportDateTo) params.append('date_to', batchReportDateTo);
      const res = await fetch(`/api/batches/${encodeURIComponent(batchCode)}/report/?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to generate batch report.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scope = selectedSection ? `${batchCode}_${selectedSection}` : batchCode;
      a.download = `batch_report_${scope}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Report error: ${err.message}`);
    } finally {
      setDownloadingBatchReport(false);
    }
  }

  // Function to update filter preview
  const updatePreview = () => {
    setTimeout(() => {
      const reportType = document.getElementById('reportType')?.value || 'overall';
      const batch = document.getElementById('batchFilter')?.value || '';
      const dateFrom = document.getElementById('dateFrom')?.value || '';
      const dateTo = document.getElementById('dateTo')?.value || '';
      const topic = document.getElementById('topicFilter')?.value || '';
      
      const reportTypeText = {
        'overall': 'Overall Performance',
        'programming': 'Programming Only',
        'aptitude': 'Aptitude Only',
        'contests': 'Contest Management'
      }[reportType] || 'Overall Performance';
      
      const batchText = batch ? `Batch ${batch}` : 'All Batches';
      const dateText = (dateFrom && dateTo) ? `${dateFrom} to ${dateTo}` : 
                      dateFrom ? `From ${dateFrom}` : 
                      dateTo ? `Until ${dateTo}` : 'All Time';
      const topicText = topic ? topic.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'All Topics';
      
      const previewElement = document.getElementById('filterPreview');
      if (previewElement) {
        previewElement.textContent = `📋 Report Preview: ${reportTypeText} • ${batchText} • ${dateText} • ${topicText}`;
      }
    }, 10);
  };

  async function loadStaffData(deptId = null) {
    try {
      setLoading(true);
      // Get current staff profile from dashboard endpoint
      const res = await fetch('/api/dashboard/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        console.log('Dashboard data:', data); // Debug log
        
        if (data.user?.departments) {
          setDepartments(data.user.departments);
        }

        if (deptId) {
          // Load department-specific data
          const deptRes = await fetch(`/api/departments/${deptId}/details/`, { credentials: 'include' });
          if (deptRes.ok) {
            const deptData = await deptRes.json();
            // Wrap in same structure as staff details
            setStaffDetail({
              staff: {
                ...data.user,
                department: deptData.department,
                assigned_students: deptData.department.assigned_students
              },
              analytics: deptData.analytics
            });
          } else {
            const errorData = await deptRes.json();
            setError(errorData.detail || 'Failed to load department details');
          }
        } else {
          const facultyId = data.user?.facultyId || data.user?.registerNumber || data.user?.username;
          
          if (facultyId) {
            const detailRes = await fetch(`/api/staff/${facultyId}/details/`, { credentials: 'include' });
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              setStaffDetail(detailData);
            } else {
              setStaffDetail({
                staff: {
                  name: data.user?.name || 'Staff Member',
                  faculty_id: facultyId,
                  department: data.user?.department || null,
                  institution: data.user?.institution || null
                },
                analytics: {}
              });
            }
          } else {
            setStaffDetail({
              staff: {
                name: data.user?.name || 'Staff Member',
                faculty_id: 'STAFF',
                department: data.user?.department || null,
                institution: data.user?.institution || null
              },
              analytics: {}
            });
          }
        }
      } else {
        const errorData = await res.json();
        setError(errorData.detail || 'Failed to load dashboard');
      }
    } catch (err) {
      console.error('Error loading staff data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStaffData();
  }, []);

  async function fetchActivityRange(startDate, endDate) {
    try {
      const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
      let weekly_progress = [];
      if (selectedDeptId) {
        const res = await fetch(`/api/departments/${selectedDeptId}/details/?${params.toString()}`, { credentials: 'include' });
        if (res.ok) weekly_progress = (await res.json()).analytics?.weekly_progress || [];
      } else {
        const facultyId = staffDetail?.staff?.faculty_id;
        if (!facultyId) return;
        const res = await fetch(`/api/staff/${facultyId}/details/?${params.toString()}`, { credentials: 'include' });
        if (res.ok) weekly_progress = (await res.json()).analytics?.weekly_progress || [];
      }
      setStaffDetail(prev => ({ ...prev, analytics: { ...(prev?.analytics || {}), weekly_progress } }));
    } catch (err) {
      // silent fail — chart just keeps showing the previous range
    }
  }

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-container">
          <div style={{ padding: 40, textAlign: 'center' }}>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!staffDetail) {
    return (
      <div className="admin-dashboard">
        <div className="admin-container">
          <div className="admin-header">
            <h1>Staff Dashboard</h1>
            <p>Unable to load staff data</p>
          </div>
          <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>
            <p>{error || 'Could not load staff information. Please try again.'}</p>
            {error && (
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: 20,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                Reload Page
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const staff = staffDetail?.staff || {
    name: 'Faculty Member',
    faculty_id: 'STAFF',
    department: null,
    institution: null
  };
  const rawAnalytics = staffDetail?.analytics || {};
  const analytics = {
    top_performers: [],
    batch_wise: [],
    contests: [],
    weekly_progress: [],
    recent_activity: [],
    engagement_summary: {},
    ...(rawAnalytics || {})
  };

  function handleContestCreated() {
    loadStaffData();
    fetchContests();
  }

  // Tabs tied to a lockable module disappear entirely when that module is
  // locked institution-wide — matches the module lock hiding it from the
  // student nav too.
  const MODULE_BY_TAB = { contests: 'contest', labs: 'labs', chat: 'discuss' };
  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'performance', label: 'Performance', icon: Trophy },
    { id: 'contests', label: 'Contests', icon: BookOpen },
    { id: 'batches', label: 'Batches', icon: Users },
    { id: 'mentor', label: 'My Mentees', icon: UserCheck },
    { id: 'advisor', label: 'Class Advisor', icon: GraduationCap },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'labs', label: 'Lab', icon: FlaskConical },
    { id: 'lms', label: 'LMS', icon: Library },
    { id: 'chat', label: 'Discuss', icon: MessageSquare },
  ].filter((item) => !MODULE_BY_TAB[item.id] || !lockedModules.includes(MODULE_BY_TAB[item.id]));

  return (
    <div className="admin-dashboard-layout">
      {showContestCreator && (
        <EnhancedContestCreator
          onClose={() => setShowContestCreator(false)}
          onSuccess={handleContestCreated}
          initialType={showContestCreator.type || 'programming'}
        />
      )}

      {selectedStudentForAnalytics && (
        <StudentAnalyticsModal
          registerNumber={selectedStudentForAnalytics}
          onClose={() => setSelectedStudentForAnalytics(null)}
        />
      )}

      {showContestDetail && (
        <ContestDetailModal
          contestId={showContestDetail}
          onClose={() => setShowContestDetail(null)}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className="hod-sidebar">
        <div className="sidebar-header">
          <h2>Faculty Panel</h2>
        </div>
        <nav className="sidebar-nav">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`sidebar-item ${activeTab === item.id ? 'active' : ''}`}
            >
              <item.icon size={20} className="nav-icon" />
              {item.label}
            </button>
          ))}
        </nav>
        
        <div style={{ padding: '24px', borderTop: '1px solid var(--bg-2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: '50%', 
              background: 'var(--sage-100)', color: 'var(--olive-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 'bold'
            }}>
              {(staff.name || 'F')[0]}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-hard)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {staff.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{staff.faculty_id}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className={`hod-main-content ${activeTab === 'chat' ? 'no-padding' : ''}`}>
        {activeTab !== 'chat' && (
          <div className="admin-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <h1>{sidebarItems.find(i => i.id === activeTab)?.label || 'Dashboard'}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <p style={{ margin: 0 }}>Faculty Management Console • {staff.department?.name || staff.institution?.name || 'Overall Institution'}</p>
                  
                  {departments.length > 0 && (
                    <select 
                      value={selectedDeptId || ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const newId = val ? parseInt(val) : null;
                        setSelectedDeptId(newId);
                        loadStaffData(newId);
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-soft)',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--olive-700)',
                        background: 'var(--sage-50)',
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="">Overall Institution</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setShowContestCreator({ type: 'programming' })}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#2563eb',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '13px',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                  }}
                >
                  <Plus size={18} />
                  New Coding Contest
                </button>
                <button
                  onClick={() => setShowContestCreator({ type: 'aptitude' })}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#9333ea',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '13px',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(147, 51, 234, 0.2)'
                  }}
                >
                  <Plus size={18} />
                  New Aptitude Contest
                </button>
                <button
                  onClick={() => setShowContestCreator({ type: 'combined' })}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#0891b2',
                    color: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '13px',
                    fontWeight: '600',
                    boxShadow: '0 4px 12px rgba(8, 145, 178, 0.2)'
                  }}
                >
                  <Plus size={18} />
                  New Combined Contest
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: '#fee2e2', borderRadius: 12, color: '#dc2626', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
             <Eye size={20} />
             <strong>Error:</strong> {error}
          </div>
        )}

        <div className="tab-container">


          {activeTab === 'overview' && (
            <div className="overview-tab">
              <UserSystemUpdatesWidget />
              <div className="metric-grid" style={{ marginBottom: 32 }}>
                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
                    <Users size={24} />
                  </div>
                  <div>
                    <h4>MENTEES</h4>
                    <div className="value">{staff.assigned_students || 0}</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#fff7ed', color: '#ea580c' }}>
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h4>CONTESTS CREATED</h4>
                    <div className="value">{analytics.contests?.length || 0}</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}>
                    <Activity size={24} />
                  </div>
                  <div>
                    <h4>ACTIVE TODAY</h4>
                    <div className="value">{analytics.engagement_summary?.active_today || 0}</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                    <BarChart3 size={24} />
                  </div>
                  <div>
                    <h4>AVG. SOLVED</h4>
                    <div className="value">{analytics.engagement_summary?.avg_solved || 0}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
                {/* Weekly Activity */}
                <div className="premium-card">
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-hard)' }}>Weekly Activity Progress</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 12px' }}>
                    {analytics.weekly_progress?.map((day, i) => {
                      const maxCount = Math.max(...(analytics.weekly_progress?.map(d => d.count) || [1]), 1);
                      const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div 
                            style={{
                              width: '100%',
                              height: `${Math.max(height, 5)}%`,
                              background: height > 70 ? 'var(--olive-700)' : height > 30 ? 'var(--olive-500)' : 'var(--sage-200)',
                              borderRadius: '8px 8px 0 0',
                              transition: 'height 1s ease-out'
                            }}
                            title={`${day.count} submissions`}
                          />
                          <div style={{ fontSize: '11px', color: 'var(--text-soft)', marginTop: 8, fontWeight: '600' }}>{day.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recent Department Activity Feed */}
                <div className="premium-card">
                  <h3 style={{ margin: '0 0 20px', fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-hard)' }}>Live Activity Feed</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {(analytics.recent_activity || []).map((act, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 16, paddingBottom: 16, borderBottom: idx === (analytics.recent_activity.length - 1) ? 'none' : '1px solid var(--border-soft)' }}>
                        <div style={{ 
                          width: 40, height: 40, borderRadius: '12px', background: 'var(--sage-100)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          fontSize: '14px', fontWeight: '800', color: 'var(--olive-700)'
                        }}>
                          {(act.student_name || 'S')[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--text-hard)' }}>{act.student_name || 'Unknown Student'}</strong>
                            <span style={{ color: 'var(--text-soft)' }}> solved </span>
                            <strong style={{ color: 'var(--olive-700)' }}>{act.problem_title || 'a problem'}</strong>
                          </div>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
                            {new Date(act.solved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!analytics.recent_activity || analytics.recent_activity.length === 0) && (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-soft)' }}>
                        No recent activity found.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Contests */}
              <div className="premium-card">
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-hard)' }}>Recent Contest Submissions</h3>
                    <button onClick={() => setActiveTab('contests')} style={{ fontSize: '13px', color: 'var(--olive-700)', background: 'none', border: 'none', fontWeight: '600', cursor: 'pointer' }}>View All →</button>
                 </div>
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {analytics.contests?.slice(0, 3).map(contest => (
                      <div 
                        key={contest.id} 
                        onClick={() => setShowContestDetail(contest.id)}
                        style={{ 
                          padding: '20px', 
                          background: 'white', 
                          borderRadius: '20px', 
                          border: '1px solid var(--border-soft)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        className="contest-list-item-hover"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
                          <span style={{ 
                            padding: '2px 10px', 
                            borderRadius: '8px', 
                            background: contest.status === 'active' ? '#dcfce7' : '#f1f5f9',
                            color: contest.status === 'active' ? '#166534' : '#64748b',
                            fontSize: '11px', 
                            fontWeight: '800', 
                            textTransform: 'uppercase' 
                          }}>
                            {contest.status}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--olive-700)', fontWeight: '700', fontSize: '13px' }}>
                            <Trophy size={14} />
                            <span>{contest.total_submissions || 0}</span>
                          </div>
                        </div>
                        <div style={{ fontWeight: '800', color: 'var(--text-hard)', fontSize: '16px', marginBottom: 6, lineHeight: '1.4' }}>{contest.title}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-soft)', fontWeight: '500' }}>
                          {new Date(contest.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          )}

          {/* Performance Tab */}
          {activeTab === 'performance' && (
            <div className="performance-tab">
              <div className="premium-card" style={{ marginBottom: 32 }}>
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: 'var(--text-hard)', marginBottom: 8 }}>Department Leaderboard</h2>
                  <p style={{ color: 'var(--text-soft)' }}>Recognizing the top achievers in {staff.department?.name}.</p>
                </div>

                {/* Podium Visualization */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  justifyContent: 'center', 
                  gap: 12, 
                  marginBottom: 60,
                  padding: '0 20px',
                  minHeight: 280
                }}>
                  {/* 2nd Place */}
                  {analytics.top_performers.length > 1 && (
                    <div 
                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => setSelectedStudentForAnalytics(analytics.top_performers[1].id)}
                    >
                      <div style={{ marginBottom: 12, position: 'relative' }}>
                        <div style={{ 
                          width: 64, height: 64, borderRadius: '20px', background: 'white',
                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '3px solid white', boxShadow: '0 8px 16px rgba(0,0,0,0.08)'
                        }}>
                          <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-hard)' }}>{(analytics.top_performers[1].name || 'S')[0]}</span>
                        </div>
                      </div>
                      <div style={{ 
                        height: 120, background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)', 
                        borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', 
                        justifyContent: 'center', padding: '16px', position: 'relative'
                      }}>
                        <div style={{ 
                          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                          width: 24, height: 24, background: '#94a3b8', color: 'white', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900'
                        }}>2</div>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{analytics.top_performers[1].name}</div>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e293b' }}>{analytics.top_performers[1].solved_count || 0}</div>
                      </div>
                    </div>
                  )}

                  {/* 1st Place */}
                  {analytics.top_performers.length > 0 && (
                    <div 
                      style={{ flex: 1.2, textAlign: 'center', position: 'relative', zIndex: 1, cursor: 'pointer' }}
                      onClick={() => setSelectedStudentForAnalytics(analytics.top_performers[0].id)}
                    >
                      <div style={{ marginBottom: 16, position: 'relative' }}>
                        <div style={{ 
                          width: 80, height: 80, borderRadius: '24px', background: 'white',
                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '4px solid #fbbf24', boxShadow: '0 12px 24px rgba(251, 191, 36, 0.2)'
                        }}>
                          <span style={{ fontSize: '28px', fontWeight: '800', color: '#b45309' }}>{(analytics.top_performers[0].name || 'S')[0]}</span>
                        </div>
                        <div style={{ 
                          position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                          background: '#fbbf24', color: '#92400e', padding: '2px 10px', borderRadius: '10px',
                          fontSize: '10px', fontWeight: '900', textTransform: 'uppercase'
                        }}>CHAMPION</div>
                      </div>
                      <div style={{ 
                        height: 160, background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)', 
                        borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', 
                        justifyContent: 'center', padding: '16px', position: 'relative',
                        boxShadow: '0 -10px 20px rgba(251, 191, 36, 0.1)'
                      }}>
                        <div style={{ 
                          position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                          width: 32, height: 32, background: '#fbbf24', color: 'white', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '900',
                          boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
                        }}>1</div>
                        <div style={{ fontWeight: '900', fontSize: '16px', color: '#92400e', marginBottom: 4 }}>{analytics.top_performers[0].name}</div>
                        <div style={{ fontSize: '32px', fontWeight: '900', color: '#78350f' }}>{analytics.top_performers[0].solved_count || 0}</div>
                        <div style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', textTransform: 'uppercase' }}>Solved</div>
                      </div>
                    </div>
                  )}

                  {/* 3rd Place */}
                  {analytics.top_performers.length > 2 && (
                    <div 
                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => setSelectedStudentForAnalytics(analytics.top_performers[2].id)}
                    >
                      <div style={{ marginBottom: 12, position: 'relative' }}>
                        <div style={{ 
                          width: 56, height: 56, borderRadius: '18px', background: 'white',
                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '3px solid #fdba74', boxShadow: '0 8px 16px rgba(253, 186, 116, 0.15)'
                        }}>
                          <span style={{ fontSize: '20px', fontWeight: '800', color: '#c2410c' }}>{(analytics.top_performers[2].name || 'S')[0]}</span>
                        </div>
                      </div>
                      <div style={{ 
                        height: 90, background: 'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)', 
                        borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', 
                        justifyContent: 'center', padding: '16px', position: 'relative'
                      }}>
                        <div style={{ 
                          position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                          width: 24, height: 24, background: '#fdba74', color: 'white', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900'
                        }}>3</div>
                        <div style={{ fontWeight: '800', fontSize: '14px', color: '#9a3412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{analytics.top_performers[2].name}</div>
                        <div style={{ fontSize: '18px', fontWeight: '900', color: '#7c2d12' }}>{analytics.top_performers[2].solved_count || 0}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Extended Leaderboard List */}
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {analytics.top_performers?.slice(3).map((student, idx) => (
                      <div 
                        key={student.id} 
                        onClick={() => setSelectedStudentForAnalytics(student.id)}
                        className="performer-item-hover"
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '20px 24px', 
                          background: 'white', 
                          borderRadius: '20px',
                          border: '1px solid var(--border-soft)',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-soft)', width: 24 }}>{idx + 4}</div>
                          <div style={{ 
                            width: 48, height: 48, borderRadius: '14px', 
                            background: 'var(--bg-2)', color: 'var(--olive-700)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '18px', fontWeight: '800'
                          }}>
                            {(student.name || 'S')[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-hard)' }}>{student.name || 'Student'}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>{student.id}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                           <div style={{ textAlign: 'center' }}>
                             <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--olive-700)' }}>{student.solved_count}</div>
                             <div style={{ fontSize: '10px', color: 'var(--text-soft)', textTransform: 'uppercase', fontWeight: '800' }}>Solved</div>
                           </div>
                           <div style={{ textAlign: 'center' }}>
                             <div style={{ fontSize: '20px', fontWeight: '900', color: '#7c3aed' }}>{student.current_streak}</div>
                             <div style={{ fontSize: '10px', color: 'var(--text-soft)', textTransform: 'uppercase', fontWeight: '800' }}>Streak</div>
                           </div>
                           <ChevronRight size={20} color="var(--text-soft)" />
                        </div>
                      </div>
                    ))}
                    {(analytics.top_performers || []).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-2)', borderRadius: '24px' }}>
                        <Trophy size={48} color="var(--text-soft)" style={{ opacity: 0.2, marginBottom: 16 }} />
                        <p style={{ color: 'var(--text-soft)', fontSize: '16px' }}>No performance data available yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Contests Tab */}
          {activeTab === 'contests' && (() => {
            const rawContests = contestsList.length > 0 
              ? contestsList 
              : (analytics?.contests || staffDetail?.contests || []);

            const filteredContests = rawContests.filter(c => {
              if (!c) return false;
              const titleMatch = c.title ? String(c.title).toLowerCase().includes(contestSearch.toLowerCase()) : false;
              const descMatch = c.description ? String(c.description).toLowerCase().includes(contestSearch.toLowerCase()) : false;
              const matchSearch = !contestSearch || titleMatch || descMatch;
              
              const createdDateMatch = c.created_at ? String(c.created_at).startsWith(contestDateFilter) : false;
              const startDateMatch = c.start_time ? String(c.start_time).startsWith(contestDateFilter) : false;
              const matchDate = !contestDateFilter || createdDateMatch || startDateMatch;
              
              return matchSearch && matchDate;
            });
            const visibleContests = filteredContests.slice(0, contestLimit);

            return (
              <div className="contests-tab">
                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Your Contests</h3>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="🔍 Search contests..."
                        value={contestSearch}
                        onChange={(e) => { setContestSearch(e.target.value); setContestLimit(10); }}
                        style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, minWidth: 200 }}
                      />
                      <input
                        type="date"
                        value={contestDateFilter}
                        onChange={(e) => { setContestDateFilter(e.target.value); setContestLimit(10); }}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}
                      />
                      {(contestSearch || contestDateFilter) && (
                        <button
                          onClick={() => { setContestSearch(''); setContestDateFilter(''); setContestLimit(10); }}
                          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 12, cursor: 'pointer' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {visibleContests.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      {rawContests.length === 0 ? 'No contests created yet. Click "New Coding Contest" or "New Aptitude Contest" above to create one!' : 'No contests match your search or date filter.'}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 16 }}>
                      {visibleContests.map((contest) => (
                        <div 
                          key={contest.id} 
                          onClick={() => setShowContestDetail(contest.id)}
                          className="contest-list-item-hover"
                          style={{
                            padding: '20px 24px',
                            background: 'white',
                            borderRadius: '16px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            border: '1px solid var(--border-soft)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-hard)' }}>{contest.title || 'Untitled Contest'}</h4>
                              <span style={{ 
                                padding: '2px 8px', borderRadius: '6px', 
                                background: contest.status === 'active' ? '#dcfce7' : '#f1f5f9',
                                color: contest.status === 'active' ? '#166534' : '#475569',
                                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
                              }}>
                                {contest.status || 'draft'}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>
                              Created on {contest.created_at ? new Date(contest.created_at).toLocaleDateString() : 'N/A'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-hard)' }}>{contest.total_participants || 0}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-soft)', textTransform: 'uppercase' }}>Students</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--olive-700)' }}>{contest.total_submissions || 0}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-soft)', textTransform: 'uppercase' }}>Submissions</div>
                            </div>
                            {contest.created_by?.faculty_id === staff.faculty_id && (
                              <button
                                onClick={(e) => handleDeleteContest(e, contest)}
                                title="Delete this contest"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex', color: '#ef4444', flexShrink: 0 }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            <ChevronRight size={20} color="var(--text-soft)" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {filteredContests.length > contestLimit && (
                    <div style={{ textAlign: 'center', marginTop: 24 }}>
                      <button
                        onClick={() => setContestLimit(prev => prev + 10)}
                        style={{
                          padding: '10px 24px', borderRadius: 10, border: '1px solid var(--olive-700)',
                          background: 'white', color: 'var(--olive-700)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                        }}
                      >
                        Load More Contests ({filteredContests.length - contestLimit} remaining)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="reports-tab">
              <div className="premium-card">
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                  <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: 'var(--text-hard)', marginBottom: 8 }}>📊 Performance Reports</h2>
                  <p style={{ color: 'var(--text-soft)' }}>Generate comprehensive PDF reports with college header and detailed analytics.</p>
                </div>

                {/* Report Generation Form */}
                <div style={{ 
                  maxWidth: 800, 
                  margin: '0 auto', 
                  background: 'white', 
                  padding: '32px', 
                  borderRadius: '20px', 
                  border: '1px solid var(--border-soft)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.08)'
                }}>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginBottom: 32 }}>
                    {/* Report Type */}
                    <div>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '700', 
                        color: 'var(--text-hard)', 
                        marginBottom: 8
                      }}>
                        Report Type
                      </label>
                      <select 
                        id="reportType"
                        onChange={(e) => updatePreview()}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '12px', 
                          border: '2px solid var(--border-soft)', 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: 'var(--text-hard)', 
                          cursor: 'pointer', 
                          outline: 'none',
                          background: 'white'
                        }}
                        defaultValue="overall"
                      >
                        <option value="overall">📊 Overall Performance</option>
                        <option value="programming">💻 Programming Only</option>
                        <option value="aptitude">🧠 Aptitude Only</option>
                        <option value="contests">🏆 Contest Management</option>
                      </select>
                    </div>
                    
                    {/* Batch Filter */}
                    <div>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '700', 
                        color: 'var(--text-hard)', 
                        marginBottom: 8
                      }}>
                        Batch Filter
                      </label>
                      <select 
                        id="batchFilter"
                        onChange={(e) => updatePreview()}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '12px', 
                          border: '2px solid var(--border-soft)', 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: 'var(--text-hard)', 
                          cursor: 'pointer', 
                          outline: 'none',
                          background: 'white'
                        }}
                      >
                        <option value="">All Batches</option>
                        {(analytics?.batch_wise || []).map(batch => (
                          <option key={batch.batch} value={batch.batch}>Batch {batch.batch}</option>
                        ))}
                      </select>
                    </div>

                    {/* From Date */}
                    <div>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '700', 
                        color: 'var(--text-hard)', 
                        marginBottom: 8
                      }}>
                        From Date
                      </label>
                      <input 
                        type="date" 
                        id="dateFrom"
                        onChange={(e) => updatePreview()}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '12px', 
                          border: '2px solid var(--border-soft)', 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: 'var(--text-hard)', 
                          cursor: 'pointer', 
                          outline: 'none',
                          background: 'white'
                        }}
                      />
                    </div>
                    
                    {/* To Date */}
                    <div>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '700', 
                        color: 'var(--text-hard)', 
                        marginBottom: 8
                      }}>
                        To Date
                      </label>
                      <input 
                        type="date" 
                        id="dateTo"
                        onChange={(e) => updatePreview()}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '12px', 
                          border: '2px solid var(--border-soft)', 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: 'var(--text-hard)', 
                          cursor: 'pointer', 
                          outline: 'none',
                          background: 'white'
                        }}
                      />
                    </div>

                    {/* Topic Filter */}
                    <div>
                      <label style={{ 
                        display: 'block', 
                        fontSize: '14px', 
                        fontWeight: '700', 
                        color: 'var(--text-hard)', 
                        marginBottom: 8
                      }}>
                        Topic Filter
                      </label>
                      <select 
                        id="topicFilter"
                        onChange={(e) => updatePreview()}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '12px', 
                          border: '2px solid var(--border-soft)', 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: 'var(--text-hard)', 
                          cursor: 'pointer', 
                          outline: 'none',
                          background: 'white'
                        }}
                      >
                        <option value="">All Topics</option>
                        <option value="arrays">Arrays & Strings</option>
                        <option value="algorithms">Algorithms</option>
                        <option value="data-structures">Data Structures</option>
                        <option value="dynamic-programming">Dynamic Programming</option>
                        <option value="graphs">Graphs & Trees</option>
                        <option value="mathematics">Mathematics</option>
                        <option value="sql">SQL & Databases</option>
                        <option value="system-design">System Design</option>
                      </select>
                    </div>
                  </div>

                  {/* Filter Preview */}
                  <div 
                    id="filterPreview"
                    style={{ 
                      marginBottom: 24, 
                      padding: '16px 20px', 
                      background: '#f8f9fa', 
                      borderRadius: '12px', 
                      border: '1px solid #e9ecef',
                      fontSize: '14px',
                      color: '#6c757d',
                      fontWeight: '600',
                      textAlign: 'center'
                    }}
                  >
                    📋 Report Preview: Overall Performance • All Batches • All Time • All Topics
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                    <button 
                      onClick={() => {
                        const reportType = document.getElementById('reportType').value;
                        const batch = document.getElementById('batchFilter').value;
                        const dateFrom = document.getElementById('dateFrom').value;
                        const dateTo = document.getElementById('dateTo').value;
                        const topic = document.getElementById('topicFilter').value;
                        
                        const params = new URLSearchParams();
                        if (reportType !== 'overall') params.append('type', reportType);
                        if (batch) params.append('batch', batch);
                        if (dateFrom) params.append('date_from', dateFrom);
                        if (dateTo) params.append('date_to', dateTo);
                        if (topic) params.append('topic', topic);
                        
                        const url = `/api/staff/${staff.faculty_id}/report/?${params.toString()}`;
                        window.open(url, '_blank');
                      }}
                      style={{ 
                        padding: '16px 32px', 
                        borderRadius: '12px', 
                        border: 'none',
                        background: 'linear-gradient(135deg, #4f7942, #2d5016)', 
                        color: 'white', 
                        cursor: 'pointer',
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 12, 
                        fontSize: '16px', 
                        fontWeight: '700',
                        boxShadow: '0 6px 20px rgba(79, 121, 66, 0.3)',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 8px 25px rgba(79, 121, 66, 0.4)';
                        e.target.style.background = 'linear-gradient(135deg, #3d5f33, #1f3a0f)';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 6px 20px rgba(79, 121, 66, 0.3)';
                        e.target.style.background = 'linear-gradient(135deg, #4f7942, #2d5016)';
                      }}
                    >
                      <FileText size={20} /> 
                      Download PDF Report
                    </button>

                    <button 
                      onClick={() => {
                        document.getElementById('reportType').value = 'overall';
                        document.getElementById('batchFilter').value = '';
                        document.getElementById('dateFrom').value = '';
                        document.getElementById('dateTo').value = '';
                        document.getElementById('topicFilter').value = '';
                        updatePreview();
                      }}
                      style={{ 
                        padding: '16px 24px', 
                        borderRadius: '12px', 
                        border: '2px solid #e5e7eb',
                        background: 'white', 
                        color: '#6b7280', 
                        cursor: 'pointer',
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 8, 
                        fontSize: '14px', 
                        fontWeight: '600',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.target.style.borderColor = '#9ca3af';
                        e.target.style.color = '#374151';
                      }}
                      onMouseOut={(e) => {
                        e.target.style.borderColor = '#e5e7eb';
                        e.target.style.color = '#6b7280';
                      }}
                    >
                      🔄 Reset Filters
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Batches Tab */}
          {activeTab === 'batches' && (
            <div className="batches-tab">
              {/* ── Default-visible graphs: Weekly Solving Activity + Project Builders ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                <SolvingActivityChart data={analytics?.weekly_progress || []} onRangeChange={fetchActivityRange} />

                {/* Project Builders */}
                <div className="premium-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 340 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                    🏗️ Project Builders
                  </h3>
                  <p style={{ margin: '0 0 20px', color: 'var(--text-soft)', fontSize: '13px' }}>
                    Top students by problems solved — click to view profile
                  </p>
                  {(() => {
                    const builders = (analytics?.top_performers || []).slice(0, 8);
                    const maxSolved = Math.max(...builders.map(s => s.solved_count || 0), 1);
                    const colors = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#4f46e5','#be185d'];
                    return builders.length > 0 ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
                        {builders.map((student, i) => {
                          const pct = ((student.solved_count || 0) / maxSolved) * 100;
                          const color = colors[i % colors.length];
                          return (
                            <div
                              key={student.id || i}
                              onClick={() => setSelectedStudentForAnalytics(student.register_number || student.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '4px 6px', borderRadius: 8, transition: 'background 0.15s' }}
                              onMouseOver={e => e.currentTarget.style.background = 'var(--sage-50)'}
                              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              title={`View ${student.name}'s profile`}
                            >
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${color}20`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900', flexShrink: 0 }}>
                                #{i+1}
                              </div>
                              <div style={{ width: 90, fontSize: '13px', fontWeight: '700', color: 'var(--text-hard)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {student.name?.split(' ')[0] || 'Student'}
                              </div>
                              <div style={{ flex: 1, height: 18, background: '#f1f5f9', borderRadius: 9, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 9, transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)' }} />
                              </div>
                              <div style={{ width: 34, fontSize: '13px', fontWeight: '900', color: 'var(--olive-700)', textAlign: 'right' }}>
                                {student.solved_count || 0}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-soft)', fontSize: '13px' }}>No performance data yet.</div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 24 }}>
              </div>
              <div className="premium-card" style={{ marginBottom: 24 }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Batch Insights</h3>
                <p style={{ margin: '4px 0 24px', color: 'var(--text-soft)', fontSize: '14px' }}>Analyze performance across different student groups.</p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                   {(analytics?.batch_wise || []).map(batch => (
                     <div 
                      key={batch.batch}
                      onClick={() => {
                        setSelectedBatch(selectedBatch === batch.batch ? null : batch.batch);
                        setSelectedSection('');
                      }}
                      style={{
                        padding: '24px',
                        background: selectedBatch === batch.batch ? 'var(--sage-100)' : 'white',
                        borderRadius: '24px',
                        border: selectedBatch === batch.batch ? '2px solid var(--olive-700)' : '1px solid var(--border-soft)',
                        cursor: 'pointer',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: selectedBatch === batch.batch ? '0 12px 24px rgba(57, 72, 42, 0.15)' : 'none',
                        transform: selectedBatch === batch.batch ? 'translateY(-4px)' : 'none'
                      }}
                     >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                           <span style={{ padding: '4px 12px', background: 'var(--olive-900)', color: 'white', borderRadius: '8px', fontSize: '12px', fontWeight: '700' }}>Batch {batch.batch}</span>
                           <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-hard)' }}>{batch.student_count}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-soft)' }}>STUDENTS</div>
                           </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                           <div style={{ flex: 1, padding: '8px', background: 'white', borderRadius: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--olive-700)' }}>{batch.top_performers?.[0]?.solved_count || 0}</div>
                              <div style={{ fontSize: '9px', color: 'var(--text-soft)' }}>TOP SCORE</div>
                           </div>
                           <div style={{ flex: 1, padding: '8px', background: 'white', borderRadius: '12px', textAlign: 'center' }}>
                              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-hard)' }}>{batch.students?.filter(s => s.current_streak > 0).length || 0}</div>
                              <div style={{ fontSize: '9px', color: 'var(--text-soft)' }}>STREAKING</div>
                           </div>
                        </div>
                     </div>
                   ))}
                </div>
              </div>

              {selectedBatch && (
                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-hard)' }}>
                      Batch {selectedBatch} Students
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {((analytics?.batch_wise || []).find(b => b.batch === selectedBatch)?.sections?.length > 0) && (
                        <select
                          value={selectedSection}
                          onChange={(e) => setSelectedSection(e.target.value)}
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-hard)', fontSize: '13px', fontWeight: '600' }}
                        >
                          <option value="">All Sections</option>
                          {(analytics?.batch_wise || []).find(b => b.batch === selectedBatch)?.sections?.map(sec => (
                            <option key={sec} value={sec}>Section {sec}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="datetime-local"
                        value={batchReportDateFrom}
                        onChange={(e) => setBatchReportDateFrom(e.target.value)}
                        title="Report date & time range — from"
                        style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-hard)', fontSize: '13px' }}
                      />
                      <span style={{ color: 'var(--text-soft)', fontSize: '13px' }}>to</span>
                      <input
                        type="datetime-local"
                        value={batchReportDateTo}
                        onChange={(e) => setBatchReportDateTo(e.target.value)}
                        title="Report date & time range — to"
                        style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-hard)', fontSize: '13px' }}
                      />
                      <button
                        type="button"
                        onClick={() => downloadBatchReport(selectedBatch)}
                        disabled={downloadingBatchReport}
                        title={selectedSection ? `Download report for Section ${selectedSection}` : 'Download report for the full batch'}
                        style={{
                          padding: '8px 16px', borderRadius: '8px', border: 'none',
                          background: downloadingBatchReport ? '#9ca3af' : 'var(--olive-900)',
                          color: 'white', fontWeight: '700', fontSize: '13px',
                          cursor: downloadingBatchReport ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 7,
                        }}
                      >
                        {downloadingBatchReport ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                        {downloadingBatchReport ? 'Generating…' : (selectedSection ? `Report (Section ${selectedSection})` : 'Report (Full Batch)')}
                      </button>
                    </div>
                  </div>

                  {/* Batch Podium */}
                  {(() => {
                    const currentBatchData = (analytics?.batch_wise || []).find(b => b.batch === selectedBatch);
                    const top3 = currentBatchData?.top_performers || [];
                    if (top3.length === 0) return null;

                    return (
                      <div style={{ 
                        marginBottom: 32, padding: '24px', background: '#f8fafc', 
                        borderRadius: '24px', border: '1px solid #e2e8f0', textAlign: 'center' 
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-soft)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Batch {selectedBatch} Achievers
                        </div>
                        <div style={{ 
                          display: 'flex', justifyContent: 'center', alignItems: 'flex-end', 
                          gap: 0, padding: '10px 0', maxWidth: '500px', margin: '0 auto' 
                        }}>
                          {/* 2nd Place */}
                          {top3[1] && (
                            <div 
                              style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => setSelectedStudentForAnalytics(top3[1].register_number)}
                            >
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ 
                                  width: 52, height: 52, borderRadius: '16px', background: 'white',
                                  margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: '2px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                }}>
                                  <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-hard)' }}>{(top3[1].name || 'S')[0]}</span>
                                </div>
                              </div>
                              <div style={{ 
                                height: 80, background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)', 
                                borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', 
                                justifyContent: 'center', padding: '10px', position: 'relative'
                              }}>
                                <div style={{ 
                                  position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                                  width: 20, height: 20, background: '#94a3b8', color: 'white', borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900'
                                }}>2</div>
                                <div style={{ fontWeight: '800', fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top3[1].name}</div>
                                <div style={{ fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>{top3[1].solved_count || 0}</div>
                              </div>
                            </div>
                          )}

                          {/* 1st Place */}
                          {top3[0] && (
                            <div 
                              style={{ flex: 1.2, textAlign: 'center', position: 'relative', zIndex: 1, cursor: 'pointer' }}
                              onClick={() => setSelectedStudentForAnalytics(top3[0].register_number)}
                            >
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ 
                                  width: 64, height: 64, borderRadius: '20px', background: 'white',
                                  margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: '3px solid #fbbf24', boxShadow: '0 8px 16px rgba(251, 191, 36, 0.15)'
                                }}>
                                  <span style={{ fontSize: '22px', fontWeight: '800', color: '#b45309' }}>{(top3[0].name || 'S')[0]}</span>
                                </div>
                              </div>
                              <div style={{ 
                                height: 110, background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)', 
                                borderRadius: '16px 16px 0 0', display: 'flex', flexDirection: 'column', 
                                justifyContent: 'center', padding: '12px', position: 'relative',
                                boxShadow: '0 -5px 15px rgba(251, 191, 36, 0.1)'
                              }}>
                                <div style={{ 
                                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                                  width: 28, height: 28, background: '#fbbf24', color: 'white', borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '900'
                                }}>1</div>
                                <div style={{ fontWeight: '900', fontSize: '14px', color: '#92400e', marginBottom: 2 }}>{top3[0].name}</div>
                                <div style={{ fontSize: '24px', fontWeight: '900', color: '#78350f' }}>{top3[0].solved_count || 0}</div>
                              </div>
                            </div>
                          )}

                          {/* 3rd Place */}
                          {top3[2] && (
                            <div 
                              style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                              onClick={() => setSelectedStudentForAnalytics(top3[2].register_number)}
                            >
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ 
                                  width: 44, height: 44, borderRadius: '14px', background: 'white',
                                  margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  border: '2px solid #fdba74', boxShadow: '0 4px 12px rgba(253, 186, 116, 0.1)'
                                }}>
                                  <span style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c' }}>{(top3[2].name || 'S')[0]}</span>
                                </div>
                              </div>
                              <div style={{ 
                                height: 60, background: 'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)', 
                                borderRadius: '12px 12px 0 0', display: 'flex', flexDirection: 'column', 
                                justifyContent: 'center', padding: '10px', position: 'relative'
                              }}>
                                <div style={{ 
                                  position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                                  width: 20, height: 20, background: '#fdba74', color: 'white', borderRadius: '50%',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '900'
                                }}>3</div>
                                <div style={{ fontWeight: '800', fontSize: '12px', color: '#9a3412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top3[2].name}</div>
                                <div style={{ fontSize: '14px', fontWeight: '900', color: '#7c2d12' }}>{top3[2].solved_count || 0}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--bg-2)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600' }}>STUDENT</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>SECTION</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>SOLVED</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>STREAK</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics?.batch_wise || []).find(b => b.batch === selectedBatch)?.students
                          ?.filter(student => !selectedSection || student.section === selectedSection)
                          ?.map(student => (
                          <tr key={student.register_number} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                            <td style={{ padding: '16px 8px' }}>
                               <div style={{ fontWeight: '600', color: 'var(--text-hard)' }}>{student.name}</div>
                               <div style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{student.register_number}</div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-soft)' }}>
                              {student.section || '—'}
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px', fontWeight: '700', color: 'var(--olive-700)' }}>
                              {student.solved_count}
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px' }}>
                              {student.current_streak} 🔥
                            </td>
                            <td style={{ textAlign: 'right', padding: '16px 8px' }}>
                              <button 
                                onClick={() => setSelectedStudentForAnalytics(student.register_number)}
                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-700)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
                              >
                                View Analytics
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {activeTab === 'chat' && (
          <div className="discuss-tab" style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
            <DiscussPage
              userType="staff"
              staffProfile={staff}
            />
          </div>
        )}

        {/* Mentor Dashboard Tab */}
        {activeTab === 'mentor' && (
          <div className="tab-container">
            <StaffMentorTab onViewProgress={reg => setSelectedStudentForAnalytics(reg)} />
          </div>
        )}

        {/* Class Advisor Dashboard Tab */}
        {activeTab === 'advisor' && (
          <div className="tab-container">
            <StaffAdvisorTab />
          </div>
        )}

        {/* LMS Tab — placeholder until course content is built out */}
        {activeTab === 'lms' && (
          <div className="tab-container">
            <div style={{ padding: 48, textAlign: 'center', background: 'white', borderRadius: 24, border: '1px solid var(--border-soft)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Library size={26} style={{ color: 'var(--olive-700)' }} />
              </div>
              <h2 style={{ margin: '0 0 6px' }}>Coming Soon</h2>
              <p style={{ color: 'var(--text-soft)', margin: '0 0 20px' }}>The LMS is being built out — course content will appear here once it's added.</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-2)', padding: '10px 18px', borderRadius: 12, color: 'var(--text-soft)', fontSize: '0.9rem', fontWeight: 600 }}>
                <Sparkles size={16} /> Check back soon.
              </div>
            </div>
          </div>
        )}

        {/* Lab Submissions Tab */}
        {activeTab === 'labs' && (
          <div className="tab-container">
            <StaffLabPanel />
          </div>
        )}
      </main>

      {showContestDetail && (
        <ContestDetailModal
          contestId={showContestDetail}
          onClose={() => setShowContestDetail(null)}
        />
      )}
    </div>
  );
};


// ─── Staff Mentor Tab ────────────────────────────────────────────────────────

function StaffMentorTab({ onViewProgress }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedBatch, setExpandedBatch] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/mentor/dashboard/', { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || 'Failed to load');
      setData(d);
      if (d.batch_groups?.length) setExpandedBatch(d.batch_groups[0].batch);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading mentees...</div>;
  if (error) return (
    <div style={{ padding: 20, background: '#fee2e2', borderRadius: 10, color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>{error}</span>
      <button onClick={load} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Retry</button>
    </div>
  );
  if (!data) return null;

  if (data.total_mentees === 0) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
        <UserCheck size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
        <h3 style={{ margin: '0 0 8px', color: '#374151' }}>No mentees assigned</h3>
        <p style={{ margin: 0, fontSize: 14 }}>Ask the JA to assign students to you as their mentor.</p>
        <button onClick={load} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 9, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Refresh
        </button>
      </div>
    );
  }

  const filtered = search
    ? data.mentees.filter(s => (s.name || '').toLowerCase().includes(search.toLowerCase()) || String(s.register_number || '').includes(search))
    : null;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Mentees', value: data.total_mentees, color: '#2D6A4F' },
          { label: 'Avg Solved', value: data.total_mentees ? Math.round(data.mentees.reduce((a, s) => a + s.solved_count, 0) / data.total_mentees) : 0, color: '#1d4ed8' },
          { label: 'Active Today', value: data.mentees.filter(s => s.last_active === new Date().toISOString().slice(0,10)).length, color: '#7c3aed' },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Search + Refresh */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Users size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search mentees by name or register number..."
            style={{ width: '100%', padding: '10px 14px 10px 34px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <button onClick={load} disabled={loading} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: 'white', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
          ↺ Refresh
        </button>
      </div>

      {filtered ? (
        <MenteeTable students={filtered} onViewProgress={onViewProgress} />
      ) : (
        data.batch_groups.map(g => (
          <div key={g.batch} style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', marginBottom: 16, overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedBatch(expandedBatch === g.batch ? null : g.batch)}
              style={{ width: '100%', padding: '16px 20px', border: 'none', background: expandedBatch === g.batch ? '#f0fdf4' : 'white', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#111827' }}>Batch {g.batch}</span>
                <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{g.students.length} mentees</span>
              </div>
              <span style={{ color: '#6b7280', fontSize: 18 }}>{expandedBatch === g.batch ? '▾' : '▸'}</span>
            </button>
            {expandedBatch === g.batch && <MenteeTable students={g.students} onViewProgress={onViewProgress} />}
          </div>
        ))
      )}
    </div>
  );
}

function MenteeTable({ students, onViewProgress }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            {['Register No.', 'Name', 'Batch', 'Section', 'Solved', 'Streak', 'Last Active', 'Status', 'Progress'].map(h => (
              <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
              <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#374151' }}>{s.register_number}</td>
              <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{s.name}</td>
              <td style={{ padding: '11px 14px' }}><span style={{ background: '#f3f4f6', color: '#374151', padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{s.batch || '—'}</span></td>
              <td style={{ padding: '11px 14px' }}>{s.section ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{s.section}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
              <td style={{ padding: '11px 14px' }}><span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{s.solved_count}</span></td>
              <td style={{ padding: '11px 14px', fontSize: 13, color: s.current_streak > 0 ? '#065f46' : '#9ca3af', fontWeight: 600 }}>{s.current_streak > 0 ? `🔥 ${s.current_streak}` : '—'}</td>
              <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>{s.last_active || '—'}</td>
              <td style={{ padding: '11px 14px' }}>
                <span style={{ background: s.is_active ? '#d1fae5' : '#fee2e2', color: s.is_active ? '#065f46' : '#991b1b', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                  {s.is_active ? 'Active' : 'Blocked'}
                </span>
              </td>
              <td style={{ padding: '11px 14px' }}>
                <button
                  onClick={() => onViewProgress(s.register_number)}
                  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #2D6A4F', background: 'white', color: '#2D6A4F', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  View Progress
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Staff Class Advisor Tab ─────────────────────────────────────────────────

function StaffAdvisorTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [search, setSearch] = useState('');
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [isHourlyReportModalOpen, setIsHourlyReportModalOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/staff/advisor/dashboard/', { credentials: 'include' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.detail || 'Failed to load');
        setData(d);
        if (d.batches?.length) setSelectedBatch(`${d.batches[0].batch}:${d.batches[0].section}`);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading batch data...</div>;
  if (error) return <div style={{ padding: 20, background: '#fee2e2', borderRadius: 10, color: '#991b1b' }}>{error}</div>;
  if (!data) return null;

  if (!data.is_class_advisor) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af' }}>
        <GraduationCap size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
        <h3 style={{ margin: '0 0 8px', color: '#374151' }}>Not assigned as class advisor</h3>
        <p style={{ margin: 0, fontSize: 14 }}>Ask the JA to assign you as class advisor for a batch.</p>
      </div>
    );
  }

  const batchKey = b => b ? `${b.batch}:${b.section || ''}` : '';
  const currentBatch = (data.batches || []).find(b => batchKey(b) === selectedBatch) || data.batches?.[0];
  const filteredStudents = search && currentBatch
    ? currentBatch.students.filter(s => 
        (s.name || '').toLowerCase().includes(search.toLowerCase()) || 
        String(s.register_number || '').includes(search)
      )
    : currentBatch?.students || [];

  async function handleDownloadBatchReport(batchCode, section = '') {
    setDownloadingReport(true);
    try {
      const query = new URLSearchParams();
      if (section) query.append('section', section);
      const res = await fetch(`/api/batches/${encodeURIComponent(batchCode)}/report/?${query.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || 'Failed to generate batch report');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Batch_${batchCode}${section ? `_Sec_${section}` : ''}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Error downloading batch report PDF');
    } finally {
      setDownloadingReport(false);
    }
  }

  if (!currentBatch || !data.batches || data.batches.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: 16, border: '1px solid #e5e7eb' }}>
        <GraduationCap size={48} style={{ marginBottom: 16, opacity: 0.3, color: '#2D6A4F' }} />
        <h3 style={{ margin: '0 0 8px', color: '#111827', fontSize: 18, fontWeight: 700 }}>No Batch Data Available</h3>
        <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>There are currently no students or batches assigned to your department/section.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Batch/Section selector tabs */}
      {data.batches.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {data.batches.map(b => (
            <button
              key={batchKey(b)}
              onClick={() => { setSelectedBatch(batchKey(b)); setSearch(''); }}
              style={{
                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: selectedBatch === batchKey(b) ? 'none' : '1px solid #d1d5db',
                background: selectedBatch === batchKey(b) ? '#2D6A4F' : 'white',
                color: selectedBatch === batchKey(b) ? 'white' : '#374151',
              }}
            >
              Batch {b.batch}{b.section ? ` · Sec ${b.section}` : ''} <span style={{ opacity: 0.7 }}>({b.total_students})</span>
            </button>
          ))}
        </div>
      )}

      {currentBatch && (
        <>
          {/* Batch stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Students', value: currentBatch.total_students, color: '#2D6A4F' },
              { label: 'Active Students', value: currentBatch.active_students, color: '#1d4ed8' },
              { label: 'Avg Problems Solved', value: currentBatch.avg_solved, color: '#7c3aed' },
              { label: 'Avg Streak', value: `${currentBatch.avg_streak} days`, color: '#b45309' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', borderRadius: 14, padding: '18px 20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginTop: 2 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Users size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students..."
              style={{ width: '100%', padding: '10px 14px 10px 34px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, boxSizing: 'border-box' }} />
          </div>

          {/* Students table */}
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: '#111827' }}>
                Batch {currentBatch.batch}{currentBatch.section ? ` · Section ${currentBatch.section}` : ''} — {currentBatch.department}
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => handleDownloadBatchReport(currentBatch.batch, currentBatch.section)}
                  disabled={downloadingReport}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: '1px solid #059669',
                    background: '#ecfdf5',
                    color: '#047857',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: downloadingReport ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Download overall PDF performance report for this batch/section"
                >
                  <Download size={14} /> {downloadingReport ? 'Downloading...' : 'Batch Report (PDF)'}
                </button>

                <button
                  onClick={() => setIsHourlyReportModalOpen(true)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 10,
                    border: '1px solid #0284c7',
                    background: '#f0f9ff',
                    color: '#0369a1',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Select date and hour to generate session report PDF"
                >
                  <Calendar size={14} /> Hourly Report (PDF)
                </button>

                <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{filteredStudents.length} students</span>
              </div>
            </div>

            <HourlyBatchReportModal
              isOpen={isHourlyReportModalOpen}
              onClose={() => setIsHourlyReportModalOpen(false)}
              availableBatches={data.batches.map(b => b.batch).filter(Boolean)}
              availableSections={['A', 'B', 'C', 'D']}
            />
            {filteredStudents.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>No students found.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Register No.', 'Name', 'Section', 'Solved', 'Streak', 'Last Active', 'Mentor', 'Status'].map(h => (
                        <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((s, i) => (
                      <tr key={s.register_number} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#374151' }}>{s.register_number}</td>
                        <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: '11px 14px' }}>{s.section ? <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>{s.section}</span> : <span style={{ color: '#9ca3af' }}>—</span>}</td>
                        <td style={{ padding: '11px 14px' }}><span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{s.solved_count}</span></td>
                        <td style={{ padding: '11px 14px', fontSize: 13, color: s.current_streak > 0 ? '#065f46' : '#9ca3af', fontWeight: 600 }}>{s.current_streak > 0 ? `🔥 ${s.current_streak}` : '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 12, color: '#6b7280' }}>{s.last_active || '—'}</td>
                        <td style={{ padding: '11px 14px', fontSize: 12, color: s.mentor ? '#1e40af' : '#9ca3af' }}>
                          {s.mentor ? s.mentor.name : <em>Not assigned</em>}
                        </td>
                        <td style={{ padding: '11px 14px' }}>
                          <span style={{ background: s.is_active ? '#d1fae5' : '#fee2e2', color: s.is_active ? '#065f46' : '#991b1b', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                            {s.is_active ? 'Active' : 'Blocked'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default StaffDashboard;
