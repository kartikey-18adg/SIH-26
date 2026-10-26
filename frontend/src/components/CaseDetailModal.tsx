'use client';

import React, { useState, useEffect } from 'react';
import { 
  transitionCaseStageApi, fetchCaseDetail, fetchCaseDocuments, 
  uploadCaseDocument, reviewDocumentApi, uploadNewVersionApi, 
  getDocumentDownloadUrl, fetchCaseCompliance, evaluateCaseCompliance, fetchAiComplianceInsights,
  overrideComplianceResultApi
} from '../services/api';
import { ReviewPackModal } from './ReviewPackModal';
import { useWorkspace } from '../context/WorkspaceContext';

interface CaseDetailModalProps {
  caseItem: any | null;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const CaseDetailModal: React.FC<CaseDetailModalProps> = ({ caseItem, onClose, onRefreshData }) => {
  const { activeRole, canPerform } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'compliance' | 'tasks' | 'transition'>('overview');
  const [detail, setDetail] = useState<any | null>(caseItem);
  const [documents, setDocuments] = useState<any[]>([]);
  const [complianceResults, setComplianceResults] = useState<any[]>([]);
  const [evaluatingCompliance, setEvaluatingCompliance] = useState<boolean>(false);
  const [generatingAiInsights, setGeneratingAiInsights] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<any | null>(null);
  const [selectedNextStage, setSelectedNextStage] = useState<string>('');
  const [transitionReason, setTransitionReason] = useState<string>('');
  const [transitioning, setTransitioning] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Evidence Upload State
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('FIRE_SAFETY_NOC');
  const [uploadDocDate, setUploadDocDate] = useState('');
  const [uploadExpDate, setUploadExpDate] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Version Upload State
  const [versioningDocId, setVersioningDocId] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionNote, setVersionNote] = useState('');
  const [uploadingVersion, setUploadingVersion] = useState(false);

  // Compliance Override Drawer State
  const [overrideResultId, setOverrideResultId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('COMPLIANT');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [savingOverride, setSavingOverride] = useState<boolean>(false);

  // Expanded Versions
  const [expandedVersionsDocId, setExpandedVersionsDocId] = useState<string | null>(null);

  // Review Pack Modal State
  const [showReviewPack, setShowReviewPack] = useState(false);

  const loadCaseDocs = (cId: string) => {
    fetchCaseDocuments(cId)
      .then(docs => setDocuments(docs))
      .catch(() => {});
  };

  const loadCaseCompliance = async (cId: string) => {
    try {
      const res = await fetchCaseCompliance(cId);
      setComplianceResults(Array.isArray(res) ? res : []);
      return Array.isArray(res) ? res.length : 0;
    } catch (err: any) {
      setComplianceResults([]);
      setErrorNotice(err.message || 'Could not load compliance checks for this case.');
      return 0;
    }
  };

  useEffect(() => {
    if (!caseItem?.id) {
      // The parent closes this modal by clearing selectedCase. Clear the
      // retained detail state too, otherwise the last case stays rendered.
      setDetail(null);
      setDocuments([]);
      setComplianceResults([]);
      setAiInsights(null);
      setShowReviewPack(false);
      return;
    }

    // Start each newly selected case on its overview so footer actions such
    // as "Inspect Compliance Checks" always produce an observable transition.
    if (detail?.id !== caseItem.id) {
      setActiveTab('overview');
      setAiInsights(null);
    }
    setDetail(caseItem);
    fetchCaseDetail(caseItem.id)
      .then(d => {
        setDetail(current => current?.id === caseItem.id ? d : current);
        if (d.allowed_next_stages && d.allowed_next_stages.length > 0) {
          setSelectedNextStage(d.allowed_next_stages[0]);
        }
      })
      .catch(() => {});
    loadCaseDocs(caseItem.id);
    loadCaseCompliance(caseItem.id);
  }, [caseItem]);

  // caseItem is the source of truth for whether the modal is open. detail can
  // retain the previous case while React effects run, so guard on both.
  if (!caseItem || !detail) return null;

  const handleStageTransition = async () => {
    if (!selectedNextStage) {
      setErrorNotice('Please select a target workflow stage.');
      return;
    }
    if (!transitionReason.trim() || transitionReason.trim().length < 4) {
      setErrorNotice('A justification reason of at least 4 characters is required.');
      return;
    }

    setTransitioning(true);
    setErrorNotice(null);
    try {
      const updated = await transitionCaseStageApi(
        detail.id,
        selectedNextStage,
        transitionReason,
        activeRole
      );
      setDetail(updated);
      setTransitionReason('');
      if (updated.allowed_next_stages && updated.allowed_next_stages.length > 0) {
        setSelectedNextStage(updated.allowed_next_stages[0]);
      }
      setActionNotice(`Case stage successfully transitioned to ${updated.current_stage}.`);
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Stage transition failed.');
    } finally {
      setTransitioning(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setErrorNotice('Please select a file to upload.');
      return;
    }
    setUploading(true);
    setErrorNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('category', uploadCategory);
      if (uploadDocDate) fd.append('document_date', uploadDocDate);
      if (uploadExpDate) fd.append('expiry_date', uploadExpDate);
      fd.append('uploaded_by', detail.internal_owner_name || 'Coordinator');

      await uploadCaseDocument(detail.id, fd);
      loadCaseDocs(detail.id);
      setShowUploadForm(false);
      setUploadFile(null);
      setUploadDocDate('');
      setUploadExpDate('');
      setActionNotice('Evidence document uploaded to private vault and registered in AWAITING_REVIEW status.');
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload evidence document.');
    } finally {
      setUploading(false);
    }
  };

  const handleReviewDocument = async (docId: string, status: string, notes: string) => {
    try {
      await reviewDocumentApi(docId, status, notes, activeRole);
      loadCaseDocs(detail.id);
      setActionNotice(`Document review recorded as ${status}.`);
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to update review status.');
    }
  };

  const handleUploadNewVersion = async (docId: string) => {
    if (!versionFile) {
      setErrorNotice('Please select a replacement file.');
      return;
    }
    setUploadingVersion(true);
    setErrorNotice(null);
    try {
      const fd = new FormData();
      fd.append('file', versionFile);
      fd.append('change_note', versionNote || 'Uploaded revised document version');
      fd.append('uploaded_by', detail.internal_owner_name || 'Coordinator');

      await uploadNewVersionApi(docId, fd);
      loadCaseDocs(detail.id);
      setVersioningDocId(null);
      setVersionFile(null);
      setVersionNote('');
      setActionNotice('New document version committed. Status reset to AWAITING_REVIEW for re-verification.');
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to upload replacement version.');
    } finally {
      setUploadingVersion(false);
    }
  };

  const handleEvaluateCompliance = async () => {
    setEvaluatingCompliance(true);
    setErrorNotice(null);
    try {
      const res = await evaluateCaseCompliance(detail.id);
      setComplianceResults(res);
      setActionNotice(`Compliance evaluation complete. Evaluated ${res.length} rules against APH 2024-27 norms.`);
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to evaluate compliance checks.');
    } finally {
      setEvaluatingCompliance(false);
    }
  };

  const handleGenerateAiInsights = async () => {
    if (!detail?.id) return;
    setGeneratingAiInsights(true);
    setErrorNotice(null);
    try {
      const insights = await fetchAiComplianceInsights(detail.id);
      setAiInsights(insights);
      setActionNotice(insights.analysis_mode === 'AI_ASSISTED'
        ? 'AI-assisted compliance triage generated. Deterministic findings were not changed.'
        : 'AI provider is not configured or unavailable; showing transparent rule-based triage instead.');
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Unable to generate compliance triage.');
    } finally {
      setGeneratingAiInsights(false);
    }
  };

  const handleOpenOverrideDrawer = (res: any) => {
    setOverrideResultId(res.id);
    setOverrideStatus(res.status === 'COMPLIANT' ? 'NOT_APPLICABLE' : 'COMPLIANT');
    setOverrideReason('');
  };

  const handleSaveOverride = async () => {
    if (!overrideResultId) return;
    if (!overrideReason.trim() || overrideReason.trim().length < 5) {
      setErrorNotice('Override justification must be at least 5 characters explaining human verification basis.');
      return;
    }

    setSavingOverride(true);
    setErrorNotice(null);
    try {
      await overrideComplianceResultApi(overrideResultId, overrideStatus, overrideReason, activeRole);
      loadCaseCompliance(detail.id);
      setOverrideResultId(null);
      setOverrideReason('');
      setActionNotice(`Compliance override recorded as ${overrideStatus}. Original automated finding preserved.`);
      if (onRefreshData) onRefreshData();
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err: any) {
      setErrorNotice(err.message || 'Failed to record compliance override.');
    } finally {
      setSavingOverride(false);
    }
  };

  const stagesList = [
    'Draft',
    'Document Review',
    'Compliance Checks',
    'Internal Review',
    'Corrections Required',
    'Ready for Submission',
    'Closed'
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#1A1917]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold font-tabular text-[#1E3A8A]">
                {detail.case_reference}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]">
                {detail.workflow_type}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 border rounded bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]">
                {detail.status}
              </span>
            </div>
            <h2 className="text-sm font-semibold text-[#1A1917] mt-1">
              {detail.institution_name}
            </h2>
            <div className="text-[11px] text-[#5E5D57] font-tabular mt-0.5">
              AICTE Permanent ID: {detail.aicte_permanent_id || 'N/A'} | Academic Period: {detail.academic_period} | Owner: {detail.internal_owner_name}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowReviewPack(true)}
              className="px-2.5 py-1 text-xs font-bold bg-[#1E3A8A] text-white hover:bg-[#172554] rounded transition-colors shadow-xs flex items-center gap-1"
            >
              📄 Review Pack
            </button>
            <button
              onClick={onClose}
              className="text-sm text-[#5E5D57] hover:text-[#1A1917] px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stage Stepper Banner */}
        <div className="px-6 py-2.5 bg-[#FAF9F5] border-b border-[#E2E0D8] overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max text-[11px]">
            {stagesList.map((stg, i) => {
              const isCurrent = detail.current_stage?.toLowerCase().replace(/_/g, ' ') === stg.toLowerCase();
              return (
                <React.Fragment key={stg}>
                  <div className={`px-2 py-1 rounded font-medium ${
                    isCurrent 
                      ? 'bg-[#1E3A8A] text-white font-bold shadow-xs' 
                      : 'bg-[#FFFFFF] border border-[#E2E0D8] text-[#5E5D57]'
                  }`}>
                    {i + 1}. {stg}
                  </div>
                  {i < stagesList.length - 1 && (
                    <span className="text-[#C6C4BA] text-xs">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-[#E2E0D8] bg-[#FFFFFF] flex gap-4 text-xs font-medium">
          {[
            { id: 'overview', label: 'Case Overview' },
            { id: 'evidence', label: `Evidence Vault (${documents.length})` },
            { id: 'compliance', label: `Compliance Checks (${complianceResults.length})` },
            { id: 'transition', label: 'Advance / Transition Stage' },
            { id: 'tasks', label: 'Assigned Tasks' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2.5 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1E3A8A] text-[#1E3A8A] font-bold'
                  : 'border-transparent text-[#5E5D57] hover:text-[#1A1917]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {actionNotice && (
            <div className="mb-4 p-2.5 bg-[#EAF5EE] border border-[#B8DFC8] rounded text-xs text-[#1C4D35] font-semibold">
              ✓ {actionNotice}
            </div>
          )}
          {errorNotice && (
            <div className="mb-4 p-2.5 bg-[#FDF0F0] border border-[#F0C4C4] rounded text-xs text-[#8A1E20] font-semibold">
              ⚠️ {errorNotice}
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#FBFBF9] p-3 border border-[#E2E0D8] rounded">
                <div>
                  <span className="text-[10px] text-[#5E5D57] uppercase font-bold">Target Date</span>
                  <div className="font-tabular font-bold text-sm text-[#1A1917] mt-0.5">{detail.target_date}</div>
                  <div className="text-[10px] text-[#5E5D57]">{detail.days_remaining} days remaining</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#5E5D57] uppercase font-bold">Priority Level</span>
                  <div className="font-bold text-sm text-[#1A1917] mt-0.5">{detail.priority}</div>
                  <div className="text-[10px] text-[#5E5D57]">Internal SLA urgency</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#5E5D57] uppercase font-bold">Current Stage</span>
                  <div className="font-bold text-sm text-[#1E3A8A] mt-0.5">{detail.current_stage}</div>
                  <div className="text-[10px] text-[#5E5D57]">Status: {detail.status}</div>
                </div>
                <div>
                  <span className="text-[10px] text-[#5E5D57] uppercase font-bold">Assigned Owner</span>
                  <div className="font-bold text-sm text-[#1A1917] mt-0.5">{detail.internal_owner_name}</div>
                  <div className="text-[10px] text-[#5E5D57]">Technical Administrative Cell</div>
                </div>
              </div>

              {detail.notes && (
                <div className="p-3 bg-[#F7F7F5] border border-[#E2E0D8] rounded text-[11px] leading-relaxed">
                  <strong>Notes:</strong> {detail.notes}
                </div>
              )}

              {/* Stage Transition History */}
              <div className="border border-[#E2E0D8] rounded p-4">
                <h4 className="font-bold text-xs text-[#1A1917] mb-2 uppercase tracking-wide">
                  Chronological Stage Transition History
                </h4>
                <div className="space-y-2 text-[11px]">
                  {detail.stage_history && detail.stage_history.length > 0 ? (
                    detail.stage_history.map((h: any, idx: number) => (
                      <div key={h.id || idx} className="flex justify-between border-b border-[#F2F1EC] pb-2">
                        <div>
                          <div className="font-semibold text-[#1A1917]">
                            {h.from_stage} → <span className="text-[#1E3A8A] font-bold">{h.to_stage}</span>
                          </div>
                          <div className="text-[#5E5D57] mt-0.5">
                            Reason: {h.reason}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[#1A1917] font-medium">{h.changed_by}</div>
                          <div className="text-[10px] text-[#89877E] font-mono">
                            {new Date(h.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-[#5E5D57] italic">Initial stage transition history recorded.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'evidence' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#E2E0D8]">
                <div>
                  <h4 className="font-bold text-xs text-[#1A1917]">Institutional Evidence Records</h4>
                  <p className="text-[11px] text-[#5E5D57]">
                    Private document vault with SHA-256 integrity verification, expiry monitoring, and version histories.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={canPerform('canUploadEvidence') ? () => setShowUploadForm(!showUploadForm) : undefined}
                  disabled={!canPerform('canUploadEvidence')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                    canPerform('canUploadEvidence')
                      ? 'bg-[#1E3A8A] text-white hover:bg-[#172554] cursor-pointer'
                      : 'bg-[#E2E0D8] text-[#89877E] cursor-not-allowed'
                  }`}
                  title={canPerform('canUploadEvidence') ? undefined : "Evidence upload restricted to Institution Coordinator or Administrator"}
                >
                  {showUploadForm ? 'Cancel Upload' : '+ Upload Evidence File'}
                </button>
              </div>

              {/* Upload Evidence Form Drawer */}
              {showUploadForm && (
                <form onSubmit={handleUploadDocument} className="p-4 bg-[#FBFBF9] border border-[#CAD6E2] rounded space-y-3">
                  <h5 className="font-bold text-xs text-[#1E3A8A]">Upload Evidence to Private Vault</h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Document Category</label>
                      <select
                        value={uploadCategory}
                        onChange={(e) => setUploadCategory(e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                      >
                        <option value="FIRE_SAFETY_NOC">Fire Safety Certificate / NOC</option>
                        <option value="OCCUPANCY_CERTIFICATE">Building Occupancy Certificate</option>
                        <option value="LAND_TITLE_DEED">Land Title / Lease Deed</option>
                        <option value="FACULTY_CADRE_MATRIX">Faculty Cadre Matrix & Appointment Orders</option>
                        <option value="SOCIETY_REGISTRATION">Society / Trust Registration Certificate</option>
                        <option value="BUILDING_PLAN_APPROVAL">Approved Building Plan</option>
                        <option value="OTHER_SUPPORTING_EVIDENCE">Other Supporting Evidence</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Document Issue Date</label>
                      <input
                        type="date"
                        value={uploadDocDate}
                        onChange={(e) => setUploadDocDate(e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-tabular"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Statutory Expiration Date</label>
                      <input
                        type="date"
                        value={uploadExpDate}
                        onChange={(e) => setUploadExpDate(e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-tabular"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Select File (PDF, PNG, JPG, DOCX - Max 20MB)</label>
                    <input
                      type="file"
                      required
                      accept=".pdf,.png,.jpg,.jpeg,.docx"
                      onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                      className="text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowUploadForm(false)}
                      className="px-3 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs hover:bg-[#F2F1EC]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploading}
                      className="px-3.5 py-1 bg-[#15803D] text-white text-xs font-bold rounded hover:bg-[#166534] disabled:opacity-50"
                    >
                      {uploading ? 'Storing in Vault...' : 'Commit Upload to Vault'}
                    </button>
                  </div>
                </form>
              )}

              {/* Version Replacement Drawer */}
              {versioningDocId && (
                <div className="p-4 bg-[#FFFDF7] border border-[#EBD9A4] rounded space-y-3">
                  <h5 className="font-bold text-xs text-[#855304]">Upload Replacement Version (Increments Version Number)</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">New File</label>
                      <input
                        type="file"
                        required
                        accept=".pdf,.png,.jpg,.jpeg,.docx"
                        onChange={(e) => setVersionFile(e.target.files ? e.target.files[0] : null)}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">Change Note / Justification</label>
                      <input
                        type="text"
                        placeholder="e.g. Attached renewed municipal endorsement copy"
                        value={versionNote}
                        onChange={(e) => setVersionNote(e.target.value)}
                        className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setVersioningDocId(null)}
                      className="px-3 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={uploadingVersion}
                      onClick={() => handleUploadNewVersion(versioningDocId)}
                      className="px-3 py-1 bg-[#1E3A8A] text-white text-xs font-bold rounded hover:bg-[#172554] disabled:opacity-50"
                    >
                      {uploadingVersion ? 'Committing Version...' : 'Upload Version & Reset to Awaiting Review'}
                    </button>
                  </div>
                </div>
              )}

              {/* Documents List */}
              <div className="space-y-3">
                {documents.length === 0 ? (
                  <div className="p-8 text-center bg-[#FAF9F5] border border-dashed border-[#C6C4BA] rounded">
                    <p className="font-semibold text-xs text-[#1A1917]">No evidence documents attached to this case.</p>
                    <p className="text-[11px] text-[#5E5D57] mt-1">Upload required Fire Safety, Land, or Occupancy certificates above.</p>
                  </div>
                ) : (
                  documents.map(doc => {
                    const statusBadge: Record<string, string> = {
                      'AWAITING_REVIEW': 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]',
                      'VERIFIED_VALID': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]',
                      'NEEDS_CORRECTION': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
                      'NOT_APPLICABLE': 'bg-[#F4F4F1] text-[#5E5D57] border-[#C6C4BA]'
                    };
                    const badgeClass = statusBadge[doc.review_status] || 'bg-gray-100 text-gray-800';

                    return (
                      <div key={doc.id} className="border border-[#E2E0D8] rounded p-3.5 bg-[#FFFFFF] space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-[#1A1917]">{doc.original_filename}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#F7F7F5] border border-[#E2E0D8] rounded">
                                v{doc.version_number}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 border rounded ${badgeClass}`}>
                                {doc.review_status?.replace('_', ' ') || 'STATUS'}
                              </span>
                              {doc.is_expired && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-[#FDF0F0] text-[#8A1E20] border border-[#F0C4C4] rounded">
                                  ⚠️ EXPIRED ({Math.abs(doc.days_to_expiry)}d ago)
                                </span>
                              )}
                              {doc.is_near_expiry && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-[#FDF6E4] text-[#855304] border border-[#EBD9A4] rounded">
                                  ⚠️ EXPIRING SOON ({doc.days_to_expiry}d remaining)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#5E5D57] font-mono mt-1">
                              Category: <strong>{doc.category}</strong> | Size: {(doc.size_bytes / 1024).toFixed(1)} KB | SHA-256: {doc.sha256_hash.substring(0, 16)}...
                            </div>
                            {doc.expiry_date && (
                              <div className="text-[11px] text-[#1A1917] font-tabular mt-0.5">
                                Statutory Validity Limit: <strong>{doc.expiry_date}</strong>
                              </div>
                            )}
                            {doc.review_notes && (
                              <div className="text-[11px] text-[#855304] bg-[#FFFDF7] p-2 border border-[#EBD9A4] rounded mt-1.5">
                                <strong>Reviewer Remark:</strong> {doc.review_notes} ({doc.reviewed_by})
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <a
                              href={getDocumentDownloadUrl(doc.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 text-[11px] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded transition-colors"
                            >
                              Download File ↗
                            </a>
                            <button
                              type="button"
                              disabled={!canPerform('canReviewDocuments')}
                              onClick={() => {
                                const notes = prompt('Enter validation notes (optional):', 'Verified against municipal authority records.');
                                if (notes !== null) handleReviewDocument(doc.id, 'VERIFIED_VALID', notes);
                              }}
                              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                                canPerform('canReviewDocuments')
                                  ? 'bg-[#15803D] text-white hover:bg-[#166534] cursor-pointer'
                                  : 'bg-[#E2E0D8] text-[#89877E] cursor-not-allowed'
                              }`}
                              title={canPerform('canReviewDocuments') ? undefined : "Document review restricted to Reviewer or Administrator"}
                            >
                              ✓ Verify
                            </button>
                            <button
                              type="button"
                              disabled={!canPerform('canReviewDocuments')}
                              onClick={() => {
                                const notes = prompt('Enter correction reason for coordinator:', 'Official seal blurred; updated endorsement required.');
                                if (notes) handleReviewDocument(doc.id, 'NEEDS_CORRECTION', notes);
                              }}
                              className={`px-2 py-1 text-[11px] font-bold rounded transition-colors ${
                                canPerform('canReviewDocuments')
                                  ? 'bg-[#B91C1C] text-white hover:bg-[#991B1B] cursor-pointer'
                                  : 'bg-[#E2E0D8] text-[#89877E] cursor-not-allowed'
                              }`}
                              title={canPerform('canReviewDocuments') ? undefined : "Document review restricted to Reviewer or Administrator"}
                            >
                              Request Correction
                            </button>
                            <button
                              type="button"
                              disabled={!canPerform('canUploadEvidence')}
                              onClick={() => setVersioningDocId(doc.id)}
                              className={`px-2 py-1 text-[11px] border rounded transition-colors ${
                                canPerform('canUploadEvidence')
                                  ? 'border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#EAF0F6] cursor-pointer'
                                  : 'border-[#E2E0D8] text-[#A8A69E] cursor-not-allowed'
                              }`}
                              title={canPerform('canUploadEvidence') ? undefined : "Version upload restricted to Institution Coordinator or Administrator"}
                            >
                              + New Version
                            </button>
                          </div>
                        </div>

                        {/* Version History Accordion */}
                        {doc.versions && doc.versions.length > 1 && (
                          <div className="pt-1.5 border-t border-[#F2F1EC]">
                            <button
                              type="button"
                              onClick={() => setExpandedVersionsDocId(expandedVersionsDocId === doc.id ? null : doc.id)}
                              className="text-[10px] text-[#1E3A8A] hover:underline font-mono"
                            >
                              {expandedVersionsDocId === doc.id ? '▼ Hide Version History' : `▶ View All Versions (${doc.versions.length})`}
                            </button>

                            {expandedVersionsDocId === doc.id && (
                              <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-[#CAD6E2] text-[10px]">
                                {doc.versions.map((ver: any) => (
                                  <div key={ver.id} className="flex justify-between items-center text-[#5E5D57]">
                                    <div>
                                      <strong>v{ver.version_number}:</strong> {ver.original_filename} (SHA-256: {ver.sha256_hash.substring(0, 12)}...)
                                      {ver.change_note && <span className="italic ml-2">- {ver.change_note}</span>}
                                    </div>
                                    <span className="font-mono text-[9px] text-[#89877E]">
                                      {new Date(ver.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'compliance' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-[#E2E0D8]">
                <div>
                  <h4 className="font-bold text-xs text-[#1A1917]">Compliance Engine & AI Triage</h4>
                  <p className="text-[11px] text-[#5E5D57]">
                    Deterministic APH 2024–27 checks remain authoritative. AI summarizes existing findings and never changes compliance status.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={canPerform('canEvaluateCompliance') ? handleGenerateAiInsights : undefined}
                    disabled={generatingAiInsights || !canPerform('canEvaluateCompliance')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
                      canPerform('canEvaluateCompliance')
                        ? 'bg-[#F3E8FF] text-[#6B21A8] border-[#D8B4FE] hover:bg-[#E9D5FF]'
                        : 'bg-[#E2E0D8] text-[#89877E] border-[#E2E0D8] cursor-not-allowed'
                    }`}
                    title={canPerform('canEvaluateCompliance') ? undefined : "AI triage restricted to Compliance Officer or Administrator"}
                  >
                    {generatingAiInsights ? 'Analyzing...' : '✦ AI Triage'}
                  </button>
                  <button
                    type="button"
                    onClick={canPerform('canEvaluateCompliance') ? handleEvaluateCompliance : undefined}
                    disabled={evaluatingCompliance || !canPerform('canEvaluateCompliance')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                      canPerform('canEvaluateCompliance')
                        ? 'bg-[#1E3A8A] text-white hover:bg-[#172554] cursor-pointer'
                        : 'bg-[#E2E0D8] text-[#89877E] cursor-not-allowed'
                    }`}
                    title={canPerform('canEvaluateCompliance') ? undefined : "Compliance evaluation restricted to Compliance Officer or Administrator"}
                  >
                    {evaluatingCompliance ? 'Evaluating Checks...' : '⚡ Re-evaluate Checks'}
                  </button>
                </div>
              </div>
              {aiInsights && (
                <div className="border border-[#D8B4FE] bg-[#FAF5FF] rounded p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-xs font-bold text-[#581C87]">Compliance Triage Insights</h5>
                    <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded border border-[#D8B4FE] bg-white text-[#6B21A8]">
                      {aiInsights.analysis_mode === 'AI_ASSISTED' ? `AI assisted · ${aiInsights.model || 'configured model'}` : 'Rule-based fallback · no AI model'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#1A1917]">{aiInsights.summary}</p>
                  {aiInsights.fallback_reason && (
                    <p className="text-[10px] text-[#855304]">AI unavailable: {aiInsights.fallback_reason}</p>
                  )}
                  {aiInsights.priority_actions?.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5E5D57]">Priority actions</p>
                      {aiInsights.priority_actions.map((item: any, index: number) => (
                        <div key={`${item.rule_key}-${index}`} className="bg-white border border-[#E9D5FF] rounded p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold text-[#1A1917]">{item.rule_key}: {item.title}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#FDF6E4] text-[#855304]">{String(item.status).replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-[11px] mt-1 text-[#1A1917]">{item.action}</p>
                          <p className="text-[10px] mt-1 text-[#5E5D57]">{item.reason}</p>
                          {(item.source || item.section) && <p className="text-[9px] mt-1 text-[#5E5D57]">Stored citation: {item.source || 'Source not recorded'} {item.section ? `· ${item.section}` : ''}</p>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#5E5D57]">No findings are currently prioritized for action.</p>
                  )}
                  {aiInsights.uncertainty_notes?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#5E5D57] mb-1">Limitations & human verification</p>
                      <ul className="list-disc pl-4 space-y-1 text-[10px] text-[#5E5D57]">
                        {aiInsights.uncertainty_notes.map((note: string, index: number) => <li key={index}>{note}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {complianceResults.length === 0 ? (
                  <div className="p-8 text-center bg-[#FAF9F5] border border-dashed border-[#C6C4BA] rounded">
                    <p className="font-semibold text-xs text-[#1A1917]">No compliance evaluation results recorded yet.</p>
                    <p className="text-[11px] text-[#5E5D57] mt-1">Click &quot;Re-evaluate Checks&quot; above to run deterministic APH checks.</p>
                  </div>
                ) : (
                  complianceResults.map(res => {
                    const statusStyle: Record<string, string> = {
                      'COMPLIANT': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]',
                      'NEEDS_REVIEW': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
                      'NON_COMPLIANT': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
                      'MISSING_EVIDENCE': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
                      'EXPIRED_EVIDENCE': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
                      'NOT_APPLICABLE': 'bg-[#F4F4F1] text-[#5E5D57] border-[#C6C4BA]'
                    };
                    const resBadge = statusStyle[res.status] || 'bg-gray-100 text-gray-800';

                    const isOfficial = res.rule_source_type === 'OFFICIAL_APH_2024_27';

                    return (
                      <div key={res.id} className="border border-[#E2E0D8] rounded p-3.5 bg-[#FFFFFF] space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-[#1A1917]">{res.rule_key}: {res.rule_title}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 border rounded ${resBadge}`}>
                                {res.status.replace(/_/g, ' ')}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase ${
                                isOfficial ? 'bg-[#EAF0F6] text-[#1E3A8A] border-[#CAD6E2]' : 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]'
                              }`}>
                                {isOfficial ? 'OFFICIAL APH 2024–27' : 'ILLUSTRATIVE DEMO RULE'}
                              </span>
                              {res.manual_override && (
                                <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-[#F3E8FF] text-[#6B21A8] border border-[#D8B4FE] rounded">
                                  MANUAL OVERRIDE
                                </span>
                              )}
                            </div>

                            {res.official_source_title && (
                              <div className="text-[10px] text-[#5E5D57] font-mono mt-1">
                                <strong>Citation:</strong> {res.official_source_title} {res.official_section_ref ? `(${res.official_section_ref})` : ''}
                              </div>
                            )}

                            <p className="text-[11px] text-[#1A1917] mt-1.5 bg-[#FAF9F5] p-2 border border-[#E2E0D8] rounded leading-relaxed">
                              <strong>Evaluation:</strong> {res.explanation}
                            </p>

                            {res.recommended_action && (
                              <div className="text-[11px] text-[#855304] mt-1">
                                <strong>Recommended Action:</strong> {res.recommended_action}
                              </div>
                            )}

                            {res.manual_override && (
                              <div className="text-[10px] text-[#6B21A8] bg-[#FAF5FF] p-1.5 border border-[#E9D5FF] rounded mt-1.5 font-mono">
                                Overridden by <strong>{res.overridden_by}</strong> | Automated was: <strong>{res.original_status}</strong> | Reason: &quot;{res.override_reason}&quot;
                              </div>
                            )}
                          </div>

                          <div className="shrink-0">
                            <button
                              type="button"
                              disabled={!canPerform('canOverrideCompliance')}
                              onClick={() => {
                                if (overrideResultId === res.id) {
                                  setOverrideResultId(null);
                                } else {
                                  handleOpenOverrideDrawer(res);
                                }
                              }}
                              className={`px-2.5 py-1 text-[11px] font-semibold border rounded transition-colors ${
                                canPerform('canOverrideCompliance')
                                  ? 'border-[#C6C4BA] hover:bg-[#F2F1EC] text-[#1A1917] cursor-pointer'
                                  : 'border-[#E2E0D8] text-[#A8A69E] bg-[#F7F7F5] cursor-not-allowed'
                              }`}
                              title={canPerform('canOverrideCompliance') ? undefined : "Compliance overrides restricted to Compliance Officer or Administrator"}
                            >
                              {overrideResultId === res.id ? 'Cancel Override' : 'Record Override'}
                            </button>
                          </div>
                        </div>

                        {/* Inline Human Override Form Drawer */}
                        {overrideResultId === res.id && (
                          <div className="mt-3 p-3.5 bg-[#FAF5FF] border border-[#E9D5FF] rounded space-y-3">
                            <div className="flex items-center justify-between">
                              <h5 className="font-bold text-xs text-[#6B21A8]">
                                Record Human Compliance Override ({res.rule_key})
                              </h5>
                              <span className="text-[10px] text-[#7E22CE] font-mono">
                                Automated Finding: <strong>{res.original_status || res.status}</strong>
                              </span>
                            </div>
                            <p className="text-[11px] text-[#581C87] leading-relaxed">
                              Human overrides require institutional rationale. The original automated evaluation remains recorded in audit logs.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                                  Override Status Target <span className="text-[#8A1E20]">*</span>
                                </label>
                                <select
                                  value={overrideStatus}
                                  onChange={(e) => setOverrideStatus(e.target.value)}
                                  className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-semibold"
                                >
                                  <option value="COMPLIANT">COMPLIANT (Satisfied via manual verification)</option>
                                  <option value="NOT_APPLICABLE">NOT_APPLICABLE (Exempt under special circular)</option>
                                  <option value="NEEDS_REVIEW">NEEDS_REVIEW (Pending committee inspection)</option>
                                </select>
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                                  Mandatory Justification / Reviewer Notes <span className="text-[#8A1E20]">*</span>
                                </label>
                                <input
                                  type="text"
                                  placeholder="e.g. Physical municipal fire NOC verified with Chief Fire Officer receipt #58204"
                                  value={overrideReason}
                                  onChange={(e) => setOverrideReason(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setOverrideResultId(null)}
                                className="px-3 py-1 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs hover:bg-[#F2F1EC]"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingOverride}
                                onClick={handleSaveOverride}
                                className="px-3.5 py-1 bg-[#6B21A8] text-white text-xs font-bold rounded hover:bg-[#581C87] disabled:opacity-50 transition-colors shadow-xs"
                              >
                                {savingOverride ? 'Logging Override...' : 'Commit Human Override to Audit Trail'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'transition' && (
            <div className="space-y-4 max-w-xl">
              <div className="p-3.5 bg-[#FAF9F5] border border-[#E2E0D8] rounded">
                <h4 className="font-bold text-xs text-[#1A1917] mb-1">Workflow State Machine Transition</h4>
                <p className="text-[11px] text-[#5E5D57] leading-relaxed">
                  Advancing or returning a case stage requires explicit action, justified reasoning, and is logged in the permanent audit trail.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                  Target Next Stage <span className="text-[#8A1E20]">*</span>
                </label>
                <select
                  value={selectedNextStage}
                  onChange={(e) => setSelectedNextStage(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-medium"
                >
                  {detail.allowed_next_stages && detail.allowed_next_stages.length > 0 ? (
                    detail.allowed_next_stages.map((stg: string) => (
                      <option key={stg} value={stg}>{stg}</option>
                    ))
                  ) : (
                    <option value="">No allowed next transitions (Case Closed)</option>
                  )}
                </select>
                <span className="text-[10px] text-[#5E5D57] mt-1 block">
                  Only valid stages permitted from current stage (<strong>{detail.current_stage}</strong>) are listed.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                  Justification / Transition Reason <span className="text-[#8A1E20]">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Record why this case is advancing or being returned (e.g. all affidavits verified, or deficiency noted)..."
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleStageTransition}
                  disabled={transitioning || !selectedNextStage}
                  className="px-4 py-2 bg-[#1E3A8A] text-white font-bold rounded hover:bg-[#172554] transition-colors disabled:opacity-50 text-xs"
                >
                  {transitioning ? 'Executing Transition...' : `Advance Stage to ${selectedNextStage || '...'} →`}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-2">
              <div className="p-3 border border-[#E2E0D8] rounded flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-[#1A1917]">Verify Fire Safety renewal application submission</div>
                  <div className="text-[10px] text-[#5E5D57]">Assignee: {detail.internal_owner_name} | Due: In 4 days</div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#EDF2F7] text-[#1E3A8A] border border-[#CAD6E2] rounded">
                  IN_PROGRESS
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div className="text-[11px] text-[#5E5D57]">
            Deterministic APH 2024-27 Rule Engine • Zero Fabricated Citations
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                setActiveTab('compliance');
                setErrorNotice(null);
                if (complianceResults.length === 0 && detail?.id) {
                  await loadCaseCompliance(detail.id);
                }
              }}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors"
            >
              Inspect Compliance Checks →
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-[#1A1917] bg-[#FFFFFF] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Internal Review Pack Dossier Modal */}
      <ReviewPackModal
        caseId={detail?.id || null}
        isOpen={showReviewPack}
        onClose={() => setShowReviewPack(false)}
      />
    </div>
  );
};
