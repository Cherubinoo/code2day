import React, { useState, useMemo, useEffect } from "react";
import { Building2, Search, ArrowLeft } from "lucide-react";
import ProblemsPage from "./ProblemsPage";
import { useDrillDownParam } from "../../../lib/useDrillDownParam";

export default function CompanyPage(props) {
  const { problemSet, setSelectedProblemSlug, selectedProblem } = props;

  // useDrillDownParam (not plain useState) so the browser Back button
  // correctly returns to the company grid instead of exiting the page.
  // defaultValue falls back to the last localStorage selection only when
  // there's no ?company= in the URL yet (e.g. very first load) — same
  // fallback behavior as before, just without a wasted pushState for it.
  const [selectedCompany, setSelectedCompany] = useDrillDownParam("company", {
    defaultValue: window.localStorage.getItem("code2day-selected-company") || null,
    parse: (v) => v || null,
  });
  
  const [searchQuery, setSearchQuery] = useState("");

  // Sync selection to localStorage
  useEffect(() => {
    if (selectedCompany) {
      window.localStorage.setItem("code2day-selected-company", selectedCompany);
    } else {
      window.localStorage.removeItem("code2day-selected-company");
    }
  }, [selectedCompany]);

  // Grid view companies list
  const companiesList = useMemo(() => {
    if (!problemSet) return [];
    const counts = {};
    problemSet.forEach(p => {
      if (p.companies) {
        const comps = p.companies.split(',').map(c => c.trim()).filter(Boolean);
        comps.forEach(c => {
          counts[c] = (counts[c] || 0) + 1;
        });
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [problemSet]);

  const filteredCompanies = companiesList.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If a problem is selected, we MUST show the workspace, even if selectedCompany was lost
  // This prevents "blank" or "grid" screens when deep-linking or refreshing.
  if (selectedProblem) {
    // We try to derive the company from the problem if selectedCompany is missing
    const activeCompany = selectedCompany || (selectedProblem.companies ? selectedProblem.companies.split(',')[0].trim() : null);
    
    // Custom grouped problems for the sidebar (Company Track)
    const companyProblems = (problemSet || []).filter(p => {
      if (!p.companies || !activeCompany) return false;
      const comps = p.companies.split(',').map(c => c.trim());
      return comps.includes(activeCompany);
    });

    const groupedProblems = [
      {
        key: 'company-track',
        label: activeCompany ? `${activeCompany} Track` : 'Company Problems',
        items: companyProblems,
      }
    ];

    return (
      <ProblemsPage 
        {...props} 
        groupedProblems={groupedProblems}
        // If we have an active company, we can provide its tag counts
        // otherwise it falls back to global (handled by ProblemsPage)
      />
    );
  }

  // If a company is selected (but no problem yet), show the company's problem list
  if (selectedCompany) {
    const companyProblems = problemSet.filter(p => {
      if (!p.companies) return false;
      const comps = p.companies.split(',').map(c => c.trim());
      const matchesCompany = comps.includes(selectedCompany);
      if (!matchesCompany) return false;

      // Difficulty filter
      const matchesDifficulty = props.selectedDifficulty === "All Levels" || p.difficulty === props.selectedDifficulty;
      // Topic (Tag) filter
      const matchesTag = props.selectedTag === "All Concepts" || (p.tags ?? []).includes(props.selectedTag);

      return matchesDifficulty && matchesTag;
    });

    const companyTagData = (() => {
      const counts = {};
      const companyBaseProblems = (problemSet || []).filter(p => {
        if (!p.companies) return false;
        const comps = p.companies.split(',').map(c => c.trim());
        return comps.includes(selectedCompany);
      });
      companyBaseProblems.forEach(p => {
        if (p.tags) {
          p.tags.forEach(tag => {
            counts[tag] = (counts[tag] || 0) + 1;
          });
        }
      });
      const tags = ["All Concepts", ...Object.keys(counts).sort()];
      counts["All Concepts"] = companyBaseProblems.length;
      return { counts, tags };
    })();

    const groupedProblems = [
      {
        key: 'company-track',
        label: `${selectedCompany} Track`,
        items: companyProblems,
      }
    ];

    return (
      <div className="company-wrapper" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg-1)" }}>
        <div style={{ padding: "16px 32px", background: "white", borderBottom: "1px solid var(--border-soft)", display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          <button 
            onClick={() => setSelectedCompany(null)}
            className="ghost-button" 
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 12 }}
          >
            <ArrowLeft size={18} /> Back to Companies
          </button>
          <div style={{ height: 24, width: 1, background: "var(--border-soft)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, background: "var(--olive-100)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--olive-900)", fontSize: "1.2rem", fontWeight: 900 }}>
              {selectedCompany.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--olive-900)" }}>{selectedCompany}</h2>
              <span style={{ fontSize: "0.8rem", color: "var(--text-soft)", fontWeight: 600 }}>{companyProblems.length} Problems</span>
            </div>
          </div>
        </div>
        
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <ProblemsPage 
            {...props} 
            groupedProblems={groupedProblems}
            tagCounts={companyTagData.counts}
            dynamicTags={companyTagData.tags}
          />
        </div>
      </div>
    );
  }

  // Default Grid View
  return (
    <div className="page-stack animate-fade-in" style={{ padding: "32px 48px", overflow: "auto", height: "100%" }}>
      <section className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40, flexWrap: "wrap", gap: 20 }}>
        <div>
          <p className="kicker">Employer Track</p>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 900, color: "var(--olive-950)", margin: 0 }}>Company Based Learning</h1>
        </div>
        <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
          <Search size={20} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "var(--text-soft)" }} />
          <input 
            placeholder="Search companies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "14px 16px 14px 48px", borderRadius: 16, border: "1px solid var(--border-soft)", background: "white", fontWeight: 600, fontSize: "0.95rem" }}
          />
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
        {filteredCompanies.map(company => (
          <button
            key={company.name}
            onClick={() => setSelectedCompany(company.name)}
            className="surface-card"
            style={{ 
              padding: 24, 
              borderRadius: 24, 
              background: "white", 
              border: "1px solid var(--border-soft)",
              display: "flex",
              alignItems: "center",
              gap: 20,
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--olive-600)", fontSize: "1.4rem", fontWeight: 900 }}>
              {company.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--olive-900)" }}>{company.name}</h3>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.85rem", color: "var(--text-soft)", fontWeight: 600 }}>{company.count} problems</p>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}
