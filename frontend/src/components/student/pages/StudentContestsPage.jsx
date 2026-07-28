// Student Contests Page - View and participate in assigned contests
import { useState, useEffect } from 'react';
import { Trophy, Clock, CheckCircle, AlertCircle, Calendar, Play, Award, Users, Target } from 'lucide-react';
import { getCsrfToken } from '../../../lib/appUtils';
import AnimatedNumber from '../../common/AnimatedNumber';

const StudentContestsPage = ({ onNavigateToContest, autoOpenContestId, onResetAutoOpen }) => {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStartModal, setShowStartModal] = useState(null);
  const [showWinnerModal, setShowWinnerModal] = useState(null);
  const [winnerData, setWinnerData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('active');
  const [selectedType, setSelectedType] = useState('all'); // 'all', 'programming', 'aptitude'

  useEffect(() => {
    loadContests();
  }, []);

  useEffect(() => {
    if (autoOpenContestId && contests.length > 0) {
      const contest = contests.find(c => c.id === autoOpenContestId);
      if (contest) {
        if (contest.is_active && !contest.is_ended) {
          // If active, navigate to workspace
          console.log('Auto-navigating to active contest:', autoOpenContestId);
          onNavigateToContest(autoOpenContestId);
          onResetAutoOpen();
        } else if (contest.is_ended) {
          // If completed, show winners modal
          console.log('Auto-opening winners for completed contest:', autoOpenContestId);
          handleViewWinners(autoOpenContestId);
          onResetAutoOpen();
        } else if (contest.is_upcoming) {
          // If upcoming, switch to upcoming tab and do nothing else
          console.log('Switching to upcoming tab for contest:', autoOpenContestId);
          setSelectedCategory('upcoming');
          onResetAutoOpen();
        }
      }
    }
  }, [autoOpenContestId, contests, onNavigateToContest, onResetAutoOpen]);

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

  async function handleViewWinners(contestId) {
    try {
      const res = await fetch(`/api/student/contests/${contestId}/winners/`, {
        credentials: 'include'
      });
      
      if (res.ok) {
        const data = await res.json();
        setWinnerData(data);
        setShowWinnerModal(contestId);
      } else {
        alert('Failed to load contest results');
      }
    } catch (err) {
      alert('Error loading contest results: ' + err.message);
    }
  }

  async function handleStartContest(contestId) {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch {}

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
        loadContests();
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

  const filteredByType = contests.filter(c => 
    selectedType === 'all' || c.contest_type === selectedType
  );

  const activeContests = filteredByType.filter(c => c.is_active && !c.is_ended && !(c.has_started && c.participation && !c.participation.is_active));
  const upcomingContests = filteredByType.filter(c => c.is_upcoming);
  const completedContests = filteredByType.filter(c => c.is_ended || (c.has_started && c.participation && !c.participation.is_active));

  console.log('Contest categories:', {
    total: contests.length,
    active: activeContests.length,
    upcoming: upcomingContests.length,
    completed: completedContests.length,
    contests: contests.map(c => ({
      id: c.id,
      title: c.title,
      is_active: c.is_active,
      is_upcoming: c.is_upcoming,
      is_ended: c.is_ended,
      start_time: c.start_time,
      end_time: c.end_time
    }))
  });

  // Debug: Show raw contest data
  console.log('Raw contests data:', contests);

  return (
    <div style={{ padding: '20px 0' }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 24 }}>My Contests</h2>
        <p style={{ margin: 0, color: '#666', fontSize: 14 }}>
          Participate in contests assigned to you
        </p>
      </div>

      {/* Category Tabs */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          marginBottom: 24,
          padding: '8px',
          background: '#f8fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}>
          <CategoryTab
            label="Active"
            count={activeContests.length}
            active={selectedCategory === 'active'}
            onClick={() => setSelectedCategory('active')}
          />
          <CategoryTab
            label="Upcoming"
            count={upcomingContests.length}
            active={selectedCategory === 'upcoming'}
            onClick={() => setSelectedCategory('upcoming')}
          />
          <CategoryTab
            label="Completed"
            count={completedContests.length}
            active={selectedCategory === 'completed'}
            onClick={() => setSelectedCategory('completed')}
          />
        </div>

        {/* Type Filter Toggles */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          marginBottom: 20,
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setSelectedType('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid #e2e8f0',
              background: selectedType === 'all' ? '#334155' : 'white',
              color: selectedType === 'all' ? 'white' : '#64748b',
            }}
          >
            All Types
          </button>
          <button
            onClick={() => setSelectedType('programming')}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `2px solid ${selectedType === 'programming' ? '#2563eb' : '#dbeafe'}`,
              background: selectedType === 'programming' ? '#2563eb' : 'white',
              color: selectedType === 'programming' ? 'white' : '#2563eb',
              transition: 'all 0.2s',
              boxShadow: selectedType === 'programming' ? '0 4px 12px rgba(37, 99, 235, 0.25)' : 'none',
            }}
          >
            Coding Contests
          </button>
          <button
            onClick={() => setSelectedType('aptitude')}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              border: `2px solid ${selectedType === 'aptitude' ? '#9333ea' : '#f3e8ff'}`,
              background: selectedType === 'aptitude' ? '#9333ea' : 'white',
              color: selectedType === 'aptitude' ? 'white' : '#9333ea',
              transition: 'all 0.2s',
              boxShadow: selectedType === 'aptitude' ? '0 4px 12px rgba(147, 51, 234, 0.25)' : 'none',
            }}
          >
            Aptitude Contests
          </button>
        </div>

        {/* Active Contests */}
        {selectedCategory === 'active' && (
          <div>
            {activeContests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {activeContests.map((contest) => (
                  <ContestCard
                    key={contest.id}
                    contest={contest}
                    onStart={() => setShowStartModal(contest.id)}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: '#fef3c7',
                borderRadius: 12,
                border: '1px solid #f59e0b',
                color: '#92400e'
              }}>
                <Trophy size={48} style={{ color: '#f59e0b', marginBottom: 16 }} />
                <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>No active contests at the moment</p>
              </div>
            )}
          </div>
        )}

        {/* Upcoming Contests */}
        {selectedCategory === 'upcoming' && (
          <div>
            {upcomingContests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {upcomingContests.map((contest) => (
                  <ContestCard key={contest.id} contest={contest} isUpcoming />
                ))}
              </div>
            ) : (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: '#dbeafe',
                borderRadius: 12,
                border: '1px solid #3b82f6',
                color: '#1e40af'
              }}>
                <Calendar size={48} style={{ color: '#3b82f6', marginBottom: 16 }} />
                <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>No upcoming contests scheduled</p>
              </div>
            )}
          </div>
        )}

        {/* Completed Contests */}
        {selectedCategory === 'completed' && (
          <div>
            {completedContests.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                gap: 16 
              }}>
                {completedContests.map((contest) => (
                  <CompletedContestCard 
                    key={contest.id} 
                    contest={contest} 
                    onViewWinners={() => handleViewWinners(contest.id)}
                  />
                ))}
              </div>
            ) : (
              <div style={{
                padding: 40,
                textAlign: 'center',
                background: '#d1fae5',
                borderRadius: 12,
                border: '1px solid #059669',
                color: '#065f46'
              }}>
                <CheckCircle size={48} style={{ color: '#059669', marginBottom: 16 }} />
                <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>No completed contests yet</p>
              </div>
            )}
          </div>
        )}
      </div>

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

      {/* Winner Results Modal */}
      {showWinnerModal && winnerData && (
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
            maxWidth: 600,
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trophy style={{ color: '#f59e0b' }} size={24} />
                Contest Results
              </h3>
              <button
                onClick={() => setShowWinnerModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: '#666',
                }}
              >
                ×
              </button>
            </div>

            {/* Winners Section */}
            {winnerData.winners && winnerData.winners.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Award size={18} style={{ color: '#f59e0b' }} />
                  Winners
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {winnerData.winners.map((winner, index) => (
                    <div key={winner.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      background: index === 0 ? '#fef3c7' : index === 1 ? '#f3f4f6' : '#fafafa',
                      borderRadius: 8,
                      border: `1px solid ${index === 0 ? '#f59e0b' : '#e5e7eb'}`,
                    }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: index === 0 ? '#f59e0b' : index === 1 ? '#6b7280' : '#9ca3af',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: 14,
                      }}>
                        {index + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{winner.student_name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {winner.problems_solved}/{winnerData.total_problems} problems • {winner.total_score} points
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Participants */}
            {winnerData.participants && winnerData.participants.length > 0 && (
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={18} style={{ color: '#3b82f6' }} />
                  All Participants ({winnerData.participants.length})
                </h4>
                <div style={{ 
                  maxHeight: 300, 
                  overflow: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}>
                  {winnerData.participants.map((participant, index) => (
                    <div key={participant.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderBottom: index < winnerData.participants.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: '#f3f4f6',
                        color: '#666',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 500,
                      }}>
                        {index + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>{participant.student_name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {participant.problems_solved}/{winnerData.total_problems} problems • {participant.total_score} points
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {participant.completion_time ? `${Math.round(participant.completion_time / 60)}min` : 'DNF'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function CategoryTab({ label, count, active, onClick }) {
  return (
    <div 
      onClick={onClick}
      style={{
        padding: '10px 16px',
        borderRadius: '6px',
        background: active ? '#4f46e5' : '#f8fafc',
        color: active ? 'white' : '#475569',
        border: `1px solid ${active ? '#4f46e5' : '#cbd5e1'}`,
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        userSelect: 'none',
        boxShadow: active ? '0 2px 4px rgba(79, 70, 229, 0.2)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.background = '#e2e8f0';
          e.target.style.transform = 'translateY(-1px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.background = '#f8fafc';
          e.target.style.transform = 'translateY(0)';
        }
      }}
    >
      <span>{label}</span>
      <span style={{
        background: active ? 'rgba(255,255,255,0.25)' : '#cbd5e1',
        color: active ? 'white' : '#475569',
        padding: '2px 6px',
        borderRadius: '10px',
        fontSize: '12px',
        fontWeight: 700,
        minWidth: '18px',
        textAlign: 'center',
        lineHeight: '1.2',
      }}>
        {count}
      </span>
    </div>
  );
}

function CompletedContestCard({ contest, onViewWinners }) {
  return (
    <div 
      onClick={onViewWinners}
      style={{
        padding: 16,
        background: contest.contest_type === 'aptitude' ? '#fafaff' : '#f8faff',
        borderRadius: 8,
        border: '1px solid #e2e8f0',
        borderLeft: `5px solid ${contest.contest_type === 'aptitude' ? '#9333ea' : '#2563eb'}`,
        boxShadow: `0 4px 12px ${contest.contest_type === 'aptitude' ? 'rgba(147, 51, 234, 0.08)' : 'rgba(37, 99, 235, 0.08)'}`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
        e.target.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        e.target.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{contest.title}</h4>
          <div style={{
            display: 'inline-flex',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            width: 'fit-content',
            background: contest.contest_type === 'aptitude' ? '#f3e8ff' : '#dbeafe',
            color: contest.contest_type === 'aptitude' ? '#9333ea' : '#2563eb',
          }}>
            {contest.contest_type === 'aptitude' ? 'Aptitude' : 'Coding'}
          </div>
        </div>
        <span style={{
          padding: '2px 8px',
          borderRadius: 12,
          background: '#d1fae5',
          color: '#059669',
          fontSize: 10,
          fontWeight: 600,
        }}>
          Completed
        </span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#666' }}>
          <Target size={12} style={{ display: 'inline', marginRight: 4 }} />
          {contest.contest_type === 'aptitude' ? contest.aptitude_question_count : contest.problem_count} {contest.contest_type === 'aptitude' ? 'questions' : 'problems'}
        </div>
        <div style={{ fontSize: 11, color: '#666' }}>
          <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
          {contest.session_duration_minutes || contest.duration_minutes}min session
        </div>
      </div>

      {contest.participation ? (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          padding: 8,
          background: '#f9fafb',
          borderRadius: 4,
          marginBottom: 8,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>
              <AnimatedNumber value={contest.participation.problems_solved || 0} duration={0.8} />
            </div>
            <div style={{ fontSize: 10, color: '#666' }}>Solved</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#dc2626' }}>
              <AnimatedNumber value={contest.participation.total_score || 0} duration={0.8} />
            </div>
            <div style={{ fontSize: 10, color: '#666' }}>Score</div>
          </div>
        </div>
      ) : (
        <div style={{ 
          padding: 10,
          background: '#fee2e2',
          borderRadius: 4,
          marginBottom: 8,
          textAlign: 'center',
          color: '#dc2626',
          fontSize: 12,
          fontWeight: 600,
        }}>
          Not Attempted
        </div>
      )}

      <div style={{ 
        fontSize: 11, 
        color: '#3b82f6', 
        textAlign: 'center',
        fontWeight: 500,
      }}>
        Click to view results
      </div>
    </div>
  );
}

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
      background: contest.contest_type === 'aptitude' ? '#fafaff' : '#f8faff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      borderLeft: `8px solid ${contest.contest_type === 'aptitude' ? '#9333ea' : '#2563eb'}`,
      boxShadow: `0 10px 25px -5px ${contest.contest_type === 'aptitude' ? 'rgba(147, 51, 234, 0.12)' : 'rgba(37, 99, 235, 0.12)'}`,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h4 style={{ margin: 0, fontSize: 18 }}>{contest.title}</h4>
            <div style={{
              padding: '2px 8px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              background: contest.contest_type === 'aptitude' ? '#f3e8ff' : '#dbeafe',
              color: contest.contest_type === 'aptitude' ? '#9333ea' : '#2563eb',
            }}>
              {contest.contest_type === 'aptitude' ? 'Aptitude' : 'Coding'}
            </div>
          </div>
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
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
            {contest.contest_type === 'aptitude' ? 'Questions' : 'Problems'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>
            <AnimatedNumber value={contest.contest_type === 'aptitude' ? contest.aptitude_question_count : contest.problem_count} duration={0.8} />
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Session Duration</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#d97706' }}>
            <AnimatedNumber value={contest.session_duration_minutes || contest.duration_minutes || 0} duration={0.8} /> min
          </div>
        </div>
        {contest.participation && (
          <>
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Solved</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>
                <AnimatedNumber value={contest.participation.problems_solved || 0} duration={0.8} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Score</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#dc2626' }}>
                <AnimatedNumber value={contest.participation.total_score || 0} duration={0.8} />
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
    </div>
  );
}

export default StudentContestsPage;
