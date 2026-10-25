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
