import React, { useState } from "react";

const COMPANY_DATA = [
  {
    id: "zoho",
    name: "Zoho",
    logoText: "zoho",
    logoBg: "#E42527",
    color: "#E42527",
    ctc: "3.5 - 6 LPA",
    roles: ["Software Engineer", "Technical Support"],
    rounds: ["Written Test", "Technical Interview", "HR Interview"],
    skills: ["Data Structures", "Algorithms", "OOP Concepts", "SQL", "Aptitude", "C / C++ / Java", "Problem Solving"],
    description: "Zoho focuses heavily on programming fundamentals. Written test is highly analytical.",
  },
  {
    id: "tcs",
    name: "TCS",
    logoText: "tcs",
    logoBg: "#00569B",
    color: "#00569B",
    ctc: "3.36 - 7 LPA",
    roles: ["Systems Engineer", "Smart Hire"],
    rounds: ["TCS NQT", "Technical + Managerial", "HR Round"],
    skills: ["Aptitude", "Reasoning", "English", "Coding (2 problems)", "Computer Fundamentals", "DBMS", "OS"],
    description: "TCS NQT tests aptitude, reasoning, verbal, and basic coding across multiple modules.",
  },
  {
    id: "infosys",
    name: "Infosys",
    logoText: "Infosys",
    logoBg: "#007CC3",
    color: "#007CC3",
    ctc: "3.6 - 8 LPA",
    roles: ["Systems Engineer", "Digital Specialist Engineer"],
    rounds: ["Online Test", "Technical Interview", "HR Interview"],
    skills: ["Aptitude", "Logical Reasoning", "Verbal Ability", "Pseudocode", "Programming Puzzles", "Java / Python"],
    description: "Infosys InfyTQ platform prep is recommended. Focus on pseudocode and reasoning.",
  },
  {
    id: "wipro",
    name: "Wipro",
    logoText: "wipro",
    logoBg: "#7B1FA2",
    color: "#7B1FA2",
    ctc: "3.5 - 6.5 LPA",
    roles: ["Project Engineer", "Tech Associate"],
    rounds: ["AMCAT Test", "Technical Round", "HR Round"],
    skills: ["Aptitude", "Verbal", "Coding (Python/Java/C++)", "Essay Writing", "Technical MCQs"],
    description: "Wipro uses AMCAT for screening. Essay writing is a unique component to prepare for.",
  },
  {
    id: "hcl",
    name: "HCL",
    logoText: "HCL",
    logoBg: "#0277BD",
    color: "#0277BD",
    ctc: "3 - 5.5 LPA",
    roles: ["Software Engineer", "Technology Analyst"],
    rounds: ["Aptitude Test", "Group Discussion", "Technical Interview", "HR"],
    skills: ["Aptitude", "Reasoning", "English", "Technical Fundamentals", "Group Discussion Skills"],
    description: "HCL has a group discussion round. Practice collaborative communication skills.",
  },
  {
    id: "accenture",
    name: "Accenture",
    logoText: "accenture",
    logoBg: "#A71D6A",
    color: "#A71D6A",
    ctc: "4 - 8 LPA",
    roles: ["ASE", "Packaged App Developer"],
    rounds: ["Cognitive & Technical Test", "Coding Test", "HR Interview"],
    skills: ["Cognitive Ability", "Technical Assessment", "Communication", "Python / Java", "Critical Thinking"],
    description: "Accenture values communication and cognitive skills alongside technical basics.",
  },
  {
    id: "amazon",
    name: "Amazon",
    logoText: "amazon",
    logoBg: "#FF9900",
    color: "#FF9900",
    ctc: "12 - 25 LPA",
    roles: ["SDE-1", "SDE-2"],
    rounds: ["Online Assessment", "Technical Interviews (x3)", "Bar Raiser", "Hiring Manager"],
    skills: ["Data Structures", "Algorithms", "System Design", "LLD", "Leadership Principles", "LeetCode Medium/Hard"],
    description: "Amazon interviews are intense. Master LP stories, DSA, and system design deeply.",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    logoText: "Microsoft",
    logoBg: "#00A4EF",
    color: "#00A4EF",
    ctc: "15 - 35 LPA",
    roles: ["SDE", "SDET"],
    rounds: ["Online Assessment", "Technical Interviews (x4)", "As-Appropriate Round"],
    skills: ["DSA", "System Design", "OOP", "Problem Solving", "Coding Fluency", "Communication"],
    description: "Microsoft looks for problem-solving depth, clear thinking, and collaborative mindset.",
  },
];

const CompanyTracker = ({ onBack }) => {
  const [selected, setSelected] = useState(null);
  const [checkedSkills, setCheckedSkills] = useState({});

  const toggleSkill = (companyId, skill) => {
    const key = `${companyId}_${skill}`;
    setCheckedSkills(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getReadiness = (company) => {
    const total = company.skills.length;
    if (!total) return 0;
    const done = company.skills.filter(s => checkedSkills[`${company.id}_${s}`]).length;
    return Math.round((done / total) * 100);
  };

  const selectedCompany = COMPANY_DATA.find(c => c.id === selected);

  if (selectedCompany) {
    const readiness = getReadiness(selectedCompany);
    return (
      <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", background: "#F6F3EE", minHeight: "100vh", padding: "28px 36px", color: "#1F2022" }}>
        
        {/* TOP BREADCRUMB NAV */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setSelected(null)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#EBE5DC",
              border: "1px solid #DFD8CE",
              borderRadius: "10px",
              padding: "8px 16px",
              color: "#1F2022",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease"
            }}
          >
            ← Back to Companies
          </button>
          <span style={{ color: "#7D766C", fontSize: 13 }}>/</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: "#1F2022" }}>{selectedCompany.name} Preparation</span>
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* HERO CARD */}
          <div style={{ background: "#2E3135", borderRadius: 20, padding: "32px", marginBottom: 24, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", color: "#F6F3EE" }}>
            <div style={{ background: "#FFF", borderRadius: 16, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 100, height: 60, flexShrink: 0 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: selectedCompany.logoBg }}>{selectedCompany.logoText}</span>
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, color: "#FFF" }}>{selectedCompany.name} Target Prep</h1>
              <p style={{ margin: "0 0 12px", color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.5 }}>{selectedCompany.description}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {selectedCompany.roles.map(r => (
                  <span key={r} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: "#FFF" }}>{r}</span>
                ))}
                <span style={{ background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 12px", fontSize: 11, fontWeight: 800, color: "#FFF" }}>CTC: {selectedCompany.ctc}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* READINESS */}
            <div style={{ background: "#EBE5DC", border: "1px solid #DFD8CE", borderRadius: 18, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#1F2022" }}>Your Readiness Level</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <svg width={84} height={84} style={{ transform: "rotate(-90deg)" }}>
                    <circle cx={42} cy={42} r={34} fill="none" stroke="#DFD8CE" strokeWidth={7}/>
                    <circle cx={42} cy={42} r={34} fill="none" stroke={readiness >= 70 ? "#10B981" : readiness >= 40 ? "#2E3135" : "#EF4444"} strokeWidth={7}
                      strokeDasharray={2 * Math.PI * 34}
                      strokeDashoffset={2 * Math.PI * 34 * (1 - readiness / 100)}
                      strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyCenter: "center", fontSize: 18, fontWeight: 900, color: "#1F2022", paddingLeft: 22, paddingTop: 30 }}>{readiness}%</div>
                </div>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 800, color: "#1F2022" }}>{readiness >= 70 ? "Ready for Placement!" : readiness >= 40 ? "Steady Progress" : "Action Required"}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#7D766C", fontWeight: 600 }}>{selectedCompany.skills.filter(s => checkedSkills[`${selectedCompany.id}_${s}`]).length} of {selectedCompany.skills.length} core topics completed</p>
                </div>
              </div>
            </div>

            {/* INTERVIEW ROUNDS */}
            <div style={{ background: "#EBE5DC", border: "1px solid #DFD8CE", borderRadius: 18, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#1F2022" }}>Interview Rounds</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedCompany.rounds.map((round, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#F6F3EE", border: "1px solid #DFD8CE", padding: "10px 14px", borderRadius: 10 }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2E3135", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2022" }}>{round}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SKILLS CHECKLIST */}
            <div style={{ background: "#EBE5DC", border: "1px solid #DFD8CE", borderRadius: 18, padding: 24, gridColumn: "1/-1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#1F2022" }}>Target Requirements Checklist</h3>
                <span style={{ background: "#DFD8CE", color: "#1F2022", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  {selectedCompany.skills.filter(s => checkedSkills[`${selectedCompany.id}_${s}`]).length}/{selectedCompany.skills.length} Prepared
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {selectedCompany.skills.map(skill => {
                  const key = `${selectedCompany.id}_${skill}`;
                  const checked = !!checkedSkills[key];
                  return (
                    <div
                      key={skill}
                      onClick={() => toggleSkill(selectedCompany.id, skill)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderRadius: 12,
                        background: checked ? "#DFD8CE" : "#F6F3EE",
                        border: `1px solid ${checked ? "#2E3135" : "#DFD8CE"}`,
                        cursor: "pointer",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: checked ? "#2E3135" : "transparent", border: `2px solid ${checked ? "#2E3135" : "#7D766C"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#FFF", fontSize: 11, fontWeight: 800 }}>{checked ? "✓" : ""}</div>
                      <span style={{ fontSize: 13, fontWeight: checked ? 800 : 600, color: "#1F2022" }}>{skill}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", background: "#F6F3EE", minHeight: "100vh", padding: "28px 36px", color: "#1F2022" }}>
      
      {/* HEADER BREADCRUMB BAR */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={onBack}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#EBE5DC",
              border: "1px solid #DFD8CE",
              borderRadius: "10px",
              padding: "8px 16px",
              color: "#1F2022",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.2s ease"
            }}
          >
            ← Back to Smart Roadmap
          </button>
          <div style={{ width: 1, height: 24, background: "#DFD8CE" }} />
          <div>
            <h1 style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: "#1F2022" }}>Company-Based Career Tracker</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#7D766C" }}>Select a target company to inspect skill gaps and tailored preparation paths.</p>
          </div>
        </div>
      </div>

      {/* CARDS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
        {COMPANY_DATA.map(company => {
          const readiness = getReadiness(company);
          return (
            <div
              key={company.id}
              onClick={() => setSelected(company.id)}
              style={{
                background: "#EBE5DC",
                borderRadius: 18,
                border: "1px solid #DFD8CE",
                padding: "24px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                position: "relative",
                overflow: "hidden"
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "#2E3135";
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#DFD8CE";
                e.currentTarget.style.transform = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                <div style={{ background: "#FFF", borderRadius: 12, padding: "8px 14px", border: "1px solid #DFD8CE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: company.logoBg }}>{company.logoText}</span>
                </div>
                <div>
                  <h3 style={{ margin: "0 0 2px", fontSize: 17, fontWeight: 800, color: "#1F2022" }}>{company.name}</h3>
                  <p style={{ margin: 0, fontSize: 12, color: "#7D766C", fontWeight: 600 }}>{company.ctc}</p>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right" }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#1F2022" }}>{readiness}%</span>
                  <div style={{ fontSize: 10, color: "#7D766C", fontWeight: 700 }}>ready</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {company.roles.map(r => (
                  <span key={r} style={{ background: "#F6F3EE", border: "1px solid #DFD8CE", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "#4A4640" }}>{r}</span>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid #DFD8CE" }}>
                <span style={{ fontSize: 12, color: "#7D766C", fontWeight: 600 }}>{company.skills.length} skills required</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#1F2022" }}>View Details →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CompanyTracker;
