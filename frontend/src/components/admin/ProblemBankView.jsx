// Admin Problem Bank — view every Problem and its test case count, and
// generate test cases (via the LLM fallback chain) for any problem missing
// them, or regenerate for any problem.
import { Fragment, useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, Loader2, FlaskConical, RefreshCw, Trash2, Settings2, X, LayoutGrid, List, Sparkles, BookOpen } from 'lucide-react';
import api, { LONG_RUNNING_TIMEOUT } from '../../lib/api';

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

// Shared progress display for the auto-continuing bulk sweeps (Generate
// Judge Schemas / Validate & Enable Judge) — a fraction bar plus the
// running status message, so overall progress is visible while rounds fire.
function BulkProgressPanel({ state }) {
  if (!state.msg) return null;
  const isError = /error|failed/i.test(state.msg) && !state.busy;
  const pct = state.total > 0 ? Math.min(100, Math.round((state.done / state.total) * 100)) : null;
  return (
    <div style={{ padding: 14, background: isError ? '#fef2f2' : '#f0fdf4', borderRadius: 12, marginBottom: 16 }}>
      {pct !== null && (
        <div style={{ height: 8, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: isError ? '#dc2626' : '#22c55e', transition: 'width 0.3s ease' }} />
        </div>
      )}
      <div style={{ color: isError ? '#dc2626' : '#166534', fontSize: 13 }}>
        {state.msg}
      </div>
    </div>
  );
}

// Mirrors backend/apps/learning/services/param_types.py VALID_TYPES — primitives
// + 1D/2D arrays only. Kept in sync manually since the vocabulary is small and stable.
const SCALAR_PARAM_TYPES = ['int', 'float', 'double', 'string', 'boolean'];
const VALID_PARAM_TYPES = [
  ...SCALAR_PARAM_TYPES.flatMap((t) => [t, `${t}[]`, `${t}[][]`]),
  'GraphNode', // val + neighbors, possibly cyclic — Python execution only for now
];

function isArrayType(type) {
  return typeof type === 'string' && type.endsWith('[]');
}

// A design/class schema ({"kind":"design","class_name":...,"methods":{...}})
// has a completely different shape from the function schema this file's
// params/return_type form was built for — no .params array to read length
// on, no single .return_type. Anywhere the function-shape UI would read
// those fields must check this first instead of crashing on undefined.
function isDesignSchema(schema) {
  return !!schema && schema.kind === 'design';
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

// Per-topic "Generate Missing Metadata" — same start/stop/resume/poll shape
// as AptitudeBankView's ExplanationAuditPanel, just scoped to one topic tile
// and only fetching/polling while its tile is expanded (there can be 40+
// tiles — polling all of them at once would be wasteful).
function TopicMetadataPanel({ topic, onProgress }) {
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState('');
  const encTopic = encodeURIComponent(topic);
  const queryKey = ['problem-topic-metadata-run', topic];

  // refetchInterval polls every 3s only while a run is actually in progress
  // — same "poll while running" behavior the old manual setInterval had.
  const { data: status } = useQuery({
    queryKey,
    queryFn: async () => {
      const data = (await api.get(`/admin/v2/problem-bank/topics/${encTopic}/metadata-run/`)).data;
      onProgress?.(data);
      return data;
    },
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
  });

  const actionMutation = useMutation({
    mutationFn: (action) => api.post(`/admin/v2/problem-bank/topics/${encTopic}/metadata-run/`, { action }),
    onSuccess: () => {
      setMutationError('');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err) => setMutationError(apiErrorMessage(err, 'Action failed.')),
  });

  function doAction(action) {
    actionMutation.mutate(action);
  }
  const busy = actionMutation.isPending;
  const error = mutationError;

  if (!status) return <div style={{ fontSize: 12, color: 'var(--text-soft)' }}>Loading…</div>;

  const pct = status.total > 0 ? Math.min(100, Math.round((status.processed / status.total) * 100)) : 0;
  const isStalled = status.status === 'running' && status.stalled;
  const isRunning = status.status === 'running' && !isStalled;
  const canResume = (status.status === 'stopped' || isStalled) && status.processed > 0 && status.processed < status.total;
  const isCompleted = status.status === 'completed' || (status.status === 'idle' && status.missing_metadata === 0);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bg-1)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-soft)', marginBottom: 8 }}>
        {isRunning
          ? `Generating ${status.processed}/${status.total} — ${status.schema_generated} schema(s), ${status.explanation_generated} explanation(s), ${status.hints_generated} hint set(s)${status.failed ? `, ${status.failed} failed` : ''}${status.worker_count > 1 ? ` (across ${status.worker_count} providers)` : ''}`
          : isCompleted
          ? status.missing_metadata === 0
            ? 'Nothing missing in this topic.'
            : `Done — ${status.schema_generated} schema(s), ${status.explanation_generated} explanation(s), ${status.hints_generated} hint set(s) generated${status.failed ? ` (${status.failed} failed)` : ''}`
          : isStalled
          ? `Stalled at ${status.processed}/${status.total} — click Resume`
          : canResume
          ? `Paused at ${status.processed}/${status.total}`
          : `${status.missing_metadata} problem(s) missing schema, explanation, or hints.`}
      </div>
      {(isRunning || canResume) && (
        <div style={{ height: 6, background: 'var(--bg-2)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--olive-700)', borderRadius: 6, transition: 'width 0.4s ease' }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {isRunning ? (
          <button onClick={() => doAction('stop')} disabled={busy}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}>
            Stop
          </button>
        ) : canResume ? (
          <>
            <button onClick={() => doAction('start')} disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}>
              Resume
            </button>
            <button onClick={() => doAction('reset')} disabled={busy}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-soft)', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}>
              Start Over
            </button>
          </>
        ) : status.missing_metadata > 0 ? (
          <button onClick={() => doAction('start')} disabled={busy}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, fontSize: 12, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Starting…' : isCompleted ? 'Run Again' : 'Generate Missing Metadata'}
          </button>
        ) : null}
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 11, color: '#dc2626' }}>{error}</div>}
      {status.last_error && !error && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-soft)' }}>Last error: {status.last_error.slice(0, 160)}</div>
      )}
      {!isRunning && status.active_provider_count === 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#d97706' }}>No active LLM providers — add/activate one under LLM Providers first.</div>
      )}
    </div>
  );
}

// Per-topic migration onto the new type-driven judging framework
// (services/judging/) — schema (generated if missing) + fresh AI test
// cases + structural validation, enabling Problem.uses_generic_judge only
// once both check out. Unlike TopicMetadataPanel above, the backend here
// is a plain time-budgeted sweep (like the bulk buttons at the top of
// this page), not a background-thread run — one click processes a chunk
// and reports what's left, no polling needed.
function TopicGenericJudgePanel({ topic }) {
  const [state, setState] = useState({ busy: false, msg: '' });
  const encTopic = encodeURIComponent(topic);

  async function run(force) {
    setState({ busy: true, msg: '' });
    try {
      const data = (await api.post(
        `/admin/v2/problem-bank/topics/${encTopic}/generate-generic-judge/`,
        force ? { force: true } : {},
        { timeout: LONG_RUNNING_TIMEOUT },
      )).data;
      const enabledCount = data.processed.filter((p) => p.enabled).length;
      const errorCount = data.processed.filter((p) => p.error || p.schema_errors).length;
      let msg = `Processed ${data.processed.length}: ${enabledCount} enabled for the new judge.`;
      if (errorCount) msg += ` ${errorCount} failed — see server logs for details.`;
      msg += data.remaining_problems > 0
        ? ` ${data.remaining_problems} left in this topic — click again to continue.`
        : ' Topic fully migrated.';
      setState({ busy: false, msg });
    } catch (err) {
      setState({ busy: false, msg: apiErrorMessage(err, 'Network error.') });
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--bg-1)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--olive-900)', marginBottom: 6 }}>
        New Type-Driven Judge
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => run(false)}
          disabled={state.busy}
          title="Generate a schema (if missing) + fresh AI test cases for every problem in this topic not yet on the new judge, enabling it once both pass validation"
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--olive-700)', color: 'white', fontWeight: 700, fontSize: 12, cursor: state.busy ? 'not-allowed' : 'pointer' }}
        >
          {state.busy ? 'Migrating…' : 'Migrate This Topic'}
        </button>
        <button
          onClick={() => run(true)}
          disabled={state.busy}
          title="Also re-migrate problems already enabled in this topic — regenerates their test cases"
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--text-soft)', fontWeight: 700, fontSize: 12, cursor: state.busy ? 'not-allowed' : 'pointer' }}
        >
          Force Re-migrate
        </button>
      </div>
      {state.msg && (
        <div style={{ marginTop: 6, fontSize: 11, color: /fail|error|network/i.test(state.msg) ? '#dc2626' : 'var(--text-soft)' }}>
          {state.msg}
        </div>
      )}
    </div>
  );
}

// Splits the bank into per-tag tiles (Array, Dynamic Programming, …) plus an
// "Untagged" tile, each expandable into its own TopicMetadataPanel — lets an
// admin work through metadata generation in topic-sized chunks instead of
// one all-problems sweep.
const PROBLEM_TOPIC_TILES_QUERY_KEY = ['problem-bank-topics'];

function ProblemTopicTiles({ onViewTopic }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(null);

  const { data: topics, error: loadErrorObj } = useQuery({
    queryKey: PROBLEM_TOPIC_TILES_QUERY_KEY,
    queryFn: async () => (await api.get('/admin/v2/problem-bank/topics/')).data.topics,
  });
  const error = loadErrorObj ? apiErrorMessage(loadErrorObj, 'Failed to load topics.') : '';

  if (error) return <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12 }}>{error}</div>;
  if (!topics) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>Loading topics…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
      {topics.map((t) => {
        const isOpen = expanded === t.topic;
        return (
          <div key={t.topic} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 16, padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: 'var(--olive-900)', fontSize: 15 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>{t.total} problem{t.total === 1 ? '' : 's'}</div>
              </div>
              {t.missing_metadata > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                  {t.missing_metadata} missing
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => onViewTopic(t.topic === '__untagged__' ? '' : t.label)}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-900)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                View
              </button>
              <button onClick={() => setExpanded(isOpen ? null : t.topic)}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', background: isOpen ? 'var(--bg-2)' : 'var(--olive-700)', color: isOpen ? 'var(--olive-900)' : 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Sparkles size={13} /> {isOpen ? 'Hide' : 'Generate'}
              </button>
            </div>
            {isOpen && (
              <>
                <TopicMetadataPanel
                  topic={t.topic}
                  onProgress={(data) => {
                    queryClient.setQueryData(PROBLEM_TOPIC_TILES_QUERY_KEY, (prev) =>
                      (prev || []).map((x) => (x.topic === t.topic ? { ...x, missing_metadata: data.missing_metadata } : x)),
                    );
                  }}
                />
                <TopicGenericJudgePanel topic={t.topic} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ProblemBankView = ({ onBack }) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('topics'); // 'topics' | 'list'
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [genStates, setGenStates] = useState({}); // { [problemId]: { busy, msg } }
  const [expandedId, setExpandedId] = useState(null);
  const [tcPanels, setTcPanels] = useState({}); // { [problemId]: { loading, testCases, newStdin, newOutput, newIsSample, saving, error } }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [fillMissing, setFillMissing] = useState({ busy: false, msg: '' });
  const [genericGenBulk, setGenericGenBulk] = useState({ busy: false, msg: '', done: 0, total: 0 });
  const [genericValidateBulk, setGenericValidateBulk] = useState({ busy: false, msg: '', done: 0, total: 0 });
  const [explanationRegenBulk, setExplanationRegenBulk] = useState({ busy: false, msg: '', done: 0, total: 0 });
  const [mutationError, setMutationError] = useState('');
  const PAGE_SIZE = 50;

  const PROBLEMS_QUERY_KEY = ['problem-bank-list'];
  const {
    data: problems = [],
    isLoading: loading,
    error: loadErrorObj,
    refetch,
  } = useQuery({
    queryKey: PROBLEMS_QUERY_KEY,
    queryFn: async () => (await api.get('/admin/v2/problem-bank/')).data.problems || [],
  });
  const error = loadErrorObj ? apiErrorMessage(loadErrorObj, 'Failed to load problem bank') : mutationError;

  function setProblems(updater) {
    queryClient.setQueryData(PROBLEMS_QUERY_KEY, (prev) => updater(prev || []));
  }

  async function load() {
    return refetch();
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
      api.post(`/admin/v2/problem-bank/${problem.id}/generate-test-cases/`, body)
        .then((res) => ({ ok: true, data: res.data }))
        .catch((err) => ({ ok: false, data: err?.response?.data || null, networkError: !err?.response })),
      api.post(`/admin/v2/problem-bank/${problem.id}/generate-explanation/`, body)
        .then((res) => ({ ok: true, data: res.data }))
        .catch((err) => ({ ok: false, data: err?.response?.data || null, networkError: !err?.response })),
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
      const data = (await api.post(`/admin/v2/problem-bank/${problem.id}/generate-schema/`)).data;
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
    } catch (err) {
      setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], schemaBusy: false, schemaMsg: apiErrorMessage(err, 'Failed.') } }));
    }
  }

  // "One hit run" for the new generic (type-driven) judging framework —
  // generates Problem.generic_schema via the LLM and saves it immediately,
  // with no deep type-parsing validation (that's the separate bulk
  // "Validate & Enable Judge" pass below). Never touches
  // uses_generic_judge — only the validate pass turns that on.
  async function generateGenericSchema(problem, force) {
    setGenStates((s) => ({ ...s, [problem.id]: { ...(s[problem.id] || {}), genericBusy: true, genericMsg: '' } }));
    try {
      const body = force ? { force: true } : {};
      const data = (await api.post(`/admin/v2/problem-bank/${problem.id}/generate-generic-schema/`, body)).data;
      const msg = data.validation_errors?.length
        ? `Generated — ${data.validation_errors.length} validation issue(s), run "Validate & Enable Judge" to fix.`
        : 'Generated — looks structurally valid, run "Validate & Enable Judge" to turn it on.';
      setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, has_generic_schema: true } : p)));
      setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], genericBusy: false, genericMsg: msg } }));
    } catch (err) {
      setGenStates((s) => ({ ...s, [problem.id]: { ...s[problem.id], genericBusy: false, genericMsg: apiErrorMessage(err, 'Failed.') } }));
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
      const data = (await api.get(`/admin/v2/problem-bank/${problem.id}/test-cases/`)).data;
      setTcPanels((s) => ({
        ...s,
        [problem.id]: { ...s[problem.id], loading: false, testCases: data.test_cases, schema: data.problem.param_schema },
      }));
    } catch (err) {
      setTcPanels((s) => ({ ...s, [problem.id]: { ...s[problem.id], loading: false, error: apiErrorMessage(err, 'Failed to load test cases') } }));
    }
  }

  function updatePanel(problemId, patch) {
    setTcPanels((s) => ({ ...s, [problemId]: { ...s[problemId], ...patch } }));
  }

  function startEditSchema(problem) {
    const panel = tcPanels[problem.id] || {};
    if (isDesignSchema(panel.schema)) {
      // No dedicated class_name/methods form yet — a raw JSON textarea, still
      // validated server-side by the same param-schema endpoint, beats either
      // building a whole second form UI right now or (worse) silently running
      // this design schema through the function-shape params/return_type
      // editor and corrupting it on save.
      updatePanel(problem.id, {
        editingSchema: true, schemaError: '',
        schemaDraftIsDesign: true, schemaDraftText: JSON.stringify(panel.schema, null, 2),
      });
      return;
    }
    updatePanel(problem.id, {
      editingSchema: true, schemaError: '',
      schemaDraftIsDesign: false, schemaDraft: schemaToDraft(panel.schema),
    });
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

    let param_schema;
    if (panel.schemaDraftIsDesign) {
      try {
        param_schema = JSON.parse(panel.schemaDraftText);
      } catch {
        updatePanel(problem.id, { schemaError: 'Not valid JSON.' });
        return;
      }
    } else {
      const draft = panel.schemaDraft;
      if (!draft.params.length || draft.params.some((p) => !p.name.trim())) {
        updatePanel(problem.id, { schemaError: 'Every parameter needs a name.' });
        return;
      }
      param_schema = draftToSchema(draft);
    }

    updatePanel(problem.id, { savingSchema: true, schemaError: '' });
    try {
      const data = (await api.put(`/admin/v2/problem-bank/${problem.id}/param-schema/`, { param_schema })).data;
      updatePanel(problem.id, { savingSchema: false, editingSchema: false, schema: data.param_schema });
      setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, has_param_schema: true } : p)));
    } catch (err) {
      const details = err?.response?.data?.details;
      const msg = details ? details.join(' ') : apiErrorMessage(err, 'Network error.');
      updatePanel(problem.id, { savingSchema: false, schemaError: msg });
    }
  }

  async function clearSchema(problem) {
    if (!window.confirm('Clear the typed schema for this problem? It will fall back to the existing auto-detected execution.')) return;
    updatePanel(problem.id, { savingSchema: true, schemaError: '' });
    try {
      await api.delete(`/admin/v2/problem-bank/${problem.id}/param-schema/`);
      updatePanel(problem.id, { savingSchema: false, editingSchema: false, schema: null });
      setProblems((prev) => prev.map((p) => (p.id === problem.id ? { ...p, has_param_schema: false } : p)));
    } catch (err) {
      updatePanel(problem.id, { savingSchema: false, schemaError: apiErrorMessage(err, 'Failed to clear schema.') });
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
      const data = (await api.post(`/admin/v2/problem-bank/${problem.id}/test-cases/`, {
        stdin: panel.newStdin || '',
        expected_output: panel.newOutput,
        is_sample: !!panel.newIsSample,
      })).data;
      updatePanel(problem.id, {
        saving: false, newStdin: '', newOutput: '', newIsSample: false,
        testCases: [...(panel.testCases || []), data],
      });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: (p.test_case_count || 0) + 1 } : p
      )));
    } catch (err) {
      updatePanel(problem.id, { saving: false, error: apiErrorMessage(err, 'Failed to add test case.') });
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
      const data = (await api.post(`/admin/v2/problem-bank/${problem.id}/test-cases/`, {
        input_data: inputData,
        expected_output: expectedOutput,
        is_sample: !!panel.newIsSample,
      })).data;
      updatePanel(problem.id, {
        saving: false, newTypedInputs: {}, newTypedOutput: '', newIsSample: false,
        testCases: [...(panel.testCases || []), data],
      });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: (p.test_case_count || 0) + 1 } : p
      )));
    } catch (err) {
      updatePanel(problem.id, { saving: false, error: apiErrorMessage(err, 'Failed to add test case.') });
    }
  }

  async function deleteTestCase(problem, tcId) {
    const panel = tcPanels[problem.id] || {};
    try {
      await api.delete(`/admin/v2/problem-bank/${problem.id}/test-cases/${tcId}/`);
      updatePanel(problem.id, { testCases: (panel.testCases || []).filter((tc) => tc.id !== tcId) });
      setProblems((prev) => prev.map((p) => (
        p.id === problem.id ? { ...p, test_case_count: Math.max(0, (p.test_case_count || 0) - 1) } : p
      )));
    } catch (err) {
      updatePanel(problem.id, { error: apiErrorMessage(err, 'Failed to delete test case.') });
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
      await api.delete(`/admin/v2/problem-bank/${problem.id}/`);
      setProblems((prev) => prev.filter((p) => p.id !== problem.id));
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(problem.id); return next; });
    } catch (err) {
      setMutationError(apiErrorMessage(err, 'Failed to delete problem.'));
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected problem(s)? This permanently removes them and all their test cases.`)) return;
    setBulkDeleting(true);
    try {
      await api.post('/admin/v2/problem-bank/bulk-delete/', { ids: Array.from(selectedIds) });
      setProblems((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setMutationError(apiErrorMessage(err, 'Bulk delete failed.'));
    } finally {
      setBulkDeleting(false);
    }
  }

  // Bulk sweep: fills in whatever each problem is missing (test cases,
  // schema, explanation) via the LLM, skipping anything already present.
  // Capped server-side per click — call again to keep sweeping the rest.
  async function fillMissingData() {
    setFillMissing({ busy: true, msg: '' });
    try {
      const data = (await api.post('/admin/v2/problem-bank/fill-missing/', undefined, { timeout: LONG_RUNNING_TIMEOUT })).data;
      const tcCount = data.processed.filter((p) => p.test_cases_generated).length;
      const schemaCount = data.processed.filter((p) => p.schema_generated).length;
      const expCount = data.processed.filter((p) => p.explanation_generated).length;
      const hintsCount = data.processed.filter((p) => p.hints_generated).length;
      const errorCount = data.processed.filter((p) => p.test_cases_error || p.schema_error || p.explanation_error || p.hints_error).length;

      let msg = `Processed ${data.processed.length} problem(s): ${tcCount} test case set(s), ${schemaCount} schema(s), ${expCount} explanation(s), ${hintsCount} hint set(s) generated.`;
      if (errorCount) msg += ` ${errorCount} error(s) — see details.`;
      if (data.remaining_problems > 0) msg += ` ${data.remaining_problems} problem(s) still missing something — click again to continue.`;
      else msg += ' Nothing left missing across the whole bank!';

      setFillMissing({ busy: false, msg });
      await load(); // refresh test_case_count / has_param_schema / explanation across the list
    } catch (err) {
      setFillMissing({ busy: false, msg: apiErrorMessage(err, 'Network error.') });
    }
  }

  // Bulk "one hit run" for the new judging framework: generates
  // generic_schema for every problem still missing one, no validation.
  // Each server round-trip is time-budgeted (~90s) and reports how much of
  // the bank is left, so we keep firing rounds automatically — updating the
  // progress message after every round — until nothing remains, rather than
  // making the admin click repeatedly. MAX_ROUNDS is just a runaway guard,
  // not a target — with few providers configured each round only covers a
  // handful of problems (provider_count * 6, backend-side), so a large bank
  // genuinely needs hundreds of rounds; a low cap here just means "click
  // again to continue" fires long before the sweep is actually done.
  const MAX_ROUNDS = 2000;
  async function generateGenericSchemasBulk() {
    setGenericGenBulk({ busy: true, msg: 'Starting…', done: 0, total: 0 });
    let totalProcessed = 0, totalOk = 0, totalErr = 0;
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const data = (await api.post('/admin/v2/problem-bank/generate-generic-schemas/', undefined, { timeout: LONG_RUNNING_TIMEOUT })).data;
        totalProcessed += data.processed.length;
        totalOk += data.processed.filter((p) => p.generated).length;
        totalErr += data.processed.filter((p) => p.error).length;
        const total = totalProcessed + data.remaining_problems; // stable: everything still needing a schema
        await load(); // refresh has_generic_schema badges as each round lands

        const progress = `Tested ${totalProcessed}/${total} problem(s): ${totalOk} schema(s) generated${totalErr ? `, ${totalErr} error(s)` : ''}.`;
        if (data.processed.length === 0 || data.remaining_problems === 0) {
          const doneMsg = totalProcessed === 0 ? 'Every problem already has a schema.' : `${progress} Done — every problem now has a schema.`;
          setGenericGenBulk({ busy: false, msg: doneMsg, done: totalProcessed, total });
          return;
        }
        setGenericGenBulk({ busy: true, msg: `${progress} Continuing…`, done: totalProcessed, total });
      }
      setGenericGenBulk((s) => ({ ...s, busy: false, msg: `Stopped after ${MAX_ROUNDS} rounds (${totalProcessed} processed) — click again to continue.` }));
    } catch (err) {
      setGenericGenBulk((s) => ({ ...s, busy: false, msg: `${apiErrorMessage(err, 'Network error.')} (${totalProcessed} processed before this) — click again to continue.` }));
    }
  }

  // The "if missed or wrong" follow-up: generates a schema for anything
  // still missing one, structurally validates every existing schema
  // (regenerating once if invalid), and only flips uses_generic_judge on
  // for the ones that end up valid. Same auto-continuing-rounds progress
  // pattern as generateGenericSchemasBulk above.
  async function validateGenericSchemasBulk() {
    setGenericValidateBulk({ busy: true, msg: 'Starting…', done: 0, total: 0 });
    let totalProcessed = 0, totalEnabled = 0, totalStillBad = 0;
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const data = (await api.post('/admin/v2/problem-bank/validate-generic-schemas/', undefined, { timeout: LONG_RUNNING_TIMEOUT })).data;
        totalProcessed += data.processed.length;
        totalEnabled += data.processed.filter((p) => p.enabled).length;
        totalStillBad += data.processed.filter((p) => p.errors && !p.enabled).length;
        const total = totalProcessed + data.remaining_problems; // stable: everything still needing a pass
        await load(); // refresh "Judge: Enabled"/"Unvalidated" badges as each round lands

        const progress = `Tested ${totalProcessed}/${total} problem(s): ${totalEnabled} passed and enabled for the new judge${totalStillBad ? `, ${totalStillBad} still invalid` : ''}.`;
        if (data.processed.length === 0 || data.remaining_problems === 0) {
          const doneMsg = totalProcessed === 0 ? 'Nothing left to validate.' : `${progress} Done.`;
          setGenericValidateBulk({ busy: false, msg: doneMsg, done: totalProcessed, total });
          return;
        }
        setGenericValidateBulk({ busy: true, msg: `${progress} Continuing…`, done: totalProcessed, total });
      }
      setGenericValidateBulk((s) => ({ ...s, busy: false, msg: `Stopped after ${MAX_ROUNDS} rounds (${totalProcessed} processed) — click again to continue.` }));
    } catch (err) {
      setGenericValidateBulk((s) => ({ ...s, busy: false, msg: `${apiErrorMessage(err, 'Network error.')} (${totalProcessed} processed before this) — click again to continue.` }));
    }
  }

  // One-time bank-wide style migration: FORCE-regenerates every problem's
  // explanation with the story-driven prompt, overwriting whatever's there
  // already (unlike the skip-if-exists sweeps above) — but only once per
  // problem. The backend tracks progress via Problem.explanation_is_story
  // (a real DB flag, set only after a successful generation), so "what's
  // left" is a normal DB query, same as the other two sweeps — no
  // client-held cursor, so a page refresh or a different admin session
  // resuming this later still only touches problems not yet migrated.
  async function regenerateAllExplanationsBulk() {
    if (!window.confirm(
      'This overwrites the explanation for every problem still on the old style with a new story-based version. ' +
      'This cannot be undone. Continue?'
    )) {
      return;
    }
    setExplanationRegenBulk({ busy: true, msg: 'Starting…', done: 0, total: 0 });
    let totalProcessed = 0, totalOk = 0, totalErr = 0;
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const data = (await api.post(
          '/admin/v2/problem-bank/regenerate-all-explanations/',
          undefined,
          { timeout: LONG_RUNNING_TIMEOUT },
        )).data;
        totalProcessed += data.processed.length;
        totalOk += data.processed.filter((p) => p.generated).length;
        totalErr += data.processed.filter((p) => p.error).length;
        const total = totalProcessed + data.remaining_problems; // stable: everything still on the old style
        await load(); // refresh explanation previews as each round lands

        const progress = `Tested ${totalProcessed}/${total} problem(s): ${totalOk} story explanation(s) generated${totalErr ? `, ${totalErr} error(s)` : ''}.`;
        if (data.processed.length === 0 || data.remaining_problems === 0) {
          const doneMsg = totalProcessed === 0 ? 'Nothing left to regenerate.' : `${progress} Done — every problem now has a story explanation.`;
          setExplanationRegenBulk({ busy: false, msg: doneMsg, done: totalProcessed, total });
          return;
        }
        setExplanationRegenBulk({ busy: true, msg: `${progress} Continuing…`, done: totalProcessed, total });
      }
      setExplanationRegenBulk((s) => ({ ...s, busy: false, msg: `Stopped after ${MAX_ROUNDS} rounds (${totalProcessed} processed) — click again to continue.` }));
    } catch (err) {
      setExplanationRegenBulk((s) => ({ ...s, busy: false, msg: `${apiErrorMessage(err, 'Network error.')} (${totalProcessed} processed before this) — click again to continue.` }));
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
        <button
          onClick={() => setMode((m) => (m === 'topics' ? 'list' : 'topics'))}
          style={{ marginLeft: 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}
        >
          {mode === 'topics' ? <><List size={16} /> All Problems</> : <><LayoutGrid size={16} /> Browse by Topic</>}
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={bulkDeleting}
            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', cursor: bulkDeleting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 700 }}
          >
            {bulkDeleting ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
            Delete Selected ({selectedIds.size})
          </button>
        )}
        <button
          onClick={fillMissingData}
          disabled={fillMissing.busy}
          title="Sweep every problem in the bank and generate whatever it's missing — test cases, schema, explanation — skipping anything already present"
          style={{
            background: 'white', border: '1px solid var(--border-soft)',
            borderRadius: 12, padding: '10px 16px', cursor: fillMissing.busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700,
          }}
        >
          {fillMissing.busy ? <Loader2 size={16} className="spin" /> : <Settings2 size={16} />}
          {fillMissing.busy ? 'Filling in…' : 'Fill Missing Data'}
        </button>
        <button
          onClick={generateGenericSchemasBulk}
          disabled={genericGenBulk.busy}
          title="One-hit run: generate the new type-driven judge schema (generic_schema) via the LLM for every problem that doesn't have one yet — no validation, just generation"
          style={{
            background: 'white', border: '1px solid var(--border-soft)',
            borderRadius: 12, padding: '10px 16px', cursor: genericGenBulk.busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700,
          }}
        >
          {genericGenBulk.busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {genericGenBulk.busy ? 'Generating…' : 'Generate Judge Schemas'}
        </button>
        <button
          onClick={validateGenericSchemasBulk}
          disabled={genericValidateBulk.busy}
          title="Validate every generic_schema (every type must actually parse), regenerate anything wrong or still missing once, and enable the new judge for whatever passes"
          style={{
            background: 'white', border: '1px solid var(--border-soft)',
            borderRadius: 12, padding: '10px 16px', cursor: genericValidateBulk.busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700,
          }}
        >
          {genericValidateBulk.busy ? <Loader2 size={16} className="spin" /> : <FlaskConical size={16} />}
          {genericValidateBulk.busy ? 'Validating…' : 'Validate & Enable Judge'}
        </button>
        <button
          onClick={regenerateAllExplanationsBulk}
          disabled={explanationRegenBulk.busy}
          title="Force-regenerate EVERY problem's explanation with the new story-based prompt, overwriting whatever's there already"
          style={{
            background: 'white', border: '1px solid var(--border-soft)',
            borderRadius: 12, padding: '10px 16px', cursor: explanationRegenBulk.busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700,
          }}
        >
          {explanationRegenBulk.busy ? <Loader2 size={16} className="spin" /> : <BookOpen size={16} />}
          {explanationRegenBulk.busy ? 'Regenerating…' : 'Regenerate All Explanations (Story)'}
        </button>
        <button
          onClick={load}
          disabled={loading}
          style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {fillMissing.msg && (
        <div style={{ padding: 14, background: /error|failed/i.test(fillMissing.msg) ? '#fef2f2' : '#f0fdf4', color: /error|failed/i.test(fillMissing.msg) ? '#dc2626' : '#166534', borderRadius: 12, marginBottom: 16, fontSize: 13 }}>
          {fillMissing.msg}
        </div>
      )}
      <BulkProgressPanel state={genericGenBulk} />
      <BulkProgressPanel state={genericValidateBulk} />
      <BulkProgressPanel state={explanationRegenBulk} />

      {mode === 'topics' ? (
        <ProblemTopicTiles onViewTopic={(label) => { setSearch(label); setMissingOnly(false); setMode('list'); }} />
      ) : (
      <>
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
                        {p.uses_generic_judge ? (
                          <div
                            title="Generic judge schema generated and validated — this problem runs through the new type-driven judging framework"
                            style={{
                              marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                              background: '#dcfce7', color: '#166534', display: 'inline-block',
                            }}
                          >
                            Judge: Enabled
                          </div>
                        ) : p.has_generic_schema ? (
                          <div
                            title="Generic judge schema generated but not yet validated — run Validate & Enable Judge to turn it on"
                            style={{
                              marginTop: 4, padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                              background: '#fef9c3', color: '#854d0e', display: 'inline-block',
                            }}
                          >
                            Judge: Unvalidated
                          </div>
                        ) : null}
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
                          onClick={() => generateGenericSchema(p, p.has_generic_schema)}
                          disabled={gen.genericBusy}
                          title="One-hit run: generate the new type-driven judge schema via the LLM (no validation) — use Validate & Enable Judge afterward to turn it on"
                          style={{
                            marginLeft: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-soft)',
                            background: 'white', color: 'var(--olive-900)', fontWeight: 700, fontSize: 12,
                            cursor: gen.genericBusy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {gen.genericBusy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}
                          {gen.genericBusy ? 'Generating…' : p.has_generic_schema ? 'Regenerate Judge Schema' : 'Generate Judge Schema'}
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
                        {gen.genericMsg && (
                          <div style={{ fontSize: 11, marginTop: 4, color: /failed|error/i.test(gen.genericMsg) ? '#dc2626' : '#166534' }}>
                            {gen.genericMsg}
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
                                      {!panel.schema
                                        ? 'No typed schema — using auto-detected execution.'
                                        : isDesignSchema(panel.schema)
                                        ? `Design schema: ${panel.schema.class_name} (${Object.keys(panel.schema.methods || {}).length} method(s))`
                                        : `Typed schema: ${panel.schema.params.length} param(s) → ${panel.schema.return_type}`}
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
                                ) : panel.schemaDraftIsDesign ? (
                                  <div>
                                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--olive-900)' }}>
                                      Design schema (raw JSON) — {'{'}"kind":"design","class_name":...,"methods":{'{'}...{'}'}{'}'}
                                    </div>
                                    <textarea
                                      value={panel.schemaDraftText}
                                      onChange={(e) => updatePanel(p.id, { schemaDraftText: e.target.value })}
                                      rows={10}
                                      style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12, marginBottom: 10 }}
                                    />
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
                              ) : (panel.schema && !isDesignSchema(panel.schema)) ? (
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
                              {isDesignSchema(panel.schema) && (
                                <div style={{ fontSize: 11, color: 'var(--text-soft)', marginBottom: 8 }}>
                                  Design-schema test cases (operations/arguments sequences) aren't authorable from
                                  this form yet — use the stdin field below with a raw <code>[operations,arguments]</code> JSON
                                  array, e.g. <code>{'[["Vector2D","next","hasNext"],[[[[1,2],[3,4]]],[],[]]]'}</code>.
                                </div>
                              )}
                              {(panel.schema && !isDesignSchema(panel.schema)) ? (
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
      </>
      )}
    </div>
  );
};

export default ProblemBankView;
