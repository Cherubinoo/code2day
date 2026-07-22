// Admin Aptitude Bank — browse the same Category > Subcategory > Topic tree
// students see, then add/edit/delete/bulk-upload questions scoped to one
// topic at a time (never an "everything at once" flat list).
import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Search, Loader2, RefreshCw, Trash2, Plus, Pencil, Save, Upload,
  ChevronDown, Calculator, Brain, MessageSquare, Sparkles, X,
} from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

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

const BLANK_FORM = {
  question_text: '', option_a: '', option_b: '', option_c: '', option_d: '',
  correct_option: 'A', difficulty: 'Easy', explanation: '',
};

function flattenTopics(categories) {
  // Stops at the subcategory (main topic) level on purpose — questions are
  // managed per main topic (e.g. "AVERAGES"), not split out per subtopic.
  const out = [];
  (categories || []).forEach((cat) => {
    (cat.subcategories || []).forEach((sub) => {
      out.push({ id: sub.id, label: `${cat.title} > ${sub.title}` });
    });
  });
  return out;
}

// ── Small inline add/rename form (input + save/cancel), reused for
// categories, main topics, and rename-in-place on either. ─────────────────────
function InlineTitleForm({ value, onChange, onSubmit, onCancel, busy, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}
      />
      <button onClick={onSubmit} disabled={busy} title="Save"
        style={{ padding: 6, border: 'none', background: 'none', cursor: busy ? 'not-allowed' : 'pointer', color: 'var(--olive-900)', display: 'flex' }}>
        {busy ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
      </button>
      <button onClick={onCancel} title="Cancel"
        style={{ padding: 6, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── Topic tree browser (mirrors the student Aptitude page's structure) ────────
function TopicTree({ onSelect, onBack }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCats, setExpandedCats] = useState({});

  // Rename-in-place — shared by category rows and main-topic cards; only one
  // node can be renamed at a time so a single id/value pair is enough.
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState('');

  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState('');
  const [addCategoryBusy, setAddCategoryBusy] = useState(false);
  const [addCategoryError, setAddCategoryError] = useState('');

  const [addingTopicForCat, setAddingTopicForCat] = useState(null); // category id, or null
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [addTopicBusy, setAddTopicBusy] = useState(false);
  const [addTopicError, setAddTopicError] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/aptitude/topics/', 'GET');
      if (!res.ok) throw new Error('Failed to load topics');
      const data = await res.json();
      setCategories(data.categories || []);
      if ((data.categories || []).length > 0) setExpandedCats({ [data.categories[0].id]: true });
    } catch (err) {
      setError(err.message || 'Failed to load topics');
    } finally {
      setLoading(false);
    }
  }

  async function createTopic(parentId, title) {
    const res = await apiFetch('/api/admin/v2/aptitude-topics/', 'POST', { title, parent_id: parentId });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create topic.');
  }

  async function submitNewCategory() {
    const title = newCategoryTitle.trim();
    if (!title) { setAddCategoryError('Name is required.'); return; }
    setAddCategoryBusy(true); setAddCategoryError('');
    try {
      await createTopic(null, title);
      setNewCategoryTitle(''); setAddingCategory(false);
      load();
    } catch (err) {
      setAddCategoryError(err.message || 'Network error.');
    } finally {
      setAddCategoryBusy(false);
    }
  }

  async function submitNewTopic(catId) {
    const title = newTopicTitle.trim();
    if (!title) { setAddTopicError('Name is required.'); return; }
    setAddTopicBusy(true); setAddTopicError('');
    try {
      await createTopic(catId, title);
      setNewTopicTitle(''); setAddingTopicForCat(null);
      load();
    } catch (err) {
      setAddTopicError(err.message || 'Network error.');
    } finally {
      setAddTopicBusy(false);
    }
  }

  function startRename(id, currentTitle) {
    setRenamingId(id); setRenameValue(currentTitle); setRenameError('');
  }

  async function submitRename() {
    const title = renameValue.trim();
    if (!title) { setRenameError('Name is required.'); return; }
    setRenameBusy(true); setRenameError('');
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-topics/${renamingId}/`, 'PATCH', { title });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.error || 'Failed to rename.'); return; }
      setRenamingId(null);
      load();
    } catch {
      setRenameError('Network error.');
    } finally {
      setRenameBusy(false);
    }
  }

  const catIcon = (title) => (
    title.includes('QUANT') ? <Calculator size={22} /> : title.includes('LOGIC') ? <Brain size={22} /> : <MessageSquare size={22} />
  );

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--border-soft)', width: 44, height: 44, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-900)', boxShadow: 'var(--shadow-soft)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Aptitude Bank</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0', fontSize: '0.95rem' }}>
            Pick a topic to add, edit, delete, or bulk-upload its questions.
          </p>
        </div>
        <button onClick={() => { setAddingCategory((v) => !v); setNewCategoryTitle(''); setAddCategoryError(''); }}
          style={{ marginLeft: 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <Plus size={16} /> New Category
        </button>
        <button onClick={load} disabled={loading}
          style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {addingCategory && (
        <div style={{ marginBottom: 16, background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 14 }}>
          <InlineTitleForm
            value={newCategoryTitle} onChange={setNewCategoryTitle}
            onSubmit={submitNewCategory} onCancel={() => setAddingCategory(false)}
            busy={addCategoryBusy} placeholder="Category name (e.g. QUANTITATIVE)"
          />
          {addCategoryError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{addCategoryError}</div>}
        </div>
      )}

      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>Loading topics…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {categories.map((cat) => (
            <section key={cat.id} style={{ background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedCats((s) => ({ ...s, [cat.id]: !s[cat.id] }))}
                style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--bg-2)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--olive-900)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {catIcon(cat.title)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {renamingId === cat.id ? (
                      <>
                        <InlineTitleForm
                          value={renameValue} onChange={setRenameValue}
                          onSubmit={submitRename} onCancel={() => setRenamingId(null)}
                          busy={renameBusy} placeholder="Category name"
                        />
                        {renameError && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{renameError}</div>}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--olive-950)' }}>{cat.title}</div>
                        <button onClick={(e) => { e.stopPropagation(); startRename(cat.id, cat.title); }} title="Rename category"
                          style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--olive-600)', display: 'flex' }}>
                          <Pencil size={13} />
                        </button>
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                      {cat.subcategories.length} sub-topics &middot; {cat.question_count} questions
                    </div>
                  </div>
                </div>
                <ChevronDown size={20} style={{ transform: expandedCats[cat.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--olive-900)', flexShrink: 0 }} />
              </div>

              {expandedCats[cat.id] && (
                <div style={{ padding: '8px 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {cat.subcategories.map((sub) => (
                    <div key={sub.id} style={{ background: 'var(--bg-2)', borderRadius: 14, border: '1px solid var(--border-soft)', padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      {renamingId === sub.id ? (
                        <div style={{ flex: 1 }}>
                          <InlineTitleForm
                            value={renameValue} onChange={setRenameValue}
                            onSubmit={submitRename} onCancel={() => setRenamingId(null)}
                            busy={renameBusy} placeholder="Topic name"
                          />
                          {renameError && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{renameError}</div>}
                        </div>
                      ) : (
                        <>
                          <button onClick={() => onSelect(sub.id, `${cat.title} > ${sub.title}`)}
                            style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{sub.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-soft)' }}>{sub.question_count} questions</div>
                          </button>
                          <button onClick={() => startRename(sub.id, sub.title)} title="Rename topic"
                            style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--olive-600)', flexShrink: 0, display: 'flex' }}>
                            <Pencil size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {addingTopicForCat === cat.id ? (
                    <div style={{ background: 'var(--bg-2)', borderRadius: 14, border: '1px dashed var(--border-soft)', padding: 14 }}>
                      <InlineTitleForm
                        value={newTopicTitle} onChange={setNewTopicTitle}
                        onSubmit={() => submitNewTopic(cat.id)} onCancel={() => setAddingTopicForCat(null)}
                        busy={addTopicBusy} placeholder="Main topic name"
                      />
                      {addTopicError && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{addTopicError}</div>}
                    </div>
                  ) : (
                    <button onClick={() => { setAddingTopicForCat(cat.id); setNewTopicTitle(''); setAddTopicError(''); }}
                      style={{ background: 'white', borderRadius: 14, border: '1px dashed var(--border-soft)', padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700, fontSize: 13 }}>
                      <Plus size={14} /> Add Main Topic
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Question add/edit form ─────────────────────────────────────────────────────
function QuestionForm({ initial, topicOptions, showTopicSelect, busy, error, onCancel, onSubmit, submitLabel }) {
  const [form, setForm] = useState(initial);
  useEffect(() => { setForm(initial); }, [initial]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid var(--border-soft)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: showTopicSelect ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        {showTopicSelect && (
          <select value={form.topic_id || ''} onChange={(e) => set('topic_id', e.target.value)}
            style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}>
            <option value="">Select topic…</option>
            {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        )}
        <select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}
          style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
      </div>
      <textarea placeholder="Question text" value={form.question_text} onChange={(e) => set('question_text', e.target.value)}
        rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {['A', 'B', 'C', 'D'].map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="radio" name="correct_option" checked={form.correct_option === key}
                onChange={() => set('correct_option', key)} />
              {key}
            </label>
            <input
              placeholder={`Option ${key}`}
              value={form[`option_${key.toLowerCase()}`]}
              onChange={(e) => set(`option_${key.toLowerCase()}`, e.target.value)}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}
            />
          </div>
        ))}
      </div>
      <textarea placeholder="Explanation (optional)" value={form.explanation} onChange={(e) => set('explanation', e.target.value)}
        rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Cancel
        </button>
        <button type="button" onClick={() => onSubmit(form)} disabled={busy}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {submitLabel}
        </button>
      </div>
    </div>
  );
}

// ── Questions for ONE topic — add/edit/delete/bulk-upload, scoped ─────────────
function TopicQuestionsManager({ topic, onBack }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [topicOptions, setTopicOptions] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [validateStates, setValidateStates] = useState({}); // { [id]: { busy, msg, ok } }
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');
  const fileInputRef = useRef(null);
  const PAGE_SIZE = 50;

  useEffect(() => { load(); loadTopics(); }, [topic.id]);

  async function load() {
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-bank/?topic_id=${topic.id}`, 'GET');
      if (!res.ok) throw new Error('Failed to load questions');
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }

  async function loadTopics() {
    try {
      const res = await apiFetch('/api/aptitude/topics/', 'GET');
      if (!res.ok) return;
      const data = await res.json();
      setTopicOptions(flattenTopics(data.categories));
    } catch { /* non-fatal */ }
  }

  const filtered = useMemo(() => {
    let list = questions;
    if (difficultyFilter !== 'all') list = list.filter((q) => q.difficulty === difficultyFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((q) => q.question_text.toLowerCase().includes(s));
    }
    return list;
  }, [questions, difficultyFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, difficultyFilter]);

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const allSelected = pageItems.length > 0 && pageItems.every((q) => prev.has(q.id));
      const next = new Set(prev);
      if (allSelected) pageItems.forEach((q) => next.delete(q.id));
      else pageItems.forEach((q) => next.add(q.id));
      return next;
    });
  }

  async function createQuestion(form) {
    setAddBusy(true); setAddError('');
    try {
      const res = await apiFetch('/api/admin/v2/aptitude-bank/', 'POST', { ...form, topic_id: topic.id });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Failed to create question.'); return; }
      setQuestions((prev) => [data, ...prev]);
      setShowAddForm(false);
    } catch {
      setAddError('Network error.');
    } finally {
      setAddBusy(false);
    }
  }

  async function saveEdit(id, form) {
    setEditBusy(true); setEditError('');
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-bank/${id}/`, 'PUT', form);
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || 'Failed to save.'); return; }
      if (String(data.topic_id) !== String(topic.id)) {
        // Moved to a different topic — no longer belongs in this scoped list.
        setQuestions((prev) => prev.filter((q) => q.id !== id));
      } else {
        setQuestions((prev) => prev.map((q) => (q.id === id ? data : q)));
      }
      setEditingId(null);
    } catch {
      setEditError('Network error.');
    } finally {
      setEditBusy(false);
    }
  }

  async function validateQuestion(q) {
    setValidateStates((s) => ({ ...s, [q.id]: { busy: true, msg: '', ok: true } }));
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-bank/${q.id}/validate/`, 'POST');
      const data = await res.json();
      if (!res.ok) {
        setValidateStates((s) => ({ ...s, [q.id]: { busy: false, msg: data.error || 'Validation failed.', ok: false } }));
        return;
      }
      setQuestions((prev) => prev.map((x) => (x.id === q.id ? data : x)));
      const changed = data.changed_fields || [];
      const msg = changed.length === 0
        ? 'Verified — already correct.'
        : `Fixed (${changed.join(', ')})${data.reason ? `: ${data.reason}` : '.'}`;
      setValidateStates((s) => ({ ...s, [q.id]: { busy: false, msg, ok: true } }));
    } catch {
      setValidateStates((s) => ({ ...s, [q.id]: { busy: false, msg: 'Network error during validation.', ok: false } }));
    }
  }

  async function deleteQuestion(q) {
    if (!window.confirm('Delete this aptitude question? This cannot be undone.')) return;
    setDeletingId(q.id);
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-bank/${q.id}/`, 'DELETE');
      if (!res.ok && res.status !== 204) { setError('Failed to delete question.'); return; }
      setQuestions((prev) => prev.filter((x) => x.id !== q.id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(q.id); return next; });
    } catch {
      setError('Network error while deleting.');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected question(s) from "${topic.label}"? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await apiFetch('/api/admin/v2/aptitude-bank/bulk-delete/', 'POST', { ids: Array.from(selectedIds) });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Bulk delete failed.'); return; }
      setQuestions((prev) => prev.filter((q) => !selectedIds.has(q.id)));
      setSelectedIds(new Set());
    } catch {
      setError('Network error during bulk delete.');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function uploadBulkFile() {
    if (!bulkFile) { setBulkError('Choose a .xlsx, .xls, or .csv file first.'); return; }
    setBulkBusy(true); setBulkError(''); setBulkResult(null);
    try {
      const formData = new FormData();
      formData.append('topic_id', topic.id);
      formData.append('file', bulkFile);
      const res = await apiFetchForm('/api/admin/v2/aptitude-bank/bulk-upload/', formData);
      const data = await res.json();
      if (!res.ok) { setBulkError(data.error || 'Bulk upload failed.'); return; }
      setBulkResult(data);
      setBulkFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch {
      setBulkError('Network error during upload.');
    } finally {
      setBulkBusy(false);
    }
  }

  const diffColor = (d) => (d === 'Easy' ? '#166534' : d === 'Medium' ? '#92400e' : '#991b1b');
  const diffBg = (d) => (d === 'Easy' ? '#dcfce7' : d === 'Medium' ? '#fef3c7' : '#fee2e2');

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--border-soft)', width: 44, height: 44, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-900)', boxShadow: 'var(--shadow-soft)' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>{topic.label}</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0', fontSize: '0.9rem' }}>
            {questions.length} question{questions.length !== 1 ? 's' : ''} in this topic
          </p>
        </div>
        {selectedIds.size > 0 && (
          <button onClick={deleteSelected} disabled={bulkDeleting}
            style={{ marginLeft: 'auto', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', cursor: bulkDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700 }}>
            {bulkDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            Delete Selected ({selectedIds.size})
          </button>
        )}
        <button onClick={() => { setShowAddForm((v) => !v); setAddError(''); }}
          style={{ marginLeft: selectedIds.size > 0 ? 0 : 'auto', background: 'var(--olive-900)', border: 'none', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'white', fontWeight: 700 }}>
          <Plus size={16} /> Add Question
        </button>
        <button onClick={() => { setShowBulkUpload((v) => !v); setBulkError(''); setBulkResult(null); }}
          style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <Upload size={16} /> Bulk Upload
        </button>
        <button onClick={load} disabled={loading}
          style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {showAddForm && (
        <div style={{ marginBottom: 20 }}>
          <QuestionForm
            initial={BLANK_FORM}
            topicOptions={topicOptions}
            showTopicSelect={false}
            busy={addBusy}
            error={addError}
            onCancel={() => setShowAddForm(false)}
            onSubmit={createQuestion}
            submitLabel={`Add to "${topic.label.split(' > ').pop()}"`}
          />
        </div>
      )}

      {showBulkUpload && (
        <div style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid var(--border-soft)', marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-soft)' }}>
            Upload a .xlsx, .xls, or .csv file — every row becomes a question under <strong>{topic.label}</strong>.
            Columns: <code>Question</code>, <code>Option A</code>-<code>Option D</code>, <code>Correct Answer</code>/<code>Answer</code>{' '}
            (A-D or the option's own text), and optionally <code>Question No</code>, <code>Difficulty</code>/<code>Level</code>, and <code>Explanation</code> — extra columns are ignored.
            Duplicate question text under this topic is skipped automatically.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
              onChange={(e) => setBulkFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
            <button type="button" onClick={uploadBulkFile} disabled={bulkBusy}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', cursor: bulkBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              {bulkBusy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload
            </button>
          </div>
          {bulkError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{bulkError}</div>}
          {bulkResult && (
            <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10 }}>
              Created {bulkResult.created_count}, skipped {bulkResult.skipped_count} duplicate(s)
              {bulkResult.error_count > 0 && `, ${bulkResult.error_count} row(s) had errors`}.
              {bulkResult.errors && bulkResult.errors.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {bulkResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input type="text" placeholder="Search within this topic…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: 14, border: '1px solid var(--border-soft)', fontSize: '0.95rem' }} />
        </div>
        <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}
          style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border-soft)', fontSize: '0.9rem' }}>
          <option value="all">All Difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </select>
      </div>

      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>Loading questions…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>
          {questions.length === 0 ? 'No questions in this topic yet — add one or bulk upload.' : 'No questions match this search.'}
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border-soft)', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg-2)', borderBottom: '2px solid var(--border-soft)' }}>
                  <th style={{ textAlign: 'center', padding: '12px 10px', width: 32 }}>
                    <input type="checkbox" checked={pageItems.length > 0 && pageItems.every((q) => selectedIds.has(q.id))} onChange={toggleSelectAllOnPage} />
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Question</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>Difficulty</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>Correct</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((q) => {
                  const editing = editingId === q.id;
                  const validateState = validateStates[q.id] || { busy: false, msg: '', ok: true };
                  return (
                    <Fragment key={q.id}>
                      <tr style={{ borderBottom: editing ? 'none' : '1px solid var(--bg-1)' }}>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedIds.has(q.id)} onChange={() => toggleSelected(q.id)} />
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: 420 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {q.question_text}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: diffBg(q.difficulty), color: diffColor(q.difficulty) }}>
                            {q.difficulty}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#166534' }}>{q.correct_option}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => validateQuestion(q)} disabled={validateState.busy} title="AI-validate this question and answer"
                            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-900)', cursor: validateState.busy ? 'not-allowed' : 'pointer', marginRight: 8 }}>
                            {validateState.busy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                          </button>
                          <button onClick={() => { setEditingId(editing ? null : q.id); setEditError(''); }} title="Edit"
                            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-900)', cursor: 'pointer', marginRight: 8 }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deleteQuestion(q)} disabled={deletingId === q.id} title="Delete"
                            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: deletingId === q.id ? 'not-allowed' : 'pointer' }}>
                            {deletingId === q.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                          </button>
                          {validateState.msg && (
                            <div style={{ fontSize: 11, marginTop: 6, textAlign: 'right', color: validateState.ok ? '#166534' : '#dc2626' }}>
                              {validateState.msg}
                            </div>
                          )}
                        </td>
                      </tr>
                      {editing && (
                        <tr style={{ borderBottom: '1px solid var(--bg-1)' }}>
                          <td colSpan={5} style={{ padding: '0 16px 20px', background: 'var(--bg-2)' }}>
                            <QuestionForm
                              initial={{
                                topic_id: String(q.topic_id || ''), question_text: q.question_text,
                                option_a: q.option_a, option_b: q.option_b, option_c: q.option_c, option_d: q.option_d,
                                correct_option: q.correct_option, difficulty: q.difficulty, explanation: q.explanation || '',
                              }}
                              topicOptions={topicOptions}
                              showTopicSelect
                              busy={editBusy}
                              error={editError}
                              onCancel={() => setEditingId(null)}
                              onSubmit={(form) => saveEdit(q.id, form)}
                              submitLabel="Save Changes"
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                Previous
              </button>
              <span style={{ padding: '8px 12px', color: 'var(--text-soft)', fontWeight: 600 }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AptitudeBankView({ onBack }) {
  const [selectedTopic, setSelectedTopic] = useState(null); // { id, label }

  if (selectedTopic) {
    return <TopicQuestionsManager topic={selectedTopic} onBack={() => setSelectedTopic(null)} />;
  }
  return <TopicTree onSelect={(id, label) => setSelectedTopic({ id, label })} onBack={onBack} />;
}
