// Admin Aptitude Bank — browse the same Category > Subcategory > Topic tree
// students see, then add/edit/delete/bulk-upload questions scoped to one
// topic at a time (never an "everything at once" flat list).
import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, Search, Loader2, RefreshCw, Trash2, Plus, Pencil, Save, Upload,
  ChevronDown, Calculator, Brain, MessageSquare, Sparkles, X,
} from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';
import FormattedText from '../common/FormattedText';

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
  question_text: '', question_image: '',
  option_a: '', option_a_image: '',
  option_b: '', option_b_image: '',
  option_c: '', option_c_image: '',
  option_d: '', option_d_image: '',
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

  async function deleteTopic(node, isCategory) {
    const warning = isCategory
      ? `Delete category "${node.title}"? This also deletes all ${node.subcategories.length} sub-topic(s) under it and every question in them. This cannot be undone.`
      : `Delete topic "${node.title}" and all ${node.question_count} question(s) in it? This cannot be undone.`;
    if (!window.confirm(warning)) return;
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-topics/${node.id}/`, 'DELETE');
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete.');
        return;
      }
      load();
    } catch {
      setError('Network error while deleting.');
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
                        <button onClick={(e) => { e.stopPropagation(); deleteTopic(cat, true); }} title="Delete category"
                          style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                          <Trash2 size={13} />
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
                          <button onClick={() => deleteTopic(sub, false)} title="Delete topic"
                            style={{ padding: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', flexShrink: 0, display: 'flex' }}>
                            <Trash2 size={14} />
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
        rows={2} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
      <input
        placeholder="Question image URL (optional)"
        value={form.question_image || ''}
        onChange={(e) => set('question_image', e.target.value)}
        style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 12, marginBottom: 12, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        {['A', 'B', 'C', 'D'].map((key) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            <input
              placeholder={`Option ${key} image URL (optional)`}
              value={form[`option_${key.toLowerCase()}_image`] || ''}
              onChange={(e) => set(`option_${key.toLowerCase()}_image`, e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 12, marginLeft: 26 }}
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
  const isPassage = topic.kind === 'passage';
  const parentField = isPassage ? 'passage_id' : 'topic_id';
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

  useEffect(() => { load(); if (!isPassage) loadTopics(); }, [topic.id]);

  async function load() {
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    try {
      const res = await apiFetch(`/api/admin/v2/aptitude-bank/?${parentField}=${topic.id}`, 'GET');
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
      const res = await apiFetch('/api/admin/v2/aptitude-bank/', 'POST', { ...form, [parentField]: topic.id });
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
      if (String(data[parentField]) !== String(topic.id)) {
        // Moved to a different topic/passage — no longer belongs in this scoped list.
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
            {questions.length} question{questions.length !== 1 ? 's' : ''} in this {isPassage ? 'passage' : 'topic'}
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
        {!isPassage && (
          <button onClick={() => { setShowBulkUpload((v) => !v); setBulkError(''); setBulkResult(null); }}
            style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
            <Upload size={16} /> Bulk Upload
          </button>
        )}
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
                            <FormattedText text={q.question_text} />
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
                                question_image: q.question_image || '',
                                option_a: q.option_a, option_a_image: q.option_a_image || '',
                                option_b: q.option_b, option_b_image: q.option_b_image || '',
                                option_c: q.option_c, option_c_image: q.option_c_image || '',
                                option_d: q.option_d, option_d_image: q.option_d_image || '',
                                correct_option: q.correct_option, difficulty: q.difficulty, explanation: q.explanation || '',
                              }}
                              topicOptions={topicOptions}
                              showTopicSelect={!isPassage}
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

function PassageList({ onSelect, onBack }) {
  const [passages, setPassages] = useState([]);
  const [topicOptions, setTopicOptions] = useState([]);
  const [topicFilter, setTopicFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newPassage, setNewPassage] = useState({ title: '', passage_text: '', difficulty: 'Medium', topic_id: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLimit, setImportLimit] = useState(20);
  const [importQuestionsPerPassage, setImportQuestionsPerPassage] = useState(10);
  const [importDifficulty, setImportDifficulty] = useState('Medium');
  const [importTopicId, setImportTopicId] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);

  useEffect(() => { load(); loadTopics(); }, [topicFilter]);

  async function load() {
    setLoading(true); setError('');
    try {
      const qs = topicFilter ? `?topic_id=${topicFilter}` : '';
      const res = await apiFetch(`/api/admin/v2/reading-passages/${qs}`, 'GET');
      if (!res.ok) throw new Error('Failed to load passages');
      const data = await res.json();
      setPassages(data.passages || []);
    } catch (err) {
      setError(err.message || 'Failed to load passages');
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

  async function createPassage() {
    if (!newPassage.title.trim() || !newPassage.passage_text.trim()) {
      setAddError('Title and passage text are required.');
      return;
    }
    setAddBusy(true); setAddError('');
    try {
      const res = await apiFetch('/api/admin/v2/reading-passages/', 'POST', newPassage);
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || 'Failed to create passage.'); return; }
      setPassages((prev) => [data, ...prev]);
      setShowAdd(false);
      setNewPassage({ title: '', passage_text: '', difficulty: 'Medium', topic_id: '' });
    } catch {
      setAddError('Network error.');
    } finally {
      setAddBusy(false);
    }
  }

  async function importQADataset() {
    if (!importFile) { setImportError('Choose a .xlsx file first.'); return; }
    setImportBusy(true); setImportError(''); setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('limit', String(importLimit));
      formData.append('questions_per_passage', String(importQuestionsPerPassage));
      formData.append('difficulty', importDifficulty);
      if (importTopicId) formData.append('topic_id', importTopicId);
      const res = await apiFetchForm('/api/admin/v2/reading-passages/import-qa/', formData);
      const data = await res.json();
      if (!res.ok) { setImportError(data.error || 'Import failed.'); return; }
      setImportResult(data);
      setImportFile(null);
      if (importFileRef.current) importFileRef.current.value = '';
      load();
    } catch {
      setImportError('Network error during import.');
    } finally {
      setImportBusy(false);
    }
  }

  async function deletePassage(p) {
    if (!window.confirm(`Delete "${p.title}" and all ${p.question_count} of its questions? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/admin/v2/reading-passages/${p.id}/`, 'DELETE');
      if (!res.ok && res.status !== 204) { setError('Failed to delete passage.'); return; }
      setPassages((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setError('Network error while deleting.');
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
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Reading Passages</h2>
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-soft)', fontSize: 13, color: 'var(--olive-900)' }}>
          <option value="">All topics</option>
          {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button onClick={() => { setShowImport((v) => !v); setImportError(''); setImportResult(null); }}
          style={{ marginLeft: 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <Upload size={16} /> Import Reading Q&A Excel
        </button>
        <button onClick={() => { setShowAdd((v) => !v); setAddError(''); }}
          style={{ background: 'var(--olive-900)', border: 'none', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'white', fontWeight: 700 }}>
          <Plus size={16} /> Add Passage
        </button>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {showImport && (
        <div style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid var(--border-soft)', marginBottom: 20 }}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-soft)' }}>
            Upload the merged reading QA dataset (.xlsx with a "Reading Passages" sheet and a
            "Questions & Answers" sheet) — each row in the first sheet becomes one passage, and a
            capped number of its questions (source data can have hundreds per passage) becomes MCQs
            with distractors drawn from other real answers under the same passage. Large files:
            import in batches using the limit below rather than all at once, to avoid the request
            timing out.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <input ref={importFileRef} type="file" accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
            <label style={{ fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Passages:
              <input type="number" min={1} max={500} value={importLimit}
                onChange={(e) => setImportLimit(e.target.value)}
                style={{ width: 70, padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 13 }} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
              Questions/passage:
              <input type="number" min={1} max={100} value={importQuestionsPerPassage}
                onChange={(e) => setImportQuestionsPerPassage(e.target.value)}
                style={{ width: 70, padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 13 }} />
            </label>
            <select value={importDifficulty} onChange={(e) => setImportDifficulty(e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 13 }}>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select value={importTopicId} onChange={(e) => setImportTopicId(e.target.value)}
              style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 13 }}>
              <option value="">No topic (unfiled)</option>
              {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={importQADataset} disabled={importBusy}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', cursor: importBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              {importBusy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Import
            </button>
          </div>
          {importError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{importError}</div>}
          {importResult && (
            <div style={{ fontSize: 12, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10 }}>
              Created {importResult.passages_created} passage(s), {importResult.questions_created} question(s).
              Skipped {importResult.questions_skipped} question(s) without enough distractors.
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid var(--border-soft)', marginBottom: 20 }}>
          <input placeholder="Passage title" value={newPassage.title}
            onChange={(e) => setNewPassage((p) => ({ ...p, title: e.target.value }))}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <textarea placeholder="Passage text" value={newPassage.passage_text} rows={6}
            onChange={(e) => setNewPassage((p) => ({ ...p, passage_text: e.target.value }))}
            style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <select value={newPassage.difficulty} onChange={(e) => setNewPassage((p) => ({ ...p, difficulty: e.target.value }))}
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13 }}>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
            <select value={newPassage.topic_id} onChange={(e) => setNewPassage((p) => ({ ...p, topic_id: e.target.value }))}
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 13, flex: 1 }}>
              <option value="">No topic (unfiled)</option>
              {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {addError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{addError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAdd(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
            <button type="button" onClick={createPassage} disabled={addBusy}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', cursor: addBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13 }}>
              {addBusy ? 'Creating…' : 'Create Passage'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}><Loader2 size={20} className="spin" /></div>
      ) : passages.length === 0 ? (
        <p style={{ color: 'var(--text-soft)', textAlign: 'center', padding: 40 }}>No passages yet — add one, or import a reading QA Excel file.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {passages.map((p) => (
            <div key={p.id} style={{
              background: 'white', borderRadius: 18, border: '1px solid var(--border-soft)', padding: 18,
              cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative',
            }} onClick={() => onSelect(p.id, p.title)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ background: diffBg(p.difficulty), color: diffColor(p.difficulty), padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {p.difficulty}
                </span>
                <button onClick={(e) => { e.stopPropagation(); deletePassage(p); }} title="Delete passage"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
                  <Trash2 size={15} />
                </button>
              </div>
              <div style={{ fontWeight: 800, color: 'var(--olive-950)', fontSize: 15, lineHeight: 1.3 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
                {p.question_count} question{p.question_count !== 1 ? 's' : ''}
                {p.topic ? ` · ${p.topic}` : ' · Unfiled'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── "AI Explanation Audit" — hit Run and it walks every aptitude question,
// asking an LLM to check/rewrite the explanation, in a background thread on
// the server (there can be 10,000+ questions). Polls for progress while
// running; safe to navigate away and come back, or Resume after a restart. ──
function ExplanationAuditPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    try {
      const res = await apiFetch('/api/admin/v2/aptitude-bank/explanation-audit/', 'GET');
      if (res.ok) setStatus(await res.json());
    } catch { /* keep last known status on a transient network blip */ }
  }

  useEffect(() => {
    loadStatus();
    const interval = setInterval(() => {
      setStatus((s) => {
        if (s && s.status === 'running') loadStatus();
        return s;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function doAction(action) {
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/v2/aptitude-bank/explanation-audit/', 'POST', { action });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Action failed.');
      } else {
        await loadStatus();
      }
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  const pct = status.total > 0 ? Math.min(100, Math.round((status.processed / status.total) * 100)) : 0;
  const isStalled = status.status === 'running' && status.stalled;
  const isRunning = status.status === 'running' && !isStalled;
  const canResume = (status.status === 'stopped' || isStalled) && status.processed > 0 && status.processed < status.total;
  const isCompleted = status.status === 'completed';

  return (
    <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={18} color="var(--olive-700)" />
          <div>
            <div style={{ fontWeight: 800, color: 'var(--olive-900)', fontSize: 14 }}>AI Explanation Audit</div>
            <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>
              {isRunning
                ? `Checking question ${status.processed}/${status.total} — ${status.corrected} corrected so far${status.failed ? `, ${status.failed} failed` : ''}`
                : isCompleted
                ? `Done — ${status.corrected} of ${status.total} explanations corrected${status.failed ? ` (${status.failed} failed)` : ''}`
                : isStalled
                ? `Stalled at ${status.processed}/${status.total} (a deploy or restart likely killed it) — click Resume to continue`
                : canResume
                ? `Paused at ${status.processed}/${status.total} — ${status.corrected} corrected so far`
                : 'Reviews every aptitude question and rewrites the explanation if it’s wrong or missing.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isRunning ? (
            <button onClick={() => doAction('stop')} disabled={busy}
              style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
              Stop
            </button>
          ) : canResume ? (
            <>
              <button onClick={() => doAction('start')} disabled={busy}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                Resume
              </button>
              <button onClick={() => doAction('reset')} disabled={busy}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-soft)', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
                Start Over
              </button>
            </>
          ) : isCompleted ? (
            <button onClick={() => doAction('reset').then(() => doAction('start'))} disabled={busy}
              style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
              Run Again
            </button>
          ) : (
            <button onClick={() => doAction('start')} disabled={busy}
              style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Starting…' : 'Run Audit'}
            </button>
          )}
        </div>
      </div>
      {(isRunning || canResume || isCompleted) && (
        <div style={{ marginTop: 12, height: 8, background: 'var(--bg-2)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: isCompleted ? '#059669' : 'var(--olive-700)', borderRadius: 8, transition: 'width 0.4s ease' }} />
        </div>
      )}
      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>}
      {status.last_error && !error && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-soft)' }}>Last error: {status.last_error.slice(0, 200)}</div>
      )}
    </div>
  );
}

export default function AptitudeBankView({ onBack }) {
  const [mode, setMode] = useState('topics'); // 'topics' | 'passages'
  const [selectedTopic, setSelectedTopic] = useState(null); // { id, label, kind? }

  if (selectedTopic) {
    return <TopicQuestionsManager topic={selectedTopic} onBack={() => setSelectedTopic(null)} />;
  }

  if (mode === 'passages') {
    return (
      <PassageList
        onSelect={(id, label) => setSelectedTopic({ id, label, kind: 'passage' })}
        onBack={() => setMode('topics')}
      />
    );
  }

  return (
    <div>
      <ExplanationAuditPanel />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => setMode('passages')}
          style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', fontWeight: 700, color: 'var(--olive-900)' }}>
          Reading Passages →
        </button>
      </div>
      <TopicTree onSelect={(id, label) => setSelectedTopic({ id, label, kind: 'topic' })} onBack={onBack} />
    </div>
  );
}
