// Enhanced Contest Creator with Student Selection and Filtering
import { useState, useEffect } from 'react';
import { Plus, X, Calendar, Clock, Search, Users, CheckCircle, Trophy, Brain } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const EnhancedContestCreator = ({ onClose, onSuccess, initialType = 'programming' }) => {
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Problems, 3: Students
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    duration_minutes: 60,
    problem_slugs: [],
    aptitude_question_ids: [],
    assigned_batches: [],
    assigned_student_ids: [],
    submit_for_approval: false,
    contest_type: initialType, // 'programming' or 'aptitude'
  });
  
  const [problems, setProblems] = useState([]);
  const [aptitudeTopics, setAptitudeTopics] = useState([]);
  const [aptitudeQuestions, setAptitudeQuestions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);
  
  // Problem filtering states
  const [selectedTopics, setSelectedTopics] = useState([]);
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
      const [problemsRes, batchesRes, aptitudeTopicsRes] = await Promise.all([
        fetch('/api/problems/', { credentials: 'include' }),
        fetch('/api/batches/', { credentials: 'include' }),
        fetch('/api/aptitude/topics/', { credentials: 'include' }),
      ]);

      if (problemsRes.ok) {
        const data = await problemsRes.json();
        setProblems(Array.isArray(data) ? data : (data.problems || []));
      }

      if (batchesRes.ok) {
        const data = await batchesRes.json();
        setBatches(data.batches || []);
      }

      if (aptitudeTopicsRes.ok) {
        const data = await aptitudeTopicsRes.json();
        // The API returns {categories: [...]} or just [...]
        setAptitudeTopics(data.categories || data || []);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
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

  function toggleAptitudeQuestion(id) {
    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: prev.aptitude_question_ids.includes(id)
        ? prev.aptitude_question_ids.filter(i => i !== id)
        : [...prev.aptitude_question_ids, id],
    }));
  }

  async function loadAptitudeQuestions() {
    if (formData.contest_type !== 'aptitude') return;
    
    setLoadingData(true);
    try {
      const params = new URLSearchParams();
      if (selectedTopics.length > 0) {
        selectedTopics.forEach(id => params.append('topic_id', id));
      }
      if (selectedDifficulty !== 'all') params.append('difficulty', selectedDifficulty);
      if (searchQuery) params.append('q', searchQuery);
      
      const res = await fetch(`/api/aptitude/questions/?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAptitudeQuestions(data || []);
      }
    } finally {
      setLoadingData(false);
    }
  }

  function selectRandomAptitude(count) {
    if (!aptitudeQuestions.length) return;
    
    // Shuffle copy of questions
    const shuffled = [...aptitudeQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    const selectedIds = selected.map(q => q.id.toString());
    
    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: [...new Set([...prev.aptitude_question_ids, ...selectedIds])],
    }));
    
    alert(`✅ Randomly selected ${selected.length} questions from the current filters.`);
  }

  function selectRandomByTopic(topicId, count) {
    const topicQuestions = aptitudeQuestions.filter(q => q.topic_id.toString() === topicId.toString());
    if (!topicQuestions.length) return;

    const shuffled = [...topicQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    const selectedIds = selected.map(q => q.id.toString());

    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: [...new Set([...prev.aptitude_question_ids, ...selectedIds])],
    }));
  }

  useEffect(() => {
    if (formData.contest_type === 'aptitude') {
      loadAptitudeQuestions();
    }
  }, [formData.contest_type, selectedTopics, selectedDifficulty, searchQuery]);

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
      const topicMatch = selectedTopics.length === 0 || 
        (problem.tags && problem.tags.some(tag => selectedTopics.includes(tag)));
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
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
                  Contest Type
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contest_type: 'programming' })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 8,
                      border: formData.contest_type === 'programming' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                      background: formData.contest_type === 'programming' ? '#eef2ff' : 'white',
                      color: formData.contest_type === 'programming' ? '#4f46e5' : '#666',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: formData.contest_type === 'programming' ? 600 : 400,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Trophy size={20} />
                    <span>Programming Contest</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, contest_type: 'aptitude' })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: 8,
                      border: formData.contest_type === 'aptitude' ? '2px solid #4f46e5' : '1px solid #d1d5db',
                      background: formData.contest_type === 'aptitude' ? '#eef2ff' : 'white',
                      color: formData.contest_type === 'aptitude' ? '#4f46e5' : '#666',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: formData.contest_type === 'aptitude' ? 600 : 400,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Brain size={20} />
                    <span>Aptitude Contest</span>
                  </button>
                </div>
              </div>

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

          {/* Step 2: Select Content */}
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
                  Browse {formData.contest_type === 'programming' ? 'Problems' : 'Questions'}
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
                  Selected ({formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length})
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
                        {formData.contest_type === 'programming' ? 'Topic' : 'Topic / Category'}
                      </label>
                      <div style={{
                        width: '100%',
                        maxHeight: 150,
                        overflow: 'auto',
                        border: '1px solid #d1d5db',
                        borderRadius: 6,
                        padding: '4px 8px',
                        background: 'white',
                      }}>
                        {formData.contest_type === 'programming' ? (
                          getUniqueTopics().map(topic => (
                            <label key={topic} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                              <input
                                type="checkbox"
                                checked={selectedTopics.includes(topic)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedTopics([...selectedTopics, topic]);
                                  else setSelectedTopics(selectedTopics.filter(t => t !== topic));
                                }}
                                style={{ marginRight: 8 }}
                              />
                              {topic}
                            </label>
                          ))
                        ) : (
                          aptitudeTopics.map(cat => (
                            <div key={cat.id}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginTop: 8, marginBottom: 4, textTransform: 'uppercase' }}>
                                {cat.title}
                              </div>
                              {(cat.subcategories || []).map(sub => (
                                <div key={sub.id} style={{ marginLeft: 8 }}>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#4f46e5', marginBottom: 2 }}>
                                    {sub.title}
                                  </div>
                                  {(sub.topics || []).map(topic => (
                                    <label key={topic.id} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', cursor: 'pointer', fontSize: 13, marginLeft: 8 }}>
                                      <input
                                        type="checkbox"
                                        checked={selectedTopics.includes(topic.id.toString())}
                                        onChange={(e) => {
                                          const idStr = topic.id.toString();
                                          if (e.target.checked) setSelectedTopics([...selectedTopics, idStr]);
                                          else setSelectedTopics(selectedTopics.filter(t => t !== idStr));
                                        }}
                                        style={{ marginRight: 8 }}
                                      />
                                      {topic.title}
                                    </label>
                                  ))}
                                </div>
                              ))}
                            </div>
                          ))
                        )}
                      </div>
                      {selectedTopics.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setSelectedTopics([])}
                          style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 11, marginTop: 4, cursor: 'pointer', fontWeight: 600 }}
                        >
                          Clear Selection
                        </button>
                      )}
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

                  {/* Random Selection Option */}
                  {formData.contest_type === 'aptitude' && selectedTopics.length > 0 && (
                    <div style={{ 
                      marginBottom: 16, 
                      padding: 16, 
                      background: '#f0f9ff', 
                      borderRadius: 12, 
                      border: '1px solid #bae6fd',
                    }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1' }}>Topic-wise Random Selection</div>
                        <div style={{ fontSize: 12, color: '#0c4a6e' }}>Specify how many questions to pick from each selected topic</div>
                      </div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {selectedTopics.map(topicId => {
                          // Find topic name from aptitudeTopics
                          let topicName = 'Unknown Topic';
                          aptitudeTopics.forEach(cat => {
                            (cat.subcategories || []).forEach(sub => {
                              const found = (sub.topics || []).find(t => t.id.toString() === topicId.toString());
                              if (found) topicName = `${sub.title}: ${found.title}`;
                            });
                          });

                          const availableCount = aptitudeQuestions.filter(q => q.topic_id.toString() === topicId.toString()).length;

                          return (
                            <div key={topicId} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12, 
                              justifyContent: 'space-between',
                              background: 'white',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: '1px solid #e0f2fe'
                            }}>
                              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{topicName}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>({availableCount} available)</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="number"
                                  id={`count-${topicId}`}
                                  placeholder="0"
                                  min={0}
                                  max={availableCount}
                                  defaultValue={0}
                                  style={{
                                    width: 50,
                                    padding: '4px 6px',
                                    border: '1px solid #3b82f6',
                                    borderRadius: 4,
                                    fontSize: 12,
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = parseInt(document.getElementById(`count-${topicId}`).value);
                                    if (val > 0) selectRandomByTopic(topicId, val);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    background: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: 4,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Pick
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ marginTop: 12, textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => {
                            selectedTopics.forEach(topicId => {
                              const val = parseInt(document.getElementById(`count-${topicId}`).value);
                              if (val > 0) selectRandomByTopic(topicId, val);
                            });
                            alert('✅ Topic-wise random selection applied.');
                          }}
                          style={{
                            padding: '8px 16px',
                            background: '#0369a1',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Pick All at Once
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Content List */}
                  <div style={{
                    maxHeight: 350,
                    overflow: 'auto',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    padding: 8,
                  }}>
                    {loadingData ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                        <p style={{ fontSize: 14 }}>Loading content...</p>
                      </div>
                    ) : (
                      formData.contest_type === 'programming' ? (
                        getFilteredProblems().length === 0 ? (
                          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                            <p style={{ fontSize: 14 }}>No problems found matching your filters.</p>
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
                                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{problem.title}</div>
                                {problem.tags && problem.tags.length > 0 && (
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {problem.tags.slice(0, 3).map(tag => (
                                      <span key={tag} style={{
                                        fontSize: 11, padding: '2px 6px', background: '#e0e7ff', color: '#4338ca', borderRadius: 4,
                                      }}>{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span style={{
                                padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                background: problem.difficulty === 'Easy' ? '#d1fae5' : problem.difficulty === 'Medium' ? '#fef3c7' : '#fee2e2',
                                color: problem.difficulty === 'Easy' ? '#059669' : problem.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                              }}>{problem.difficulty}</span>
                            </label>
                          ))
                        )
                      ) : (
                        aptitudeQuestions.length === 0 ? (
                          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                            <p style={{ fontSize: 14 }}>No aptitude questions found matching your filters.</p>
                          </div>
                        ) : (
                          aptitudeQuestions.map((q) => (
                            <label
                              key={q.id}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                padding: '12px',
                                cursor: 'pointer',
                                borderRadius: 6,
                                marginBottom: 4,
                                background: formData.aptitude_question_ids.includes(q.id) ? '#f0fdf4' : 'transparent',
                                border: formData.aptitude_question_ids.includes(q.id) ? '1px solid #bbf7d0' : '1px solid transparent',
                                transition: 'all 0.2s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={formData.aptitude_question_ids.includes(q.id)}
                                onChange={() => toggleAptitudeQuestion(q.id)}
                                style={{ marginRight: 12, marginTop: 4, width: 16, height: 16, cursor: 'pointer' }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#333', lineHeight: 1.4 }}>
                                  {q.question_text}
                                </div>
                                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666' }}>
                                  <span>Topic: {q.topic}</span>
                                  <span style={{ 
                                    color: q.difficulty === 'Easy' ? '#059669' : q.difficulty === 'Medium' ? '#d97706' : '#dc2626'
                                  }}>
                                    {q.difficulty}
                                  </span>
                                </div>
                              </div>
                            </label>
                          ))
                        )
                      )
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
                    {formData.contest_type === 'programming' ? (
                      formData.problem_slugs.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                          <p style={{ fontSize: 14 }}>No problems selected</p>
                        </div>
                      ) : (
                        getSelectedProblems().map((problem, index) => (
                          <div key={problem.slug} style={{
                            display: 'flex', alignItems: 'center', padding: '12px', borderRadius: 6, marginBottom: 6, background: '#f9fafb', border: '1px solid #e5e7eb',
                          }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, marginRight: 12,
                            }}>{index + 1}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 500 }}>{problem.title}</div>
                            </div>
                            <button type="button" onClick={() => toggleProblem(problem.slug)} style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Remove</button>
                          </div>
                        ))
                      )
                    ) : (
                      formData.aptitude_question_ids.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#666' }}>
                          <p style={{ fontSize: 14 }}>No questions selected</p>
                        </div>
                      ) : (
                        aptitudeQuestions.filter(q => formData.aptitude_question_ids.includes(q.id)).map((q, index) => (
                          <div key={q.id} style={{
                            display: 'flex', alignItems: 'flex-start', padding: '12px', borderRadius: 6, marginBottom: 6, background: '#f9fafb', border: '1px solid #e5e7eb',
                          }}>
                            <span style={{
                              width: 24, height: 24, borderRadius: '50%', background: '#4f46e5', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, marginRight: 12, marginTop: 2
                            }}>{index + 1}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>{q.question_text}</div>
                            </div>
                            <button type="button" onClick={() => toggleAptitudeQuestion(q.id)} style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', marginLeft: 12 }}>Remove</button>
                          </div>
                        ))
                      )
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
                  • {formData.contest_type === 'programming' ? `${formData.problem_slugs.length} problems` : `${formData.aptitude_question_ids.length} questions`} selected<br />
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
                    disabled={loading || (formData.contest_type === 'programming' ? formData.problem_slugs.length === 0 : formData.aptitude_question_ids.length === 0)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: (loading || (formData.contest_type === 'programming' ? formData.problem_slugs.length === 0 : formData.aptitude_question_ids.length === 0)) ? '#d1d5db' : '#059669',
                      color: 'white',
                      cursor: (loading || (formData.contest_type === 'programming' ? formData.problem_slugs.length === 0 : formData.aptitude_question_ids.length === 0)) ? 'not-allowed' : 'pointer',
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
