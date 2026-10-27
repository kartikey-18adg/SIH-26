'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchTasksApi } from '../../services/api';

type GanttTask = {
  id: string;
  title: string;
  description?: string | null;
  assignee_name?: string;
  priority?: string;
  status?: string;
  due_date: string;
  created_at?: string;
  case_reference?: string;
  institution_name?: string;
  is_overdue?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PRIORITY_CLASS: Record<string, string> = {
  LOW: 'bg-[#7BAA91]',
  MEDIUM: 'bg-[#6F91D5]',
  HIGH: 'bg-[#D6A34D]',
  CRITICAL: 'bg-[#C75B5B]',
};
const STATUS_LABEL: Record<string, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function dayStart(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateLabel(value: string | Date, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString([], options);
}

function monthKey(value: string) {
  const date = new Date(value + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? 'unknown' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  if (key === 'unknown') return 'Unscheduled';
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
}

export function AuditAnalyticsPanel() {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [collapsedMonths, setCollapsedMonths] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetchTasksApi()
      .then((result: GanttTask[]) => { if (active) setTasks(Array.isArray(result) ? result : []); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Unable to load task deadlines.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const scheduledTasks = useMemo(() => tasks
    .filter(task => task.due_date && !['CANCELLED'].includes((task.status || '').toUpperCase()))
    .map(task => {
      const due = dayStart(task.due_date + (task.due_date.length === 10 ? 'T12:00:00' : ''));
      const start = task.created_at ? dayStart(task.created_at) : due;
      return { ...task, start: start > due ? due : start, end: due, dueMonth: monthKey(task.due_date) };
    })
    .sort((a, b) => a.dueMonth.localeCompare(b.dueMonth) || a.end.getTime() - b.end.getTime()), [tasks]);

  const range = useMemo(() => {
    if (!scheduledTasks.length) {
      const today = dayStart(new Date());
      return { start: new Date(today.getTime() - 7 * DAY_MS), end: new Date(today.getTime() + 21 * DAY_MS) };
    }
    const min = Math.min(...scheduledTasks.map(task => task.start.getTime()));
    const max = Math.max(...scheduledTasks.map(task => task.end.getTime()));
    const start = new Date(min);
    const end = new Date(max);
    start.setDate(start.getDate() - 3);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [scheduledTasks]);

  const totalDays = Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS) + 1);
  const todayOffset = Math.round((dayStart(new Date()).getTime() - range.start.getTime()) / DAY_MS);
  const monthGroups = useMemo(() => {
    const groups = new Map<string, typeof scheduledTasks>();
    scheduledTasks.forEach(task => groups.set(task.dueMonth, [...(groups.get(task.dueMonth) || []), task]));
    return Array.from(groups.entries());
  }, [scheduledTasks]);
  const overdueCount = scheduledTasks.filter(task => task.end < dayStart(new Date()) && task.status !== 'COMPLETED').length;
  const activeCount = scheduledTasks.filter(task => !['COMPLETED', 'CANCELLED'].includes((task.status || '').toUpperCase())).length;

  return (
    <section className="space-y-3" aria-label="Task deadline Gantt chart">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#1A1917]">Deadline Gantt chart</h2>
          <p className="mt-1 text-[11px] text-[#77756C]">Task schedules from creation date through due date, grouped by deadline month.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="rounded border border-[#E2E0D8] bg-white px-2 py-1"><strong className="font-mono text-[#1A1917]">{scheduledTasks.length}</strong> scheduled</span>
          <span className="rounded border border-[#E2E0D8] bg-white px-2 py-1"><strong className="font-mono text-[#1A1917]">{activeCount}</strong> active</span>
          <span className="rounded border border-[#F0C4C4] bg-[#FDF0F0] px-2 py-1 text-[#8A1E20]"><strong className="font-mono">{overdueCount}</strong> overdue</span>
        </div>
      </div>

      {loading && <div className="rounded border border-[#E2E0D8] bg-white p-5 text-xs text-[#5E5D57]">Loading task schedules…</div>}
      {error && <div role="status" className="rounded border border-[#E2E0D8] bg-white p-4 text-xs text-[#77756C]">Deadline schedule unavailable: {error}</div>}

      {!loading && !error && scheduledTasks.length === 0 && (
        <div className="rounded border border-[#E2E0D8] bg-white p-8 text-center">
          <p className="text-sm font-semibold text-[#1A1917]">No scheduled tasks yet</p>
          <p className="mt-1 text-xs text-[#77756C]">Tasks with due dates will appear here as a timeline.</p>
        </div>
      )}

      {!loading && !error && scheduledTasks.length > 0 && (
        <div className="overflow-hidden rounded border border-[#E2E0D8] bg-white">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E2E0D8] bg-[#F7F7F5] px-4 py-3 text-[10px] text-[#5E5D57]">
            <span className="font-semibold uppercase tracking-wider text-[#77756C]">Priority</span>
            {Object.entries(PRIORITY_CLASS).map(([priority, color]) => <span key={priority} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{priority}</span>)}
            <span className="ml-auto inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#8A1E20]" />Today</span>
          </div>

          <div className="divide-y divide-[#E2E0D8]">
            {monthGroups.map(([month, group]) => (
              <div key={month}>
                <button type="button" onClick={() => setCollapsedMonths(current => current.includes(month) ? current.filter(item => item !== month) : [...current, month])} aria-expanded={!collapsedMonths.includes(month)} className="flex w-full items-center justify-between bg-[#FBFBF9] px-4 py-3 text-left hover:bg-[#F2F1EC]">
                  <span className="flex items-center gap-2 text-xs font-bold text-[#1A1917]"><span className="text-[#77756C]">{collapsedMonths.includes(month) ? '▸' : '▾'}</span>{monthLabel(month)}<span className="rounded border border-[#E2E0D8] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#77756C]">{group.length} task{group.length === 1 ? '' : 's'}</span></span>
                  <span className="text-[10px] text-[#77756C]">Grouped by due date</span>
                </button>

                {!collapsedMonths.includes(month) && (
                  <div className="overflow-x-auto">
                    <div className="min-w-[780px]">
                      <div className="grid grid-cols-[250px_minmax(0,1fr)] border-b border-[#E2E0D8] bg-white">
                        <div className="px-4 py-2 text-[9px] font-semibold uppercase tracking-wider text-[#77756C]">Task / owner</div>
                        <div className="relative px-2 py-2">
                          <div className="flex justify-between text-[9px] text-[#77756C]">
                            {Array.from({ length: 6 }, (_, i) => {
                              const offset = Math.round((totalDays - 1) * i / 5);
                              const date = new Date(range.start.getTime() + offset * DAY_MS);
                              return <span key={i}>{dateLabel(date)}</span>;
                            })}
                          </div>
                        </div>
                      </div>
                      {group.map(task => {
                        const left = Math.max(0, (task.start.getTime() - range.start.getTime()) / DAY_MS / totalDays * 100);
                        const width = Math.max(1.2, ((task.end.getTime() - task.start.getTime()) / DAY_MS + 1) / totalDays * 100);
                        const isOverdue = task.end < dayStart(new Date()) && task.status !== 'COMPLETED';
                        const status = (task.status || 'TODO').toUpperCase();
                        return (
                          <div key={task.id} className="grid grid-cols-[250px_minmax(0,1fr)] border-b border-[#F0EFE9] last:border-b-0 hover:bg-[#FBFBF9]">
                            <div className="min-w-0 px-4 py-3">
                              <p className="truncate text-[11px] font-semibold text-[#1A1917]" title={task.title}>{task.title}</p>
                              <p className="mt-1 truncate text-[10px] text-[#77756C]" title={task.assignee_name}>{task.assignee_name || 'Unassigned'}{task.case_reference ? ` · ${task.case_reference}` : ''}</p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${isOverdue ? 'bg-[#FDF0F0] text-[#8A1E20]' : 'bg-[#F0EFE9] text-[#5E5D57]'}`}>{isOverdue ? 'OVERDUE' : (STATUS_LABEL[status] || status.replaceAll('_', ' '))}</span>
                                <span className="text-[9px] text-[#77756C]">Due {dateLabel(task.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            </div>
                            <div className="relative my-2 mr-3 rounded-sm" style={{ minHeight: 54, backgroundImage: 'repeating-linear-gradient(to right, #F0EFE9 0, #F0EFE9 1px, transparent 1px, transparent calc(100% / 6))' }}>
                              {todayOffset >= 0 && todayOffset <= totalDays && <span aria-hidden="true" className="absolute bottom-0 top-0 z-10 w-px bg-[#8A1E20]" style={{ left: `${todayOffset / totalDays * 100}%` }} />}
                              <div title={`${task.title}: ${dateLabel(task.start)} – ${dateLabel(task.end)}`} className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-sm shadow-sm ${PRIORITY_CLASS[(task.priority || 'MEDIUM').toUpperCase()] || PRIORITY_CLASS.MEDIUM} `} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, opacity: status === 'COMPLETED' ? 0.55 : 0.95 }} />
                              <div className="absolute bottom-1 right-1 text-[9px] text-[#77756C]">{dateLabel(task.start)} → {dateLabel(task.end)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="border-t border-[#E2E0D8] bg-[#FBFBF9] px-4 py-3 text-[10px] leading-4 text-[#77756C]">Bars span each task’s recorded creation date to due date. Tasks without a creation timestamp are shown as a one-day milestone on their due date. This is a schedule view, not an audit-event frequency chart.</p>
        </div>
      )}
    </section>
  );
}
