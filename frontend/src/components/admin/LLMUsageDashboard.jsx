// LLM API usage/cost dashboard — admin-only view of how many requests each
// configured LLMProvider has served and an estimated $ cost (tokens ×
// provider's configured cost-per-million rates), sourced from LLMUsageLog
// rows written by every generation call (see services/testcase_generator.py
// _log_llm_usage). Not a real AWS/provider billing integration — providers
// here are OpenAI-compatible endpoints (NVIDIA, DeepSeek, etc.), not AWS
// Bedrock, so there's no billing API to pull from; this is a self-tracked
// estimate the admin calibrates by setting cost-per-million on each provider.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import api from '../../lib/api';

function apiErrorMessage(err, fallback) {
  return err?.response?.data?.error || err?.message || fallback;
}

function fmtCost(n) {
  return `$${Number(n || 0).toFixed(4)}`;
}
function fmtInt(n) {
  return Number(n || 0).toLocaleString();
}

function Card({ label, value, sub }) {
  return (
    <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 18, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const RANGES = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: 'All time', value: 'all' },
];

const LLMUsageDashboard = () => {
  const [range, setRange] = useState('30');

  const { data, isLoading, isRefetching, error: loadError, refetch } = useQuery({
    queryKey: ['llm-usage-summary', range],
    queryFn: async () => (await api.get(`/admin/v2/llm-usage/summary/?days=${range}`)).data,
  });
  const error = loadError ? apiErrorMessage(loadError, 'Failed to load usage summary') : '';

  if (isLoading) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-soft)' }}><Loader2 size={20} className="spin" /></div>;
  }
  if (error) {
    return <div style={{ padding: 16, background: '#fef2f2', color: '#dc2626', borderRadius: 12 }}>{error}</div>;
  }

  const totals = data?.totals || {};
  const byProvider = data?.by_provider || [];
  const byFeature = data?.by_feature || [];
  const byDay = data?.by_day || [];
  const recent = data?.recent || [];
  const maxDayCost = Math.max(1e-9, ...byDay.map((d) => d.cost));
  const successRate = totals.requests ? Math.round((totals.successes / totals.requests) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid var(--border-soft)',
              background: range === r.value ? 'var(--olive-900)' : 'white',
              color: range === r.value ? 'white' : 'var(--olive-900)',
            }}
          >
            {r.label}
          </button>
        ))}
        <button onClick={() => refetch()} disabled={isRefetching} style={{ marginLeft: 'auto', background: 'white', border: '1px solid var(--border-soft)', borderRadius: 999, padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--olive-900)', fontWeight: 700, fontSize: 12 }}>
          <RefreshCw size={13} className={isRefetching ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <Card label="Requests" value={fmtInt(totals.requests)} sub={`${successRate}% succeeded`} />
        <Card label="Estimated Cost" value={fmtCost(totals.cost)} sub={range === 'all' ? 'all time' : `last ${range} days`} />
        <Card label="Total Tokens" value={fmtInt(totals.total_tokens)} sub={`${fmtInt(totals.prompt_tokens)} in / ${fmtInt(totals.completion_tokens)} out`} />
        <Card label="Failed Requests" value={fmtInt(totals.failures)} />
      </div>

      {byDay.length > 1 && (
        <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--olive-900)', marginBottom: 12 }}>Daily estimated cost</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
            {byDay.map((d) => (
              <div key={d.day} title={`${d.day}: ${fmtCost(d.cost)} (${d.requests} req)`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ width: '100%', maxWidth: 22, borderRadius: '3px 3px 0 0', background: 'var(--olive-900)', opacity: 0.75, height: `${Math.max(3, (d.cost / maxDayCost) * 100)}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, background: 'var(--bg-2)', borderBottom: '1px solid var(--border-soft)' }}>By Provider</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bg-1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Provider</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Requests</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {byProvider.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: 'var(--text-soft)' }}>No requests in this range.</td></tr>
              ) : byProvider.map((row) => (
                <tr key={row.provider_name} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                  <td style={{ padding: '8px 16px', fontWeight: 600 }}>{row.provider_name}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtInt(row.requests)}{row.failures ? <span style={{ color: '#dc2626' }}> ({row.failures} failed)</span> : ''}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtInt(row.total_tokens)}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700 }}>{fmtCost(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, background: 'var(--bg-2)', borderBottom: '1px solid var(--border-soft)' }}>By Feature</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bg-1)' }}>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Feature</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Requests</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {byFeature.length === 0 ? (
                <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: 'var(--text-soft)' }}>No requests in this range.</td></tr>
              ) : byFeature.map((row) => (
                <tr key={row.feature} style={{ borderBottom: '1px solid var(--bg-1)' }}>
                  <td style={{ padding: '8px 16px', fontWeight: 600 }}>{row.feature}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right' }}>{fmtInt(row.requests)}</td>
                  <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 700 }}>{fmtCost(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 13, background: 'var(--bg-2)', borderBottom: '1px solid var(--border-soft)' }}>Recent Activity</div>
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bg-1)', position: 'sticky', top: 0, background: 'white' }}>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>When</th>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Provider</th>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Feature</th>
                <th style={{ textAlign: 'left', padding: '8px 16px' }}>Label</th>
                <th style={{ textAlign: 'center', padding: '8px 16px' }}>OK</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: '8px 16px' }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: 'var(--text-soft)' }}>Nothing logged in this range.</td></tr>
              ) : recent.map((row) => (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--bg-1)' }} title={row.error_message || ''}>
                  <td style={{ padding: '6px 16px', color: 'var(--text-soft)', whiteSpace: 'nowrap' }}>{new Date(row.created_at).toLocaleString()}</td>
                  <td style={{ padding: '6px 16px' }}>{row.provider_name}</td>
                  <td style={{ padding: '6px 16px' }}>{row.feature}</td>
                  <td style={{ padding: '6px 16px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</td>
                  <td style={{ padding: '6px 16px', textAlign: 'center' }}>{row.success ? '✓' : <span style={{ color: '#dc2626' }}>✕</span>}</td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}>{fmtInt(row.total_tokens)}</td>
                  <td style={{ padding: '6px 16px', textAlign: 'right' }}>{fmtCost(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default LLMUsageDashboard;
