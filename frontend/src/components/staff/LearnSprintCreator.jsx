// Learn Sprint creator — a multi-day scheduled contest series. Deliberately
// a single scrollable form (not a strict step wizard like
// EnhancedContestCreator) since every field here feeds one allocation pass
// server-side; splitting it into steps would just add navigation state for
// no functional benefit. Reuses the same building blocks that creator uses:
// the /api/problems/ + /api/batches/ + /api/aptitude/topics/ endpoints, and
// the same inline-MCQ-authoring pattern as its CustomQuestionsPanel.
import { useState, useEffect, useMemo } from 'react';
import { X, Plus, CalendarClock, Code, Brain, BookOpen, ListChecks } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const SECTION_META = {
  programming: { label: 'Programming', icon: Code, countLabel: 'Problems / day' },
  aptitude: { label: 'Aptitude', icon: Brain, countLabel: 'Questions / day' },
  reading: { label: 'Reading Comprehension', icon: BookOpen, countLabel: 'Passages / day' },
  manual: { label: 'Manual Questions', icon: ListChecks, countLabel: 'Questions / day' },
};

const BLANK_MANUAL_Q = () => ({
  question_text: '', question_image: '',
  option_a: '', option_b: '', option_c: '', option_d: '',
  correct_option: 'A', explanation: '',
});

const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' };
const cardStyle = { padding: 16, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fafafa', marginBottom: 16 };
const labelStyle = { fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 };

function TopicPicker({ categories, selected, mode, onModeChange, onTopicsChange, keyField }) {
  const flat = useMemo(() => {
    const out = [];
    (categories || []).forEach((cat) => {
      (cat.subcategories || []).forEach((sub) => {
        out.push({ key: sub.id, label: `${cat.title} — ${sub.title}`, count: sub.question_count });
      });
    });
    return out;
  }, [categories]);

  const selectedKeys = new Set(selected.map((t) => t[keyField]));
  const toggle = (key) => {
    if (selectedKeys.has(key)) {
      onTopicsChange(selected.filter((t) => t[keyField] !== key));
    } else {
      onTopicsChange([...selected, { [keyField]: key, weight: 0 }]);
    }
  };
  const setWeight = (key, weight) => {
    onTopicsChange(selected.map((t) => (t[keyField] === key ? { ...t, weight: parseInt(weight) || 0 } : t)));
  };
  const weightSum = selected.reduce((s, t) => s + (t.weight || 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="radio" checked={mode === 'random'} onChange={() => onModeChange('random')} /> Random allocation
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="radio" checked={mode === 'weighted'} onChange={() => onModeChange('weighted')} /> Weighted by topic
        </label>
      </div>
      <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto', padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
        {flat.map((t) => (
          <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flex: 1 }}>
              <input type="checkbox" checked={selectedKeys.has(t.key)} onChange={() => toggle(t.key)} />
              {t.label} <span style={{ color: '#94a3b8', fontSize: 11 }}>({t.count} available)</span>
            </label>
            {mode === 'weighted' && selectedKeys.has(t.key) && (
              <input
                type="number" min="0" max="100" style={{ width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                value={(selected.find((s) => s[keyField] === t.key) || {}).weight || 0}
                onChange={(e) => setWeight(t.key, e.target.value)}
              />
            )}
          </div>
        ))}
        {flat.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>No topics found.</p>}
      </div>
      {mode === 'weighted' && selected.length > 0 && weightSum !== 100 && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>Topic weights must add up to 100% (currently {weightSum}%).</p>
      )}
      {selected.length === 0 && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>Select at least one topic.</p>}
    </div>
  );
}

function ManualQuestionsPanel({ questions, setQuestions, needed }) {
  const updateQ = (idx, patch) => setQuestions((list) => list.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  const OPTS = ['a', 'b', 'c', 'd'];
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
        Author exactly {needed} question(s) — one per day slot ({questions.length}/{needed} written).
      </p>
      <div style={{ display: 'grid', gap: 14 }}>
        {questions.map((q, idx) => {
          const incomplete = !(q.question_text || '').trim() || OPTS.some((o) => !(q['option_' + o] || '').trim());
          return (
            <div key={idx} style={{ padding: 12, borderRadius: 8, border: incomplete ? '1px solid #fca5a5' : '1px solid #e5e7eb', background: 'white' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Q{idx + 1}</div>
              <textarea placeholder="Question stem…" rows={2} value={q.question_text}
                onChange={(e) => updateQ(idx, { question_text: e.target.value })}
                style={{ ...inputStyle, resize: 'vertical', marginBottom: 8 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 8 }}>
                {OPTS.map((o) => (
                  <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="radio" name={`ls_correct_${idx}`} checked={q.correct_option === o.toUpperCase()}
                      onChange={() => updateQ(idx, { correct_option: o.toUpperCase() })} />
                    <input placeholder={`Option ${o.toUpperCase()}`} value={q['option_' + o]}
                      onChange={(e) => updateQ(idx, { ['option_' + o]: e.target.value })} style={inputStyle} />
                  </label>
                ))}
              </div>
              <input placeholder="Explanation (optional)" value={q.explanation}
                onChange={(e) => updateQ(idx, { explanation: e.target.value })} style={inputStyle} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LearnSprintCreator({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '', description: '',
    batch: '', section: '',
    sections: [],
    programming_per_day: 1, aptitude_per_day: 5, reading_per_day: 1, manual_per_day: 1,
    programming_weight_percent: 25, aptitude_weight_percent: 25, reading_weight_percent: 25, manual_weight_percent: 25,
    topic_config: {
      programming: { mode: 'random', topics: [] },
      aptitude: { mode: 'random', topics: [] },
      reading: { mode: 'random', topics: [] },
    },
    sprint_dates: [],
    daily_start_time: '18:00', daily_end_time: '20:00',
    manual_questions: [],
    submit_for_approval: false,
  });
  const [dateToAdd, setDateToAdd] = useState('');
  const [problems, setProblems] = useState([]);
  const [aptitudeCategories, setAptitudeCategories] = useState([]);
  const [batches, setBatches] = useState([]);
  const [sectionsByBatch, setSectionsByBatch] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const [problemsRes, aptitudeRes, batchesRes] = await Promise.all([
        fetch('/api/problems/', { credentials: 'include' }),
        fetch('/api/aptitude/topics/', { credentials: 'include' }),
        fetch('/api/batches/', { credentials: 'include' }),
      ]);
      if (problemsRes.ok) {
        const data = await problemsRes.json();
        setProblems(Array.isArray(data) ? data : (data.problems || []));
      }
      if (aptitudeRes.ok) {
        const data = await aptitudeRes.json();
        setAptitudeCategories(data.categories || []);
      }
      if (batchesRes.ok) {
        const data = await batchesRes.json();
        setBatches(data.batches || []);
        setSectionsByBatch(data.sections_by_batch || {});
      }
    })();
  }, []);

  const programmingTags = useMemo(() => {
    const set = new Set();
    problems.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort().map((tag) => ({
      id: tag, title: tag, question_count: problems.filter((p) => (p.tags || []).includes(tag)).length,
    }));
  }, [problems]);
  const programmingCategories = [{ title: 'Topics', subcategories: programmingTags }];

  const dayCount = formData.sprint_dates.length;
  const manualNeeded = formData.sections.includes('manual') ? dayCount * (parseInt(formData.manual_per_day) || 0) : 0;

  useEffect(() => {
    setFormData((prev) => {
      const list = prev.manual_questions.slice(0, manualNeeded);
      while (list.length < manualNeeded) list.push(BLANK_MANUAL_Q());
      return { ...prev, manual_questions: list };
    });
  }, [manualNeeded]);

  function toggleSection(key) {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.includes(key) ? prev.sections.filter((s) => s !== key) : [...prev.sections, key],
    }));
  }

  function addDate() {
    if (!dateToAdd) return;
    setFormData((prev) => ({
      ...prev,
      sprint_dates: [...new Set([...prev.sprint_dates, dateToAdd])].sort(),
    }));
    setDateToAdd('');
  }
  function removeDate(d) {
    setFormData((prev) => ({ ...prev, sprint_dates: prev.sprint_dates.filter((x) => x !== d) }));
  }

  function setTopicConfig(key, patch) {
    setFormData((prev) => ({
      ...prev,
      topic_config: { ...prev.topic_config, [key]: { ...prev.topic_config[key], ...patch } },
    }));
  }

  const weightSum = formData.sections.reduce((s, k) => s + (parseInt(formData[`${k}_weight_percent`]) || 0), 0);

  function hasErrors() {
    if (!formData.title.trim()) return true;
    if (!formData.batch) return true;
    if (formData.sections.length === 0) return true;
    if (dayCount === 0) return true;
    if (!formData.daily_start_time || !formData.daily_end_time) return true;
    if (weightSum !== 100) return true;
    for (const key of ['programming', 'aptitude', 'reading']) {
      if (!formData.sections.includes(key)) continue;
      const cfg = formData.topic_config[key];
      if (!cfg.topics.length) return true;
      if (cfg.mode === 'weighted' && cfg.topics.reduce((s, t) => s + (t.weight || 0), 0) !== 100) return true;
    }
    if (formData.sections.includes('manual')) {
      if (formData.manual_questions.length !== manualNeeded) return true;
      if (formData.manual_questions.some((q) => !q.question_text.trim() || ['a', 'b', 'c', 'd'].some((o) => !q[`option_${o}`].trim()))) return true;
    }
    return false;
  }

  async function handleSubmit(submitForApproval) {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        batch: formData.batch,
        section: formData.section,
        sections: formData.sections,
        programming_per_day: formData.programming_per_day,
        aptitude_per_day: formData.aptitude_per_day,
        reading_per_day: formData.reading_per_day,
        manual_per_day: formData.manual_per_day,
        programming_weight_percent: formData.programming_weight_percent,
        aptitude_weight_percent: formData.aptitude_weight_percent,
        reading_weight_percent: formData.reading_weight_percent,
        manual_weight_percent: formData.manual_weight_percent,
        topic_config: {
          programming: { mode: formData.topic_config.programming.mode, topics: formData.topic_config.programming.topics.map((t) => ({ tag: t.id, weight: t.weight })) },
          aptitude: { mode: formData.topic_config.aptitude.mode, topics: formData.topic_config.aptitude.topics.map((t) => ({ topic_id: t.id, weight: t.weight })) },
          reading: { mode: formData.topic_config.reading.mode, topics: formData.topic_config.reading.topics.map((t) => ({ topic_id: t.id, weight: t.weight })) },
        },
        sprint_dates: formData.sprint_dates,
        daily_start_time: formData.daily_start_time,
        daily_end_time: formData.daily_end_time,
        manual_questions: formData.sections.includes('manual') ? formData.manual_questions : [],
        submit_for_approval: submitForApproval,
      };
      const res = await fetch('/api/learn-sprints/', buildJsonPostOptions(payload));
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Failed to create Learn Sprint.');
        return;
      }
      alert(submitForApproval
        ? '✅ Learn Sprint created and submitted for HOD approval.'
        : '✅ Learn Sprint saved as draft.');
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      setError('Something went wrong creating the Learn Sprint.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '92vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
            <CalendarClock size={20} /> New Learn Sprint
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {error && <div style={{ padding: 10, borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{error}</div>}

        <div style={cardStyle}>
          <label style={labelStyle}>Title</label>
          <input style={{ ...inputStyle, marginBottom: 10 }} value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Placement Prep Sprint" />
          <label style={labelStyle}>Description (optional)</label>
          <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={2} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Batch (required)</label>
          <select style={{ ...inputStyle, marginBottom: 10 }} value={formData.batch} onChange={(e) => setFormData({ ...formData, batch: e.target.value, section: '' })}>
            <option value="">Select batch…</option>
            {batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} ({b.student_count} students)</option>)}
          </select>
          <label style={labelStyle}>Section (optional — leave blank for the full batch)</label>
          <select style={inputStyle} value={formData.section} onChange={(e) => setFormData({ ...formData, section: e.target.value })} disabled={!formData.batch}>
            <option value="">Full batch</option>
            {(sectionsByBatch[formData.batch] || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={cardStyle}>
          <label style={labelStyle}>Sections to include</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {Object.entries(SECTION_META).map(([key, meta]) => {
              const Icon = meta.icon;
              const active = formData.sections.includes(key);
              return (
                <button key={key} type="button" onClick={() => toggleSection(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                    border: active ? '2px solid #2563eb' : '1px solid #d1d5db',
                    background: active ? '#eff6ff' : 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    color: active ? '#1d4ed8' : '#475569',
                  }}>
                  <Icon size={15} /> {meta.label}
                </button>
              );
            })}
          </div>
          {formData.sections.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>Select at least one section.</p>}

          {formData.sections.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              {formData.sections.map((key) => (
                <div key={key}>
                  <label style={labelStyle}>{SECTION_META[key].countLabel}</label>
                  <input type="number" min="1" style={inputStyle} value={formData[`${key}_per_day`]}
                    onChange={(e) => setFormData({ ...formData, [`${key}_per_day`]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
          )}
        </div>

        {formData.sections.length > 0 && (
          <div style={cardStyle}>
            <label style={labelStyle}>Score weight per section (must add up to 100%)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              {formData.sections.map((key) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: '#64748b' }}>{SECTION_META[key].label}</label>
                  <input type="number" min="0" max="100" style={inputStyle} value={formData[`${key}_weight_percent`]}
                    onChange={(e) => setFormData({ ...formData, [`${key}_weight_percent`]: parseInt(e.target.value) || 0 })} />
                </div>
              ))}
            </div>
            {weightSum !== 100 && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>Currently {weightSum}% — must total 100%.</p>}
          </div>
        )}

        {formData.sections.includes('programming') && (
          <div style={cardStyle}>
            <label style={labelStyle}><Code size={14} style={{ verticalAlign: -2 }} /> Programming topics</label>
            <TopicPicker categories={programmingCategories} keyField="tag"
              selected={formData.topic_config.programming.topics.map((t) => ({ tag: t.id, weight: t.weight }))}
              mode={formData.topic_config.programming.mode}
              onModeChange={(mode) => setTopicConfig('programming', { mode })}
              onTopicsChange={(topics) => setTopicConfig('programming', { topics: topics.map((t) => ({ id: t.tag, weight: t.weight })) })} />
          </div>
        )}
        {formData.sections.includes('aptitude') && (
          <div style={cardStyle}>
            <label style={labelStyle}><Brain size={14} style={{ verticalAlign: -2 }} /> Aptitude topics</label>
            <TopicPicker categories={aptitudeCategories} keyField="topic_id"
              selected={formData.topic_config.aptitude.topics.map((t) => ({ topic_id: t.id, weight: t.weight }))}
              mode={formData.topic_config.aptitude.mode}
              onModeChange={(mode) => setTopicConfig('aptitude', { mode })}
              onTopicsChange={(topics) => setTopicConfig('aptitude', { topics: topics.map((t) => ({ id: t.topic_id, weight: t.weight })) })} />
          </div>
        )}
        {formData.sections.includes('reading') && (
          <div style={cardStyle}>
            <label style={labelStyle}><BookOpen size={14} style={{ verticalAlign: -2 }} /> Reading Comprehension topics</label>
            <TopicPicker categories={aptitudeCategories} keyField="topic_id"
              selected={formData.topic_config.reading.topics.map((t) => ({ topic_id: t.id, weight: t.weight }))}
              mode={formData.topic_config.reading.mode}
              onModeChange={(mode) => setTopicConfig('reading', { mode })}
              onTopicsChange={(topics) => setTopicConfig('reading', { topics: topics.map((t) => ({ id: t.topic_id, weight: t.weight })) })} />
          </div>
        )}

        <div style={cardStyle}>
          <label style={labelStyle}>Schedule</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <input type="date" style={{ ...inputStyle, width: 160 }} value={dateToAdd} onChange={(e) => setDateToAdd(e.target.value)} />
            <button type="button" onClick={addDate} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px dashed #94a3b8', background: 'white', cursor: 'pointer', fontSize: 13 }}>
              <Plus size={14} /> Add date
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {formData.sprint_dates.map((d) => (
              <span key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 600 }}>
                {d} <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeDate(d)} />
              </span>
            ))}
            {formData.sprint_dates.length === 0 && <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>Pick at least one date.</p>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#64748b' }}>Daily start time</label>
              <input type="time" style={inputStyle} value={formData.daily_start_time} onChange={(e) => setFormData({ ...formData, daily_start_time: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#64748b' }}>Daily end time</label>
              <input type="time" style={inputStyle} value={formData.daily_end_time} onChange={(e) => setFormData({ ...formData, daily_end_time: e.target.value })} />
            </div>
          </div>
        </div>

        {formData.sections.includes('manual') && (
          <div style={cardStyle}>
            <label style={labelStyle}><ListChecks size={14} style={{ verticalAlign: -2 }} /> Manual questions</label>
            <ManualQuestionsPanel questions={formData.manual_questions} needed={manualNeeded}
              setQuestions={(updater) => setFormData((prev) => ({ ...prev, manual_questions: typeof updater === 'function' ? updater(prev.manual_questions) : updater }))} />
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={() => handleSubmit(false)} disabled={loading || hasErrors()}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', cursor: hasErrors() ? 'not-allowed' : 'pointer', fontSize: 13, opacity: hasErrors() ? 0.5 : 1 }}>
            Save as Draft
          </button>
          <button onClick={() => handleSubmit(true)} disabled={loading || hasErrors()}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: 'white', cursor: hasErrors() ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: hasErrors() ? 0.5 : 1 }}>
            Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}
