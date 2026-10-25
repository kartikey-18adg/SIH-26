'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { AuditEvent, AuditFilters, AuditEventResponse, fetchAuditEvents } from '../../services/audit';

const PAGE_SIZE = 25;
const fieldClass = 'w-full rounded border border-[#D8D6CD] bg-white px-3 py-2 text-xs text-[#1A1917] outline-none focus:border-[#1E3A8A]';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function prettyAction(action: string) {
  return action.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function AuditTrailPage() {
  const [data, setData] = useState<AuditEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ search: '', action: '', actor: '', entity_type: '', start_date: '', end_date: '' });
  const [filters, setFilters] = useState<AuditFilters>({});

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchAuditEvents({ ...filters, page, page_size: PAGE_SIZE });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load audit events.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters(Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim() !== '')) as AuditFilters);
  }

  function clearFilters() {
    setDraft({ search: '', action: '', actor: '', entity_type: '', start_date: '', end_date: '' });
    setFilters({});
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-[#E2E0D8] pb-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-[#1E3A8A]">
            <span>Governance & Accountability</span>
            <span className="rounded border border-[#B8DFC8] bg-[#EAF5EE] px-1.5 py-0.5 text-[9px] text-[#1C4D35]">Read only</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1A1917]">Audit Trail</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[#5E5D57]">
            A chronological, searchable record of workspace actions and administrative decisions.
            Entries are read-only in this interface.
          </p>
        </div>
        <button onClick={() => void loadEvents()} disabled={loading} className="rounded border border-[#C6C4BA] bg-white px-3 py-2 text-xs font-semibold hover:bg-[#F2F1EC] disabled:opacity-50">
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total events in workspace', value: data?.stats.total_events },
          { label: 'Events today (UTC)', value: data?.stats.today_events },
          { label: 'Distinct actors', value: data?.stats.unique_actors },
        ].map(stat => (
          <div key={stat.label} className="rounded border border-[#E2E0D8] bg-white p-4 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#77756C]">{stat.label}</p>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[#1A1917]">{stat.value === undefined ? '—' : stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <form onSubmit={applyFilters} className="rounded border border-[#E2E0D8] bg-white p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">Search & filters</h2>
          <span className="text-[10px] text-[#77756C]">Workspace-scoped results</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-[11px] font-semibold text-[#5E5D57]">Search
            <input className={fieldClass + ' mt-1'} placeholder="Actor, action, entity ID…" value={draft.search} onChange={e => setDraft({ ...draft, search: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-[#5E5D57]">Action code
            <input className={fieldClass + ' mt-1'} placeholder="e.g. CASE_CREATED" value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value.trim().toUpperCase() })} />
          </label>
          <label className="text-[11px] font-semibold text-[#5E5D57]">Actor name
            <input className={fieldClass + ' mt-1'} placeholder="Filter by actor" value={draft.actor} onChange={e => setDraft({ ...draft, actor: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-[#5E5D57]">Entity type
            <select className={fieldClass + ' mt-1'} value={draft.entity_type} onChange={e => setDraft({ ...draft, entity_type: e.target.value })}>
              <option value="">All entity types</option>
              <option value="CASE">Case</option>
              <option value="WORKSPACE">Workspace</option>
              <option value="DOCUMENT">Document</option>
              <option value="COMPLIANCE">Compliance</option>
              <option value="ALERT">Alert</option>
              <option value="TASK">Task</option>
              <option value="INGESTION">Ingestion</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold text-[#5E5D57]">From date
            <input type="date" className={fieldClass + ' mt-1'} value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} />
          </label>
          <label className="text-[11px] font-semibold text-[#5E5D57]">To date
            <input type="date" className={fieldClass + ' mt-1'} value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className="rounded bg-[#1E3A8A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#172554]">Apply filters</button>
          <button type="button" onClick={clearFilters} className="rounded border border-[#D8D6CD] px-4 py-2 text-xs font-semibold text-[#5E5D57] hover:bg-[#F7F7F5]">Clear</button>
        </div>
      </form>

      {error && (
        <div role="alert" className="rounded border border-[#F0C4C4] bg-[#FDF0F0] p-4 text-xs text-[#8A1E20]">
          <p className="font-bold">Audit events could not be loaded</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-[11px]">Audit access is limited to Administrator, Compliance Officer, and Reviewer roles.</p>
        </div>
      )}

      <div className="overflow-hidden rounded border border-[#E2E0D8] bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-[#E2E0D8] bg-[#F7F7F5] px-4 py-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">Recorded events</h2>
            <p className="mt-0.5 text-[10px] text-[#77756C]">{data ? `${data.total.toLocaleString()} matching events` : 'Waiting for data'}</p>
          </div>
          <span className="text-[10px] text-[#77756C]">Newest first</span>
        </div>

        {loading && !data ? (
          <div className="p-10 text-center text-xs text-[#5E5D57]">Loading audit history…</div>
        ) : data && data.items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-[#1A1917]">No matching events</p>
            <p className="mt-1 text-xs text-[#5E5D57]">Try clearing filters or check back after workflow activity is recorded.</p>
          </div>
        ) : data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-left">
                <thead className="bg-white text-[10px] uppercase tracking-wider text-[#77756C]">
                  <tr>
                    <th className="border-b border-[#E2E0D8] px-4 py-3 font-semibold">Timestamp</th>
                    <th className="border-b border-[#E2E0D8] px-4 py-3 font-semibold">Actor</th>
                    <th className="border-b border-[#E2E0D8] px-4 py-3 font-semibold">Action</th>
                    <th className="border-b border-[#E2E0D8] px-4 py-3 font-semibold">Entity</th>
                    <th className="border-b border-[#E2E0D8] px-4 py-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item: AuditEvent) => {
                    const expanded = expandedId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="border-b border-[#F0EFE9] align-top hover:bg-[#FBFBF9]">
                          <td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#5E5D57]">{formatDate(item.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-[#1A1917]">{item.actor_name}</div>
                            <div className="mt-1 text-[10px] text-[#77756C]">{item.actor_role.replaceAll('_', ' ')}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-semibold text-[#1E3A8A]">{prettyAction(item.action)}</div>
                            <div className="mt-1 font-mono text-[10px] text-[#77756C]">{item.action}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-[11px] font-semibold text-[#1A1917]">{item.entity_type}</div>
                            <div className="mt-1 max-w-[180px] truncate font-mono text-[10px] text-[#77756C]" title={item.entity_id}>{item.entity_id}</div>
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="rounded border border-[#D8D6CD] px-2.5 py-1 text-[10px] font-semibold hover:bg-[#F2F1EC]">
                              {expanded ? 'Hide details' : 'View details'}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-[#E2E0D8] bg-[#FAF9F5]">
                            <td colSpan={5} className="px-4 py-4">
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#77756C]">Stored event metadata</p>
                              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-[#E2E0D8] bg-white p-3 text-[11px] leading-5 text-[#34332F]">{JSON.stringify(item.details ?? {}, null, 2)}</pre>
                              <p className="mt-2 break-all font-mono text-[10px] text-[#77756C]">Event ID: {item.id}</p>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#E2E0D8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-[#5E5D57]">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded border border-[#D8D6CD] px-3 py-1.5 text-xs disabled:opacity-40">← Previous</button>
                <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))} className="rounded border border-[#D8D6CD] px-3 py-1.5 text-xs disabled:opacity-40">Next →</button>
              </div>
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] leading-4 text-[#77756C]">
        Audit records shown here are read-only through this page. This does not by itself guarantee tamper-proof storage;
        production deployments should enforce database permissions, retention controls, and verified actor identity.
      </p>
    </div>
  );
}
