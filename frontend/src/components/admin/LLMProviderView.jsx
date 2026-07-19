// Admin LLM Providers — manage the fallback chain used for automatic test
// case / lab report generation. Providers are tried in priority order (lowest
// first); if one errors or times out the next active one is tried.
import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Pencil, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

function apiFetch(url, method, body) {
  const token = getCsrfToken();
  const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['X-CSRFToken'] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

const BLANK_FORM = {
  name: '', base_url: '', api_key: '', model_name: '', priority: 0, is_active: true,
  use_streaming: false, temperature: 0.4, top_p: 0.95, max_tokens: 6000, timeout_seconds: 30,
  extra_body: {},
};

const LLMProviderView = ({ onBack }) => {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [snippet, setSnippet] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/admin/v2/llm-providers/', 'GET');
      if (!res.ok) throw new Error('Failed to load providers');
      const data = await res.json();
      setProviders(data.providers || []);
    } catch (err) {
      setError(err.message || 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setSnippet('');
    setParseErr('');
    setSaveErr('');
    setShowForm(true);
  }

  function openEditForm(p) {
    setEditingId(p.id);
    setForm({
      name: p.name, base_url: p.base_url, api_key: '', model_name: p.model_name,
      priority: p.priority, is_active: p.is_active, use_streaming: p.use_streaming,
      temperature: p.temperature, top_p: p.top_p, max_tokens: p.max_tokens,
      timeout_seconds: p.timeout_seconds, extra_body: p.extra_body || {},
    });
    setSnippet('');
    setParseErr('');
    setSaveErr('');
    setShowForm(true);
  }

  async function parseSnippet() {
    if (!snippet.trim()) { setParseErr('Paste a code snippet first.'); return; }
    setParsing(true); setParseErr('');
    try {
      const res = await apiFetch('/api/admin/v2/llm-providers/parse-snippet/', 'POST', { snippet });
      const data = await res.json();
      if (!res.ok) {
        setParseErr(data.error || 'Could not parse this snippet.');
        return;
      }
      setForm((f) => ({ ...f, ...data.parsed }));
    } catch {
      setParseErr('Network error.');
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!form.name.trim()) { setSaveErr('Name is required.'); return; }
    if (!editingId && !form.api_key.trim()) { setSaveErr('API key is required.'); return; }
    setSaving(true); setSaveErr('');
    try {
      const url = editingId ? `/api/admin/v2/llm-providers/${editingId}/` : '/api/admin/v2/llm-providers/';
      const res = await apiFetch(url, editingId ? 'PATCH' : 'POST', form);
      const data = await res.json();
      if (!res.ok) {
        setSaveErr(data.error || 'Save failed.');
        return;
      }
      setShowForm(false);
      load();
    } catch {
      setSaveErr('Network error.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p) {
    await apiFetch(`/api/admin/v2/llm-providers/${p.id}/`, 'PATCH', { is_active: !p.is_active });
    setProviders((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !x.is_active } : x)));
  }

  async function remove(p) {
    if (!window.confirm(`Delete provider "${p.name}"? This can't be undone.`)) return;
    const res = await apiFetch(`/api/admin/v2/llm-providers/${p.id}/`, 'DELETE');
    if (res.ok || res.status === 204) {
      setProviders((prev) => prev.filter((x) => x.id !== p.id));
    }
  }

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
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>LLM Providers</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0', fontSize: '0.95rem' }}>
            Fallback chain for automatic generation — tried in priority order, lowest first.
          </p>
        </div>
        <button onClick={load} disabled={loading} style={{ marginLeft: 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--olive-900)', fontWeight: 700 }}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
        </button>
        <button onClick={openCreateForm} className="primary-button" style={{ borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} /> Add Provider
        </button>
      </div>

      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12, marginBottom: 16 }}>{error}</div>}

      {showForm && (
        <div style={{ border: '1px solid var(--border-soft)', borderRadius: 16, padding: 24, marginBottom: 24, background: 'var(--bg-2)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 800, color: 'var(--olive-900)' }}>
            {editingId ? 'Edit Provider' : 'Add Provider'}
          </h3>

          {!editingId && (
            <div style={{ marginBottom: 20, padding: 16, background: 'white', borderRadius: 12, border: '1px dashed var(--border-soft)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700, fontSize: 13, color: 'var(--olive-900)' }}>
                <Sparkles size={14} /> Paste an OpenAI-client code snippet to auto-fill the fields below
              </div>
              <textarea
                placeholder={'from openai import OpenAI\n\nclient = OpenAI(base_url="...", api_key="...")\n...'}
                value={snippet}
                onChange={(e) => setSnippet(e.target.value)}
                rows={6}
                style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button type="button" onClick={parseSnippet} disabled={parsing} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--olive-900)', color: 'white', fontWeight: 700, fontSize: 13, cursor: parsing ? 'not-allowed' : 'pointer' }}>
                  {parsing ? <Loader2 size={13} className="spin" /> : 'Parse & Fill Fields'}
                </button>
                {parseErr && <span style={{ color: '#dc2626', fontSize: 12 }}>{parseErr}</span>}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Name *
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Priority (lower tries first)
              <input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', gridColumn: '1 / -1' }}>
              Base URL *
              <input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                placeholder="https://integrate.api.nvidia.com/v1"
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', gridColumn: '1 / -1' }}>
              API Key {editingId ? '(leave blank to keep current key)' : '*'}
              <input value={form.api_key} onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                placeholder={editingId ? 'unchanged' : 'nvapi-...'}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', gridColumn: '1 / -1' }}>
              Model *
              <input value={form.model_name} onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="deepseek-ai/deepseek-v4-pro"
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Temperature
              <input type="number" step="0.1" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Top P
              <input type="number" step="0.05" value={form.top_p} onChange={(e) => setForm((f) => ({ ...f, top_p: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Max Tokens
              <input type="number" value={form.max_tokens} onChange={(e) => setForm((f) => ({ ...f, max_tokens: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>
              Timeout (seconds)
              <input type="number" value={form.timeout_seconds} onChange={(e) => setForm((f) => ({ ...f, timeout_seconds: Number(e.target.value) }))}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)' }} />
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
              <input type="checkbox" checked={form.use_streaming} onChange={(e) => setForm((f) => ({ ...f, use_streaming: e.target.checked }))} />
              Requires streaming (stream=True / SSE)
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
              Active
            </label>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', gridColumn: '1 / -1' }}>
              Extra body (provider-specific request extras, JSON)
              <textarea
                value={JSON.stringify(form.extra_body || {}, null, 2)}
                onChange={(e) => {
                  try { setForm((f) => ({ ...f, extra_body: JSON.parse(e.target.value) })); }
                  catch { /* let them keep typing invalid JSON without crashing */ }
                }}
                rows={3}
                style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--border-soft)', fontFamily: 'monospace', fontSize: 12 }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button onClick={save} disabled={saving} className="primary-button" style={{ borderRadius: 10, padding: '10px 20px' }}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Provider'}
            </button>
            <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer' }}>
              Cancel
            </button>
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>Loading providers…</div>
      ) : providers.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}>
          No providers configured yet — add one above.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border-soft)', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)', borderBottom: '2px solid var(--border-soft)' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Priority</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Model</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 700 }}>Key</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>Streaming</th>
                <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 700 }}>Active</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                  <td style={{ padding: '12px 16px' }}>{p.priority}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12 }}>{p.model_name}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-soft)' }}>{p.api_key_masked}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>{p.use_streaming ? '✓' : ''}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(p)}
                      style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: p.is_active ? '#dcfce7' : '#fee2e2', color: p.is_active ? '#166534' : '#991b1b',
                      }}
                    >
                      {p.is_active ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => openEditForm(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: 'var(--olive-900)' }} title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(p)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6, color: '#dc2626' }} title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default LLMProviderView;
