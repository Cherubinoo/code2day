import { useState, useEffect } from 'react';
import { ArrowLeft, Swords, Plus, Trash2, Upload, ChevronDown, ChevronRight, Loader2, Link2 } from 'lucide-react';
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

// Admin content bank for Competitive Practice — Examinations (GRE, GATE...)
// each own a Section > Topic > Subtopic syllabus tree, populated in one
// shot via an Excel upload. Question content and per-topic resource links
// are later additions; this screen only manages the syllabus structure.
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
          Expects a Section, Topic, Subtopic column (an Exam column is fine too, it's ignored). Re-uploading an updated sheet is safe — existing entries aren't duplicated.
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
                  <div style={{ padding: '8px 24px 20px' }}>
                    {section.topics.map((topic) => (
                      <div key={topic.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Link2 size={14} style={{ color: 'var(--olive-600)', flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: 'var(--olive-900)', fontSize: '0.95rem' }}>{topic.title}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-soft)', fontWeight: 600 }}>({topic.subtopics.length})</span>
                          {topic.resource_links.length === 0 && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-soft)', fontStyle: 'italic', marginLeft: 4 }}>no resources yet</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 22 }}>
                          {topic.subtopics.map((st) => (
                            <span key={st.id} style={{ fontSize: '0.78rem', color: 'var(--text-soft)', background: 'var(--bg-2)', padding: '4px 10px', borderRadius: 8 }}>
                              {st.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
