// Contest Dashboard Widget - Shows upcoming, active, and completed contests
import { useState, useEffect } from 'react';
import { Trophy, Clock, Calendar, CheckCircle, Play, TrendingUp, Award, Target } from 'lucide-react';

const ContestDashboardWidget = ({ onNavigateToContest }) => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState('active'); // active, upcoming, completed

  useEffect(() => {
    loadContests();
  }, []);

  async function loadContests() {
    try {
      setLoading(true);
      const res = await fetch('/api/student/contests/', { credentials: 'include' });
      
      if (res.ok) {
        const data = await res.json();
        setContests(data.contests || []);
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to load contests');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
        <p>Loading contests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#dc2626' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <p>{error}</p>
      </div>
    );
  }

  const activeContests = contests.filter(c => c.is_active && !c.is_ended);
  const upcomingContests = contests.filter(c => c.is_upcoming);
  const completedContests = contests.filter(c => c.is_ended);

  // Calculate stats
  const totalContests = contests.length;
  const totalParticipated = contests.filter(c => c.has_started).length;
  const totalCompleted = completedContests.filter(c => c.has_started).length;
  const totalProblemsAttempted = contests.reduce((sum, c) => {
    return sum + (c.participation?.problems_solved || 0);
  }, 0);

  const getTabContests = () => {
    switch (selectedTab) {
      case 'active':
        return activeContests;
      case 'upcoming':
        return upcomingContests;
      case 'completed':
        return completedContests;
      default:
        return activeContests;
    }
  };

  const tabContests = getTabContests();

  if (totalContests === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏆</div>
        <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No contests assigned yet</p>
        <p style={{ fontSize: '0.875rem' }}>Check back later for upcoming contests</p>
      </div>
    );
  }

  return (
    <div>
      {/* Contest Stats Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem',
      }}>
        <div style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '12px',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Trophy size={24} />
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Total Contests</span>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{totalContests}</div>
        </div>

        <div style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          borderRadius: '12px',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Play size={24} />
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Participated</span>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{totalParticipated}</div>
        </div>

        <div style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          borderRadius: '12px',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <CheckCircle size={24} />
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Completed</span>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{totalCompleted}</div>
        </div>

        <div style={{
          padding: '1.25rem',
          background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
          borderRadius: '12px',
          color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Target size={24} />
            <span style={{ fontSize: '0.875rem', opacity: 0.9 }}>Problems Solved</span>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>{totalProblemsAttempted}</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1.5rem',
        borderBottom: '2px solid var(--bg-2)',
        paddingBottom: '0.5rem',
      }}>
        <button
          onClick={() => setSelectedTab('active')}
          style={{
            padding: '0.5rem 1rem',
            background: selectedTab === 'active' ? 'var(--accent)' : 'transparent',
            color: selectedTab === 'active' ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          <Play size={16} />
          Active ({activeContests.length})
        </button>
        <button
          onClick={() => setSelectedTab('upcoming')}
          style={{
            padding: '0.5rem 1rem',
            background: selectedTab === 'upcoming' ? 'var(--accent)' : 'transparent',
            color: selectedTab === 'upcoming' ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          <Calendar size={16} />
          Upcoming ({upcomingContests.length})
        </button>
        <button
          onClick={() => setSelectedTab('completed')}
          style={{
            padding: '0.5rem 1rem',
            background: selectedTab === 'completed' ? 'var(--accent)' : 'transparent',
            color: selectedTab === 'completed' ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s',
          }}
        >
          <CheckCircle size={16} />
          Completed ({completedContests.length})
        </button>
      </div>

      {/* Contest List */}
      {tabContests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>
            {selectedTab === 'active' && '🎯'}
            {selectedTab === 'upcoming' && '📅'}
            {selectedTab === 'completed' && '✅'}
          </div>
          <p>No {selectedTab} contests</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tabContests.map((contest) => (
            <ContestCard
              key={contest.id}
              contest={contest}
              onNavigate={onNavigateToContest}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Contest Card Component
const ContestCard = ({ contest, onNavigate }) => {
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = () => {
    if (contest.is_active && !contest.is_ended) {
      return { text: 'Active Now', color: '#22c55e', bg: '#dcfce7' };
    }
    if (contest.is_upcoming) {
      return { text: 'Upcoming', color: '#3b82f6', bg: '#dbeafe' };
    }
    if (contest.is_ended) {
      return { text: 'Completed', color: '#6b7280', bg: '#f3f4f6' };
    }
    return { text: 'Unknown', color: '#9ca3af', bg: '#f9fafb' };
  };

  const status = getStatusBadge();
  const hasParticipated = contest.has_started;
  const participation = contest.participation;

  return (
    <div
      style={{
        padding: '1.5rem',
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        transition: 'all 0.2s',
        cursor: 'pointer',
      }}
      onClick={() => onNavigate && onNavigate(contest.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <Trophy size={20} style={{ color: 'var(--accent)' }} />
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{contest.title}</h3>
          </div>
          {contest.description && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {contest.description}
            </p>
          )}
        </div>
        <span
          style={{
            padding: '0.25rem 0.75rem',
            background: status.bg,
            color: status.color,
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {status.text}
        </span>
      </div>

      {/* Contest Info */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Start Time</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{formatDate(contest.start_time)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Duration</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{contest.duration_minutes} min</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Target size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Problems</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{contest.problem_count}</div>
          </div>
        </div>
      </div>

      {/* Participation Info */}
      {hasParticipated && participation && (
        <div style={{
          padding: '1rem',
          background: 'var(--bg-2)',
          borderRadius: '8px',
          marginTop: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Your Progress
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                    {participation.problems_solved}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    /{contest.problem_count} solved
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                    {participation.total_score}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}> points</span>
                </div>
              </div>
            </div>
            {participation.is_active && (
              <span style={{
                padding: '0.5rem 1rem',
                background: '#22c55e',
                color: 'white',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}>
                In Progress
              </span>
            )}
          </div>
          
          {/* Progress Bar */}
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{
              height: '8px',
              background: 'var(--bg-1)',
              borderRadius: '4px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${(participation.problems_solved / contest.problem_count) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--accent), #667eea)',
                borderRadius: '4px',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!hasParticipated && contest.is_active && (
        <div style={{ marginTop: '1rem' }}>
          <button
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#5a67d8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
            }}
          >
            <Play size={16} />
            Start Contest
          </button>
        </div>
      )}
    </div>
  );
};

export default ContestDashboardWidget;
