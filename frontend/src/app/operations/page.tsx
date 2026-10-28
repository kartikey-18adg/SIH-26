'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/AppShell';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

async function api(path: string, options: RequestInit = {}) {
  const role = typeof window !== 'undefined' ? localStorage.getItem('aiclear_active_role') || 'Institution Coordinator' : 'Institution Coordinator';
  const response = await fetch(`${API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: { 'X-AIClear-Role': role, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

const field = 'w-full rounded border border-[#C6C4BA] bg-white px-3 py-2 text-sm';
const button = 'rounded bg-[#1E3A8A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50';

export default function ComplianceOperationsPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [obligations, setObligations] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [documentsByCase, setDocumentsByCase] = useState<Record<string, any[]>>({});
  const [pathwayTemplates, setPathwayTemplates] = useState<any[]>([]);
  const [assignedPathway, setAssignedPathway] = useState<any>(null);
  const [pathwayKey, setPathwayKey] = useState('ONLY_SCRUTINY');
  const [summary, setSummary] = useState<any>(null);
  const [caseId, setCaseId] = useState('');
  const [title, setTitle] = useState('Submit signed undertaking');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('Institution Coordinator');
  const [reminderDays, setReminderDays] = useState('14');
  const [evidenceId, setEvidenceId] = useState<Record<string, string>>({});
  const [evidenceNotes, setEvidenceNotes] = useState<Record<string, string>>({});
  const [evcCommittee, setEvcCommittee] = useState('Expert Visit Committee');
  const [evcDate, setEvcDate] = useState('');
  const [evcMode, setEvcMode] = useState('On-site');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [caseRows, obligationRows, evcRows, metrics, templates] = await Promise.all([
      api('/cases'), api('/obligations'), api('/evc/appointments'), api('/operations/summary'), api('/workflows/pathways')
    ]);
    setCases(caseRows);
    const documentEntries = await Promise.all(caseRows.map(async (row: any) => [row.id, await api(`/cases/${row.id}/documents`).catch(() => [])] as const));
    setDocumentsByCase(Object.fromEntries(documentEntries));
    setObligations(obligationRows);
    setAppointments(evcRows);
    setSummary(metrics);
    setPathwayTemplates(templates);
    const targetCaseId = caseId || (caseRows.length ? caseRows[0].id : '');
    if (!caseId && caseRows.length) setCaseId(caseRows[0].id);
    if (targetCaseId) {
      const assigned = await api(`/workflows/cases/${targetCaseId}/pathway`);
      setAssignedPathway(assigned);
      if (assigned.assigned) setPathwayKey(assigned.pathway_key);
    } else setAssignedPathway(null);
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => refresh()).catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [refresh]);

  async function act(fn: () => Promise<any>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await refresh(); setMessage(success); }
    catch (e: any) { setError(e.message || 'Action failed'); }
    finally { setBusy(false); }
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E0D8] pb-4">
        <div>
          <Link href="/" className="text-xs font-semibold text-[#1E3A8A] hover:underline">← Back to workspace</Link>
          <h1 className="mt-2 text-xl font-bold">Undertakings & EVC Operations</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#5E5D57]">
            Track time-bound obligations, submit existing vault evidence for independent verification, schedule Expert Visit Committee activity, and monitor deadline risks. Notifications in this prototype are simulated.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => act(() => api('/obligations/scan', { method: 'POST' }), 'Obligation deadline scan completed.')}>Scan obligations</button><button className={button} disabled={busy} onClick={() => act(() => api('/evc/scan', { method: 'POST' }), 'EVC reminder and overdue scan completed.')}>Scan EVC reminders</button></div>
      </div>

      {error && <div role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="mb-3 rounded border border-[#C6C4BA] bg-white p-3 text-sm">{message}</div>}

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            ['Cases', summary.cases_total], ['Pending obligations', summary.obligations_pending],
            ['Overdue obligations', summary.obligations_overdue], ['EVC scheduled', summary.evc_scheduled],
            ['Documents expiring ≤30d', summary.documents_expiring_30_days]
          ].map(([label, value]) => <div key={String(label)} className="rounded border border-[#E2E0D8] bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-[#5E5D57]">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
          </div>)}
        </div>
      )}

      {summary && <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded border border-[#E2E0D8] bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">Pendency by stage</h2>
          <div className="space-y-2">{summary.stage_pendency.map((x: any) => <div key={x.stage} className="flex justify-between gap-3 text-xs"><span>{x.stage.replace(/_/g, ' ')}</span><strong className="tabular-nums">{x.count}</strong></div>)}</div>
        </div>
        <div className="rounded border border-[#E2E0D8] bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">Pendency by state / region</h2>
          <div className="space-y-2">{summary.region_pendency.map((x: any) => <div key={x.region} className="flex justify-between gap-3 text-xs"><span>{x.region}</span><strong className="tabular-nums">{x.count}</strong></div>)}</div>
        </div>
        <div className="rounded border border-[#E2E0D8] bg-white p-4">
          <h2 className="mb-3 text-sm font-bold">Officer workload</h2>
          <div className="space-y-2">{summary.workload_by_owner.map((x: any) => <div key={x.owner} className="flex justify-between gap-3 text-xs"><span>{x.owner}</span><strong className="tabular-nums">{x.open_cases}</strong></div>)}</div>
          <h3 className="mb-2 mt-4 text-xs font-bold">Case deadline buckets</h3>
          <div className="space-y-1 text-xs text-[#5E5D57]">
            <p>Overdue: <strong>{summary.deadline_buckets.overdue}</strong></p>
            <p>Due in 0–7 days: <strong>{summary.deadline_buckets.due_0_7_days}</strong></p>
            <p>Due in 8–14 days: <strong>{summary.deadline_buckets.due_8_14_days}</strong></p>
          </div>
        </div>
        <div className="rounded border border-[#E2E0D8] bg-white p-4 lg:col-span-3">
          <h2 className="mb-3 text-sm font-bold">Longest-running stages</h2>
          {summary.stage_ageing.length === 0 ? <p className="text-xs text-[#5E5D57]">No cases in the active data mode.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[#E2E0D8] text-[#5E5D57]"><th className="py-2 pr-3">Case</th><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3">Owner</th><th className="py-2 pr-3">Since</th><th className="py-2 text-right">Days in stage</th></tr></thead><tbody>{summary.stage_ageing.slice(0, 10).map((x: any) => <tr key={x.case_id} className="border-b border-[#F0EFEA]"><td className="py-2 pr-3 font-semibold">{x.case_reference}</td><td className="py-2 pr-3">{x.stage.replace(/_/g, ' ')}</td><td className="py-2 pr-3">{x.owner}</td><td className="py-2 pr-3">{x.stage_started_on}</td><td className="py-2 text-right font-bold tabular-nums">{x.days_in_stage}</td></tr>)}</tbody></table></div>}
        </div>
      </section>}

      <section className="mb-6 rounded border border-[#E2E0D8] bg-white p-4">
        <h2 className="mb-2 text-sm font-bold">Configure the application pathway</h2>
        <p className="mb-3 text-xs text-[#5E5D57]">Select an approved route for the selected case. Once assigned, case-stage transitions are restricted to the configured sequence. Custom stage rules remain institution-configurable and require regulatory verification.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold">Application
            <select className={field + ' mt-1'} value={caseId} onChange={(e) => setCaseId(e.target.value)} required>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.case_reference} — {c.institution_name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Pathway template
            <select className={field + ' mt-1'} value={pathwayKey} onChange={(e) => setPathwayKey(e.target.value)}>
              {pathwayTemplates.filter((x) => !x.is_custom).map((x) => <option key={x.pathway_key} value={x.pathway_key}>{x.name}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button className={button} disabled={busy || !caseId} onClick={() => act(() => api(`/workflows/cases/${caseId}/pathway`, { method: 'POST', body: JSON.stringify({ pathway_key: pathwayKey, configured_by: 'Administrator' }) }), 'Workflow pathway assigned. Next-stage options are now constrained by the selected sequence.')}>Assign pathway</button></div>
        </div>
        {assignedPathway?.assigned && <div className="mt-3 rounded border border-[#C6C4BA] bg-[#F7F7F5] p-3">
          <p className="text-xs font-semibold">Active route: {assignedPathway.pathway_name}</p>
          <p className="mt-1 text-xs text-[#5E5D57]">{assignedPathway.stages.join(' → ')}</p>
        </div>}
      </section>

      <section className="mb-6 rounded border border-[#E2E0D8] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Create time-bound obligation</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          act(() => api('/obligations', { method: 'POST', body: JSON.stringify({
            case_id: caseId, title, description, due_date: dueDate,
            reminder_days: Number(reminderDays), assigned_to: assignee, created_by: 'AIClear operator'
          }) }), 'Obligation created.');
        }}>
          <label className="text-xs font-semibold">Application
            <select className={field + ' mt-1'} value={caseId} onChange={(e) => setCaseId(e.target.value)} required>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.case_reference} — {c.institution_name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Obligation title
            <input className={field + ' mt-1'} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
          </label>
          <label className="text-xs font-semibold">Description / condition
            <textarea className={field + ' mt-1'} value={description} onChange={(e) => setDescription(e.target.value)} required minLength={4} rows={2} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold">Due date
              <input className={field + ' mt-1'} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
            <label className="text-xs font-semibold">Reminder lead (days)
              <input className={field + ' mt-1'} type="number" min="0" max="365" value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} required />
            </label>
          </div>
          <label className="text-xs font-semibold">Responsible person
            <input className={field + ' mt-1'} value={assignee} onChange={(e) => setAssignee(e.target.value)} required />
          </label>
          <div className="flex items-end"><button className={button} disabled={busy || !caseId || !dueDate || !description.trim()}>Create obligation</button></div>
        </form>
      </section>

      <section className="mb-6 rounded border border-[#E2E0D8] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Obligations and evidence verification</h2>
        {obligations.length === 0 ? <p className="text-xs text-[#5E5D57]">No obligations in the current data mode yet.</p> : <div className="space-y-3">
          {obligations.map((item) => <article key={item.id} className="rounded border border-[#E2E0D8] p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs text-[#5E5D57]">{item.case_reference} · {item.institution_name}</p><p className="mt-1 text-xs">{item.description}</p></div>
              <span className={'rounded border px-2 py-1 text-[10px] font-bold ' + (item.is_overdue ? 'border-red-300 bg-red-50 text-red-800' : 'border-[#C6C4BA] bg-[#F7F7F5]')}>{item.is_overdue ? 'OVERDUE' : item.status.replace(/_/g, ' ')}</span>
            </div>
            <div className="mt-2 text-xs text-[#5E5D57]">Due {item.due_date} · {item.days_remaining} day(s) · Assigned to {item.assigned_to}</div>
            {item.status !== 'VERIFIED' && item.status !== 'SUBMITTED' && (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                <select className={field} value={evidenceId[item.id] || ''} onChange={(e) => setEvidenceId((p) => ({ ...p, [item.id]: e.target.value }))} required><option value="">Select existing vault evidence…</option>{(documentsByCase[item.case_id] || []).map((doc: any) => <option key={doc.id} value={doc.id}>{doc.original_filename} · {doc.category} · {doc.review_status}</option>)}</select>
                <input className={field} placeholder="Submission notes" value={evidenceNotes[item.id] || ''} onChange={(e) => setEvidenceNotes((p) => ({ ...p, [item.id]: e.target.value }))} />
                <button className={button} disabled={busy || !evidenceId[item.id] || (evidenceNotes[item.id] || '').trim().length < 4} onClick={() => act(() => api(`/obligations/${item.id}/submit`, { method: 'POST', body: JSON.stringify({ evidence_document_id: evidenceId[item.id], notes: evidenceNotes[item.id], submitted_by: 'Institution Coordinator' }) }), 'Evidence submitted for independent verification.')}>Submit evidence</button>
              </div>
            )}
            {item.status === 'SUBMITTED' && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs text-[#5E5D57]">Evidence ID: {item.submitted_evidence_document_id}</span><button className={button} disabled={busy} onClick={() => act(() => api(`/obligations/${item.id}/verify`, { method: 'POST', body: JSON.stringify({ decision: 'VERIFIED', notes: 'Evidence verified by authorized reviewer.', verified_by: 'Compliance Reviewer' }) }), 'Obligation evidence verified.')}>Verify evidence</button><button className="rounded border border-red-300 px-3 py-2 text-xs font-semibold text-red-800" disabled={busy} onClick={() => {
              const notes = window.prompt('Reason for rejecting this evidence (required):');
              if (notes && notes.trim().length >= 4) act(() => api(`/obligations/${item.id}/verify`, { method: 'POST', body: JSON.stringify({ decision: 'REJECTED', notes, verified_by: 'Compliance Reviewer' }) }), 'Evidence rejected with reason.');
            }}>Reject evidence</button></div>}
            {item.status === 'VERIFIED' && <p className="mt-2 text-xs text-[#1C4D35]">Verified by {item.verified_by} · {item.verified_at ? new Date(item.verified_at).toLocaleString() : ''}</p>}
            {item.verification_notes && <p className="mt-1 text-xs text-[#5E5D57]">Reviewer notes: {item.verification_notes}</p>}
          </article>)}
        </div>}
      </section>

      <section className="mb-6 rounded border border-[#E2E0D8] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold">Schedule an Expert Visit Committee (EVC)</h2>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          act(() => api('/evc/appointments', { method: 'POST', body: JSON.stringify({
            case_id: caseId, committee_name: evcCommittee, scheduled_at: new Date(evcDate).toISOString(),
            location_or_mode: evcMode, scheduled_by: 'Compliance Officer'
          }) }), 'EVC appointment scheduled.');
        }}>
          <label className="text-xs font-semibold">Application
            <select className={field + ' mt-1'} value={caseId} onChange={(e) => setCaseId(e.target.value)} required>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.case_reference} — {c.institution_name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">Committee name
            <input className={field + ' mt-1'} value={evcCommittee} onChange={(e) => setEvcCommittee(e.target.value)} required />
          </label>
          <label className="text-xs font-semibold">Date and time
            <input className={field + ' mt-1'} type="datetime-local" value={evcDate} onChange={(e) => setEvcDate(e.target.value)} required />
          </label>
          <label className="text-xs font-semibold">Visit mode / location
            <input className={field + ' mt-1'} value={evcMode} onChange={(e) => setEvcMode(e.target.value)} />
          </label>
          <div><button className={button} disabled={busy || !caseId || !evcDate}>Schedule EVC</button></div>
        </form>
        <div className="mt-4 space-y-2">
          {appointments.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#E2E0D8] p-3">
            <div><p className="text-xs font-semibold">{item.committee_name} · {item.case_reference}</p><p className="mt-1 text-xs text-[#5E5D57]">{new Date(item.scheduled_at).toLocaleString()} · {item.location_or_mode || 'Location not specified'}</p><p className="mt-1 text-[10px] uppercase tracking-wide">{item.status}</p></div>
            {['SCHEDULED', 'RESCHEDULED'].includes(item.status) && <button className={button} disabled={busy} onClick={() => act(() => api(`/evc/appointments/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'COMPLETED', completion_notes: 'Visit completed; formal findings remain subject to authorized review.', updated_by: 'Compliance Officer' }) }), 'EVC visit marked complete. Statutory decision remains separate.')}>Mark visit complete</button>}
            {item.completion_notes && <p className="basis-full text-xs text-[#5E5D57]">Notes: {item.completion_notes}</p>}
          </div>)}
        </div>
      </section>

      <p className="text-[10px] leading-relaxed text-[#5E5D57]">Reminder windows and escalation thresholds are configurable prototype settings, not a statement of official AICTE deadlines. EVC scheduling/completion records do not constitute an inspection finding or approval decision.</p>
    </AppShell>
  );
}
