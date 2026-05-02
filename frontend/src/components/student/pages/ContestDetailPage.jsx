// Contest Detail Page - Shows all problems in the contest with ProblemsPage styling
import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Circle, Clock, Trophy, Play } from 'lucide-react';
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

  async function handleStopContest() {
    if (!confirm('Are you sure you want to stop this contest? This action cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/student/contests/${contestId}/stop/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
      });

      if (res.ok) {
        alert('Contest stopped successfully. Your current progress has been saved.');
        // Reload contest to get updated status
        await loadContest();
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to stop contest');
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
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
  const isTimeWarning = timeRemaining !== null && timeRemaining < 5 * 60 * 1000; // Less than 5 minutes
  const isProgrammingContest = contest.contest_type === 'programming';

  console.log('Rendering contest with problems:', problems); // Debug log

  return (
    <div className="page-stack">
      {/* Header - ProblemsPage style */}
      <section className="page-header compact-header">
        <div>
          <button
            onClick={onBack}
            className="back-to-list-btn"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #d1d5db',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 12,
            }}
          >
            <ArrowLeft size={16} />
            Back to Contests
          </button>
          <p className="kicker">Contest Workspace</p>
          <h1>{contest.title}</h1>
          {contest.description && (
            <p style={{ margin: '8px 0 0', color: '#666', fontSize: 14 }}>
              {contest.description}
            </p>
          )}
        </div>
        
        <div className="problem-header-meta">
          {/* Timer */}
          {timeRemaining !== null && (
            <div className="workspace-brief contest-timer-brief">
              <span>Time Remaining</span>
              <strong className={`timer-countdown ${isTimeUp ? 'time-up' : isTimeWarning ? 'time-warning' : ''}`}>
                {formatTime(timeRemaining)}
              </strong>
            </div>
          )}
          
          {/* Stats */}
          <div className="stats-summary-row">
            <span className="stat-chip total">{problems.length} Problems</span>
            <span className="stat-chip easy">{solvedCount} Solved</span>
            {contest.participation && (
              <span className="stat-chip medium">Score: {contest.participation.total_score}</span>
            )}
          </div>
          
          {/* Stop Contest Button - Only for programming contests */}
          {isProgrammingContest && !isTimeUp && contest.participation?.is_active && (
            <button 
              type="button" 
              className="primary-button dense-action"
              onClick={handleStopContest}
              style={{ background: '#dc2626' }}
            >
              Stop Contest
            </button>
          )}
        </div>
      </section>

      {/* Time Up Warning */}
      {isTimeUp && (
        <section className="surface-card" style={{ marginBottom: 16 }}>
          <div style={{
            padding: 12,
            background: '#fee2e2',
            borderRadius: 8,
            color: '#dc2626',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Clock size={16} />
            Contest has ended. You can view problems but cannot submit solutions.
          </div>
        </section>
      )}

      {/* Problems Table - ProblemsPage style */}
      <section className="surface-card problems-table-card">
        {problems.length === 0 ? (
          <div className="empty-problems-state">
            <span className="empty-icon">🔍</span>
            <h3>No problems found</h3>
            <p>This contest doesn't have any problems yet.</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="problems-table-head">
              <span className="col-num">#</span>
              <span className="col-title">Title</span>
              <span className="col-tags">Tags</span>
              <span className="col-diff">Difficulty</span>
              <span className="col-status">Status</span>
              <span className="col-action" />
            </div>

            {/* Rows */}
            <div className="problems-table-body">
              {problems.map((problem, idx) => (
                <button
                  key={problem.id}
                  type="button"
                  className="problem-table-row"
                  onClick={() => {
                    console.log('Problem clicked:', problem.slug, 'isTimeUp:', isTimeUp); // Debug log
                    if (!isTimeUp) {
                      onSelectProblem(problem.slug);
                    }
                  }}
                  disabled={isTimeUp}
                  style={{
                    opacity: isTimeUp ? 0.6 : 1,
                    cursor: isTimeUp ? 'not-allowed' : 'pointer',
                  }}
                >
                  <span className="col-num">{idx + 1}</span>

                  <span className="col-title">
                    <strong>{problem.title}</strong>
                  </span>

                  <span className="col-tags">
                    {(problem.tags || []).map((tag) => (
                      <span key={tag} className="tag compact-tag">{tag}</span>
                    ))}
                  </span>

                  <span className="col-diff">
                    <span className={`difficulty-chip ${problem.difficulty.toLowerCase()}`}>
                      {problem.difficulty}
                    </span>
                  </span>

                  <span className="col-status">
                    <span className={`status-badge ${problem.is_solved ? 'status-solved' : 'status-todo'}`}>
                      {problem.is_solved ? 'Solved' : 'Todo'}
                    </span>
                  </span>

                  <span className="col-action">
                    {!isTimeUp && (
                      <span className="solve-arrow">
                        {problem.is_solved ? 'Review →' : 'Solve →'}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            <p className="table-footer-note">
              {problems.length} problem{problems.length !== 1 ? "s" : ""} total • {solvedCount} solved
            </p>
          </>
        )}
      </section>
    </div>
  );
};

export default ContestDetailPage;
