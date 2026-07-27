// Contest Detail Modal - View contest analytics and student submissions
import React, { useState, useEffect } from 'react';
import { X, Trophy, Users, Clock, CheckCircle, XCircle, Eye, Code, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

const ContestDetailModal = ({ contestId, onClose }) => {
  const [contest, setContest] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadingStudentReport, setDownloadingStudentReport] = useState({});
  const [unlockingStudent, setUnlockingStudent] = useState({});
  const [unlockingAll, setUnlockingAll] = useState(false);
  const [activeTab, setActiveTab] = useState('submissions'); // 'submissions' | 'unblock' | 'questions'
  const [unblockSearch, setUnblockSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');

  useEffect(() => {
    loadContestData();
  }, [contestId]);

  async function handleUnlockStudent(participant) {
    const regNo = participant.register_number;
    setUnlockingStudent(prev => ({ ...prev, [regNo]: true }));
    try {
      const res = await fetch(`/api/contests/${contestId}/student/${regNo}/unlock/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
      });
      if (res.ok) {
        alert(`✅ Student ${participant.name} (${regNo}) has been unlocked successfully! Their workspace is now re-activated.`);
        loadContestData();
      } else {
        const err = await res.json();
        alert(err.detail || 'Failed to unlock student');
      }
    } catch (err) {
      alert(`Unlock error: ${err.message}`);
    } finally {
      setUnlockingStudent(prev => ({ ...prev, [regNo]: false }));
    }
  }

  async function handleUnlockAllStudents() {
    const allParticipants = analytics?.participants || [];
    if (allParticipants.length === 0) return;
    if (!window.confirm("Are you sure you want to unlock ALL participating students? Their contest sessions will be re-activated.")) return;

    setUnlockingAll(true);
    try {
      let count = 0;
      for (const p of allParticipants) {
        const res = await fetch(`/api/contests/${contestId}/student/${p.register_number}/unlock/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        });
        if (res.ok) count++;
      }
      alert(`✅ Successfully unlocked ${count} student(s)!`);
      loadContestData();
    } catch (err) {
      alert(`Unlock all error: ${err.message}`);
    } finally {
      setUnlockingAll(false);
    }
  }

  async function loadContestData() {
    setLoading(true);
    setError(null);
    try {
      const detailRes = await fetch(`/api/contests/${contestId}/`, { credentials: 'include' });
      if (detailRes.ok) {
        setContest(await detailRes.json());
      } else {
        throw new Error('Failed to load contest details');
      }
      const analyticsRes = await fetch(`/api/contests/${contestId}/analytics/`, { credentials: 'include' });
      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentClick(student) {
    // Toggle — clicking the same student again collapses the panel
    if (selectedStudent?.register_number === student.register_number) {
      setSelectedStudent(null);
      setStudentSubmissions([]);
      return;
    }
    setSelectedStudent(student);
    setSubmissionsLoading(true);
    setStudentSubmissions([]);
    try {
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

  async function handleDownloadReport() {
    setDownloadingReport(true);
    try {
      const res = await fetch(`/api/contests/${contestId}/report/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to generate report');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contest_report_${contestId}_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Report error: ${err.message}`);
    } finally {
      setDownloadingReport(false);
    }
  }

  async function handleDownloadStudentReport(participant) {
    const regNo = participant.register_number;
    setDownloadingStudentReport(prev => ({ ...prev, [regNo]: true }));
    try {
      const res = await fetch(`/api/contests/${contestId}/students/${regNo}/report/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to generate student report');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contest_report_${contestId}_${regNo}_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Report error: ${err.message}`);
    } finally {
      setDownloadingStudentReport(prev => ({ ...prev, [regNo]: false }));
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

  if (error || !contest) {
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
  const submittedParticipants = (analytics?.participants || []).filter(p => p.total_submissions > 0);
  const availableBatches = [...new Set(submittedParticipants.map(p => p.batch).filter(Boolean))].sort();
  const availableSections = [...new Set(
    submittedParticipants
      .filter(p => !batchFilter || p.batch === batchFilter)
      .map(p => p.section)
      .filter(Boolean)
  )].sort();
  const participantsWithSubmissions = submittedParticipants
    .filter(p => !batchFilter || p.batch === batchFilter)
    .filter(p => !sectionFilter || p.section === sectionFilter);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 16 }}>
            <button
              onClick={handleDownloadReport}
              disabled={downloadingReport}
              style={{
                padding: '9px 18px', borderRadius: 9, border: 'none',
                background: downloadingReport ? '#9ca3af' : '#2D6A4F',
                color: 'white', fontWeight: 700, fontSize: 13,
                cursor: downloadingReport ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <Download size={15} />
              {downloadingReport ? 'Generating...' : 'Download Report'}
            </button>
            <button onClick={onClose} style={{
              padding: 8, borderRadius: 6, border: 'none',
              background: '#f3f4f6', cursor: 'pointer',
            }}>
              <X size={20} />
            </button>
          </div>
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
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
              {contest.contest_type === 'aptitude' ? 'Total Questions' : 'Total Problems'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#4f46e5' }}>
              {contest.contest_type === 'aptitude' ? contest.aptitude_question_count : contest.problem_count}
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
              {submittedParticipants.length}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Total Submissions</div>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#d97706' }}>
              {analytics.summary?.total_submissions || 0}
            </div>
          </div>
          <div style={{ padding: 16, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Duration</div>
            <div style={{ fontSize: 20, fontWeight: 'bold', color: '#374151' }}>
              {contest.duration_minutes} min
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex', gap: 12, padding: '0 32px', background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <button
            onClick={() => setActiveTab('submissions')}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeTab === 'submissions' ? '3px solid #4f46e5' : '3px solid transparent',
              color: activeTab === 'submissions' ? '#4f46e5' : '#64748b',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            📊 Submissions & Results ({submittedParticipants.length})
          </button>
          <button
            onClick={() => setActiveTab('unblock')}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeTab === 'unblock' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'unblock' ? '#10b981' : '#64748b',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🔓 Unlock / Unblock Students ({analytics?.participants?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            style={{
              padding: '14px 20px', border: 'none', background: 'none',
              borderBottom: activeTab === 'questions' ? '3px solid #4f46e5' : '3px solid transparent',
              color: activeTab === 'questions' ? '#4f46e5' : '#64748b',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            📝 Contest {contest.contest_type === 'aptitude' ? 'Questions' : 'Problems'}
          </button>
        </div>

        {/* Tab 1: Contest Questions */}
        {activeTab === 'questions' && (
          <div style={{ padding: '24px 32px', borderBottom: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>
              Contest {contest.contest_type === 'aptitude' ? 'Questions' : 'Problems'}
            </h3>
            <div style={{ display: 'grid', gap: 12 }}>
              {(contest.problems || []).map((item, idx) => (
                <div key={idx} style={{
                  padding: 16,
                  background: '#f9fafb',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                      {contest.contest_type === 'aptitude' ? `Question ${idx + 1}` : `Problem ${idx + 1}`}
                    </div>
                    <div style={{ fontWeight: 600 }}>
                      {contest.contest_type === 'aptitude' ? item.question_text : item.title}
                    </div>
                    {contest.contest_type === 'aptitude' && (
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                        Topic: {item.topic} • Difficulty: {item.difficulty}
                      </div>
                    )}
                  </div>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: item.difficulty === 'Easy' ? '#dcfce7' : item.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                    color: item.difficulty === 'Easy' ? '#166534' : item.difficulty === 'Medium' ? '#92400e' : '#991b1b',
                  }}>
                    {item.difficulty}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Unlock / Unblock Students */}
        {activeTab === 'unblock' && (
          <div style={{ padding: '24px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a', fontWeight: 800 }}>
                  🔓 Unlock & Re-activate Students
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Unlock blocked or locked students so they can continue their contest session without losing their work.
                </p>
              </div>
              <button
                onClick={handleUnlockAllStudents}
                disabled={unlockingAll || !analytics?.participants?.length}
                style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: unlockingAll ? '#9ca3af' : '#10b981', color: 'white',
                  fontWeight: 700, fontSize: 14, cursor: unlockingAll ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
                }}
              >
                🔓 {unlockingAll ? 'Unlocking All...' : 'Unlock ALL Students'}
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Search student by name or register number..."
                value={unblockSearch}
                onChange={(e) => setUnblockSearch(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
              />
            </div>

            {(!analytics?.participants || analytics.participants.length === 0) ? (
              <div style={{ padding: 40, textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <p style={{ color: '#64748b', margin: 0 }}>No participating students recorded for this contest yet.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                {analytics.participants
                  .filter(p => !unblockSearch || p.name.toLowerCase().includes(unblockSearch.toLowerCase()) || p.register_number.toLowerCase().includes(unblockSearch.toLowerCase()))
                  .map((participant) => {
                    const isLocked = participant.is_locked;
                    return (
                      <div key={participant.register_number} style={{
                        padding: '16px 20px',
                        background: isLocked ? '#fef2f2' : 'white',
                        borderRadius: 12,
                        border: isLocked ? '2px solid #f87171' : '1px solid #e2e8f0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{participant.name}</span>
                            {isLocked ? (
                              <span style={{ padding: '2px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 700 }}>
                                🔒 LOCKED ({participant.lock_reason || 'Security Violation Limit'})
                              </span>
                            ) : (
                              <span style={{ padding: '2px 8px', borderRadius: 6, background: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: 700 }}>
                                ✅ Active
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'monospace', marginTop: 4 }}>
                            Reg No: {participant.register_number} • Batch {participant.batch || '—'} ({participant.section || '—'})
                          </div>
                          <div style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600, marginTop: 4 }}>
                            Score: {participant.score || 0} • Solved: {participant.problems_solved || 0}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnlockStudent(participant)}
                          disabled={!!unlockingStudent[participant.register_number]}
                          style={{
                            padding: '10px 18px', borderRadius: 8,
                            border: isLocked ? 'none' : '1px solid #10b981',
                            background: isLocked ? '#dc2626' : unlockingStudent[participant.register_number] ? '#f3f4f6' : '#ecfdf5',
                            color: isLocked ? 'white' : '#047857',
                            fontWeight: 700, fontSize: 14,
                            cursor: unlockingStudent[participant.register_number] ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                            boxShadow: isLocked ? '0 4px 12px rgba(220,38,38,0.3)' : 'none'
                          }}
                        >
                          🔓 {unlockingStudent[participant.register_number] ? 'Unlocking...' : isLocked ? 'Unlock Student' : 'Re-authorize Student'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Student Submissions Table */}
        {activeTab === 'submissions' && analytics && (
          <>
            <div style={{ padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              Student Submissions ({participantsWithSubmissions.length})
            </h3>
            {(availableBatches.length > 0) && (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={batchFilter}
                  onChange={(e) => { setBatchFilter(e.target.value); setSectionFilter(''); }}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
                >
                  <option value="">All Batches</option>
                  {availableBatches.map(b => (
                    <option key={b} value={b}>Batch {b}</option>
                  ))}
                </select>
                <select
                  value={sectionFilter}
                  onChange={(e) => setSectionFilter(e.target.value)}
                  disabled={availableSections.length === 0}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, opacity: availableSections.length === 0 ? 0.5 : 1 }}
                >
                  <option value="">All Sections</option>
                  {availableSections.map(s => (
                    <option key={s} value={s}>Section {s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {participantsWithSubmissions.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
            }}>
              <Users size={48} style={{ color: '#9ca3af', marginBottom: 16 }} />
              <p style={{ color: '#666', margin: 0 }}>
                {submittedParticipants.length === 0 ? 'No submissions yet' : 'No students match this filter'}
              </p>
              <p style={{ color: '#999', margin: '8px 0 0', fontSize: 14 }}>
                {submittedParticipants.length === 0
                  ? 'Students will appear here once they submit solutions'
                  : 'Try a different batch or section'}
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
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Batch</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Section</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>
                      {contest.contest_type === 'aptitude' ? 'Answered' : 'Solved'}
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Score</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Submissions</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Time Spent</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {participantsWithSubmissions.map((participant, idx) => (
                    <React.Fragment key={participant.register_number}>
                      <tr style={{
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
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>
                        {participant.batch || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#666' }}>
                        {participant.section || '—'}
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
                          {participant.problems_solved} / {contest.contest_type === 'aptitude' ? contest.aptitude_question_count : contest.problem_count}
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
                        <div style={{ display: 'inline-flex', gap: 6 }}>
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
                            {selectedStudent?.register_number === participant.register_number ? 'Hide' : 'View'}
                          </button>
                          <button
                            onClick={() => handleDownloadStudentReport(participant)}
                            disabled={!!downloadingStudentReport[participant.register_number]}
                            title="Download this student's individual contest report"
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: '1px solid #d1d5db',
                              background: downloadingStudentReport[participant.register_number] ? '#f3f4f6' : 'white',
                              color: '#374151',
                              cursor: downloadingStudentReport[participant.register_number] ? 'not-allowed' : 'pointer',
                              fontSize: 13,
                              fontWeight: 500,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Download size={14} />
                            {downloadingStudentReport[participant.register_number] ? '...' : 'Report'}
                          </button>
                          <button
                            onClick={() => handleUnlockStudent(participant)}
                            disabled={!!unlockingStudent[participant.register_number]}
                            title="Unlock and re-activate student's contest session without losing work"
                            style={{
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: '1px solid #10b981',
                              background: unlockingStudent[participant.register_number] ? '#f3f4f6' : '#ecfdf5',
                              color: '#047857',
                              cursor: unlockingStudent[participant.register_number] ? 'not-allowed' : 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            🔓 {unlockingStudent[participant.register_number] ? 'Unlocking...' : 'Unlock'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline submission detail — expands below the row */}
                    {selectedStudent?.register_number === participant.register_number && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: '#f0fdf4', borderBottom: '2px solid #bbf7d0' }}>
                          <div style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: '#065f46' }}>
                                Submissions by {participant.name}
                              </span>
                              {submissionsLoading && (
                                <span style={{ fontSize: 12, color: '#6b7280' }}>Loading...</span>
                              )}
                            </div>

                            {!submissionsLoading && studentSubmissions.length === 0 && (
                              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>No submissions found.</p>
                            )}

                            {!submissionsLoading && studentSubmissions.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {studentSubmissions.map((sub, i) => (
                                  <div key={i} style={{
                                    padding: '12px 16px', background: 'white', borderRadius: 10,
                                    border: `1px solid ${sub.status === 'Accepted' || sub.status === 'Correct' ? '#bbf7d0' : '#fecaca'}`,
                                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                                  }}>
                                    <span style={{
                                      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                                      background: sub.status === 'Accepted' || sub.status === 'Correct' ? '#d1fae5' : '#fee2e2',
                                      color: sub.status === 'Accepted' || sub.status === 'Correct' ? '#059669' : '#dc2626',
                                      display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                                    }}>
                                      {sub.status === 'Accepted' || sub.status === 'Correct'
                                        ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                      {sub.status}
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{sub.problem_title}</span>
                                    {sub.language && <span style={{ fontSize: 12, color: '#6b7280' }}>{sub.language}</span>}
                                    {sub.time_taken != null && sub.time_taken > 0 && (
                                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                                        {Math.floor(sub.time_taken / 60)}m {sub.time_taken % 60}s
                                      </span>
                                    )}
                                    {sub.score != null && (
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>
                                        Score: {sub.score}
                                      </span>
                                    )}
                                    <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                      {new Date(sub.submitted_at).toLocaleTimeString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )}

      {/* Staff PIN Authorization Modal */}
      </div>
    </div>
  );
};

export default ContestDetailModal;
