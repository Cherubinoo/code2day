// HOD Learn Sprint Approval Panel — mirrors ContestApprovalPanel's
// new-contest-approval half (Learn Sprints have no deletion-request
// workflow, see models.py LearnSprint docstring).
import { useState } from 'react';
import { CheckCircle, XCircle, Clock, CalendarClock } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const LearnSprintApprovalPanel = ({ sprints, onRefresh }) => {
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(null);
  const [busy, setBusy] = useState(false);

  const pending = sprints.filter((s) => s.status === 'pending_approval');

  async function postAction(sprintId, body, successMsg) {
    setBusy(true);
    try {
      const res = await fetch(`/api/learn-sprints/${sprintId}/approve/`, buildJsonPostOptions(body));
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(successMsg || data.detail || 'Done.');
        onRefresh && onRefresh();
        return true;
      }
      alert(data.detail || `Request failed (HTTP ${res.status})`);
      return false;
    } catch (err) {
      alert('Error: ' + err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove(sprintId) {
    await postAction(sprintId, { action: 'approve' }, '✅ Learn Sprint approved and published!');
  }
  async function handleReject(sprintId) {
    if (await postAction(sprintId, { action: 'reject', reason: rejectionReason }, '✅ Learn Sprint rejected.')) {
      setShowRejectModal(null);
      setRejectionReason('');
    }
  }

  if (pending.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }}>
        <Clock size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
        <p style={{ color: '#666', margin: 0 }}>No Learn Sprints pending approval</p>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <CalendarClock size={16} /> Learn Sprints Pending Approval ({pending.length})
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pending.map((sprint) => (
          <div key={sprint.id} style={{ padding: 20, background: 'white', borderRadius: 12, border: '2px solid #fef3c7', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: 18, marginBottom: 4 }}>{sprint.title}</h4>
                <p style={{ margin: 0, fontSize: 13, color: '#666' }}>
                  Created by {sprint.created_by?.name || 'Faculty'}
                  {sprint.submitted_for_approval_at ? ` on ${new Date(sprint.submitted_for_approval_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 12, background: '#fef3c7', color: '#d97706', fontSize: 12, fontWeight: 600 }}>
                Pending Approval
              </span>
            </div>

            {sprint.description && (
              <p style={{ margin: '12px 0', fontSize: 14, color: '#374151' }}>{sprint.description}</p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16, marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Batch</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                  {sprint.batch}{sprint.section ? ` / ${sprint.section}` : ' (full batch)'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Days</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#4f46e5' }}>{sprint.day_count}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Sections</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#059669', textTransform: 'capitalize' }}>
                  {sprint.sections.join(', ')}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Daily Window</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#d97706' }}>
                  {sprint.daily_start_time} – {sprint.daily_end_time}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button disabled={busy} onClick={() => handleApprove(sprint.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#059669', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CheckCircle size={16} /> Approve & Publish
              </button>
              <button disabled={busy} onClick={() => setShowRejectModal(sprint.id)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid #dc2626', background: 'white', color: '#dc2626', cursor: 'pointer', fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <XCircle size={16} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      {showRejectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 24, maxWidth: 500, width: '90%' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Reject Learn Sprint</h3>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>Please provide a reason for rejecting this Learn Sprint:</p>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter rejection reason..." rows={4}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowRejectModal(null); setRejectionReason(''); }} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={() => handleReject(showRejectModal)} disabled={!rejectionReason.trim() || busy}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: !rejectionReason.trim() ? '#d1d5db' : '#dc2626', color: 'white', cursor: !rejectionReason.trim() ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}>
                Reject Learn Sprint
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearnSprintApprovalPanel;
