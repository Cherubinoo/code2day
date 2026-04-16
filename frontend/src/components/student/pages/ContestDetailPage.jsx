// Contest Detail Page - Shows all problems in the contest
import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Circle, Clock, Trophy } from 'lucide-react';
import { getCsrfToken } from '../../../lib/appUtils';

const ContestDetailPage = ({ contestId, onBack, onSelectProblem }) => {
  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);

  useEffect(() => {
    loadContest();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [contestId]);

  // Auto-submit when time expires
  useEffect(() => {
    if (timeRemaining === 0 && !hasAutoSubmitted && contest?.participation?.is_active) {
      handleAutoSubmit();
    }
  }, [timeRemaining, hasAutoSubmitted]);

  async function handleAutoSubmit() {
    try {
      setHasAutoSubmitted(true);
      const res = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
      });

      if (res.ok) {
        console.log('Contest auto-submitted successfully');
        // Reload contest to get updated status
        await loadContest();
      }
    } catch (err) {
      console.error('Auto-submit failed:', err);
    }
  }

  function updateTimer() {
    if (!contest || !contest.end_time) return;
    
    const now = new Date().getTime();
    const end = new Date(contest.end_time).getTime();
    const remaining = end - now;

    if (remaining <= 0) {
      setTimeRemaining(0);
    } else {
      setTimeRemaining(remaining);
    }
  }

  function formatTime(ms) {
    if (ms === null || ms === undefined) return '--:--:--';
    if (ms <= 0) return '00:00:00';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async function loadContest() {
    try {
      setLoading(true);
      const res = await fetch(`/api/student/contests/${contestId}/`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Contest data loaded:', data); // Debug log
        setContest(data);
        updateTimer();
      } else {
        const data = await res.json();
        console.error('Failed to load contest:', data); // Debug log
        setError(data.detail || 'Failed to load contest');
      }
    } catch (err) {
      console.error('Error loading contest:', err); // Debug log
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading contest...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: 20 }}>{error}</p>
        <button
          onClick={onBack}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          Back to Contests
        </button>
      </div>
    );
  }

  if (!contest) return null;

  const problems = contest.problems || [];
  const solvedCount = problems.filter(p => p.is_solved).length;
  const isTimeUp = timeRemaining !== null && timeRemaining <= 0;

  console.log('Rendering contest with problems:', problems); // Debug log

  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{
        marginBottom: 24,
        padding: 20,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 16,
          }}
        >
          <ArrowLeft size={16} />
          Back to Contests
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>{contest.title}</h2>
            {contest.description && (
              <p style={{ margin: '0 0 16px', color: '#666', fontSize: 14 }}>
                {contest.description}
              </p>
            )}

            <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
              <div>
                <span style={{ color: '#666' }}>Problems: </span>
                <strong>{problems.length}</strong>
              </div>
              <div>
                <span style={{ color: '#666' }}>Solved: </span>
                <strong style={{ color: '#059669' }}>{solvedCount}/{problems.length}</strong>
              </div>
              {contest.participation && (
                <div>
                  <span style={{ color: '#666' }}>Score: </span>
                  <strong style={{ color: '#f59e0b' }}>{contest.participation.total_score}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Timer */}
          {timeRemaining !== null && (
            <div style={{
              padding: '12px 20px',
              borderRadius: 8,
              background: isTimeUp ? '#fee2e2' : timeRemaining < 5 * 60 * 1000 ? '#fef3c7' : '#e0e7ff',
              color: isTimeUp ? '#dc2626' : timeRemaining < 5 * 60 * 1000 ? '#d97706' : '#4f46e5',
              fontWeight: 600,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'center',
            }}>
              <Clock size={20} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 400 }}>Time Remaining</div>
                <div>{formatTime(timeRemaining)}</div>
              </div>
            </div>
          )}
        </div>

        {isTimeUp && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: '#fee2e2',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14,
          }}>
            ⏰ Contest has ended. You can view problems but cannot submit solutions.
          </div>
        )}
      </div>

      {/* Problems List */}
      <div>
        <h3 style={{ fontSize: 18, marginBottom: 16 }}>Problems</h3>
        {problems.length === 0 ? (
          <div style={{
            padding: 40,
            textAlign: 'center',
            background: 'white',
            borderRadius: 12,
            border: '1px solid #e5e7eb',
          }}>
            <p style={{ color: '#666' }}>No problems in this contest</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {problems.map((problem, idx) => (
              <div
                key={problem.id}
                onClick={() => {
                  console.log('Problem clicked:', problem.slug, 'isTimeUp:', isTimeUp); // Debug log
                  if (!isTimeUp) {
                    onSelectProblem(problem.slug);
                  }
                }}
                style={{
                  padding: 20,
                  background: 'white',
                  borderRadius: 12,
                  border: problem.is_solved ? '2px solid #d1fae5' : '1px solid #e5e7eb',
                  cursor: isTimeUp ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isTimeUp ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isTimeUp) {
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Status Icon */}
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: problem.is_solved ? '#d1fae5' : '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {problem.is_solved ? (
                    <CheckCircle size={20} style={{ color: '#059669' }} />
                  ) : (
                    <Circle size={20} style={{ color: '#9ca3af' }} />
                  )}
                </div>

                {/* Problem Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: '#666', fontWeight: 500 }}>
                      Problem {idx + 1}
                    </span>
                    <h4 style={{ margin: 0, fontSize: 16 }}>{problem.title}</h4>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      background: problem.difficulty === 'Easy' ? '#d1fae5' :
                                 problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                      color: problem.difficulty === 'Easy' ? '#059669' :
                             problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                    }}>
                      {problem.difficulty}
                    </span>
                    {problem.tags && problem.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        {problem.tags.slice(0, 3).map((tag, i) => (
                          <span key={i} style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            background: '#e0e7ff',
                            color: '#4338ca',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Solve Button */}
                {!isTimeUp && (
                  <button
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: problem.is_solved ? '#d1fae5' : '#4f46e5',
                      color: problem.is_solved ? '#059669' : 'white',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {problem.is_solved ? 'Solved ✓' : 'Solve'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};

export default ContestDetailPage;
