'use client';

import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { AppShell } from '../../components/AppShell';
import { CasesTable } from '../../components/CasesTable';
import { getCasesExportCsvUrl } from '../../services/api';

export default function CasesPage() {
  const { summary, setSelectedCase, setShowCreateCaseModal, setShowSettingsModal } = useWorkspace();

  return (
    <AppShell>
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#E2E0D8]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">
              Approval Workflow Cases
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2] font-tabular">
              {summary.recent_cases.length} Total
            </span>
          </div>
          <p className="text-xs text-[#5E5D57] mt-0.5">
            Active institutional approval cases with multi-column filtering, state machine stages, and evidence records.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={getCasesExportCsvUrl()}
            download
            className="px-3 py-1.5 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917] flex items-center gap-1.5"
          >
            <span>📥 Export Cases (CSV)</span>
          </a>
          <button
            type="button"
            onClick={() => setShowCreateCaseModal(true)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors"
          >
            + Create Approval Case
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

      {/* Primary Cases Table */}
      <CasesTable
        cases={summary.recent_cases}
        onSelectCase={(c) => setSelectedCase(c)}
      />
    </AppShell>
  );
}
