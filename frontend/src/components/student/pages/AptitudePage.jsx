import React, { useState, useEffect } from 'react';
import { Brain, Calculator, MessageSquare, ChevronDown, BookOpen } from 'lucide-react';
import AptitudeQuizPage from './AptitudeQuizPage';
import ReadingComprehensionPage from './ReadingComprehensionPage';
import { useDrillDownParam } from '../../../lib/useDrillDownParam';

export default function AptitudePage({ dashboard, onToggleWorkspace }) {
  const lockedModules = dashboard?.locked_modules || [];
  const practiceLocked = lockedModules.includes('aptitude_practice');
  const readingLocked = lockedModules.includes('aptitude_reading');
  const [activeSection, setActiveSection] = useState(practiceLocked && !readingLocked ? 'reading' : 'topics');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});

  // useDrillDownParam (not plain useState + replaceState) so the browser
  // Back button actually closes the quiz back to the topic list — the
  // previous replaceState-only version never created a back-able history
  // entry, so Back fell straight through to the top-level page router.
  const [practiceTopicId, setPracticeTopicIdRaw] = useDrillDownParam("topic", {
    defaultValue: (() => {
      const params = new URLSearchParams(window.location.search);
      return params.get("topic") || params.get("topic_id") || sessionStorage.getItem("code2day-aptitude-topic-id") || null;
    })(),
    parse: (v) => v || null,
  });

  const setPracticeTopicId = (id) => {
    if (id) {
      sessionStorage.setItem("code2day-aptitude-topic-id", String(id));
    } else {
      sessionStorage.removeItem("code2day-aptitude-topic-id");
      sessionStorage.removeItem("code2day-aptitude-question-index");
    }
    setPracticeTopicIdRaw(id);
  };

  // Sync isInsideWorkspace state with parent
  useEffect(() => {
    if (onToggleWorkspace) {
      onToggleWorkspace(Boolean(practiceTopicId));
    }
    // Cleanup
    return () => {
      if (onToggleWorkspace) onToggleWorkspace(false);
    };
  }, [practiceTopicId, onToggleWorkspace]);

  useEffect(() => {
    const fetchTopics = () => {
      setLoading(true);
      fetch('/api/aptitude/topics/', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setCategories(data.categories || []);
          // Expand first category if nothing expanded yet
          if (data.categories && data.categories.length > 0 && Object.keys(expandedCats).length === 0) {
            setExpandedCats({ [data.categories[0].id]: true });
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("Error fetching aptitude topics:", err);
          setLoading(false);
        });
    };

    if (!practiceTopicId) {
      fetchTopics();
    }
  }, [practiceTopicId]);

  const toggleCat = (id) => {
    setExpandedCats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (practiceTopicId) {
    return <AptitudeQuizPage topicId={practiceTopicId} onBack={() => setPracticeTopicId(null)} />;
  }

  const sectionTabs = (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
      {!practiceLocked && (
        <button
          onClick={() => setActiveSection('topics')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 14,
            border: activeSection === 'topics' ? 'none' : '1px solid var(--border-soft)',
            background: activeSection === 'topics' ? 'var(--olive-900)' : 'var(--bg-1)',
            color: activeSection === 'topics' ? '#fff' : 'var(--olive-900)',
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Brain size={16} /> Practice Topics
        </button>
      )}
      {!readingLocked && (
        <button
          onClick={() => setActiveSection('reading')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 22px', borderRadius: 14,
            border: activeSection === 'reading' ? 'none' : '1px solid var(--border-soft)',
            background: activeSection === 'reading' ? 'var(--olive-900)' : 'var(--bg-1)',
            color: activeSection === 'reading' ? '#fff' : 'var(--olive-900)',
            fontWeight: 700, cursor: 'pointer',
          }}
        >
          <BookOpen size={16} /> Reading Comprehension
        </button>
      )}
    </div>
  );

  if (activeSection === 'reading' && !readingLocked) {
    return (
      <div className="aptitude-page" style={{ padding: '24px 24px 0', width: '100%', margin: '0' }}>
        {sectionTabs}
        <ReadingComprehensionPage />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-container" style={{ padding: '60px', textAlign: 'center' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Loading Aptitude Modules...</p>
      </div>
    );
  }

  return (
    <div className="aptitude-page" style={{ padding: '24px', width: '100%', margin: '0' }}>
      {sectionTabs}
      <header className="page-header" style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ 
          fontSize: '2.8rem', 
          fontWeight: '900', 
          color: 'var(--olive-900)', 
          marginBottom: '12px',
          letterSpacing: '-0.02em'
        }}>
          Aptitude Masterclass
        </h1>
        <p style={{ color: 'var(--text-soft)', fontSize: '1.2rem', maxWidth: '800px', margin: '0 auto' }}>
          Comprehensive training modules for campus placements and competitive exams.
        </p>
      </header>

      <div className="categories-stack" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {categories.map((cat) => (
          <section 
            key={cat.id} 
            className="category-section" 
            style={{ 
              background: 'var(--bg-1)', 
              borderRadius: '32px', 
              border: '1px solid var(--border-soft)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-soft)'
            }}
          >
            <div 
              className="category-hero" 
              onClick={() => toggleCat(cat.id)}
              style={{ 
                padding: '32px', 
                background: 'linear-gradient(135deg, var(--sage-100) 0%, transparent 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ 
                  width: '64px', 
                  height: '64px', 
                  borderRadius: '20px', 
                  background: 'var(--olive-900)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: '#fff',
                  boxShadow: '0 8px 16px rgba(57, 72, 42, 0.2)'
                }}>
                  {cat.title.includes('QUANT') ? <Calculator size={32} /> : 
                   cat.title.includes('LOGIC') ? <Brain size={32} /> : 
                   <MessageSquare size={32} />}
                </div>
                <div>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0, color: 'var(--olive-900)' }}>{cat.title}</h2>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center' }}>
                    <span className="badge" style={{ background: 'var(--sage-200)', color: 'var(--olive-900)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600' }}>
                      {cat.subcategories.length} Modules
                    </span>
                    {cat.question_count > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '100px', height: '6px', background: 'var(--sage-200)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${(cat.solved_count / cat.question_count) * 100}%`, 
                            height: '100%', 
                            background: 'var(--olive-900)',
                            transition: 'width 0.6s ease'
                          }}></div>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontWeight: '600' }}>
                          {Math.round((cat.solved_count / cat.question_count) * 100)}%
                        </span>
                      </div>
                    )}
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-soft)', alignSelf: 'center' }}>
                      {cat.question_count > 0 ? `${cat.solved_count}/${cat.question_count} Solved` : 'Coming Soon'}
                    </span>
                  </div>
                </div>
              </div>
              <ChevronDown 
                size={28}
                style={{ 
                  transform: expandedCats[cat.id] ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  color: 'var(--olive-900)',
                  opacity: 0.6
                }} 
              />
            </div>

            {expandedCats[cat.id] && (
              <div className="subcategories-grid" style={{ padding: '0 32px 32px' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', 
                  gap: '20px', 
                  marginTop: '16px' 
                }}>
                  {cat.subcategories.map((subcat) => {
                    const hasQuestions = subcat.question_count > 0;
                    return (
                      <button
                        key={subcat.id}
                        className="subcategory-card"
                        onClick={() => hasQuestions && setPracticeTopicId(subcat.id)}
                        disabled={!hasQuestions}
                        style={{
                          background: 'var(--bg-2)',
                          borderRadius: '20px',
                          border: '1px solid var(--border-soft)',
                          padding: '24px',
                          transition: 'all 0.2s ease',
                          textAlign: 'left',
                          cursor: hasQuestions ? 'pointer' : 'default',
                          opacity: hasQuestions ? 1 : 0.6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={(e) => { if (hasQuestions) { e.currentTarget.style.borderColor = 'var(--olive-400)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-soft)'; e.currentTarget.style.transform = 'none'; }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>{subcat.title}</h3>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', marginTop: '4px' }}>
                            {hasQuestions ? `${subcat.solved_count}/${subcat.question_count} Questions Solved` : 'Coming Soon'}
                          </span>
                        </div>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '10px',
                          background: hasQuestions ? 'var(--olive-900)' : 'var(--bg-1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: hasQuestions ? '#fff' : 'var(--text-soft)',
                          flexShrink: 0,
                        }}>
                          <Brain size={18} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

    </div>
  );
}
