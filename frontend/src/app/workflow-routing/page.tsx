'use client';

import React, { useEffect, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import {
  ApprovalPathway,
  WorkflowRoutingPolicy,
  fetchWorkflowRoutingPolicyApi,
  saveWorkflowRoutingPolicyApi,
} from '../../services/api';

const PATHWAYS: { value: ApprovalPathway; label: string; description: string }[] = [
  { value: 'SCRUTINY_ONLY', label: 'Scrutiny only', description: 'Internal document/compliance scrutiny; no EVC visit in this configured pathway.' },
  { value: 'SCRUTINY_EVC', label: 'Scrutiny + EVC', description: 'Internal scrutiny followed by a manually scheduled EVC visit.' },
  { value: 'EVC_SAC_SHC', label: 'EVC + SAC/SHC', description: 'EVC visit with SAC/SHC stages recorded as part of the local workflow.' },
  { value: 'EVC_ONLY', label: 'EVC only', description: 'EVC visit is the only review stage configured in this local pathway.' },
];

export default function WorkflowRoutingPage() {
  const [policy, setPolicy] = useState<WorkflowRoutingPolicy | null>(null);
  const [pathway, setPathway] = useState<ApprovalPathway>('SCRUTINY_ONLY');
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    fetchWorkflowRoutingPolicyApi()
      .then((data) => {
        setPolicy(data);
        setPathway(data.pathway);
        setRationale(data.rationale || '');
      })
      .catch((e: any) => setError(e.message || 'Could not load pathway configuration.'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveWorkflowRoutingPolicyApi(pathway, rationale.trim());
      setPolicy(saved);
      setNotice('Approval pathway saved. The change was added to the audit trail.');
    } catch (e: any) {
      setError(e.message || 'Could not save pathway configuration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="border-b border-[#E2E0D8] pb-4">
          <h1 className="text-xl font-bold text-[#1A1917]">Approval Pathway Configuration</h1>
          <p className="text-sm text-[#5E5D57] mt-1">Record the review pathway your workspace intends to use. Changes are audited.</p>
        </div>

        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Important:</strong> These are configurable workflow options, not a statement of official AICTE requirements.
          Verify the applicable current Approval Process Handbook and institutional instructions before selecting or relying on a pathway.
        </div>

        {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}

        <section className="rounded border border-[#E2E0D8] bg-white p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-[#1A1917]">Select a pathway</h2>
            <p className="text-xs text-[#5E5D57] mt-1">Choose the intended pathway for this workspace.</p>
          </div>

          {loading ? <p className="text-sm text-[#5E5D57]">Loading configuration…</p> : (
            <div className="space-y-3">
              {PATHWAYS.map((item) => (
                <label key={item.value} className={`flex gap-3 rounded border p-3 cursor-pointer ${pathway === item.value ? 'border-[#1E3A8A] bg-[#F3F6FC]' : 'border-[#E2E0D8]'}`}>
                  <input type="radio" name="pathway" value={item.value} checked={pathway === item.value} onChange={() => setPathway(item.value)} className="mt-1" />
                  <span>
                    <span className="block text-sm font-semibold text-[#1A1917]">{item.label}</span>
                    <span className="block text-xs text-[#5E5D57] mt-1">{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="rationale" className="block text-sm font-semibold text-[#1A1917] mb-1">Policy / workflow basis</label>
            <textarea id="rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} rows={4} maxLength={2000}
              placeholder="Record the applicable internal policy, verified APH reference, or reason for this local configuration."
              className="w-full rounded border border-[#C6C4BA] p-3 text-sm outline-none focus:border-[#1E3A8A]" />
            <p className="text-xs text-[#5E5D57] mt-1">Minimum 8 characters. Do not mark a rule as verified unless you have checked the official source.</p>
          </div>

          <button type="button" onClick={save} disabled={loading || saving || rationale.trim().length < 8}
            className="rounded bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save pathway configuration'}
          </button>
        </section>

        <section className="rounded border border-[#E2E0D8] bg-white p-4 text-sm">
          <h2 className="font-semibold text-[#1A1917]">Current saved configuration</h2>
          {policy?.configured ? (
            <p className="mt-2 text-[#5E5D57]">
              <strong>{PATHWAYS.find((p) => p.value === policy.pathway)?.label || policy.pathway}</strong>
              {' '} · Updated by {policy.updated_by || 'unknown'}{policy.updated_at ? ` on ${new Date(policy.updated_at).toLocaleString()}` : ''}.
            </p>
          ) : <p className="mt-2 text-[#5E5D57]">No saved configuration yet. The displayed default is not saved until you submit it.</p>}
          <p className="mt-2 text-xs text-[#5E5D57]">This feature records the configured pathway. It does not submit anything to AICTE or independently validate regulatory applicability.</p>
        </section>
      </div>
    </AppShell>
  );
}
