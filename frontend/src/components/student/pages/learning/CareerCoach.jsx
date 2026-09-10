import React, { useState, useEffect } from 'react';

const COMPANIES = ['Zoho', 'TCS', 'Infosys', 'HCL', 'Accenture', 'Amazon', 'Microsoft'];

const CareerCoach = ({ user, latestAnalysis, token, API_BASE, fetchWithAuth }) => {
  const [targetCompany, setTargetCompany] = useState('Zoho');
  const [advisorData, setAdvisorData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchAdvisorData(targetCompany);
  }, [token, targetCompany]);

  const fetchAdvisorData = async (company) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/learning/advisor/?target_company=${company}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdvisorData(data);
      }
    } catch (err) {
      console.error('Error fetching advisor data:', err);
    } finally {
      setLoading(false);
    }
  };

  const checklist = advisorData?.company_prep_checklist || [];
  const detectedSkills = checklist.filter(s => s.status).map(s => s.skill_name);
  const missingSkills = checklist.filter(s => !s.status).map(s => s.skill_name);
  const recommendations = advisorData?.weaknesses || [];
  const strengths = advisorData?.strengths || [];
  const scores = advisorData?.readiness_scores || {};
  const aiInsight = advisorData?.ai_coach_insight || null;

  return (
    <div className="dashboard-content-page" style={{ maxWidth: '1200px' }}>
      <style>{`
        .coach-card-container {
          background: #FAF8F5;
          border-radius: 24px;
          border: 1px solid rgba(13, 148, 136, 0.08);
          padding: 32px;
          box-shadow: 0 10px 40px rgba(13, 148, 136, 0.03);
          margin-bottom: 24px;
        }
        .skill-gap-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        .skill-list-card {
          background: #FFFFFF;
          border: 1px solid rgba(13, 148, 136, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.01);
        }
        .skill-pill-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 16px;
          font-size: 13px;
          font-weight: 700;
          margin: 4px;
        }
        .skill-pill-tag.detected {
          background: rgba(16, 185, 129, 0.08);
          color: #047857;
          border: 1px solid rgba(16, 185, 129, 0.15);
        }
        .skill-pill-tag.missing {
          background: rgba(239, 68, 68, 0.08);
          color: #B91C1C;
          border: 1px solid rgba(239, 68, 68, 0.15);
        }
        .skill-pill-tag.recommended {
          background: rgba(13, 148, 136, 0.08);
          color: #0D9488;
          border: 1px solid rgba(13, 148, 136, 0.15);
        }
        .role-switch-select {
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid rgba(13, 148, 136, 0.2);
          background: #FFFFFF;
          font-size: 14.5px;
          font-weight: 700;
          color: #0D9488;
          outline: none;
          cursor: pointer;
        }
        .readiness-bar-track {
          height: 6px;
          background: rgba(13, 148, 136, 0.1);
          border-radius: 3px;
          overflow: hidden;
          margin-top: 4px;
        }
        .readiness-bar-fill {
          height: 100%;
          background: #14B8A6;
          border-radius: 3px;
          transition: width 0.5s ease;
        }
        .score-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .score-item label {
          font-size: 12px;
          font-weight: 700;
          color: #5C6E6D;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          justify-content: space-between;
        }
        .score-item label span { color: #0D9488; }
        .cc-empty {
          text-align: center;
          color: #8BA1A0;
          font-size: 14px;
          padding: 24px 0;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0D9488', margin: '0 0 6px 0' }}>AI Career Coach</h1>
          <p style={{ fontSize: '15px', color: '#5C6E6D', margin: '0' }}>Evaluate your skills alignment and close gaps for your target company.</p>
        </div>
        <div>
          <select
            value={targetCompany}
            onChange={(e) => setTargetCompany(e.target.value)}
            className="role-switch-select"
          >
            {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="cc-empty">Loading your career analysis for <strong>{targetCompany}</strong>...</div>
      ) : (
        <>
          {/* 1. Readiness Scores */}
          {Object.keys(scores).length > 0 && (
            <div className="coach-card-container">
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488', margin: '0 0 4px 0' }}>
                Placement Readiness Scores
              </h2>
              <p style={{ fontSize: '13.5px', color: '#5C6E6D', margin: '0 0 8px 0' }}>
                Calculated from your resume, interviews, and communication assessments.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
                  background: `conic-gradient(#14B8A6 ${scores.overall || 0}%, rgba(13,148,136,0.1) 0)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                }}>
                  <div style={{ position: 'absolute', width: '58px', height: '58px', background: '#FAF8F5', borderRadius: '50%' }} />
                  <span style={{ position: 'relative', fontSize: '16px', fontWeight: '800', color: '#0D9488' }}>{scores.overall || 0}%</span>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488' }}>Overall Readiness</div>
                  <div style={{ fontSize: '13px', color: '#5C6E6D' }}>Target company: <strong>{targetCompany}</strong></div>
                </div>
              </div>
              <div className="score-grid">
                {[['Technical', scores.technical], ['Projects', scores.projects], ['Resume', scores.resume], ['Communication', scores.communication], ['Interview', scores.interview], ['Industry', scores.industry]].map(([label, val]) => (
                  <div key={label} className="score-item">
                    <label>{label} <span>{val || 0}%</span></label>
                    <div className="readiness-bar-track">
                      <div className="readiness-bar-fill" style={{ width: `${val || 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Skill Gap Analysis */}
          <div className="coach-card-container">
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488', margin: '0 0 8px 0' }}>
              Skill Alignment for {targetCompany}
            </h2>
            <p style={{ fontSize: '13.5px', color: '#5C6E6D', margin: '0 0 4px 0' }}>
              Comparing your current skills against what <strong>{targetCompany}</strong> recruiters require.
            </p>
            <div className="skill-gap-grid">
              <div className="skill-list-card">
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0D9488', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✓</span> Skills You Have
                </h3>
                {detectedSkills.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {detectedSkills.map((s, i) => <span key={i} className="skill-pill-tag detected">✓ {s}</span>)}
                  </div>
                ) : (
                  <div className="cc-empty">Add skills to your resume to see alignment.</div>
                )}
              </div>

              <div className="skill-list-card">
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#B91C1C', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✗</span> Skills to Develop
                </h3>
                {missingSkills.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {missingSkills.map((s, i) => <span key={i} className="skill-pill-tag missing">✗ {s}</span>)}
                  </div>
                ) : (
                  <div className="cc-empty" style={{ color: '#047857' }}>Great — you meet all required skills!</div>
                )}
              </div>

              <div className="skill-list-card">
                <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0D9488', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✨</span> Priority Actions
                </h3>
                {recommendations.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {recommendations.map((r, i) => <span key={i} className="skill-pill-tag recommended">{r}</span>)}
                  </div>
                ) : strengths.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {strengths.map((s, i) => <span key={i} className="skill-pill-tag recommended">Keep building: {s}</span>)}
                  </div>
                ) : (
                  <div className="cc-empty">Complete your profile to get personalized recommendations.</div>
                )}
              </div>
            </div>
          </div>

          {/* 3. AI Mentor Career Advice */}
          <div className="coach-card-container">
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#0D9488', margin: '0 0 12px 0' }}>
              Personalized Career Recommendations
            </h2>
            <div style={{ background: '#FFFFFF', border: '1px solid rgba(13, 148, 136, 0.08)', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '32px' }}>💡</div>
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: '800', color: '#0D9488' }}>
                    AI Mentor Insights for {user?.profile?.full_name || user?.username || 'You'}
                  </h4>
                  {aiInsight ? (
                    <p style={{ margin: '0', fontSize: '13.5px', color: '#5C6E6D', lineHeight: '1.7' }}>{aiInsight}</p>
                  ) : advisorData ? (
                    <div>
                      <p style={{ margin: '0 0 12px 0', fontSize: '13.5px', color: '#5C6E6D', lineHeight: '1.7' }}>
                        Based on your profile targeting <strong>{targetCompany}</strong>, your current readiness is <strong>{scores.overall || 0}%</strong>.
                        {missingSkills.length > 0 && ` Focus on closing your skill gaps: ${missingSkills.slice(0, 2).join(' and ')}.`}
                        {strengths.length > 0 && ` Your strengths in ${strengths.slice(0, 2).join(' and ')} give you a strong foundation.`}
                      </p>
                      {recommendations.length > 0 && (
                        <ul style={{ margin: '0', paddingLeft: '20px', fontSize: '13.5px', color: '#5C6E6D', lineHeight: '1.8' }}>
                          {recommendations.map((r, i) => <li key={i}><strong>Action:</strong> {r}</li>)}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p style={{ margin: '0', fontSize: '13.5px', color: '#5C6E6D', lineHeight: '1.7' }}>
                      Complete your profile, upload a resume, and practice interviews to unlock personalized AI career coaching insights.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CareerCoach;
