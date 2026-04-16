// Enhanced Contest Creator with Student Selection and Filtering
import { useState, useEffect } from 'react';
import { Plus, X, Calendar, Clock, Search, Users, CheckCircle } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const EnhancedContestCreator = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Problems, 3: Students
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    duration_minutes: 60,
    problem_slugs: [],
    assigned_batches: [],
    assigned_student_ids: [],
    submit_for_approval: false,
  });
  
  const [problems, setProblems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  
  // Problem filtering states
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [problemView, setProblemView] = useState('browse'); // 'browse' or 'selected'
  
  // Student selection mode: 'batch' or 'individual'
  const [selectionMode, setSelectionMode] = useState('batch');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectionMode === 'individual') {
      loadStudents();
    }
  }, [selectionMode, selectedBatchFilter, searchQuery]);

  async function loadInitialData() {
    setLoadingData(true);
    try {
      console.log('Starting to load initial data...');
      const [problemsRes, batchesRes] = await Promise.all([
        fetch('/api/problems/', { credentials: 'include' }),
        fetch('/api/batches/', { credentials: 'include' }),
      ]);

      console.log('Problems response status:', problemsRes.status);
      console.log('Batches response status:', batchesRes.status);

      if (problemsRes.ok) {
        const data = await problemsRes.json();
        console.log('Raw problems data:', data);
        console.log('Is array?', Array.isArray(data));
        console.log('Data type:', typeof data);
        
        // The API returns an array directly, not wrapped in {problems: [...]}
        const problemsArray = Array.isArray(data) ? data : (data.problems || []);
        console.log('Problems array length:', problemsArray.length);
        console.log('First problem:', problemsArray[0]);
        
        setProblems(problemsArray);
      } else {
        const errorText = await problemsRes.text();
        console.error('Failed to load problems. Status:', problemsRes.status, 'Error:', errorText);
      }

      if (batchesRes.ok) {
        const data = await batchesRes.json();
        console.log('Batches loaded:', data);
        setBatches(data.batches || []);
      } else {
        const errorText = await batchesRes.text();
        console.error('Failed to load batches. Status:', batchesRes.status, 'Error:', errorText);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      console.error('Error stack:', err.stack);
    } finally {
      setLoadingData(false);
    }
  }

  async function loadStudents() {
    try {
      const params = new URLSearchParams();
      if (selectedBatchFilter) params.append('batch', selectedBatchFilter);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');

      const res = await fetch(`/api/students/filter/?${params}`, {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        setFilteredStudents(data.students || []);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/contests/', buildJsonPostOptions(formData));

      if (res.ok) {
        const data = await res.json();
        // Show success message
        alert(formData.submit_for_approval 
          ? '✅ Contest submitted for HOD approval successfully!' 
          : '✅ Contest saved as draft successfully!');
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

  // Get unique topics from problems
  function getUniqueTopics() {
    const topicsSet = new Set();
    problems.forEach(problem => {
      if (problem.tags && Array.isArray(problem.tags)) {
        problem.tags.forEach(tag => topicsSet.add(tag));
      }
    });
    return Array.from(topicsSet).sort();
  }

  // Filter problems based on topic and difficulty
  function getFilteredProblems() {
    return problems.filter(problem => {
      const topicMatch = selectedTopic === 'all' || 
        (problem.tags && problem.tags.includes(selectedTopic));
      const difficultyMatch = selectedDifficulty === 'all' || 
        problem.difficulty === selectedDifficulty;
      return topicMatch && difficultyMatch;
    });
  }

  // Get selected problems details
  function getSelectedProblems() {
    return problems.filter(p => formData.problem_slugs.includes(p.slug));
  }

  function toggleBatch(batch) {
    setFormData(prev => ({
      ...prev,
      assigned_batches: prev.assigned_batches.includes(batch)
        ? prev.assigned_batches.filter(b => b !== batch)
        : [...prev.assigned_batches, batch],
    }));
  }

  function toggleStudent(studentId) {
    setFormData(prev => ({
      ...prev,
      assigned_student_ids: prev.assigned_student_ids.includes(studentId)
        ? prev.assigned_student_ids.filter(id => id !== studentId)
        : [...prev.assigned_student_ids, studentId],
    }));
  }

  function selectAllFilteredStudents() {
    const allIds = filteredStudents.map(s => s.id);
    setFormData(prev => ({
      ...prev,
      assigned_student_ids: [...new Set([...prev.assigned_student_ids, ...allIds])],
    }));
  }

  function clearAllStudents() {
    setFormData(prev => ({
      ...prev,
      assigned_student_ids: [],
    }));
  }

  const totalAssignedStudents = selectionMode === 'batch'
    ? batches.filter(b => formData.assigned_batches.includes(b.batch))
        .reduce((sum, b) => sum + b.student_count, 0)
    : formData.assigned_student_ids.length;

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
        maxWidth: 900,
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
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Create New Contest</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              Step {step} of 3: {step === 1 ? 'Basic Information' : step === 2 ? 'Select Problems' : 'Assign Students'}
            </p>
          </div>
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

        {/* Progress Steps */}
        <div style={{
          display: 'flex',
          padding: '16px 24px',
          background: '#f9fafb',
          gap: 8,
        }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: s <= step ? '#4f46e5' : '#e5e7eb',
                transition: 'background 0.3s',
              }}
            />
          ))}
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

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div>
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

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Contest description and rules..."
                  rows={4}
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
                    <Calendar size={14} style={{ display: 'inline', marginRight: 4 }} />
                    End Time
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
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

              <div style={{ marginBottom: 20 }}>
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
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                  Note: If you set both start and end times, the duration will be calculated automatically.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Select Problems */}
          {step === 2 && (
            <div>
              {/* Tab Navigation */}
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                marginBottom: 16,
                borderBottom: '2px solid #e5e7eb',
              }}>
                <button
                  type="button"
                  onClick={() => setProblemView('browse')}
                  style={{
                    padding: '10px 20px',
                    background: 'none',
                    border: 'none',
                    borderBottom: problemView === 'browse' ? '2px solid #4f46e5' : '2px solid transparent',
                    color: problemView === 'browse' ? '#4f46e5' : '#666',
                    fontWeight: problemView === 'browse' ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: 14,
                    marginBottom: -2,
                  }}
                >
                  Browse Problems
                </button>
                <button
                  type="button"
                  onClick={() => setProblemView('selected')}
                  style={{
                    padding: '10px 20px',
                    background: 'none',
                    border: 'none',
                    borderBottom: problemView === 'selected' ? '2px solid #4f46e5' : '2px solid transparent',
                    color: problemView === 'selected' ? '#4f46e5' : '#666',
                    fontWeight: problemView === 'selected' ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: 14,
                    marginBottom: -2,
                  }}
                >
                  Selected ({formData.problem_slugs.length})
                </button>
              </div>

              {/* Browse View */}
              {problemView === 'browse' && (
                <div>
                  {/* Filters */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1fr 1fr', 
                    gap: 12, 
                    marginBottom: 16,
                    padding: 12,
                    background: '#f9fafb',
                    borderRadius: 8,
                  }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                        Topic
                      </label>
                      <select
                        value={selectedTopic}
                        onChange={(e) => setSelectedTopic(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 13,
                          background: 'white',
                        }}
                      >
                        <option value="all">All Topics</option>
                        {getUniqueTopics().map(topic => (
                          <option key={topic} value={topic}>{topic}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                        Difficulty
                      </label>
                      <select
                        value={selectedDifficulty}
                        onChange={(e) => setSelectedDifficulty(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid #d1d5db',
                          borderRadius: 6,
                          fontSize: 13,
                          background: 'white',
                        }}
                      >
                        <option value="all">All Difficulties</option>
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                  </div>

                  {/* Problems List */}
                  <div style={{
                    maxHeight: 350,
                    overflow: 'auto',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: 8,
                  }}>
                    {loadingData ? (
                      <div style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#666',
                      }}>
                        <p style={{ fontSize: 14 }}>Loading problems...</p>
                      </div>
                    ) : getFilteredProblems().length === 0 ? (
                      <div style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#666',
                      }}>
                        <p style={{ fontSize: 14, marginBottom: 8 }}>
                          {problems.length === 0 ? 'No problems available' : 'No problems match the selected filters'}
                        </p>
                        {problems.length === 0 && (
                          <p style={{ fontSize: 12, color: '#999' }}>
                            Please add problems to the database first.
                          </p>
                        )}
                      </div>
                    ) : (
                      getFilteredProblems().map((problem) => (
                        <label
                          key={problem.slug}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderRadius: 6,
                            marginBottom: 4,
                            background: formData.problem_slugs.includes(problem.slug) ? '#f0fdf4' : 'transparent',
                            border: formData.problem_slugs.includes(problem.slug) ? '1px solid #bbf7d0' : '1px solid transparent',
                            transition: 'all 0.2s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.problem_slugs.includes(problem.slug)}
                            onChange={() => toggleProblem(problem.slug)}
                            style={{ marginRight: 12, width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                              {problem.title}
                            </div>
                            {problem.tags && problem.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {problem.tags.slice(0, 3).map(tag => (
                                  <span key={tag} style={{
                                    fontSize: 11,
                                    padding: '2px 6px',
                                    background: '#e0e7ff',
                                    color: '#4338ca',
                                    borderRadius: 4,
                                  }}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            background: problem.difficulty === 'Easy' ? '#d1fae5' :
                                       problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                            color: problem.difficulty === 'Easy' ? '#059669' :
                                   problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                          }}>
                            {problem.difficulty}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Selected View */}
              {problemView === 'selected' && (
                <div>
                  <div style={{
                    maxHeight: 450,
                    overflow: 'auto',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: 8,
                  }}>
                    {formData.problem_slugs.length === 0 ? (
                      <div style={{
                        padding: '40px 20px',
                        textAlign: 'center',
                        color: '#666',
                      }}>
                        <p style={{ fontSize: 14, marginBottom: 8 }}>No problems selected</p>
                        <p style={{ fontSize: 12, color: '#999' }}>
                          Switch to "Browse Problems" tab to select problems
                        </p>
                      </div>
                    ) : (
                      getSelectedProblems().map((problem, index) => (
                        <div
                          key={problem.slug}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px',
                            borderRadius: 6,
                            marginBottom: 6,
                            background: '#f9fafb',
                            border: '1px solid #e5e7eb',
                          }}
                        >
                          <span style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: '#4f46e5',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            marginRight: 12,
                          }}>
                            {index + 1}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                              {problem.title}
                            </div>
                            {problem.tags && problem.tags.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {problem.tags.map(tag => (
                                  <span key={tag} style={{
                                    fontSize: 11,
                                    padding: '2px 6px',
                                    background: '#e0e7ff',
                                    color: '#4338ca',
                                    borderRadius: 4,
                                  }}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            marginRight: 8,
                            background: problem.difficulty === 'Easy' ? '#d1fae5' :
                                       problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                            color: problem.difficulty === 'Easy' ? '#059669' :
                                   problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                          }}>
                            {problem.difficulty}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleProblem(problem.slug)}
                            style={{
                              padding: '6px 10px',
                              background: '#fee2e2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Assign Students */}
          {step === 3 && (
            <div>
              {/* Selection Mode Toggle */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  Student Assignment Mode
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setSelectionMode('batch')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 8,
                      border: selectionMode === 'batch' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                      background: selectionMode === 'batch' ? '#eef2ff' : 'white',
                      color: selectionMode === 'batch' ? '#4f46e5' : '#666',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: selectionMode === 'batch' ? 600 : 400,
                    }}
                  >
                    <Users size={16} style={{ display: 'inline', marginRight: 6 }} />
                    Batch-wise
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode('individual')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 8,
                      border: selectionMode === 'individual' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                      background: selectionMode === 'individual' ? '#eef2ff' : 'white',
                      color: selectionMode === 'individual' ? '#4f46e5' : '#666',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: selectionMode === 'individual' ? 600 : 400,
                    }}
                  >
                    <CheckCircle size={16} style={{ display: 'inline', marginRight: 6 }} />
                    Individual Selection
                  </button>
                </div>
              </div>

              {/* Batch Selection */}
              {selectionMode === 'batch' && (
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                    Select Batches
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {batches.map((batch) => (
                      <button
                        key={batch.batch}
                        type="button"
                        onClick={() => toggleBatch(batch.batch)}
                        style={{
                          padding: '8px 14px',
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
              )}

              {/* Individual Student Selection */}
              {selectionMode === 'individual' && (
                <div>
                  {/* Filters */}
                  <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Search by name or register number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #d1d5db',
                          borderRadius: 8,
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <select
                      value={selectedBatchFilter}
                      onChange={(e) => setSelectedBatchFilter(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        fontSize: 14,
                      }}
                    >
                      <option value="">All Batches</option>
                      {batches.map((batch) => (
                        <option key={batch.batch} value={batch.batch}>
                          Batch {batch.batch}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Bulk Actions */}
                  <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={selectAllFilteredStudents}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Select All Filtered
                    </button>
                    <button
                      type="button"
                      onClick={clearAllStudents}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Clear All
                    </button>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: '#666', alignSelf: 'center' }}>
                      {formData.assigned_student_ids.length} selected
                    </span>
                  </div>

                  {/* Student List */}
                  <div style={{
                    maxHeight: 300,
                    overflow: 'auto',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Select</th>
                          <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Register No</th>
                          <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Name</th>
                          <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Batch</th>
                          <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Solved</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudents.map((student) => (
                          <tr
                            key={student.id}
                            style={{
                              borderBottom: '1px solid #f3f4f6',
                              background: formData.assigned_student_ids.includes(student.id) ? '#f0fdf4' : 'white',
                            }}
                          >
                            <td style={{ padding: '8px' }}>
                              <input
                                type="checkbox"
                                checked={formData.assigned_student_ids.includes(student.id)}
                                onChange={() => toggleStudent(student.id)}
                                style={{ width: 16, height: 16 }}
                              />
                            </td>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}>
                              {student.register_number}
                            </td>
                            <td style={{ padding: '8px' }}>{student.name}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '2px 6px',
                                background: '#e0e7ff',
                                color: '#4338ca',
                                borderRadius: 4,
                                fontSize: 11,
                              }}>
                                {student.batch}
                              </span>
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', color: '#059669', fontWeight: 600 }}>
                              {student.solved_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div style={{
                marginTop: 20,
                padding: 16,
                background: '#f0fdf4',
                borderRadius: 8,
                border: '1px solid #bbf7d0',
              }}>
                <div style={{ fontSize: 13, color: '#059669', fontWeight: 500 }}>
                  📊 Contest Summary
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                  • {formData.problem_slugs.length} problems selected<br />
                  • {totalAssignedStudents} students will be assigned
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 24 }}>
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Back
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
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
              {step < 3 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !formData.title}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: 'none',
                    background: (step === 1 && !formData.title) ? '#d1d5db' : '#4f46e5',
                    color: 'white',
                    cursor: (step === 1 && !formData.title) ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, submit_for_approval: false });
                      handleSubmit({ preventDefault: () => {} });
                    }}
                    disabled={loading}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      background: 'white',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Save as Draft
                  </button>
                  <button
                    type="submit"
                    onClick={() => setFormData({ ...formData, submit_for_approval: true })}
                    disabled={loading || formData.problem_slugs.length === 0}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: (loading || formData.problem_slugs.length === 0) ? '#d1d5db' : '#059669',
                      color: 'white',
                      cursor: (loading || formData.problem_slugs.length === 0) ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {loading ? 'Creating...' : 'Submit for Approval'}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EnhancedContestCreator;
