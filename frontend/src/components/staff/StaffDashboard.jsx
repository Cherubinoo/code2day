// Staff Dashboard - Staff view with contests and batch-wise analytics
import { useState, useEffect } from 'react';
import { Users, Trophy, BookOpen, BarChart3, Plus, Eye } from 'lucide-react';
import EnhancedContestCreator from './EnhancedContestCreator';
import StudentAnalyticsModal from './StudentAnalyticsModal';
import ContestDetailModal from '../common/ContestDetailModal';

const StaffDashboard = ({ institutionId }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [staffDetail, setStaffDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showContestCreator, setShowContestCreator] = useState(false);
  const [selectedStudentForAnalytics, setSelectedStudentForAnalytics] = useState(null);
  const [showContestDetail, setShowContestDetail] = useState(null);

  async function loadStaffData() {
    try {
      setLoading(true);
      // Get current staff profile from dashboard endpoint
      const res = await fetch('/api/dashboard/', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        console.log('Dashboard data:', data); // Debug log
        
        // For staff, try facultyId first, then registerNumber as fallback
        const facultyId = data.user?.facultyId || data.user?.registerNumber;
        
        if (facultyId) {
          // Load detailed staff data
          const detailRes = await fetch(`/api/staff/${facultyId}/details/`, { credentials: 'include' });
          if (detailRes.ok) {
            const detailData = await detailRes.json();
            console.log('Staff detail data:', detailData); // Debug log
            setStaffDetail(detailData);
          } else {
            const errorData = await detailRes.json();
            setError(errorData.detail || 'Failed to load staff details');
          }
        } else {
          setError('Faculty ID not found in user data');
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

  const { staff, analytics } = staffDetail;

  function handleContestCreated() {
    loadStaffData(); // Reload data after contest creation
  }

  return (
    <div className="admin-dashboard">
      {showContestCreator && (
        <EnhancedContestCreator
          onClose={() => setShowContestCreator(false)}
          onSuccess={handleContestCreated}
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

      <div className="admin-container">
        <div className="admin-header">
          <div>
            <h1>Staff Dashboard</h1>
            <p>{staff.name} • {staff.department?.name || 'Department'}</p>
          </div>
          <button
            onClick={() => setShowContestCreator(true)}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#4f46e5',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            <Plus size={18} />
            Create Contest
          </button>
        </div>

        {error && (
          <div style={{ padding: 16, background: '#fee2e2', borderRadius: 8, color: '#dc2626', marginBottom: 16 }}>
            Error: {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>Assigned Students</h3>
              <p className="stat-value">{staff.assigned_students || 0}</p>
            </div>
            <div className="admin-stat-icon blue">
              <Users size={24} />
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>Contests Created</h3>
              <p className="stat-value">{analytics.contests?.length || 0}</p>
            </div>
            <div className="admin-stat-icon orange">
              <Trophy size={24} />
            </div>
          </div>

          <div className="admin-stat-card">
            <div className="admin-stat-info">
              <h3>Problems Solved</h3>
              <p className="stat-value">{analytics.total_solved || 0}</p>
            </div>
            <div className="admin-stat-icon green">
              <BookOpen size={24} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, marginBottom: 16, borderBottom: '1px solid rgba(57, 72, 42, 0.1)', paddingBottom: 8 }}>
          {['overview', 'contests', 'batches', 'top-performers'].map((tab) => (
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
              {tab.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: 20, background: 'rgba(57, 72, 42, 0.02)', borderRadius: 8 }}>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Overview</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Your department activity and performance summary.
              </p>

              {/* Weekly Progress */}
              <div style={{ marginTop: 24, marginBottom: 32 }}>
                <h4 style={{ marginBottom: 16 }}>Weekly Department Activity</h4>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 8px' }}>
                  {analytics.weekly_progress?.map((day, i) => {
                    const maxCount = Math.max(...(analytics.weekly_progress?.map(d => d.count) || [1]), 1);
                    const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(height, 5)}%`,
                          background: height > 50 ? '#059669' : '#10b981',
                          borderRadius: '4px 4px 0 0',
                          minHeight: 4,
                        }} />
                        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{day.day}</div>
                        <div style={{ fontSize: 10, color: '#999' }}>{day.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Contests Preview */}
              {analytics.contests && analytics.contests.length > 0 && (
                <div>
                  <h4 style={{ marginBottom: 16 }}>Recent Contests</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {analytics.contests.slice(0, 3).map((contest) => (
                      <div key={contest.id} style={{ padding: 16, background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{contest.title}</strong>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            background: contest.status === 'active' ? '#d1fae5' : '#f3f4f6',
                            color: contest.status === 'active' ? '#059669' : '#666',
                            fontSize: 11,
                            textTransform: 'capitalize',
                          }}>
                            {contest.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                          {contest.total_participants || 0} participants • {contest.total_submissions || 0} submissions
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Contests Tab */}
          {activeTab === 'contests' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Your Contests</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Contests you created with individual top performers.
              </p>

              {analytics.contests && analytics.contests.length > 0 ? (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {analytics.contests.map((contest) => (
                    <div 
                      key={contest.id} 
                      onClick={() => setShowContestDetail(contest.id)}
                      style={{
                      padding: 20,
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
                    }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                          <strong style={{ fontSize: 18 }}>{contest.title}</strong>
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            Created {new Date(contest.created_at).toLocaleDateString()}
                            {contest.end_time && new Date(contest.end_time) < new Date() && (
                              <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>
                                • Expired
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: 12,
                          background: contest.end_time && new Date(contest.end_time) < new Date() ? '#fee2e2' :
                                     contest.status === 'active' ? '#d1fae5' :
                                     contest.status === 'published' ? '#dbeafe' :
                                     contest.status === 'pending_approval' ? '#fef3c7' :
                                     contest.status === 'approved' ? '#d1fae5' : '#f3f4f6',
                          color: contest.end_time && new Date(contest.end_time) < new Date() ? '#dc2626' :
                                contest.status === 'active' ? '#059669' :
                                 contest.status === 'published' ? '#1e40af' :
                                 contest.status === 'pending_approval' ? '#d97706' :
                                 contest.status === 'approved' ? '#059669' : '#666',
                          fontSize: 12,
                          textTransform: 'capitalize',
                        }}>
                          {contest.end_time && new Date(contest.end_time) < new Date() ? 'Expired' : contest.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                        gap: 16,
                        marginBottom: 16,
                        padding: 12,
                        background: '#f9fafb',
                        borderRadius: 8,
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#39482a' }}>{contest.total_participants || 0}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>Participants</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#3b82f6' }}>{contest.total_submissions || 0}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>Submissions</div>
                        </div>
                      </div>

                      {contest.top_performers && contest.top_performers.length > 0 && (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#666', marginBottom: 12 }}>
                            🏆 Top Performers in this Contest
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 500, color: '#666' }}>Rank</th>
                                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 500, color: '#666' }}>Student</th>
                                <th style={{ textAlign: 'left', padding: '8px', fontWeight: 500, color: '#666' }}>Batch</th>
                                <th style={{ textAlign: 'center', padding: '8px', fontWeight: 500, color: '#666' }}>Solved</th>
                                <th style={{ textAlign: 'center', padding: '8px', fontWeight: 500, color: '#666' }}>Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {contest.top_performers.map((performer, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < contest.top_performers.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                                  <td style={{ padding: '8px' }}>
                                    <span style={{
                                      width: 24,
                                      height: 24,
                                      borderRadius: '50%',
                                      background: idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : idx === 2 ? '#b45309' : '#e5e7eb',
                                      color: idx < 3 ? 'white' : '#666',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 12,
                                      fontWeight: 600,
                                    }}>
                                      {idx + 1}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px', fontWeight: 500 }}>{performer.name}</td>
                                  <td style={{ padding: '8px' }}>
                                    <span style={{
                                      padding: '2px 6px',
                                      background: '#e0e7ff',
                                      color: '#4338ca',
                                      borderRadius: 4,
                                      fontSize: 11,
                                    }}>
                                      {performer.batch || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>{performer.solved_in_contest}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>{performer.score}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 40, textAlign: 'center', color: '#999', padding: 40 }}>
                  <Trophy size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                  <p>No contests created yet</p>
                </div>
              )}
            </div>
          )}

          {/* Batches Tab */}
          {activeTab === 'batches' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Batch-wise Performance</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Select a batch to view all students. Click a batch card to expand.
              </p>

              {analytics.batch_wise && analytics.batch_wise.length > 0 ? (
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {analytics.batch_wise.map((batch) => {
                    const isSelected = selectedBatch === batch.batch;
                    const top3 = batch.top_performers?.slice(0, 3) || [];
                    const allStudents = batch.students || [];

                    return (
                      <div key={batch.batch} style={{
                        background: 'white',
                        borderRadius: 12,
                        border: isSelected ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        overflow: 'hidden',
                      }}>
                        {/* Batch Header - Clickable */}
                        <div
                          onClick={() => setSelectedBatch(isSelected ? null : batch.batch)}
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
                              Batch {batch.batch}
                            </span>
                            <span style={{ color: '#666', fontSize: 14 }}>{batch.student_count} students</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 13, color: '#666' }}>
                              Total Solved: {allStudents.reduce((sum, s) => sum + (s.solved_count || 0), 0)}
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
                            {top3.length > 0 && (
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, color: '#666', marginBottom: 10, fontWeight: 500 }}>
                                  🏆 Top 3 Performers
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                  {top3.map((student, idx) => (
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
                            )}

                            {/* All Students Table */}
                            <div style={{ fontSize: 12, color: '#666', marginBottom: 10, fontWeight: 500 }}>
                              👥 All Students in Batch {batch.batch}
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
                                    <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 600, color: '#374151', position: 'sticky', top: 0, background: '#f9fafb' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {allStudents.map((student, idx) => (
                                    <tr key={student.register_number} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                      <td style={{ padding: '8px', color: '#666', fontSize: 12 }}>{idx + 1}</td>
                                      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}>{student.register_number}</td>
                                      <td style={{ padding: '8px', fontWeight: 500 }}>{student.name || 'Unknown'}</td>
                                      <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>{student.solved_count || 0}</td>
                                      <td style={{ padding: '8px', textAlign: 'center' }}>
                                        <span style={{
                                          padding: '2px 6px',
                                          borderRadius: 8,
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
                                          onClick={() => setSelectedStudentForAnalytics(student.register_number)}
                                          style={{
                                            padding: '4px 10px',
                                            borderRadius: 6,
                                            border: '1px solid #d1d5db',
                                            background: 'white',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                          title="View detailed analytics"
                                        >
                                          <Eye size={14} />
                                          View
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
              ) : (
                <div style={{ marginTop: 40, textAlign: 'center', color: '#999', padding: 40 }}>
                  <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                  <p>No batch data available</p>
                </div>
              )}
            </div>
          )}

          {/* Top Performers Tab */}
          {activeTab === 'top-performers' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Department Top Performers</h3>
              <p style={{ color: 'var(--text-soft)' }}>
                Overall top performing students in your department.
              </p>

              {analytics.top_performers && analytics.top_performers.length > 0 ? (
                <div style={{ marginTop: 24 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Rank</th>
                        <th style={{ textAlign: 'left', padding: '12px 8px' }}>Student</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>ID</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Solved</th>
                        <th style={{ textAlign: 'center', padding: '12px 8px' }}>Streak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.top_performers.map((student, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '12px 8px' }}>
                            <span style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#e5e7eb',
                              color: i < 3 ? 'white' : '#666',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 13,
                              fontWeight: 600,
                            }}>
                              {i + 1}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px' }}>
                            <strong>{student.name}</strong>
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', color: '#666' }}>
                            {student.id}
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px', color: '#059669', fontWeight: 600 }}>
                            {student.solved_count}
                          </td>
                          <td style={{ textAlign: 'center', padding: '12px 8px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 12,
                              background: student.current_streak > 5 ? '#fef3c7' : '#f3f4f6',
                              color: student.current_streak > 5 ? '#d97706' : '#666',
                              fontSize: 12,
                            }}>
                              {student.current_streak} 🔥
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ marginTop: 40, textAlign: 'center', color: '#999', padding: 40 }}>
                  <Users size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                  <p>No performer data available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
