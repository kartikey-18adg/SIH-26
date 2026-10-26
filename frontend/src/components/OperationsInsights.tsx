'use client';

import React, { useMemo, useState } from 'react';
import { DashboardSummary } from '../types/aiclear';

interface Props { summary: DashboardSummary; }

const priorityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const priorityStyle: Record<string, { bar: string; text: string; bg: string }> = {
  CRITICAL: { bar: 'bg-rose-600', text: 'text-rose-700', bg: 'bg-rose-50' },
  HIGH: { bar: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50' },
  MEDIUM: { bar: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50' },
  LOW: { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
};

export const OperationsInsights: React.FC<Props> = ({ summary }) => {
  const [view, setView] = useState<'stage' | 'risk'>('stage');
  const stageRows = useMemo(
    () => [...summary.stage_breakdown].sort((a, b) => b.count - a.count),
    [summary.stage_breakdown]
  );
  const priorities = useMemo(() => priorityOrder.map((key) => ({
    key,
    count: summary.recent_cases.filter((item) => item.priority.toUpperCase() === key).length,
  })), [summary.recent_cases]);
  const totalPriority = priorities.reduce((sum, item) => sum + item.count, 0);
  const maxStage = Math.max(1, ...stageRows.map((item) => item.count));
  const attentionCount = summary.cases_requiring_action + summary.overdue_tasks + summary.open_high_priority_alerts;
  const modeLabel = summary.active_data_mode === 'DEMO' ? 'DEMO DATA' : summary.active_data_mode + ' DATA';

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-slate-950 px-5 py-5 text-white sm:px-6">
        <div className="pointer-events-none absolute -right-8 -top-20 h-48 w-48 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="pointer-events-none absolute right-24 top-8 h-24 w-24 rounded-full bg-indigo-400/20 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" />
              Operations intelligence
            </div>
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Workflow & risk observatory</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
              Live distribution from the active workspace. Use this view to spot workflow bottlenecks and review priority exposure.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold tracking-wide text-slate-100">{modeLabel}</span>
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-semibold text-cyan-200">{summary.total_active_cases} active cases</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 lg:grid-cols-[1.35fr_0.85fr] lg:divide-x lg:divide-y-0">
        <div className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Case distribution</h3>
              <p className="mt-1 text-[11px] text-slate-500">Where cases currently sit in the approval workflow</p>
            </div>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setView('stage')} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${view === 'stage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Workflow</button>
              <button onClick={() => setView('risk')} className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${view === 'risk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>Priority</button>
            </div>
          </div>

          {view === 'stage' ? (
            <div className="space-y-4">
              {stageRows.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">No workflow-stage data is available in this workspace yet.</p>}
              {stageRows.map((item, index) => (
                <div key={item.stage_key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-medium text-slate-700">{item.stage_label}</span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-slate-900">{item.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 transition-all duration-700" style={{ width: `${(item.count / maxStage) * 100}%`, opacity: 1 - index * 0.04 }} />
                  </div>
                </div>
              ))}
              <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-500">
                <span className="h-2 w-2 rounded-full bg-cyan-500" /> Bar length is relative to the most populated stage
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
                {priorities.map((item) => item.count > 0 && <div key={item.key} className={priorityStyle[item.key].bar} style={{ width: `${totalPriority ? item.count / totalPriority * 100 : 0}%` }} title={`${item.key}: ${item.count}`} />)}
              </div>
              {priorities.map((item) => (
                <div key={item.key} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-sm ${priorityStyle[item.key].bar}`} />
                    <span className="text-xs font-medium text-slate-700">{item.key}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 sm:block">
                      <div className={`h-full rounded-full ${priorityStyle[item.key].bar}`} style={{ width: `${totalPriority ? item.count / totalPriority * 100 : 0}%` }} />
                    </div>
                    <span className="w-6 text-right font-mono text-xs font-semibold text-slate-900">{item.count}</span>
                  </div>
                </div>
              ))}
              <p className="border-t border-slate-100 pt-4 text-[10px] text-slate-500">Priority totals use the case records returned by the active workspace.</p>
            </div>
          )}
        </div>

        <div className="bg-slate-50/70 p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Operational signals</h3>
            <p className="mt-1 text-[11px] text-slate-500">Live indicators for the next review decision</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-rose-100 bg-white p-4 shadow-sm shadow-rose-950/[0.02]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">!</div>
              <div className="text-2xl font-bold tracking-tight text-slate-950">{summary.open_high_priority_alerts}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">High-risk alerts</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-white p-4 shadow-sm shadow-amber-950/[0.02]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">↗</div>
              <div className="text-2xl font-bold tracking-tight text-slate-950">{summary.cases_requiring_action}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Need action</div>
            </div>
            <div className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm shadow-orange-950/[0.02]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-700">◷</div>
              <div className="text-2xl font-bold tracking-tight text-slate-950">{summary.overdue_tasks}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Overdue tasks</div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white p-4 shadow-sm shadow-sky-950/[0.02]">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">⌁</div>
              <div className="text-2xl font-bold tracking-tight text-slate-950">{summary.upcoming_deadlines_count}</div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Due in 14 days</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">Attention index</span>
              <span className={`font-mono text-sm font-bold ${attentionCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{attentionCount}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${attentionCount > 0 ? 'bg-gradient-to-r from-amber-400 to-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, attentionCount / Math.max(1, summary.total_active_cases + 5) * 100)}%` }} />
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">Combined count of action-required cases, overdue tasks, and high-priority alerts; indicators can overlap.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
