'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DashboardSummary, DataMode, CaseSummaryItem } from '../types/aiclear';
import { fetchDashboardSummary, submitFirstRunChoice, switchWorkspaceMode, fetchCases, fetchCaseDetail } from '../services/api';

export type InstitutionalRole = 
  | 'Institution Coordinator'
  | 'Compliance Officer'
  | 'Reviewer'
  | 'Administrator';

export const ROLE_PERMISSIONS_CONFIG: Record<InstitutionalRole, {
  description: string;
  focusArea: string;
  canCreateCase: boolean;
  canImportData: boolean;
  canManageSettings: boolean;
  canUploadEvidence: boolean;
  canReviewDocuments: boolean;
  canEvaluateCompliance: boolean;
  canOverrideCompliance: boolean;
  canAcknowledgeAlerts: boolean;
  canAssignAlerts: boolean;
  canResolveAlerts: boolean;
  canScanEscalations: boolean;
}> = {
  'Institution Coordinator': {
    description: 'Case initialization, evidence document uploads, and case logistics. Self-approval and compliance overrides are restricted.',
    focusArea: 'Institutional Dossier & Case Filing',
    canCreateCase: true,
    canImportData: true,
    canManageSettings: false,
    canUploadEvidence: true,
    canReviewDocuments: false,
    canEvaluateCompliance: false,
    canOverrideCompliance: false,
    canAcknowledgeAlerts: true,
    canAssignAlerts: true,
    canResolveAlerts: false,
    canScanEscalations: false,
  },
  'Reviewer': {
    description: 'Document verifier. Audits certificates and evidence authenticity. Case creation and overrides are restricted.',
    focusArea: 'Evidence Vault & Certificate Review',
    canCreateCase: false,
    canImportData: false,
    canManageSettings: false,
    canUploadEvidence: false,
    canReviewDocuments: true,
    canEvaluateCompliance: false,
    canOverrideCompliance: false,
    canAcknowledgeAlerts: true,
    canAssignAlerts: false,
    canResolveAlerts: false,
    canScanEscalations: false,
  },
  'Compliance Officer': {
    description: 'Normative audit officer. Evaluates APH 2024–27 criteria, issues compliance overrides, and resolves deficiencies.',
    focusArea: 'Normative Checks & Overrides',
    canCreateCase: false,
    canImportData: false,
    canManageSettings: false,
    canUploadEvidence: false,
    canReviewDocuments: false,
    canEvaluateCompliance: true,
    canOverrideCompliance: true,
    canAcknowledgeAlerts: true,
    canAssignAlerts: false,
    canResolveAlerts: true,
    canScanEscalations: true,
  },
  'Administrator': {
    description: 'System administrator with unrestricted operational oversight across case configuration, reviews, compliance, and alerts.',
    focusArea: 'Supervisory & System Oversight',
    canCreateCase: true,
    canImportData: true,
    canManageSettings: true,
    canUploadEvidence: true,
    canReviewDocuments: true,
    canEvaluateCompliance: true,
    canOverrideCompliance: true,
    canAcknowledgeAlerts: true,
    canAssignAlerts: true,
    canResolveAlerts: true,
    canScanEscalations: true,
  }
};

const INITIAL_SUMMARY: DashboardSummary = {
  workspace_name: "Technical Institution Operations Workspace",
  active_data_mode: "DEMO",
  first_run_completed: false,
  total_active_cases: 4,
  cases_requiring_action: 2,
  overdue_tasks: 1,
  open_high_priority_alerts: 3,
  upcoming_deadlines_count: 3,
  compliance_items_needing_review: 2,
  stage_breakdown: [
    { stage_key: "DOCUMENT_REVIEW", stage_label: "Document Review", count: 1 },
    { stage_key: "COMPLIANCE_CHECKS", stage_label: "Compliance Checks", count: 1 },
    { stage_key: "INTERNAL_REVIEW", stage_label: "Internal Review", count: 1 },
    { stage_key: "CORRECTIONS_REQUIRED", stage_label: "Corrections Required", count: 1 },
    { stage_key: "READY_FOR_SUBMISSION", stage_label: "Ready for Submission", count: 1 }
  ],
  recent_cases: [],
  open_alerts: [],
  recent_activity: [],
  data_mode_notice: "Synthetic demo cases loaded for institutional process rehearsal."
};

interface WorkspaceContextType {
  summary: DashboardSummary;
  activeMode: DataMode;
  loading: boolean;
  loadData: () => Promise<void>;
  selectedCase: CaseSummaryItem | any | null;
  setSelectedCase: (c: CaseSummaryItem | any | null) => void;
  openCaseByRef: (caseRef: string) => Promise<void>;
  openCaseById: (caseId: string) => Promise<void>;
  activeRole: InstitutionalRole;
  setActiveRole: (role: InstitutionalRole) => void;
  canPerform: (action: keyof typeof ROLE_PERMISSIONS_CONFIG['Administrator']) => boolean;
  roleConfig: typeof ROLE_PERMISSIONS_CONFIG['Administrator'];
  showSettingsModal: boolean;
  setShowSettingsModal: (show: boolean) => void;
  showImportModal: boolean;
  setShowImportModal: (show: boolean) => void;
  showCreateCaseModal: boolean;
  setShowCreateCaseModal: (show: boolean) => void;
  showFirstRunModal: boolean;
  setShowFirstRunModal: (show: boolean) => void;
  handleFirstRunSelect: (mode: DataMode) => Promise<void>;
  handleSwitchMode: (mode: DataMode) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [summary, setSummary] = useState<DashboardSummary>(INITIAL_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [activeRole, setActiveRoleState] = useState<InstitutionalRole>('Institution Coordinator');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aiclear_active_role') as InstitutionalRole | null;
      if (saved && ROLE_PERMISSIONS_CONFIG[saved]) {
        setActiveRoleState(saved);
      } else {
        localStorage.setItem('aiclear_active_role', 'Institution Coordinator');
      }
    }
  }, []);

  const setActiveRole = (role: InstitutionalRole) => {
    setActiveRoleState(role);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aiclear_active_role', role);
      window.dispatchEvent(new CustomEvent('aiclear-role-changed', { detail: { role } }));
    }
  };

  const roleConfig = ROLE_PERMISSIONS_CONFIG[activeRole] || ROLE_PERMISSIONS_CONFIG['Institution Coordinator'];

  const canPerform = (action: keyof typeof ROLE_PERMISSIONS_CONFIG['Administrator']): boolean => {
    return !!roleConfig[action];
  };

  // Modals state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [showFirstRunModal, setShowFirstRunModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchDashboardSummary();
      setSummary(data);
      if (!data.first_run_completed && typeof window !== 'undefined') {
        const hasPrompted = sessionStorage.getItem('aiclear_first_run_prompted');
        if (!hasPrompted) {
          setShowFirstRunModal(true);
          sessionStorage.setItem('aiclear_first_run_prompted', 'true');
        }
      }
    } catch {
      // Keep initial summary on connection fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFirstRunSelect = async (mode: DataMode) => {
    try {
      await submitFirstRunChoice(mode);
      await loadData();
    } catch {
      setSummary(prev => ({ ...prev, active_data_mode: mode, first_run_completed: true }));
    }
  };

  const handleSwitchMode = async (mode: DataMode) => {
    try {
      await switchWorkspaceMode(mode);
      await loadData();
    } catch {
      setSummary(prev => ({ ...prev, active_data_mode: mode }));
    }
  };

  const openCaseByRef = async (caseRef: string) => {
    // Check in recent cases first
    const match = summary.recent_cases.find(c => c.case_reference.toLowerCase() === caseRef.toLowerCase());
    if (match) {
      setSelectedCase(match);
      return;
    }
    // Query API
    try {
      const results = await fetchCases({ search: caseRef });
      if (results && results.length > 0) {
        setSelectedCase(results[0]);
      }
    } catch (e) {
      console.error('Failed to open case by ref:', e);
    }
  };

  const openCaseById = async (caseId: string) => {
    try {
      const detail = await fetchCaseDetail(caseId);
      if (detail) {
        setSelectedCase(detail);
      }
    } catch (e) {
      console.error('Failed to open case by id:', e);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{
        summary,
        activeMode: summary.active_data_mode,
        loading,
        loadData,
        selectedCase,
        setSelectedCase,
        openCaseByRef,
        openCaseById,
        activeRole,
        setActiveRole,
        canPerform,
        roleConfig,
        showSettingsModal,
        setShowSettingsModal,
        showImportModal,
        setShowImportModal,
        showCreateCaseModal,
        setShowCreateCaseModal,
        showFirstRunModal,
        setShowFirstRunModal,
        handleFirstRunSelect,
        handleSwitchMode
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
