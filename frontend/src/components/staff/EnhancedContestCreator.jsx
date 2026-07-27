// Enhanced Contest Creator with Student Selection and Filtering
import { useState, useEffect } from 'react';
import { Plus, X, Calendar, Clock, Search, Users, CheckCircle, Trophy, Brain } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

const EnhancedContestCreator = ({ onClose, onSuccess, initialType = 'programming' }) => {
  const [step, setStep] = useState(1); // 1: Basic Info, 2: Problems, 3: Students
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    access_start_time: '',
    access_end_time: '',
    session_duration_minutes: 60,
    problem_slugs: [],
    aptitude_question_ids: [],
    assigned_batches: [],
    assigned_sections: [],
    assigned_student_ids: [],
    submit_for_approval: false,
    contest_type: initialType, // 'programming' or 'aptitude'
  });
  
  const [problems, setProblems] = useState([]);
  const [aptitudeTopics, setAptitudeTopics] = useState([]);
  const [aptitudeQuestions, setAptitudeQuestions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [sectionsByBatch, setSectionsByBatch] = useState({});
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
  const [selectedSectionFilter, setSelectedSectionFilter] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectionMode === 'individual') {
      loadStudents();
    }
  }, [selectionMode, selectedBatchFilter, selectedSectionFilter, searchQuery]);

  async function loadInitialData() {
    setLoadingData(true);
    try {
      const [problemsRes, batchesRes, aptitudeTopicsRes, studentsRes] = await Promise.all([
        fetch('/api/problems/', { credentials: 'include' }),
        fetch('/api/batches/', { credentials: 'include' }),
        fetch('/api/aptitude/topics/', { credentials: 'include' }),
        fetch('/api/students/filter/?limit=2000', { credentials: 'include' }),
      ]);

      if (problemsRes.ok) {
        const data = await problemsRes.json();
        setProblems(Array.isArray(data) ? data : (data.problems || []));
      }

      if (batchesRes.ok) {
        const data = await batchesRes.json();
        setBatches(data.batches || []);
        setSectionsByBatch(data.sections_by_batch || {});
      }

      if (aptitudeTopicsRes.ok) {
        const data = await aptitudeTopicsRes.json();
        // The API returns {categories: [...]} or just [...]
        setAptitudeTopics(data.categories || data || []);
      }

      if (studentsRes && studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(data.students || []);
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
      if (selectedBatchFilter && selectedSectionFilter) params.append('section', selectedSectionFilter);
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
    const key = String(id);
    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: prev.aptitude_question_ids.includes(key)
        ? prev.aptitude_question_ids.filter(i => i !== key)
        : [...prev.aptitude_question_ids, key],
    }));
  }

  async function loadAptitudeQuestions() {
    if (formData.contest_type !== 'aptitude') return;
    
    setLoadingData(true);
    try {
      const params = new URLSearchParams();
      
      // Load questions for selected topics, or ALL questions if no topics selected
      if (selectedTopics.length > 0) {
        selectedTopics.forEach(id => params.append('topic_id', id));
      }
      
      if (selectedDifficulty !== 'all') params.append('difficulty', selectedDifficulty);
      if (searchQuery) params.append('q', searchQuery);
      params.append('limit', '2000'); // Higher limit for contest creation
      
      const res = await fetch(`/api/aptitude/questions/?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAptitudeQuestions(data || []);
      }
    } catch (err) {
      console.error('Error loading aptitude questions:', err);
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
    // Find this topic and all its subtopic IDs
    const getAllChildrenIds = (id) => {
      let ids = [id.toString()];
      aptitudeTopics.forEach(cat => {
        if (cat.id.toString() === id.toString()) {
          (cat.subcategories || []).forEach(sub => {
            ids.push(sub.id.toString());
            (sub.topics || []).forEach(t => ids.push(t.id.toString()));
          });
        }
        (cat.subcategories || []).forEach(sub => {
          if (sub.id.toString() === id.toString()) {
            (sub.topics || []).forEach(t => ids.push(t.id.toString()));
          }
        });
      });
      return ids;
    };

    const targetIds = getAllChildrenIds(topicId);
    const topicQuestions = aptitudeQuestions.filter(q => targetIds.includes(q.topic_id?.toString()));
    
    if (!topicQuestions.length) {
      alert(`No questions found for this topic selection. Try selecting more topics or clearing filters.`);
      return;
    }

    const shuffled = [...topicQuestions].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));
    const selectedIds = selected.map(q => q.id.toString());

    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: [...new Set([...prev.aptitude_question_ids, ...selectedIds])],
    }));
    
    return selected.length;
  }

  function applyTopicWisePercentageSelection() {
    let totalSelected = 0;
    const selections = [];
    
    selectedTopics.forEach(topicId => {
      const input = document.getElementById(`percentage-${topicId}`);
      const percentage = parseInt(input?.value || 0);
      
      if (percentage > 0) {
        const count = Math.round((randomConfig.total * percentage) / 100);
        if (count > 0) {
          selections.push({ topicId, count, percentage });
          totalSelected += count;
        }
      }
    });

    if (selections.length === 0) {
      alert('Please set percentages for at least one topic.');
      return;
    }

    // Apply selections
    selections.forEach(({ topicId, count }) => {
      selectRandomByTopic(topicId, count);
    });

    const summary = selections.map(s => `${s.count} from topic (${s.percentage}%)`).join(', ');
    alert(`✅ Topic-wise percentage selection applied!\nSelected ${totalSelected} questions: ${summary}`);
  }

  const [randomConfig, setRandomConfig] = useState({
    total: 0,
    easy_percentage: 50,
    medium_percentage: 30,
    hard_percentage: 20
  });

  // Calculate actual counts based on percentages and selected questions
  const calculateDistribution = () => {
    const actualTotal = formData.contest_type === 'programming' 
      ? formData.problem_slugs.length 
      : formData.aptitude_question_ids.length;
    
    if (actualTotal === 0) return { easy: 0, medium: 0, hard: 0 };
    
    const easy_count = Math.round((actualTotal * randomConfig.easy_percentage) / 100);
    const medium_count = Math.round((actualTotal * randomConfig.medium_percentage) / 100);
    const hard_count = actualTotal - easy_count - medium_count; // Remaining goes to hard
    
    return {
      easy: Math.max(0, easy_count),
      medium: Math.max(0, medium_count),
      hard: Math.max(0, hard_count)
    };
  };

  function applySmartRandomSelection() {
    const selectedQuestions = formData.contest_type === 'programming' 
      ? formData.problem_slugs 
      : formData.aptitude_question_ids;
    
    if (selectedQuestions.length === 0) {
      alert("Please select questions from topics first before applying difficulty distribution.");
      return;
    }

    const distribution = calculateDistribution();
    
    if (formData.contest_type === 'programming') {
      // For programming, redistribute existing selected problems by difficulty
      const selectedProblems = problems.filter(p => formData.problem_slugs.includes(p.slug));
      
      const easyProblems = selectedProblems.filter(p => p.difficulty === 'Easy');
      const mediumProblems = selectedProblems.filter(p => p.difficulty === 'Medium');
      const hardProblems = selectedProblems.filter(p => p.difficulty === 'Hard');
      
      // Check if we can achieve the desired distribution
      if (easyProblems.length < distribution.easy || mediumProblems.length < distribution.medium || hardProblems.length < distribution.hard) {
        const message = `Cannot achieve this distribution with selected problems:\n` +
          `Need: ${distribution.easy} Easy, ${distribution.medium} Medium, ${distribution.hard} Hard\n` +
          `Available: ${easyProblems.length} Easy, ${mediumProblems.length} Medium, ${hardProblems.length} Hard\n\n` +
          `Please select more problems or adjust percentages.`;
        alert(message);
        return;
      }
      
      // Redistribute selected problems
      const redistributed = [
        ...easyProblems.slice(0, distribution.easy).map(p => p.slug),
        ...mediumProblems.slice(0, distribution.medium).map(p => p.slug),
        ...hardProblems.slice(0, distribution.hard).map(p => p.slug),
      ];
      
      setFormData(prev => ({
        ...prev,
        problem_slugs: redistributed,
      }));
      
    } else {
      // For aptitude, redistribute existing selected questions by difficulty
      const selectedQuestionObjs = aptitudeQuestions.filter(q => formData.aptitude_question_ids.includes(String(q.id)));
      
      const easyQuestions = selectedQuestionObjs.filter(q => q.difficulty === 'Easy');
      const mediumQuestions = selectedQuestionObjs.filter(q => q.difficulty === 'Medium');
      const hardQuestions = selectedQuestionObjs.filter(q => q.difficulty === 'Hard');
      
      // Check if we can achieve the desired distribution
      if (easyQuestions.length < distribution.easy || mediumQuestions.length < distribution.medium || hardQuestions.length < distribution.hard) {
        const message = `Cannot achieve this distribution with selected questions:\n` +
          `Need: ${distribution.easy} Easy, ${distribution.medium} Medium, ${distribution.hard} Hard\n` +
          `Available: ${easyQuestions.length} Easy, ${mediumQuestions.length} Medium, ${hardQuestions.length} Hard\n\n` +
          `Please select more questions or adjust percentages.`;
        alert(message);
        return;
      }
      
      // Redistribute selected questions
      const redistributed = [
        ...easyQuestions.slice(0, distribution.easy).map(q => String(q.id)),
        ...mediumQuestions.slice(0, distribution.medium).map(q => String(q.id)),
        ...hardQuestions.slice(0, distribution.hard).map(q => String(q.id)),
      ];
      
      setFormData(prev => ({
        ...prev,
        aptitude_question_ids: redistributed,
      }));
    }

    alert(`✅ Difficulty distribution applied to ${selectedQuestions.length} selected questions:\n${distribution.easy} Easy (${randomConfig.easy_percentage}%), ${distribution.medium} Medium (${randomConfig.medium_percentage}%), ${distribution.hard} Hard (${randomConfig.hard_percentage}%)`);
  }

  useEffect(() => {
    if (formData.contest_type === 'aptitude') {
      loadAptitudeQuestions();
    }
  }, [formData.contest_type, selectedTopics, selectedDifficulty, searchQuery]);

  // Auto-update total questions based on selected questions
  useEffect(() => {
    const currentTotal = formData.contest_type === 'programming' 
      ? formData.problem_slugs.length 
      : formData.aptitude_question_ids.length;
    
    if (currentTotal > 0 && currentTotal !== randomConfig.total) {
      setRandomConfig(prev => ({ ...prev, total: currentTotal }));
    }
  }, [formData.problem_slugs.length, formData.aptitude_question_ids.length, formData.contest_type]);

  // Auto-update programming config total as well
  useEffect(() => {
    const currentTotal = formData.problem_slugs.length;
    if (currentTotal > 0 && currentTotal !== programmingConfig.total) {
      setProgrammingConfig(prev => ({ ...prev, total: currentTotal }));
    }
  }, [formData.problem_slugs.length]);

  // Auto-update aptitude config total as well
  useEffect(() => {
    const currentTotal = formData.aptitude_question_ids.length;
    if (currentTotal > 0 && currentTotal !== aptitudeConfig.total) {
      setAptitudeConfig(prev => ({ ...prev, total: currentTotal }));
    }
  }, [formData.aptitude_question_ids.length]);

  // Remove the auto-calculation effect since we're using session-based timing
  // useEffect(() => {
  //   if (formData.start_time && formData.end_time) {
  //     const start = new Date(formData.start_time);
  //     const end = new Date(formData.end_time);
  //     if (end > start) {
  //       const diffMs = end - start;
  //       const diffMins = Math.floor(diffMs / 60000);
  //       if (diffMins !== formData.duration_minutes) {
  //         setFormData(prev => ({ ...prev, duration_minutes: diffMins }));
  //       }
  //     }
  //   }
  // }, [formData.start_time, formData.end_time]);

  // Programming contest difficulty distribution
  const [programmingConfig, setProgrammingConfig] = useState({
    total: 0,
    easy_percentage: 40,
    medium_percentage: 40,
    hard_percentage: 20
  });

  // Aptitude contest difficulty distribution
  const [aptitudeConfig, setAptitudeConfig] = useState({
    total: 0,
    easy_percentage: 40,
    medium_percentage: 40,
    hard_percentage: 20
  });

  function applyProgrammingDistribution() {
    const available = getFilteredProblems();
    if (available.length === 0) {
      alert("No problems available matching current filters.");
      return;
    }

    const distribution = {
      easy: Math.round((programmingConfig.total * programmingConfig.easy_percentage) / 100),
      medium: Math.round((programmingConfig.total * programmingConfig.medium_percentage) / 100),
    };
    distribution.hard = programmingConfig.total - distribution.easy - distribution.medium;

    const easyPool = available.filter(p => p.difficulty === 'Easy').sort(() => 0.5 - Math.random());
    const mediumPool = available.filter(p => p.difficulty === 'Medium').sort(() => 0.5 - Math.random());
    const hardPool = available.filter(p => p.difficulty === 'Hard').sort(() => 0.5 - Math.random());

    // Check availability
    if (easyPool.length < distribution.easy || mediumPool.length < distribution.medium || hardPool.length < distribution.hard) {
      const message = `Not enough problems available for this distribution:\n` +
        `Need: ${distribution.easy} Easy, ${distribution.medium} Medium, ${distribution.hard} Hard\n` +
        `Available: ${easyPool.length} Easy, ${mediumPool.length} Medium, ${hardPool.length} Hard`;
      alert(message);
      return;
    }

    const selectedSlugs = [
      ...easyPool.slice(0, distribution.easy).map(p => p.slug),
      ...mediumPool.slice(0, distribution.medium).map(p => p.slug),
      ...hardPool.slice(0, distribution.hard).map(p => p.slug),
    ];

    setFormData(prev => ({
      ...prev,
      problem_slugs: [...new Set([...prev.problem_slugs, ...selectedSlugs])],
    }));

    alert(`✅ Programming distribution applied! Added ${selectedSlugs.length} problems:\n${distribution.easy} Easy (${programmingConfig.easy_percentage}%), ${distribution.medium} Medium (${programmingConfig.medium_percentage}%), ${distribution.hard} Hard (${programmingConfig.hard_percentage}%)`);
  }

  function applyAptitudeDistribution() {
    const available = aptitudeQuestions;
    if (available.length === 0) {
      alert("No aptitude questions available. Please load questions first.");
      return;
    }

    const distribution = {
      easy: Math.round((aptitudeConfig.total * aptitudeConfig.easy_percentage) / 100),
      medium: Math.round((aptitudeConfig.total * aptitudeConfig.medium_percentage) / 100),
    };
    distribution.hard = aptitudeConfig.total - distribution.easy - distribution.medium;

    const easyPool = available.filter(q => q.difficulty === 'Easy').sort(() => 0.5 - Math.random());
    const mediumPool = available.filter(q => q.difficulty === 'Medium').sort(() => 0.5 - Math.random());
    const hardPool = available.filter(q => q.difficulty === 'Hard').sort(() => 0.5 - Math.random());

    // Check availability
    if (easyPool.length < distribution.easy || mediumPool.length < distribution.medium || hardPool.length < distribution.hard) {
      const message = `Not enough questions available for this distribution:\n` +
        `Need: ${distribution.easy} Easy, ${distribution.medium} Medium, ${distribution.hard} Hard\n` +
        `Available: ${easyPool.length} Easy, ${mediumPool.length} Medium, ${hardPool.length} Hard`;
      alert(message);
      return;
    }

    const selectedIds = [
      ...easyPool.slice(0, distribution.easy).map(q => String(q.id)),
      ...mediumPool.slice(0, distribution.medium).map(q => String(q.id)),
      ...hardPool.slice(0, distribution.hard).map(q => String(q.id)),
    ];

    setFormData(prev => ({
      ...prev,
      aptitude_question_ids: [...new Set([...prev.aptitude_question_ids, ...selectedIds])],
    }));

    alert(`✅ Aptitude distribution applied! Added ${selectedIds.length} questions:\n${distribution.easy} Easy (${aptitudeConfig.easy_percentage}%), ${distribution.medium} Medium (${aptitudeConfig.medium_percentage}%), ${distribution.hard} Hard (${aptitudeConfig.hard_percentage}%)`);
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
      // Dropping a batch drops any section narrowing selected for it too
      assigned_sections: prev.assigned_sections.filter(key => !key.startsWith(`${batch}::`)),
    }));
  }

  function toggleSection(batch, section) {
    const key = `${batch}::${section}`;
    setFormData(prev => ({
      ...prev,
      assigned_sections: prev.assigned_sections.includes(key)
        ? prev.assigned_sections.filter(k => k !== key)
        : [...prev.assigned_sections, key],
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
    ? (
        formData.assigned_sections.length > 0 && students.length > 0
          ? students.filter(s => {
              const key = `${s.batch}::${s.section}`;
              if (formData.assigned_sections.includes(key) || formData.assigned_sections.includes(s.section)) {
                return true;
              }
              const hasSectionNarrowing = formData.assigned_sections.some(k => k.startsWith(`${s.batch}::`));
              return !hasSectionNarrowing && formData.assigned_batches.includes(s.batch);
            }).length
          : batches.filter(b => formData.assigned_batches.includes(b.batch))
              .reduce((sum, b) => sum + b.student_count, 0)
      )
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
              Step {step} of 4: {step === 1 ? 'Basic Information' : step === 2 ? 'Select Content' : step === 3 ? 'Security & Anti-Cheat Settings' : 'Assign Students'}
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
          {[1, 2, 3, 4].map((s) => (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 500, fontSize: 14 }}>
                      <Calendar size={14} style={{ display: 'inline', marginRight: 4 }} />
                      Access Starts (Students can begin)
                    </label>
                    {formData.access_start_time && (
                      <button 
                        type="button" 
                        onClick={() => setFormData({...formData, access_start_time: ''})}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    value={formData.access_start_time}
                    onChange={(e) => setFormData({ ...formData, access_start_time: e.target.value })}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontWeight: 500, fontSize: 14 }}>
                      <Calendar size={14} style={{ display: 'inline', marginRight: 4 }} />
                      Access Deadline (Contest link expires)
                    </label>
                    {formData.access_end_time && (
                      <button 
                        type="button" 
                        onClick={() => setFormData({...formData, access_end_time: ''})}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    value={formData.access_end_time}
                    onChange={(e) => setFormData({ ...formData, access_end_time: e.target.value })}
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
                  Individual Session Duration (minutes)
                </label>
                <input
                  type="number"
                  value={formData.session_duration_minutes === 0 ? '' : formData.session_duration_minutes}
                  onChange={(e) => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setFormData({ ...formData, session_duration_minutes: val });
                  }}
                  min={1}
                  max={480}
                  placeholder="Enter minutes (e.g., 30)"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 8,
                    fontSize: 14,
                  }}
                />
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
                  ⏱️ Each student gets this much time from when they start the contest (e.g., 30 minutes). 
                  Contest auto-submits when time expires.
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
                            <div key={cat.id} style={{ marginBottom: 10 }}>
                              <label style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 700, color: '#374151', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', cursor: 'pointer' }}>
                                <input 
                                  type="checkbox"
                                  checked={selectedTopics.includes(cat.id.toString())}
                                  onChange={(e) => {
                                    const idStr = cat.id.toString();
                                    if (e.target.checked) setSelectedTopics([...selectedTopics, idStr]);
                                    else setSelectedTopics(selectedTopics.filter(t => t !== idStr));
                                  }}
                                  style={{ marginRight: 6 }}
                                />
                                {cat.title}
                              </label>
                              {(cat.subcategories || []).map(sub => (
                                <div key={sub.id} style={{ marginLeft: 12, marginBottom: 4 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color: '#4f46e5', marginBottom: 2, cursor: 'pointer' }}>
                                    <input 
                                      type="checkbox"
                                      checked={selectedTopics.includes(sub.id.toString())}
                                      onChange={(e) => {
                                        const idStr = sub.id.toString();
                                        if (e.target.checked) setSelectedTopics([...selectedTopics, idStr]);
                                        else setSelectedTopics(selectedTopics.filter(t => t !== idStr));
                                      }}
                                      style={{ marginRight: 6 }}
                                    />
                                    {sub.title}
                                  </label>
                                  {(sub.topics || []).map(topic => (
                                    <label key={topic.id} style={{ display: 'flex', alignItems: 'center', padding: '3px 0', cursor: 'pointer', fontSize: 13, marginLeft: 16 }}>
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

                  {/* Random Selection Option for Programming */}
                  {formData.contest_type === 'programming' && selectedTopics.length > 0 && (
                    <div style={{ 
                      marginBottom: 16, 
                      padding: 16, 
                      background: '#f0f9ff', 
                      borderRadius: 12, 
                      border: '1px solid #bae6fd',
                    }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1' }}>Smart Programming Distribution</div>
                        <div style={{ fontSize: 12, color: '#0c4a6e' }}>Select problems with percentage-based difficulty distribution</div>
                      </div>
                      
                      {/* Total Problems Input */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                            Total Problems to Select
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentTotal = formData.problem_slugs.length;
                              setProgrammingConfig(prev => ({ ...prev, total: currentTotal }));
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer',
                              color: '#374151'
                            }}
                          >
                            Sync ({formData.problem_slugs.length} selected)
                          </button>
                        </div>
                        <input 
                          type="number" 
                          value={programmingConfig.total}
                          onChange={(e) => setProgrammingConfig({...programmingConfig, total: parseInt(e.target.value) || 0})}
                          min={0}
                          max={50}
                          style={{ 
                            width: '100%', 
                            padding: '10px 12px', 
                            border: '2px solid #3b82f6', 
                            borderRadius: 8, 
                            fontSize: 14,
                            fontWeight: 600,
                            textAlign: 'center'
                          }}
                        />
                        {formData.problem_slugs.length > 0 && formData.problem_slugs.length !== programmingConfig.total && (
                          <div style={{ fontSize: 11, color: '#d97706', textAlign: 'center', marginTop: 4 }}>
                            ⚠️ You have {formData.problem_slugs.length} problems selected but total is set to {programmingConfig.total}
                          </div>
                        )}
                      </div>

                      {/* Percentage Distribution */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                            EASY (%)
                          </label>
                          <input 
                            type="number" 
                            value={programmingConfig.easy_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setProgrammingConfig({...programmingConfig, easy_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #10b981', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#f0fdf4'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#059669', textAlign: 'center', marginTop: 2 }}>
                            ≈ {Math.round((programmingConfig.total * programmingConfig.easy_percentage) / 100)} problems
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                            MEDIUM (%)
                          </label>
                          <input 
                            type="number" 
                            value={programmingConfig.medium_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setProgrammingConfig({...programmingConfig, medium_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #f59e0b', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#fffbeb'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#d97706', textAlign: 'center', marginTop: 2 }}>
                            ≈ {Math.round((programmingConfig.total * programmingConfig.medium_percentage) / 100)} problems
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                            HARD (%)
                          </label>
                          <input 
                            type="number" 
                            value={programmingConfig.hard_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setProgrammingConfig({...programmingConfig, hard_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #ef4444', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#fef2f2'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#dc2626', textAlign: 'center', marginTop: 2 }}>
                            ≈ {programmingConfig.total - Math.round((programmingConfig.total * programmingConfig.easy_percentage) / 100) - Math.round((programmingConfig.total * programmingConfig.medium_percentage) / 100)} problems
                          </div>
                        </div>
                      </div>

                      {/* Percentage Validation */}
                      <div style={{ 
                        marginBottom: 12, 
                        padding: '8px 12px', 
                        borderRadius: 6,
                        background: (programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) === 100 
                          ? '#f0fdf4' : '#fef3c7',
                        border: `1px solid ${(programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) === 100 
                          ? '#bbf7d0' : '#fcd34d'}`
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                          Total: {programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage}%
                          {(programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) !== 100 && (
                            <span style={{ color: '#d97706', marginLeft: 8 }}>
                              (Should equal 100%)
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={applyProgrammingDistribution}
                        disabled={(programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) !== 100}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: (programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) === 100 
                            ? '#0369a1' : '#d1d5db',
                          color: 'white',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: (programmingConfig.easy_percentage + programmingConfig.medium_percentage + programmingConfig.hard_percentage) === 100 
                            ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Plus size={16} />
                        Apply Programming Distribution ({programmingConfig.total} problems)
                      </button>
                    </div>
                  )}

                  {/* Aptitude Distribution Section */}
                  {formData.contest_type === 'aptitude' && (
                    <div style={{ 
                      marginBottom: 16, 
                      padding: 16, 
                      background: '#f8fafc', 
                      borderRadius: 12, 
                      border: '1px solid #cbd5e1',
                    }}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1' }}>Smart Aptitude Distribution</div>
                        <div style={{ fontSize: 12, color: '#0c4a6e' }}>Select questions with percentage-based difficulty distribution</div>
                      </div>
                      
                      {/* Total Questions Input */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                            Total Questions to Select
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const currentTotal = formData.aptitude_question_ids.length;
                              setAptitudeConfig(prev => ({ ...prev, total: currentTotal }));
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer',
                              color: '#374151'
                            }}
                          >
                            Sync ({formData.aptitude_question_ids.length} selected)
                          </button>
                        </div>
                        <input 
                          type="number" 
                          value={aptitudeConfig.total}
                          onChange={(e) => setAptitudeConfig({...aptitudeConfig, total: parseInt(e.target.value) || 0})}
                          min={0}
                          max={100}
                          style={{ 
                            width: '100%', 
                            padding: '10px 12px', 
                            border: '2px solid #4f46e5', 
                            borderRadius: 8, 
                            fontSize: 14,
                            fontWeight: 600,
                            textAlign: 'center'
                          }}
                        />
                        {formData.aptitude_question_ids.length > 0 && formData.aptitude_question_ids.length !== aptitudeConfig.total && (
                          <div style={{ fontSize: 11, color: '#d97706', textAlign: 'center', marginTop: 4 }}>
                            ⚠️ You have {formData.aptitude_question_ids.length} questions selected but total is set to {aptitudeConfig.total}
                          </div>
                        )}
                      </div>

                      {/* Percentage Distribution */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                            EASY (%)
                          </label>
                          <input 
                            type="number" 
                            value={aptitudeConfig.easy_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setAptitudeConfig({...aptitudeConfig, easy_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #10b981', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#f0fdf4'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#059669', textAlign: 'center', marginTop: 2 }}>
                            ≈ {Math.round((aptitudeConfig.total * aptitudeConfig.easy_percentage) / 100)} questions
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                            MEDIUM (%)
                          </label>
                          <input 
                            type="number" 
                            value={aptitudeConfig.medium_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setAptitudeConfig({...aptitudeConfig, medium_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #f59e0b', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#fffbeb'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#d97706', textAlign: 'center', marginTop: 2 }}>
                            ≈ {Math.round((aptitudeConfig.total * aptitudeConfig.medium_percentage) / 100)} questions
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                            HARD (%)
                          </label>
                          <input 
                            type="number" 
                            value={aptitudeConfig.hard_percentage}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setAptitudeConfig({...aptitudeConfig, hard_percentage: Math.min(100, Math.max(0, val))});
                            }}
                            min={0}
                            max={100}
                            style={{ 
                              width: '100%', 
                              padding: '8px', 
                              border: '1px solid #ef4444', 
                              borderRadius: 6, 
                              fontSize: 13,
                              textAlign: 'center',
                              background: '#fef2f2'
                            }}
                          />
                          <div style={{ fontSize: 10, color: '#dc2626', textAlign: 'center', marginTop: 2 }}>
                            ≈ {aptitudeConfig.total - Math.round((aptitudeConfig.total * aptitudeConfig.easy_percentage) / 100) - Math.round((aptitudeConfig.total * aptitudeConfig.medium_percentage) / 100)} questions
                          </div>
                        </div>
                      </div>

                      {/* Percentage Validation */}
                      <div style={{ 
                        marginBottom: 12, 
                        padding: '8px 12px', 
                        borderRadius: 6,
                        background: (aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) === 100 
                          ? '#f0fdf4' : '#fef3c7',
                        border: `1px solid ${(aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) === 100 
                          ? '#bbf7d0' : '#fcd34d'}`
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                          Total: {aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage}%
                          {(aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) !== 100 && (
                            <span style={{ color: '#d97706', marginLeft: 8 }}>
                              (Should equal 100%)
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={applyAptitudeDistribution}
                        disabled={(aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) !== 100}
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: (aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) === 100 
                            ? '#4f46e5' : '#d1d5db',
                          color: 'white',
                          border: 'none',
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: (aptitudeConfig.easy_percentage + aptitudeConfig.medium_percentage + aptitudeConfig.hard_percentage) === 100 
                            ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        }}
                      >
                        <Plus size={16} />
                        Apply Aptitude Distribution ({aptitudeConfig.total} questions)
                      </button>
                    </div>
                  )}

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
                        {/* Bulk Selection Tool */}
                        {selectedTopics.length > 1 && (
                          <div style={{ 
                            background: '#f8fafc', 
                            padding: 12, 
                            borderRadius: 10, 
                            border: '1px dashed #cbd5e1',
                            marginBottom: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 600 }}>Bulk Pick:</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input 
                                type="number" 
                                id="bulk-pick-count" 
                                placeholder="Qty" 
                                defaultValue={5}
                                style={{ width: 50, padding: '4px', borderRadius: 4, border: '1px solid #94a3b8', fontSize: 12 }}
                              />
                              <button 
                                type="button"
                                onClick={() => {
                                  const qty = parseInt(document.getElementById('bulk-pick-count').value);
                                  let totalAdded = 0;
                                  selectedTopics.forEach(tid => {
                                    const added = selectRandomByTopic(tid, qty);
                                    totalAdded += (added || 0);
                                  });
                                  alert(`✅ Bulk pick complete! Added ~${totalAdded} questions.`);
                                }}
                                style={{ background: '#0369a1', color: 'white', border: 'none', padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
                              >
                                Pick from Each
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedTopics.map(topicId => {
                          // Find topic name from aptitudeTopics
                          let topicName = 'Unknown Topic';
                          let isParent = false;
                          if (Array.isArray(aptitudeTopics)) {
                            aptitudeTopics.forEach(cat => {
                              if (cat.id.toString() === topicId.toString()) {
                                topicName = `[CAT] ${cat.title}`;
                                isParent = true;
                              }
                              (cat.subcategories || []).forEach(sub => {
                                if (sub.id.toString() === topicId.toString()) {
                                  topicName = `[SUB] ${sub.title}`;
                                  isParent = true;
                                }
                                const found = (sub.topics || []).find(t => t?.id?.toString() === topicId?.toString());
                                if (found) topicName = `${sub.title}: ${found.title}`;
                              });
                            });
                          }

                          // Calculate available count (including children)
                          const getAllChildrenIds = (id) => {
                            let ids = [id.toString()];
                            aptitudeTopics.forEach(cat => {
                              if (cat.id.toString() === id.toString()) {
                                (cat.subcategories || []).forEach(sub => {
                                  ids.push(sub.id.toString());
                                  (sub.topics || []).forEach(t => ids.push(t.id.toString()));
                                });
                              }
                              (cat.subcategories || []).forEach(sub => {
                                if (sub.id.toString() === id.toString()) {
                                  (sub.topics || []).forEach(t => ids.push(t.id.toString()));
                                }
                              });
                            });
                            return ids;
                          };
                          const childrenIds = getAllChildrenIds(topicId);
                          const availableCount = (aptitudeQuestions || []).filter(q => childrenIds.includes(q.topic_id?.toString())).length;

                          return (
                            <div key={topicId} style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 12, 
                              justifyContent: 'space-between',
                              background: 'white',
                              padding: '8px 12px',
                              borderRadius: 8,
                              border: isParent ? '1px solid #bae6fd' : '1px solid #e0f2fe'
                            }}>
                              <div style={{ flex: 1, fontSize: 13, fontWeight: isParent ? 700 : 500 }}>{topicName}</div>
                              <div style={{ fontSize: 11, color: '#666' }}>({availableCount} available)</div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                  type="number"
                                  id={`count-${topicId}`}
                                  placeholder="Qty"
                                  min={0}
                                  max={availableCount}
                                  style={{
                                    width: 50,
                                    padding: '4px 6px',
                                    border: '1px solid #3b82f6',
                                    borderRadius: 4,
                                    fontSize: 12,
                                  }}
                                  onFocus={(e) => e.target.select()}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = parseInt(document.getElementById(`count-${topicId}`).value);
                                    if (val > 0) {
                                      selectRandomByTopic(topicId, val);
                                      alert('✅ Picked!');
                                    }
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

                      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            selectedTopics.forEach(topicId => {
                              const val = parseInt(document.getElementById(`count-${topicId}`).value);
                              if (val > 0) selectRandomByTopic(topicId, val);
                            });
                            alert('✅ All selections applied.');
                          }}
                          style={{
                            flex: 1,
                            padding: '10px',
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Apply All Topic Counts
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({...prev, aptitude_question_ids: []}))}
                          style={{
                            padding: '10px 16px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fecaca',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Clear All
                        </button>
                      </div>

                      {/* Difficulty Distribution Section */}
                      <div style={{ 
                        marginTop: 20, 
                        paddingTop: 20, 
                        borderTop: '1px solid #bae6fd'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <Brain size={18} color="#0369a1" />
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#0369a1' }}>Smart Difficulty Distribution</div>
                        </div>
                        
                        {/* Total Questions Display (Read-only) */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                            Selected Questions to Distribute
                          </label>
                          <div style={{ 
                            width: '100%', 
                            padding: '10px 12px', 
                            border: '2px solid #10b981', 
                            borderRadius: 8, 
                            fontSize: 14,
                            fontWeight: 600,
                            textAlign: 'center',
                            background: '#f0fdf4',
                            color: '#059669'
                          }}>
                            {formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length} Questions Selected
                          </div>
                          {(formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length) === 0 && (
                            <div style={{ fontSize: 11, color: '#dc2626', textAlign: 'center', marginTop: 4 }}>
                              ⚠️ Please select questions from topics first
                            </div>
                          )}
                        </div>

                        {/* Percentage Distribution */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#059669', marginBottom: 4 }}>
                              EASY (%)
                            </label>
                            <input 
                              type="number" 
                              value={randomConfig.easy_percentage}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setRandomConfig({...randomConfig, easy_percentage: Math.min(100, Math.max(0, val))});
                              }}
                              min={0}
                              max={100}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #10b981', 
                                borderRadius: 6, 
                                fontSize: 13,
                                textAlign: 'center',
                                background: '#f0fdf4'
                              }}
                            />
                            <div style={{ fontSize: 10, color: '#059669', textAlign: 'center', marginTop: 2 }}>
                              ≈ {calculateDistribution().easy} questions
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#d97706', marginBottom: 4 }}>
                              MEDIUM (%)
                            </label>
                            <input 
                              type="number" 
                              value={randomConfig.medium_percentage}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setRandomConfig({...randomConfig, medium_percentage: Math.min(100, Math.max(0, val))});
                              }}
                              min={0}
                              max={100}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #f59e0b', 
                                borderRadius: 6, 
                                fontSize: 13,
                                textAlign: 'center',
                                background: '#fffbeb'
                              }}
                            />
                            <div style={{ fontSize: 10, color: '#d97706', textAlign: 'center', marginTop: 2 }}>
                              ≈ {calculateDistribution().medium} questions
                            </div>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>
                              HARD (%)
                            </label>
                            <input 
                              type="number" 
                              value={randomConfig.hard_percentage}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setRandomConfig({...randomConfig, hard_percentage: Math.min(100, Math.max(0, val))});
                              }}
                              min={0}
                              max={100}
                              style={{ 
                                width: '100%', 
                                padding: '8px', 
                                border: '1px solid #ef4444', 
                                borderRadius: 6, 
                                fontSize: 13,
                                textAlign: 'center',
                                background: '#fef2f2'
                              }}
                            />
                            <div style={{ fontSize: 10, color: '#dc2626', textAlign: 'center', marginTop: 2 }}>
                              ≈ {calculateDistribution().hard} questions
                            </div>
                          </div>
                        </div>

                        {/* Percentage Validation */}
                        <div style={{ 
                          marginBottom: 12, 
                          padding: '8px 12px', 
                          borderRadius: 6,
                          background: (randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) === 100 
                            ? '#f0fdf4' : '#fef3c7',
                          border: `1px solid ${(randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) === 100 
                            ? '#bbf7d0' : '#fcd34d'}`
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                            Total: {randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage}%
                            {(randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) !== 100 && (
                              <span style={{ color: '#d97706', marginLeft: 8 }}>
                                (Should equal 100%)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Quick Preset Buttons */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => setRandomConfig({...randomConfig, easy_percentage: 60, medium_percentage: 30, hard_percentage: 10})}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >
                            Easy Focus (60-30-10)
                          </button>
                          <button
                            type="button"
                            onClick={() => setRandomConfig({...randomConfig, easy_percentage: 50, medium_percentage: 30, hard_percentage: 20})}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >
                            Balanced (50-30-20)
                          </button>
                          <button
                            type="button"
                            onClick={() => setRandomConfig({...randomConfig, easy_percentage: 33, medium_percentage: 34, hard_percentage: 33})}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >
                            Equal (33-34-33)
                          </button>
                          <button
                            type="button"
                            onClick={() => setRandomConfig({...randomConfig, easy_percentage: 20, medium_percentage: 30, hard_percentage: 50})}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: 4,
                              fontSize: 10,
                              cursor: 'pointer'
                            }}
                          >
                            Hard Focus (20-30-50)
                          </button>
                        </div>

                          <button
                          type="button"
                          onClick={applySmartRandomSelection}
                          disabled={(randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) !== 100 || 
                                   (formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length) === 0}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: ((randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) === 100 && 
                                       (formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length) > 0)
                              ? 'var(--olive-900)' : '#d1d5db',
                            color: 'white',
                            border: 'none',
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: ((randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) === 100 && 
                                   (formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length) > 0)
                              ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            boxShadow: ((randomConfig.easy_percentage + randomConfig.medium_percentage + randomConfig.hard_percentage) === 100 && 
                                      (formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length) > 0)
                              ? '0 4px 12px rgba(57, 72, 42, 0.2)' : 'none'
                          }}
                        >
                          <Plus size={16} />
                          Apply Difficulty Distribution ({formData.contest_type === 'programming' ? formData.problem_slugs.length : formData.aptitude_question_ids.length} questions)
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
                                background: formData.aptitude_question_ids.includes(String(q.id)) ? '#f0fdf4' : 'transparent',
                                border: formData.aptitude_question_ids.includes(String(q.id)) ? '1px solid #bbf7d0' : '1px solid transparent',
                                transition: 'all 0.2s',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={formData.aptitude_question_ids.includes(String(q.id))}
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
                                  {q.correct_option && (
                                    <span style={{ color: '#166534', fontWeight: 700 }}>
                                      Correct: {q.correct_option}
                                    </span>
                                  )}
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
                        aptitudeQuestions.filter(q => formData.aptitude_question_ids.includes(String(q.id))).map((q, index) => (
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

          {/* Step 3: Security & Anti-Cheating Settings */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                  🛡️ Security & Anti-Cheating Rules
                </h3>
                <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
                  Configure proctoring and integrity constraints for this contest. These security rules will be enforced during the test.
                </p>

                {/* Tab Switch Check */}
                <div style={{ padding: 16, background: 'white', borderRadius: 10, border: '1px solid #cbd5e1', marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={formData.enable_tab_switch_check}
                      onChange={(e) => setFormData({ ...formData, enable_tab_switch_check: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#4f46e5' }}
                    />
                    Monitor Tab Switch & Window Blur
                  </label>
                  <p style={{ margin: '6px 0 12px 30px', color: '#64748b', fontSize: 13 }}>
                    Automatically warn or submit when student switches tabs or leaves the browser window.
                  </p>

                  {formData.enable_tab_switch_check && (
                    <div style={{ marginLeft: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: '#334155' }}>Maximum allowed tab switch warnings:</span>
                      <select
                        value={formData.max_tab_switches}
                        onChange={(e) => setFormData({ ...formData, max_tab_switches: parseInt(e.target.value) || 3 })}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}
                      >
                        <option value={1}>1 Warning (Strict - Auto submit on 2nd switch)</option>
                        <option value={2}>2 Warnings</option>
                        <option value={3}>3 Warnings (Standard)</option>
                        <option value={5}>5 Warnings</option>
                        <option value={10}>10 Warnings</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Fullscreen Lock */}
                <div style={{ padding: 16, background: 'white', borderRadius: 10, border: '1px solid #cbd5e1', marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={formData.enable_fullscreen_lock}
                      onChange={(e) => setFormData({ ...formData, enable_fullscreen_lock: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#4f46e5' }}
                    />
                    Enforce Fullscreen Mode
                  </label>
                  <p style={{ margin: '6px 0 0 30px', color: '#64748b', fontSize: 13 }}>
                    Forces students into fullscreen mode upon starting the test and records violations if exited.
                  </p>
                </div>

                {/* Copy / Paste Lock */}
                <div style={{ padding: 16, background: 'white', borderRadius: 10, border: '1px solid #cbd5e1' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontWeight: 600, fontSize: 15, color: '#1e293b' }}>
                    <input
                      type="checkbox"
                      checked={formData.enable_copy_paste_lock}
                      onChange={(e) => setFormData({ ...formData, enable_copy_paste_lock: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: '#4f46e5' }}
                    />
                    Disable Copy & Paste in Workspace
                  </label>
                  <p style={{ margin: '6px 0 0 30px', color: '#64748b', fontSize: 13 }}>
                    Prevents copying or pasting text or external solutions during the contest session.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Assign Students */}
          {step === 4 && (
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

                  {/* Section narrowing for each selected batch (optional — leave unselected for the whole batch) */}
                  {formData.assigned_batches.filter(b => (sectionsByBatch[b] || []).length > 0).map((batch) => (
                    <div key={batch} style={{ marginTop: 14 }}>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: '#666' }}>
                        Sections in Batch {batch} <span style={{ color: '#9ca3af' }}>(optional — leave blank for all sections)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(sectionsByBatch[batch] || []).map((section) => {
                          const key = `${batch}::${section}`;
                          const active = formData.assigned_sections.includes(key);
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => toggleSection(batch, section)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                border: active ? '2px solid #4f46e5' : '1px solid #d1d5db',
                                background: active ? '#eef2ff' : 'white',
                                color: active ? '#4f46e5' : '#666',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: active ? 600 : 400,
                              }}
                            >
                              Section {section}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
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
                      onChange={(e) => {
                        setSelectedBatchFilter(e.target.value);
                        setSelectedSectionFilter('');
                      }}
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
                    <select
                      value={selectedSectionFilter}
                      onChange={(e) => setSelectedSectionFilter(e.target.value)}
                      disabled={!selectedBatchFilter}
                      style={{
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: 8,
                        fontSize: 14,
                        opacity: selectedBatchFilter ? 1 : 0.5,
                      }}
                    >
                      <option value="">All Sections</option>
                      {(sectionsByBatch[selectedBatchFilter] || []).map((section) => (
                        <option key={section} value={section}>
                          Section {section}
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
                          <th style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>Section</th>
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
                            <td style={{ padding: '8px', textAlign: 'center', color: '#666' }}>
                              {student.section || '—'}
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
              {step < 4 ? (
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
