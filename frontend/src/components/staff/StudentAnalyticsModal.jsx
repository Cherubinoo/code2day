// Student Analytics Modal - Detailed view of individual student performance
import { useState, useEffect } from 'react';
import { X, TrendingUp, Clock, Award, Activity } from 'lucide-react';

const StudentAnalyticsModal = ({ registerNumber, onClose }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAnalytics();
  }, [registerNumber]);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const res = await fetch(`/api/students/${registerNumber}/analytics/`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to load analytics');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
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
      }}>
        <div style={{
          background: 'white',
          padding: 40,
          borderRadius: 12,
          textAlign: 'center',
        }}>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
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
      }}>
        <div style={{
          background: 'white',
          padding: 40,
          borderRadius: 12,
          textAlign: 'center',
          maxWidth: 400,
        }}>
          <p style={{ color: '#dc2626', marginBottom: 20 }}>{error || 'Failed to load'}</p>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { student, analytics: data } = analytics;

  return (
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
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        maxWidth: 900,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>{student.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              {student.register_number} • Batch {student.batch} • {student.department}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 32,
          }}>
            <div style={{
              padding: 16,
              background: '#f0fdf4',
              borderRadius: 10,
              border: '1px solid #bbf7d0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Award size={18} style={{ color: '#059669' }} />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Total Solved</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#059669' }}>
                {data.solved_count}
              </div>
            </div>

            <div style={{
              padding: 16,
              background: '#fef3c7',
              borderRadius: 10,
              border: '1px solid #fde68a',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <TrendingUp size={18} style={{ color: '#d97706' }} />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Current Streak</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#d97706' }}>
                {student.current_streak} 🔥
              </div>
            </div>

            <div style={{
              padding: 16,
              background: '#e0e7ff',
              borderRadius: 10,
              border: '1px solid #c7d2fe',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Clock size={18} style={{ color: '#4f46e5' }} />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Time Spent</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#4f46e5' }}>
                {data.time_spent_hours}h
              </div>
            </div>

            <div style={{
              padding: 16,
              background: '#fce7f3',
              borderRadius: 10,
              border: '1px solid #fbcfe8',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Activity size={18} style={{ color: '#db2777' }} />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Campus Rank</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#db2777' }}>
                {student.campus_rank || 'N/A'}
              </div>
            </div>
          </div>

          {/* Difficulty Breakdown */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Problems by Difficulty</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                flex: 1,
                padding: 16,
                background: '#d1fae5',
                borderRadius: 10,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>
                  {data.difficulty_breakdown.Easy || 0}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Easy</div>
              </div>
              <div style={{
                flex: 1,
                padding: 16,
                background: '#fef3c7',
                borderRadius: 10,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#d97706' }}>
                  {data.difficulty_breakdown.Medium || 0}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Medium</div>
              </div>
              <div style={{
                flex: 1,
                padding: 16,
                background: '#fee2e2',
                borderRadius: 10,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#dc2626' }}>
                  {data.difficulty_breakdown.Hard || 0}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Hard</div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, marginBottom: 16 }}>Recent Activity (Last 30 Days)</h3>
            {data.recent_activity && data.recent_activity.length > 0 ? (
              <div style={{
                maxHeight: 300,
                overflow: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>Problem</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600 }}>Difficulty</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontWeight: 600 }}>Language</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_activity.map((activity, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', color: '#666' }}>
                          {new Date(activity.date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '10px 12px' }}>{activity.problem}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            background: activity.difficulty === 'Easy' ? '#d1fae5' :
                                       activity.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                            color: activity.difficulty === 'Easy' ? '#059669' :
                                   activity.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                          }}>
                            {activity.difficulty}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            background: activity.status === 'Accepted' ? '#d1fae5' : '#fee2e2',
                            color: activity.status === 'Accepted' ? '#059669' : '#dc2626',
                          }}>
                            {activity.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#666' }}>
                          {activity.language}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                padding: 40,
                textAlign: 'center',
                color: '#999',
                background: '#f9fafb',
                borderRadius: 10,
              }}>
                No recent activity
              </div>
            )}
          </div>

          {/* Contest Participation */}
          {data.contest_participations && data.contest_participations.length > 0 && (
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 16 }}>Contest Participation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.contest_participations.map((contest, idx) => (
                  <div key={idx} style={{
                    padding: 16,
                    background: '#f9fafb',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{contest.contest__title}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {contest.submissions} submissions • {contest.solved} solved
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      background: contest.solved > 0 ? '#d1fae5' : '#f3f4f6',
                      color: contest.solved > 0 ? '#059669' : '#666',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                      {contest.solved}/{contest.submissions}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentAnalyticsModal;
