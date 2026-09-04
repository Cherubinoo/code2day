import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mic, Plus, Trash2, Upload, ChevronDown, ChevronRight, Loader2, Pencil, Check, X, Folder, PlayCircle, FileText, File as FileIcon } from 'lucide-react';
import api from '../../lib/api';

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

const QUESTION_TYPES = [
  ['conceptual', 'Conceptual'], ['technical', 'Technical'], ['scenario', 'Scenario-Based'],
  ['tool', 'Tool-Based'], ['troubleshooting', 'Troubleshooting'], ['comparison', 'Comparison'],
  ['process', 'Process / Procedure'], ['behavioral', 'Behavioral / Experience'],
];
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];
const BLANK_QUESTION = {
  external_id: '', question_type: 'conceptual', difficulty: 'Beginner', question_text: '', answer: '',
  follow_up_question: '', follow_up_answer: '', tools_technologies: '', key_concepts: '', source_reference: '',
};

// A folder's own questions plus every subfolder's, all the way down — the
// tree fetch gives us the real nested arrays, so this is always accurate
// (no separate counter field to let drift out of sync).
function sumFolderQuestions(folder) {
  return (folder.questions || []).length + (folder.subfolders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}
function topicTotalQuestions(topic) {
  return (topic.questions || []).length + (topic.folders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}

function mapFolders(folders, folderId, fn) {
  return (folders || []).map((f) => {
    if (f.id === folderId) return fn(f);
    if ((f.subfolders || []).length) return { ...f, subfolders: mapFolders(f.subfolders, folderId, fn) };
    return f;
  });
}
function removeFolderById(folders, folderId) {
  return (folders || [])
    .filter((f) => f.id !== folderId)
    .map((f) => ({ ...f, subfolders: removeFolderById(f.subfolders, folderId) }));
}

// ── Question form, shared by add and edit — schema is fixed per the
// cybersecurity upload template (Question ID, Type, Difficulty, Question,
// Answer, Follow-up Q&A, Tools/Technologies, Key Concepts, Source). ──────
function QuestionForm({ value, onChange, onCancel, onSave, saving, saveLabel }) {
  const set = (field) => (e) => onChange({ ...value, [field]: e.target.value });
  return (
    <div style={{ background: 'white', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Question ID (optional, e.g. CYB-0001)" value={value.external_id} onChange={set('external_id')} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
        <select value={value.question_type} onChange={set('question_type')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }}>
          {QUESTION_TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select value={value.difficulty} onChange={set('difficulty')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }}>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <textarea placeholder="Question" value={value.question_text} onChange={set('question_text')} rows={2} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
      <textarea placeholder="Answer / Model Answer" value={value.answer} onChange={set('answer')} rows={3} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea placeholder="Follow-up question (optional)" value={value.follow_up_question} onChange={set('follow_up_question')} rows={2} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem', fontFamily: 'inherit', resize: 'vertical' }} />
        <textarea placeholder="Follow-up answer (optional)" value={value.follow_up_answer} onChange={set('follow_up_answer')} rows={2} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem', fontFamily: 'inherit', resize: 'vertical' }} />
      </div>
      <input placeholder="Tools / Technologies (optional)" value={value.tools_technologies} onChange={set('tools_technologies')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem' }} />
      <input placeholder="Key Concepts / Keywords (optional)" value={value.key_concepts} onChange={set('key_concepts')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem' }} />
      <input placeholder="Source Reference (optional)" value={value.source_reference} onChange={set('source_reference')} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSave} disabled={saving || !value.question_text.trim() || !value.answer.trim()} className="primary-button" style={{ borderRadius: 8, padding: '8px 16px', fontSize: '0.8rem' }}>
          {saving ? 'Saving…' : saveLabel}
        </button>
        <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Question list + add/edit for one topic (or one folder within it, via
// folderId) — questions come from the already-fetched tree, so this has no
// fetch of its own; it just calls back to the parent to patch that tree. ──
function InterviewQuestionsManager({ topicId, folderId, questions, onAdd, onRemove, onUpdate }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQ, setNewQ] = useState(BLANK_QUESTION);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(BLANK_QUESTION);
  const [savingEdit, setSavingEdit] = useState(false);

  const questionsUrlPath = `/admin/v2/interview/topics/${topicId}/questions/${folderId ? `?folder_id=${folderId}` : ''}`;

  const addQuestion = async () => {
    if (!newQ.question_text.trim() || !newQ.answer.trim()) return;
    setSaving(true);
    try {
      const res = await api.post(questionsUrlPath, folderId ? { ...newQ, folder_id: folderId } : newQ);
      onAdd(res.data);
      setNewQ(BLANK_QUESTION);
      setShowAddForm(false);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to add question'));
    } finally {
      setSaving(false);
    }
  };

  const removeQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await api.delete(`/admin/v2/interview/questions/${id}/`);
      onRemove(id);
    } catch { /* leave the row in place on failure */ }
  };

  const startEdit = (q) => { setEditingId(q.id); setEditDraft(q); setShowAddForm(false); };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await api.patch(`/admin/v2/interview/questions/${editingId}/`, editDraft);
      onUpdate(editingId, res.data);
      setEditingId(null);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to update question'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Practice Questions ({questions.length})
        </label>
        <button onClick={() => { setShowAddForm((v) => !v); setEditingId(null); }} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
          + Add Question
        </button>
      </div>

      {showAddForm && (
        <QuestionForm value={newQ} onChange={setNewQ} onCancel={() => setShowAddForm(false)} onSave={addQuestion} saving={saving} saveLabel="Add Question" />
      )}

      {questions.length === 0 && !showAddForm ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontStyle: 'italic', marginBottom: 8 }}>No questions yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {questions.map((q) => (
            editingId === q.id ? (
              <QuestionForm key={q.id} value={editDraft} onChange={setEditDraft} onCancel={() => setEditingId(null)} onSave={saveEdit} saving={savingEdit} saveLabel="Save Question" />
            ) : (
              <div key={q.id} style={{ background: 'white', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '1px 6px', borderRadius: 6 }}>
                      {QUESTION_TYPES.find(([k]) => k === q.question_type)?.[1] || q.question_type}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--olive-700)', background: 'var(--bg-2)', padding: '1px 6px', borderRadius: 6 }}>
                      {q.difficulty}
                    </span>
                    {q.external_id && <span style={{ fontSize: '0.65rem', color: 'var(--text-soft)' }}>{q.external_id}</span>}
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--olive-900)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {q.question_text}
                  </div>
                </div>
                <button onClick={() => startEdit(q)} title="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 4, flexShrink: 0 }}><Pencil size={14} /></button>
                <button onClick={() => removeQuestion(q.id)} title="Delete" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4, flexShrink: 0 }}><Trash2 size={14} /></button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function interviewMediaKindIcon(kind) {
  if (kind === 'image') return null; // rendered as an actual thumbnail instead
  if (kind === 'video') return <PlayCircle size={16} style={{ color: '#dc2626' }} />;
  if (kind === 'pdf') return <FileText size={16} style={{ color: '#0891b2' }} />;
  return <FileIcon size={16} style={{ color: 'var(--text-soft)' }} />;
}

// ── Real uploaded media (images/PDFs/videos) for one Interview folder —
// same idea as CompetitiveBankView's FolderMediaManager, but operating on
// the already-loaded tree (media prop + add/remove/update callbacks) like
// every other mutation in this file, instead of its own query cache. ─────
function InterviewFolderMediaManager({ folderId, media, onAdd, onRemove, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again if the upload fails
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/admin/v2/interview/folders/${folderId}/media/`, formData);
      onAdd(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed.'));
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async (id) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await api.delete(`/admin/v2/interview/folders/media/${id}/`);
      onRemove(id);
    } catch { /* leave the tile in place on failure */ }
  };

  const startEditMedia = (m) => { setEditingId(m.id); setEditTitle(m.title); };

  const saveMediaTitle = async (id) => {
    if (!editTitle.trim()) return;
    try {
      const res = await api.patch(`/admin/v2/interview/folders/media/${id}/`, { title: editTitle.trim() });
      onUpdate(id, res.data);
      setEditingId(null);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to rename file.'));
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Media ({media.length})
        </label>
        <label style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload File'}
          <input type="file" onChange={handleUpload} disabled={uploading} accept="image/*,video/*,application/pdf" style={{ display: 'none' }} />
        </label>
      </div>
      {error && <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      {media.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No media uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {media.map((m) => (
            <div key={m.id} style={{ position: 'relative', width: 84 }}>
              <button onClick={() => removeMedia(m.id)} title="Delete" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                <X size={12} />
              </button>
              {editingId !== m.id && (
                <button onClick={() => startEditMedia(m)} title="Rename" style={{ position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--olive-700)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <Pencil size={10} />
                </button>
              )}
              <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                {m.kind === 'image' ? (
                  <img src={m.url} alt={m.title} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-soft)' }} />
                ) : (
                  <div style={{ width: 84, height: 84, borderRadius: 8, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {interviewMediaKindIcon(m.kind)}
                  </div>
                )}
              </a>
              {editingId === m.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }} onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveMediaTitle(m.id); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border-soft)', fontSize: '0.65rem' }}
                  />
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button onClick={() => saveMediaTitle(m.id)} style={{ flex: 1, padding: '2px 0', borderRadius: 4, border: 'none', background: 'var(--olive-700)', color: 'white', fontSize: '0.6rem', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '2px 0', borderRadius: 4, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.6rem', cursor: 'pointer' }}>×</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => startEditMedia(m)}
                  title={`${m.title} (click to rename)`}
                  style={{ fontSize: '0.68rem', color: 'var(--text-soft)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  {m.title}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recursive folder node — same nesting idea as Competitive Bank's
// FolderNode, now with media too. ─────────────────────────────────────────
function InterviewFolderNode({ folder, topicId, onPatchTopic, depth = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(folder.title);
  const [showAddSub, setShowAddSub] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState('');
  const [savingSub, setSavingSub] = useState(false);
  const [subError, setSubError] = useState('');

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    try {
      const res = await api.patch(`/admin/v2/interview/folders/${folder.id}/`, { title: editTitle.trim() });
      onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, title: res.data.title })) }));
      setEditing(false);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to update folder.'));
    }
  };

  const removeFolder = async () => {
    if (!window.confirm('Delete this folder? Its questions and any subfolders are deleted too — this cannot be undone.')) return;
    try {
      await api.delete(`/admin/v2/interview/folders/${folder.id}/`);
      onPatchTopic((t) => ({ ...t, folders: removeFolderById(t.folders, folder.id) }));
    } catch { /* leave the node in place on failure */ }
  };

  const addSubfolder = async () => {
    if (!newSubTitle.trim()) return;
    setSavingSub(true);
    setSubError('');
    try {
      const res = await api.post(`/admin/v2/interview/folders/${folder.id}/subfolders/`, { title: newSubTitle.trim() });
      onPatchTopic((t) => ({
        ...t,
        folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, subfolders: [...(f.subfolders || []), { ...res.data, questions: [], subfolders: [] }] })),
      }));
      setNewSubTitle('');
      setShowAddSub(false);
      setExpanded(true);
    } catch (err) {
      setSubError(apiErrorMessage(err, 'Failed to create subfolder.'));
    } finally {
      setSavingSub(false);
    }
  };

  const questionCount = sumFolderQuestions(folder);
  const subfolders = folder.subfolders || [];

  return (
    <div style={{ background: 'var(--bg-2)', borderRadius: 12, overflow: 'hidden', marginLeft: depth > 0 ? 16 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <button onClick={() => setExpanded((v) => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', display: 'flex', padding: 0 }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {editing ? (
          <div style={{ flex: 1, display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
            <button onClick={saveEdit} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--olive-700)', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--olive-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Folder size={14} style={{ color: '#d97706' }} /> {folder.title}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
                {questionCount} question{questionCount !== 1 ? 's' : ''} · {(folder.media || []).length} media file{(folder.media || []).length !== 1 ? 's' : ''} · {subfolders.length} subfolder{subfolders.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button onClick={() => setEditing(true)} title="Rename" style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
            <button onClick={removeFolder} title="Delete folder" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
          </>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '0 12px 14px', borderTop: '1px solid white' }}>
          <div style={{ paddingTop: 12 }}>
            <InterviewFolderMediaManager
              folderId={folder.id}
              media={folder.media || []}
              onAdd={(m) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, media: [...(f.media || []), m] })) }))}
              onRemove={(id) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, media: (f.media || []).filter((m) => m.id !== id) })) }))}
              onUpdate={(id, m) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, media: (f.media || []).map((x) => x.id === id ? m : x) })) }))}
            />
            <InterviewQuestionsManager
              topicId={topicId}
              folderId={folder.id}
              questions={folder.questions || []}
              onAdd={(q) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, questions: [...f.questions, q] })) }))}
              onRemove={(id) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, questions: f.questions.filter((q) => q.id !== id) })) }))}
              onUpdate={(id, q) => onPatchTopic((t) => ({ ...t, folders: mapFolders(t.folders, folder.id, (f) => ({ ...f, questions: f.questions.map((x) => x.id === id ? q : x) })) }))}
            />
            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
                  Subfolders {subfolders.length ? `(${subfolders.length})` : ''}
                </label>
                <button onClick={() => setShowAddSub((v) => !v)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}>
                  + Add Folder
                </button>
              </div>
              {showAddSub && (
                <div style={{ background: 'white', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  <input placeholder="Folder name" value={newSubTitle} onChange={(e) => setNewSubTitle(e.target.value)} style={{ padding: 7, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.8rem' }} />
                  {subError && <div style={{ fontSize: '0.72rem', color: '#dc2626' }}>{subError}</div>}
                  <button onClick={addSubfolder} disabled={savingSub || !newSubTitle.trim()} className="primary-button" style={{ borderRadius: 8, padding: '7px 12px', fontSize: '0.78rem', alignSelf: 'flex-start' }}>
                    {savingSub ? 'Creating…' : 'Create Folder'}
                  </button>
                </div>
              )}
              {subfolders.length === 0 && !showAddSub ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No subfolders.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {subfolders.map((sf) => (
                    <InterviewFolderNode key={sf.id} folder={sf} topicId={topicId} onPatchTopic={onPatchTopic} depth={depth + 1} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Top-level folders directly under a topic. ─────────────────────────────
function InterviewFoldersManager({ topicId, folders, onPatchTopic }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addFolder = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/admin/v2/interview/topics/${topicId}/folders/`, { title: newTitle.trim() });
      onPatchTopic((t) => ({ ...t, folders: [...t.folders, { ...res.data, questions: [], subfolders: [] }] }));
      setNewTitle('');
      setShowAddForm(false);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to create folder.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Folders {folders.length ? `(${folders.length})` : ''}
        </label>
        <button onClick={() => setShowAddForm((v) => !v)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
          + Add Folder
        </button>
      </div>
      {showAddForm && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input placeholder="Folder name (e.g. Network Security, Cryptography)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
          {error && <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</div>}
          <button onClick={addFolder} disabled={saving || !newTitle.trim()} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', alignSelf: 'flex-start' }}>
            {saving ? 'Creating…' : 'Create Folder'}
          </button>
        </div>
      )}
      {folders.length === 0 && !showAddForm ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No folders yet — questions can still be added directly below.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {folders.map((folder) => (
            <InterviewFolderNode key={folder.id} folder={folder} topicId={topicId} onPatchTopic={onPatchTopic} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function InterviewBankView({ onBack }) {
  const queryClient = useQueryClient();
  const [showAddTrackForm, setShowAddTrackForm] = useState(false);
  const [newTrack, setNewTrack] = useState({ name: '', description: '' });
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState(null);
  const [trackDraft, setTrackDraft] = useState({ name: '', description: '' });
  const [savingTrack, setSavingTrack] = useState(false);

  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  const {
    data: tracks = [],
    isLoading: tracksLoading,
    refetch: refetchTracks,
  } = useQuery({
    queryKey: ['interview-tracks'],
    queryFn: async () => (await api.get('/admin/v2/interview/tracks/')).data,
  });

  const {
    data: track,
    isLoading: treeLoading,
  } = useQuery({
    queryKey: ['interview-tree', selectedTrackId],
    queryFn: async () => (await api.get(`/admin/v2/interview/tracks/${selectedTrackId}/tree/`)).data,
    enabled: !!selectedTrackId,
  });

  function patchTree(updater) {
    queryClient.setQueryData(['interview-tree', selectedTrackId], (prev) => (prev ? updater(prev) : prev));
  }
  function patchTopic(topicId, fn) {
    patchTree((t) => ({ ...t, topics: t.topics.map((tp) => tp.id === topicId ? fn(tp) : tp) }));
  }

  // Browser/mouse Back support for list <-> track <-> topic — without this,
  // a Back press has no history entry of its own to land on and exits the
  // whole admin panel instead of stepping back one level (same idea as
  // CompetitiveBankView's exam-list <-> syllabus pushState, one level
  // deeper here). The on-screen back buttons just call history.back() too,
  // so popstate is the single place that actually updates state.
  const pushedInitialHistoryRef = useRef(false);
  useEffect(() => {
    if (!pushedInitialHistoryRef.current) {
      pushedInitialHistoryRef.current = true;
      window.history.pushState({ interviewBank: 'list' }, '');
    }
  }, []);

  useEffect(() => {
    function handlePopState(e) {
      const s = e.state;
      if (!s || s.interviewBank === undefined) {
        onBack();
        return;
      }
      if (s.interviewBank === 'list') {
        setSelectedTrackId(null);
        setSelectedTopicId(null);
        refetchTracks();
      } else if (s.interviewBank === 'track') {
        setSelectedTrackId(s.trackId);
        setSelectedTopicId(null);
      } else if (s.interviewBank === 'topic') {
        setSelectedTrackId(s.trackId);
        setSelectedTopicId(s.topicId);
      }
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onBack, refetchTracks]);

  const openTrack = (t) => {
    window.history.pushState({ interviewBank: 'track', trackId: t.id }, '');
    setSelectedTrackId(t.id);
    setSelectedTopicId(null);
    setUploadResult(null);
    setUploadError('');
  };
  const openTopic = (topicId) => {
    window.history.pushState({ interviewBank: 'topic', trackId: selectedTrackId, topicId }, '');
    setSelectedTopicId(topicId);
  };

  const handleCreateTrack = async () => {
    if (!newTrack.name.trim()) return;
    setCreatingTrack(true);
    try {
      const res = await api.post('/admin/v2/interview/tracks/', { name: newTrack.name.trim(), description: newTrack.description.trim() });
      queryClient.setQueryData(['interview-tracks'], (prev) => [...(prev || []), res.data]);
      setShowAddTrackForm(false);
      setNewTrack({ name: '', description: '' });
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to create track'));
    } finally {
      setCreatingTrack(false);
    }
  };

  const startEditTrack = (t) => { setEditingTrackId(t.id); setTrackDraft({ name: t.name, description: t.description || '' }); };
  const saveTrackEdit = async (trackId) => {
    if (!trackDraft.name.trim()) return;
    setSavingTrack(true);
    try {
      const res = await api.patch(`/admin/v2/interview/tracks/${trackId}/`, { name: trackDraft.name.trim(), description: trackDraft.description.trim() });
      queryClient.setQueryData(['interview-tracks'], (prev) => (prev || []).map((t) => t.id === trackId ? { ...t, name: res.data.name, description: res.data.description } : t));
      setEditingTrackId(null);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to update track'));
    } finally {
      setSavingTrack(false);
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm('Delete this track and its entire content tree (topics, folders, questions)? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/v2/interview/tracks/${trackId}/`);
      queryClient.setQueryData(['interview-tracks'], (prev) => (prev || []).filter((t) => t.id !== trackId));
    } catch { /* leave the tile in place on failure */ }
  };

  const handleAddTopic = async () => {
    if (!newTopicTitle.trim() || !selectedTrackId) return;
    setAddingTopic(true);
    try {
      const res = await api.post(`/admin/v2/interview/tracks/${selectedTrackId}/topics/`, { title: newTopicTitle.trim() });
      patchTree((t) => ({ ...t, topics: [...t.topics, { ...res.data, questions: [], folders: [] }] }));
      setNewTopicTitle('');
      setAddTopicOpen(false);
      refetchTracks();
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to add topic'));
    } finally {
      setAddingTopic(false);
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Delete this topic and everything under it (folders, questions)? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/v2/interview/topics/${topicId}/`);
      patchTree((t) => ({ ...t, topics: t.topics.filter((tp) => tp.id !== topicId) }));
      if (selectedTopicId === topicId) setSelectedTopicId(null);
      refetchTracks();
    } catch { /* leave the tile in place on failure */ }
  };

  const handleUpload = async (file) => {
    if (!file || !selectedTrackId) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/admin/v2/interview/tracks/${selectedTrackId}/questions/bulk-upload/`, formData);
      setUploadResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['interview-tree', selectedTrackId] });
      refetchTracks();
    } catch (err) {
      setUploadError(apiErrorMessage(err, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  // ── Topic detail view ───────────────────────────────────────────────
  const selectedTopic = track?.topics?.find((t) => t.id === selectedTopicId);
  if (selectedTrackId && selectedTopicId && selectedTopic) {
    return (
      <div className="global-view animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={() => window.history.back()} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>{selectedTopic.title}</h2>
            <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>{topicTotalQuestions(selectedTopic)} question(s) total in this topic</p>
          </div>
          <button onClick={() => handleDeleteTopic(selectedTopic.id)} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', color: '#ef4444', display: 'flex' }}>
            <Trash2 size={18} />
          </button>
        </div>

        <div style={{ background: 'var(--bg-2)', borderRadius: 20, padding: 20 }}>
          <InterviewFoldersManager
            topicId={selectedTopic.id}
            folders={selectedTopic.folders || []}
            onPatchTopic={(fn) => patchTopic(selectedTopic.id, fn)}
          />
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16 }}>
            <InterviewQuestionsManager
              topicId={selectedTopic.id}
              folderId={null}
              questions={selectedTopic.questions || []}
              onAdd={(q) => patchTopic(selectedTopic.id, (t) => ({ ...t, questions: [...t.questions, q] }))}
              onRemove={(id) => patchTopic(selectedTopic.id, (t) => ({ ...t, questions: t.questions.filter((q) => q.id !== id) }))}
              onUpdate={(id, q) => patchTopic(selectedTopic.id, (t) => ({ ...t, questions: t.questions.map((x) => x.id === id ? q : x) }))}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Track detail view (topics grid) ─────────────────────────────────
  if (selectedTrackId) {
    return (
      <div className="global-view animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => window.history.back()} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>{track?.name || 'Loading…'}</h2>
            <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>{track?.description || 'Interview Practice topics'}</p>
          </div>
          <button onClick={() => setAddTopicOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14, background: 'white', border: '1px solid var(--border-soft)', color: 'var(--olive-900)', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
            <Plus size={16} /> Add Topic
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14, background: 'var(--olive-700)', color: 'white', fontWeight: 800, fontSize: '0.9rem', cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : 'Bulk Upload'}
            <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUpload(f); }} />
          </label>
        </div>

        {addTopicOpen && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: 'white', borderRadius: 16, border: '1px solid var(--border-soft)', marginBottom: 20 }}>
            <input
              autoFocus
              placeholder="Topic title (e.g. Network Security)"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTopic(); }}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 700, flex: 1, minWidth: 220 }}
            />
            <button onClick={handleAddTopic} disabled={addingTopic || !newTopicTitle.trim()} className="primary-button" style={{ borderRadius: 10, padding: '10px 18px' }}>
              {addingTopic ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setAddTopicOpen(false); setNewTopicTitle(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 8 }}>
              <X size={18} />
            </button>
          </div>
        )}

        {uploadResult && (
          <div style={{ padding: '14px 20px', borderRadius: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>
            Imported — {uploadResult.created_tracks} new track(s), {uploadResult.created_topics} new topic(s), {uploadResult.created_folders} new folder(s), {uploadResult.created_questions} question(s)
            {uploadResult.skipped_rows > 0 ? ` (${uploadResult.skipped_rows} row(s) skipped).` : '.'}
          </div>
        )}
        {uploadError && (
          <div style={{ padding: '14px 20px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>
            {uploadError}
          </div>
        )}
        <p style={{ color: 'var(--text-soft)', fontSize: '0.85rem', marginTop: -8, marginBottom: 24 }}>
          Bulk upload matches on the sheet's "Field" column, not this tile — a mismatched Field value lands the content in whichever track it names (creating it if needed), not necessarily this one. Or build the tree by hand with Add Topic, then click a topic to add folders and questions.
        </p>

        {treeLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-soft)' }}><Loader2 size={28} className="spin" /></div>
        ) : !track || (track.topics || []).length === 0 ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
            <Mic size={48} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 20 }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 8 }}>No topics yet</h3>
            <p style={{ color: 'var(--text-soft)' }}>Bulk upload a question bank, or click "Add Topic" above to build it by hand.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {track.topics.map((topic) => (
              <div key={topic.id} style={{ padding: 18, borderRadius: 18, border: '1px solid var(--border-soft)', background: 'white', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <button onClick={() => openTopic(topic.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 800, color: 'var(--olive-900)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 700, marginTop: 4 }}>{topicTotalQuestions(topic)} question(s) · {(topic.folders || []).length} folder(s)</div>
                  </button>
                  <button onClick={() => handleDeleteTopic(topic.id)} title="Delete topic" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, flexShrink: 0, display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
                <button onClick={() => openTopic(topic.id)} className="primary-button" style={{ borderRadius: 10, padding: '8px 14px', fontSize: '0.8rem' }}>
                  Manage
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Track list view ──────────────────────────────────────────────────
  return (
    <div className="global-view animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <button onClick={() => window.history.back()} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>Interview Practice</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>Tracks, topics, folders, and questions backing the Interview Practice tile.</p>
        </div>
        <button onClick={() => setShowAddTrackForm((v) => !v)} className="primary-button" style={{ borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
          <Plus size={18} /> Add Track
        </button>
      </div>

      {showAddTrackForm && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 20, background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)', marginBottom: 24 }}>
          <input
            placeholder="Name (e.g. Cybersecurity)"
            value={newTrack.name}
            onChange={(e) => setNewTrack({ ...newTrack, name: e.target.value })}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 700, width: 200 }}
          />
          <input
            placeholder="Description (optional)"
            value={newTrack.description}
            onChange={(e) => setNewTrack({ ...newTrack, description: e.target.value })}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 600, flex: 1, minWidth: 200 }}
          />
          <button onClick={handleCreateTrack} disabled={creatingTrack || !newTrack.name.trim()} className="primary-button" style={{ borderRadius: 10, padding: '10px 18px' }}>
            {creatingTrack ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {tracksLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-soft)' }}><Loader2 size={28} className="spin" /></div>
      ) : tracks.length === 0 ? (
        <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
          <Mic size={48} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 20 }} />
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 8 }}>No tracks yet</h3>
          <p style={{ color: 'var(--text-soft)', marginBottom: 24 }}>Add one (e.g. Cybersecurity, Mechanical, ECE) and bulk upload its question bank.</p>
          <button onClick={() => setShowAddTrackForm(true)} className="primary-button" style={{ borderRadius: 14, padding: '12px 24px' }}>
            <Plus size={18} style={{ marginRight: 6 }} /> Add Track
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {tracks.map((t) => (
            <div key={t.id} style={{ padding: 24, borderRadius: 24, background: 'white', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fae8ff', color: '#d946ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mic size={20} />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {editingTrackId !== t.id && (
                    <button onClick={() => startEditTrack(t)} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 6 }}>
                      <Pencil size={16} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteTrack(t.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editingTrackId === t.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={trackDraft.name} onChange={(e) => setTrackDraft({ ...trackDraft, name: e.target.value })} placeholder="Name" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontWeight: 800, fontSize: '1rem' }} />
                  <input value={trackDraft.description} onChange={(e) => setTrackDraft({ ...trackDraft, description: e.target.value })} placeholder="Description" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveTrackEdit(t.id)} disabled={savingTrack} className="primary-button" style={{ flex: 1, borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Check size={14} /> {savingTrack ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingTrackId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 850, color: 'var(--olive-950)' }}>{t.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>{t.description || 'No description'}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                <span>{t.topic_count} topics</span>
                <span>{t.question_count} questions</span>
              </div>
              <button onClick={() => openTrack(t)} className="primary-button" style={{ borderRadius: 12, padding: '10px 16px', fontSize: '0.85rem' }}>
                Manage Track
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
