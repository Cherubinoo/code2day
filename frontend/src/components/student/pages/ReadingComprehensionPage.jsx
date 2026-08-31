import React, { useState, useEffect } from 'react';
import { BookOpen, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';
import { buildJsonPostOptions } from '../../../lib/appUtils';

function PassageList({ onSelect }) {
  const [passages, setPassages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/aptitude/reading-passages/', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setPassages(data.passages || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container" style={{ padding: '60px', textAlign: 'center' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Loading passages...</p>
      </div>
    );
  }

  if (passages.length === 0) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-soft)' }}>
        <BookOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
        <p>No reading passages available yet.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
      {passages.map((p) => {
        const pct = p.question_count ? Math.round((p.solved_count / p.question_count) * 100) : 0;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              textAlign: 'left', background: 'var(--bg-1)', border: '1px solid var(--border-soft)',
              borderRadius: '24px', padding: '24px', cursor: 'pointer', boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--olive-900)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <BookOpen size={22} />
              </div>
              <span className={`mini-pill ${(p.difficulty || 'Medium').toLowerCase()}`}>{p.difficulty}</span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 800, color: 'var(--olive-900)' }}>{p.title}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--sage-200)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--olive-900)' }} />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {p.solved_count}/{p.question_count} solved
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, index }) {
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const options = [
    { key: 'A', value: question.option_a },
    { key: 'B', value: question.option_b },
    { key: 'C', value: question.option_c },
    { key: 'D', value: question.option_d },
  ];

  async function submit(optionKey) {
    if (result || busy) return;
    setSelected(optionKey);
    setBusy(true);
    try {
      const res = await fetch('/api/aptitude/questions/submit/', buildJsonPostOptions({
        question_id: question.id, selected_option: optionKey,
      }));
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ is_correct: false, correct_option: null, explanation: 'Could not check your answer — try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-soft)', borderRadius: 18, padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: 'var(--olive-900)' }}>
        {index + 1}. {question.question_text}
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {options.map((opt) => {
          let bg = 'var(--bg-2)';
          let border = 'var(--border-soft)';
          if (result) {
            if (opt.key === result.correct_option) { bg = '#dcfce7'; border = '#22c55e'; }
            else if (opt.key === selected) { bg = '#fee2e2'; border = '#ef4444'; }
          } else if (opt.key === selected) {
            bg = 'var(--sage-100)'; border = 'var(--olive-400)';
          }
          return (
            <button
              key={opt.key}
              onClick={() => submit(opt.key)}
              disabled={Boolean(result)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 12, border: `2px solid ${border}`, background: bg,
                cursor: result ? 'default' : 'pointer', textAlign: 'left', fontSize: '0.95rem',
              }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 8, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
                {opt.key}
              </span>
              <span>{opt.value}</span>
              {result && opt.key === result.correct_option && <CheckCircle size={18} color="#22c55e" style={{ marginLeft: 'auto' }} />}
              {result && opt.key === selected && opt.key !== result.correct_option && <XCircle size={18} color="#ef4444" style={{ marginLeft: 'auto' }} />}
            </button>
          );
        })}
      </div>
      {result && result.explanation && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--sage-50)', fontSize: '0.85rem', color: 'var(--text-soft)' }}>
          {result.explanation}
        </div>
      )}
    </div>
  );
}

function PassageDetail({ passageId, onBack }) {
  const [passage, setPassage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/aptitude/reading-passages/${passageId}/`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setPassage(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [passageId]);

  if (loading) {
    return (
      <div className="loading-container" style={{ padding: '60px', textAlign: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }
  if (!passage) return null;

  return (
    <div>
      <button onClick={onBack} className="back-to-list-btn" style={{ marginBottom: 20 }}>
        ← Passages
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{
          background: 'var(--bg-1)', border: '1px solid var(--border-soft)', borderRadius: 20,
          padding: 24, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', position: 'sticky', top: 20,
        }}>
          <h2 style={{ marginTop: 0, color: 'var(--olive-900)' }}>{passage.title}</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-main)' }}>{passage.passage_text}</p>
        </div>

        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: 4 }}>
          {passage.questions.map((q, idx) => (
            <QuestionCard key={q.id} question={q} index={idx} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReadingComprehensionPage() {
  const [selectedPassageId, setSelectedPassageId] = useState(null);

  return (
    <div style={{ padding: '24px', width: '100%' }}>
      {!selectedPassageId && (
        <header style={{ marginBottom: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.2rem', fontWeight: 900, color: 'var(--olive-900)', marginBottom: 8 }}>
            Reading Comprehension
          </h1>
          <p style={{ color: 'var(--text-soft)' }}>Read a passage, then answer questions about it.</p>
        </header>
      )}
      {selectedPassageId ? (
        <PassageDetail passageId={selectedPassageId} onBack={() => setSelectedPassageId(null)} />
      ) : (
        <PassageList onSelect={setSelectedPassageId} />
      )}
    </div>
  );
}
