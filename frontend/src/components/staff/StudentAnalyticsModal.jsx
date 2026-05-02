// Student Analytics Modal - Detailed view of individual student performance
import { useState, useEffect } from 'react';
import { X, TrendingUp, Award, Activity, FileText, Briefcase, Layout } from 'lucide-react';
import ReportFilterModal from '../common/ReportFilterModal';

const StudentAnalyticsModal = ({ registerNumber, onClose }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReportFilter, setShowReportFilter] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [registerNumber]);

  const handleGenerateReport = (filters) => {
    const params = new URLSearchParams();
    if (filters.reportType !== 'overall') params.append('type', filters.reportType);
    if (filters.batch) params.append('batch', filters.batch);
    if (filters.dateFrom) params.append('date_from', filters.dateFrom);
    if (filters.dateTo) params.append('date_to', filters.dateTo);
    if (filters.topic) params.append('topic', filters.topic);
    
    const url = `/api/students/${registerNumber}/report/?${params.toString()}`;
    window.open(url, '_blank');
  };

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
        borderRadius: '24px',
        maxWidth: 1000,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 32px 64px rgba(0,0,0,0.2)',
        border: '1px solid var(--border-soft)',
      }}>
        {/* Header */}
        <div style={{
          padding: '32px',
          borderBottom: '1px solid var(--border-soft)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(10px)',
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ 
              width: 64, height: 64, borderRadius: '20px', background: 'var(--sage-100)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', fontWeight: '800', color: 'var(--olive-700)'
            }}>
              {student.name[0]}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: 'var(--text-hard)' }}>{student.name}</h2>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '13px', color: 'var(--text-soft)', fontWeight: '600' }}>{student.register_number}</span>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>•</span>
                <span style={{ fontSize: '13px', color: 'var(--text-soft)', fontWeight: '600' }}>Batch {student.batch}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button 
              onClick={() => setShowReportFilter(true)}
              style={{ 
                padding: '12px 24px', 
                background: '#2d5016', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                cursor: 'pointer', 
                fontSize: '14px',
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                fontWeight: '700',
                boxShadow: '0 4px 12px rgba(45, 80, 22, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.background = '#1f3a0f';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.background = '#2d5016';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              <FileText size={18} /> Download Report
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#f3f4f6',
                border: 'none',
                cursor: 'pointer',
                padding: '12px',
                borderRadius: '12px',
                color: '#374151',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }}>
          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
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
                <Activity size={18} style={{ color: '#4f46e5' }} />
                <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>Aptitude Score</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 'bold', color: '#4f46e5' }}>
                {data.aptitude?.percentage || 0}%
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

          {/* Professional Insights Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
            <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
               <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Briefcase size={16} /> Targeted Companies
               </h4>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {data.company_insights?.length > 0 ? (
                    data.company_insights.map((comp, idx) => (
                      <div key={idx} style={{ padding: '6px 12px', background: 'white', borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                         <strong>{comp.name}</strong>
                         <span style={{ color: '#94a3b8' }}>{comp.count}</span>
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>No data available.</span>
                  )}
               </div>
            </div>

            <div style={{ padding: 20, background: '#fdf2f8', borderRadius: 12, border: '1px solid #fce7f3' }}>
               <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#be185d', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layout size={16} /> Skill Focus
               </h4>
               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {data.project_insights?.length > 0 ? (
                    data.project_insights.map((proj, idx) => (
                      <div key={idx} style={{ padding: '6px 12px', background: 'white', borderRadius: 8, fontSize: 12, border: '1px solid #fce7f3', color: '#db2777', fontWeight: 600 }}>
                         {proj.skill.toUpperCase()}
                      </div>
                    ))
                  ) : (
                    <span style={{ fontSize: 13, color: '#be185d', opacity: 0.6 }}>No data available.</span>
                  )}
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

      {/* Report Filter Modal */}
      <ReportFilterModal
        show={showReportFilter}
        onClose={() => setShowReportFilter(false)}
        onGenerate={handleGenerateReport}
        title={`Generate Report for ${analytics?.student?.name || 'Student'}`}
        batches={analytics?.student?.batch ? [analytics.student.batch] : []}
        showBatchFilter={false} // Hide batch filter for individual student
        showReportTypeFilter={true}
        showTopicFilter={true}
      />
    </div>
  );
};

export default StudentAnalyticsModal;
