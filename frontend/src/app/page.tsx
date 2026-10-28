'use client';

import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { AppShell } from '../components/AppShell';
import { MetricCards } from '../components/MetricCards';
import { OperationsInsights } from '../components/OperationsInsights';
import { AlertsQueue } from '../components/AlertsQueue';
import { ActivityTimeline } from '../components/ActivityTimeline';

export default function WorkspacePage() {
  const { summary, loadData, openCaseByRef, setShowSettingsModal } = useWorkspace();

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

      {/* EVC operational overview */}
      <section className="mb-5 rounded border border-[#E2E0D8] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">EVC Operations</h2>
            <p className="mt-0.5 text-xs text-[#5E5D57]">Visit tracking for cases explicitly routed to EVC.</p>
          </div>
          <a href="/evc" className="text-xs font-semibold text-[#1E3A8A] hover:underline">Open EVC queue →</a>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded border border-[#E2E0D8] bg-[#F7F7F5] p-3"><div className="text-xs text-[#5E5D57]">Waiting to schedule</div><div className="mt-1 text-xl font-bold">{summary.evc_waiting_to_schedule ?? 0}</div></div>
          <div className="rounded border border-[#E2E0D8] bg-[#F7F7F5] p-3"><div className="text-xs text-[#5E5D57]">Scheduled visits</div><div className="mt-1 text-xl font-bold">{summary.evc_scheduled ?? 0}</div></div>
          <div className="rounded border border-red-200 bg-red-50 p-3"><div className="text-xs text-red-800">Past scheduled time</div><div className="mt-1 text-xl font-bold text-red-900">{summary.evc_overdue ?? 0}</div></div>
        </div>
      </section>

      {/* Advanced, data-driven workflow and risk analytics */}
      <OperationsInsights summary={summary} />

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
