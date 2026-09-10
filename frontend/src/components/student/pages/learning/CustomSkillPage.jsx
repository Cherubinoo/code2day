import React, { useState } from "react";

const CustomSkillPage = ({ onBack, activeSkillTarget, setActiveSkillTarget, onCreateRoadmap }) => {
  const [skillInput, setSkillInput] = useState(activeSkillTarget || "");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const popularSkills = [
    { name: "Kubernetes", cat: "DevOps & Cloud", level: "Advanced", topics: "Pods, Deployments, Ingress, Helm Charts" },
    { name: "LangChain & LLMs", cat: "AI & Data Science", level: "Intermediate", topics: "Prompting, RAG, Vector Databases, Agents" },
    { name: "AWS Cloud Architect", cat: "DevOps & Cloud", level: "Advanced", topics: "EC2, S3, IAM, Lambda, VPC Architecture" },
    { name: "Python Core & Advanced", cat: "Programming", level: "Beginner to Advanced", topics: "OOP, Asyncio, Decorators, Multithreading" },
    { name: "System Design & LLD", cat: "Software Engineering", level: "Intermediate", topics: "Microservices, Load Balancing, Caching, DB Sharding" },
    { name: "React & Next.js", cat: "Frontend", level: "Intermediate", topics: "Hooks, SSR, State Management, Performance Optimization" },
    { name: "Docker & Containerization", cat: "DevOps & Cloud", level: "Intermediate", topics: "Dockerfile, Compose, Networking, Volumes" },
    { name: "SQL & Database Design", cat: "Databases", level: "Beginner to Intermediate", topics: "Complex Joins, Indexing, Normalization, Query Tuning" }
  ];

  const handleGenerate = (targetName) => {
    const name = targetName || skillInput;
    if (!name) return;
    if (setActiveSkillTarget) setActiveSkillTarget(name);
    if (onCreateRoadmap) onCreateRoadmap(name);
  };

  const filteredSkills = selectedCategory === "All" 
    ? popularSkills 
    : popularSkills.filter(s => s.cat === selectedCategory);

  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", background: "#F6F3EE", minHeight: "100vh", padding: "28px 36px", color: "#1F2022" }}>
      
      {/* BREADCRUMB / NAV HEADER */}
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
            <h1 style={{ margin: "0 0 2px", fontSize: 24, fontWeight: 900, color: "#1F2022" }}>Custom Skill Roadmap Builder</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#7D766C" }}>Generate a dedicated AI-curated milestone plan for any technical or soft skill.</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        
        {/* INPUT HERO CARD */}
        <div style={{ background: "#EBE5DC", border: "1px solid #DFD8CE", borderRadius: 20, padding: 32, marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#2E3135", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: "#1F2022" }}>Create Targeted Learning Path</h2>
          </div>
          <p style={{ fontSize: 13, color: "#7D766C", margin: "0 0 20px" }}>Enter any topic or technology you wish to master. Our AI engine will structure 5 milestone modules with quizzes and documentation.</p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, position: "relative", minWidth: 280 }}>
              <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "#7D766C" }}>🔍</span>
              <input
                style={{
                  width: "100%",
                  background: "#F6F3EE",
                  border: "1px solid #DFD8CE",
                  borderRadius: 12,
                  padding: "14px 18px 14px 44px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1F2022",
                  outline: "none",
                  fontFamily: "inherit"
                }}
                placeholder="e.g. Kubernetes, LangChain, System Design, React Native..."
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
              />
            </div>
            <button
              onClick={() => handleGenerate()}
              style={{
                background: "#2E3135",
                color: "#F6F3EE",
                border: "none",
                borderRadius: 12,
                padding: "14px 28px",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.2s ease"
              }}
            >
              Build Roadmap →
            </button>
          </div>
        </div>

        {/* POPULAR SUGGESTIONS GRID */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#1F2022" }}>Popular Pre-Built Roadmaps</h3>
            <div style={{ display: "flex", gap: 8 }}>
              {["All", "DevOps & Cloud", "AI & Data Science", "Programming", "Frontend"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    background: selectedCategory === cat ? "#2E3135" : "#EBE5DC",
                    color: selectedCategory === cat ? "#F6F3EE" : "#1F2022",
                    border: `1px solid ${selectedCategory === cat ? "#2E3135" : "#DFD8CE"}`,
                    borderRadius: 20,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit"
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 }}>
            {filteredSkills.map(sk => (
              <div
                key={sk.name}
                onClick={() => handleGenerate(sk.name)}
                style={{
                  background: "#EBE5DC",
                  border: "1px solid #DFD8CE",
                  borderRadius: 16,
                  padding: 20,
                  cursor: "pointer",
                  transition: "all 0.2s ease"
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, background: "#DFD8CE", color: "#4A4640" }}>{sk.cat}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#7D766C" }}>{sk.level}</span>
                </div>
                <h4 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 6px", color: "#1F2022" }}>{sk.name}</h4>
                <p style={{ fontSize: 12, color: "#7D766C", margin: "0 0 14px", lineHeight: 1.4 }}>{sk.topics}</p>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#1F2022", textAlign: "right" }}>Start Learning →</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default CustomSkillPage;
