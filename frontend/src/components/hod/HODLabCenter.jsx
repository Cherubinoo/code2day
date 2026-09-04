import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical, Plus, ChevronLeft, Users, Calendar,
  UserCheck, Pencil, Trash2, BookOpen, AlertCircle, X, Save,
} from "lucide-react";
import api from "../../lib/api";
import { LAB_LANGUAGES } from "../../lib/appData";

const LABS_QUERY_KEY = ["hod-labs"];

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

function LabDrawer({ open, onClose, onSave, deptInfo, staffList, editLab, labs = [] }) {
  const editing = !!editLab;
  const blank = {
    name: "", batch: "", section: "", start_date: "", end_date: "", staff_in_charge_id: "",
    allowed_languages: [...LAB_LANGUAGES],
    lab_type: "practical",
    enable_tab_switch_check: true,
    max_tab_switches: 3,
    enable_fullscreen_lock: true,
    enable_copy_paste_lock: true,
    pass_threshold_percent: 70,
    linked_lab_id: "",
  };
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => {
      const url = editing ? `/lab/v2/${editLab.id}/` : "/lab/v2/";
      const payload = { ...form, staff_in_charge_id: form.staff_in_charge_id || null };
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
        name: editLab.name,
        batch: editLab.batch,
        section: editLab.section || "",
        start_date: editLab.start_date ? editLab.start_date.slice(0, 16) : "",
        end_date: editLab.end_date ? editLab.end_date.slice(0, 16) : "",
        staff_in_charge_id: editLab.staff_in_charge?.id ?? "",
        allowed_languages: editLab.allowed_languages?.length ? editLab.allowed_languages : [...LAB_LANGUAGES],
        lab_type: editLab.lab_type || "practical",
        enable_tab_switch_check: editLab.enable_tab_switch_check ?? true,
        max_tab_switches: editLab.max_tab_switches ?? 3,
        enable_fullscreen_lock: editLab.enable_fullscreen_lock ?? true,
        enable_copy_paste_lock: editLab.enable_copy_paste_lock ?? true,
        pass_threshold_percent: editLab.pass_threshold_percent ?? 70,
        linked_lab_id: editLab.linked_lab_id ?? "",
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
    if (!form.name.trim()) { setErr("Lab name is required"); return; }
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
          <h2>{editing ? "Edit Lab" : "Create New Lab"}</h2>
          <button type="button" className="hlc2-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <form className="hlc2-form" onSubmit={submit}>
          <div className="hlc2-field">
            <label className="hlc2-label">Lab Type *</label>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="button"
                className={`hlc2-pill${form.lab_type !== "university" ? " active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, lab_type: "practical" }))}
              >
                💻 Curriculum / Practice Lab
              </button>
              <button
                type="button"
                className={`hlc2-pill${form.lab_type === "university" ? " active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, lab_type: "university" }))}
              >
                🏛️ University Practical Lab
              </button>
            </div>
          </div>
          {form.lab_type === "university" && (
            <div className="hlc2-field">
              <label className="hlc2-label">Connect to Practice Lab *</label>
              <select
                className="hlc2-input"
                style={{ width: "100%", padding: "10px", marginTop: 4, background: "#0f172a", border: "1px solid #1e293b", color: "#cbd5e1", borderRadius: 6 }}
                value={form.linked_lab_id || ""}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const selectedLab = labs.find(l => String(l.id) === String(selectedId));
                  setForm((f) => ({
                    ...f,
                    linked_lab_id: selectedId,
                    name: selectedLab ? `${selectedLab.name} – University Practical` : f.name,
                    batch: selectedLab ? selectedLab.batch : f.batch,
                    section: selectedLab ? selectedLab.section : f.section,
                    allowed_languages: selectedLab ? [...selectedLab.allowed_languages] : f.allowed_languages,
                    staff_in_charge_id: selectedLab && selectedLab.staff_in_charge ? selectedLab.staff_in_charge.id : f.staff_in_charge_id,
                  }));
                }}
              >
                <option value="">-- Select an existing practice lab --</option>
                {labs
                  .filter((l) => l.lab_type !== "university")
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.batch} {l.section ? `– ${l.section}` : ""})
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="hlc2-field">
            <label className="hlc2-label">Lab Name *</label>
            <input className="hlc2-input" placeholder="e.g. Arrays & Strings Lab – Sem 3"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
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
          <div className="hlc2-field">
            <label className="hlc2-label">Pass Threshold (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              className="hlc2-input"
              style={{ width: 100, marginTop: 4 }}
              value={form.pass_threshold_percent}
              onChange={(e) => setForm((f) => ({
                ...f,
                pass_threshold_percent: Math.max(1, Math.min(100, parseInt(e.target.value) || 70)),
              }))}
            />
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>
              A student's exercise submission is only accepted once at least this % of its test cases pass.
            </p>
          </div>
          {form.lab_type === "university" && (
            <div style={{ marginTop: 20, marginBottom: 20, padding: 15, background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b" }}>
              <h3 style={{ fontSize: 13, color: "#38bdf8", marginBottom: 12, fontWeight: "600" }}>🔒 Security &amp; Anti-Cheat Settings</h3>
              
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  id="enable_tab_switch_check"
                  checked={form.enable_tab_switch_check}
                  onChange={(e) => setForm((f) => ({ ...f, enable_tab_switch_check: e.target.checked }))}
                />
                <label htmlFor="enable_tab_switch_check" style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                  Enable Tab Switch Checking
                </label>
              </div>

              {form.enable_tab_switch_check && (
                <div className="hlc2-field" style={{ marginLeft: 24, marginBottom: 14 }}>
                  <label className="hlc2-label" style={{ fontSize: 12 }}>Max Tab Switches Allowed</label>
                  <input
                    type="number"
                    min="1"
                    className="hlc2-input"
                    style={{ width: 100, marginTop: 4 }}
                    value={form.max_tab_switches}
                    onChange={(e) => setForm((f) => ({ ...f, max_tab_switches: parseInt(e.target.value) || 3 }))}
                  />
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  id="enable_fullscreen_lock"
                  checked={form.enable_fullscreen_lock}
                  onChange={(e) => setForm((f) => ({ ...f, enable_fullscreen_lock: e.target.checked }))}
                />
                <label htmlFor="enable_fullscreen_lock" style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                  Enable Fullscreen Lock (Forces fullscreen mode)
                </label>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  id="enable_copy_paste_lock"
                  checked={form.enable_copy_paste_lock}
                  onChange={(e) => setForm((f) => ({ ...f, enable_copy_paste_lock: e.target.checked }))}
                />
                <label htmlFor="enable_copy_paste_lock" style={{ fontSize: 13, color: "#cbd5e1", cursor: "pointer" }}>
                  Disable Copy &amp; Paste (Anti-cheat)
                </label>
              </div>
            </div>
          )}
          {err && <p className="hlc2-error">{err}</p>}
          <div className="hlc2-form-actions">
            <button type="button" className="hlc2-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="hlc2-btn-primary" disabled={busy}>
              <Save size={15} /> {busy ? "Saving…" : editing ? "Save Changes" : "Create Lab"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function LabCard({ lab, onManage, onDelete }) {
  const expired = lab.is_expired;
  return (
    <div className={`hlc2-card${expired ? " expired" : ""}`}>
      <div className={`hlc2-card-stripe${expired ? " expired" : ""}`} />
      <div className="hlc2-card-body">
        <div className="hlc2-card-top">
          <span className="hlc2-card-name">{lab.name}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {lab.lab_type === "university" && (
              <span style={{ padding: "2px 8px", borderRadius: 6, background: "#ede9fe", color: "#6d28d9", fontSize: 10, fontWeight: 700 }}>🏛️ Univ</span>
            )}
            {lab.lab_type === "university" && !lab.is_published && (
              <span style={{ padding: "2px 8px", borderRadius: 6, background: "#fef3c7", color: "#92400e", fontSize: 10, fontWeight: 700 }}>⏳ Awaiting Staff</span>
            )}
            {lab.lab_type === "university" && lab.is_published && (
              <span style={{ padding: "2px 8px", borderRadius: 6, background: "#dcfce7", color: "#166534", fontSize: 10, fontWeight: 700 }}>✅ Published</span>
            )}
            <span className={`hlc2-status${expired ? " expired" : " active"}`}>{expired ? "Expired" : "Active"}</span>
          </div>
        </div>
        <div className="hlc2-card-chips">
          <span className="hlc2-chip"><Users size={10} /> {lab.batch}</span>
          {lab.section && <span className="hlc2-chip">§ {lab.section}</span>}
          <span className="hlc2-chip"><BookOpen size={10} /> {lab.exercise_count} exercises</span>
        </div>
        <div className="hlc2-card-chips">
          {(lab.allowed_languages || []).map((l) => (
            <span key={l} className="hlc2-chip lang">{l}</span>
          ))}
        </div>
        <div className="hlc2-card-dates">
          <Calendar size={11} />
          <span>{fmt(lab.start_date)}</span>
          <span className="hlc2-sep">→</span>
          <span>{fmt(lab.end_date)}</span>
        </div>
        <div className="hlc2-card-staff">
          <UserCheck size={12} />
          <span>{lab.staff_in_charge ? lab.staff_in_charge.name : <em>No staff assigned</em>}</span>
        </div>
        <div className="hlc2-card-foot">
          <button type="button" className="hlc2-btn-manage" onClick={() => onManage(lab)}>
            <Pencil size={12} /> Manage
          </button>
          <button type="button" className="hlc2-btn-del" onClick={() => onDelete(lab)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ManagePage({ lab: init, staffList, onBack, onLabUpdated }) {
  const [lab, setLab] = useState(init);
  const [editStaff, setEditStaff] = useState(false);
  const [newStaffId, setNewStaffId] = useState(String(init.staff_in_charge?.id ?? ""));
  const [msg, setMsg] = useState("");

  const [editSettings, setEditSettings] = useState(false);
  const [settingsLanguages, setSettingsLanguages] = useState(
    init.allowed_languages?.length ? init.allowed_languages : [...LAB_LANGUAGES]
  );
  const [settingsErr, setSettingsErr] = useState("");

  const staffMutation = useMutation({
    mutationFn: (staffId) => api.put(`/lab/v2/${lab.id}/`, { staff_in_charge_id: staffId || null }),
    onSuccess: (res) => {
      setLab(res.data); onLabUpdated(res.data); setEditStaff(false);
      setMsg("Staff updated successfully");
      setTimeout(() => setMsg(""), 3000);
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (languages) => api.put(`/lab/v2/${lab.id}/`, { allowed_languages: languages }),
    onSuccess: (res) => {
      setLab(res.data); onLabUpdated(res.data); setEditSettings(false);
      setMsg("Lab settings updated successfully");
      setTimeout(() => setMsg(""), 3000);
    },
    onError: (e) => setSettingsErr(apiErrorMessage(e, "Save failed")),
  });

  const busy = staffMutation.isPending || settingsMutation.isPending;

  function saveStaff() {
    staffMutation.mutate(newStaffId);
  }

  function saveSettings() {
    if (settingsLanguages.length === 0) {
      setSettingsErr("Select at least one language"); return;
    }
    setSettingsErr("");
    settingsMutation.mutate(settingsLanguages);
  }

  return (
    <div className="hlc2-manage">
      <button type="button" className="hlc2-back" onClick={onBack}><ChevronLeft size={15} /> All Labs</button>

      <div className="hlc2-manage-hdr">
        <div>
          <h2 className="hlc2-manage-title">{lab.name}</h2>
          <p className="hlc2-manage-meta">
            Batch {lab.batch}{lab.section ? ` · §${lab.section}` : ""}{" · "}
            {fmt(lab.start_date)} → {fmt(lab.end_date)}
          </p>
        </div>
        <span className={`hlc2-status${lab.is_expired ? " expired" : " active"}`}>
          {lab.is_expired ? "Expired" : "Active"}
        </span>
      </div>

      {lab.lab_type === "university" && (
        <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16, background: lab.is_published ? "#dcfce7" : "#fef3c7", border: `1px solid ${lab.is_published ? "#bbf7d0" : "#fde68a"}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{lab.is_published ? "✅" : "⏳"}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: lab.is_published ? "#166534" : "#92400e" }}>
              {lab.is_published ? "Published to Students" : "Awaiting Staff Setup"}
            </div>
            <div style={{ fontSize: 12, color: lab.is_published ? "#15803d" : "#a16207" }}>
              {lab.is_published
                ? "Students can access this university lab."
                : "The assigned staff needs to select questions and publish this lab."}
            </div>
          </div>
        </div>
      )}

      <div className="hlc2-manage-stats">
        <div className="hlc2-stat-box"><span className="hlc2-stat-n">{lab.exercise_count}</span><span>Exercises</span></div>
        <div className="hlc2-stat-box"><span className="hlc2-stat-n">{lab.batch}</span><span>Batch</span></div>
        <div className="hlc2-stat-box"><span className="hlc2-stat-n">{lab.section || "All"}</span><span>Section</span></div>
      </div>

      <div className="hlc2-section-card">
        <div className="hlc2-section-hdr">
          <span className="hlc2-section-ttl"><UserCheck size={14} /> Staff in Charge</span>
          {!editStaff && (
            <button type="button" className="hlc2-btn-sm"
              onClick={() => { setEditStaff(true); setNewStaffId(String(lab.staff_in_charge?.id ?? "")); }}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        {editStaff ? (
          <div className="hlc2-staff-edit">
            <PillSelect options={staffList.map((s) => ({ id: s.id, label: s.name }))}
              value={newStaffId} onChange={setNewStaffId} />
            <div className="hlc2-staff-btns">
              <button type="button" className="hlc2-btn-ghost" onClick={() => setEditStaff(false)}>Cancel</button>
              <button type="button" className="hlc2-btn-primary" onClick={saveStaff} disabled={busy}>
                <Save size={13} /> {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="hlc2-staff-row">
            {lab.staff_in_charge ? (
              <>
                <div className="hlc2-avatar">{lab.staff_in_charge.name[0]}</div>
                <div>
                  <div className="hlc2-staff-name">{lab.staff_in_charge.name}</div>
                  <div className="hlc2-staff-id">{lab.staff_in_charge.faculty_id}</div>
                </div>
              </>
            ) : (
              <span className="hlc2-no-staff">No staff assigned — click Edit to assign one</span>
            )}
          </div>
        )}
        {msg && <p className="hlc2-ok">{msg}</p>}
      </div>

      <div className="hlc2-section-card">
        <div className="hlc2-section-hdr">
          <span className="hlc2-section-ttl"><BookOpen size={14} /> Allowed Languages</span>
          {!editSettings && (
            <button type="button" className="hlc2-btn-sm"
              onClick={() => {
                setEditSettings(true);
                setSettingsErr("");
                setSettingsLanguages(lab.allowed_languages?.length ? lab.allowed_languages : [...LAB_LANGUAGES]);
              }}>
              <Pencil size={12} /> Edit
            </button>
          )}
        </div>

        {editSettings ? (
          <div className="hlc2-staff-edit">
            <LangMultiSelect options={LAB_LANGUAGES} values={settingsLanguages} onChange={setSettingsLanguages} />
            {settingsErr && <p className="hlc2-error">{settingsErr}</p>}
            <div className="hlc2-staff-btns">
              <button type="button" className="hlc2-btn-ghost" onClick={() => setEditSettings(false)}>Cancel</button>
              <button type="button" className="hlc2-btn-primary" onClick={saveSettings} disabled={busy}>
                <Save size={13} /> {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="hlc2-card-chips">
            {(lab.allowed_languages || []).map((l) => <span key={l} className="hlc2-chip lang">{l}</span>)}
          </div>
        )}
      </div>

      <div className="hlc2-info-note">
        <AlertCircle size={14} />
        <span>The assigned staff adds exercises from their Staff Lab panel.</span>
      </div>
    </div>
  );
}

export default function HODLabCenter() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editLab, setEditLab] = useState(null);
  const [manageLab, setManageLab] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const { data: labs = [], isLoading: loading } = useQuery({
    queryKey: LABS_QUERY_KEY,
    queryFn: async () => (await api.get("/lab/v2/")).data,
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

  function onSaved(lab, isEdit) {
    queryClient.setQueryData(LABS_QUERY_KEY, (prev) =>
      isEdit ? (prev || []).map((l) => (l.id === lab.id ? lab : l)) : [lab, ...(prev || [])],
    );
  }

  const deleteMutation = useMutation({
    mutationFn: (lab) => api.delete(`/lab/v2/${lab.id}/`),
    onSuccess: (_res, lab) => {
      queryClient.setQueryData(LABS_QUERY_KEY, (prev) => (prev || []).filter((l) => l.id !== lab.id));
      setDelConfirm(null);
      if (manageLab?.id === lab.id) setManageLab(null);
    },
  });

  function confirmDelete(lab) {
    deleteMutation.mutate(lab);
  }

  if (manageLab) {
    return (
      <ManagePage lab={manageLab} staffList={staffList}
        onBack={() => setManageLab(null)}
        onLabUpdated={(u) => {
          setManageLab(u);
          queryClient.setQueryData(LABS_QUERY_KEY, (prev) => (prev || []).map((l) => (l.id === u.id ? u : l)));
        }}
      />
    );
  }

  const active = labs.filter((l) => !l.is_expired);
  const expired = labs.filter((l) => l.is_expired);

  return (
    <div className="hlc2-root">
      <div className="hlc2-page-head">
        <div className="hlc2-page-title"><FlaskConical size={20} /> Lab Center</div>
        <div className="hlc2-head-right">
          <span className="hlc2-head-stat">{active.length} active · {labs.length} total</span>
          <button type="button" className="hlc2-btn-primary"
            onClick={() => { setEditLab(null); setDrawerOpen(true); }}>
            <Plus size={15} /> Create Lab
          </button>
        </div>
      </div>

      {loading ? (
        <div className="hlc2-loading">Loading…</div>
      ) : labs.length === 0 ? (
        <div className="hlc2-empty">
          <FlaskConical size={48} />
          <h3>No labs yet</h3>
          <p>Create your first practical lab to assign exercises to students.</p>
          <button type="button" className="hlc2-btn-primary" onClick={() => setDrawerOpen(true)}>
            <Plus size={15} /> Create Lab
          </button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="hlc2-section">
              <div className="hlc2-section-label">Active Labs</div>
              <div className="hlc2-grid">
                {active.map((lab) => (
                  <LabCard key={lab.id} lab={lab} onManage={setManageLab} onDelete={setDelConfirm} />
                ))}
              </div>
            </section>
          )}
          {expired.length > 0 && (
            <section className="hlc2-section">
              <div className="hlc2-section-label">Expired</div>
              <div className="hlc2-grid">
                {expired.map((lab) => (
                  <LabCard key={lab.id} lab={lab} onManage={setManageLab} onDelete={setDelConfirm} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <LabDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditLab(null); }}
        onSave={onSaved} deptInfo={deptInfo} staffList={staffList} editLab={editLab} labs={labs} />

      {delConfirm && (
        <>
          <div className="hlc2-overlay" onClick={() => setDelConfirm(null)} />
          <div className="hlc2-confirm">
            <Trash2 size={28} />
            <h3>Delete Lab?</h3>
            <p><strong>{delConfirm.name}</strong> and all exercises and submissions will be permanently deleted.</p>
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
