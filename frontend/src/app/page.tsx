'use client';

import React from 'react';
import Link from 'next/link';
import { useWorkspace } from '../context/WorkspaceContext';
import { AppShell } from '../components/AppShell';
import { MetricCards } from '../components/MetricCards';
import { OperationsInsights } from '../components/OperationsInsights';
import { CasesTable } from '../components/CasesTable';
import { AlertsQueue } from '../components/AlertsQueue';
import { ActivityTimeline } from '../components/ActivityTimeline';

export default function WorkspacePage() {
  const { summary, loadData, setSelectedCase, openCaseByRef, setShowSettingsModal } = useWorkspace();

  return (
    <AppShell>
      {/* Workspace Title & Operational Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#E2E0D8]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">
            Approval & Compliance Workspace
          </h1>
          <p className="text-xs text-[#5E5D57] mt-0.5">
            Integrated monitoring of AICTE regulatory requirements, evidence vault validity, and statutory deadlines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#5E5D57]">
            Academic Cycle: <strong>2025–2026</strong> (APH 2024–27 Norms)
          </span>
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

      {/* Dynamic Metric Strip */}
      <MetricCards summary={summary} />

      {/* Advanced, data-driven workflow and risk analytics */}
      <OperationsInsights summary={summary} />

      {/* Primary Cases Table */}
      <CasesTable
        cases={summary.recent_cases}
        onSelectCase={(c) => setSelectedCase(c)}
      />

      {/* Two-Column Grid: Alerts Queue & Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <AlertsQueue
          alerts={summary.open_alerts}
          onSelectCaseRef={openCaseByRef}
          onRefreshData={loadData}
        />
        <ActivityTimeline
          activities={summary.recent_activity}
        />
      </div>
    </AppShell>
  );
}
