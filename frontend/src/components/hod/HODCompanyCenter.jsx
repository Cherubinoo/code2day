import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2, Plus, Users, Calendar,
  UserCheck, Pencil, Trash2, BookOpen, X, Save,
} from "lucide-react";
import api from "../../lib/api";
import { LAB_LANGUAGES } from "../../lib/appData";

const COMPANIES_QUERY_KEY = ["hod-companies"];

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function PillSelect({ options, value, onChange, placeholder }) {
  return (
    <div className="hlc2-pills">
      {options.length === 0 && <span className="hlc2-pill-empty">{placeholder || "None available"}</span>}
      {options.map((o) => {
        const val = typeof o === "object" ? (o.id ?? o.value ?? o) : o;
        const lbl = typeof o === "object" ? (o.label ?? o.name ?? String(o)) : o;
        return (
          <button key={String(val)} type="button"
            className={`hlc2-pill${String(value) === String(val) ? " active" : ""}`}
            onClick={() => onChange(String(value) === String(val) ? "" : val)}>
            {lbl}
          </button>
        );
      })}
    </div>
  );
}

function LangMultiSelect({ options, values, onChange }) {
  function toggle(v) {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  }
  return (
    <div className="hlc2-pills">
      {options.map((o) => (
        <button key={o} type="button"
          className={`hlc2-pill${values.includes(o) ? " active" : ""}`}
          onClick={() => toggle(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// Creates or edits a Company together with its one practical (batch, staff,
// effective period, allowed languages) in a single form — a Company IS its
// practical, there's no separate "Lab" step to configure elsewhere.
function CompanyDrawer({ open, onClose, onSave, deptInfo, staffList, editCompany }) {
  const editing = !!editCompany;
  const blank = {
    name: "", batch: "", section: "", start_date: "", end_date: "", staff_in_charge_id: "",
    allowed_languages: [...LAB_LANGUAGES],
  };
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = editing ? `/hod/companies/${editCompany.id}/` : "/hod/companies/";
      const payload = { ...form, name: form.name.trim(), staff_in_charge_id: form.staff_in_charge_id || null };
      return editing ? api.put(url, payload) : api.post(url, payload);
    },
    onSuccess: (res) => {
      onSave(res.data, editing);
      onClose();
    },
    onError: (e) => setErr(apiErrorMessage(e, "Save failed")),
  });
  const busy = saveMutation.isPending;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editCompany.name,
        batch: editCompany.batch || "",
        section: editCompany.section || "",
        start_date: editCompany.start_date ? editCompany.start_date.slice(0, 16) : "",
        end_date: editCompany.end_date ? editCompany.end_date.slice(0, 16) : "",
        staff_in_charge_id: editCompany.staff_in_charge?.id ?? "",
        allowed_languages: editCompany.allowed_languages?.length ? editCompany.allowed_languages : [...LAB_LANGUAGES],
      });
    } else {
      setForm(blank);
    }
    setErr("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sections = form.batch ? (deptInfo.sections_by_batch?.[form.batch] ?? []) : [];

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Company name is required"); return; }
    if (!form.batch) { setErr("Select a batch"); return; }
    if (!form.start_date || !form.end_date) { setErr("Both start and end dates are required"); return; }
    if (new Date(form.start_date) >= new Date(form.end_date)) { setErr("End date must be after start date"); return; }
    if (form.allowed_languages.length === 0) { setErr("Select at least one allowed language"); return; }
    setErr("");
    saveMutation.mutate();
  }

  if (!open) return null;
  return (
    <>
      <div className="hlc2-overlay" onClick={onClose} />
      <div className="hlc2-drawer">
        <div className="hlc2-drawer-head">
          <h2>{editing ? "Edit Company" : "Add Company"}</h2>
          <button type="button" className="hlc2-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="hlc2-form" onSubmit={submit}>
          <div className="hlc2-field">
            <label className="hlc2-label">Company Name *</label>
            <input className="hlc2-input" placeholder="e.g. Google"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="hlc2-field">
            <label className="hlc2-label">Batch *</label>
            <PillSelect options={deptInfo.batches ?? []} value={form.batch}
              onChange={(v) => setForm((f) => ({ ...f, batch: v, section: "" }))}
              placeholder="Loading batches…" />
          </div>
          <div className="hlc2-field">
            <label className="hlc2-label">Section <span className="hlc2-optional">(optional — leave blank for all)</span></label>
            <PillSelect options={sections} value={form.section}
              onChange={(v) => setForm((f) => ({ ...f, section: v }))}
              placeholder={form.batch ? "All sections (no filter)" : "Select a batch first"} />
          </div>
          <div className="hlc2-field">
            <label className="hlc2-label">Effective Period *</label>
            <div className="hlc2-date-row">
              <div className="hlc2-date-col">
                <span className="hlc2-date-sub">Start</span>
                <input type="datetime-local" className="hlc2-input" value={form.start_date}
                  onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <span className="hlc2-date-arrow">→</span>
              <div className="hlc2-date-col">
                <span className="hlc2-date-sub">End</span>
                <input type="datetime-local" className="hlc2-input" value={form.end_date}
                  onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
          </div>
          <div className="hlc2-field">
            <label className="hlc2-label">Staff in Charge</label>
            <PillSelect options={staffList.map((s) => ({ id: s.id, label: s.name }))}
              value={form.staff_in_charge_id}
              onChange={(v) => setForm((f) => ({ ...f, staff_in_charge_id: v }))}
              placeholder="Loading staff…" />
          </div>
          <div className="hlc2-field">
            <label className="hlc2-label">Allowed Languages *</label>
            <LangMultiSelect options={LAB_LANGUAGES} values={form.allowed_languages}
              onChange={(v) => setForm((f) => ({ ...f, allowed_languages: v }))} />
          </div>
          {err && <p className="hlc2-error">{err}</p>}
          <div className="hlc2-form-actions">
            <button type="button" className="hlc2-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="hlc2-btn-primary" disabled={busy}>
              <Save size={15} /> {busy ? "Saving…" : editing ? "Save Changes" : "Add Company"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function CompanyCard({ company, onEdit, onDelete }) {
  const expired = company.is_expired;
  return (
    <div className={`hlc2-card${expired ? " expired" : ""}`}>
      <div className={`hlc2-card-stripe${expired ? " expired" : ""}`} />
      <div className="hlc2-card-body">
        <div className="hlc2-card-top">
          <span className="hlc2-card-name">{company.name}</span>
          <span className={`hlc2-status${expired ? " expired" : " active"}`}>{expired ? "Expired" : "Active"}</span>
        </div>
        <div className="hlc2-card-chips">
          <span className="hlc2-chip"><Users size={10} /> {company.batch || "No batch"}</span>
          {company.section && <span className="hlc2-chip">§ {company.section}</span>}
          <span className="hlc2-chip"><BookOpen size={10} /> {company.exercise_count} exercises</span>
        </div>
        <div className="hlc2-card-chips">
          {(company.allowed_languages || []).map((l) => (
            <span key={l} className="hlc2-chip lang">{l}</span>
          ))}
        </div>
        <div className="hlc2-card-dates">
          <Calendar size={11} />
          <span>{fmt(company.start_date)}</span>
          <span className="hlc2-sep">→</span>
          <span>{fmt(company.end_date)}</span>
        </div>
        <div className="hlc2-card-staff">
          <UserCheck size={12} />
          <span>{company.staff_in_charge ? company.staff_in_charge.name : <em>No staff assigned</em>}</span>
        </div>
        <div className="hlc2-card-foot">
          <button type="button" className="hlc2-btn-manage" onClick={() => onEdit(company)}>
            <Pencil size={12} /> Edit
          </button>
          <button type="button" className="hlc2-btn-del" onClick={() => onDelete(company)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HODCompanyCenter() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editCompany, setEditCompany] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
    queryKey: COMPANIES_QUERY_KEY,
    queryFn: async () => (await api.get("/hod/companies/")).data,
  });
  const { data: deptInfoRaw } = useQuery({
    queryKey: ["hod-dept-info"],
    queryFn: async () => (await api.get("/lab/assignments/hod/dept-info/")).data,
  });
  const deptInfo = {
    batches: deptInfoRaw?.batches || [],
    sections: deptInfoRaw?.sections || [],
    sections_by_batch: deptInfoRaw?.sections_by_batch || {},
  };
  const { data: staffList = [] } = useQuery({
    queryKey: ["hod-lab-staff"],
    queryFn: async () => (await api.get("/lab/assignments/hod/staff/")).data,
  });
  const loading = companiesLoading;

  // Query-cache patch instead of a full refetch — the mutation already
  // returns the saved/created row, no need to re-fetch the whole list.
  function onSaved(company, isEdit) {
    queryClient.setQueryData(COMPANIES_QUERY_KEY, (prev) =>
      isEdit ? (prev || []).map((c) => (c.id === company.id ? company : c)) : [company, ...(prev || [])],
    );
  }

  const deleteMutation = useMutation({
    mutationFn: (company) => api.delete(`/hod/companies/${company.id}/`),
    onSuccess: (_res, company) => {
      queryClient.setQueryData(COMPANIES_QUERY_KEY, (prev) => (prev || []).filter((c) => c.id !== company.id));
      setDelConfirm(null);
    },
  });

  function confirmDelete(company) {
    deleteMutation.mutate(company);
  }

  const active = companies.filter((c) => !c.is_expired);
  const expired = companies.filter((c) => c.is_expired);

  return (
    <div className="hlc2-root">
      <div className="hlc2-page-head">
        <div className="hlc2-page-title"><Building2 size={20} /> Companies</div>
        <div className="hlc2-head-right">
          <span className="hlc2-head-stat">{active.length} active · {companies.length} total</span>
          <button type="button" className="hlc2-btn-primary"
            onClick={() => { setEditCompany(null); setDrawerOpen(true); }}>
            <Plus size={15} /> Add Company
          </button>
        </div>
      </div>

      {loading ? (
        <div className="hlc2-loading">Loading…</div>
      ) : companies.length === 0 ? (
        <div className="hlc2-empty">
          <Building2 size={48} />
          <h3>No companies yet</h3>
          <p>Add a company to set up its Company Based Lab Practical — staff, batch, and language all in one step.</p>
          <button type="button" className="hlc2-btn-primary" onClick={() => setDrawerOpen(true)}>
            <Plus size={15} /> Add Company
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="hlc2-section">
              <div className="hlc2-section-label">Active</div>
              <div className="hlc2-grid">
                {active.map((c) => (
                  <CompanyCard key={c.id} company={c}
                    onEdit={(comp) => { setEditCompany(comp); setDrawerOpen(true); }}
                    onDelete={setDelConfirm} />
                ))}
              </div>
            </section>
          )}
          {expired.length > 0 && (
            <section className="hlc2-section">
              <div className="hlc2-section-label">Expired</div>
              <div className="hlc2-grid">
                {expired.map((c) => (
                  <CompanyCard key={c.id} company={c}
                    onEdit={(comp) => { setEditCompany(comp); setDrawerOpen(true); }}
                    onDelete={setDelConfirm} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <CompanyDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditCompany(null); }}
        onSave={onSaved} deptInfo={deptInfo} staffList={staffList} editCompany={editCompany} />

      {delConfirm && (
        <>
          <div className="hlc2-overlay" onClick={() => setDelConfirm(null)} />
          <div className="hlc2-confirm">
            <Trash2 size={28} />
            <h3>Delete Company?</h3>
            <p><strong>{delConfirm.name}</strong> and all its exercises and student submissions will be permanently deleted.</p>
            <div className="hlc2-confirm-btns">
              <button type="button" className="hlc2-btn-ghost" onClick={() => setDelConfirm(null)}>Cancel</button>
              <button type="button" className="hlc2-btn-danger" onClick={() => confirmDelete(delConfirm)}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
