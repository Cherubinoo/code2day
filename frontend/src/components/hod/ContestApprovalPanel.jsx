// HOD Contest Approval Panel
import { useState } from 'react';
import { CheckCircle, XCircle, Eye, Clock, Users } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const ContestApprovalPanel = ({ contests, onApprove, onReject, onRefresh, onView }) => {
  const [selectedContest, setSelectedContest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(null);

  const pendingContests = contests.filter(c => c.status === 'pending_approval');

  async function handleApprove(contestId) {
    try {
      const res = await fetch(`/api/contests/${contestId}/approve/`, 
        buildJsonPostOptions({ action: 'approve' })
      );

      if (res.ok) {
        alert('✅ Contest approved successfully!');
        onApprove && onApprove(contestId);
        onRefresh && onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || data.message || data.error || `Failed to approve contest (HTTP ${res.status})`);
      }
    } catch (err) {
      alert('Error approving contest: ' + err.message);
    }
  }

  async function handleReject(contestId) {
    try {
      const res = await fetch(`/api/contests/${contestId}/approve/`, 
        buildJsonPostOptions({ action: 'reject', reason: rejectionReason })
      );

      if (res.ok) {
        alert('✅ Contest rejected successfully!');
        onReject && onReject(contestId);
        setShowRejectModal(null);
        setRejectionReason('');
        onRefresh && onRefresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || data.message || data.error || `Failed to reject contest (HTTP ${res.status})`);
      }
    } catch (err) {
      alert('Error rejecting contest: ' + err.message);
    }
  }

  if (pendingContests.length === 0) {
    return (
      <div style={{
        padding: 40,
        textAlign: 'center',
        background: '#f9fafb',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
      }}>
        <Clock size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
        <p style={{ color: '#666', margin: 0 }}>No contests pending approval</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          Contests Pending Approval ({pendingContests.length})
        </h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pendingContests.map((contest) => (
          <div
            key={contest.id}
            style={{
              padding: 20,
              background: 'white',
              borderRadius: 12,
              border: '2px solid #fef3c7',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 18, marginBottom: 4 }}>{contest.title}</h4>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Created by {contest.created_by.name} on {new Date(contest.created_at).toLocaleDateString()}
                </p>
              </div>
              <span style={{
                padding: '4px 12px',
                borderRadius: 12,
                background: '#fef3c7',
                color: '#d97706',
                fontSize: 12,
                fontWeight: 600,
              }}>
                Pending Approval
              </span>
            </div>

            {contest.description && (
              <p style={{ margin: '12px 0', fontSize: 14, color: '#374151' }}>
                {contest.description}
              </p>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginTop: 16,
              marginBottom: 16,
              padding: 12,
              background: '#f9fafb',
              borderRadius: 8,
            }}>
              {contest.contest_type === 'combined' ? (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Problems</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>{contest.problem_count}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Questions</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>{contest.aptitude_question_count}</div>
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                    {contest.contest_type === 'aptitude' ? 'Questions' : 'Problems'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>
                    {contest.contest_type === 'aptitude' ? contest.aptitude_question_count : contest.problem_count}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Students</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>
                  {contest.assigned_student_count}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Duration</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#d97706' }}>
                  {contest.duration_minutes} min
                </div>
              </div>
              {contest.start_time && (
                <div>
                  <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Start Time</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                    {new Date(contest.start_time).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => onView(contest.id)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  background: 'white',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Eye size={16} />
                View Details
              </button>
              <button
                onClick={() => handleApprove(contest.id)}
                style={{
                  flex: 1,
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
                <CheckCircle size={16} />
                Approve Contest
              </button>
              <button
                onClick={() => setShowRejectModal(contest.id)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid #dc2626',
                  background: 'white',
                  color: '#dc2626',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <XCircle size={16} />
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
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
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Reject Contest</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>
              Please provide a reason for rejecting this contest:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                }}
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
                onClick={() => handleReject(showRejectModal)}
                disabled={!rejectionReason.trim()}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: !rejectionReason.trim() ? '#d1d5db' : '#dc2626',
                  color: 'white',
                  cursor: !rejectionReason.trim() ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                Reject Contest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContestApprovalPanel;
