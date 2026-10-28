'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { fetchCases, fetchEVCQueueApi, addCaseToEVCQueueApi, scheduleEVCVisitApi, rescheduleEVCVisitApi, completeEVCVisitApi } from '../../services/api';

type EVCItem = {
  id: string; case_id: string; case_reference: string; institution_name: string;
  current_stage: string; priority: string; target_date: string; routing_basis: string;
  status: string; scheduled_at?: string | null; venue?: string | null;
  assigned_team?: string | null; completed_at?: string | null; completion_notes?: string | null;
  is_overdue: boolean;
};

export default function EVCPage() {
  const [items, setItems] = useState<EVCItem[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [caseId, setCaseId] = useState('');
  const [routingBasis, setRoutingBasis] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [venue, setVenue] = useState('');
  const [team, setTeam] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [actionId, setActionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, caseRows] = await Promise.all([fetchEVCQueueApi(), fetchCases()]);
      setItems(queue.items || []);
      setCases(caseRows || []);
      if (!caseId && caseRows?.length) setCaseId(caseRows[0].id);
    } catch (e: any) {
      setError(e.message || 'Could not load EVC queue.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (fn: () => Promise<any>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); setNotice(message); setScheduledAt(''); setVenue(''); setTeam(''); setRescheduleReason(''); setCompletionNotes(''); setActionId(''); await refresh(); }
    catch (e: any) { setError(e.message || 'Action failed.'); }
    finally { setBusy(false); }
  };

  const schedulePayload = () => {
    if (!scheduledAt) throw new Error('Choose a future date and time.');
    return { scheduled_at: new Date(scheduledAt).toISOString(), venue: venue.trim() || undefined, assigned_team: team.trim() || undefined };
  };

  const waiting = items.filter(x => x.status === 'WAITING_TO_SCHEDULE').length;
  const scheduled = items.filter(x => x.status === 'SCHEDULED').length;
  const overdue = items.filter(x => x.is_overdue).length;
  const completed = items.filter(x => x.status === 'COMPLETED').length;

  return <AppShell>
    <div className="mb-5 border-b border-[#E2E0D8] pb-4">
      <h1 className="text-xl font-bold text-[#1A1917]">EVC Scheduling & Visit Tracking</h1>
      <p className="mt-1 text-xs text-[#5E5D57]">Route cases only when the configured approval workflow requires an EVC visit. All routing and schedule changes are audited.</p>
    </div>

    {notice && <div className="mb-4 rounded border border-[#B8DFC8] bg-[#EAF5EE] px-4 py-2 text-sm text-[#1C4D35]">{notice}</div>}
    {error && <div className="mb-4 rounded border border-[#F0C4C4] bg-[#FDF0F0] px-4 py-2 text-sm text-[#8A1E20]">{error}</div>}

    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      {[['Waiting to schedule', waiting], ['Scheduled', scheduled], ['Past scheduled time', overdue], ['Completed', completed]].map(([label, count]) =>
        <div key={String(label)} className="rounded border border-[#E2E0D8] bg-white p-4">
          <div className="text-xs text-[#5E5D57]">{label}</div><div className="mt-1 text-2xl font-bold">{count}</div>
        </div>
      )}
    </div>

    <section className="mb-6 rounded border border-[#E2E0D8] bg-white p-4">
      <h2 className="mb-3 text-sm font-bold">Route a case to the EVC queue</h2>
      <p className="mb-3 text-xs text-[#5E5D57]">Requires Administrator or Compliance Officer role. Record the policy/workflow basis; this does not claim that a regulatory rule was automatically verified.</p>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={e => { e.preventDefault(); if (!caseId || routingBasis.trim().length < 8) { setError('Select a case and provide a routing basis of at least 8 characters.'); return; } void runAction(() => addCaseToEVCQueueApi(caseId, routingBasis), 'Case added to the EVC queue.'); }}>
        <label className="text-xs font-semibold">Approval case
          <select value={caseId} onChange={e => setCaseId(e.target.value)} className="mt-1 block w-full rounded border border-[#C6C4BA] bg-white p-2 text-sm">
            {cases.map(c => <option key={c.id} value={c.id}>{c.case_reference} — {c.institution_name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold md:col-span-2">Routing basis / workflow reference
          <input value={routingBasis} onChange={e => setRoutingBasis(e.target.value)} required minLength={8} maxLength={1000} placeholder="Why does this case require EVC?" className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" />
        </label>
        <button disabled={busy || !cases.length} className="rounded bg-[#1E3A8A] px-3 py-2 text-xs font-bold text-white disabled:opacity-50 md:col-span-3">Add to EVC queue</button>
      </form>
    </section>

    <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">EVC visit queue</h2><button onClick={() => void refresh()} className="rounded border border-[#C6C4BA] bg-white px-3 py-1.5 text-xs font-semibold">Refresh</button></div>
      {loading ? <p className="py-8 text-center text-sm text-[#5E5D57]">Loading EVC queue…</p> : items.length === 0 ? <div className="rounded border border-dashed border-[#C6C4BA] bg-white p-8 text-center text-sm text-[#5E5D57]">No EVC visits queued for the active workspace mode.</div> :
        <div className="space-y-3">{items.map(item => <article key={item.id} className="rounded border border-[#E2E0D8] bg-white p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row">
            <div><div className="font-bold">{item.case_reference} · {item.institution_name}</div><div className="mt-1 text-xs text-[#5E5D57]">Stage: {item.current_stage.replaceAll('_', ' ')} · Priority: {item.priority} · Case target: {item.target_date}</div><p className="mt-2 text-sm">{item.routing_basis}</p></div>
            <span className={`h-fit rounded border px-2 py-1 text-xs font-bold ${item.is_overdue ? 'border-red-300 bg-red-50 text-red-800' : item.status === 'COMPLETED' ? 'border-green-300 bg-green-50 text-green-800' : 'border-[#CAD6E2] bg-[#EDF2F7] text-[#2B3B4C]'}`}>{item.is_overdue ? 'OVERDUE' : item.status.replaceAll('_', ' ')}</span>
          </div>
          {item.scheduled_at && <div className="mt-3 rounded bg-[#F7F7F5] p-3 text-xs">Scheduled: {new Date(item.scheduled_at).toLocaleString()} {item.venue ? `· Venue: ${item.venue}` : ''} {item.assigned_team ? `· Team: ${item.assigned_team}` : ''}</div>}
          {item.completion_notes && <p className="mt-2 text-xs text-[#5E5D57]">Outcome: {item.completion_notes}</p>}
          {item.status !== 'COMPLETED' && <div className="mt-4 border-t border-[#F2F1EC] pt-3">
            {actionId !== item.id ? <button onClick={() => { setActionId(item.id); setScheduledAt(item.scheduled_at ? new Date(item.scheduled_at).toISOString().slice(0,16) : ''); setVenue(item.venue || ''); setTeam(item.assigned_team || ''); }} className="rounded border border-[#C6C4BA] px-3 py-1.5 text-xs font-semibold">{item.status === 'SCHEDULED' ? 'Reschedule / Complete' : 'Schedule visit'}</button> :
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold">Date and time<input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" /></label>
              <label className="text-xs font-semibold">Venue<input value={venue} onChange={e => setVenue(e.target.value)} className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" /></label>
              <label className="text-xs font-semibold">Assigned team<input value={team} onChange={e => setTeam(e.target.value)} className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" /></label>
              <div className="flex flex-wrap items-end gap-2">
                {item.status === 'WAITING_TO_SCHEDULE' ? <button disabled={busy} onClick={() => void runAction(() => scheduleEVCVisitApi(item.id, schedulePayload()), 'EVC visit scheduled.')} className="rounded bg-[#1E3A8A] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save schedule</button> :
                  <button disabled={busy} onClick={() => { if (rescheduleReason.trim().length < 4) { setError('Provide a reason for rescheduling.'); return; } void runAction(() => rescheduleEVCVisitApi(item.id, { ...schedulePayload(), reason: rescheduleReason }), 'EVC visit rescheduled.'); }} className="rounded bg-[#1E3A8A] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Save reschedule</button>}
                <button disabled={busy || item.status !== 'SCHEDULED'} onClick={() => { if (completionNotes.trim().length < 4) { setError('Enter completion notes before completing the visit.'); return; } void runAction(() => completeEVCVisitApi(item.id, completionNotes), 'EVC visit marked completed.'); }} className="rounded border border-[#C6C4BA] px-3 py-2 text-xs font-semibold disabled:opacity-50">Complete visit</button>
                <button onClick={() => setActionId('')} className="px-2 py-2 text-xs text-[#5E5D57]">Cancel</button>
              </div>
              {item.status === 'SCHEDULED' && <label className="text-xs font-semibold md:col-span-2">Reschedule reason<input value={rescheduleReason} onChange={e => setRescheduleReason(e.target.value)} placeholder="Required if changing the schedule" className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" /></label>}
              {item.status === 'SCHEDULED' && <label className="text-xs font-semibold md:col-span-2">Completion notes<input value={completionNotes} onChange={e => setCompletionNotes(e.target.value)} placeholder="Required to complete this visit" className="mt-1 block w-full rounded border border-[#C6C4BA] p-2 text-sm" /></label>}
            </div>}
          </div>}
        </article>)}</div>}
    </section>
  </AppShell>;
}
