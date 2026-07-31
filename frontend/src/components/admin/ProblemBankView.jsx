// Admin Problem Bank — view every Problem and its test case count, and
// generate test cases (via the LLM fallback chain) for any problem missing
// them, or regenerate for any problem.
import { Fragment, useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, Loader2, FlaskConical, RefreshCw, Trash2, Settings2, X } from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

function apiFetch(url, method, body) {
  const token = getCsrfToken();
  const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['X-CSRFToken'] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

// Mirrors backend/apps/learning/services/param_types.py VALID_TYPES — primitives
// + 1D/2D arrays only. Kept in sync manually since the vocabulary is small and stable.
const SCALAR_PARAM_TYPES = ['int', 'float', 'double', 'string', 'boolean'];
const VALID_PARAM_TYPES = SCALAR_PARAM_TYPES.flatMap((t) => [t, `${t}[]`, `${t}[][]`]);

function isArrayType(type) {
  return typeof type === 'string' && type.endsWith('[]');
}

function emptySchemaDraft() {
  return { params: [{ name: '', type: 'int', order: 0 }], return_type: 'int' };
}

function schemaToDraft(schema) {
  if (!schema) return emptySchemaDraft();
  const params = [...(schema.params || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((p) => ({ name: p.name, type: p.type }));
  return { params: params.length ? params : [{ name: '', type: 'int' }], return_type: schema.return_type || 'int' };
}

function draftToSchema(draft) {
  return {
    params: draft.params.map((p, i) => ({ name: p.name.trim(), type: p.type, order: i })),
    return_type: draft.return_type,
  };
}

const ProblemBankView = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [genStates, setGenStates] = useState({}); // { [problemId]: { busy, msg } }
  const [expandedId, setExpandedId] = useState(null);
  const [tcPanels, setTcPanels] = useState({}); // { [problemId]: { loading, testCases, newStdin, newOutput, newIsSample, saving, error } }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const PAGE_SIZE = 50;

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/v2/problem-bank/', 'GET');
      if (!res.ok) throw new Error('Failed to load problem bank');
      const data = await res.json();
      setProblems(data.problems || []);
    } catch (err) {
      setError(err.message || 'Failed to load problem bank');
    } finally {
      setLoading(false);
    }
  }

  const isSearching = search.trim().length > 0;

  const filtered = useMemo(() => {
    let list = problems;
    // While actively searching, ignore the "missing only" toggle — searching
    // for a specific problem should always find it regardless of its test
    // case count; the toggle only applies when browsing the full list.
    if (missingOnly && !isSearching) list = list.filter((p) => p.test_case_count === 0);
    if (isSearching) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        (p.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [problems, missingOnly, search, isSearching]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, missingOnly]);

  async function generate(problem, force) {
    setGenStates((s) => ({ ...s, [problem.id]: { busy: true, msg: '' } }));
    const body = force ? { force: true } : {};

    // Test cases and the explanation are independent LLM calls with
    // nothing to hand off between them — fire both at once instead of
    // waiting for one to finish before starting the other.
    const [tcOutcome, expOutcome] = await Promise.all([
      apiFetch(`/api/admin/v2/problem-bank/${problem.id}/generate-test-cases/`, 'POST', body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
      apiFetch(`/api/admin/v2/problem-bank/${problem.id}/generate-explanation/`, 'POST', body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
    ]);

    const messages = [];
    const update = { };
    if (tcOutcome.ok) {
      update.test_case_count = tcOutcome.data.test_case_count;
      messages.push(`Generated ${tcOutcome.data.generated_count} test case(s).`);
    } else {
      messages.push(`Test cases: ${tcOutcome.networkError ? 'network error.' : (tcOutcome.data?.error || 'failed.')}`);
    }
    if (expOutcome.ok) {
      update.explanation = expOutcome.data.explanation;
      messages.push('Explanation generated.');
    } else {
      messages.push(`Explanation: ${expOutcome.networkError ? 'network error.' : (expOutcome.data?.error || 'failed.')}`);
    }

    setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, ...update } : p)));
    setGenStates((s) => ({ ...s, [problem.id]: { busy: false, msg: messages.join(' ') } }));
  }

  // Single button: fills in whatever "necessary data" (typed schema, explanation)
  // a problem is missing via the LLM — never touches test cases, and never
  // overwrites either piece if it already exists (both are skip-if-exists).
  async function generateSchema(problem) {
    setGenStates((s) => ({ ...s, [problem.id]: { ...(s[problem.id] || {}), schemaBusy: true, schemaMsg: '' } }));
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/generate-schema/`, 'POST');
      const data = await res.json();
      if (!res.ok) {
        setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], schemaBusy: false, schemaMsg: data.error || 'Failed.' } }));
        return;
      }
      const messages = [];
      messages.push(data.schema_generated ? 'Schema generated.' : 'Schema already existed — skipped.');
      messages.push(data.explanation_generated ? 'Explanation generated.' : 'Explanation already existed — skipped.');
      if (data.errors?.param_schema) messages.push(`Schema error: ${data.errors.param_schema}`);
      if (data.errors?.explanation) messages.push(`Explanation error: ${data.errors.explanation}`);

      setProblems((prev) => prev.map((p) => (
        p.id === problem.id
          ? { ...p, has_param_schema: !!data.param_schema, explanation: data.explanation ?? p.explanation }
          : p
      )));
      // Keep the expanded schema panel (if open on this problem) in sync too.
      setTcPanels((s) => (
        s[problem.id] ? { ...s, [problem.id]: { ...s[problem.id], schema: data.param_schema ?? s[problem.id].schema } } : s
      ));
      setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], schemaBusy: false, schemaMsg: messages.join(' ') } }));
    } catch {
      setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], schemaBusy: false, schemaMsg: 'Network error.' } }));
    }
  }

  async function toggleExpand(problem) {
    if (expandedId === problem.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(problem.id);
    setTcPanels((s) => ({
      ...s,
      [problem.id]: {
        ...(s[problem.id] || {}), loading: true, error: '',
        newStdin: '', newOutput: '', newIsSample: false, newTypedInputs: {}, newTypedOutput: '',
        editingSchema: false, schemaError: '',
      },
    }));
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/test-cases/`, 'GET');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load test cases');
      setTcPanels((s) => ({
        ...s,
        [problem.id]: { ...s[problem.id], loading: false, testCases: data.test_cases, schema: data.problem.param_schema },
      }));
    } catch (err) {
      setTcPanels((s) => ({ ...s, [problem.id]: { ...s[problem.id], loading: false, error: err.message } }));
    }
  }

  function updatePanel(problemId, patch) {
    setTcPanels((s) => ({ ...s, [problemId]: { ...s[problemId], ...patch } }));
  }

  function startEditSchema(problem) {
    const panel = tcPanels[problem.id] || {};
    updatePanel(problem.id, { editingSchema: true, schemaError: '', schemaDraft: schemaToDraft(panel.schema) });
  }

  function updateSchemaDraft(problemId, patch) {
    setTcPanels((s) => ({ ...s, [problemId]: { ...s[problemId], schemaDraft: { ...s[problemId].schemaDraft, ...patch } } }));
  }

  function updateSchemaParam(problemId, idx, patch) {
    setTcPanels((s) => {
      const draft = s[problemId].schemaDraft;
      const params = draft.params.map((p, i) => (i === idx ? { ...p, ...patch } : p));
      return { ...s, [problemId]: { ...s[problemId], schemaDraft: { ...draft, params } } };
    });
  }

  function addSchemaParamRow(problemId) {
    setTcPanels((s) => {
      const draft = s[problemId].schemaDraft;
      return { ...s, [problemId]: { ...s[problemId], schemaDraft: { ...draft, params: [...draft.params, { name: '', type: 'int' }] } } };
    });
  }

  function removeSchemaParamRow(problemId, idx) {
    setTcPanels((s) => {
      const draft = s[problemId].schemaDraft;
      return { ...s, [problemId]: { ...s[problemId], schemaDraft: { ...draft, params: draft.params.filter((_, i) => i !== idx) } } };
    });
  }

  async function saveSchema(problem) {
    const panel = tcPanels[problem.id] || {};
    const draft = panel.schemaDraft;
    if (!draft.params.length || draft.params.some((p) => !p.name.trim())) {
      updatePanel(problem.id, { schemaError: 'Every parameter needs a name.' });
      return;
    }
    updatePanel(problem.id, { savingSchema: true, schemaError: '' });
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/param-schema/`, 'PUT', {
        param_schema: draftToSchema(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        updatePanel(problem.id, { savingSchema: false, schemaError: (data.details || [data.error]).join(' ') });
        return;
      }
      updatePanel(problem.id, { savingSchema: false, editingSchema: false, schema: data.param_schema });
      setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, has_param_schema: true } : p)));
    } catch {
      updatePanel(problem.id, { savingSchema: false, schemaError: 'Network error.' });
    }
  }

  async function clearSchema(problem) {
    if (!window.confirm('Clear the typed schema for this problem? It will fall back to the existing auto-detected execution.')) return;
    updatePanel(problem.id, { savingSchema: true, schemaError: '' });
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/param-schema/`, 'DELETE');
      if (!res.ok && res.status !== 204) {
        updatePanel(problem.id, { savingSchema: false, schemaError: 'Failed to clear schema.' });
        return;
      }
      updatePanel(problem.id, { savingSchema: false, editingSchema: false, schema: null });
      setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, has_param_schema: false } : p)));
    } catch {
      updatePanel(problem.id, { savingSchema: false, schemaError: 'Network error.' });
    }
  }

  async function addTestCase(problem) {
    const panel = tcPanels[problem.id] || {};
    if (!(panel.newOutput || '').trim()) {
      updatePanel(problem.id, { error: 'Expected output is required.' });
      return;
    }
    updatePanel(problem.id, { saving: true, error: '' });
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/test-cases/`, 'POST', {
        stdin: panel.newStdin || '',
        expected_output: panel.newOutput,
        is_sample: !!panel.newIsSample,
      });
      const data = await res.json();
      if (!res.ok) {
        updatePanel(problem.id, { saving: false, error: data.error || 'Failed to add test case.' });
        return;
      }
      updatePanel(problem.id, {
        saving: false, newStdin: '', newOutput: '', newIsSample: false,
        testCases: [...(panel.testCases || []), data],
      });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: (p.test_case_count || 0) + 1 } : p
      )));
    } catch {
      updatePanel(problem.id, { saving: false, error: 'Network error.' });
    }
  }

  async function addTypedTestCase(problem) {
    const panel = tcPanels[problem.id] || {};
    const schema = panel.schema;
    const inputs = panel.newTypedInputs || {};

    const inputData = {};
    for (const p of schema.params) {
      const raw = inputs[p.name] ?? '';
      if (isArrayType(p.type)) {
        try {
          inputData[p.name] = JSON.parse(raw);
        } catch {
          updatePanel(problem.id, { error: `"${p.name}" must be valid JSON, e.g. [1,2,3].` });
          return;
        }
      } else if (p.type === 'boolean') {
        inputData[p.name] = raw === true || raw === 'true';
      } else if (p.type === 'int') {
        inputData[p.name] = parseInt(raw, 10);
      } else if (p.type === 'float' || p.type === 'double') {
        inputData[p.name] = parseFloat(raw);
      } else {
        inputData[p.name] = raw;
      }
    }

    const rawOutput = panel.newTypedOutput || '';
    if (!rawOutput.trim()) {
      updatePanel(problem.id, { error: 'Expected output is required.' });
      return;
    }
    let expectedOutput = rawOutput;
    if (isArrayType(schema.return_type)) {
      try {
        expectedOutput = JSON.stringify(JSON.parse(rawOutput));
      } catch {
        updatePanel(problem.id, { error: 'Expected output must be valid JSON for an array return type, e.g. [0,1].' });
        return;
      }
    }

    updatePanel(problem.id, { saving: true, error: '' });
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/test-cases/`, 'POST', {
        input_data: inputData,
        expected_output: expectedOutput,
        is_sample: !!panel.newIsSample,
      });
      const data = await res.json();
      if (!res.ok) {
        updatePanel(problem.id, { saving: false, error: data.error || 'Failed to add test case.' });
        return;
      }
      updatePanel(problem.id, {
        saving: false, newTypedInputs: {}, newTypedOutput: '', newIsSample: false,
        testCases: [...(panel.testCases || []), data],
      });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: (p.test_case_count || 0) + 1 } : p
      )));
    } catch {
      updatePanel(problem.id, { saving: false, error: 'Network error.' });
    }
  }

  async function deleteTestCase(problem, tcId) {
    const panel = tcPanels[problem.id] || {};
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/test-cases/${tcId}/`, 'DELETE');
      if (!res.ok && res.status !== 204) {
        updatePanel(problem.id, { error: 'Failed to delete test case.' });
        return;
      }
      updatePanel(problem.id, { testCases: (panel.testCases || []).filter((tc) => tc.id !== tcId) });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: Math.max(0, (p.test_case_count || 0) - 1) } : p
      )));
    } catch {
      updatePanel(problem.id, { error: 'Network error.' });
    }
  }

  function toggleSelected(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const allSelected = pageItems.length > 0 && pageItems.every((p) => prev.has(p.id));
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach((p) => next.delete(p.id));
      } else {
        pageItems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  async function deleteProblem(problem) {
    if (!window.confirm(`Delete "${problem.title}"? This permanently removes the problem and all its test cases.`)) return;
    setDeletingId(problem.id);
    try {
      const res = await apiFetch(`/api/admin/v2/problem-bank/${problem.id}/`, 'DELETE');
      if (!res.ok && res.status !== 204) {
        setError('Failed to delete problem.');
        return;
      }
      setProblems((prev) => prev.filter((p) => p.id !== problem.id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(problem.id); return next; });
    } catch {
      setError('Network error while deleting.');
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected problem(s)? This permanently removes them and all their test cases.`)) return;
    setBulkDeleting(true);
    try {
      const res = await apiFetch('/api/admin/v2/problem-bank/bulk-delete/', 'POST', { ids: Array.from(selectedIds) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Bulk delete failed.');
        return;
      }
      setProblems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch {
      setError('Network error during bulk delete.');
    } finally {
      setBulkDeleting(false);
    }
  }

  const missingCount = problems.filter((p) => p.test_case_count === 0).length;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{ background: 'white', border: '1px solid var(--border-soft)', width: 44, height: 44, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-900)', boxShadow: 'var(--shadow-soft)' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Problem Bank</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0', fontSize: '0.95rem' }}>
            {problems.length} problems total &middot; {missingCount} missing test cases
          </p>
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={bulkDeleting}
            style={{ marginLeft: 'auto', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', cursor: bulkDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700 }}
          >
            {bulkDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            Delete Selected ({selectedIds.size})
          </button>
        )}
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: selectedIds.size > 0 ? 0 : 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by title, slug, or topic (Graph, Backtracking, …)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: 14, border: '1px solid var(--border-soft)', fontSize: '0.95rem' }}
          />
        </div>
        <button
          onClick={() => setMissingOnly((v) => !v)}
          style={{
            padding: '12px 18px', borderRadius: 14, border: missingOnly ? '2px solid #ef4444' : '1px solid var(--border-soft)',
            background: missingOnly ? '#fef2f2' : 'white', color: missingOnly ? '#dc2626' : 'var(--text-soft)',
            fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          {missingOnly ? '⚠ Missing Test Cases Only' : 'Show All Problems'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12, marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>Loading problem bank…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>
          {missingOnly ? 'No problems are missing test cases 🎉' : 'No problems match this search.'}
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border-soft)', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: 'var(--bg-2)', borderBottom: '2px solid var(--border-soft)' }}>
                  <th style={{ textAlign: 'center', padding: '12px 10px', width: 32 }}>
                    <input
                      type="checkbox"
                      checked={pageItems.length > 0 && pageItems.every((p) => selectedIds.has(p.id))}
                      onChange={toggleSelectAllOnPage}
                    />
                  </th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Title</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Topic</th>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Difficulty</th>
                  <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>Test Cases</th>
                  <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((p) => {
                  const gen = genStates[p.id] || {};
                  const expanded = expandedId === p.id;
                  const panel = tcPanels[p.id] || {};
                  return (
                    <Fragment key={p.id}>
                    <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--bg-1)' }}>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelected(p.id)} />
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-soft)', fontFamily: 'monospace' }}>{p.slug}</div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {(p.tags || []).length === 0 ? (
                          <span style={{ color: 'var(--text-soft)', fontSize: 12 }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
                            {p.tags.map((tag) => (
                              <span key={tag} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#eef2ff', color: '#4338ca', whiteSpace: 'nowrap' }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>{p.difficulty}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => toggleExpand(p)}
                          style={{
                            padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                            background: p.test_case_count === 0 ? '#fee2e2' : '#dcfce7',
                            color: p.test_case_count === 0 ? '#991b1b' : '#166534',
                          }}
                          title="View / add test cases"
                        >
                          {p.test_case_count} {expanded ? '▲' : '▼'}
                        </button>
                        <div
                          title={p.explanation || 'No explanation generated yet'}
                          style={{
                            marginTop: 6, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                            background: p.explanation ? '#dcfce7' : '#f1f5f9',
                            color: p.explanation ? '#166534' : '#94a3b8',
                            display: 'inline-block',
                          }}
                        >
                          {p.explanation ? 'Explanation ✓' : 'No explanation'}
                        </div>
                        {p.has_param_schema && (
                          <div
                            title="This problem has a typed parameter/return schema"
                            style={{
                              marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                              background: '#eef2ff', color: '#4338ca', display: 'inline-block',
                            }}
                          >
                            Typed
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => generate(p, p.test_case_count > 0)}
                          disabled={gen.busy}
                          style={{
                            padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-soft)',
                            background: 'white', color: 'var(--olive-900)', fontWeight: 700, fontSize: 12,
                            cursor: gen.busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {gen.busy ? <Loader2 size={13} className="spin" /> : <FlaskConical size={13} />}
                          {gen.busy ? 'Generating…' : p.test_case_count > 0 ? 'Regenerate' : 'Generate'}
                        </button>
                        <button
                          onClick={() => generateSchema(p)}
                          disabled={gen.schemaBusy}
                          title="Generate typed schema + explanation via LLM — skips whichever already exists, never touches test cases"
                          style={{
                            marginLeft: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-soft)',
                            background: 'white', color: 'var(--olive-900)', fontWeight: 700, fontSize: 12,
                            cursor: gen.schemaBusy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {gen.schemaBusy ? <Loader2 size={13} className="spin" /> : <Settings2 size={13} />}
                          {gen.schemaBusy ? 'Generating…' : 'Generate Schema'}
                        </button>
                        <button
                          onClick={() => deleteProblem(p)}
                          disabled={deletingId === p.id}
                          title="Delete problem"
                          style={{
                            marginLeft: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid #fecaca',
                            background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 12,
                            cursor: deletingId === p.id ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center',
                          }}
                        >
                          {deletingId === p.id ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                        </button>
                        {gen.msg && (
                          <div style={{ fontSize: 11, marginTop: 4, color: /failed|error/i.test(gen.msg) ? '#dc2626' : '#166534' }}>
                            {gen.msg}
                          </div>
                        )}
                        {gen.schemaMsg && (
                          <div style={{ fontSize: 11, marginTop: 4, color: /failed|error/i.test(gen.schemaMsg) ? '#dc2626' : '#166534' }}>
                            {gen.schemaMsg}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr style={{ borderBottom: '1px solid var(--bg-1)' }}>
                        <td colSpan={6} style={{ padding: '0 16px 20px', background: 'var(--bg-2)' }}>
                          {panel.loading ? (
                            <div style={{ padding: 16, color: 'var(--text-soft)' }}>Loading test cases…</div>
                          ) : (
                            <div style={{ padding: '12px 0' }}>
                              {panel.error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{panel.error}</div>}

                              {/* ── Parameter schema (opt-in, LeetCode-style typed execution) ── */}
                              <div style={{ background: 'white', borderRadius: 10, padding: 12, marginBottom: 16, border: '1px dashed var(--border-soft)' }}>
                                {!panel.editingSchema ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <Settings2 size={14} style={{ color: panel.schema ? '#166534' : '#94a3b8' }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: panel.schema ? '#166534' : 'var(--text-soft)' }}>
                                      {panel.schema ? `Typed schema: ${panel.schema.params.length} param(s) → ${panel.schema.return_type}` : 'No typed schema — using auto-detected execution.'}
                                    </span>
                                    <button
                                      onClick={() => startEditSchema(p)}
                                      style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      {panel.schema ? 'Edit schema' : 'Add typed schema (optional)'}
                                    </button>
                                    {panel.schema && (
                                      <button
                                        onClick={() => clearSchema(p)}
                                        disabled={panel.savingSchema}
                                        style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 700, cursor: panel.savingSchema ? 'not-allowed' : 'pointer' }}
                                      >
                                        Clear
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--olive-900)' }}>Parameters</div>
                                    {panel.schemaDraft.params.map((param, idx) => (
                                      <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                                        <input
                                          type="text"
                                          placeholder="name (e.g. nums)"
                                          value={param.name}
                                          onChange={(e) => updateSchemaParam(p.id, idx, { name: e.target.value })}
                                          style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 12 }}
                                        />
                                        <select
                                          value={param.type}
                                          onChange={(e) => updateSchemaParam(p.id, idx, { type: e.target.value })}
                                          style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 12 }}
                                        >
                                          {VALID_PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <button
                                          onClick={() => removeSchemaParamRow(p.id, idx)}
                                          disabled={panel.schemaDraft.params.length <= 1}
                                          style={{ border: 'none', background: 'none', color: '#dc2626', cursor: panel.schemaDraft.params.length <= 1 ? 'not-allowed' : 'pointer' }}
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      onClick={() => addSchemaParamRow(p.id)}
                                      style={{ fontSize: 12, border: 'none', background: 'none', color: 'var(--olive-900)', fontWeight: 700, cursor: 'pointer', padding: '4px 0', marginBottom: 10 }}
                                    >
                                      + Add parameter
                                    </button>

                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--olive-900)' }}>Return type</span>
                                      <select
                                        value={panel.schemaDraft.return_type}
                                        onChange={(e) => updateSchemaDraft(p.id, { return_type: e.target.value })}
                                        style={{ padding: 6, borderRadius: 6, border: '1px solid var(--border-soft)', fontSize: 12 }}
                                      >
                                        {VALID_PARAM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                    </div>

                                    {panel.schemaError && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{panel.schemaError}</div>}

                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button
                                        onClick={() => saveSchema(p)}
                                        disabled={panel.savingSchema}
                                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', fontWeight: 700, fontSize: 12, cursor: panel.savingSchema ? 'not-allowed' : 'pointer' }}
                                      >
                                        {panel.savingSchema ? 'Saving…' : 'Save schema'}
                                      </button>
                                      <button
                                        onClick={() => updatePanel(p.id, { editingSchema: false, schemaError: '' })}
                                        style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {(panel.testCases || []).length === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 12 }}>No test cases yet.</div>
                              ) : panel.schema ? (
                                <table style={{ width: '100%', fontSize: 12, marginBottom: 16, background: 'white', borderRadius: 10, overflow: 'hidden' }}>
                                  <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                      {panel.schema.params.map((param) => (
                                        <th key={param.name} style={{ textAlign: 'left', padding: 8 }}>{param.name}</th>
                                      ))}
                                      <th style={{ textAlign: 'left', padding: 8 }}>Return</th>
                                      <th style={{ textAlign: 'center', padding: 8 }}>Sample</th>
                                      <th style={{ padding: 8 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(panel.testCases || []).map((tc) => (
                                      <tr key={tc.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        {panel.schema.params.map((param) => (
                                          <td key={param.name} style={{ padding: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                            {JSON.stringify(tc.input_data?.[param.name])}
                                          </td>
                                        ))}
                                        <td style={{ padding: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{tc.expected_output}</td>
                                        <td style={{ padding: 8, textAlign: 'center' }}>{tc.is_sample ? '✓' : ''}</td>
                                        <td style={{ padding: 8, textAlign: 'right' }}>
                                          <button onClick={() => deleteTestCase(p, tc.id)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <table style={{ width: '100%', fontSize: 12, marginBottom: 16, background: 'white', borderRadius: 10, overflow: 'hidden' }}>
                                  <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                      <th style={{ textAlign: 'left', padding: 8 }}>Stdin</th>
                                      <th style={{ textAlign: 'left', padding: 8 }}>Expected Output</th>
                                      <th style={{ textAlign: 'center', padding: 8 }}>Sample</th>
                                      <th style={{ padding: 8 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(panel.testCases || []).map((tc) => (
                                      <tr key={tc.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{tc.stdin || '(empty)'}</td>
                                        <td style={{ padding: 8, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{tc.expected_output}</td>
                                        <td style={{ padding: 8, textAlign: 'center' }}>{tc.is_sample ? '✓' : ''}</td>
                                        <td style={{ padding: 8, textAlign: 'right' }}>
                                          <button onClick={() => deleteTestCase(p, tc.id)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>
                                            Delete
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}

                              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--olive-900)' }}>Add a test case manually</div>
                              {panel.schema ? (
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                  {panel.schema.params.map((param) => (
                                    isArrayType(param.type) ? (
                                      <textarea
                                        key={param.name}
                                        placeholder={`${param.name}: ${param.type} e.g. [1,2,3]`}
                                        value={panel.newTypedInputs?.[param.name] ?? ''}
                                        onChange={(e) => updatePanel(p.id, { newTypedInputs: { ...panel.newTypedInputs, [param.name]: e.target.value } })}
                                        rows={2}
                                        style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
                                      />
                                    ) : param.type === 'boolean' ? (
                                      <label key={param.name} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                        <input
                                          type="checkbox"
                                          checked={panel.newTypedInputs?.[param.name] === true}
                                          onChange={(e) => updatePanel(p.id, { newTypedInputs: { ...panel.newTypedInputs, [param.name]: e.target.checked } })}
                                        />
                                        {param.name}
                                      </label>
                                    ) : (
                                      <input
                                        key={param.name}
                                        type={param.type === 'int' || param.type === 'float' || param.type === 'double' ? 'number' : 'text'}
                                        placeholder={`${param.name}: ${param.type}`}
                                        value={panel.newTypedInputs?.[param.name] ?? ''}
                                        onChange={(e) => updatePanel(p.id, { newTypedInputs: { ...panel.newTypedInputs, [param.name]: e.target.value } })}
                                        style={{ width: 140, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 12 }}
                                      />
                                    )
                                  ))}
                                  {isArrayType(panel.schema.return_type) ? (
                                    <textarea
                                      placeholder={`return: ${panel.schema.return_type} e.g. [0,1]`}
                                      value={panel.newTypedOutput || ''}
                                      onChange={(e) => updatePanel(p.id, { newTypedOutput: e.target.value })}
                                      rows={2}
                                      style={{ flex: 1, minWidth: 140, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      placeholder={`return: ${panel.schema.return_type} *`}
                                      value={panel.newTypedOutput || ''}
                                      onChange={(e) => updatePanel(p.id, { newTypedOutput: e.target.value })}
                                      style={{ width: 140, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontSize: 12 }}
                                    />
                                  )}
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                                    <input type="checkbox" checked={!!panel.newIsSample} onChange={(e) => updatePanel(p.id, { newIsSample: e.target.checked })} />
                                    Sample
                                  </label>
                                  <button
                                    onClick={() => addTypedTestCase(p)}
                                    disabled={panel.saving}
                                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', fontWeight: 700, fontSize: 12, cursor: panel.saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                  >
                                    {panel.saving ? 'Adding…' : 'Add'}
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, alignItems: 'start' }}>
                                  <textarea
                                    placeholder="stdin (optional)"
                                    value={panel.newStdin || ''}
                                    onChange={(e) => updatePanel(p.id, { newStdin: e.target.value })}
                                    rows={2}
                                    style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
                                  />
                                  <textarea
                                    placeholder="expected output *"
                                    value={panel.newOutput || ''}
                                    onChange={(e) => updatePanel(p.id, { newOutput: e.target.value })}
                                    rows={2}
                                    style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
                                  />
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                                    <input type="checkbox" checked={!!panel.newIsSample} onChange={(e) => updatePanel(p.id, { newIsSample: e.target.checked })} />
                                    Sample
                                  </label>
                                  <button
                                    onClick={() => addTestCase(p)}
                                    disabled={panel.saving}
                                    style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', fontWeight: 700, fontSize: 12, cursor: panel.saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                                  >
                                    {panel.saving ? 'Adding…' : 'Add'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ padding: '8px 12px', color: 'var(--text-soft)', fontWeight: 600 }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProblemBankView;
