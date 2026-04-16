// Student Contests Page - View and participate in assigned contests
import { useState, useEffect } from 'react';
import { Trophy, Clock, CheckCircle, AlertCircle, Calendar, Play } from 'lucide-react';
import { getCsrfToken } from '../../../lib/appUtils';

const StudentContestsPage = ({ onNavigateToContest }) => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStartModal, setShowStartModal] = useState(null);

  useEffect(() => {
    loadContests();
  }, []);

  async function loadContests() {
    try {
      setLoading(true);
      console.log('Loading contests from /api/student/contests/...');
      const res = await fetch('/api/student/contests/', { credentials: 'include' });
      
      console.log('Response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('Contests data:', data);
        setContests(data.contests || []);
      } else {
        const data = await res.json();
        console.error('Error response:', data);
        setError(data.detail || 'Failed to load contests');
      }
    } catch (err) {
      console.error('Exception loading contests:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartContest(contestId) {
    try {
      const res = await fetch(`/api/student/contests/${contestId}/start/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
      });

      if (res.ok) {
        setShowStartModal(null);
        // Reload contests to get updated participation status
        await loadContests();
        onNavigateToContest(contestId);
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to start contest');
      }
    } catch (err) {
      alert('Error starting contest: ' + err.message);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Loading contests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
        <p>{error}</p>
      </div>
    );
  }

  const activeContests = contests.filter(c => c.is_active && !c.is_ended);
  const upcomingContests = contests.filter(c => c.is_upcoming);
  const completedContests = contests.filter(c => c.is_ended);

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>My Contests</h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Participate in contests assigned to you
        </p>
      </div>

      {/* Active Contests */}
      {activeContests.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={20} style={{ color: '#f59e0b' }} />
            Active Contests
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeContests.map((contest) => (
              <ContestCard
                key={contest.id}
                contest={contest}
                onStart={() => setShowStartModal(contest.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Contests */}
      {upcomingContests.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={20} style={{ color: '#3b82f6' }} />
            Upcoming Contests
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {upcomingContests.map((contest) => (
              <ContestCard key={contest.id} contest={contest} isUpcoming />
            ))}
          </div>
        </div>
      )}

      {/* Completed Contests */}
      {completedContests.length > 0 && (
        <div>
          <h3 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={20} style={{ color: '#059669' }} />
            Completed Contests
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {completedContests.map((contest) => (
              <ContestCard key={contest.id} contest={contest} isCompleted />
            ))}
          </div>
        </div>
      )}

      {contests.length === 0 && (
        <div style={{
          padding: 60,
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
        }}>
          <Trophy size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
          <p style={{ color: '#666', margin: 0 }}>No contests assigned yet</p>
        </div>
      )}

      {/* Start Confirmation Modal */}
      {showStartModal && (
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
            padding: 24,
            maxWidth: 500,
            width: '90%',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Start Contest?</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>
              Once you start the contest, the timer will begin. You cannot pause or restart the contest.
              Make sure you have a stable internet connection and enough time to complete it.
            </p>
            <div style={{
              padding: 12,
              background: '#fef3c7',
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 13,
              color: '#92400e',
            }}>
              <AlertCircle size={16} style={{ display: 'inline', marginRight: 6 }} />
              This action cannot be undone. The contest will end automatically when time runs out.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStartModal(null)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleStartContest(showStartModal)}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#059669',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Start Contest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ContestCard({ contest, isUpcoming, isCompleted, onStart }) {
  const getStatusColor = () => {
    if (isCompleted) return '#059669';
    if (isUpcoming) return '#3b82f6';
    return '#f59e0b';
  };

  const getStatusText = () => {
    if (isCompleted) return 'Completed';
    if (isUpcoming) return 'Upcoming';
    if (contest.has_started) return 'In Progress';
    return 'Active';
  };

  return (
    <div style={{
      padding: 20,
      background: 'white',
      borderRadius: 12,
      border: `2px solid ${isCompleted ? '#d1fae5' : isUpcoming ? '#dbeafe' : '#fef3c7'}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: 18, marginBottom: 4 }}>{contest.title}</h4>
          {contest.description && (
            <p style={{ margin: '8px 0 0', fontSize: 14, color: '#666' }}>
              {contest.description}
            </p>
          )}
        </div>
        <span style={{
          padding: '4px 12px',
          borderRadius: 12,
          background: isCompleted ? '#d1fae5' : isUpcoming ? '#dbeafe' : '#fef3c7',
          color: getStatusColor(),
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}>
          {getStatusText()}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: 12,
        marginTop: 16,
        marginBottom: 16,
        padding: 12,
        background: '#f9fafb',
        borderRadius: 8,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Problems</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>
            {contest.problem_count}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Duration</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#d97706' }}>
            {contest.duration_minutes} min
          </div>
        </div>
        {contest.participation && (
          <>
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Solved</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>
                {contest.participation.problems_solved}/{contest.problem_count}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Score</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>
                {contest.participation.total_score}
              </div>
            </div>
          </>
        )}
      </div>

      {contest.start_time && (
        <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
          <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
          {isUpcoming ? 'Starts' : 'Started'}: {new Date(contest.start_time).toLocaleString()}
        </div>
      )}

      {!isUpcoming && !isCompleted && (
        <div>
          {contest.has_started ? (
            <div style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
                Contest Already Attempted
              </div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                You can only attempt each contest once
              </div>
            </div>
          ) : (
            <button
              onClick={onStart}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#059669',
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Play size={16} />
              Start Contest
            </button>
          )}
        </div>
      )}
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Play size={16} />
              Start Contest
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default StudentContestsPage;
