// Contest Creator Component for Staff
import { useState, useEffect } from 'react';
import { Plus, X, Calendar, Clock } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const ContestCreator = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    duration_minutes: 60,
    problem_slugs: [],
    assigned_batches: [],
    status: 'draft',
  });
  const [problems, setProblems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProblemsAndBatches();
  }, []);

  async function loadProblemsAndBatches() {
    try {
      const [problemsRes, batchesRes] = await Promise.all([
        fetch('/api/problems/', { credentials: 'include' }),
        fetch('/api/batches/', { credentials: 'include' }),
      ]);

      if (problemsRes.ok) {
        const data = await problemsRes.json();
        setProblems(data.problems || []);
      }

      if (batchesRes.ok) {
        const data = await batchesRes.json();
        setBatches(data.batches || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/contests/', buildJsonPostOptions(formData));

      if (res.ok) {
        onSuccess && onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to create contest');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleProblem(slug) {
    setFormData(prev => ({
      ...prev,
      problem_slugs: prev.problem_slugs.includes(slug)
        ? prev.problem_slugs.filter(s => s !== slug)
        : [...prev.problem_slugs, slug],
    }));
  }

  function toggleBatch(batch) {
    setFormData(prev => ({
      ...prev,
      assigned_batches: prev.assigned_batches.includes(batch)
        ? prev.assigned_batches.filter(b => b !== batch)
        : [...prev.assigned_batches, batch],
    }));
  }

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
    }}>
      <div style={{
        background: 'white',
        borderRadius: 12,
        maxWidth: 700,
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Create New Contest</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div style={{
              padding: 12,
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
            }}>
              {error}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Contest Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="e.g., Weekly Coding Challenge"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Contest description and rules..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
                resize: 'vertical',
              }}
            />
          </div>

          {/* Time Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                <Calendar size={14} style={{ display: 'inline', marginRight: 4 }} />
                Start Time
              </label>
              <input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                <Clock size={14} style={{ display: 'inline', marginRight: 4 }} />
                Duration (minutes)
              </label>
              <input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                min={15}
                max={480}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>
          </div>

          {/* Assign Batches */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              Assign to Batches
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {batches.map((batch) => (
                <button
                  key={batch.batch}
                  type="button"
                  onClick={() => toggleBatch(batch.batch)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: formData.assigned_batches.includes(batch.batch)
                      ? '2px solid #4f46e5'
                      : '1px solid #d1d5db',
                    background: formData.assigned_batches.includes(batch.batch)
                      ? '#eef2ff'
                      : 'white',
                    color: formData.assigned_batches.includes(batch.batch) ? '#4f46e5' : '#666',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: formData.assigned_batches.includes(batch.batch) ? 600 : 400,
                  }}
                >
                  Batch {batch.batch} ({batch.student_count})
                </button>
              ))}
            </div>
          </div>

          {/* Select Problems */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              Select Problems ({formData.problem_slugs.length} selected)
            </label>
            <div style={{
              maxHeight: 200,
              overflow: 'auto',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: 8,
            }}>
              {problems.map((problem) => (
                <label
                  key={problem.slug}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderRadius: 6,
                    marginBottom: 4,
                    background: formData.problem_slugs.includes(problem.slug) ? '#f0fdf4' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.problem_slugs.includes(problem.slug)}
                    onChange={() => toggleProblem(problem.slug)}
                    style={{ marginRight: 10 }}
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{problem.title}</span>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: 11,
                    background: problem.difficulty === 'Easy' ? '#d1fae5' :
                               problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                    color: problem.difficulty === 'Easy' ? '#059669' :
                           problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                  }}>
                    {problem.difficulty}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
                fontSize: 14,
              }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                background: 'white',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.title}
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                background: loading || !formData.title ? '#d1d5db' : '#4f46e5',
                color: 'white',
                cursor: loading || !formData.title ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {loading ? 'Creating...' : 'Create Contest'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContestCreator;
