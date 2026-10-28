'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { AppShell } from '../../components/AppShell';
import { fetchTasksApi, createTaskApi, updateTaskStatusApi, syncTasksApi } from '../../services/api';

export default function TasksPage() {
  const { summary, activeMode, openCaseByRef, setShowSettingsModal, loadData: refreshWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Task Creation Drawer
  const [showCreateDrawer, setShowCreateDrawer] = useState<boolean>(false);
  const [newCaseId, setNewCaseId] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newAssignee, setNewAssignee] = useState<string>('');
  const [newPriority, setNewPriority] = useState<string>('HIGH');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [submittingTask, setSubmittingTask] = useState<boolean>(false);

  // Task Completion Drawer
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completionNotes, setCompletionNotes] = useState<string>('');

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      await syncTasksApi();
      const data = await fetchTasksApi();
      setTasks(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tasks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
    if (summary.recent_cases.length > 0 && !newCaseId) {
      setNewCaseId(summary.recent_cases[0].id);
    }
  }, [activeMode, summary.recent_cases]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchStatus = statusFilter === 'ALL' || t.status === statusFilter;
      const matchPriority = priorityFilter === 'ALL' || t.priority === priorityFilter;

      const term = searchTerm.toLowerCase();
      const matchSearch = (
        !term ||
        t.title.toLowerCase().includes(term) ||
        t.assignee_name.toLowerCase().includes(term) ||
        t.case_reference.toLowerCase().includes(term) ||
        t.institution_name.toLowerCase().includes(term) ||
        (t.description && t.description.toLowerCase().includes(term))
      );

      return matchStatus && matchPriority && matchSearch;
    });
  }, [tasks, statusFilter, priorityFilter, searchTerm]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseId || !newTitle || !newAssignee || !newDueDate) {
      setError('Please provide all mandatory task fields.');
      return;
    }

    setSubmittingTask(true);
    setError(null);
    try {
      await createTaskApi({
        case_id: newCaseId,
        title: newTitle,
        description: newDescription,
        assignee_name: newAssignee,
        priority: newPriority,
        due_date: newDueDate
      });
      setActionNotice(`Task "${newTitle}" assigned to ${newAssignee}.`);
      setShowCreateDrawer(false);
      setNewTitle('');
      setNewDescription('');
      setNewAssignee('');
      setNewDueDate('');
      await loadTasks();
      refreshWorkspace();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to create task.');
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleUpdateStatus = async (taskId: string, targetStatus: string, notes?: string) => {
    try {
      await updateTaskStatusApi(taskId, targetStatus, notes);
      setActionNotice(`Task status updated to ${targetStatus}.`);
      setCompletingTaskId(null);
      setCompletionNotes('');
      await loadTasks();
      refreshWorkspace();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update task.');
    }
  };

  // Metrics
  const totalTasks = tasks.length;
  const todoCount = tasks.filter(t => t.status === 'TODO').length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const overdueCount = tasks.filter(t => t.is_overdue).length;
  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

  return (
    <AppShell>
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#E2E0D8]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#1A1917]">
              Institutional Task Queue
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2] font-tabular">
              {tasks.length} Assigned
            </span>
          </div>
          <p className="text-xs text-[#5E5D57] mt-0.5">
            Operational action items, documentation milestones, and remedial tasks required for approval readiness.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreateDrawer(!showCreateDrawer)}
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors"
          >
            {showCreateDrawer ? 'Cancel' : '+ Add Action Task'}
          </button>
        </div>
      </div>

      {/* Action / Error Notices */}
      {actionNotice && (
        <div className="mb-4 px-4 py-2 bg-[#EAF5EE] border border-[#B8DFC8] rounded text-xs text-[#1C4D35] flex justify-between items-center">
          <span>✓ {actionNotice}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="font-bold">✕</button>
        </div>
      )}
      {error && (
        <div className="mb-4 px-4 py-2 bg-[#FDF0F0] border border-[#F0C4C4] rounded text-xs text-[#8A1E20] flex justify-between items-center">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold">✕</button>
        </div>
      )}

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5E5D57] block">Total Tasks</span>
          <span className="text-2xl font-bold font-tabular text-[#1A1917] mt-1 block">{totalTasks}</span>
          <span className="text-[11px] text-[#5E5D57]">Active work units</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#2B3B4C] block">To Do</span>
          <span className="text-2xl font-bold font-tabular text-[#2B3B4C] mt-1 block">{todoCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Awaiting action</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#855304] block">In Progress</span>
          <span className="text-2xl font-bold font-tabular text-[#855304] mt-1 block">{inProgressCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Under active review</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A1E20] block">Overdue</span>
          <span className={`text-2xl font-bold font-tabular mt-1 block ${overdueCount > 0 ? 'text-[#8A1E20]' : 'text-[#15803D]'}`}>
            {overdueCount}
          </span>
          <span className="text-[11px] text-[#5E5D57]">Past statutory target</span>
        </div>

        <div className="p-3.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1C4D35] block">Completed</span>
          <span className="text-2xl font-bold font-tabular text-[#15803D] mt-1 block">{completedCount}</span>
          <span className="text-[11px] text-[#5E5D57]">Finished milestones</span>
        </div>
      </div>

      {/* Task Creation Form Drawer */}
      {showCreateDrawer && (
        <form onSubmit={handleCreateTask} className="mb-6 p-4 bg-[#F8FAFC] border border-[#CAD6E2] rounded shadow-xs space-y-3">
          <h4 className="font-bold text-xs text-[#1E3A8A]">Assign New Corrective Action Task</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Linked Case *</label>
              <select
                required
                value={newCaseId}
                onChange={(e) => setNewCaseId(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF]"
              >
                {summary.recent_cases.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.case_reference} - {c.institution_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Task Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Upload updated Assistant Professor joining report"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Assignee Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Dr. V. Sharma (Dean Academics)"
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Priority *</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF]"
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Due Date *</label>
              <input
                type="date"
                required
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] font-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Description / Statutory Instructions</label>
            <textarea
              rows={2}
              placeholder="Provide exact instructions regarding municipal seals, APH ratios, or documentation requirements..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowCreateDrawer(false)}
              className="px-3 py-1 text-xs border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingTask}
              className="px-3.5 py-1 text-xs font-bold bg-[#1E3A8A] text-white hover:bg-[#172554] rounded disabled:opacity-50"
            >
              {submittingTask ? 'Creating Task...' : 'Commit Task to Queue'}
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded p-4 mb-6 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1">
          {[
            { key: 'ALL', label: 'All Tasks' },
            { key: 'TODO', label: 'To Do' },
            { key: 'IN_PROGRESS', label: 'In Progress' },
            { key: 'COMPLETED', label: 'Completed' }
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

        <div className="flex items-center gap-2">
          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF]"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Search task, assignee, case..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2.5 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[#1A1917] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] w-60"
          />
        </div>
      </div>

      {/* Task Queue List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-xs text-[#5E5D57] bg-[#FFFFFF] border border-[#E2E0D8] rounded">
            Loading tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-12 text-center bg-[#FFFFFF] border border-[#E2E0D8] rounded text-[#5E5D57]">
            <p className="font-semibold text-xs text-[#1A1917]">No tasks found matching current filters.</p>
            <p className="text-[11px] mt-1">Click &quot;+ Add Action Task&quot; above to assign a new task.</p>
          </div>
        ) : (
          filteredTasks.map(t => {
            const isDone = t.status === 'COMPLETED';
            const priorityStyle: Record<string, string> = {
              'CRITICAL': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
              'HIGH': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
              'MEDIUM': 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]',
              'LOW': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]'
            };
            const pBadge = priorityStyle[t.priority] || 'bg-gray-100 text-gray-800';

            return (
              <div 
                key={t.id} 
                className={`border border-[#E2E0D8] rounded p-4 bg-[#FFFFFF] shadow-xs space-y-2 ${
                  isDone ? 'opacity-65 bg-[#FAF9F5]' : ''
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${pBadge}`}>
                        {t.priority}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${
                        isDone ? 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]' : 'bg-[#FAF9F5] text-[#5E5D57] border-[#C6C4BA]'
                      }`}>
                        {t.status}
                      </span>
                      {t.is_overdue && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 bg-[#FDF0F0] text-[#8A1E20] border border-[#F0C4C4] rounded">
                          OVERDUE ({Math.abs(t.days_remaining)} DAYS PAST)
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openCaseByRef(t.case_reference)}
                        className="text-xs font-mono font-bold text-[#1E3A8A] hover:underline"
                        title="Click to inspect case details"
                      >
                        [{t.case_reference}]
                      </button>
                      <span className="text-xs text-[#5E5D57]">
                        {t.institution_name}
                      </span>
                    </div>

                    <h4 className={`text-xs font-bold text-[#1A1917] ${isDone ? 'line-through text-[#5E5D57]' : ''}`}>
                      {t.title}
                    </h4>

                    {t.description && (
                      <p className="text-[11px] text-[#5E5D57] mt-1 leading-relaxed">
                        {t.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#5E5D57] mt-2 pt-2 border-t border-[#F2F1EC]">
                      <span>Assignee: <strong className="text-[#1A1917]">{t.assignee_name}</strong></span>
                      <span>•</span>
                      <span>Due Date: <strong className="font-tabular text-[#1A1917]">{t.due_date}</strong></span>
                      <span>•</span>
                      <span>Created By: {t.created_by}</span>
                      {t.completion_notes && (
                        <span className="font-mono text-[#1C4D35] italic">
                          Notes: &quot;{t.completion_notes}&quot;
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  {!isDone && (
                    <div className="flex items-center gap-1.5 shrink-0 pt-1 sm:pt-0">
                      {t.status === 'TODO' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(t.id, 'IN_PROGRESS')}
                          className="px-2.5 py-1 text-[11px] font-semibold border border-[#CAD6E2] bg-[#EAF0F6] text-[#1E3A8A] hover:bg-[#D5E3F0] rounded"
                        >
                          Start Task
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCompletingTaskId(completingTaskId === t.id ? null : t.id);
                          setCompletionNotes('');
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold bg-[#15803D] text-white hover:bg-[#166534] rounded transition-colors"
                      >
                        ✓ Mark Complete
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Complete Notes Drawer */}
                {completingTaskId === t.id && (
                  <div className="mt-2.5 p-3 bg-[#F0FDF4] border border-[#B8DFC8] rounded space-y-2 text-xs">
                    <h5 className="font-bold text-[11px] text-[#166534]">Confirm Task Completion</h5>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#1A1917] mb-0.5">Completion Notes / Remediation Summary</label>
                      <input
                        type="text"
                        placeholder="e.g. Appointment orders uploaded and verified with institutional seal."
                        value={completionNotes}
                        onChange={(e) => setCompletionNotes(e.target.value)}
                        className="w-full px-2 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setCompletingTaskId(null)}
                        className="px-2.5 py-0.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[10px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(t.id, 'COMPLETED', completionNotes || 'Marked as completed by coordinator')}
                        className="px-3 py-0.5 bg-[#15803D] text-white font-bold rounded text-[10px] hover:bg-[#166534]"
                      >
                        Confirm Completed
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
