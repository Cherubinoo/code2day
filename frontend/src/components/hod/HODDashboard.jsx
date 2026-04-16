// HOD Dashboard - Head of Department
// Features: Manage staff, view department analytics, approve requests

import { useState, useEffect } from 'react';
import { Users, Building2, BarChart3, CheckCircle, XCircle, Search, Lock, Unlock, Trophy, ShieldOff, Shield } from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';
import ContestApprovalPanel from './ContestApprovalPanel';
import ContestDetailModal from '../common/ContestDetailModal';



const HODDashboard = ({ institutionId }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({
    staffCount: 0,
    studentCount: 0,
    pendingApprovals: 0,
  });
  const [staffList, setStaffList] = useState([]);
  const [staffPerformance, setStaffPerformance] = useState([]);
  const [department, setDepartment] = useState(null);
  const [departmentStudents, setDepartmentStudents] = useState([]);
  const [contests, setContests] = useState([]);
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
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [studentDetailLoading, setStudentDetailLoading] = useState(false);
  const [showContestDetail, setShowContestDetail] = useState(null);

  useEffect(() => {
    async function loadHODData() {
      try {
        setLoading(true);
        // Fetch dashboard data
        const dashboardRes = await fetch('/api/dashboard/', { credentials: 'include' });
        if (dashboardRes.ok) {
          const dashboardData = await dashboardRes.json();
          setStats(prev => ({
            ...prev,
            studentCount: dashboardData.user?.totalStudents || 0,
          }));
        }

        // Fetch staff list for the department
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
            // Count pending approvals
            const pendingCount = (contestsData.contests || []).filter(c => c.status === 'pending_approval').length;
            setStats(prev => ({ ...prev, pendingApprovals: pendingCount }));
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
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
  }

  async function handleStudentBlockToggle(registerNumber) {
    try {
      const res = await fetch(`/api/students/${registerNumber}/block/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        const data = await res.json();
        // Update student in departmentStudents list
        setDepartmentStudents(prev =>
          prev.map(s =>
            s.register_number === registerNumber ? { ...s, is_active: data.is_active } : s
          )
        );
        // If student profile modal is open, update it too
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
  }

  async function handleStudentClick(registerNumber) {
    setSelectedStudent(registerNumber);
    setStudentDetailLoading(true);
    setStudentDetail(null);
    try {
      const res = await fetch(`/api/students/${registerNumber}/details/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStudentDetail(data);
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
    <div className="admin-dashboard">
      {showContestDetail && (
        <ContestDetailModal
          contestId={showContestDetail}
          onClose={() => setShowContestDetail(null)}
        />
      )}

      <div className="admin-container">
        <div className="admin-header">
          <h1>HOD Dashboard</h1>
          <p>Head of Department{department ? ` - ${department.name} (${department.code})` : ''}</p>
        </div>

        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: '#666' }}>
            Loading data...
          </div>
        )}

        {error && (
          <div style={{ padding: 16, background: '#fee2e2', borderRadius: 8, color: '#dc2626', marginBottom: 16 }}>
            Error: {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>{department ? `${department.name} Staff` : 'Department Staff'}</h3>
              <p className="stat-value">{stats.staffCount}</p>
            </div>
            <div className="admin-stat-icon indigo">
              <Users size={24} />
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>{department ? `${department.name} Students` : 'Students'}</h3>
              <p className="stat-value">{stats.studentCount}</p>
            </div>
            <div className="admin-stat-icon blue">
              <Building2 size={24} />
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>Pending Approvals</h3>
              <p className="stat-value">{stats.pendingApprovals}</p>
            </div>
            <div className="admin-stat-icon orange">
              <CheckCircle size={24} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, marginBottom: 16, borderBottom: '1px solid rgba(57, 72, 42, 0.1)', paddingBottom: 8 }}>
          {['overview', 'staff', 'contests', 'students', 'batches'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === tab ? 'rgba(57, 72, 42, 0.1)' : 'transparent',
                color: activeTab === tab ? '#39482a' : '#666',
                fontWeight: activeTab === tab ? 500 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: 20, background: 'rgba(57, 72, 42, 0.02)', borderRadius: 8 }}>
          {activeTab === 'overview' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Department Overview</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Monitor staff activity and student engagement across the department.
              </p>
              
              {/* Staff Activity Summary */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: 16,
                marginTop: 24,
                marginBottom: 32
              }}>
                <div style={{ padding: 20, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: '#16a34a' }}>
                    {staffPerformance.length}
                  </div>
                  <div style={{ fontSize: 14, color: '#166534', marginTop: 4 }}>Total Staff</div>
                </div>
                <div style={{ padding: 20, background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: '#2563eb' }}>
                    {departmentStudents.length}
                  </div>
                  <div style={{ fontSize: 14, color: '#1e40af', marginTop: 4 }}>Total Students</div>
                </div>
                <div style={{ padding: 20, background: '#fef3c7', borderRadius: 8, border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: '#d97706' }}>
                    {staffPerformance.reduce((sum, s) => sum + s.contests_created, 0)}
                  </div>
                  <div style={{ fontSize: 14, color: '#92400e', marginTop: 4 }}>Total Contests</div>
                </div>
              </div>
              
              {/* Staff Activity Bar Chart */}
              <div style={{ marginTop: 32 }}>
                <h4 style={{ marginBottom: 20, fontSize: 16, color: '#39482a' }}>
                  Staff Activity - Days Active
                </h4>
                {staffPerformance.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>
                    <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                    <p>No staff data available</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {staffPerformance.map((staff) => {
                      const maxDays = Math.max(...staffPerformance.map(s => s.days_active), 1);
                      const percentage = (staff.days_active / maxDays) * 100;
                      return (
                        <div key={staff.faculty_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 120, fontSize: 13, textAlign: 'right', flexShrink: 0 }}>
                            {staff.name || staff.faculty_id}
                          </div>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              height: 24,
                              width: `${Math.max(percentage, 5)}%`,
                              background: staff.role === 'hod' ? '#3b82f6' : '#10b981',
                              borderRadius: 4,
                              minWidth: percentage > 0 ? 4 : 0,
                              transition: 'width 0.3s ease',
                            }} />
                            <span style={{ fontSize: 12, color: '#666', minWidth: 50 }}>
                              {staff.days_active} days
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Staff Management Table */}
              {staffPerformance.length > 0 && (
                <div style={{ marginTop: 32, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Staff</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Role</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Days Active</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Students</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Contests</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Recent Contests & Top Performers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffPerformance.map((staff) => (
                        <tr key={staff.faculty_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '12px 8px' }}>
                            <strong>{staff.name || staff.faculty_id}</strong>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                            <span style={{
                              padding: '4px 12px',
                              borderRadius: 12,
                              background: staff.role === 'hod' ? '#dbeafe' : '#f3f4f6',
                              color: staff.role === 'hod' ? '#1e40af' : '#374151',
                              fontSize: 12,
                              textTransform: 'capitalize',
                            }}>
                              {staff.role}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', color: '#666' }}>
                            {staff.days_active}
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', color: '#666' }}>
                            {staff.assigned_students}
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', fontWeight: 600, color: '#d97706' }}>
                            {staff.contests_created || 0}
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            {staff.contests && staff.contests.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {staff.contests.slice(0, 2).map((contest) => (
                                  <div key={contest.id} style={{ fontSize: 12 }}>
                                    <span style={{ fontWeight: 500 }}>{contest.title}</span>
                                    <span style={{
                                      marginLeft: 6,
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      background: contest.status === 'active' ? '#d1fae5' : '#f3f4f6',
                                      color: contest.status === 'active' ? '#059669' : '#666',
                                      fontSize: 10,
                                    }}>
                                      {contest.status}
                                    </span>
                                    {contest.top_performers && contest.top_performers.length > 0 && (
                                      <div style={{ marginTop: 4, color: '#666', fontSize: 11 }}>
                                        🏆 {contest.top_performers[0].name} ({contest.top_performers[0].solved_in_contest})
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {staff.contests.length > 2 && (
                                  <div style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                                    +{staff.contests.length - 2} more contests
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#999', fontSize: 12 }}>No contests</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'staff' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Department Staff</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Click on a staff member to view their detailed analytics.
              </p>
              {staffList.length === 0 ? (
                <div style={{ marginTop: 24, textAlign: 'center', color: '#999', padding: 40 }}>
                  <Users size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                  <p>No staff found in your department</p>
                </div>
              ) : (
                <div style={{ marginTop: 24 }}>
                  {staffList.map((staff) => (
                    <div 
                      key={staff.faculty_id} 
                      style={{
                        padding: '12px 16px',
                        background: staff.is_active === false ? '#fee2e2' : 'white',
                        borderRadius: 8,
                        marginBottom: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        opacity: staff.is_active === false ? 0.7 : 1,
                      }}
                    >
                      <div 
                        onClick={() => handleStaffClick(staff.faculty_id)}
                        style={{ flex: 1, cursor: 'pointer' }}
                      >
                        <strong>{staff.name || staff.faculty_id}</strong>
                        <span style={{ color: '#666', marginLeft: 8 }}>({staff.faculty_id})</span>
                        {staff.is_active === false && (
                          <span style={{
                            marginLeft: 8,
                            padding: '2px 8px',
                            background: '#dc2626',
                            color: 'white',
                            borderRadius: 4,
                            fontSize: 11,
                          }}>
                            LOCKED
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Lock/Unlock Button - Only for non-HOD staff */}
                        {staff.role !== 'hod' && staff.role !== 'admin' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStaffLockToggle(staff.faculty_id, staff.is_active);
                            }}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: 'none',
                              background: staff.is_active === false ? '#059669' : '#dc2626',
                              color: 'white',
                              fontSize: 12,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title={staff.is_active === false ? 'Unlock staff' : 'Lock staff'}
                          >
                            {staff.is_active === false ? <Unlock size={14} /> : <Lock size={14} />}
                            {staff.is_active === false ? 'Unlock' : 'Lock'}
                          </button>
                        )}
                        <span style={{ color: '#666', fontSize: 12, cursor: 'pointer' }} onClick={() => handleStaffClick(staff.faculty_id)}>
                          View →
                        </span>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: 12,
                          background: staff.role === 'hod' ? '#dbeafe' : '#f3f4f6',
                          color: staff.role === 'hod' ? '#1e40af' : '#374151',
                          fontSize: 12,
                          textTransform: 'capitalize',
                        }}>
                          {staff.role}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                          {staffDetail.staff.role === 'hod' ? 'Head of Department' : 'Staff'} • {staffDetail.staff.faculty_id}
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
                      <button
                        onClick={closeStaffDetail}
                        style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f3f4f6', cursor: 'pointer', fontSize: 14 }}
                      >
                        Close ✕
                      </button>
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
                                        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{p.name}</span>
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
                                  <strong>{student.name}</strong>
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

          {/* Contests Tab */}
          {activeTab === 'contests' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Department Contests</h3>
              
              {/* Pending Approvals Section */}
              <div style={{ marginBottom: 32 }}>
                <ContestApprovalPanel 
                  contests={contests}
                  onRefresh={() => {
                    // Reload contests after approval/rejection
                    fetch(`/api/contests/`, { credentials: 'include' })
                      .then(res => res.json())
                      .then(data => {
                        setContests(data.contests || []);
                        // Update pending count
                        const pendingCount = (data.contests || []).filter(c => c.status === 'pending_approval').length;
                        setStats(prev => ({ ...prev, pendingApprovals: pendingCount }));
                      });
                  }}
                />
              </div>

              {/* All Contests Section */}
              <div style={{ marginTop: 32 }}>
                <h4 style={{ marginBottom: 12, fontSize: 15, color: '#666' }}>All Department Contests</h4>
                <p style={{ color: 'var(--text-soft)', fontSize: 13, marginBottom: 16 }}>
                  Contests published by staff in your department. Click to view analytics.
                </p>
                {contests.length === 0 ? (
                  <div style={{ marginTop: 24, textAlign: 'center', color: '#999', padding: 40 }}>
                    <Trophy size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                    <p>No contests created yet</p>
                  </div>
                ) : (
                  <div style={{ marginTop: 16 }}>
                    {contests.map((contest) => (
                      <div 
                        key={contest.id} 
                        onClick={() => setShowContestDetail(contest.id)}
                        style={{
                          padding: '16px 20px',
                          background: 'white',
                          borderRadius: 8,
                          marginBottom: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          cursor: 'pointer',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          borderLeft: contest.status === 'active' ? '4px solid #10b981' : 
                                      contest.status === 'published' ? '4px solid #3b82f6' :
                                      contest.status === 'pending_approval' ? '4px solid #f59e0b' :
                                      contest.status === 'approved' ? '4px solid #059669' : '4px solid #9ca3af',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateX(4px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                            {contest.title}
                          </div>
                          <div style={{ color: '#666', fontSize: 13 }}>
                            Created by {contest.created_by?.name || contest.created_by?.faculty_id} • {new Date(contest.created_at).toLocaleDateString()}
                          </div>
                          {contest.start_time && (
                            <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>
                              {new Date(contest.start_time).toLocaleString()} - {new Date(contest.end_time).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#39482a' }}>
                              {contest.total_participants || 0}
                            </div>
                            <div style={{ fontSize: 11, color: '#666' }}>Participants</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 18, fontWeight: 'bold', color: '#059669' }}>
                              {contest.total_submissions || 0}
                            </div>
                            <div style={{ fontSize: 11, color: '#666' }}>Submissions</div>
                          </div>
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            background: contest.status === 'active' ? '#d1fae5' :
                                       contest.status === 'published' ? '#dbeafe' :
                                       contest.status === 'pending_approval' ? '#fef3c7' :
                                       contest.status === 'approved' ? '#d1fae5' :
                                       contest.status === 'rejected' ? '#fee2e2' : '#f3f4f6',
                            color: contest.status === 'active' ? '#059669' :
                                  contest.status === 'published' ? '#1e40af' :
                                  contest.status === 'pending_approval' ? '#d97706' :
                                  contest.status === 'approved' ? '#059669' :
                                  contest.status === 'rejected' ? '#dc2626' : '#374151',
                            fontSize: 12,
                            textTransform: 'capitalize',
                            fontWeight: 600,
                          }}>
                            {contest.status.replace('_', ' ')}
                          </span>
                          <span style={{ color: '#666', fontSize: 12 }}>View →</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Students Tab */}
          {activeTab === 'students' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 style={{ marginBottom: 4 }}>
                    {department ? `${department.name} Students` : 'Department Students'}
                  </h3>
                  <p style={{ color: 'var(--text-soft)', fontSize: 14 }}>
                    Click a student to view profile. Use Block to restrict access.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 280 }}>
                  <Search size={18} color="#666" />
                  <input
                    type="text"
                    placeholder="Search by name or register #..."
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    style={{
                      flex: 1, padding: '8px 12px',
                      border: '1px solid #e5e7eb', borderRadius: 6,
                      fontSize: 14, outline: 'none',
                    }}
                  />
                  {studentSearchQuery && (
                    <button onClick={() => setStudentSearchQuery('')}
                      style={{ padding: '6px 10px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                    >Clear</button>
                  )}
                </div>
              </div>

              {(() => {
                const filtered = studentSearchQuery
                  ? departmentStudents.filter(s =>
                      (s.name && s.name.toLowerCase().includes(studentSearchQuery.toLowerCase())) ||
                      (s.register_number && s.register_number.toLowerCase().includes(studentSearchQuery.toLowerCase()))
                    )
                  : departmentStudents;

                if (filtered.length === 0) {
                  return (
                    <div style={{ marginTop: 24, textAlign: 'center', color: '#999', padding: 40 }}>
                      <Users size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                      <p>{studentSearchQuery ? 'No students match your search.' : 'No students found in your department.'}</p>
                    </div>
                  );
                }

                return (
                  <div style={{ marginTop: 16, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                          <th style={{ textAlign: 'left', padding: '12px 8px' }}>#</th>
                          <th style={{ textAlign: 'left', padding: '12px 8px' }}>Register No.</th>
                          <th style={{ textAlign: 'left', padding: '12px 8px' }}>Name</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Batch</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Solved</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Streak</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Last Active</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Status</th>
                          <th style={{ textAlign: 'center', padding: '12px 8px' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...filtered]
                          .sort((a, b) => (b.solved_count || 0) - (a.solved_count || 0))
                          .map((student, idx) => (
                          <tr key={student.register_number}
                            style={{
                              borderBottom: '1px solid #f3f4f6',
                              background: student.is_active === false ? '#fff5f5' : 'transparent',
                              opacity: student.is_active === false ? 0.8 : 1,
                            }}
                          >
                            <td style={{ padding: '10px 8px', color: '#999', fontSize: 12 }}>{idx + 1}</td>
                            <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12 }}>{student.register_number}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <span
                                onClick={() => handleStudentClick(student.register_number)}
                                style={{ fontWeight: 500, color: '#4f46e5', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                {student.name || 'Unknown'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 8, background: '#e0e7ff', color: '#4338ca', fontSize: 11 }}>
                                {student.batch || 'N/A'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                              {student.solved_count || 0}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '2px 6px', borderRadius: 8,
                                background: (student.current_streak || 0) > 5 ? '#fef3c7' : '#f3f4f6',
                                color: (student.current_streak || 0) > 5 ? '#d97706' : '#666',
                                fontSize: 11,
                              }}>
                                {student.current_streak || 0} 🔥
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center', color: '#666', fontSize: 12 }}>
                              {student.last_active ? new Date(student.last_active).toLocaleDateString() : 'Never'}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {student.is_active === false ? (
                                <span style={{ padding: '2px 8px', borderRadius: 4, background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 600 }}>BLOCKED</span>
                              ) : (
                                <span style={{ padding: '2px 8px', borderRadius: 4, background: '#d1fae5', color: '#059669', fontSize: 11, fontWeight: 600 }}>ACTIVE</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button
                                  onClick={() => handleStudentClick(student.register_number)}
                                  style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#e0e7ff', color: '#4338ca', fontSize: 12, cursor: 'pointer' }}
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleStudentBlockToggle(student.register_number)}
                                  style={{
                                    padding: '4px 10px', borderRadius: 5, border: 'none',
                                    background: student.is_active === false ? '#d1fae5' : '#fee2e2',
                                    color: student.is_active === false ? '#059669' : '#dc2626',
                                    fontSize: 12, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  {student.is_active === false ? <Shield size={12} /> : <ShieldOff size={12} />}
                                  {student.is_active === false ? 'Unblock' : 'Block'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
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
                      // Filter students by search query
                      const students = studentSearchQuery
                        ? allStudents.filter(s =>
                            (s.name && s.name.toLowerCase().includes(studentSearchQuery.toLowerCase())) ||
                            (s.register_number && s.register_number.toLowerCase().includes(studentSearchQuery.toLowerCase()))
                          )
                        : allStudents;
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
                            onClick={() => setSelectedBatch(isSelected ? null : batch)}
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
                              {/* Top 3 Performers Preview */}
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, color: '#666', marginBottom: 10, fontWeight: 500 }}>
                                  🏆 Top 3 Performers
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {topPerformers.map((student, idx) => (
                                    <div key={student.register_number} style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '6px 10px',
                                      background: idx === 0 ? '#fef3c7' : '#f9fafb',
                                      borderRadius: 8,
                                      border: idx === 0 ? '1px solid #fde68a' : '1px solid #e5e7eb',
                                      fontSize: 12,
                                    }}>
                                      <span style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        background: idx === 0 ? '#f59e0b' : '#9ca3af',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 10,
                                        fontWeight: 600,
                                      }}>
                                        {idx + 1}
                                      </span>
                                      <span style={{ fontWeight: 500 }}>{student.name}</span>
                                      <span style={{ color: '#666' }}>({student.solved_count || 0})</span>
                                    </div>
                                  ))}
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
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Solved</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Streak</th>
                                      <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Last Active</th>
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
      </div>

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
              maxWidth: 780, width: '100%', maxHeight: '92vh',
              overflow: 'auto', padding: 32,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
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
                    <button onClick={closeStudentDetail}
                      style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
                    >
                      Close ✕
                    </button>
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
                    { label: 'Contests', value: studentDetail.analytics.contests_participated, color: '#4f46e5' },
                    { label: 'Won 🏆', value: studentDetail.analytics.contests_won?.length || 0, color: '#f59e0b' },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: 14, background: '#f9fafb', borderRadius: 10, textAlign: 'center', border: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>

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
          </div>
        </div>
      )}
    </div>
  );
};

export default HODDashboard;
