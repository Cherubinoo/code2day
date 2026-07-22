import React, { useState, useEffect } from 'react';
import { ChevronRight, Brain, Calculator, MessageSquare, BookOpen, ChevronDown } from 'lucide-react';
import AptitudeQuizPage from './AptitudeQuizPage';

export default function AptitudePage({ onToggleWorkspace }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState({});
  const [expandedSubcats, setExpandedSubcats] = useState({});
  const [practiceTopicId, setPracticeTopicId] = useState(null);

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

  const toggleSubcat = (id) => {
    setExpandedSubcats(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (practiceTopicId) {
    return <AptitudeQuizPage topicId={practiceTopicId} onBack={() => setPracticeTopicId(null)} />;
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
                  {cat.subcategories.map((subcat) => (
                    <div 
                      key={subcat.id} 
                      className="subcategory-card"
                      style={{ 
                        background: 'var(--bg-2)', 
                        borderRadius: '20px', 
                        border: '1px solid var(--border-soft)',
                        padding: '24px',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <div 
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '16px' }}
                        onClick={() => toggleSubcat(subcat.id)}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: 'var(--text-main)' }}>{subcat.title}</h3>
                          {subcat.question_count > 0 && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)', marginTop: '4px' }}>
                              {subcat.solved_count}/{subcat.question_count} Questions Solved
                            </span>
                          )}
                        </div>
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '10px', 
                          background: expandedSubcats[subcat.id] ? 'var(--olive-900)' : 'var(--bg-1)',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: expandedSubcats[subcat.id] ? '#fff' : 'var(--text-soft)',
                          transition: 'all 0.3s ease'
                        }}>
                          <ChevronRight 
                            size={20} 
                            style={{ 
                              transform: expandedSubcats[subcat.id] ? 'rotate(90deg)' : 'rotate(0)',
                              transition: 'transform 0.3s ease'
                            }} 
                          />
                        </div>
                      </div>
                      
                      {expandedSubcats[subcat.id] && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          marginTop: '12px',
                          borderLeft: '2px solid var(--sage-200)',
                          paddingLeft: '16px'
                        }}>
                          {subcat.question_count > 0 && (
                            <button
                              onClick={() => setPracticeTopicId(subcat.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                background: 'var(--olive-900)',
                                border: '1px solid var(--olive-900)',
                                borderRadius: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                color: '#fff',
                                fontWeight: '700'
                              }}
                            >
                              <Brain size={16} />
                              <span style={{ fontSize: '1rem' }}>Practice All Questions</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.8rem' }}>
                                  {subcat.solved_count}/{subcat.question_count}
                                </span>
                              </div>
                            </button>
                          )}
                          {subcat.question_count === 0 && subcat.topics.length === 0 && (
                            <div style={{ padding: '12px 16px', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
                              No questions yet.
                            </div>
                          )}
                          {subcat.topics.map((topic) => (
                            <button 
                              key={topic.id}
                              onClick={() => setPracticeTopicId(topic.id)}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '12px',
                                padding: '12px 16px',
                                background: 'var(--bg-1)',
                                border: '1px solid var(--border-soft)',
                                borderRadius: '12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                color: 'var(--text-main)',
                                fontWeight: '500'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.borderColor = 'var(--olive-400)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border-soft)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            >
                              <BookOpen size={16} style={{ color: 'var(--olive-600)' }} />
                              <span style={{ fontSize: '1rem' }}>{topic.title}</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
                                  {topic.solved_count}/{topic.question_count}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ))}
      </div>

    </div>
  );
}
