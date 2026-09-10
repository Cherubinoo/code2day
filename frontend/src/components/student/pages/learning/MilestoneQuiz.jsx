import React, { useState, useEffect } from 'react';

const generateFallbackQuestions = (milestoneName, category) => {
  const topicMap = {
    DSA: [
      { q: 'What is the time complexity of binary search?', options: ['O(n)', 'O(log n)', 'O(n squared)', 'O(1)'], answer: 1 },
      { q: 'Which data structure uses LIFO order?', options: ['Queue', 'Stack', 'Linked List', 'Tree'], answer: 1 },
      { q: 'Worst-case time complexity of QuickSort?', options: ['O(n log n)', 'O(n)', 'O(n squared)', 'O(log n)'], answer: 2 },
      { q: 'Which traversal visits Left - Root - Right?', options: ['Pre-order', 'Post-order', 'In-order', 'Level-order'], answer: 2 },
      { q: 'What is a Hash Map used for?', options: ['Sorting', 'O(1) average lookup by key', 'Tree traversal', 'Graph search'], answer: 1 },
    ],
    SystemDesign: [
      { q: 'What does CAP theorem state?', options: ['All 3 guarantees always', 'Only 2 of 3 can be guaranteed', 'Consistency is sacrificed', 'Availability is unimportant'], answer: 1 },
      { q: 'Best pattern for decoupling microservices?', options: ['REST direct calls', 'Message queues', 'Shared DB', 'Monolith'], answer: 1 },
      { q: 'What is horizontal scaling?', options: ['More RAM/CPU', 'More machines', 'Bigger disk', 'Less latency'], answer: 1 },
      { q: 'Purpose of a CDN?', options: ['DB caching', 'Static content closer to users', 'Load balancing APIs', 'Auth'], answer: 1 },
      { q: 'Best DB for schema-less flexible data?', options: ['SQL', 'NoSQL', 'Graph DB', 'Time-series'], answer: 1 },
    ],
    Resume: [
      { q: 'What does ATS stand for?', options: ['Application Tracking System', 'Applicant Tracking System', 'Auto Tech Scanner', 'Advanced Text System'], answer: 1 },
      { q: 'Most ATS-friendly resume format?', options: ['PDF with graphics', 'Simple text/PDF', 'Image PDF', 'HTML'], answer: 1 },
      { q: 'Ideal resume length for a fresher?', options: ['3-4 pages', '1 page', '2 pages', 'As long as needed'], answer: 1 },
      { q: 'First section on a technical resume?', options: ['Hobbies', 'Contact info', 'References', 'Certifications'], answer: 1 },
      { q: 'What makes a bullet point strong?', options: ['Vague descriptions', 'Action verb + quantifiable impact', 'Long paragraphs', 'Responsibilities only'], answer: 1 },
    ],
    Communication: [
      { q: 'STAR method is used for?', options: ['Documentation', 'Behavioral interview answers', 'Writing emails', 'Coding'], answer: 1 },
      { q: 'Which technique involves paraphrasing back what was said?', options: ['Passive', 'Active listening', 'Critical', 'Selective'], answer: 1 },
      { q: 'Approx percentage of non-verbal communication?', options: ['10%', '30%', '55-65%', '90%'], answer: 2 },
      { q: 'Most formal professional email salutation?', options: ['Hey', 'Hi there', 'Dear Mr./Ms. Name', 'Yo'], answer: 2 },
      { q: 'What is an elevator pitch?', options: ['Pitch in elevators', 'Brief self-intro under 60 seconds', '10-min presentation', 'Sales deck'], answer: 1 },
    ],
  };
  const name = (milestoneName || '').toLowerCase();
  const cat = (category || '').toLowerCase();
  if (name.includes('dsa') || name.includes('data structure') || name.includes('algorithm')) return topicMap.DSA;
  if (name.includes('system design') || cat.includes('system')) return topicMap.SystemDesign;
  if (name.includes('resume') || cat.includes('resume')) return topicMap.Resume;
  if (name.includes('communication') || name.includes('verbal') || cat.includes('communication')) return topicMap.Communication;
  return [
    { q: 'What is the best approach to master ' + (milestoneName||'this topic') + '?', options: ['Reading only', 'Building projects', 'Watching videos', 'Memorizing notes'], answer: 1 },
    { q: 'How do you demonstrate competency in a skill during an interview?', options: ['List on resume', 'Explain clearly with examples', 'Say you know it', 'Show marks'], answer: 1 },
    { q: 'What distinguishes an expert from a beginner?', options: ['Years of exp', 'Deep understanding + patterns', 'Certifications', 'Age'], answer: 1 },
    { q: 'What is the recommended approach for skill gap analysis?', options: ['Ignore gaps', 'Compare skills with job requirements', 'Apply anyway', 'Copy resumes'], answer: 1 },
    { q: 'Best way to retain newly learned concepts?', options: ['Read once', 'Spaced repetition + practice', 'Highlight notes', 'Watch again'], answer: 1 },
  ];
};

const PASS = 70;

const MilestoneQuiz = ({ milestone, onClose, onPass, API_BASE, token }) => {
  const [questions, setQuestions] = useState([]);
  const [selected, setSelected] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);

  useEffect(() => { load(); }, [milestone?.id]);

  const load = async () => {
    setLoading(true); setSelected({}); setSubmitted(false); setCurrent(0);
    if (token && API_BASE) {
      try {
        const res = await fetch(
          API_BASE + '/api/learning/quiz/?milestone_id=' + milestone.id + '&milestone_name=' + encodeURIComponent(milestone.milestone_name) + '&category=' + encodeURIComponent(milestone.category || ''),
          { headers: { Authorization: 'Bearer ' + token } }
        );
        if (res.ok) { const d = await res.json(); if (d.questions && d.questions.length >= 3) { setQuestions(d.questions.slice(0,5)); setLoading(false); return; } }
      } catch(e) {}
    }
    setQuestions(generateFallbackQuestions(milestone?.milestone_name, milestone?.category));
    setLoading(false);
  };

  const pick = (qi, oi) => { if (!submitted) setSelected(p => ({...p, [qi]: oi})); };
  const next = () => { if (current < questions.length-1) setCurrent(c=>c+1); };
  const back = () => { if (current > 0) setCurrent(c=>c-1); };
  const submit = () => {
    let ok=0; questions.forEach((q,i)=>{ if(selected[i]===q.answer) ok++; });
    setScore(Math.round((ok/questions.length)*100)); setSubmitted(true);
  };

  const passed = score >= PASS;
  const answered = Object.keys(selected).length;
  const q = questions[current];

  const overlay = { position:'fixed',inset:0,zIndex:1000,background:'rgba(15,20,20,0.65)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',padding:20 };
  const box = { background:'#FFFDFB',borderRadius:22,border:'1px solid rgba(46,49,53,0.10)',boxShadow:'0 32px 80px rgba(15,20,20,0.20)',width:'100%',maxWidth:560,maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column' };
  const hdr = { background:'#2E3135',padding:'20px 24px 16px',borderRadius:'22px 22px 0 0' };
  const body = { flex:1,overflowY:'auto',padding:24 };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e=>e.stopPropagation()}>
        <div style={hdr}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <span style={{background:'rgba(177,139,94,0.2)',border:'1px solid rgba(177,139,94,0.3)',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:700,color:'#D4A76A',textTransform:'uppercase',letterSpacing:'0.5px'}}>Milestone Quiz</span>
                <span style={{background:'rgba(255,255,255,0.08)',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.6)'}}>{questions.length} MCQs  {PASS}% to pass</span>
              </div>
              <h3 style={{margin:0,fontSize:16,fontWeight:800,color:'#fff',lineHeight:1.3}}>{milestone?.milestone_name}</h3>
            </div>
            <button onClick={onClose} style={{background:'rgba(255,255,255,0.08)',border:'none',color:'rgba(255,255,255,0.6)',borderRadius:8,padding:'5px 10px',cursor:'pointer',fontSize:16,flexShrink:0}}>x</button>
          </div>
          {!submitted && (
            <div style={{marginTop:12}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:5,fontWeight:600}}>
                <span>Q{current+1} of {questions.length}</span><span>{answered} answered</span>
              </div>
              <div style={{height:4,background:'rgba(255,255,255,0.1)',borderRadius:4,overflow:'hidden'}}>
                <div style={{height:'100%',width:(Math.round((answered/Math.max(questions.length,1))*100))+'%',background:'#B18B5E',borderRadius:4,transition:'width 0.3s'}}/>
              </div>
            </div>
          )}
        </div>
        <div style={body}>
          {loading ? (
            <div style={{textAlign:'center',padding:'40px 0'}}>
              <div style={{width:36,height:36,border:'3px solid #ECE5DD',borderTopColor:'#2E3135',borderRadius:'50%',animation:'mq-spin 0.8s linear infinite',margin:'0 auto 12px'}}/>
              <p style={{color:'#747474',fontSize:13,fontWeight:600}}>Generating questions...</p>
            </div>
          ) : submitted ? (
            <div style={{textAlign:'center'}}>
              <div style={{width:80,height:80,borderRadius:'50%',background:passed?'rgba(16,185,129,0.1)':'rgba(239,68,68,0.1)',border:'3px solid '+(passed?'#10B981':'#EF4444'),display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px',fontSize:32}}>{passed?'OK':'X'}</div>
              <h3 style={{margin:'0 0 8px',fontSize:20,fontWeight:800,color:'#1F2022'}}>{passed?'Milestone Unlocked!':'Not Quite There Yet'}</h3>
              <p style={{margin:'0 0 20px',color:'#747474',fontSize:13}}>{passed?'You scored '+score+'% - milestone auto-marked as complete!':'You scored '+score+'%. Need '+PASS+'% to pass. Review and retry.'}</p>
              <div style={{background:'#F4EFEA',borderRadius:12,padding:'16px 20px',marginBottom:20,textAlign:'left'}}>
                {questions.map((qs,i)=>{
                  const ok=selected[i]===qs.answer;
                  return (<div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,paddingBottom:i<questions.length-1?10:0,marginBottom:i<questions.length-1?10:0,borderBottom:i<questions.length-1?'1px solid rgba(46,49,53,0.08)':'none'}}>
                    <div style={{width:20,height:20,borderRadius:'50%',flexShrink:0,marginTop:2,background:ok?'#10B981':'#EF4444',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontWeight:800}}>{ok?'V':'X'}</div>
                    <div><p style={{margin:'0 0 3px',fontSize:12,fontWeight:700,color:'#1F2022'}}>{qs.q}</p><p style={{margin:0,fontSize:11,color:'#10B981',fontWeight:600}}>Correct: {qs.options[qs.answer]}</p></div>
                  </div>);
                })}
              </div>
              <div style={{display:'flex',gap:10}}>
                {passed ? (
                  <button onClick={onPass} style={{flex:1,background:'#2E3135',color:'#fff',border:'none',padding:13,borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer'}}>Complete Milestone</button>
                ) : (
                  <>
                    <button onClick={onClose} style={{flex:1,background:'transparent',border:'1.5px solid #ECE5DD',color:'#2E3135',padding:12,borderRadius:12,fontSize:13,fontWeight:700,cursor:'pointer'}}>Review Material</button>
                    <button onClick={load} style={{flex:1,background:'#2E3135',color:'#fff',border:'none',padding:12,borderRadius:12,fontSize:13,fontWeight:700,cursor:'pointer'}}>Retry Quiz</button>
                  </>
                )}
              </div>
            </div>
          ) : q ? (
            <div>
              <div style={{background:'#F4EFEA',borderRadius:12,padding:'16px 18px',marginBottom:20}}>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:'#1F2022',lineHeight:1.5}}>{q.q}</p>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
                {q.options.map((opt,oi)=>{
                  const isSel=selected[current]===oi;
                  return (<button key={oi} onClick={()=>pick(current,oi)} style={{textAlign:'left',padding:'13px 16px',borderRadius:12,border:'2px solid '+(isSel?'#2E3135':'#ECE5DD'),background:isSel?'#2E3135':'#fff',color:isSel?'#fff':'#1F2022',fontSize:13,fontWeight:isSel?700:500,cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:12}}>
                    <span style={{width:24,height:24,borderRadius:'50%',flexShrink:0,border:'2px solid '+(isSel?'rgba(255,255,255,0.4)':'#D4C5B5'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,background:isSel?'rgba(255,255,255,0.15)':'transparent',color:isSel?'#fff':'#747474'}}>{String.fromCharCode(65+oi)}</span>
                    {opt}
                  </button>);
                })}
              </div>
              <div style={{display:'flex',gap:10}}>
                <button onClick={back} disabled={current===0} style={{padding:'11px 18px',borderRadius:10,border:'1.5px solid #ECE5DD',background:'transparent',color:'#2E3135',fontSize:13,fontWeight:700,cursor:current===0?'not-allowed':'pointer',opacity:current===0?0.4:1}}>Back</button>
                {current < questions.length-1 ? (
                  <button onClick={next} style={{flex:1,background:'#2E3135',color:'#fff',border:'none',padding:11,borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Next</button>
                ) : (
                  <button onClick={submit} disabled={answered<questions.length} style={{flex:1,background:answered>=questions.length?'#B18B5E':'#ECE5DD',color:answered>=questions.length?'#fff':'#A3A3A3',border:'none',padding:11,borderRadius:10,fontSize:13,fontWeight:700,cursor:answered>=questions.length?'pointer':'not-allowed',transition:'all 0.2s'}}>
                    {answered>=questions.length?'Submit Answers':'Submit ('+( questions.length-answered)+' left)'}
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <style>{'@keyframes mq-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default MilestoneQuiz;
