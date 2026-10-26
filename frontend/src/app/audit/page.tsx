'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { AuditEvent, AuditFilters, AuditEventResponse, fetchAuditEvents } from '../../services/audit';
import { fetchCases } from '../../services/api';

const PAGE_SIZE = 25;
type DeadlineCase = { id: string; case_reference: string; institution_name?: string; current_stage?: string; priority?: string; target_date?: string | null; status?: string };
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
  const [deadlineCases, setDeadlineCases] = useState<DeadlineCase[]>([]);
  const [deadlineLoading, setDeadlineLoading] = useState(true);
  const [deadlineError, setDeadlineError] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    setDeadlineLoading(true);
    fetchCases()
      .then((items: DeadlineCase[]) => {
        if (cancelled) return;
        const dated = items.filter(item => item.target_date && !Number.isNaN(new Date(item.target_date).getTime()));
        dated.sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime());
        setDeadlineCases(dated);
        setDeadlineError('');
      })
      .catch((err: Error) => {
        if (!cancelled) setDeadlineError(err.message || 'Could not load case deadlines.');
      })
      .finally(() => { if (!cancelled) setDeadlineLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
    <AppShell>
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
          { label: 'Events today', value: data?.stats.today_events },
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

      <section className="overflow-hidden rounded border border-[#E2E0D8] bg-white shadow-xs">
        <div className="flex flex-col gap-2 border-b border-[#E2E0D8] bg-[#F7F7F5] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">Case deadline timeline</h2>
            <p className="mt-1 text-[10px] text-[#77756C]">Target-date view of cases in the active workspace. Markers show deadlines, not task duration.</p>
          </div>
          <span className="text-[10px] text-[#77756C]">{deadlineCases.length.toLocaleString()} cases with target dates</span>
        </div>
        {deadlineLoading ? (
          <div className="p-6 text-center text-xs text-[#5E5D57]">Loading case deadlines…</div>
        ) : deadlineError ? (
          <div role="alert" className="p-4 text-xs text-[#8A1E20]">Deadline timeline unavailable: {deadlineError}</div>
        ) : deadlineCases.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#5E5D57]">No cases with target dates are available in the active data mode.</div>
        ) : (() => {
          const visibleCases = deadlineCases.slice(0, 15);
          const dates = visibleCases.map(item => new Date(item.target_date!).getTime());
          const minDate = Math.min(...dates);
          const maxDate = Math.max(...dates);
          const span = Math.max(maxDate - minDate, 24 * 60 * 60 * 1000);
          const ticks = Array.from({ length: 5 }, (_, index) => new Date(minDate + span * index / 4));
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return (
            <div className="p-4">
              <div className="mb-2 grid grid-cols-[minmax(120px,1.2fr)_minmax(220px,2fr)] gap-3 text-[10px] font-semibold text-[#77756C]">
                <span>Case / target date</span>
                <div className="relative h-6 border-b border-[#D8D6CD]">
                  {ticks.map((tick, index) => (
                    <span key={index} className="absolute bottom-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${index * 25}%` }}>
                      {tick.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-[#F0EFE9]">
                {visibleCases.map(item => {
                  const target = new Date(item.target_date!);
                  const position = ((target.getTime() - minDate) / span) * 100;
                  const daysLeft = Math.ceil((new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() - today.getTime()) / 86400000);
                  const overdue = daysLeft < 0 && !['COMPLETED', 'APPROVED', 'REJECTED'].includes((item.status || '').toUpperCase());
                  const priority = (item.priority || '').toUpperCase();
                  const markerColor = overdue ? '#B42318' : priority === 'CRITICAL' ? '#B42318' : priority === 'HIGH' ? '#C27803' : '#1E3A8A';
                  return (
                    <div key={item.id} className="grid grid-cols-[minmax(120px,1.2fr)_minmax(220px,2fr)] items-center gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#1A1917]" title={item.case_reference}>{item.case_reference}</p>
                        <p className="truncate text-[10px] text-[#77756C]" title={item.institution_name}>{item.institution_name || 'Institution unavailable'}</p>
                        <p className="mt-0.5 text-[10px] text-[#5E5D57]">{target.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })} · {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`}</p>
                      </div>
                      <div className="relative h-8 rounded bg-[#F7F7F5]">
                        <div className="absolute inset-y-0 border-l border-dashed border-[#C6C4BA]" style={{ left: '50%' }} aria-hidden="true" />
                        <div className="absolute inset-y-0 flex items-center" style={{ left: `${Math.max(0, Math.min(100, position))}%` }}>
                          <span className="h-4 w-1 rounded-full" style={{ backgroundColor: markerColor }} title={`Target date: ${target.toLocaleDateString()}`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {deadlineCases.length > visibleCases.length && <p className="mt-3 text-[10px] text-[#77756C]">Showing the 15 earliest target dates. {deadlineCases.length - visibleCases.length} more cases are available but not shown here.</p>}
              <div className="mt-3 flex flex-wrap gap-3 border-t border-[#E2E0D8] pt-3 text-[10px] text-[#5E5D57]">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-[#1E3A8A]" />Upcoming / normal priority</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-[#C27803]" />High priority</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-1 rounded-full bg-[#B42318]" />Critical priority or overdue</span>
              </div>
            </div>
          );
        })()}
      </section>

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
            <div className="divide-y divide-[#F0EFE9]">
              {(() => {
                const groups = data.items.reduce<Record<string, AuditEvent[]>>((acc, item) => {
                  const parsed = new Date(item.created_at);
                  const day = Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                  (acc[day] ??= []).push(item);
                  return acc;
                }, {});
                return Object.entries(groups).map(([day, events]) => (
                  <section key={day} aria-label={day}>
                    <div className="sticky top-0 border-b border-[#E2E0D8] bg-[#F7F7F5] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-[#77756C]">{day}</div>
                    <div className="divide-y divide-[#F0EFE9]">
                      {events.map(item => {
                        const expanded = expandedId === item.id;
                        const isCase = item.entity_type === 'CASE';
                        return (
                          <article key={item.id} className="px-4 py-4 transition-colors hover:bg-[#FBFBF9] sm:px-5">
                            <div className="flex gap-3">
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DCE5F8] bg-[#F2F6FF] text-[#1E3A8A]">
                                <span aria-hidden="true" className="text-sm">{isCase ? '↗' : item.entity_type === 'WORKSPACE' ? '⚙' : item.entity_type === 'ALERT' ? '!' : '•'}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-[#1A1917]">{prettyAction(item.action)}</p>
                                    <p className="mt-1 text-[11px] leading-5 text-[#5E5D57]">
                                      <span className="font-semibold text-[#34332F]">{item.actor_name}</span>
                                      <span> · {item.actor_role.replaceAll('_', ' ')}</span>
                                    </p>
                                  </div>
                                  <time dateTime={item.created_at} className="shrink-0 text-[10px] tabular-nums text-[#77756C]">
                                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </time>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-md border border-[#DCE5F8] bg-[#F5F7FC] px-2 py-1 text-[10px] font-semibold text-[#274782]">{item.entity_type}</span>
                                  <span className="max-w-full truncate font-mono text-[10px] text-[#77756C]" title={item.entity_id}>{item.entity_id}</span>
                                  <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} aria-expanded={expanded} className="ml-auto rounded-md border border-[#D8D6CD] px-2.5 py-1 text-[10px] font-semibold text-[#34332F] hover:bg-[#F2F1EC]">
                                    {expanded ? 'Hide details' : 'View details'}
                                  </button>
                                </div>
                                {expanded && (
                                  <div className="mt-3 rounded-lg border border-[#E2E0D8] bg-[#FAF9F5] p-3">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#77756C]">Event details</p>
                                      <p className="font-mono text-[10px] text-[#77756C]">ID: {item.id}</p>
                                    </div>
                                    <pre className="overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-[#34332F]">{JSON.stringify(item.details ?? {}, null, 2)}</pre>
                                    <p className="mt-2 break-all font-mono text-[10px] text-[#77756C]">Action code: {item.action}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ));
              })()}
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
    </AppShell>
  );
}
