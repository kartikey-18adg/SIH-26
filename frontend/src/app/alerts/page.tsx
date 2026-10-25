'use client';

import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { AppShell } from '../../components/AppShell';
import { AlertsQueue } from '../../components/AlertsQueue';

export default function AlertsPage() {
  const { summary, loadData, openCaseByRef, setShowSettingsModal } = useWorkspace();

  return (
    <AppShell>
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#E2E0D8]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">
              Alert Centre & Escalation Engine
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2] font-tabular">
              {summary.open_alerts.length} Active
            </span>
          </div>
          <p className="text-xs text-[#5E5D57] mt-0.5">
            Operational alert management for impending statutory deadlines, expiring evidence files, and escalated tasks.
          </p>
        </div>

        <div className="text-xs text-[#5E5D57]">
          High Priority: <strong className="text-[#8A1E20]">{summary.open_high_priority_alerts}</strong>
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

      {/* Full-Width Alert Queue Operations Centre */}
      <AlertsQueue
        alerts={summary.open_alerts}
        onSelectCaseRef={openCaseByRef}
        onRefreshData={loadData}
      />
    </AppShell>
  );
}
