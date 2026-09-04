import { useState, useEffect } from 'react';
import { ArrowLeft, Swords, Plus, Trash2, Upload, ChevronDown, ChevronRight, Loader2, Link2, X, PlayCircle, BookOpen, Code2, Pencil, Check, FileText, File as FileIcon, Folder } from 'lucide-react';
import { getCsrfToken, getYoutubeEmbedUrl } from '../../lib/appUtils';

function apiFetch(url, method, body) {
  const token = getCsrfToken();
  const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['X-CSRFToken'] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

function apiFetchForm(url, formData) {
  const token = getCsrfToken();
  const opts = { method: 'POST', credentials: 'include', headers: {}, body: formData };
  if (token) opts.headers['X-CSRFToken'] = token;
  return fetch(url, opts);
}

// Flattens the Aptitude Category > Topic tree down to just the leaf topics
// (the level questions actually attach to) for a simple picker.
function flattenAptitudeTopics(categories) {
  const out = [];
  (categories || []).forEach((cat) => {
    (cat.subcategories || []).forEach((sub) => {
      out.push({ id: sub.id, label: `${cat.title} > ${sub.title}` });
    });
  });
  return out;
}

function resourceIcon(item) {
  if (item.type === 'link' && getYoutubeEmbedUrl(item.url)) return <PlayCircle size={14} style={{ color: '#dc2626' }} />;
  if (item.type === 'link') return <Link2 size={14} style={{ color: 'var(--olive-600)' }} />;
  if (item.type === 'aptitude_topic') return <BookOpen size={14} style={{ color: '#7c3aed' }} />;
  if (item.type === 'problem') return <Code2 size={14} style={{ color: '#0891b2' }} />;
  return <Link2 size={14} />;
}

function resourceLabel(item) {
  if (item.type === 'aptitude_topic') return item.label || item.aptitude_topic_title;
  if (item.type === 'problem') return item.label || `${item.problem_title} (${item.problem_difficulty})`;
  return item.label || item.url;
}

const BLANK_QUESTION = { question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', explanation: '', question_image: '', video_url: '' };

// ── MCQ question bank for one subtopic (or one folder within it, when
// folderId is given) — authored directly here, or imported (copied) from
// an existing Aptitude topic's questions. ──────────────────────────────────
function QuestionsManager({ subtopicId, folderId }) {
  const [questions, setQuestions] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQ, setNewQ] = useState(BLANK_QUESTION);
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [aptitudeTopics, setAptitudeTopics] = useState(null);
  const [importTopicId, setImportTopicId] = useState('');
  const [importCandidates, setImportCandidates] = useState(null);
  const [selectedImportIds, setSelectedImportIds] = useState([]);
  const [importing, setImporting] = useState(false);

  const questionsUrl = `/api/admin/v2/examinations/subtopics/${subtopicId}/questions/${folderId ? `?folder_id=${folderId}` : ''}`;

  useEffect(() => { fetchQuestions(); }, [subtopicId, folderId]);

  const fetchQuestions = async () => {
    const res = await fetch(questionsUrl, { credentials: 'include' });
    if (res.ok) setQuestions(await res.json());
  };

  const removeQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/subtopics/${subtopicId}/questions/${id}/`, 'DELETE');
    if (res.ok) setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const addQuestion = async () => {
    if (!newQ.question_text.trim() || !newQ.option_a.trim() || !newQ.option_b.trim() || !newQ.option_c.trim() || !newQ.option_d.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(questionsUrl, 'POST', folderId ? { ...newQ, folder_id: folderId } : newQ);
      if (res.ok) {
        const q = await res.json();
        setQuestions((prev) => [...(prev || []), q]);
        setNewQ(BLANK_QUESTION);
        setShowAddForm(false);
      } else {
        alert('Failed to add question');
      }
    } finally {
      setSaving(false);
    }
  };

  const openImportPicker = () => {
    setShowImport(true);
    if (aptitudeTopics === null) {
      fetch('/api/aptitude/topics/', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setAptitudeTopics(flattenAptitudeTopics(d?.categories)))
        .catch(() => setAptitudeTopics([]));
    }
  };

  const loadImportCandidates = (topicId) => {
    setImportTopicId(topicId);
    setSelectedImportIds([]);
    setImportCandidates(null);
    if (!topicId) return;
    fetch(`/api/admin/v2/aptitude-bank/?topic_id=${topicId}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const qs = d?.questions || [];
        setImportCandidates(qs);
        // Picking a topic imports the whole topic by default — every
        // question starts checked, so a plain "pick topic → Import" click
        // brings in everything. The checkboxes stay there to deselect a
        // specific question, not to build the selection up from nothing.
        setSelectedImportIds(qs.map((q) => q.id));
      })
      .catch(() => setImportCandidates([]));
  };

  const allImportSelected = importCandidates !== null && importCandidates.length > 0 && selectedImportIds.length === importCandidates.length;
  const toggleSelectAllImport = () => {
    setSelectedImportIds(allImportSelected ? [] : (importCandidates || []).map((q) => q.id));
  };

  const toggleImportSelection = (id) => {
    setSelectedImportIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const runImport = async () => {
    if (selectedImportIds.length === 0) return;
    setImporting(true);
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/subtopics/${subtopicId}/questions/import/`, 'POST', {
        aptitude_question_ids: selectedImportIds,
        ...(folderId ? { folder_id: folderId } : {}),
      });
      if (res.ok) {
        const body = await res.json();
        setQuestions((prev) => [...(prev || []), ...body.questions]);
        setShowImport(false);
        setImportTopicId('');
        setImportCandidates(null);
        setSelectedImportIds([]);
      } else {
        alert('Import failed');
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Practice Questions {questions ? `(${questions.length})` : ''}
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={openImportPicker} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            Import from Aptitude
          </button>
          <button onClick={() => setShowAddForm((v) => !v)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
            + Add Question
          </button>
        </div>
      </div>

      {questions === null ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>Loading…</div>
      ) : questions.length === 0 && !showAddForm ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No questions yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {(questions || []).map((q) => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10 }}>
              <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{q.question_text}</span>
              <span style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 800, flexShrink: 0 }}>Ans: {q.correct_option}</span>
              <button onClick={() => removeQuestion(q.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, flexShrink: 0 }}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <textarea placeholder="Question text" value={newQ.question_text} onChange={(e) => setNewQ({ ...newQ, question_text: e.target.value })} rows={2} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
          <input placeholder="Image URL (optional)" value={newQ.question_image} onChange={(e) => setNewQ({ ...newQ, question_image: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
          <input placeholder="Video URL — YouTube etc. (optional)" value={newQ.video_url} onChange={(e) => setNewQ({ ...newQ, video_url: e.target.value })} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
          {['a', 'b', 'c', 'd'].map((letter) => (
            <div key={letter} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="radio"
                checked={newQ.correct_option === letter.toUpperCase()}
                onChange={() => setNewQ({ ...newQ, correct_option: letter.toUpperCase() })}
                title="Correct answer"
              />
              <input
                placeholder={`Option ${letter.toUpperCase()}`}
                value={newQ[`option_${letter}`]}
                onChange={(e) => setNewQ({ ...newQ, [`option_${letter}`]: e.target.value })}
                style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }}
              />
            </div>
          ))}
          <textarea placeholder="Explanation (optional)" value={newQ.explanation} onChange={(e) => setNewQ({ ...newQ, explanation: e.target.value })} rows={2} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
          <button onClick={addQuestion} disabled={saving} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', alignSelf: 'flex-start' }}>
            {saving ? 'Saving…' : 'Save Question'}
          </button>
        </div>
      )}

      {showImport && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <select value={importTopicId} onChange={(e) => loadImportCandidates(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }}>
            <option value="">{aptitudeTopics === null ? 'Loading…' : 'Select an Aptitude topic to import from...'}</option>
            {(aptitudeTopics || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>

          {importCandidates !== null && (
            <>
              {importCandidates.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                    Whole topic selected by default — {selectedImportIds.length} of {importCandidates.length}
                  </span>
                  <button
                    onClick={toggleSelectAllImport}
                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {allImportSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              )}
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {importCandidates.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No questions in this topic.</div>
                ) : importCandidates.map((q) => (
                  <label key={q.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', background: 'white', borderRadius: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedImportIds.includes(q.id)} onChange={() => toggleImportSelection(q.id)} style={{ marginTop: 2 }} />
                    <span>{q.question_text}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={runImport} disabled={importing || selectedImportIds.length === 0} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem' }}>
                  {importing ? 'Importing…' : `Import ${selectedImportIds.length || ''} Selected`}
                </button>
                <button onClick={() => setShowImport(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>Close</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function mediaKindIcon(kind) {
  if (kind === 'image') return null; // rendered as an actual thumbnail instead
  if (kind === 'video') return <PlayCircle size={16} style={{ color: '#dc2626' }} />;
  if (kind === 'pdf') return <FileText size={16} style={{ color: '#0891b2' }} />;
  return <FileIcon size={16} style={{ color: 'var(--text-soft)' }} />;
}

// ── Real uploaded media (images/PDFs/videos) for one folder — distinct
// from the link/Aptitude-topic/Problem "paste a URL" resources every other
// syllabus level carries. ───────────────────────────────────────────────────
function FolderMediaManager({ folderId }) {
  const [media, setMedia] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  useEffect(() => { fetchMedia(); }, [folderId]);

  const fetchMedia = async () => {
    const res = await fetch(`/api/admin/v2/examinations/folders/${folderId}/media/`, { credentials: 'include' });
    if (res.ok) setMedia(await res.json());
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again if the upload fails
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetchForm(`/api/admin/v2/examinations/folders/${folderId}/media/`, formData);
      if (res.ok) {
        const item = await res.json();
        setMedia((prev) => [...(prev || []), item]);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Upload failed.');
      }
    } catch {
      setError('Network error during upload.');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async (id) => {
    if (!window.confirm('Delete this file?')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/folders/media/${id}/`, 'DELETE');
    if (res.ok) setMedia((prev) => prev.filter((m) => m.id !== id));
  };

  const startEditMedia = (m) => {
    setEditingId(m.id);
    setEditTitle(m.title);
  };

  const saveMediaTitle = async (id) => {
    if (!editTitle.trim()) return;
    const res = await apiFetch(`/api/admin/v2/examinations/folders/media/${id}/`, 'PATCH', { title: editTitle.trim() });
    if (res.ok) {
      const updated = await res.json();
      setMedia((prev) => prev.map((m) => (m.id === id ? updated : m)));
      setEditingId(null);
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error || 'Failed to rename file.');
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Media {media ? `(${media.length})` : ''}
        </label>
        <label style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
          {uploading ? 'Uploading…' : 'Upload File'}
          <input type="file" onChange={handleUpload} disabled={uploading} accept="image/*,video/*,application/pdf" style={{ display: 'none' }} />
        </label>
      </div>
      {error && <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: 8 }}>{error}</div>}
      {media === null ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>Loading…</div>
      ) : media.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No media uploaded yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {media.map((m) => (
            <div key={m.id} style={{ position: 'relative', width: 84 }}>
              <button
                onClick={() => removeMedia(m.id)}
                title="Delete"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
              >
                <X size={12} />
              </button>
              {editingId !== m.id && (
                <button
                  onClick={() => startEditMedia(m)}
                  title="Rename"
                  style={{ position: 'absolute', top: -6, left: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'var(--olive-700)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}
                >
                  <Pencil size={10} />
                </button>
              )}
              <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                {m.kind === 'image' ? (
                  <img src={m.url} alt={m.title} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-soft)' }} />
                ) : (
                  <div style={{ width: 84, height: 84, borderRadius: 8, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {mediaKindIcon(m.kind)}
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

// ── Named sub-folders inside one subtopic — each groups its own questions
// (via QuestionsManager with folderId) and uploaded media (via
// FolderMediaManager), e.g. splitting "Time and Work" into "Basic" /
// "Advanced" / "Formula Sheet" instead of one flat question list. ─────────
function FoldersManager({ subtopicId }) {
  const [folders, setFolders] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => { fetchFolders(); }, [subtopicId]);

  const fetchFolders = async () => {
    const res = await fetch(`/api/admin/v2/examinations/subtopics/${subtopicId}/folders/`, { credentials: 'include' });
    if (res.ok) setFolders(await res.json());
  };

  const addFolder = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/subtopics/${subtopicId}/folders/`, 'POST', {
        title: newTitle.trim(), description: newDescription.trim(),
      });
      if (res.ok) {
        const folder = await res.json();
        setFolders((prev) => [...(prev || []), folder]);
        setNewTitle('');
        setNewDescription('');
        setShowAddForm(false);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Failed to create folder.');
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (folder) => {
    setEditingId(folder.id);
    setEditTitle(folder.title);
    setEditDescription(folder.description || '');
  };

  const saveEdit = async (folderId) => {
    if (!editTitle.trim()) return;
    const res = await apiFetch(`/api/admin/v2/examinations/folders/${folderId}/`, 'PATCH', {
      title: editTitle.trim(), description: editDescription.trim(),
    });
    if (res.ok) {
      const updated = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, ...updated } : f)));
      setEditingId(null);
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error || 'Failed to update folder.');
    }
  };

  const removeFolder = async (folderId) => {
    if (!window.confirm('Delete this folder? Its questions and media are deleted too — this cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/folders/${folderId}/`, 'DELETE');
    if (res.ok) {
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      if (expandedId === folderId) setExpandedId(null);
    }
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase' }}>
          Folders {folders ? `(${folders.length})` : ''}
        </label>
        <button onClick={() => setShowAddForm((v) => !v)} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
          + Add Folder
        </button>
      </div>

      {showAddForm && (
        <div style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input placeholder="Folder name (e.g. Basic, Advanced, Formula Sheet)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
          <textarea placeholder="Description (optional)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical' }} />
          {error && <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>{error}</div>}
          <button onClick={addFolder} disabled={saving || !newTitle.trim()} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', alignSelf: 'flex-start' }}>
            {saving ? 'Creating…' : 'Create Folder'}
          </button>
        </div>
      )}

      {folders === null ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>Loading…</div>
      ) : folders.length === 0 && !showAddForm ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No folders yet — questions/media can still be added directly below.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {folders.map((folder) => (
            <div key={folder.id} style={{ background: 'var(--bg-2)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
                <button
                  onClick={() => setExpandedId(expandedId === folder.id ? null : folder.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', display: 'flex', padding: 0 }}
                >
                  {expandedId === folder.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {editingId === folder.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: '0.82rem' }} />
                    <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} placeholder="Description" style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: '0.8rem', fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => saveEdit(folder.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--olive-700)', color: 'white', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border-soft)', background: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === folder.id ? null : folder.id)}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--olive-900)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Folder size={14} style={{ color: '#d97706' }} /> {folder.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)' }}>
                        {folder.question_count} question{folder.question_count !== 1 ? 's' : ''} · {folder.media.length} media file{folder.media.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button onClick={() => startEdit(folder)} title="Rename / edit" style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 4 }}><Pencil size={14} /></button>
                    <button onClick={() => removeFolder(folder.id)} title="Delete folder" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
              {expandedId === folder.id && (
                <div style={{ padding: '0 12px 14px', borderTop: '1px solid white' }}>
                  <div style={{ paddingTop: 12 }}>
                    <FolderMediaManager folderId={folder.id} />
                    <QuestionsManager subtopicId={subtopicId} folderId={folder.id} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Resource-editing modal, shared by syllabus Topics and Subtopics — both
// carry the same three resource kinds (link / Aptitude topic / Problem) as
// individual resources of their own, not just something inherited from the
// parent. `entity` is the topic or subtopic object; `saveUrl` is its
// resources endpoint; `showDescription` renders a subtopic's description
// field too (topics don't have one). ──────────────────────────────────────
function ResourceEditorModal({ entity, saveUrl, showDescription, onClose, onSaved }) {
  const [description, setDescription] = useState(entity.description || '');
  const [items, setItems] = useState(entity.resource_links || []);
  const [saving, setSaving] = useState(false);

  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const [aptitudeTopics, setAptitudeTopics] = useState(null);
  const [pickedAptitudeId, setPickedAptitudeId] = useState('');

  const [problems, setProblems] = useState(null);
  const [problemSearch, setProblemSearch] = useState('');
  const [pickedProblemSlug, setPickedProblemSlug] = useState('');

  useEffect(() => {
    fetch('/api/aptitude/topics/', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAptitudeTopics(flattenAptitudeTopics(d?.categories)))
      .catch(() => setAptitudeTopics([]));
    fetch('/api/admin/v2/problem-bank/', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setProblems(d?.problems || []))
      .catch(() => setProblems([]));
  }, []);

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const addLink = () => {
    if (!linkUrl.trim()) return;
    setItems((prev) => [...prev, { type: 'link', label: linkLabel.trim(), url: linkUrl.trim() }]);
    setLinkLabel('');
    setLinkUrl('');
  };

  const addAptitudeTopic = () => {
    if (!pickedAptitudeId) return;
    const found = (aptitudeTopics || []).find((t) => String(t.id) === String(pickedAptitudeId));
    setItems((prev) => [...prev, { type: 'aptitude_topic', label: '', aptitude_topic_id: Number(pickedAptitudeId), aptitude_topic_title: found?.label }]);
    setPickedAptitudeId('');
  };

  const addProblem = () => {
    if (!pickedProblemSlug) return;
    const found = (problems || []).find((p) => p.slug === pickedProblemSlug);
    setItems((prev) => [...prev, { type: 'problem', label: '', problem_slug: pickedProblemSlug, problem_title: found?.title, problem_difficulty: found?.difficulty }]);
    setPickedProblemSlug('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        resource_links: items.map(({ type, label, url, aptitude_topic_id, problem_slug }) => {
          if (type === 'link') return { type, label, url };
          if (type === 'aptitude_topic') return { type, label, aptitude_topic_id };
          if (type === 'problem') return { type, label, problem_slug };
          return null;
        }).filter(Boolean),
      };
      if (showDescription) payload.description = description;

      const res = await apiFetch(saveUrl, 'PATCH', payload);
      if (res.ok) {
        const body = await res.json();
        onSaved(body.description, body.resource_links || []);
      } else {
        alert('Failed to save resources');
      }
    } finally {
      setSaving(false);
    }
  };

  const filteredProblems = (problems || []).filter(p =>
    !problemSearch.trim() || p.title.toLowerCase().includes(problemSearch.trim().toLowerCase())
  ).slice(0, 50);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 24, padding: 32, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: 'var(--olive-950)' }}>Resources</h3>
            <p style={{ margin: '4px 0 0', color: 'var(--text-soft)', fontSize: '0.9rem' }}>{entity.title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)' }}><X size={20} /></button>
        </div>

        {showDescription && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this subtopic covers..."
              rows={3}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--border-soft)', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
            />
          </div>
        )}

        {/* Existing resources */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {items.length === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontStyle: 'italic' }}>No resources attached yet.</div>
          )}
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10 }}>
              {resourceIcon(item)}
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resourceLabel(item)}</span>
              <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}><X size={14} /></button>
            </div>
          ))}
        </div>

        {/* Add a link */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 16 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Add a Link</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} style={{ flex: '1 1 120px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }} />
            <input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={{ flex: '2 1 200px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }} />
            <button onClick={addLink} disabled={!linkUrl.trim()} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem' }}>Add</button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: 'var(--text-soft)' }}>YouTube links are shown as an embedded video automatically.</p>
        </div>

        {/* Add an existing Aptitude topic */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 16 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Link an Existing Aptitude Topic</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={pickedAptitudeId} onChange={(e) => setPickedAptitudeId(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }}>
              <option value="">{aptitudeTopics === null ? 'Loading…' : 'Select a topic...'}</option>
              {(aptitudeTopics || []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button onClick={addAptitudeTopic} disabled={!pickedAptitudeId} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem' }}>Add</button>
          </div>
        </div>

        {/* Add an existing Problem */}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 16, marginBottom: 24 }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Link an Existing Coding Problem</label>
          <input placeholder="Search problems..." value={problemSearch} onChange={(e) => setProblemSearch(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={pickedProblemSlug} onChange={(e) => setPickedProblemSlug(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }}>
              <option value="">{problems === null ? 'Loading…' : 'Select a problem...'}</option>
              {filteredProblems.map((p) => <option key={p.slug} value={p.slug}>{p.title} ({p.difficulty})</option>)}
            </select>
            <button onClick={addProblem} disabled={!pickedProblemSlug} className="primary-button" style={{ borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem' }}>Add</button>
          </div>
        </div>

        {showDescription && <FoldersManager subtopicId={entity.id} />}
        {showDescription && <QuestionsManager subtopicId={entity.id} />}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontWeight: 700 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="primary-button" style={{ borderRadius: 10, padding: '10px 24px' }}>
            {saving ? 'Saving…' : 'Save Resources'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Admin content bank for Competitive Practice — Examinations (GRE, GATE...)
// each own a Section > Topic > Subtopic syllabus tree, populated in one
// shot via an Excel upload. Each topic tile can then be configured with
// resources: external links (auto-embedded if YouTube), or pointers at
// existing Aptitude topics / coding Problems already in the platform.
export default function CompetitiveBankView({ onBack }) {
  const [examinations, setExaminations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newExam, setNewExam] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const [selectedExam, setSelectedExam] = useState(null);
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  const [resourceModalTopic, setResourceModalTopic] = useState(null);
  const [resourceModalSubtopic, setResourceModalSubtopic] = useState(null);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examDraft, setExamDraft] = useState({ name: '', description: '' });
  const [savingExam, setSavingExam] = useState(false);

  // Manual Section > Topic > Subtopic creation — the Excel upload isn't the
  // only way to build a syllabus tree; one add-form of each kind is open at
  // a time, keyed by the parent id it's adding into.
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [addingSection, setAddingSection] = useState(false);
  const [addTopicFor, setAddTopicFor] = useState(null);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);
  const [addSubtopicFor, setAddSubtopicFor] = useState(null);
  const [newSubtopicTitle, setNewSubtopicTitle] = useState('');
  const [addingSubtopic, setAddingSubtopic] = useState(false);

  useEffect(() => { fetchExaminations(); }, []);

  const fetchExaminations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/v2/examinations/', { credentials: 'include' });
      if (res.ok) setExaminations(await res.json());
    } catch (err) {
      console.error('Failed to load examinations', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSyllabus = async (examId) => {
    setSyllabusLoading(true);
    try {
      const res = await fetch(`/api/admin/v2/examinations/${examId}/syllabus/`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSyllabus(data);
        setExpandedSections(Object.fromEntries((data.sections || []).map(s => [s.id, true])));
      }
    } catch (err) {
      console.error('Failed to load syllabus', err);
    } finally {
      setSyllabusLoading(false);
    }
  };

  const openExam = (exam) => {
    window.history.pushState({ competitiveBank: 'exam', examId: exam.id }, '');
    setSelectedExam(exam);
    setUploadResult(null);
    setUploadError('');
    fetchSyllabus(exam.id);
  };

  // Browser/mouse Back support for exam list <-> syllabus view — pushes a
  // history entry (without touching the pathname, so the app's top-level
  // router doesn't fight with this) and restores on popstate instead of
  // Back leaving the Competitive Bank tile entirely.
  useEffect(() => {
    function handlePopState(e) {
      const s = e.state;
      if (!s || s.competitiveBank !== 'exam') {
        setSelectedExam(null);
        return;
      }
      const exam = examinations.find((x) => x.id === s.examId);
      if (!exam) return;
      setSelectedExam(exam);
      setUploadResult(null);
      setUploadError('');
      fetchSyllabus(exam.id);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [examinations]);

  const handleCreateExam = async () => {
    if (!newExam.name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch('/api/admin/v2/examinations/', 'POST', {
        name: newExam.name.trim(), description: newExam.description.trim(),
      });
      if (res.ok) {
        setShowAddForm(false);
        setNewExam({ name: '', description: '' });
        fetchExaminations();
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to create examination');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm('Delete this examination and its entire syllabus? This cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/${examId}/`, 'DELETE');
    if (res.ok) fetchExaminations();
  };

  const startEditExam = (exam) => {
    setEditingExamId(exam.id);
    setExamDraft({ name: exam.name, description: exam.description || '' });
  };

  const saveExamEdit = async (examId) => {
    if (!examDraft.name.trim()) return;
    setSavingExam(true);
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/${examId}/`, 'PATCH', {
        name: examDraft.name.trim(), description: examDraft.description.trim(),
      });
      if (res.ok) {
        const body = await res.json();
        setExaminations((prev) => prev.map((e) => e.id === examId ? { ...e, name: body.name, description: body.description } : e));
        setEditingExamId(null);
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Failed to update examination');
      }
    } finally {
      setSavingExam(false);
    }
  };

  const handleUpload = async (file) => {
    if (!file || !selectedExam) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetchForm(`/api/admin/v2/examinations/${selectedExam.id}/syllabus/upload/`, formData);
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setUploadResult(body);
        fetchSyllabus(selectedExam.id);
        fetchExaminations();
      } else {
        setUploadError(body.error || 'Upload failed');
      }
    } catch (err) {
      setUploadError('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAddSection = async () => {
    if (!newSectionTitle.trim() || !selectedExam) return;
    setAddingSection(true);
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/${selectedExam.id}/sections/`, 'POST', { title: newSectionTitle.trim() });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyllabus((prev) => ({ ...(prev || { examination: null }), sections: [...((prev && prev.sections) || []), body] }));
        setExpandedSections((prev) => ({ ...prev, [body.id]: true }));
        setNewSectionTitle('');
        setAddSectionOpen(false);
        fetchExaminations();
      } else {
        alert(body.error || 'Failed to add section');
      }
    } finally {
      setAddingSection(false);
    }
  };

  const handleDeleteSection = async (sectionId) => {
    if (!window.confirm('Delete this section and everything under it (topics, subtopics, folders, questions)? This cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/sections/${sectionId}/`, 'DELETE');
    if (res.ok) {
      setSyllabus((prev) => prev ? { ...prev, sections: prev.sections.filter((s) => s.id !== sectionId) } : prev);
      fetchExaminations();
    }
  };

  const handleAddTopic = async (sectionId) => {
    if (!newTopicTitle.trim()) return;
    setAddingTopic(true);
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/sections/${sectionId}/topics/`, 'POST', { title: newTopicTitle.trim() });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyllabus((prev) => ({
          ...prev,
          sections: prev.sections.map((s) => s.id === sectionId ? { ...s, topics: [...s.topics, body] } : s),
        }));
        setNewTopicTitle('');
        setAddTopicFor(null);
        fetchExaminations();
      } else {
        alert(body.error || 'Failed to add topic');
      }
    } finally {
      setAddingTopic(false);
    }
  };

  const handleDeleteTopic = async (sectionId, topicId) => {
    if (!window.confirm('Delete this topic and everything under it (subtopics, folders, questions)? This cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/topics/${topicId}/`, 'DELETE');
    if (res.ok) {
      setSyllabus((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => s.id === sectionId ? { ...s, topics: s.topics.filter((t) => t.id !== topicId) } : s),
      }));
      fetchExaminations();
    }
  };

  const handleAddSubtopic = async (sectionId, topicId) => {
    if (!newSubtopicTitle.trim()) return;
    setAddingSubtopic(true);
    try {
      const res = await apiFetch(`/api/admin/v2/examinations/topics/${topicId}/subtopics/`, 'POST', { title: newSubtopicTitle.trim() });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSyllabus((prev) => ({
          ...prev,
          sections: prev.sections.map((s) => s.id === sectionId ? {
            ...s,
            topics: s.topics.map((t) => t.id === topicId ? { ...t, subtopics: [...t.subtopics, body] } : t),
          } : s),
        }));
        setNewSubtopicTitle('');
        setAddSubtopicFor(null);
        fetchExaminations();
      } else {
        alert(body.error || 'Failed to add subtopic');
      }
    } finally {
      setAddingSubtopic(false);
    }
  };

  const handleDeleteSubtopic = async (sectionId, topicId, subtopicId) => {
    if (!window.confirm('Delete this subtopic and everything under it (folders, media, questions)? This cannot be undone.')) return;
    const res = await apiFetch(`/api/admin/v2/examinations/subtopics/${subtopicId}/`, 'DELETE');
    if (res.ok) {
      setSyllabus((prev) => ({
        ...prev,
        sections: prev.sections.map((s) => s.id === sectionId ? {
          ...s,
          topics: s.topics.map((t) => t.id === topicId ? { ...t, subtopics: t.subtopics.filter((st) => st.id !== subtopicId) } : t),
        } : s),
      }));
      fetchExaminations();
    }
  };

  const handleResourcesSaved = (topicId, resourceLinks) => {
    setSyllabus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) => ({
          ...section,
          topics: section.topics.map((t) => t.id === topicId ? { ...t, resource_links: resourceLinks } : t),
        })),
      };
    });
    setResourceModalTopic(null);
  };

  const handleSubtopicSaved = (subtopicId, description, resourceLinks) => {
    setSyllabus((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: prev.sections.map((section) => ({
          ...section,
          topics: section.topics.map((t) => ({
            ...t,
            subtopics: t.subtopics.map((st) => st.id === subtopicId ? { ...st, description, resource_links: resourceLinks } : st),
          })),
        })),
      };
    });
    setResourceModalSubtopic(null);
  };

  // ── Syllabus detail view ──────────────────────────────────────────────
  if (selectedExam) {
    return (
      <div className="global-view animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => window.history.back()} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>{selectedExam.name}</h2>
            <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>{selectedExam.description || 'Syllabus structure'}</p>
          </div>
          <button
            onClick={() => setAddSectionOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14,
              background: 'white', border: '1px solid var(--border-soft)', color: 'var(--olive-900)',
              fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
            }}
          >
            <Plus size={16} /> Add Section
          </button>
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 14,
              background: 'var(--olive-700)', color: 'white', fontWeight: 800, fontSize: '0.9rem',
              cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.7 : 1,
            }}
          >
            {uploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : 'Upload Syllabus'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleUpload(f); }}
            />
          </label>
        </div>

        {addSectionOpen && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: 'white', borderRadius: 16, border: '1px solid var(--border-soft)', marginBottom: 20 }}>
            <input
              autoFocus
              placeholder="Section title (e.g. Quantitative Aptitude)"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSection(); }}
              style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 700, flex: 1, minWidth: 220 }}
            />
            <button onClick={handleAddSection} disabled={addingSection || !newSectionTitle.trim()} className="primary-button" style={{ borderRadius: 10, padding: '10px 18px' }}>
              {addingSection ? 'Adding…' : 'Add'}
            </button>
            <button onClick={() => { setAddSectionOpen(false); setNewSectionTitle(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 8 }}>
              <X size={18} />
            </button>
          </div>
        )}

        {uploadResult && (
          <div style={{ padding: '14px 20px', borderRadius: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>
            Imported — {uploadResult.created_sections} new section(s), {uploadResult.created_topics} new topic(s), {uploadResult.created_subtopics} new subtopic(s)
            {uploadResult.skipped_rows > 0 ? ` (${uploadResult.skipped_rows} row(s) skipped — missing section/topic/subtopic)` : ''}.
          </div>
        )}
        {uploadError && (
          <div style={{ padding: '14px 20px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 700, fontSize: '0.9rem', marginBottom: 20 }}>
            {uploadError}
          </div>
        )}
        <p style={{ color: 'var(--text-soft)', fontSize: '0.85rem', marginTop: -8, marginBottom: 24 }}>
          Upload expects a Section, Topic, Subtopic column (an Exam column is fine too, it's ignored) and is safe to re-run — existing entries aren't duplicated. Or build the tree by hand with Add Section, then Add Topic / Add Subtopic inside it. Click a topic tile to attach resources, a subtopic to add folders, media, and questions.
        </p>

        {syllabusLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-soft)' }}><Loader2 size={28} className="spin" /></div>
        ) : !syllabus || (syllabus.sections || []).length === 0 ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
            <Upload size={48} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 20 }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 8 }}>No syllabus yet</h3>
            <p style={{ color: 'var(--text-soft)' }}>Upload a syllabus spreadsheet, or click "Add Section" above to build the structure by hand.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {syllabus.sections.map((section) => (
              <div key={section.id} className="surface-card" style={{ background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', background: 'var(--bg-2)' }}>
                  <button
                    onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    {expandedSections[section.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span style={{ fontWeight: 850, fontSize: '1.05rem', color: 'var(--olive-950)' }}>{section.title}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontWeight: 700 }}>{section.topics.length} topics</span>
                  </button>
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    title="Delete section"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 6, display: 'flex' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {expandedSections[section.id] && (
                  <div style={{ padding: '16px 24px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, alignItems: 'start' }}>
                    {section.topics.map((topic) => (
                      <div
                        key={topic.id}
                        style={{
                          padding: 14, borderRadius: 14, border: '1px solid var(--border-soft)',
                          background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <button
                            onClick={() => setResourceModalTopic(topic)}
                            style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Link2 size={14} style={{ color: 'var(--olive-600)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 750, color: 'var(--olive-900)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                              {topic.resource_links.length > 0 ? `${topic.resource_links.length} topic resource${topic.resource_links.length > 1 ? 's' : ''} — click to edit` : 'click to add topic resources'}
                            </div>
                          </button>
                          <button
                            onClick={() => handleDeleteTopic(section.id, topic.id)}
                            title="Delete topic"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2, flexShrink: 0, display: 'flex' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {topic.subtopics.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
                            {topic.subtopics.map((st) => (
                              <button
                                key={st.id}
                                onClick={() => setResourceModalSubtopic(st)}
                                title="Edit description, resources, folders & questions"
                                style={{
                                  textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-soft)',
                                  background: 'white', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 650, color: 'var(--olive-900)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                              >
                                {st.title}
                                {(st.description || (st.resource_links || []).length > 0) && (
                                  <span style={{ marginLeft: 4, color: '#059669' }}>●</span>
                                )}
                                {st.question_count > 0 && (
                                  <span style={{ marginLeft: 4, fontSize: '0.68rem', color: '#7c3aed', fontWeight: 800 }}>{st.question_count}Q</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {addSubtopicFor === topic.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingTop: topic.subtopics.length > 0 ? 0 : 8, borderTop: topic.subtopics.length > 0 ? 'none' : '1px solid var(--border-soft)' }}>
                            <input
                              autoFocus
                              placeholder="Subtopic title"
                              value={newSubtopicTitle}
                              onChange={(e) => setNewSubtopicTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtopic(section.id, topic.id); if (e.key === 'Escape') setAddSubtopicFor(null); }}
                              style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.75rem' }}
                            />
                            <button onClick={() => handleAddSubtopic(section.id, topic.id)} disabled={addingSubtopic || !newSubtopicTitle.trim()} style={{ background: 'var(--olive-700)', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex' }}>
                              <Check size={13} color="white" />
                            </button>
                            <button onClick={() => { setAddSubtopicFor(null); setNewSubtopicTitle(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: '6px 4px', display: 'flex' }}>
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddSubtopicFor(topic.id); setNewSubtopicTitle(''); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
                              padding: '6px 8px', borderRadius: 8, border: '1px dashed var(--border-soft)', background: 'none',
                              cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-soft)',
                              marginTop: topic.subtopics.length > 0 ? 0 : 8,
                            }}
                          >
                            <Plus size={12} /> Add Subtopic
                          </button>
                        )}
                      </div>
                    ))}

                    {addTopicFor === section.id ? (
                      <div style={{ padding: 14, borderRadius: 14, border: '1px dashed var(--border-soft)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          autoFocus
                          placeholder="Topic title"
                          value={newTopicTitle}
                          onChange={(e) => setNewTopicTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddTopic(section.id); if (e.key === 'Escape') setAddTopicFor(null); }}
                          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleAddTopic(section.id)} disabled={addingTopic || !newTopicTitle.trim()} className="primary-button" style={{ flex: 1, borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem' }}>
                            {addingTopic ? 'Adding…' : 'Add'}
                          </button>
                          <button onClick={() => { setAddTopicFor(null); setNewTopicTitle(''); }} style={{ background: 'none', border: '1px solid var(--border-soft)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-soft)', padding: '6px 10px' }}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddTopicFor(section.id); setNewTopicTitle(''); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: 14, borderRadius: 14, border: '1px dashed var(--border-soft)', background: 'none',
                          cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-soft)', minHeight: 60,
                        }}
                      >
                        <Plus size={16} /> Add Topic
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {resourceModalTopic && (
          <ResourceEditorModal
            entity={resourceModalTopic}
            saveUrl={`/api/admin/v2/examinations/topics/${resourceModalTopic.id}/resources/`}
            showDescription={false}
            onClose={() => setResourceModalTopic(null)}
            onSaved={(_description, resourceLinks) => handleResourcesSaved(resourceModalTopic.id, resourceLinks)}
          />
        )}
        {resourceModalSubtopic && (
          <ResourceEditorModal
            entity={resourceModalSubtopic}
            saveUrl={`/api/admin/v2/examinations/subtopics/${resourceModalSubtopic.id}/`}
            showDescription={true}
            onClose={() => { setResourceModalSubtopic(null); fetchSyllabus(selectedExam.id); }}
            onSaved={(description, resourceLinks) => handleSubtopicSaved(resourceModalSubtopic.id, description, resourceLinks)}
          />
        )}
      </div>
    );
  }

  // ── Examination list view ─────────────────────────────────────────────
  return (
    <div className="global-view animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>Competitive Bank</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>Examinations and their syllabus, backing the Competitive Practice tile.</p>
        </div>
        <button onClick={() => setShowAddForm(v => !v)} className="primary-button" style={{ borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
          <Plus size={18} /> Add Examination
        </button>
      </div>

      {showAddForm && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: 20, background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)', marginBottom: 24 }}>
          <input
            placeholder="Name (e.g. GRE)"
            value={newExam.name}
            onChange={(e) => setNewExam({ ...newExam, name: e.target.value })}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 700, width: 180 }}
          />
          <input
            placeholder="Description (optional)"
            value={newExam.description}
            onChange={(e) => setNewExam({ ...newExam, description: e.target.value })}
            style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontWeight: 600, flex: 1, minWidth: 200 }}
          />
          <button onClick={handleCreateExam} disabled={creating || !newExam.name.trim()} className="primary-button" style={{ borderRadius: 10, padding: '10px 18px' }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-soft)' }}><Loader2 size={28} className="spin" /></div>
      ) : examinations.length === 0 ? (
        <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
          <Swords size={48} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 20 }} />
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 8 }}>No examinations yet</h3>
          <p style={{ color: 'var(--text-soft)', marginBottom: 24 }}>Add one (e.g. GRE, GATE, CAT) and upload its syllabus spreadsheet.</p>
          <button onClick={() => setShowAddForm(true)} className="primary-button" style={{ borderRadius: 14, padding: '12px 24px' }}>
            <Plus size={18} style={{ marginRight: 6 }} /> Add Examination
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {examinations.map((exam) => (
            <div key={exam.id} style={{ padding: 24, borderRadius: 24, background: 'white', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e0f2fe', color: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Swords size={20} />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {editingExamId !== exam.id && (
                    <button onClick={() => startEditExam(exam)} style={{ background: 'none', border: 'none', color: 'var(--text-soft)', cursor: 'pointer', padding: 6 }}>
                      <Pencil size={16} />
                    </button>
                  )}
                  <button onClick={() => handleDeleteExam(exam.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {editingExamId === exam.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    value={examDraft.name}
                    onChange={(e) => setExamDraft({ ...examDraft, name: e.target.value })}
                    placeholder="Name"
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontWeight: 800, fontSize: '1rem' }}
                  />
                  <input
                    value={examDraft.description}
                    onChange={(e) => setExamDraft({ ...examDraft, description: e.target.value })}
                    placeholder="Description"
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: '0.85rem' }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveExamEdit(exam.id)} disabled={savingExam} className="primary-button" style={{ flex: 1, borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Check size={14} /> {savingExam ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingExamId(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 850, color: 'var(--olive-950)' }}>{exam.name}</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>{exam.description || 'No description'}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, fontSize: '0.78rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                <span>{exam.section_count} sections</span>
                <span>{exam.topic_count} topics</span>
                <span>{exam.subtopic_count} subtopics</span>
              </div>
              <button onClick={() => openExam(exam)} className="primary-button" style={{ borderRadius: 12, padding: '10px 16px', fontSize: '0.85rem' }}>
                Manage Syllabus
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
