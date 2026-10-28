'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import {
  WorkflowExecutionCase,
  WorkflowExecutionDetail,
  fetchWorkflowExecutionApi,
  fetchWorkflowExecutionCasesApi,
  completeWorkflowStepApi,
} from '../../services/api';

export default function WorkflowExecutionPage() {
  const [cases, setCases] = useState<WorkflowExecutionCase[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<WorkflowExecutionDetail | null>(null);
  const [notesByStep, setNotesByStep] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyStep, setBusyStep] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadCases() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchWorkflowExecutionCasesApi();
      setCases(result.items);
      const nextId = selectedId && result.items.some((item) => item.id === selectedId) ? selectedId : (result.items[0]?.id || '');
      setSelectedId(nextId);
      if (nextId) {
        const nextDetail = await fetchWorkflowExecutionApi(nextId);
        setDetail(nextDetail);
      } else {
        setDetail(null);
      }
    } catch (e: any) {
      setError(e.message || 'Unable to load workflow execution.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(caseId: string) {
    setSelectedId(caseId);
    setDetail(null);
    setError('');
    setNotice('');
    if (!caseId) return;
    try {
      setDetail(await fetchWorkflowExecutionApi(caseId));
    } catch (e: any) {
      setError(e.message || 'Unable to load this case workflow.');
    }
  }

  useEffect(() => { void loadCases(); }, []);

  async function completeStep(stepKey: string) {
    if (!selectedId) return;
    const notes = (notesByStep[stepKey] || '').trim();
    if (notes.length < 4) {
      setError('Add a completion note of at least 4 characters before completing the step.');
      return;
    }
    setBusyStep(stepKey);
    setError('');
    setNotice('');
    try {
      await completeWorkflowStepApi(selectedId, stepKey, notes);
      setNotesByStep((prev) => ({ ...prev, [stepKey]: '' }));
      setDetail(await fetchWorkflowExecutionApi(selectedId));
      setNotice('Step completed and recorded in the audit trail.');
    } catch (e: any) {
      setError(e.message || 'Could not complete this step.');
    } finally {
      setBusyStep('');
    }
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E2E0D8] pb-4">
          <div>
            <h1 className="text-xl font-bold text-[#1A1917]">Case Workflow Execution</h1>
            <p className="text-sm text-[#5E5D57] mt-1">Track the required operational steps for each case and record completion evidence.</p>
          </div>
          <button onClick={() => void loadCases()} disabled={loading} className="rounded border border-[#C6C4BA] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Refresh</button>
        </div>

        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          This checklist uses the workspace's saved pathway (or the default scrutiny pathway if none is saved). It is an operational tracker, not an official AICTE determination.
        </div>

        {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

        <section className="rounded border border-[#E2E0D8] bg-white p-4">
          <label htmlFor="case-select" className="block text-sm font-semibold text-[#1A1917] mb-2">Select approval case</label>
          <select id="case-select" value={selectedId} onChange={(e) => void loadDetail(e.target.value)} disabled={loading || cases.length === 0}
            className="w-full rounded border border-[#C6C4BA] bg-white px-3 py-2 text-sm">
            {cases.length === 0 && <option value="">No cases in active workspace mode</option>}
            {cases.map((item) => <option key={item.id} value={item.id}>{item.case_reference} — {item.institution_name}</option>)}
          </select>
        </section>

        {loading ? <p className="text-sm text-[#5E5D57]">Loading cases…</p> : !detail ? (
          <div className="rounded border border-dashed border-[#C6C4BA] p-10 text-center text-sm text-[#5E5D57]">Create or import a case in the active workspace mode to begin tracking its workflow.</div>
        ) : (
          <>
            <section className="rounded border border-[#E2E0D8] bg-white p-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                <div>
                  <h2 className="font-bold text-[#1A1917]">{detail.case_reference}</h2>
                  <p className="text-sm text-[#5E5D57] mt-1">{detail.institution_name}</p>
                  <p className="text-xs text-[#5E5D57] mt-1">Current case stage: {detail.current_stage.replaceAll('_', ' ')}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{detail.completed_steps} / {detail.total_steps} steps completed</p>
                  <p className="text-xs text-[#5E5D57] mt-1">Pathway snapshot: {detail.pathway.replaceAll('_', ' ')}</p>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-[#E9E7E0] overflow-hidden">
                <div className="h-full bg-[#1E3A8A]" style={{ width: `${detail.completion_percent}%` }} />
              </div>
              <p className="text-xs text-[#5E5D57] mt-2">{detail.completion_percent}% complete. The pathway snapshot is preserved for this case once its checklist is created.</p>
            </section>

            <section className="space-y-3">
              {detail.steps.map((step) => {
                const done = step.status === 'COMPLETED';
                return (
                  <article key={step.id} className="rounded border border-[#E2E0D8] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-green-100 text-green-800' : 'bg-[#EDF2F7] text-[#1E3A8A]'}`}>
                        {done ? '✓' : step.sequence}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-[#1A1917]">{step.step_label}</h3>
                          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${done ? 'bg-green-100 text-green-800' : 'bg-[#F2F1EC] text-[#5E5D57]'}`}>{done ? 'COMPLETED' : 'PENDING'}</span>
                        </div>
                        {done ? (
                          <div className="mt-2 text-sm text-[#5E5D57] space-y-1">
                            <p>{step.completion_notes}</p>
                            <p className="text-xs">Recorded by {step.completed_by || 'unknown'}{step.completed_at ? ` · ${new Date(step.completed_at).toLocaleString()}` : ''}</p>
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            <label htmlFor={`notes-${step.step_key}`} className="block text-xs font-semibold text-[#5E5D57]">Completion note / evidence reference</label>
                            <textarea id={`notes-${step.step_key}`} rows={2} maxLength={2000}
                              value={notesByStep[step.step_key] || ''}
                              onChange={(e) => setNotesByStep((prev) => ({ ...prev, [step.step_key]: e.target.value }))}
                              placeholder="What was reviewed or completed? Include a document/reference ID where applicable."
                              className="w-full rounded border border-[#C6C4BA] p-2 text-sm outline-none focus:border-[#1E3A8A]" />
                            <button onClick={() => void completeStep(step.step_key)} disabled={!!busyStep || (notesByStep[step.step_key] || '').trim().length < 4}
                              className="rounded bg-[#1E3A8A] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                              {busyStep === step.step_key ? 'Saving…' : 'Mark step complete'}
                            </button>
                            {step.step_key === 'EVC_VISIT' && <p className="text-xs text-[#5E5D57]">The EVC visit must first be marked Completed on the EVC Scheduling page.</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
