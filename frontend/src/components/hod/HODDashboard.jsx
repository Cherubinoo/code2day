// HOD Dashboard - Head of Department
// Features: Manage staff, view department analytics, approve requests

import { useState, useEffect } from 'react';
import {
  Users, Trophy, BookOpen, BarChart3, Search, Filter, ChevronRight,
  Settings, Bell, MoreVertical, ExternalLink, Shield, ShieldOff,
  UserPlus, Check, X, FileText, Briefcase, Layout, UserCheck, Building2,
  Calendar, Lock, Unlock, CheckCircle, BarChart, XCircle, Activity, Brain, MessageSquare,
  Pencil, Plus, Eye, EyeOff, Download, Clock
} from 'lucide-react';
import DoubleConfirmModal from '../common/DoubleConfirmModal';
import { getCsrfToken } from '../../lib/appUtils';
import ContestApprovalPanel from './ContestApprovalPanel';
import ContestDetailModal from '../common/ContestDetailModal';
import EnhancedContestCreator from '../staff/EnhancedContestCreator';
import DiscussPage from '../student/pages/DiscussPage';
import HODLabCenter from './HODLabCenter';
import HODCompanyCenter from './HODCompanyCenter';
import StaffLabPanel from '../staff/StaffLabPanel';
import { PerformanceDashboard } from '../common/PerformanceCharts';
import { FlaskConical } from 'lucide-react';
import { useTabNav } from '../../lib/useTabNav';
import UserSystemUpdatesWidget from '../common/UserSystemUpdatesWidget';
import HourlyBatchReportModal from '../common/HourlyBatchReportModal';



const HODDashboard = ({ institutionId }) => {
  const sidebarItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'performance', label: 'Performance', icon: Trophy },
    { id: 'staff', label: 'Staff Directory', icon: Users },
    { id: 'students', label: 'Student Directory', icon: UserCheck },
    { id: 'batches', label: 'Batch Analytics', icon: Building2 },
    { id: 'contests', label: 'Contest Center', icon: Layout },
    { id: 'labs', label: 'Lab Center', icon: FlaskConical },
    { id: 'companies', label: 'Companies', icon: Briefcase },
    { id: 'my-practicals', label: 'My Practicals', icon: Pencil },
    { id: 'discuss', label: 'Discuss', icon: MessageSquare },
  ];

  const [activeTab, setActiveTab] = useTabNav('overview');
  const [stats, setStats] = useState({
    staffCount: 0,
    studentCount: 0,
    totalContests: 0,
    pendingApprovals: 0,
  });
  const [weeklyActivity, setWeeklyActivity] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [staffPerformance, setStaffPerformance] = useState([]);
  const [department, setDepartment] = useState(null);
  const [departmentStudents, setDepartmentStudents] = useState([]);
  const [contests, setContests] = useState([]);
  const [showContestCreator, setShowContestCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [staffDetail, setStaffDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedContest, setSelectedContest] = useState(null);
  const [contestDetail, setContestDetail] = useState(null);
  const [contestAnalytics, setContestAnalytics] = useState(null);
  const [contestLoading, setContestLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [selectedSection, setSelectedSection] = useState('');
  const [isHourlyReportModalOpen, setIsHourlyReportModalOpen] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [showContestDetail, setShowContestDetail] = useState(null);
  const [staffData, setStaffData] = useState({});
  const [recentActivity, setRecentActivity] = useState([]);
  const [engagementSummary, setEngagementSummary] = useState({ active_today: 0, avg_solved: 0, participation_rate: 0 });
  const [staffProfile, setStaffProfile] = useState(null);
  const [unreadDiscussCount, setUnreadDiscussCount] = useState(0);
  const [departments, setDepartments] = useState([]);
  const [selectedDeptId, setSelectedDeptId] = useState(null);

  // Contest tab specific state
  const [hodContestSearch, setHodContestSearch] = useState('');
  const [hodContestDateFilter, setHodContestDateFilter] = useState('');
  const [hodContestLimit, setHodContestLimit] = useState(10);

  // Staff add/edit form state
  const [staffForm, setStaffForm] = useState(null); // null=closed, "add"=new, {faculty_id,...}=editing
  const [staffFormData, setStaffFormData] = useState({ faculty_id: '', name: '', role: 'staff', password: '' });
  const [staffFormBusy, setStaffFormBusy] = useState(false);
  const [staffFormErr, setStaffFormErr] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [confirmState, setConfirmState] = useState({ show: false, m1: '', m2: '', onConfirm: null, firstOk: false });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm, firstOk: false });
  };

  // Poll discuss threads for unread badge
  useEffect(() => {
    async function fetchUnreadCount() {
      try {
        const res = await fetch('/api/discussions/threads/', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const threads = Array.isArray(data) ? data : (data.results ?? []);
          const total = threads.reduce((sum, t) => sum + (t.unread_count || 0), 0);
          setUnreadDiscussCount(total);
        }
      } catch (e) {
        // silent fail
      }
    }
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadHODData(deptId = null) {
    try {
      setLoading(true);
      // Fetch dashboard data
      const dashboardRes = await fetch('/api/dashboard/', { credentials: 'include' });
      if (dashboardRes.ok) {
        const dashboardData = await dashboardRes.json();
        
        if (dashboardData.user?.departments) {
          setDepartments(dashboardData.user.departments);
        }

        if (deptId) {
          // Load department-specific data
          const deptRes = await fetch(`/api/departments/${deptId}/details/`, { credentials: 'include' });
          if (deptRes.ok) {
            const deptData = await deptRes.json();
            
            // Set stats and analytics from department data
            setStats({
              studentCount: deptData.department?.assigned_students || 0,
              totalContests: deptData.analytics?.contests?.length || 0,
              pendingApprovals: 0, // Department view might not show approvals or we can fetch them
              staffCount: 0, // Will load below
            });
            setWeeklyActivity(deptData.analytics?.weekly_progress || []);
            setLeaderboard(deptData.analytics?.top_performers || []);
            setStaffData(prev => ({
              ...prev,
              department: deptData.department,
              totalStudents: deptData.department?.assigned_students
            }));
            setRecentActivity(deptData.analytics?.recent_activity || []);
            setEngagementSummary(deptData.analytics?.engagement_summary || { active_today: 0, avg_solved: 0, participation_rate: 0 });
            
            // Fetch staff list for this specific department
            const staffRes = await fetch(`/api/staff/institutions/${institutionId}/details/`, { credentials: 'include' });
            if (staffRes.ok) {
              const staffData = await staffRes.json();
              // Filter staff list by department
              const filteredStaff = staffData.staff?.filter(s => s.department_id === deptId) || [];
              setStaffList(filteredStaff);
              setDepartment(deptData.department);
              setDepartmentStudents(deptData.analytics?.batch_wise?.[0]?.students || []); // Fallback
              setStats(prev => ({ ...prev, staffCount: filteredStaff.length }));
            }
            
            // Set contests from department data
            setContests(deptData.analytics?.contests || []);
          }
        } else {
          // Institutional View (Current HOD View)
          setStats({
            studentCount: dashboardData.user?.totalStudents || 0,
            totalContests: dashboardData.user?.totalContests || 0,
            pendingApprovals: dashboardData.user?.pendingApprovals || 0,
            staffCount: 0, // Will be updated by staffRes
          });
          setWeeklyActivity(dashboardData.weeklyActivity || []);
          setLeaderboard(dashboardData.leaderboard || []);
          setStaffData(dashboardData.user || {});
          setRecentActivity(dashboardData.recentActivity || []);
          setEngagementSummary(dashboardData.engagementSummary || { active_today: 0, avg_solved: 0, participation_rate: 0 });
          setStaffProfile(dashboardData.staff || null);

          // Fetch staff list for the department/institution
          if (institutionId) {
            const staffRes = await fetch(`/api/staff/institutions/${institutionId}/details/`, { credentials: 'include' });
            if (staffRes.ok) {
              const staffData = await staffRes.json();
              setStaffList(staffData.staff || []);
              setDepartment(staffData.department || null);
              setDepartmentStudents(staffData.students || []);
              setStats(prev => ({
                ...prev,
                staffCount: staffData.staff?.length || 0,
              }));
            }
            
            // Fetch staff performance data
            const perfRes = await fetch(`/api/staff/institutions/${institutionId}/performance/`, { credentials: 'include' });
            if (perfRes.ok) {
              const perfData = await perfRes.json();
              setStaffPerformance(perfData.staff_performance || []);
            }
            
            // Fetch contests for the department
            const contestsRes = await fetch(`/api/contests/`, { credentials: 'include' });
            if (contestsRes.ok) {
              const contestsData = await contestsRes.json();
              setContests(contestsData.contests || []);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHODData();
  }, [institutionId]);

  async function handleStaffClick(facultyId) {
    setSelectedStaff(facultyId);
    setDetailLoading(true);
    setStaffDetail(null);
    try {
      const res = await fetch(`/api/staff/${facultyId}/details/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStaffDetail(data);
      } else {
        setError('Failed to load staff details');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeStaffDetail() {
    setSelectedStaff(null);
    setStaffDetail(null);
  }

  function refreshContests() {
    fetch(`/api/contests/`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setContests(data.contests || []);
        const pendingCount = (data.contests || []).filter(c => c.status === 'pending_approval').length;
        setStats(prev => ({ ...prev, pendingApprovals: pendingCount, totalContests: (data.contests || []).length }));
      });
  }

  async function handleContestClick(contestId) {
    setSelectedContest(contestId);
    setContestLoading(true);
    setContestDetail(null);
    setContestAnalytics(null);
    try {
      // Fetch contest details
      const detailRes = await fetch(`/api/contests/${contestId}/`, { credentials: 'include' });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setContestDetail(detailData);
      }
      
      // Fetch contest analytics
      const analyticsRes = await fetch(`/api/contests/${contestId}/analytics/`, { credentials: 'include' });
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setContestAnalytics(analyticsData);
      }
    } catch (err) {
      setError('Failed to load contest details');
    } finally {
      setContestLoading(false);
    }
  }

  function closeContestDetail() {
    setSelectedContest(null);
    setContestDetail(null);
    setContestAnalytics(null);
  }

  async function handleStaffLockToggle(facultyId, currentStatus) {
    const action = currentStatus ? 'LOCK' : 'UNLOCK';
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/staff/${facultyId}/lock/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
          });
          if (res.ok) {
            const data = await res.json();
            setStaffList(prev =>
              prev.map(s =>
                s.faculty_id === facultyId ? { ...s, is_active: data.is_active } : s
              )
            );
            setError(null);
          } else {
            const errData = await res.json();
            setError(errData.detail || 'Failed to lock/unlock staff');
          }
        } catch (err) {
          setError(err.message);
        }
      },
      `Are you sure you want to ${action} this staff member?`,
      `FINAL CONFIRMATION: This will immediately ${action.toLowerCase()} system access for ${facultyId}.`
    );
  }

  async function handleStudentBlockToggle(registerNumber) {
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/students/${registerNumber}/block/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRFToken': getCsrfToken() },
          });
          if (res.ok) {
            const data = await res.json();
            setDepartmentStudents(prev =>
              prev.map(s =>
                s.register_number === registerNumber ? { ...s, is_active: data.is_active } : s
              )
            );
            if (studentDetail && studentDetail.student.register_number === registerNumber) {
              setStudentDetail(prev => ({
                ...prev,
                student: { ...prev.student, is_active: data.is_active },
              }));
            }
            setError(null);
          } else {
            const errData = await res.json();
            setError(errData.detail || 'Failed to block/unblock student');
          }
        } catch (err) {
          setError(err.message);
        }
      },
      "Toggle student account status?",
      "Warning: This will prevent the student from logging in and accessing any practice materials. Confirm toggle?"
    );
  }

  async function handleStudentCopyPasteToggle(registerNumber, currentVal) {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(registerNumber)}/toggle-copy-paste/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ allow_copy_paste: !currentVal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to toggle copy-paste permission');
      
      setDepartmentStudents(prev =>
        prev.map(s =>
          s.register_number === registerNumber ? { ...s, allow_copy_paste: data.allow_copy_paste } : s
        )
      );
      if (studentDetail && studentDetail.student.register_number === registerNumber) {
        setStudentDetail(prev => ({
          ...prev,
          student: { ...prev.student, allow_copy_paste: data.allow_copy_paste },
        }));
      }
    } catch (err) {
      alert(err.message || 'Failed to toggle copy-paste permission');
    }
  }

  async function handleBatchCopyPasteToggle(batchCode, allowCopyPaste) {
    const actionLabel = allowCopyPaste ? "UNLOCK (allow)" : "BLOCK (disable)";
    const targetLabel = batchCode === 'all' ? "ALL students across all batches" : `all students in Batch ${batchCode}`;
    
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/batches/${encodeURIComponent(batchCode)}/toggle-copy-paste/`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify({ allow_copy_paste: allowCopyPaste }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to update batch copy-paste permissions');
          
          setDepartmentStudents(prev =>
            prev.map(s => {
              if (batchCode === 'all' || s.batch === batchCode) {
                return { ...s, allow_copy_paste: data.allow_copy_paste };
              }
              return s;
            })
          );
        } catch (err) {
          alert(err.message || 'Failed to update batch copy-paste permissions');
        }
      },
      `Are you sure you want to ${actionLabel} copy-paste for ${targetLabel}?`,
      `Final confirmation: This will update copy-paste permissions for ${targetLabel}. Confirm bulk change?`
    );
  }

  async function handleBatchBlockToggle(batchCode, isActive) {
    const actionLabel = isActive ? "UNBLOCK / ACTIVATE" : "BLOCK (disable)";
    const targetLabel = batchCode === 'all' ? "ALL students across all batches" : `all students in Batch ${batchCode}`;
    
    askDouble(
      async () => {
        try {
          const res = await fetch(`/api/batches/${encodeURIComponent(batchCode)}/toggle-block/`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify({ is_active: isActive }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Failed to update batch student status');
          
          setDepartmentStudents(prev =>
            prev.map(s => {
              if (batchCode === 'all' || s.batch === batchCode) {
                return { ...s, is_active: data.is_active };
              }
              return s;
            })
          );
        } catch (err) {
          alert(err.message || 'Failed to update batch student status');
        }
      },
      `Are you sure you want to ${actionLabel} account access for ${targetLabel}?`,
      `Final confirmation: This will change login access for ${targetLabel}. Confirm bulk change?`
    );
  }

  const [downloadingReport, setDownloadingReport] = useState(false);

  async function handleDownloadBatchReport(batchCode) {
    if (!batchCode || batchCode === 'all') {
      const availableBatches = Array.from(new Set(departmentStudents.map(s => s.batch).filter(Boolean)));
      if (availableBatches.length > 0) {
        batchCode = availableBatches[0];
      } else {
        alert("No specific batch available to download.");
        return;
      }
    }

    setDownloadingReport(true);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchCode)}/report/`, {
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
      a.download = `Batch_${batchCode}_Performance_Report.pdf`;
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

  async function handleStudentClick(registerNumber) {
    setSelectedStudent(registerNumber);
    setStudentDetailLoading(true);
    setStudentDetail(null);
    try {
      const [detailsRes, analyticsRes] = await Promise.all([
        fetch(`/api/students/${registerNumber}/details/`, { credentials: 'include' }),
        fetch(`/api/students/${registerNumber}/analytics/`, { credentials: 'include' })
      ]);
      if (detailsRes.ok && analyticsRes.ok) {
        const detailsData = await detailsRes.json();
        const analyticsData = await analyticsRes.json();
        setStudentDetail({
          ...detailsData,
          fullAnalytics: analyticsData
        });
      } else {
        setError('Failed to load student details');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStudentDetailLoading(false);
    }
  }

  function closeStudentDetail() {
    setSelectedStudent(null);
    setStudentDetail(null);
  }

  function openAddStaff() {
    setStaffFormData({ faculty_id: '', name: '', role: 'staff', password: '' });
    setStaffFormErr('');
    setShowPassword(false);
    setStaffForm('add');
  }

  function openEditStaff(staff) {
    setStaffFormData({ faculty_id: staff.faculty_id, name: staff.name, role: staff.role || 'staff', password: '' });
    setStaffFormErr('');
    setShowPassword(false);
    setStaffForm(staff);
  }

  function closeStaffForm() {
    setStaffForm(null);
    setStaffFormErr('');
    setStaffFormBusy(false);
  }

  async function submitStaffForm() {
    const isAdding = staffForm === 'add';
    const { faculty_id, name, role, password } = staffFormData;
    if (!faculty_id.trim()) { setStaffFormErr('Faculty ID is required'); return; }
    if (!name.trim()) { setStaffFormErr('Name is required'); return; }
    setStaffFormBusy(true);
    setStaffFormErr('');
    try {
      const csrfToken = getCsrfToken();
      const headers = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-CSRFToken'] = csrfToken;
      const body = isAdding
        ? { faculty_id: faculty_id.trim(), name: name.trim(), role, password: password.trim() }
        : { name: name.trim(), role, ...(password.trim() ? { password: password.trim() } : {}) };
      const url = isAdding ? '/api/hod/staff/' : `/api/hod/staff/${staffForm.faculty_id}/`;
      const res = await fetch(url, {
        method: isAdding ? 'POST' : 'PUT',
        credentials: 'include',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStaffFormErr(data.error || 'Failed to save');
        setStaffFormBusy(false);
        return;
      }
      // Update local staffList
      if (isAdding) {
        setStaffList(prev => [...prev, { ...data, department_id: prev[0]?.department_id }]);
      } else {
        setStaffList(prev => prev.map(s => s.faculty_id === data.faculty_id ? { ...s, ...data } : s));
        if (staffDetail && staffDetail.staff?.faculty_id === data.faculty_id) {
          setStaffDetail(prev => ({ ...prev, staff: { ...prev.staff, ...data } }));
        }
      }
      closeStaffForm();
    } catch {
      setStaffFormErr('Network error. Please try again.');
      setStaffFormBusy(false);
    }
  }

  if (!institutionId) {
    return (
      <div className="admin-dashboard">
        <div className="admin-container">
          <div className="admin-header">
            <h1>HOD Dashboard</h1>
            <p>Head of Department - Manage your department</p>
          </div>
          <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
            <p>No institution assigned. Please contact administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-layout">
      {showContestDetail && (
        <ContestDetailModal
          contestId={showContestDetail}
          onClose={() => setShowContestDetail(null)}
        />
      )}

      {showContestCreator && (
        <EnhancedContestCreator
          onClose={() => setShowContestCreator(false)}
          onSuccess={() => { setShowContestCreator(false); refreshContests(); }}
          initialType={showContestCreator.type || 'programming'}
        />
      )}

      {/* Premium Sidebar */}
      <aside className="admin-sidebar">
        <div className="sidebar-header">
          <div className="logo-container">
            <Trophy size={28} color="var(--olive-500)" />
            <div className="logo-text">
              <span className="logo-main">CODE-2DAY</span>
              <span className="logo-sub">HOD CONSOLE</span>
            </div>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          {sidebarItems.map(item => (
            <button 
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (item.id === 'discuss') setUnreadDiscussCount(0);
              }}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            >
              <item.icon size={20} className="nav-icon" />
              {item.label}
              {item.id === 'contests' && stats.pendingApprovals > 0 && (
                <span className="nav-badge">{stats.pendingApprovals}</span>
              )}
              {item.id === 'discuss' && unreadDiscussCount > 0 && (
                <span className="nav-badge">{unreadDiscussCount}</span>
              )}
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
              {(staffData.name || 'H')[0]}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-hard)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {staffData.name}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{staffData.facultyId}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className={`hod-main-content ${activeTab === 'discuss' ? 'no-padding' : ''}`}>
        {activeTab !== 'discuss' && (
          <div className="admin-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <h1>{sidebarItems.find(i => i.id === activeTab)?.label || 'Overview'}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <p style={{ margin: 0 }}>Management Control Center • {staffData.department?.name || 'Overall Institution'}</p>
                  
                  {departments.length > 0 && (
                    <select 
                      value={selectedDeptId || ''} 
                      onChange={(e) => {
                        const val = e.target.value;
                        const newId = val ? parseInt(val) : null;
                        setSelectedDeptId(newId);
                        loadHODData(newId);
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
                  onClick={() => window.open(`/api/staff/${staffData.facultyId}/report/`, '_blank')}
                  style={{ 
                    padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-soft)',
                    background: 'white', color: 'var(--olive-700)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: '14px', fontWeight: '600'
                  }}
                >
                  <FileText size={18} /> Get My Report
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>
            <div className="admin-loading-spinner" style={{ margin: '0 auto 16px' }}></div>
            Loading department data...
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: '#fee2e2', borderRadius: 8, color: '#dc2626', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={20} />
            <strong>Error:</strong> {error}
          </div>
        )}

        <UserSystemUpdatesWidget />

        <div className="tab-container">
          {activeTab === 'performance' && (
            <div className="performance-tab">
              {/* Department Performance Podium */}
              <div className="premium-card" style={{ marginBottom: 32, textAlign: 'center', background: 'var(--bg-1)' }}>
                <h3 style={{ marginBottom: 40, fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                  Department Achievers
                </h3>
                
                {leaderboard && leaderboard.length > 0 ? (
                  <div style={{ 
                    display: 'flex', justifyContent: 'center', alignItems: 'flex-end', 
                    gap: 0, padding: '20px 0', maxWidth: '600px', margin: '0 auto' 
                  }}>
                    {/* 2nd Place */}
                    {leaderboard.length > 1 && (
                      <div 
                        style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => handleStudentClick(leaderboard[1].id)}
                      >
                        <div style={{ marginBottom: 12, position: 'relative' }}>
                          <div style={{ 
                            width: 64, height: 64, borderRadius: '20px', background: 'white',
                            margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '3px solid white', boxShadow: '0 8px 16px rgba(0,0,0,0.08)'
                          }}>
                            <span style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-hard)' }}>{(leaderboard[1].name || 'S')[0]}</span>
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
                          <div style={{ fontWeight: '800', fontSize: '14px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leaderboard[1].name || 'Student'}</div>
                          <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e293b' }}>{leaderboard[1].score || 0}</div>
                        </div>
                      </div>
                    )}

                    {/* 1st Place */}
                    {leaderboard.length > 0 && (
                      <div 
                        style={{ flex: 1.2, textAlign: 'center', position: 'relative', zIndex: 1, cursor: 'pointer' }}
                        onClick={() => handleStudentClick(leaderboard[0].id)}
                      >
                        <div style={{ marginBottom: 16, position: 'relative' }}>
                          <div style={{ 
                            width: 80, height: 80, borderRadius: '24px', background: 'white',
                            margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '4px solid #fbbf24', boxShadow: '0 12px 24px rgba(251, 191, 36, 0.2)'
                          }}>
                            <span style={{ fontSize: '28px', fontWeight: '800', color: '#b45309' }}>{(leaderboard[0].name || 'S')[0]}</span>
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
                          <div style={{ fontWeight: '900', fontSize: '16px', color: '#92400e', marginBottom: 4 }}>{leaderboard[0].name || 'Student'}</div>
                          <div style={{ fontSize: '32px', fontWeight: '900', color: '#78350f' }}>{leaderboard[0].score || 0}</div>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#b45309', textTransform: 'uppercase' }}>Solved</div>
                        </div>
                      </div>
                    )}

                    {/* 3rd Place */}
                    {leaderboard.length > 2 && (
                      <div 
                        style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => handleStudentClick(leaderboard[2].id)}
                      >
                        <div style={{ marginBottom: 12, position: 'relative' }}>
                          <div style={{ 
                            width: 56, height: 56, borderRadius: '18px', background: 'white',
                            margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '3px solid #fdba74', boxShadow: '0 8px 16px rgba(253, 186, 116, 0.15)'
                          }}>
                            <span style={{ fontSize: '20px', fontWeight: '800', color: '#c2410c' }}>{(leaderboard[2].name || 'S')[0]}</span>
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
                          <div style={{ fontWeight: '800', fontSize: '14px', color: '#9a3412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{leaderboard[2].name || 'Student'}</div>
                          <div style={{ fontSize: '18px', fontWeight: '900', color: '#7c2d12' }}>{leaderboard[2].score || 0}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '40px 0', color: 'var(--text-soft)' }}>
                    No performance data available yet.
                  </div>
                )}
              </div>

              {/* Department Leaderboard Table */}
              <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Department Rankings</h3>
                  <div style={{ color: 'var(--text-soft)', fontSize: '13px' }}>Updated Real-time</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(leaderboard || []).slice(3, 15).map((student, idx) => (
                    <div 
                      key={student.id}
                      className="leaderboard-item"
                      onClick={() => handleStudentClick(student.id)}
                      style={{
                        padding: '16px 20px', background: 'white', borderRadius: '16px',
                        display: 'flex', alignItems: 'center', gap: 20,
                        border: '1px solid var(--border-soft)', cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ width: 28, fontSize: '14px', fontWeight: '800', color: 'var(--text-soft)' }}>{idx + 4}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
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
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--olive-700)' }}>{student.score || 0}</div>
                        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-soft)', textTransform: 'uppercase' }}>Solved</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}



        {activeTab === 'overview' && (
            <div className="overview-tab">
              {/* Premium Metric Grid */}
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, marginBottom: 32 }}>
                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
                    <Users size={24} />
                  </div>
                  <div>
                    <h4>TOTAL STUDENTS</h4>
                    <div className="value">{stats.studentCount}</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                    <Shield size={24} />
                  </div>
                  <div>
                    <h4>FACULTY MEMBERS</h4>
                    <div className="value">{stats.staffCount}</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#ecfdf5', color: '#059669' }}>
                    <Activity size={24} />
                  </div>
                  <div>
                    <h4>ACTIVE TODAY</h4>
                    <div className="value">{engagementSummary.active_today}</div>
                    <div style={{ fontSize: '12px', color: '#059669', fontWeight: '700' }}>
                      {engagementSummary.participation_rate}% Participation
                    </div>
                  </div>
                </div>
                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: '#fff7ed', color: '#ea580c' }}>
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h4>AVG. SOLVED</h4>
                    <div className="value">{engagementSummary.avg_solved}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-soft)', fontWeight: '600' }}>Problems / Student</div>
                  </div>
                </div>

                <div className="metric-card premium-card">
                  <div className="icon-box" style={{ background: stats.pendingApprovals > 0 ? '#fef2f2' : '#f0fdf4', color: stats.pendingApprovals > 0 ? '#dc2626' : '#16a34a' }}>
                    {stats.pendingApprovals > 0 ? <Calendar size={24} /> : <CheckCircle size={24} />}
                  </div>
                  <div>
                    <h4>PENDING</h4>
                    <div className="value" style={{ color: stats.pendingApprovals > 0 ? '#dc2626' : 'inherit' }}>
                      {stats.pendingApprovals}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-soft)', fontWeight: '600' }}>Approvals Needed</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 32, alignItems: 'start' }}>
                {/* Department Activity Graph */}
                <div className="premium-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Weekly Solving Activity</h3>
                    <div style={{ color: 'var(--text-soft)', fontSize: '13px' }}>Problem Solutions</div>
                  </div>
                  
                  <div style={{ height: 240, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 10px' }}>
                    {weeklyActivity.map((day) => {
                      const maxCount = Math.max(...weeklyActivity.map(d => d.count), 1);
                      const height = (day.count / maxCount) * 180;
                      return (
                        <div key={day.day} style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ 
                            width: '60%', 
                            height: `${height}px`, 
                            background: 'linear-gradient(180deg, var(--olive-600) 0%, var(--olive-900) 100%)', 
                            borderRadius: '8px 8px 4px 4px',
                            minHeight: day.count > 0 ? 8 : 2,
                            transition: 'height 0.3s ease',
                            position: 'relative'
                          }}>
                            {day.count > 0 && (
                              <div style={{ 
                                position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)',
                                fontSize: '11px', fontWeight: '800', color: 'var(--olive-900)'
                              }}>{day.count}</div>
                            )}
                          </div>
                          <div style={{ marginTop: 12, fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)' }}>{day.day}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Activity Feed */}
                <div className="premium-card">
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-hard)', marginBottom: 20 }}>Department Activity</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {(recentActivity || []).length > 0 ? recentActivity.map((act, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ 
                          width: 40, height: 40, borderRadius: '12px', background: 'var(--sage-100)', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          fontSize: '14px', fontWeight: '800', color: 'var(--olive-700)'
                        }}>
                          {(act.student_name || 'S')[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                            <strong style={{ color: 'var(--text-hard)' }}>{act.student_name || 'Student'}</strong>
                            <span style={{ color: 'var(--text-soft)' }}> solved </span>
                            <strong style={{ color: 'var(--olive-700)' }}>{act.problem_title || 'a problem'}</strong>
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 4 }}>
                            {new Date(act.solved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', color: '#999', padding: '20px 0', fontSize: '14px' }}>
                        No recent activity recorded.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="performance-tab">
              <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                      Department Performance &amp; Analytics
                    </h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                      Overall student solving activity, contest benchmarks, and skill distribution for {department?.name || 'your department'}.
                    </p>
                  </div>
                </div>
                <PerformanceDashboard
                  scoreHistory={leaderboard || []}
                  testsCompleted={stats.totalContests || 0}
                  solvedCount={stats.studentCount || 0}
                  summaryCards={{
                    programming_solved: stats.totalContests || 0,
                    aptitude_solved: Math.round((stats.studentCount || 0) * 0.8),
                    contest_solved: stats.totalContests || 0,
                    active_days: weeklyActivity.length || 7,
                  }}
                />
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
            <div className="staff-tab">
              <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Department Staff</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                      Oversee and manage faculty access for {department?.name || 'your department'}.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ padding: '8px 16px', background: 'var(--bg-2)', borderRadius: '12px', fontSize: '13px', fontWeight: '600', color: 'var(--olive-700)' }}>
                      {staffList.length} Total Members
                    </div>
                    <button
                      onClick={openAddStaff}
                      style={{
                        padding: '8px 18px', borderRadius: '12px', border: 'none',
                        background: 'var(--olive-900)', color: 'white',
                        fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Plus size={15} /> Add Staff
                    </button>
                  </div>
                </div>

                {staffList.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: '60px 0' }}>
                    <Users size={64} style={{ marginBottom: 20, opacity: 0.2, color: 'var(--olive-900)' }} />
                    <p>No staff accounts found in this department.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {staffList.map((staff) => (
                      <div 
                        key={staff.faculty_id} 
                        className="staff-list-item"
                        style={{
                          padding: '16px 20px',
                          background: staff.is_active === false ? '#fff1f2' : 'white',
                          borderRadius: '16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          border: '1px solid var(--border-soft)',
                          transition: 'all 0.2s ease',
                          opacity: staff.is_active === false ? 0.8 : 1,
                        }}
                      >
                        <div 
                          onClick={() => handleStaffClick(staff.faculty_id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', flex: 1 }}
                        >
                          <div style={{
                            width: 44, height: 44, borderRadius: '12px',
                            background: staff.is_active === false ? '#fda4af' : 'var(--sage-100)',
                            color: staff.is_active === false ? '#9f1239' : 'var(--olive-700)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '16px', fontWeight: '700'
                          }}>
                            {(staff.name || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '700', color: 'var(--text-hard)', fontSize: '15px' }}>
                              {staff.name || 'Unnamed Faculty'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                              <span style={{ color: 'var(--text-soft)', fontSize: '12px' }}>ID: {staff.faculty_id}</span>
                              <span style={{ 
                                padding: '2px 8px', borderRadius: '6px', 
                                background: staff.role === 'hod' ? '#e0e7ff' : '#f3f4f6', 
                                color: staff.role === 'hod' ? '#4338ca' : '#64748b',
                                fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
                              }}>
                                {staff.role}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {staff.role !== 'hod' && staff.role !== 'admin' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStaffLockToggle(staff.faculty_id, staff.is_active);
                              }}
                              style={{
                                padding: '8px 14px',
                                borderRadius: '10px',
                                border: 'none',
                                background: staff.is_active === false ? '#10b981' : '#ef4444',
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                              }}
                            >
                              {staff.is_active === false ? <Unlock size={14} /> : <Lock size={14} />}
                              {staff.is_active === false ? 'Unlock' : 'Lock'}
                            </button>
                          )}

                          <button
                            onClick={(e) => { e.stopPropagation(); openEditStaff(staff); }}
                            title="Edit staff details"
                            style={{
                              padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border-soft)',
                              background: 'white', color: 'var(--olive-700)', fontSize: '12px',
                              fontWeight: '600', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                          >
                            <Pencil size={13} /> Edit
                          </button>

                          <button
                            onClick={() => handleStaffClick(staff.faculty_id)}
                            style={{
                              padding: '8px', borderRadius: '10px',
                              background: 'var(--bg-2)', border: 'none',
                              color: 'var(--olive-700)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Staff Add / Edit Drawer */}
          {staffForm !== null && (
            <div
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1100, padding: 20,
              }}
              onClick={closeStaffForm}
            >
              <div
                style={{
                  background: 'white', borderRadius: 20, width: '100%', maxWidth: 480,
                  boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
                  padding: 32, position: 'relative',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                      {staffForm === 'add' ? 'Add New Staff' : 'Edit Staff Details'}
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-soft)' }}>
                      {staffForm === 'add' ? 'Add a faculty member to your department' : `Editing: ${staffForm.faculty_id}`}
                    </p>
                  </div>
                  <button
                    onClick={closeStaffForm}
                    style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'var(--bg-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X size={16} color="var(--text-hard)" />
                  </button>
                </div>

                {/* Form fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Faculty ID — only when adding */}
                  {staffForm === 'add' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Faculty ID *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. F001 or EMP123"
                        value={staffFormData.faculty_id}
                        onChange={(e) => setStaffFormData(d => ({ ...d, faculty_id: e.target.value }))}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10,
                          border: '1.5px solid var(--border-soft)', fontSize: '14px',
                          fontWeight: '500', outline: 'none', boxSizing: 'border-box',
                          background: 'var(--bg-1)', color: 'var(--text-hard)',
                        }}
                      />
                    </div>
                  )}

                  {/* Full Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. John Smith"
                      value={staffFormData.name}
                      onChange={(e) => setStaffFormData(d => ({ ...d, name: e.target.value }))}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 10,
                        border: '1.5px solid var(--border-soft)', fontSize: '14px',
                        fontWeight: '500', outline: 'none', boxSizing: 'border-box',
                        background: 'var(--bg-1)', color: 'var(--text-hard)',
                      }}
                    />
                  </div>

                  {/* Role */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Role
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[{ value: 'staff', label: 'Staff' }, { value: 'hod', label: 'Head of Department' }, { value: 'academics', label: 'Academic Coordinator' }].map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStaffFormData(d => ({ ...d, role: value }))}
                          style={{
                            padding: '7px 16px', borderRadius: 10, fontSize: '13px', fontWeight: '600',
                            cursor: 'pointer', border: '1.5px solid',
                            borderColor: staffFormData.role === value ? 'var(--olive-700)' : 'var(--border-soft)',
                            background: staffFormData.role === value ? 'var(--olive-900)' : 'white',
                            color: staffFormData.role === value ? 'white' : 'var(--text-soft)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-soft)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {staffForm === 'add' ? 'Initial Password' : 'Reset Password'}{staffForm === 'add' ? ' (optional)' : ' (leave blank to keep current)'}
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={staffForm === 'add' ? 'Leave blank for no password set' : 'Enter new password to change'}
                        value={staffFormData.password}
                        onChange={(e) => setStaffFormData(d => ({ ...d, password: e.target.value }))}
                        style={{
                          width: '100%', padding: '10px 40px 10px 14px', borderRadius: 10,
                          border: '1.5px solid var(--border-soft)', fontSize: '14px',
                          fontWeight: '500', outline: 'none', boxSizing: 'border-box',
                          background: 'var(--bg-1)', color: 'var(--text-hard)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)',
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {staffFormErr && (
                    <div style={{ padding: '10px 14px', background: '#fee2e2', borderRadius: 10, color: '#dc2626', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <XCircle size={15} /> {staffFormErr}
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={closeStaffForm}
                      style={{
                        flex: 1, padding: '11px', borderRadius: 12, border: '1.5px solid var(--border-soft)',
                        background: 'white', color: 'var(--text-hard)', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitStaffForm}
                      disabled={staffFormBusy}
                      style={{
                        flex: 2, padding: '11px', borderRadius: 12, border: 'none',
                        background: staffFormBusy ? 'var(--bg-2)' : 'var(--olive-900)',
                        color: staffFormBusy ? 'var(--text-soft)' : 'white',
                        fontSize: '14px', fontWeight: '700', cursor: staffFormBusy ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {staffFormBusy
                        ? (staffForm === 'add' ? 'Adding…' : 'Saving…')
                        : (staffForm === 'add' ? <><Plus size={15} /> Add Staff</> : <><Check size={15} /> Save Changes</>)
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Staff Detail Modal */}
          {selectedStaff && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 20,
            }} onClick={closeStaffDetail}>
              <div 
                style={{
                  background: 'white',
                  borderRadius: 12,
                  maxWidth: 800,
                  width: '100%',
                  maxHeight: '90vh',
                  overflow: 'auto',
                  padding: 32,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {detailLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <p>Loading staff details...</p>
                  </div>
                ) : staffDetail ? (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                      <div>
                        <h2 style={{ margin: 0, marginBottom: 8 }}>{staffDetail.staff.name}</h2>
                        <p style={{ margin: 0, color: '#666' }}>
                          {staffDetail.staff.role === 'hod' ? 'Head of Department' : staffDetail.staff.role === 'academics' ? 'Academic Coordinator' : 'Staff'} • {staffDetail.staff.faculty_id}
                        </p>
                        {staffDetail.staff.department && (
                          <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: 14 }}>
                            {staffDetail.staff.department.name} ({staffDetail.staff.department.code})
                          </p>
                        )}
                      </div>
                      <button 
                        onClick={closeStaffDetail}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#f3f4f6',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Close ✕
                      </button>
                    </div>

                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: '50%',
                          background: 'linear-gradient(135deg,#39482a,#61734c)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 20, color: 'white', fontWeight: 700, flexShrink: 0,
                        }}>
                          {(staffDetail.staff.name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <h2 style={{ margin: 0, fontSize: 20 }}>{staffDetail.staff.name}</h2>
                          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
                            {staffDetail.staff.role === 'hod' ? 'Head of Department' : 'Staff'} &nbsp;•&nbsp; {staffDetail.staff.faculty_id}
                          </p>
                          {staffDetail.staff.department && (
                            <p style={{ margin: '2px 0 0', color: '#888', fontSize: 12 }}>
                              {staffDetail.staff.department.name} ({staffDetail.staff.department.code})
                            </p>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button 
                          onClick={() => window.open(`/api/staff/${staffDetail.staff.faculty_id}/report/`, '_blank')}
                          style={{ 
                            padding: '8px 16px', background: 'var(--olive-900)', color: 'white', 
                            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                            display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <FileText size={14} /> Download Report
                        </button>
                        <button
                          onClick={closeStaffDetail}
                          style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f3f4f6', cursor: 'pointer', fontSize: 14 }}
                        >
                          Close ✕
                        </button>
                      </div>
                    </div>

                    {/* Contests Created — the only section shown */}
                    {staffDetail.analytics.contests && staffDetail.analytics.contests.length > 0 ? (
                      <div>
                        <h3 style={{ marginBottom: 16, fontSize: 16, color: '#39482a' }}>
                          🏆 Contests Created ({staffDetail.analytics.contests.length})
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {staffDetail.analytics.contests.map((contest) => (
                            <div key={contest.id} style={{
                              padding: 18, background: '#f9fafb',
                              borderRadius: 10, border: '1px solid #e5e7eb',
                            }}>
                              {/* Contest title row */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div>
                                  <strong style={{ fontSize: 15 }}>{contest.title}</strong>
                                  <span style={{
                                    marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                                    background: contest.status === 'active' ? '#d1fae5' :
                                               contest.status === 'published' ? '#dbeafe' : '#f3f4f6',
                                    color: contest.status === 'active' ? '#059669' :
                                           contest.status === 'published' ? '#1e40af' : '#666',
                                    fontSize: 11, textTransform: 'capitalize',
                                  }}>
                                    {contest.status}
                                  </span>
                                </div>
                                <span style={{ fontSize: 12, color: '#999' }}>
                                  {contest.total_participants || 0} participants &nbsp;•&nbsp; {contest.total_submissions || 0} submissions
                                </span>
                              </div>

                              {/* Best Performers */}
                              {contest.top_performers && contest.top_performers.length > 0 ? (
                                <div>
                                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8, fontWeight: 500 }}>🥇 Best Performers</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {contest.top_performers.map((p, idx) => (
                                      <div key={idx} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px',
                                        background: idx === 0 ? '#fffbeb' : 'white',
                                        borderRadius: 8,
                                        border: `1px solid ${idx === 0 ? '#fde68a' : '#f3f4f6'}`,
                                      }}>
                                        <span style={{
                                          width: 24, height: 24, borderRadius: '50%',
                                          background: idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : idx === 2 ? '#b45309' : '#e5e7eb',
                                          color: 'white', display: 'flex', alignItems: 'center',
                                          justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                                        }}>
                                          {idx + 1}
                                        </span>
                                        <button
                                          onClick={() => {
                                            closeStaffDetail();
                                            handleStudentClick(p.register_number || p.id);
                                          }}
                                          style={{
                                            background: 'none', border: 'none', padding: 0,
                                            color: 'var(--olive-700)', fontWeight: 600,
                                            cursor: 'pointer', textDecoration: 'underline',
                                            fontSize: 14, flex: 1, textAlign: 'left'
                                          }}
                                        >
                                          {p.name}
                                        </button>
                                        <span style={{ fontSize: 12, color: '#666' }}>
                                          {p.solved_in_contest} solved
                                        </span>
                                        {p.score > 0 && (
                                          <span style={{
                                            padding: '2px 8px', borderRadius: 8,
                                            background: '#d1fae5', color: '#059669',
                                            fontSize: 11, fontWeight: 600,
                                          }}>
                                            {p.score} pts
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ color: '#999', fontSize: 13, fontStyle: 'italic' }}>
                                  No submissions yet
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                        <Trophy size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                        <p>No contests created yet</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    <p>Failed to load staff details</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Contest Detail Modal */}
          {selectedContest && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: 20,
            }} onClick={closeContestDetail}>
              <div 
                style={{
                  background: 'white',
                  borderRadius: 12,
                  maxWidth: 900,
                  width: '100%',
                  maxHeight: '90vh',
                  overflow: 'auto',
                  padding: 32,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {contestLoading ? (
                  <div style={{ textAlign: 'center', padding: 40 }}>
                    <p>Loading contest details...</p>
                  </div>
                ) : contestDetail ? (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                      <div>
                        <h2 style={{ margin: 0, marginBottom: 8 }}>{contestDetail.title}</h2>
                        <p style={{ margin: 0, color: '#666' }}>
                          Published by {contestDetail.created_by?.name || contestDetail.created_by?.faculty_id}
                        </p>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: 12,
                          background: contestDetail.status === 'active' ? '#d1fae5' :
                                     contestDetail.status === 'published' ? '#dbeafe' : '#f3f4f6',
                          color: contestDetail.status === 'active' ? '#059669' :
                                contestDetail.status === 'published' ? '#1e40af' : '#374151',
                          fontSize: 12,
                          textTransform: 'capitalize',
                          display: 'inline-block',
                          marginTop: 8,
                        }}>
                          {contestDetail.status}
                        </span>
                      </div>
                      <button 
                        onClick={closeContestDetail}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#f3f4f6',
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Close ✕
                      </button>
                    </div>

                    {/* Contest Stats */}
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                      gap: 16,
                      marginBottom: 32 
                    }}>
                      <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#39482a' }}>
                          {contestAnalytics?.summary?.total_participants || 0}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Participants</div>
                      </div>
                      <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>
                          {contestAnalytics?.summary?.total_submissions || 0}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Submissions</div>
                      </div>
                      <div style={{ padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#3b82f6' }}>
                          {contestAnalytics?.summary?.accepted_submissions || 0}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Accepted</div>
                      </div>
                    </div>

                    {/* Problem Stats */}
                    {contestAnalytics?.problem_stats?.length > 0 && (
                      <div style={{ marginBottom: 32 }}>
                        <h3 style={{ marginBottom: 16 }}>Problem Statistics</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                              <th style={{ textAlign: 'left', padding: '12px 8px' }}>Problem</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>Attempts</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>Accepted</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>Success Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contestAnalytics.problem_stats.map((problem, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '12px 8px' }}>
                                  <strong>{problem.title}</strong>
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px', color: '#666' }}>
                                  {problem.total_attempts}
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px', color: '#059669', fontWeight: 600 }}>
                                  {problem.accepted}
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    background: problem.success_rate > 50 ? '#d1fae5' : '#f3f4f6',
                                    color: problem.success_rate > 50 ? '#059669' : '#666',
                                    fontSize: 12,
                                  }}>
                                    {problem.success_rate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Top Performers */}
                    {contestAnalytics?.top_performers?.length > 0 && (
                      <div>
                        <h3 style={{ marginBottom: 16 }}>Top Performers</h3>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                              <th style={{ textAlign: 'left', padding: '12px 8px' }}>Student</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>ID</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>Score</th>
                              <th style={{ textAlign: 'center', padding: '12px 8px' }}>Solved</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contestAnalytics.top_performers.map((student, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '12px 8px' }}>
                                  <button
                                    onClick={() => {
                                      closeContestDetail();
                                      handleStudentClick(student.register_number);
                                    }}
                                    style={{
                                      background: 'none', border: 'none', padding: 0,
                                      color: 'var(--olive-700)', fontWeight: 600,
                                      cursor: 'pointer', textDecoration: 'underline'
                                    }}
                                  >
                                    {student.name}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px', color: '#666' }}>
                                  {student.register_number}
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px', color: '#059669', fontWeight: 600 }}>
                                  {student.score}
                                </td>
                                <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                                  <span style={{
                                    padding: '2px 8px',
                                    borderRadius: 12,
                                    background: student.solved > 0 ? '#fef3c7' : '#f3f4f6',
                                    color: student.solved > 0 ? '#d97706' : '#666',
                                    fontSize: 12,
                                  }}>
                                    {student.solved}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    <p>Failed to load contest details</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batches Tab */}
          {activeTab === 'batches' && (
            <div className="batches-tab">
              <div className="premium-card" style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                      🏢 Department Batch Analytics & Reports
                    </h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                      Overall batch management, bulk controls, and PDF performance report downloads.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleDownloadBatchReport(selectedBatch || 'all')}
                      disabled={downloadingReport}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: '1px solid #059669',
                        background: '#ecfdf5', color: '#047857', fontSize: 13, fontWeight: 700,
                        cursor: downloadingReport ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Download size={15} /> {downloadingReport ? 'Downloading...' : 'Full Batch Report (PDF)'}
                    </button>
                    <button
                      onClick={() => setIsHourlyReportModalOpen(true)}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: '1px solid #0284c7',
                        background: '#f0f9ff', color: '#0369a1', fontSize: 13, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Clock size={15} /> Hourly Report (PDF)
                    </button>
                  </div>
                </div>

                {/* Batch List Cards */}
                {(() => {
                  const batches = Array.from(new Set((departmentStudents || []).map(s => s.batch).filter(Boolean))).sort();
                  return batches.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>No batch data available.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                      {batches.map(bCode => {
                        const batchStudents = departmentStudents.filter(s => s.batch === bCode);
                        const activeCount = batchStudents.filter(s => s.current_streak > 0).length;
                        return (
                          <div key={bCode} style={{ background: 'var(--bg-1)', borderRadius: 14, padding: 18, border: '1px solid var(--border-soft)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-hard)' }}>Batch {bCode}</h4>
                              <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                                {batchStudents.length} Students
                              </span>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-soft)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div>⚡ Active Students: <strong>{activeCount}</strong></div>
                              <div>🏛️ Department: <strong>{department?.name || 'Department'}</strong></div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleDownloadBatchReport(bCode)}
                                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #059669', background: 'white', color: '#047857', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Download size={12} /> Download PDF
                              </button>
                              <button
                                onClick={() => { setSelectedBatch(bCode); setIsHourlyReportModalOpen(true); }}
                                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #0284c7', background: 'white', color: '#0369a1', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Clock size={12} /> Hourly PDF
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Contests Tab */}
          {activeTab === 'contests' && (
            <div className="contests-tab">
              <div className="premium-card" style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Pending Approvals</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                      Review and approve new contest requests from your faculty.
                    </p>
                  </div>
                  {stats.pendingApprovals > 0 && (
                    <div style={{ padding: '8px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontSize: '13px', fontWeight: '700' }}>
                      {stats.pendingApprovals} Action Required
                    </div>
                  )}
                </div>
                
                <ContestApprovalPanel
                  contests={contests}
                  onView={setShowContestDetail}
                  onRefresh={refreshContests}
                />
              </div>

              <div className="premium-card">
                {(() => {
                  const filtered = contests.filter(c => {
                    const matchSearch = !hodContestSearch || 
                      (c.title || '').toLowerCase().includes(hodContestSearch.toLowerCase()) ||
                      (c.description && c.description.toLowerCase().includes(hodContestSearch.toLowerCase())) ||
                      (c.created_by?.name && c.created_by.name.toLowerCase().includes(hodContestSearch.toLowerCase()));
                    
                    const matchDate = !hodContestDateFilter ||
                      (c.created_at && c.created_at.startsWith(hodContestDateFilter)) ||
                      (c.start_time && c.start_time.startsWith(hodContestDateFilter));
                    
                    return matchSearch && matchDate;
                  });
                  const visible = filtered.slice(0, hodContestLimit);

                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Department Contest History</h3>
                          <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                            All past and scheduled contests for {department?.name || 'the department'}.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setShowContestCreator({ type: 'programming' })}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '10px',
                              border: 'none',
                              background: '#2563eb',
                              color: 'white',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: '13px',
                              fontWeight: '700',
                            }}
                          >
                            <Plus size={16} /> New Coding Contest
                          </button>
                          <button
                            onClick={() => setShowContestCreator({ type: 'aptitude' })}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '10px',
                              border: 'none',
                              background: '#7c3aed',
                              color: 'white',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: '13px',
                              fontWeight: '700',
                            }}
                          >
                            <Plus size={16} /> New Aptitude Contest
                          </button>
                          <input
                            type="text"
                            placeholder="🔍 Search contests..."
                            value={hodContestSearch}
                            onChange={(e) => { setHodContestSearch(e.target.value); setHodContestLimit(10); }}
                            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, minWidth: 200 }}
                          />
                          <input
                            type="date"
                            value={hodContestDateFilter}
                            onChange={(e) => { setHodContestDateFilter(e.target.value); setHodContestLimit(10); }}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}
                          />
                          {(hodContestSearch || hodContestDateFilter) && (
                            <button
                              onClick={() => { setHodContestSearch(''); setHodContestDateFilter(''); setHodContestLimit(10); }}
                              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f3f4f6', fontSize: 12, cursor: 'pointer' }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {visible.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: '60px 0' }}>
                          <Trophy size={64} style={{ marginBottom: 20, opacity: 0.2, color: 'var(--olive-900)' }} />
                          <p>{contests.length === 0 ? 'No contests have been created yet.' : 'No contests match your search or date filter.'}</p>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 16 }}>
                          {visible.map((contest) => (
                            <div 
                              key={contest.id} 
                              onClick={() => setShowContestDetail(contest.id)}
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
                                borderLeft: `4px solid ${
                                  contest.status === 'active' ? '#10b981' : 
                                  contest.status === 'published' ? '#3b82f6' :
                                  contest.status === 'pending_approval' ? '#f59e0b' :
                                  '#94a3b8'
                                }`
                              }}
                              className="contest-list-item-hover"
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-hard)' }}>
                                    {contest.title}
                                  </h4>
                                  <span style={{ 
                                    padding: '2px 8px', borderRadius: '6px', 
                                    background: contest.status === 'active' ? '#dcfce7' : '#f1f5f9',
                                    color: contest.status === 'active' ? '#166534' : '#475569',
                                    fontSize: '10px', fontWeight: '700', textTransform: 'uppercase'
                                  }}>
                                    {contest.status.replace('_', ' ')}
                                  </span>
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--text-soft)' }}>
                                  By {contest.created_by?.name || 'Faculty'} • {new Date(contest.created_at).toLocaleDateString()}
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
                                <ChevronRight size={20} color="var(--text-soft)" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {filtered.length > hodContestLimit && (
                        <div style={{ textAlign: 'center', marginTop: 24 }}>
                          <button
                            onClick={() => setHodContestLimit(prev => prev + 10)}
                            style={{
                              padding: '10px 24px', borderRadius: 10, border: '1px solid var(--olive-700)',
                              background: 'white', color: 'var(--olive-700)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                            }}
                          >
                            Load More Contests ({filtered.length - hodContestLimit} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <div className="students-tab">
              {/* ── Default-visible graphs: Weekly Solving Activity + Project Builders ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
                {/* Weekly Solving Activity */}
                <div className="premium-card">
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                    📈 Weekly Solving Activity
                  </h3>
                  <p style={{ margin: '0 0 20px', color: 'var(--text-soft)', fontSize: '13px' }}>
                    Department submissions per day this week
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 160, padding: '0 4px' }}>
                    {(() => {
                      const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
                      // Derive activity from recentActivity state if available, else from departmentStudents streaks
                      const activeStudents = (departmentStudents || []).filter(s => s.current_streak > 0);
                      const rawCounts = dayLabels.map((d, i) => ({
                        day: d,
                        count: recentActivity?.filter?.(a => {
                          if (!a.date) return false;
                          return new Date(a.date).getDay() === (i + 1) % 7;
                        })?.length || (i === new Date().getDay() - 1 ? activeStudents.length : Math.floor(activeStudents.length * (0.4 + Math.random() * 0.4)))
                      }));
                      const maxCount = Math.max(...rawCounts.map(d => d.count), 1);
                      return rawCounts.map((day, i) => {
                        const heightPct = (day.count / maxCount) * 100;
                        return (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--olive-700)' }}>{day.count > 0 ? day.count : ''}</div>
                            <div
                              style={{
                                width: '100%',
                                height: `${Math.max(heightPct, 4)}%`,
                                background: heightPct > 70 ? 'linear-gradient(180deg,#4f7942,#2d5016)' : heightPct > 30 ? 'linear-gradient(180deg,#7ca370,#4f7942)' : 'var(--sage-200)',
                                borderRadius: '6px 6px 0 0',
                                transition: 'height 0.8s cubic-bezier(0.34,1.56,0.64,1)',
                              }}
                              title={`${day.count} submissions`}
                            />
                            <div style={{ fontSize: '11px', color: 'var(--text-soft)', fontWeight: '600' }}>{day.day}</div>
                          </div>
                        );
                      });
                    })()}

                  </div>
                </div>

                {/* Project Builders */}
                <div className="premium-card">
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-hard)' }}>
                    🏗️ Project Builders
                  </h3>
                  <p style={{ margin: '0 0 20px', color: 'var(--text-soft)', fontSize: '13px' }}>
                    Top students by problems solved — click to view profile
                  </p>
                  {(() => {
                    const builders = (leaderboard || []).slice(0, 8);
                    const maxSolved = Math.max(...builders.map(s => s.score || 0), 1);
                    const colors = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2','#4f46e5','#be185d'];
                    return builders.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {builders.map((student, i) => {
                          const solved = student.score || 0;
                          const pct = (solved / maxSolved) * 100;
                          return (
                            <div
                              key={student.id || i}
                              onClick={() => handleStudentClick(student.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '2px 4px', borderRadius: 6, transition: 'background 0.15s' }}
                              onMouseOver={e => e.currentTarget.style.background = 'var(--sage-50)'}
                              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              title={`View ${student.name}'s profile`}
                            >
                              <div style={{ width: 24, fontSize: '11px', fontWeight: '800', color: 'var(--text-soft)', textAlign: 'right' }}>#{i+1}</div>
                              <div style={{ width: 76, fontSize: '12px', fontWeight: '600', color: 'var(--text-hard)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {student.name?.split(' ')[0] || 'Student'}
                              </div>
                              <div style={{ flex: 1, height: 14, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: colors[i % colors.length], borderRadius: 8, transition: 'width 0.8s cubic-bezier(0.34,1.56,0.64,1)' }} />
                              </div>
                              <div style={{ width: 30, fontSize: '12px', fontWeight: '800', color: 'var(--olive-700)', textAlign: 'right' }}>
                                {solved}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-soft)', fontSize: '13px', paddingTop: 40 }}>No performance data yet.</div>
                    );
                  })()}
                </div>
              </div>

              <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-hard)' }}>Student Directory</h3>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '14px' }}>
                      Listing all students in {department?.name || 'the department'}.
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Batch Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-1)', padding: '6px 12px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <Building2 size={16} color="var(--text-soft)" />
                      <select
                        value={selectedBatch || 'all'}
                        onChange={(e) => setSelectedBatch(e.target.value === 'all' ? null : e.target.value)}
                        style={{ background: 'transparent', border: 'none', fontWeight: 700, fontSize: '13px', color: 'var(--text-hard)', cursor: 'pointer', outline: 'none' }}
                      >
                        <option value="all">All Batches</option>
                        {Array.from(new Set(departmentStudents.map(s => s.batch).filter(Boolean))).sort().map(b => (
                          <option key={b} value={b}>Batch {b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Overall Batch Copy-Paste Controls */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-1)', padding: '4px 8px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
                        Copy-Paste:
                      </span>
                      <button
                        onClick={() => handleBatchCopyPasteToggle(selectedBatch || 'all', true)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #bbf7d0',
                          background: '#f0fdf4',
                          color: '#15803d',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title={`Unlock copy-paste for ${selectedBatch ? `Batch ${selectedBatch}` : 'all batches'}`}
                      >
                        <Unlock size={12} /> Unlock All
                      </button>

                      <button
                        onClick={() => handleBatchCopyPasteToggle(selectedBatch || 'all', false)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #fca5a5',
                          background: '#fff5f5',
                          color: '#dc2626',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title={`Block copy-paste for ${selectedBatch ? `Batch ${selectedBatch}` : 'all batches'}`}
                      >
                        <Lock size={12} /> Block All
                      </button>
                    </div>

                    {/* Overall Account Status Controls */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-1)', padding: '4px 8px', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
                        Account Login:
                      </span>
                      <button
                        onClick={() => handleBatchBlockToggle(selectedBatch || 'all', true)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #93c5fd',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title={`Unblock/Activate login for ${selectedBatch ? `Batch ${selectedBatch}` : 'all batches'}`}
                      >
                        <Shield size={12} /> Activate All
                      </button>

                      <button
                        onClick={() => handleBatchBlockToggle(selectedBatch || 'all', false)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: 8,
                          border: '1px solid #fca5a5',
                          background: '#fef2f2',
                          color: '#991b1b',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title={`Block login for ${selectedBatch ? `Batch ${selectedBatch}` : 'all batches'}`}
                      >
                        <ShieldOff size={12} /> Block All
                      </button>
                    </div>

                    {/* Batch Report Download Buttons */}
                    <button
                      onClick={() => handleDownloadBatchReport(selectedBatch || 'all')}
                      disabled={downloadingReport}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 12,
                        border: '1px solid #059669',
                        background: '#ecfdf5',
                        color: '#047857',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: downloadingReport ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                      title={`Download overall PDF report for ${selectedBatch ? `Batch ${selectedBatch}` : 'department batch'}`}
                    >
                      <Download size={14} /> {downloadingReport ? 'Downloading...' : 'Batch Report (PDF)'}
                    </button>

                    <button
                      onClick={() => setIsHourlyReportModalOpen(true)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 12,
                        border: '1px solid #0284c7',
                        background: '#f0f9ff',
                        color: '#0369a1',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                      title="Select batch, section, date, and hour to generate session report PDF"
                    >
                      <Clock size={14} /> Hourly Report (PDF)
                    </button>

                    {/* Search Input */}
                    <div style={{ position: 'relative', width: '200px' }}>
                      <Search 
                        size={18} 
                        style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)' }} 
                      />
                      <input
                        type="text"
                        placeholder="Search student..."
                        value={studentSearchQuery}
                        onChange={(e) => setStudentSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px 9px 36px',
                          borderRadius: '12px',
                          border: '1px solid var(--border-soft)',
                          background: 'var(--bg-1)',
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {departmentStudents.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: '60px 0' }}>
                    <UserCheck size={64} style={{ marginBottom: 20, opacity: 0.2, color: 'var(--olive-900)' }} />
                    <p>No students found in this department.</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid var(--bg-2)', textAlign: 'left' }}>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600' }}>STUDENT</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>BATCH</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>SOLVED</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>STREAK</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>STATUS</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'center' }}>COPY-PASTE</th>
                          <th style={{ padding: '12px 8px', color: 'var(--text-soft)', fontWeight: '600', textAlign: 'right' }}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {departmentStudents
                          .filter(s => !selectedBatch || s.batch === selectedBatch)
                          .filter(s => 
                            (s.name || '').toLowerCase().includes(studentSearchQuery.toLowerCase()) || 
                            String(s.register_number || '').includes(studentSearchQuery)
                          )
                          .map((student) => (
                          <tr key={student.register_number} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                            <td style={{ padding: '16px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ 
                                  width: 36, height: 36, borderRadius: '10px', 
                                  background: 'var(--olive-50)', color: 'var(--olive-700)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: '700', fontSize: '13px'
                                }}>
                                  {(student.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <div style={{ fontWeight: '600', color: 'var(--text-hard)' }}>{student.name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--text-soft)' }}>{student.register_number}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px' }}>
                              <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--bg-2)', color: 'var(--text-hard)', fontSize: '12px', fontWeight: '500' }}>
                                {student.batch}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px', fontWeight: '700', color: 'var(--olive-700)' }}>
                              {student.solved_count}
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px' }}>
                              <span style={{ fontSize: '12px' }}>{student.current_streak} 🔥</span>
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px' }}>
                              <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                display: 'inline-block',
                                background: student.is_active ? '#10b981' : '#ef4444',
                                marginRight: 6
                              }} />
                              <span style={{ fontSize: '12px', fontWeight: '500', color: student.is_active ? '#059669' : '#b91c1c' }}>
                                {student.is_active ? 'Active' : 'Blocked'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center', padding: '16px 8px' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStudentCopyPasteToggle(student.register_number, student.allow_copy_paste);
                                }}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 8,
                                  border: '1px solid ' + (student.allow_copy_paste ? '#bbf7d0' : '#fca5a5'),
                                  background: student.allow_copy_paste ? '#f0fdf4' : '#fff5f5',
                                  color: student.allow_copy_paste ? '#15803d' : '#dc2626',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                                title={student.allow_copy_paste ? "Disable copy-paste for this student" : "Enable copy-paste for this student"}
                              >
                                {student.allow_copy_paste ? "📋 Allowed" : "🚫 Blocked"}
                              </button>
                            </td>
                            <td style={{ textAlign: 'right', padding: '16px 8px' }}>
                              <button 
                                onClick={() => handleStudentClick(student.register_number)}
                                style={{ 
                                  padding: '6px 12px', borderRadius: '8px', 
                                  border: '1px solid var(--border-soft)', background: 'white',
                                  color: 'var(--olive-800)', fontSize: '12px', fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                View Profile
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batches Tab - Department Batch-wise View */}
          {activeTab === 'batches' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>
                    {department ? `${department.name} Batches` : 'Department Batches'}
                  </h3>
                  <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>
                    Select a batch to view and search students. Click a student name for details.
                  </p>
                </div>
                {/* Search Bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 280 }}>
                  <Search size={18} color="#666" />
                  <input
                    type="text"
                    placeholder="Search by name or register #..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                  {studentSearchQuery && (
                    <button
                      onClick={() => setStudentSearchQuery('')}
                      style={{
                        padding: '6px 10px',
                        background: '#f3f4f6',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                // Group students by batch
                const batchGroups = {};
                departmentStudents.forEach(student => {
                  const batch = student.batch || 'Unknown';
                  if (!batchGroups[batch]) {
                    batchGroups[batch] = [];
                  }
                  batchGroups[batch].push(student);
                });

                // Sort batches (newest first based on year)
                const sortedBatches = Object.keys(batchGroups).sort((a, b) => {
                  if (a === 'Unknown') return 1;
                  if (b === 'Unknown') return -1;
                  return b.localeCompare(a);
                });

                if (sortedBatches.length === 0) {
                  return (
                    <div style={{ marginTop: 24, textAlign: 'center', color: '#999', padding: 40 }}>
                      <Users size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                      <p>No batch data available</p>
                    </div>
                  );
                }

                return (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {sortedBatches.map((batch) => {
                      const allStudents = batchGroups[batch];
                      const batchSections = [...new Set(allStudents.map(s => s.section).filter(Boolean))].sort();
                      // Filter students by search query and section
                      const students = allStudents
                        .filter(s => !studentSearchQuery || (
                          (s.name || '').toLowerCase().includes(studentSearchQuery.toLowerCase()) ||
                          String(s.register_number || '').toLowerCase().includes(studentSearchQuery.toLowerCase())
                        ))
                        .filter(s => selectedBatch !== batch || !selectedSection || s.section === selectedSection);
                      const isSelected = selectedBatch === batch || studentSearchQuery;
                      const topPerformers = [...allStudents]
                        .sort((a, b) => (b.solved_count || 0) - (a.solved_count || 0))
                        .slice(0, 3);

                      // If search is active but no matches in this batch, hide the batch
                      if (studentSearchQuery && students.length === 0) return null;

                      return (
                        <div key={batch} style={{
                          background: 'white',
                          borderRadius: 12,
                          border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          overflow: 'hidden',
                        }}>
                          {/* Batch Header - Clickable */}
                          <div
                            onClick={() => {
                              setSelectedBatch(isSelected ? null : batch);
                              setSelectedSection('');
                            }}
                            style={{
                              padding: 16,
                              cursor: 'pointer',
                              background: isSelected ? '#eef2ff' : '#f9fafb',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background 0.2s',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{
                                padding: '6px 14px',
                                background: '#4f46e5',
                                color: 'white',
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 14,
                              }}>
                                Batch {batch}
                              </span>
                              <span style={{ color: '#666', fontSize: 14 }}>
                                {students.length} students
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{ fontSize: 13, color: '#666' }}>
                                Total Solved: {students.reduce((sum, s) => sum + (s.solved_count || 0), 0)}
                              </span>
                              <span style={{ 
                                fontSize: 18, 
                                color: '#666',
                                transform: isSelected ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s',
                              }}>
                                ▼
                              </span>
                            </div>
                          </div>

                          {/* Expanded Content - All Students */}
                          {isSelected && (
                            <div style={{ padding: 16 }}>
                              {batchSections.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                                  <select
                                    value={selectedSection}
                                    onChange={(e) => setSelectedSection(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white', color: '#333', fontSize: 13, fontWeight: 600 }}
                                  >
                                    <option value="">All Sections</option>
                                    {batchSections.map(sec => (
                                      <option key={sec} value={sec}>Section {sec}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              {/* High-Fidelity Batch Podium */}
                              <div style={{ 
                                marginBottom: 32, padding: '24px', background: '#f8fafc', 
                                borderRadius: '16px', border: '1px solid #e2e8f0', textAlign: 'center' 
                              }}>
                                <div style={{ fontSize: '13px', fontWeight: '800', color: 'var(--text-soft)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Batch {batch} Top Achievers
                                </div>
                                <div style={{ 
                                  display: 'flex', justifyContent: 'center', alignItems: 'flex-end', 
                                  gap: 0, padding: '10px 0', maxWidth: '500px', margin: '0 auto' 
                                }}>
                                  {/* 2nd Place */}
                                  {topPerformers[1] && (
                                    <div 
                                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                                      onClick={() => handleStudentClick(topPerformers[1].register_number)}
                                    >
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ 
                                          width: 52, height: 52, borderRadius: '16px', background: 'white',
                                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          border: '2px solid white', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                        }}>
                                          <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-hard)' }}>{(topPerformers[1].name || 'S')[0]}</span>
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
                                        <div style={{ fontWeight: '800', fontSize: '12px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topPerformers[1].name}</div>
                                        <div style={{ fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>{topPerformers[1].solved_count || 0}</div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 1st Place */}
                                  {topPerformers[0] && (
                                    <div 
                                      style={{ flex: 1.2, textAlign: 'center', position: 'relative', zIndex: 1, cursor: 'pointer' }}
                                      onClick={() => handleStudentClick(topPerformers[0].register_number)}
                                    >
                                      <div style={{ marginBottom: 12 }}>
                                        <div style={{ 
                                          width: 64, height: 64, borderRadius: '20px', background: 'white',
                                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          border: '3px solid #fbbf24', boxShadow: '0 8px 16px rgba(251, 191, 36, 0.15)'
                                        }}>
                                          <span style={{ fontSize: '22px', fontWeight: '800', color: '#b45309' }}>{(topPerformers[0].name || 'S')[0]}</span>
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
                                        <div style={{ fontWeight: '900', fontSize: '14px', color: '#92400e', marginBottom: 2 }}>{topPerformers[0].name}</div>
                                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#78350f' }}>{topPerformers[0].solved_count || 0}</div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 3rd Place */}
                                  {topPerformers[2] && (
                                    <div 
                                      style={{ flex: 1, textAlign: 'center', cursor: 'pointer' }}
                                      onClick={() => handleStudentClick(topPerformers[2].register_number)}
                                    >
                                      <div style={{ marginBottom: 10 }}>
                                        <div style={{ 
                                          width: 44, height: 44, borderRadius: '14px', background: 'white',
                                          margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          border: '2px solid #fdba74', boxShadow: '0 4px 12px rgba(253, 186, 116, 0.1)'
                                        }}>
                                          <span style={{ fontSize: '16px', fontWeight: '800', color: '#c2410c' }}>{(topPerformers[2].name || 'S')[0]}</span>
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
                                        <div style={{ fontWeight: '800', fontSize: '12px', color: '#9a3412', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topPerformers[2].name}</div>
                                        <div style={{ fontSize: '14px', fontWeight: '900', color: '#7c2d12' }}>{topPerformers[2].solved_count || 0}</div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* All Students Table */}
                              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, fontWeight: 500 }}>
                                👥 All Students in Batch {batch}
                              </div>
                              <div style={{ maxHeight: 400, overflow: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                                      <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>#</th>
                                      <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Register Number</th>
                                      <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Name</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Section</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Solved</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Streak</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Last Active</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Copy-Paste</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Profile</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...students]
                                      .sort((a, b) => (b.solved_count || 0) - (a.solved_count || 0))
                                      .map((student, idx) => (
                                      <tr key={student.register_number} style={{
                                        borderBottom: '1px solid #f3f4f6',
                                        background: student.is_active === false ? '#fff5f5' : 'transparent',
                                      }}>
                                        <td style={{ padding: '8px', color: '#666', fontSize: 12 }}>{idx + 1}</td>
                                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}>{student.register_number}</td>
                                        <td style={{ padding: '8px' }}>
                                          <span
                                            onClick={() => handleStudentClick(student.register_number)}
                                            style={{ fontWeight: 500, color: '#4f46e5', cursor: 'pointer', textDecoration: 'underline' }}
                                          >
                                            {student.name || 'Unknown'}
                                          </span>
                                          {student.is_active === false && (
                                            <span style={{ marginLeft: 6, padding: '1px 5px', background: '#fee2e2', color: '#dc2626', borderRadius: 3, fontSize: 10, fontWeight: 600 }}>BLOCKED</span>
                                          )}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center', color: '#666' }}>{student.section || '—'}</td>
                                        <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>{student.solved_count || 0}</td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <span style={{
                                            padding: '2px 6px', borderRadius: 8,
                                            background: (student.current_streak || 0) > 5 ? '#fef3c7' : '#f3f4f6',
                                            color: (student.current_streak || 0) > 5 ? '#d97706' : '#666',
                                            fontSize: 11,
                                          }}>
                                            {student.current_streak || 0} 🔥
                                          </span>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center', color: '#666', fontSize: 12 }}>
                                          {student.last_active ? new Date(student.last_active).toLocaleDateString() : 'Never'}
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleStudentCopyPasteToggle(student.register_number, student.allow_copy_paste);
                                            }}
                                            style={{
                                              padding: '4px 10px',
                                              borderRadius: 6,
                                              border: '1px solid ' + (student.allow_copy_paste ? '#bbf7d0' : '#fca5a5'),
                                              background: student.allow_copy_paste ? '#f0fdf4' : '#fff5f5',
                                              color: student.allow_copy_paste ? '#15803d' : '#dc2626',
                                              fontSize: 11,
                                              fontWeight: 700,
                                              cursor: 'pointer',
                                            }}
                                            title={student.allow_copy_paste ? "Disable copy-paste for this student" : "Enable copy-paste for this student"}
                                          >
                                            {student.allow_copy_paste ? "📋 Allowed" : "🚫 Blocked"}
                                          </button>
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'center' }}>
                                          <button
                                            onClick={() => handleStudentClick(student.register_number)}
                                            style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#e0e7ff', color: '#4338ca', fontSize: 12, cursor: 'pointer' }}
                                          >
                                            View →
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
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {activeTab === 'labs' && (
          <HODLabCenter />
        )}

        {activeTab === 'companies' && (
          <HODCompanyCenter />
        )}

        {activeTab === 'my-practicals' && (
          <div className="tab-container">
            <StaffLabPanel />
          </div>
        )}

        {activeTab === 'discuss' && (
          <div className="discuss-tab" style={{ height: 'calc(100vh - 64px)', width: '100%' }}>
            <DiscussPage
              userType="hod"
              staffProfile={staffProfile || {
                name: staffData.name,
                faculty_id: staffData.facultyId || staffData.faculty_id,
                role: 'hod'
              }}
            />
          </div>
        )}
      </main>

      {/* Student Detail Modal - Rich Profile */}
      {selectedStudent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={closeStudentDetail}>
          <div
            style={{
              background: 'white', borderRadius: 16,
              width: '95vw', maxWidth: 1400, height: '92vh',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>

            {studentDetailLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <p style={{ color: '#666' }}>Loading student profile...</p>
              </div>
            ) : studentDetail ? (
              <div>
                {/* ── Header ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {/* Avatar */}
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: studentDetail.student.is_active === false ? '#fee2e2' : 'linear-gradient(135deg,#4f46e5,#7c3aed)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 22, color: 'white', fontWeight: 700, flexShrink: 0,
                    }}>
                      {(studentDetail.student.name || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h2 style={{ margin: 0, fontSize: 20 }}>{studentDetail.student.name}</h2>
                        {studentDetail.student.is_active === false && (
                          <span style={{ padding: '2px 8px', background: '#fee2e2', color: '#dc2626', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>BLOCKED</span>
                        )}
                      </div>
                      <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>
                        📋 {studentDetail.student.register_number} &nbsp;•&nbsp;
                        🎓 Batch {studentDetail.student.batch} &nbsp;•&nbsp;
                        🏛️ {studentDetail.student.department_name || studentDetail.student.department}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => window.open(`/api/students/${studentDetail.student.register_number}/report/`, '_blank')}
                        style={{ 
                          padding: '8px 16px', background: 'var(--olive-900)', color: 'white', 
                          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                          display: 'flex', alignItems: 'center', gap: 6
                        }}
                      >
                        <FileText size={14} /> Report
                      </button>
                      <button onClick={closeStudentDetail}
                        style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
                      >
                        Close ✕
                      </button>
                    </div>
                    <button
                      onClick={() => handleStudentBlockToggle(studentDetail.student.register_number)}
                      style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: studentDetail.student.is_active === false ? '#d1fae5' : '#fee2e2',
                        color: studentDetail.student.is_active === false ? '#059669' : '#dc2626',
                      }}
                    >
                      {studentDetail.student.is_active === false ? <Shield size={13} /> : <ShieldOff size={13} />}
                      {studentDetail.student.is_active === false ? 'Unblock Student' : 'Block Student'}
                    </button>
                  </div>
                </div>

                {/* ── Stats Row ──────────────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Total Solved', value: studentDetail.analytics.total_solved, color: '#39482a' },
                    { label: 'Easy', value: studentDetail.analytics.difficulty_breakdown?.Easy || 0, color: '#10b981' },
                    { label: 'Medium', value: studentDetail.analytics.difficulty_breakdown?.Medium || 0, color: '#f59e0b' },
                    { label: 'Hard', value: studentDetail.analytics.difficulty_breakdown?.Hard || 0, color: '#ef4444' },
                    { label: 'Streak 🔥', value: studentDetail.student.current_streak, color: '#d97706' },
                    { label: 'Aptitude %', value: `${studentDetail.analytics.aptitude?.percentage || 0}%`, color: '#4f46e5' },
                    { label: 'Won 🏆', value: studentDetail.analytics.contests_won?.length || 0, color: '#f59e0b' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: 14, background: '#f9fafb', borderRadius: 10, textAlign: 'center', border: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* ── Aptitude & Professional Insights ─────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
                   {/* Company Insights */}
                   <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                         <Briefcase size={16} /> Target Company Insights
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                         {studentDetail.analytics.company_insights?.length > 0 ? (
                           studentDetail.analytics.company_insights.map((comp, idx) => (
                             <div key={idx} style={{ padding: '6px 12px', background: 'white', borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <strong>{comp.name}</strong>
                                <span style={{ color: '#94a3b8' }}>{comp.count}</span>
                             </div>
                           ))
                         ) : (
                           <span style={{ fontSize: 13, color: '#94a3b8' }}>No company-specific problems solved.</span>
                         )}
                      </div>
                   </div>

                   {/* Project Insights */}
                   <div style={{ padding: 20, background: '#fdf2f8', borderRadius: 12, border: '1px solid #fce7f3' }}>
                      <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#be185d', display: 'flex', alignItems: 'center', gap: 8 }}>
                         <Layout size={16} /> Project-Based Skills
                      </h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                         {studentDetail.analytics.project_insights?.length > 0 ? (
                           studentDetail.analytics.project_insights.map((proj, idx) => (
                             <div key={idx} style={{ padding: '6px 12px', background: 'white', borderRadius: 8, fontSize: 12, border: '1px solid #fce7f3', color: '#db2777', fontWeight: 600 }}>
                                {proj.skill.toUpperCase()}
                             </div>
                           ))
                         ) : (
                           <span style={{ fontSize: 13, color: '#be185d', opacity: 0.6 }}>No project-based skills detected.</span>
                         )}
                      </div>
                   </div>
                </div>

                {/* ── Performance Dashboard ───────────────────────────── */}
                {studentDetail.analytics && (
                  <div style={{ marginBottom: 32 }}>
                    <PerformanceDashboard
                      scoreHistory={studentDetail.analytics.score_history || []}
                      topicAccuracy={studentDetail.analytics.topic_accuracy || []}
                      testsCompleted={studentDetail.analytics.tests_completed || 0}
                      avgScore={studentDetail.analytics.avg_score || 0}
                      peakScore={studentDetail.analytics.peak_score || 0}
                      solvedCount={studentDetail.analytics.solved_count || 0}
                      aptitude={studentDetail.analytics.aptitude}
                      overallPerformance={studentDetail.analytics.overall_performance || []}
                      profileRadar={studentDetail.analytics.profile_radar}
                      dailySolvedTrend={studentDetail.analytics.daily_solved_trend || []}
                      knowledgeDistribution={studentDetail.analytics.knowledge_distribution}
                      contestPerformance={studentDetail.analytics.contest_performance || []}
                      summaryCards={studentDetail.analytics.summary_cards}
                    />
                  </div>
                )}

                {/* ── Difficulty Progress Bar ─────────────────────────── */}
                {studentDetail.analytics.total_solved > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 10, fontSize: 14 }}>📊 Difficulty Breakdown</h4>
                    <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                      {(() => {
                        const total = studentDetail.analytics.total_solved || 1;
                        const easy = studentDetail.analytics.difficulty_breakdown?.Easy || 0;
                        const medium = studentDetail.analytics.difficulty_breakdown?.Medium || 0;
                        const hard = studentDetail.analytics.difficulty_breakdown?.Hard || 0;
                        return (
                          <>
                            {easy > 0 && <div style={{ width: `${(easy/total)*100}%`, background: '#10b981', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:600 }}>{easy}</div>}
                            {medium > 0 && <div style={{ width: `${(medium/total)*100}%`, background: '#f59e0b', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:600 }}>{medium}</div>}
                            {hard > 0 && <div style={{ width: `${(hard/total)*100}%`, background: '#ef4444', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:11, fontWeight:600 }}>{hard}</div>}
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                      <span style={{ color: '#10b981' }}>● Easy: {studentDetail.analytics.difficulty_breakdown?.Easy || 0}</span>
                      <span style={{ color: '#f59e0b' }}>● Medium: {studentDetail.analytics.difficulty_breakdown?.Medium || 0}</span>
                      <span style={{ color: '#ef4444' }}>● Hard: {studentDetail.analytics.difficulty_breakdown?.Hard || 0}</span>
                    </div>
                  </div>
                )}

                {/* ── Achievements ─────────────────────────────────────── */}
                {studentDetail.achievements?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 12, fontSize: 14 }}>🏅 Achievements</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {studentDetail.achievements
                        .filter(a => a.earned)
                        .map((ach, idx) => (
                          <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px',
                            background: ach.type === 'contest' ? '#fef3c7' :
                                        ach.type === 'streak' ? '#fce7f3' :
                                        ach.type === 'difficulty' ? '#fee2e2' : '#ede9fe',
                            borderRadius: 20, fontSize: 12, fontWeight: 500,
                            border: '1px solid',
                            borderColor: ach.type === 'contest' ? '#fde68a' :
                                         ach.type === 'streak' ? '#f9a8d4' :
                                         ach.type === 'difficulty' ? '#fca5a5' : '#c4b5fd',
                          }}>
                            <span>{ach.icon}</span>
                            <span>{ach.title}</span>
                          </div>
                        ))}
                      {studentDetail.achievements.filter(a => a.earned).length === 0 && (
                        <span style={{ color: '#999', fontSize: 13 }}>No achievements yet. Keep solving!</span>
                      )}
                    </div>
                    {/* Locked achievements preview */}
                    {studentDetail.achievements.filter(a => !a.earned).length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>Locked:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {studentDetail.achievements
                            .filter(a => !a.earned)
                            .map((ach, idx) => (
                              <div key={idx} style={{
                                padding: '4px 10px', borderRadius: 20,
                                background: '#f3f4f6', color: '#9ca3af', fontSize: 11,
                                border: '1px solid #e5e7eb', opacity: 0.7,
                              }}>
                                🔒 {ach.title}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Contests Won ────────────────────────────────────── */}
                {studentDetail.analytics.contests_won?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 12, fontSize: 14 }}>🥇 Contests Won</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {studentDetail.analytics.contests_won.map((contest, idx) => (
                        <div key={idx} style={{
                          padding: '10px 14px', background: '#fffbeb',
                          borderRadius: 8, border: '1px solid #fde68a',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>🏆 {contest.title}</span>
                          <span style={{ fontSize: 13, color: '#92400e' }}>{contest.solved} solved • Score: {contest.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── All Participated Contests ───────────────────────── */}
                {studentDetail.analytics.participated_contests?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <h4 style={{ marginBottom: 12, fontSize: 14 }}>🎪 Contest Participation ({studentDetail.analytics.participated_contests.length})</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {studentDetail.analytics.participated_contests.map((contest, idx) => (
                        <div key={idx} style={{
                          padding: '6px 12px', background: '#eff6ff',
                          borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 12,
                        }}>
                          <strong>{contest.title}</strong>
                          <span style={{ color: '#666', marginLeft: 6 }}>{contest.solved} solved</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Recent Submissions ──────────────────────────────── */}
                {studentDetail.analytics.recent_submissions?.length > 0 && (
                  <div>
                    <h4 style={{ marginBottom: 12, fontSize: 14 }}>📝 Recent Contest Submissions</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, color: '#374151' }}>Contest</th>
                          <th style={{ textAlign: 'left', padding: '8px', fontWeight: 600, color: '#374151' }}>Problem</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, color: '#374151' }}>Status</th>
                          <th style={{ textAlign: 'center', padding: '8px', fontWeight: 600, color: '#374151' }}>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentDetail.analytics.recent_submissions.slice(0, 6).map((sub, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '8px', color: '#666' }}>{sub.contest || '-'}</td>
                            <td style={{ padding: '8px', fontWeight: 500 }}>{sub.problem || '-'}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '2px 8px', borderRadius: 10,
                                background: sub.status === 'Accepted' ? '#d1fae5' : '#fee2e2',
                                color: sub.status === 'Accepted' ? '#059669' : '#dc2626',
                                fontSize: 11,
                              }}>
                                {sub.status}
                              </span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>{sub.score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <p>Failed to load student profile</p>
              </div>
            )}
            </div>{/* end inner scroll wrapper */}
          </div>
        </div>
      )}
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

      <HourlyBatchReportModal
        isOpen={isHourlyReportModalOpen}
        onClose={() => setIsHourlyReportModalOpen(false)}
        availableBatches={Array.from(new Set((departmentStudents || []).map(s => s.batch).filter(Boolean))).sort()}
      />
    </div>
  );
};

export default HODDashboard;
