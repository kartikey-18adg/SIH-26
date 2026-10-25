'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { AppShell } from '../../components/AppShell';
import { fetchComplianceQueueApi, getComplianceExportCsvUrl } from '../../services/api';

export default function CompliancePage() {
  const { summary, activeMode, openCaseByRef, setShowSettingsModal } = useWorkspace();
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const loadComplianceQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchComplianceQueueApi();
      setQueueItems(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch compliance queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplianceQueue();
  }, [activeMode]);

  const filteredItems = useMemo(() => {
    return queueItems.filter(item => {
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchSeverity = severityFilter === 'ALL' || item.severity === severityFilter;
      const matchSource = sourceFilter === 'ALL' || item.rule_source_type === sourceFilter;
      
      const term = searchTerm.toLowerCase();
      const matchSearch = (
        !term ||
        item.rule_key.toLowerCase().includes(term) ||
        item.rule_title.toLowerCase().includes(term) ||
        item.case_reference.toLowerCase().includes(term) ||
        item.institution_name.toLowerCase().includes(term) ||
        item.explanation.toLowerCase().includes(term)
      );

      return matchStatus && matchSeverity && matchSource && matchSearch;
    });
  }, [queueItems, statusFilter, severityFilter, sourceFilter, searchTerm]);

  // Metric counts
  const totalChecks = queueItems.length;
  const compliantCount = queueItems.filter(i => i.status === 'COMPLIANT').length;
  const deficienciesCount = queueItems.filter(i => ['NEEDS_REVIEW', 'NON_COMPLIANT', 'EXPIRED_EVIDENCE', 'MISSING_EVIDENCE'].includes(i.status)).length;
  const overrideCount = queueItems.filter(i => i.manual_override).length;

  return (
    <AppShell>
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#E2E0D8]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">
              Deterministic APH Compliance Queue
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2] font-tabular">
              {queueItems.length} Evaluations
            </span>
          </div>
          <p className="text-xs text-[#5E5D57] mt-0.5">
            Traceable regulatory audits evaluated against official AICTE Approval Process Handbook (2024–2027) norms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={getComplianceExportCsvUrl()}
            download
            className="px-3 py-1.5 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917] flex items-center gap-1.5"
          >
            <span>📥 Export Compliance (CSV)</span>
          </a>
          <button
            type="button"
            onClick={loadComplianceQueue}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : '⚡ Re-evaluate Queue'}
          </button>
        </div>
      </div>

      {/* Data Mode Banner Notice */}
      <div className="mb-5 p-3 rounded border text-xs flex items-center justify-between bg-[#FFFFFF] border-[#E2E0D8] shadow-xs">
        <div className="flex items-center gap-2 text-[#5E5D57]">
          <span className="font-bold text-[#1E3A8A] font-mono text-[11px] px-1.5 py-0.5 bg-[#EDF2F7] rounded">
            DATA BASELINE: {summary.active_data_mode}
          </span>
          <span className="text-xs">{summary.data_mode_notice}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          className="text-[11px] text-[#1E3A8A] hover:underline font-medium shrink-0 ml-4"
        >
          Change Mode / Configure Sources →
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5E5D57] block">Total Rules Evaluated</span>
          <span className="text-2xl font-bold font-tabular text-[#1A1917] mt-1 block">{totalChecks}</span>
          <span className="text-[11px] text-[#5E5D57]">Across active approval cases</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1C4D35] block">Compliant Norms</span>
          <span className="text-2xl font-bold font-tabular text-[#15803D] mt-1 block">{compliantCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Normative standards verified</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A1E20] block">Items Needing Review</span>
          <span className="text-2xl font-bold font-tabular text-[#8A1E20] mt-1 block">{deficienciesCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Deficiencies or missing evidence</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B21A8] block">Manual Overrides</span>
          <span className="text-2xl font-bold font-tabular text-[#6B21A8] mt-1 block">{overrideCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Preserved in audit records</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded p-4 mb-6 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1">
            {[
              { key: 'ALL', label: 'All Items' },
              { key: 'NEEDS_REVIEW', label: 'Needs Review' },
              { key: 'NON_COMPLIANT', label: 'Non Compliant' },
              { key: 'EXPIRED_EVIDENCE', label: 'Expired Evidence' },
              { key: 'MISSING_EVIDENCE', label: 'Missing Evidence' },
              { key: 'COMPLIANT', label: 'Compliant' }
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                  statusFilter === tab.key
                    ? 'bg-[#1A1917] text-white border-[#1A1917]'
                    : 'bg-[#FFFFFF] text-[#5E5D57] border-[#C6C4BA] hover:bg-[#F2F1EC]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <input
            type="text"
            placeholder="Search rule, case ref, institution..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2.5 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[#1A1917] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] w-64"
          />
        </div>

        {/* Secondary Filter Row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#F2F1EC] text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#5E5D57]">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2 py-0.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#5E5D57]">Rule Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-2 py-0.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
            >
              <option value="ALL">All Sources</option>
              <option value="OFFICIAL_APH_2024_27">Official APH 2024–27</option>
              <option value="ILLUSTRATIVE_DEMO">Illustrative Demo Rules</option>
            </select>
          </div>

          <span className="text-[11px] text-[#89877E] ml-auto">
            Showing {filteredItems.length} of {queueItems.length} compliance checks
          </span>
        </div>
      </div>

      {/* Compliance Queue Items List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#5E5D57] bg-[#FFFFFF] border border-[#E2E0D8] rounded">
            Loading compliance queue items...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-[#8A1E20] bg-[#FDF0F0] border border-[#F0C4C4] rounded">
            {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center bg-[#FFFFFF] border border-[#E2E0D8] rounded text-[#5E5D57]">
            <p className="font-semibold text-xs text-[#1A1917]">No compliance items matching current filters.</p>
            <p className="text-[11px] mt-1">Try resetting the status or search filter above.</p>
          </div>
        ) : (
          filteredItems.map(item => {
            const statusStyle: Record<string, string> = {
              'COMPLIANT': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]',
              'NEEDS_REVIEW': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
              'NON_COMPLIANT': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
              'MISSING_EVIDENCE': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
              'EXPIRED_EVIDENCE': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
              'NOT_APPLICABLE': 'bg-[#F4F4F1] text-[#5E5D57] border-[#C6C4BA]'
            };
            const badgeStyle = statusStyle[item.status] || 'bg-gray-100 text-gray-800';
            const isOfficial = item.rule_source_type === 'OFFICIAL_APH_2024_27';

            return (
              <div key={item.id} className="border border-[#E2E0D8] rounded p-4 bg-[#FFFFFF] shadow-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <button
                        type="button"
                        onClick={() => openCaseByRef(item.case_reference)}
                        className="text-xs font-mono font-bold text-[#1E3A8A] hover:underline"
                        title="Click to inspect case details"
                      >
                        [{item.case_reference}]
                      </button>
                      <span className="text-xs font-semibold text-[#1A1917]">
                        {item.institution_name}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.2 border rounded ${badgeStyle}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${
                        isOfficial ? 'bg-[#EAF0F6] text-[#1E3A8A] border-[#CAD6E2]' : 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]'
                      }`}>
                        {isOfficial ? 'OFFICIAL APH 2024–27' : 'ILLUSTRATIVE DEMO'}
                      </span>
                      {item.manual_override && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-[#F3E8FF] text-[#6B21A8] border border-[#D8B4FE] rounded">
                          MANUAL OVERRIDE
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-[#1A1917] mt-1">
                      {item.rule_key}: {item.rule_title}
                    </h4>

                    {item.official_source_title && (
                      <div className="text-[10px] text-[#5E5D57] font-mono mt-0.5">
                        <strong>Regulatory Citation:</strong> {item.official_source_title} {item.official_section_ref ? `(${item.official_section_ref})` : ''}
                      </div>
                    )}

                    <p className="text-[11px] text-[#1A1917] mt-2 bg-[#FAF9F5] p-2.5 border border-[#E2E0D8] rounded leading-relaxed">
                      <strong>Deterministic Finding:</strong> {item.explanation}
                    </p>

                    {item.recommended_action && (
                      <div className="text-[11px] text-[#855304] mt-1.5">
                        <strong>Recommended Institutional Action:</strong> {item.recommended_action}
                      </div>
                    )}

                    {item.manual_override && (
                      <div className="text-[10px] text-[#6B21A8] bg-[#FAF5FF] p-2 border border-[#E9D5FF] rounded mt-2 font-mono">
                        Overridden by <strong>{item.overridden_by}</strong> | Automated calculation was: <strong>{item.original_status}</strong> | Rationale: &quot;{item.override_reason}&quot;
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 pt-1 sm:pt-0">
                    <button
                      type="button"
                      onClick={() => openCaseByRef(item.case_reference)}
                      className="px-3 py-1.5 text-xs font-semibold bg-[#1E3A8A] text-white hover:bg-[#172554] rounded transition-colors"
                    >
                      Inspect Case Compliance →
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
