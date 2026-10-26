'use client';

import React, { useState, useEffect } from 'react';
import { AlertSummaryItem } from '../types/aiclear';
import {
  fetchAlertsApi,
  triggerAlertScanApi,
  acknowledgeAlertApi,
  assignAlertApi,
  resolveAlertApi
} from '../services/api';
import { NotificationOutboxModal } from './NotificationOutboxModal';
import { fetchCases } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';

interface AlertsQueueProps {
  alerts: AlertSummaryItem[];
  onSelectCaseRef: (caseRef: string) => void;
  onRefreshData?: () => void;
}

export const AlertsQueue: React.FC<AlertsQueueProps> = ({
  alerts: initialAlerts,
  onSelectCaseRef,
  onRefreshData
}) => {
  const { activeRole, canPerform } = useWorkspace();
  const [alertsList, setAlertsList] = useState<AlertSummaryItem[]>(initialAlerts);
  const [casesForRiskPlot, setCasesForRiskPlot] = useState<Array<{ id: string; case_reference: string; target_date?: string | null; priority?: string; current_stage?: string; status?: string }>>([]);
  const [riskPlotError, setRiskPlotError] = useState(false);
  const [statusTab, setStatusTab] = useState<'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'ALL'>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  
  // Drawer states
  const [assigningAlertId, setAssigningAlertId] = useState<string | null>(null);
  const [assigneeName, setAssigneeName] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState('');
  
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [scanning, setScanning] = useState(false);
  const [showOutbox, setShowOutbox] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadAlerts = async () => {
    try {
      const data = await fetchAlertsApi({
        status: statusTab,
        severity: severityFilter
      });
      setAlertsList(data);
    } catch {
      // Fallback to filtering props
      let filtered = [...initialAlerts];
      if (statusTab !== 'ALL') {
        filtered = filtered.filter(a => a.status === statusTab);
      }
      if (severityFilter !== 'ALL') {
        filtered = filtered.filter(a => a.severity === severityFilter);
      }
      setAlertsList(filtered);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [statusTab, severityFilter, initialAlerts]);

  // Load cases independently from the alert list. The chart needs case target
  // dates and priorities; without this request it will remain permanently empty.
  useEffect(() => {
    let cancelled = false;
    setRiskPlotError(false);
    fetchCases()
      .then((data: any[]) => {
        if (!cancelled) setCasesForRiskPlot(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setCasesForRiskPlot([]);
          setRiskPlotError(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleScan = async () => {
    setScanning(true);
    setErrorNotice(null);
    try {
      const res = await triggerAlertScanApi();
      setActionNotice(`Escalation Scan: ${res.new_alerts_created} new alert(s), ${res.notifications_generated} notification(s) logged.`);
      await loadAlerts();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to complete escalation scan.');
    } finally {
      setScanning(false);
    }
  };

  const handleAcknowledge = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await acknowledgeAlertApi(id, undefined, activeRole);
      setActionNotice('Alert marked as Acknowledged.');
      await loadAlerts();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to acknowledge alert.');
    }
  };

  const handleCommitAssign = async (id: string) => {
    if (!assigneeName.trim()) {
      setErrorNotice('Assignee name is required.');
      return;
    }
    try {
      await assignAlertApi(id, assigneeName, assigneeEmail || undefined, activeRole);
      setActionNotice(`Alert assigned to ${assigneeName}. Simulated notification logged.`);
      setAssigningAlertId(null);
      setAssigneeName('');
      setAssigneeEmail('');
      await loadAlerts();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to assign alert.');
    }
  };

  const handleCommitResolve = async (id: string) => {
    if (!resolutionNotes.trim() || resolutionNotes.trim().length < 4) {
      setErrorNotice('Resolution notes must be at least 4 characters.');
      return;
    }
    try {
      await resolveAlertApi(id, resolutionNotes, activeRole);
      setActionNotice('Alert resolved and remediation notes committed.');
      setResolvingAlertId(null);
      setResolutionNotes('');
      await loadAlerts();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to resolve alert.');
    }
  };

  const openCount = alertsList.filter(a => a.status === 'OPEN').length;

  return (
    <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-[#E2E0D8] bg-[#F7F7F5] flex flex-wrap justify-between items-center gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">
              Alert Centre & Escalation Engine
            </h3>
            <span className="text-[10px] font-tabular font-semibold px-2 py-0.5 bg-[#EDF2F7] text-[#2B3B4C] border border-[#CAD6E2] rounded">
              {alertsList.length} In Queue
            </span>
          </div>
          <p className="text-[11px] text-[#5E5D57] mt-0.5">
            Automated monitoring of statutory deadlines, certificate expirations, and regulatory compliance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={canPerform('canScanEscalations') ? handleScan : undefined}
            disabled={scanning || !canPerform('canScanEscalations')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              canPerform('canScanEscalations')
                ? 'bg-[#1E3A8A] text-white hover:bg-[#172554] cursor-pointer'
                : 'bg-[#E2E0D8] text-[#89877E] cursor-not-allowed'
            }`}
            title={canPerform('canScanEscalations') ? undefined : "Escalation scan restricted to Compliance Officer or Administrator"}
          >
            {scanning ? 'Scanning...' : '⚡ Run Escalation Scan'}
          </button>
          <button
            type="button"
            onClick={() => setShowOutbox(true)}
            className="px-2.5 py-1 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917]"
          >
            📨 Outbox
          </button>
        </div>
      </div>

      {/* Action Notices */}
      {actionNotice && (
        <div className="px-4 py-2 bg-[#EAF5EE] border-b border-[#B8DFC8] text-[11px] text-[#1C4D35] flex justify-between items-center">
          <span>✓ {actionNotice}</span>
          <button type="button" onClick={() => setActionNotice(null)} className="font-bold">✕</button>
        </div>
      )}
      {errorNotice && (
        <div className="px-4 py-2 bg-[#FDF0F0] border-b border-[#F0C4C4] text-[11px] text-[#8A1E20] flex justify-between items-center">
          <span>⚠️ {errorNotice}</span>
          <button type="button" onClick={() => setErrorNotice(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Filter and Tab Controls */}
      <div className="px-4 py-2 border-b border-[#E2E0D8] bg-[#FBFBF9] flex flex-wrap items-center justify-between gap-2 text-xs">
        {/* Status Tabs */}
        <div className="flex gap-1">
          {(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ALL'] as const).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusTab(tab)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                statusTab === tab
                  ? 'bg-[#1A1917] text-white border-[#1A1917]'
                  : 'bg-[#FFFFFF] text-[#5E5D57] border-[#C6C4BA] hover:bg-[#F2F1EC]'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Severity Filter Pills */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#5E5D57] mr-1">Severity:</span>
          {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(sev => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-1.5 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                severityFilter === sev
                  ? 'bg-[#2B3B4C] text-white border-[#2B3B4C]'
                  : 'bg-[#FFFFFF] text-[#5E5D57] border-[#E2E0D8] hover:bg-[#F2F1EC]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Priority vs deadline scatterplot */}
      <section className="border-b border-[#E2E0D8] bg-white px-4 py-4">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">Priority vs. deadline</h4>
            <p className="mt-1 text-[11px] text-[#5E5D57]">Each dot is an alert linked to a case with a target date. This shows case priority, not a measured risk score.</p>
          </div>
          <span className="text-[10px] text-[#77756C]">Based on current case target dates</span>
        </div>
        {riskPlotError ? (
          <p className="py-4 text-center text-xs text-[#5E5D57]">Deadline data could not be loaded. The alert queue is still available below.</p>
        ) : (() => {
          const priorityLevel: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
          const severityLevel: Record<string, number> = { INFO: 1, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
          const casesByRef = new Map(casesForRiskPlot.map(item => [item.case_reference, item]));
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const points = alertsList.flatMap(alert => {
            const caseItem = alert.case_reference ? casesByRef.get(alert.case_reference) : undefined;
            if (!caseItem?.target_date || !Number.isFinite(new Date(caseItem.target_date).getTime())) return [];
            const target = new Date(caseItem.target_date);
            const days = Math.round((new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime() - today.getTime()) / 86400000);
            const priority = priorityLevel[(caseItem.priority || '').toUpperCase()];
            const severity = severityLevel[(alert.severity || '').toUpperCase()];
            return [{ alert, caseItem, days, level: priority || severity || 1, priority: Boolean(priority) }];
          });
          const minDay = Math.min(-30, ...points.map(point => point.days));
          const maxDay = Math.max(30, ...points.map(point => point.days));
          const x = (days: number) => 8 + ((days - minDay) / Math.max(1, maxDay - minDay)) * 84;
          const y = (level: number) => 88 - ((level - 1) / 3) * 76;
          return points.length === 0 ? (
            <p className="py-4 text-center text-xs text-[#5E5D57]">{casesForRiskPlot.length === 0 ? 'Loading case data or no linked cases are available.' : 'No alerts with linked cases and target dates match the current filters.'}</p>
          ) : (
            <>
              <div className="relative mt-3 h-48 rounded border border-[#E2E0D8] bg-[#FBFBF9] sm:h-56">
                {[1,2,3,4].map(level => <div key={level} className="absolute left-0 right-0 border-t border-dashed border-[#E2E0D8]" style={{ top: `${y(level)}%` }} />)}
                <div className="absolute bottom-0 left-[8%] right-[8%] border-t border-[#A8A69E]" />
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] text-[#77756C]">Priority</div>
                {points.map((point, index) => {
                  const color = point.days < 0 ? '#B42318' : point.level >= 3 ? '#C27803' : '#1E3A8A';
                  return <button key={point.alert.id} type="button" onClick={() => point.alert.case_reference && onSelectCaseRef(point.alert.case_reference)} title={`${point.alert.title} · ${point.caseItem.case_reference} · ${point.days < 0 ? `${Math.abs(point.days)} days overdue` : point.days === 0 ? 'Due today' : `${point.days} days until target date`} · ${point.priority ? `Priority: ${point.caseItem.priority}` : `Alert severity: ${point.alert.severity}`}`} aria-label={`Open case ${point.caseItem.case_reference}`} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm hover:scale-150 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#1E3A8A]" style={{ left: `${x(point.days)}%`, top: `${y(point.level)}%`, backgroundColor: color, zIndex: index + 1 }} />;
                })}
                <span className="absolute bottom-1 left-[8%] text-[9px] text-[#77756C]">{minDay}d</span>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-[#77756C]">Today</span>
                <span className="absolute bottom-1 right-[8%] text-[9px] text-[#77756C]">+{maxDay}d</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#5E5D57]">
                <div className="flex flex-wrap gap-3">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#B42318]" />Overdue</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#C27803]" />Higher priority, not overdue</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#1E3A8A]" />Upcoming</span>
                </div>
                <span>{points.length} alert(s) plotted</span>
              </div>
              {!points.some(point => point.priority) && <p className="mt-2 text-[10px] text-[#855304]">Case priority is unavailable for these records, so vertical position uses alert severity instead.</p>}
            </>
          );
        })()}
      </section>

      {/* Alerts List */}
      <div className="divide-y divide-[#E2E0D8] max-h-96 overflow-y-auto">
        {alertsList.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#5E5D57]">
            No alerts found matching current filters.
          </div>
        ) : (
          alertsList.map(a => {
            const isResolved = a.status === 'RESOLVED';
            const isAck = a.status === 'ACKNOWLEDGED';

            const severityStyle = {
              'CRITICAL': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
              'HIGH': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
              'MEDIUM': 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]',
              'LOW': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]',
              'INFO': 'bg-[#FAF9F5] text-[#5E5D57] border-[#E2E0D8]'
            }[a.severity] || 'bg-gray-100 text-gray-800';

            return (
              <div 
                key={a.id} 
                className={`p-3.5 transition-colors hover:bg-[#FBFBF9] ${
                  isResolved ? 'opacity-55 bg-[#FAF9F5]' : isAck ? 'bg-[#FCFCFA]' : 'bg-[#FFFFFF]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${severityStyle}`}>
                        {a.severity}
                      </span>
                      <span className="text-[10px] font-semibold text-[#5E5D57] font-mono">
                        {a.category}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${
                        isResolved ? 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]' :
                        isAck ? 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]' :
                        'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]'
                      }`}>
                        {a.status}
                      </span>
                      {a.case_reference && (
                        <button
                          type="button"
                          onClick={() => onSelectCaseRef(a.case_reference!)}
                          className="text-[11px] font-tabular font-bold text-[#1E3A8A] hover:underline"
                        >
                          [{a.case_reference}]
                        </button>
                      )}
                      {a.assigned_to && (
                        <span className="text-[10px] text-[#5E5D57]">
                          Assigned: <strong>{a.assigned_to}</strong>
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-semibold text-[#1A1917]">
                      {a.title}
                    </div>

                    <p className="text-[11px] text-[#5E5D57] mt-0.5 leading-relaxed">
                      {a.explanation}
                    </p>

                    {/* Resolution notes if resolved */}
                    {a.status === 'RESOLVED' && (
                      <div className="mt-1 text-[10px] text-[#1C4D35] bg-[#EAF5EE] px-2 py-1 border border-[#B8DFC8] rounded font-mono">
                        Resolution: &quot;{a.explanation || 'Remediation completed'}&quot;
                      </div>
                    )}
                  </div>

                  {/* Actions column */}
                  {!isResolved && (
                    <div className="flex flex-col sm:flex-row items-end gap-1.5 shrink-0 pt-0.5">
                      {!isAck && (
                        <button
                          type="button"
                          onClick={(e) => handleAcknowledge(a.id, e)}
                          className="text-[10px] font-semibold px-2 py-0.5 border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917]"
                        >
                          Acknowledge
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={!canPerform('canAssignAlerts')}
                        onClick={() => {
                          setAssigningAlertId(assigningAlertId === a.id ? null : a.id);
                          setResolvingAlertId(null);
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 border rounded transition-colors ${
                          canPerform('canAssignAlerts')
                            ? 'border-[#CAD6E2] bg-[#EAF0F6] text-[#1E3A8A] hover:bg-[#D5E3F0] cursor-pointer'
                            : 'border-[#E2E0D8] bg-[#F7F7F5] text-[#A8A69E] cursor-not-allowed'
                        }`}
                        title={canPerform('canAssignAlerts') ? undefined : "Alert assignment restricted to Institution Coordinator or Administrator"}
                      >
                        {assigningAlertId === a.id ? 'Cancel' : 'Assign'}
                      </button>

                      <button
                        type="button"
                        disabled={!canPerform('canResolveAlerts')}
                        onClick={() => {
                          setResolvingAlertId(resolvingAlertId === a.id ? null : a.id);
                          setAssigningAlertId(null);
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 border rounded transition-colors ${
                          canPerform('canResolveAlerts')
                            ? 'border-[#B8DFC8] bg-[#EAF5EE] text-[#1C4D35] hover:bg-[#D7EFE0] cursor-pointer'
                            : 'border-[#E2E0D8] bg-[#F7F7F5] text-[#A8A69E] cursor-not-allowed'
                        }`}
                        title={canPerform('canResolveAlerts') ? undefined : "Alert resolution restricted to Compliance Officer or Administrator"}
                      >
                        {resolvingAlertId === a.id ? 'Cancel' : 'Resolve'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Assign Drawer */}
                {assigningAlertId === a.id && (
                  <div className="mt-2.5 p-3 bg-[#F8FAFC] border border-[#CAD6E2] rounded space-y-2 text-xs">
                    <h5 className="font-bold text-[11px] text-[#1E3A8A]">Assign Alert to Institutional Staff</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-[#1A1917] mb-0.5">Assignee Name *</label>
                        <input
                          type="text"
                          placeholder="e.g. S. Patel (Safety Officer)"
                          value={assigneeName}
                          onChange={(e) => setAssigneeName(e.target.value)}
                          className="w-full px-2 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#1A1917] mb-0.5">Assignee Email (For simulated dispatch)</label>
                        <input
                          type="email"
                          placeholder="e.g. s.patel@institute.ac.in"
                          value={assigneeEmail}
                          onChange={(e) => setAssigneeEmail(e.target.value)}
                          className="w-full px-2 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setAssigningAlertId(null)}
                        className="px-2.5 py-0.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[10px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCommitAssign(a.id)}
                        className="px-3 py-0.5 bg-[#1E3A8A] text-white font-bold rounded text-[10px] hover:bg-[#172554]"
                      >
                        Commit Assignment
                      </button>
                    </div>
                  </div>
                )}

                {/* Inline Resolve Drawer */}
                {resolvingAlertId === a.id && (
                  <div className="mt-2.5 p-3 bg-[#F0FDF4] border border-[#B8DFC8] rounded space-y-2 text-xs">
                    <h5 className="font-bold text-[11px] text-[#166534]">Resolve Operational Alert</h5>
                    <div>
                      <label className="block text-[10px] font-semibold text-[#1A1917] mb-0.5">Remediation / Justification Notes *</label>
                      <input
                        type="text"
                        placeholder="e.g. Renewed fire safety NOC v2 verified and uploaded in Evidence Vault."
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                        className="w-full px-2 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setResolvingAlertId(null)}
                        className="px-2.5 py-0.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[10px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCommitResolve(a.id)}
                        className="px-3 py-0.5 bg-[#15803D] text-white font-bold rounded text-[10px] hover:bg-[#166534]"
                      >
                        Confirm Resolution
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Notification Outbox Modal */}
      <NotificationOutboxModal
        isOpen={showOutbox}
        onClose={() => setShowOutbox(false)}
      />
    </div>
  );
};
