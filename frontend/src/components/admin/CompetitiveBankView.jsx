import { useState, useEffect } from 'react';
import { ArrowLeft, Swords, Plus, Trash2, Upload, ChevronDown, ChevronRight, Loader2, Link2, X, PlayCircle, BookOpen, Code2 } from 'lucide-react';
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
    setSelectedExam(exam);
    setUploadResult(null);
    setUploadError('');
    fetchSyllabus(exam.id);
  };

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
          <button onClick={() => setSelectedExam(null)} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>{selectedExam.name}</h2>
            <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>{selectedExam.description || 'Syllabus structure'}</p>
          </div>
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
          Expects a Section, Topic, Subtopic column (an Exam column is fine too, it's ignored). Re-uploading an updated sheet is safe — existing entries aren't duplicated. Click a topic tile to attach resources.
        </p>

        {syllabusLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-soft)' }}><Loader2 size={28} className="spin" /></div>
        ) : !syllabus || (syllabus.sections || []).length === 0 ? (
          <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
            <Upload size={48} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 20 }} />
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 8 }}>No syllabus uploaded yet</h3>
            <p style={{ color: 'var(--text-soft)' }}>Upload a syllabus spreadsheet to populate this examination's structure.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {syllabus.sections.map((section) => (
              <div key={section.id} className="surface-card" style={{ background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedSections(prev => ({ ...prev, [section.id]: !prev[section.id] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '18px 24px', background: 'var(--bg-2)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  {expandedSections[section.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span style={{ fontWeight: 850, fontSize: '1.05rem', color: 'var(--olive-950)' }}>{section.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-soft)', fontWeight: 700 }}>{section.topics.length} topics</span>
                </button>

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
                        <button
                          onClick={() => setResourceModalTopic(topic)}
                          style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Link2 size={14} style={{ color: 'var(--olive-600)', flexShrink: 0 }} />
                            <span style={{ fontWeight: 750, color: 'var(--olive-900)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.title}</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-soft)', fontWeight: 700 }}>
                            {topic.resource_links.length > 0 ? `${topic.resource_links.length} topic resource${topic.resource_links.length > 1 ? 's' : ''} — click to edit` : 'click to add topic resources'}
                          </div>
                        </button>

                        {topic.subtopics.length > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
                            {topic.subtopics.map((st) => (
                              <button
                                key={st.id}
                                onClick={() => setResourceModalSubtopic(st)}
                                title="Edit description & multimedia"
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
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
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
            onClose={() => setResourceModalSubtopic(null)}
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
                <button onClick={() => handleDeleteExam(exam.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 6 }}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.15rem', fontWeight: 850, color: 'var(--olive-950)' }}>{exam.name}</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-soft)' }}>{exam.description || 'No description'}</p>
              </div>
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
