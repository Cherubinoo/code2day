// Staff monitor for one Learn Sprint — every scheduled day, its allocated
// question counts, and (once published) a live per-day leaderboard by
// calling the *existing* ContestAnalyticsView for that day's auto-generated
// contest — no new analytics endpoint needed, and unlike the student view
// this is never gated on the day (or sprint) having ended.
import { useState, useEffect } from 'react';
import { X, Lock, Unlock, CheckCircle2, Trophy, Medal, Send, Download } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

async function downloadReport(url, filename, setBusy) {
  setBusy && setBusy(true);
  try {
    const res = await fetch(url, buildJsonPostOptions({}));
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || err.detail || 'Failed to generate report.');
      return;
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    alert(`Report error: ${err.message}`);
  } finally {
    setBusy && setBusy(false);
  }
}

const STATE_META = {
  locked: { label: 'Locked', icon: Lock, color: '#94a3b8' },
  open: { label: 'Open now', icon: Unlock, color: '#16a34a' },
  completed: { label: 'Completed', icon: CheckCircle2, color: '#2563eb' },
};

function DayAnalytics({ contestId, dayNumber }) {
  const [analytics, setAnalytics] = useState(null);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/contests/${contestId}/analytics/`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled) setAnalytics(data); });
    return () => { cancelled = true; };
  }, [contestId]);

  if (!analytics) return <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading live standings…</p>;

  const top3 = analytics.top_performers.slice(0, 3);
  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#475569' }}><b>{analytics.summary.total_participants}</b> participants</div>
        <div style={{ fontSize: 13, color: '#475569' }}><b>{analytics.summary.total_submissions}</b> submissions</div>
        <button
          onClick={() => downloadReport(`/api/contests/${contestId}/report/`, `learn_sprint_day${dayNumber}_report.pdf`, setDownloading)}
          disabled={downloading}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          <Download size={13} /> {downloading ? 'Generating…' : 'Download Day Report'}
        </button>
      </div>

      {top3.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {top3.map((p, i) => (
            <div key={p.register_number} style={{ padding: '10px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', textAlign: 'center', minWidth: 120 }}>
              <div style={{ fontSize: 22 }}>{MEDALS[i]}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.register_number}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>{p.score} pts</div>
            </div>
          ))}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>
            <th style={{ padding: '6px 8px' }}>#</th>
            <th style={{ padding: '6px 8px' }}>Student</th>
            <th style={{ padding: '6px 8px' }}>Solved</th>
            <th style={{ padding: '6px 8px' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {analytics.participants.map((p, i) => (
            <tr key={p.register_number} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 8px' }}>{i + 1}</td>
              <td style={{ padding: '6px 8px' }}>{p.name} <span style={{ color: '#94a3b8' }}>({p.register_number})</span></td>
              <td style={{ padding: '6px 8px' }}>{p.problems_solved}</td>
              <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.score}</td>
            </tr>
          ))}
          {analytics.participants.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>No participants yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function LearnSprintMonitor({ sprintId, onClose }) {
  const [sprint, setSprint] = useState(null);
  const [activeDay, setActiveDay] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingOverall, setDownloadingOverall] = useState(false);

  function load() {
    fetch(`/api/learn-sprints/${sprintId}/`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setSprint(data);
        if (data.days && data.days.length && activeDay === null) setActiveDay(data.days[0].id);
      });
  }
  useEffect(() => { load(); }, [sprintId]);

  async function submitForApproval() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/learn-sprints/${sprintId}/submit-for-approval/`, buildJsonPostOptions({}));
      const data = await res.json();
      if (!res.ok) { alert(data.detail || 'Failed to submit.'); return; }
      load();
    } finally {
      setSubmitting(false);
    }
  }

  if (!sprint) return null;
  const day = (sprint.days || []).find((d) => d.id === activeDay);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{sprint.title}</h2>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {sprint.batch}{sprint.section ? ` / ${sprint.section}` : ' (full batch)'} · Status: <b>{sprint.status}</b>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {sprint.status === 'completed' && (
              <button
                onClick={() => downloadReport(`/api/learn-sprints/${sprintId}/report/`, `learn_sprint_${sprintId}_overall_report.pdf`, setDownloadingOverall)}
                disabled={downloadingOverall}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#d97706', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                <Download size={14} /> {downloadingOverall ? 'Generating…' : 'Download Overall Report'}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
          </div>
        </div>

        {sprint.status === 'rejected' && sprint.rejection_reason && (
          <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>
            Rejected: {sprint.rejection_reason}
          </div>
        )}
        {(sprint.status === 'draft' || sprint.status === 'rejected') && (
          <button onClick={submitForApproval} disabled={submitting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            <Send size={14} /> Submit for HOD Approval
          </button>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {(sprint.days || []).map((d) => {
            const meta = STATE_META[d.state] || STATE_META.locked;
            const Icon = meta.icon;
            const active = d.id === activeDay;
            return (
              <button key={d.id} onClick={() => setActiveDay(d.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                  border: active ? '2px solid #2563eb' : '1px solid #d1d5db',
                  background: active ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}>
                <Icon size={14} style={{ color: meta.color }} /> Day {d.day_number} · {d.date}
              </button>
            );
          })}
        </div>

        {day && (
          <div style={{ padding: 16, borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
              <span>{day.problem_count} programming problem(s)</span>
              <span>{day.aptitude_question_count} aptitude/reading question(s)</span>
              <span>{day.manual_question_count} manual question(s)</span>
            </div>
            {day.contest_id ? (
              <DayAnalytics contestId={day.contest_id} dayNumber={day.day_number} />
            ) : (
              <p style={{ fontSize: 13, color: '#94a3b8' }}>This day goes live once the sprint is approved and published.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
