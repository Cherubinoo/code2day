// Contest Detail Modal - View contest analytics and student submissions
import { useState, useEffect } from 'react';
import { X, Trophy, Users, Clock, CheckCircle, XCircle, Eye, Code } from 'lucide-react';

const ContestDetailModal = ({ contestId, onClose }) => {
  const [contest, setContest] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  useEffect(() => {
    loadContestData();
  }, [contestId]);

  async function loadContestData() {
    setLoading(true);
    setError(null);
    try {
      // Fetch contest details
      const detailRes = await fetch(`/api/contests/${contestId}/`, { credentials: 'include' });
      if (detailRes.ok) {
        const detailData = await detailRes.json();
        setContest(detailData);
      } else {
        throw new Error('Failed to load contest details');
      }

      // Fetch contest analytics
      const analyticsRes = await fetch(`/api/contests/${contestId}/analytics/`, { credentials: 'include' });
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        setAnalytics(analyticsData);
      } else {
        throw new Error('Failed to load contest analytics');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentClick(student) {
    setSelectedStudent(student);
    setSubmissionsLoading(true);
    setStudentSubmissions([]);
    
    try {
      // Fetch student's submissions for this contest
      const res = await fetch(
        `/api/contests/${contestId}/student/${student.register_number}/submissions/`,
        { credentials: 'include' }
      );
      
      if (res.ok) {
        const data = await res.json();
        setStudentSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load student submissions:', err);
    } finally {
      setSubmissionsLoading(false);
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
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }}>
          <p>Loading contest details...</p>
        </div>
      </div>
    );
  }

  if (error || !contest || !analytics) {
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
      }} onClick={onClose}>
        <div style={{
          background: 'white',
          borderRadius: 12,
          padding: 40,
          textAlign: 'center',
        }} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: '#dc2626', marginBottom: 16 }}>{error || 'Failed to load contest'}</p>
          <button onClick={onClose} style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
          }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // Filter to only show students who have submitted
  const participantsWithSubmissions = (analytics.participants || []).filter(p => p.total_submissions > 0);

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
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        maxWidth: 1200,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '24px 32px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 1,
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 24, marginBottom: 8 }}>{contest.title}</h2>
            <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
              Created by {contest.created_by?.name} • {new Date(contest.created_at).toLocaleDateString()}
            </p>
            {contest.description && (
              <p style={{ margin: '8px 0 0', color: '#374151', fontSize: 14 }}>
                {contest.description}
              </p>
            )}
          </div>
          <button onClick={onClose} style={{
            padding: 8,
            borderRadius: 6,
            border: 'none',
            background: '#f3f4f6',
            cursor: 'pointer',
            marginLeft: 16,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Stats Cards */}
        <div style={{
          padding: '24px 32px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 16,
          background: '#f9fafb',
        }}>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Total Problems</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#4f46e5' }}>
              {contest.problem_count || 0}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Assigned Students</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#3b82f6' }}>
              {contest.assigned_student_count || 0}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Participants</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#059669' }}>
              {participantsWithSubmissions.length}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Total Submissions</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#d97706' }}>
              {analytics.total_submissions || 0}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Duration</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#374151' }}>
              {contest.duration_minutes} min
            </div>
          </div>
        </div>

        {/* Student Submissions Table */}
        <div style={{ padding: '24px 32px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>
            Student Submissions ({participantsWithSubmissions.length})
          </h3>
          
          {participantsWithSubmissions.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
            }}>
              <Users size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
              <p style={{ color: '#666', margin: 0 }}>No submissions yet</p>
              <p style={{ color: '#999', margin: '8px 0 0', fontSize: 14 }}>
                Students will appear here once they submit solutions
              </p>
            </div>
          ) : (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Rank</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Student</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600 }}>Register No</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Solved</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Score</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Submissions</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Time Spent</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participantsWithSubmissions.map((participant, idx) => (
                    <tr key={participant.register_number} style={{
                      borderBottom: '1px solid #f3f4f6',
                      background: selectedStudent?.register_number === participant.register_number ? '#f0fdf4' : 'white',
                    }}>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: idx === 0 ? '#f59e0b' : idx === 1 ? '#9ca3af' : idx === 2 ? '#b45309' : '#e5e7eb',
                          color: idx < 3 ? 'white' : '#666',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          fontWeight: 600,
                        }}>
                          {idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                        {participant.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#666' }}>
                        {participant.register_number}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          background: '#d1fae5',
                          color: '#059669',
                          fontSize: 13,
                          fontWeight: 600,
                        }}>
                          {participant.problems_solved} / {contest.problem_count}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>
                        {participant.score || 0}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>
                        {participant.total_submissions}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666', fontSize: 13 }}>
                        {Math.floor((participant.time_spent || 0) / 60)}m {(participant.time_spent || 0) % 60}s
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleStudentClick(participant)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: '1px solid #d1d5db',
                            background: selectedStudent?.register_number === participant.register_number ? '#059669' : 'white',
                            color: selectedStudent?.register_number === participant.register_number ? 'white' : '#374151',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
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
          )}
        </div>

        {/* Student Submission Detail Panel */}
        {selectedStudent && (
          <div style={{
            padding: '24px 32px',
            background: '#f9fafb',
            borderTop: '2px solid #e5e7eb',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                Submissions by {selectedStudent.name}
              </h3>
              <button
                onClick={() => setSelectedStudent(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Close
              </button>
            </div>

            {submissionsLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ color: '#666' }}>Loading submissions...</p>
              </div>
            ) : studentSubmissions.length === 0 ? (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: 'white',
                borderRadius: 12,
                border: '1px solid #e5e7eb',
              }}>
                <Code size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
                <p style={{ color: '#666', margin: 0 }}>No submissions found</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {studentSubmissions.map((submission, idx) => (
                  <div key={idx} style={{
                    padding: 20,
                    background: 'white',
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 16, marginBottom: 4 }}>
                          {submission.problem_title}
                        </h4>
                        <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                          Submitted {new Date(submission.submitted_at).toLocaleString()}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {submission.status === 'Accepted' ? (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            background: '#d1fae5',
                            color: '#059669',
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <CheckCircle size={14} />
                            Accepted
                          </span>
                        ) : (
                          <span style={{
                            padding: '4px 12px',
                            borderRadius: 12,
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}>
                            <XCircle size={14} />
                            {submission.status}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: 12,
                      padding: 12,
                      background: '#f9fafb',
                      borderRadius: 8,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Language</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                          {submission.language}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Test Cases</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                          {submission.passed_cases} / {submission.total_cases}
                        </div>
                      </div>
                      {submission.execution_time && (
                        <div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Execution Time</div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                            {submission.execution_time}
                          </div>
                        </div>
                      )}
                      {submission.memory && (
                        <div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Memory</div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                            {submission.memory}
                          </div>
                        </div>
                      )}
                      {submission.score !== undefined && (
                        <div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Score</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#4f46e5' }}>
                            {submission.score}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContestDetailModal;
