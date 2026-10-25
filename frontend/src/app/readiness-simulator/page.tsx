'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { fetchCases, fetchCaseCompliance } from '../../services/api';

type CaseItem = {
  id: string;
  case_reference: string;
  institution_name: string;
  current_stage: string;
  target_date: string;
  status: string;
};

type ComplianceItem = {
  id: string;
  rule_key: string;
  rule_title: string;
  status: string;
  severity: string;
  explanation: string;
  recommended_action?: string | null;
  requires_human_review: boolean;
  manual_override: boolean;
  official_source_title?: string | null;
  official_section_ref?: string | null;
};

const NEEDS_ATTENTION = new Set([
  'NEEDS_REVIEW',
  'NON_COMPLIANT',
  'MISSING_EVIDENCE',
  'EXPIRED_EVIDENCE',
  'UNABLE_TO_DETERMINE',
]);

const STATUS_LABELS: Record<string, string> = {
  COMPLIANT: 'Compliant',
  NEEDS_REVIEW: 'Needs review',
  NON_COMPLIANT: 'Non-compliant',
  MISSING_EVIDENCE: 'Missing evidence',
  EXPIRED_EVIDENCE: 'Expired evidence',
  UNABLE_TO_DETERMINE: 'Unable to determine',
  NOT_APPLICABLE: 'Not applicable',
};

function readinessScore(items: ComplianceItem[], assumedResolved: Set<string>) {
  const applicable = items.filter((item) => item.status !== 'NOT_APPLICABLE');
  if (!applicable.length) return 0;
  const passed = applicable.filter(
    (item) => item.status === 'COMPLIANT' || assumedResolved.has(item.id),
  ).length;
  return Math.round((passed / applicable.length) * 100);
}

function formatStage(stage?: string) {
  return (stage || 'Unknown').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ReadinessSimulatorPage() {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [results, setResults] = useState<ComplianceItem[]>([]);
  const [assumedResolved, setAssumedResolved] = useState<Set<string>>(new Set());
  const [loadingCases, setLoadingCases] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingCases(true);
    fetchCases()
      .then((data: CaseItem[]) => {
        if (cancelled) return;
        setCases(data);
        setSelectedCaseId((current) => current || data[0]?.id || '');
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || 'Could not load cases.');
      })
      .finally(() => {
        if (!cancelled) setLoadingCases(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setResults([]);
      setAssumedResolved(new Set());
      return;
    }
    let cancelled = false;
    setLoadingResults(true);
    setError('');
    setAssumedResolved(new Set());
    fetchCaseCompliance(selectedCaseId)
      .then((data: ComplianceItem[]) => {
        if (!cancelled) setResults(data);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setResults([]);
          setError(err.message || 'Could not load compliance results for this case.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingResults(false);
      });
    return () => { cancelled = true; };
  }, [selectedCaseId]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId);
  const beforeScore = useMemo(() => readinessScore(results, new Set()), [results]);
  const afterScore = useMemo(() => readinessScore(results, assumedResolved), [results, assumedResolved]);
  const unresolved = results.filter((item) => NEEDS_ATTENTION.has(item.status) && !assumedResolved.has(item.id));
  const simulatedFixes = results.filter((item) => assumedResolved.has(item.id));
  const eligibleFindings = results.filter((item) => NEEDS_ATTENTION.has(item.status));
  const scoreDelta = afterScore - beforeScore;

  const toggleAssumption = (id: string) => {
    setAssumedResolved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppShell>
      <div className="mb-5 flex flex-col gap-3 border-b border-[#E2E0D8] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">Approval Readiness Simulator</h1>
            <span className="border border-[#EBD9A4] bg-[#FDF6E4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#855304]">Scenario only</span>
          </div>
          <p className="max-w-3xl text-xs leading-5 text-[#5E5D57]">
            Explore how a case could look if selected findings were resolved. This is a non-persistent what-if scenario, not a compliance re-evaluation or approval decision.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAssumedResolved(new Set())}
          disabled={assumedResolved.size === 0}
          className="rounded border border-[#C6C4BA] bg-white px-3 py-2 text-xs font-semibold text-[#1A1917] hover:bg-[#F2F1EC] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset scenario
        </button>
      </div>

      <div className="mb-5 border border-[#E2E0D8] bg-white p-4">
        <label htmlFor="sim-case" className="mb-1 block text-xs font-bold text-[#1A1917]">Approval case</label>
        <select
          id="sim-case"
          value={selectedCaseId}
          onChange={(event) => setSelectedCaseId(event.target.value)}
          disabled={loadingCases || cases.length === 0}
          className="w-full max-w-2xl rounded border border-[#C6C4BA] bg-white px-3 py-2 text-sm text-[#1A1917] outline-none focus:border-[#1E3A8A]"
        >
          {loadingCases && <option value="">Loading cases…</option>}
          {!loadingCases && cases.length === 0 && <option value="">No cases found in the active data mode</option>}
          {cases.map((item) => (
            <option key={item.id} value={item.id}>{item.case_reference} — {item.institution_name}</option>
          ))}
        </select>
        {selectedCase && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#5E5D57]">
            <span>Stage: <strong className="text-[#1A1917]">{formatStage(selectedCase.current_stage)}</strong></span>
            <span>Target date: <strong className="text-[#1A1917]">{selectedCase.target_date || 'Not set'}</strong></span>
            <span>Workflow status: <strong className="text-[#1A1917]">{formatStage(selectedCase.status)}</strong></span>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 border border-[#F0C4C4] bg-[#FDF0F0] p-3 text-xs text-[#8A1E20]">{error}</div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="border border-[#E2E0D8] bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5E5D57]">Current readiness</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-[#1A1917]">{loadingResults ? '—' : `${beforeScore}%`}</div>
          <div className="mt-1 text-[11px] text-[#5E5D57]">Based on current saved check statuses</div>
        </div>
        <div className="border border-[#E2E0D8] bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5E5D57]">Scenario readiness</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-[#1E3A8A]">{loadingResults ? '—' : `${afterScore}%`}</div>
          <div className="mt-1 text-[11px] text-[#5E5D57]">
            {scoreDelta > 0 ? `+${scoreDelta} percentage points in this scenario` : 'No assumed improvement'}
          </div>
        </div>
        <div className="border border-[#E2E0D8] bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#5E5D57]">Open findings</div>
          <div className="mt-1 text-3xl font-bold tabular-nums text-[#8A1E20]">{loadingResults ? '—' : unresolved.length}</div>
          <div className="mt-1 text-[11px] text-[#5E5D57]">{simulatedFixes.length} finding(s) assumed resolved, not changed in the record</div>
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-1">
        <h2 className="text-sm font-bold text-[#1A1917]">Try a resolution scenario</h2>
        <p className="text-xs leading-5 text-[#5E5D57]">Select findings you want to assume are resolved. A selected finding counts as resolved only for this screen; AIClear does not upload evidence, modify a result, or record an override.</p>
      </div>

      {loadingResults ? (
        <div className="border border-[#E2E0D8] bg-white p-8 text-center text-sm text-[#5E5D57]">Loading compliance findings…</div>
      ) : results.length === 0 ? (
        <div className="border border-[#E2E0D8] bg-white p-8 text-center text-sm text-[#5E5D57]">No compliance results are available for this case yet. Check the case in the Compliance Queue and evaluate it with an authorized role first.</div>
      ) : eligibleFindings.length === 0 ? (
        <div className="border border-[#B8DFC8] bg-[#EAF5EE] p-4 text-sm text-[#1C4D35]">No open findings are present in the current saved results. The scenario has nothing to simulate.</div>
      ) : (
        <div className="space-y-3">
          {eligibleFindings.map((item) => {
            const selected = assumedResolved.has(item.id);
            return (
              <article key={item.id} className={`border bg-white p-4 transition-colors ${selected ? 'border-[#8BA9D8] ring-1 ring-[#DCE7F8]' : 'border-[#E2E0D8]'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] font-bold text-[#5E5D57]">{item.rule_key}</span>
                      <span className="border border-[#E2E0D8] bg-[#F7F7F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#5E5D57]">{STATUS_LABELS[item.status] || item.status}</span>
                      {item.manual_override && <span className="border border-[#D8B4FE] bg-[#FAF5FF] px-1.5 py-0.5 text-[10px] font-semibold text-[#6B21A8]">Human override exists</span>}
                    </div>
                    <h3 className="text-sm font-bold text-[#1A1917]">{item.rule_title}</h3>
                    <p className="mt-1 text-xs leading-5 text-[#5E5D57]">{item.explanation}</p>
                    {item.recommended_action && (
                      <p className="mt-2 border-l-2 border-[#CAD6E2] pl-2 text-xs leading-5 text-[#1A1917]"><strong>Suggested next step:</strong> {item.recommended_action}</p>
                    )}
                    {(item.official_source_title || item.official_section_ref) && (
                      <p className="mt-2 text-[10px] text-[#5E5D57]">Reference: {[item.official_source_title, item.official_section_ref].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAssumption(item.id)}
                    aria-pressed={selected}
                    className={`shrink-0 rounded border px-3 py-2 text-xs font-bold transition-colors ${selected ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white' : 'border-[#C6C4BA] bg-white text-[#1A1917] hover:bg-[#F2F1EC]'}`}
                  >
                    {selected ? '✓ Assumed resolved' : 'Assume resolved'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-6 border border-[#EBD9A4] bg-[#FDF6E4] p-3 text-[11px] leading-5 text-[#855304]">
        <strong>Important:</strong> The scenario score is a simple planning estimate derived from the selected assumptions and current saved check statuses. It does not verify replacement evidence, recalculate statutory rules, establish legal compliance, or mean the case is ready for submission. Confirm all changes through the normal evidence review and compliance evaluation workflow.
      </div>
    </AppShell>
  );
}
