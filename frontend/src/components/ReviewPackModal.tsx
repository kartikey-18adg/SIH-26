'use client';

import React, { useState, useEffect } from 'react';
import { fetchCaseReviewPackApi, getCaseExportJsonUrl } from '../services/api';

interface ReviewPackModalProps {
  caseId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ReviewPackModal: React.FC<ReviewPackModalProps> = ({ caseId, isOpen, onClose }) => {
  const [pack, setPack] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && caseId) {
      setLoading(true);
      setError(null);
      fetchCaseReviewPackApi(caseId)
        .then(data => setPack(data))
        .catch(err => setError(err.message || 'Failed to load Review Pack dossier.'))
        .finally(() => setLoading(false));
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 print:p-0 print:static print:bg-white">
      <div className="w-full max-w-4xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none text-[#1A1917]">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-6 py-3.5 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1917]">
              Internal Review Pack & Institutional Audit Dossier
            </h3>
            {pack && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#EDF2F7] text-[#2B3B4C] border border-[#CAD6E2] rounded font-tabular">
                {pack.case_reference}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {caseId && (
              <a
                href={getCaseExportJsonUrl(caseId)}
                download
                className="px-3 py-1 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917]"
              >
                📥 Download JSON
              </a>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1 text-xs font-bold bg-[#1E3A8A] text-white hover:bg-[#172554] rounded transition-colors"
            >
              🖨️ Print Dossier / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs font-semibold border border-[#C6C4BA] rounded hover:bg-[#E2E0D8] transition-colors"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Printable Dossier Scroll Container */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 print:p-0 print:overflow-visible">
          {loading ? (
            <div className="p-12 text-center text-xs text-[#5E5D57]">
              Compiling institutional review pack records...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-xs text-[#8A1E20] bg-[#FDF0F0] border border-[#F0C4C4] rounded">
              {error}
            </div>
          ) : pack ? (
            <div className="space-y-6 text-[#1A1917]">
              
              {/* Mandatory Top Disclaimer */}
              <div className="p-3 bg-[#FFFDF7] border border-[#EBD9A4] rounded text-[10px] text-[#855304] leading-relaxed">
                <strong className="block mb-0.5 uppercase tracking-wide">
                  ⚠️ Mandatory Regulatory Non-Endorsement Notice:
                </strong>
                {pack.disclaimer}
              </div>

              {/* Institution Header Block */}
              <div className="border-b-2 border-[#1A1917] pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#5E5D57]">
                      AIClear Institutional Compliance Dossier
                    </span>
                    <h1 className="text-xl font-bold tracking-tight text-[#1A1917] mt-0.5">
                      {pack.institution_name}
                    </h1>
                    <div className="text-xs text-[#5E5D57] font-tabular mt-1 space-x-3">
                      <span>AICTE Permanent ID: <strong>{pack.aicte_permanent_id || 'Not Assigned'}</strong></span>
                      <span>•</span>
                      <span>Type: <strong>{pack.institution_type}</strong></span>
                      <span>•</span>
                      <span>Location: <strong>{pack.district}, {pack.state}</strong></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-[#1E3A8A] block">
                      Ref: {pack.case_reference}
                    </span>
                    <span className="text-[10px] text-[#5E5D57] block mt-0.5">
                      Cycle: {pack.academic_period}
                    </span>
                    <span className="text-[10px] text-[#5E5D57] block font-tabular">
                      Generated: {new Date(pack.generated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-[#E2E0D8] text-xs">
                  <div>
                    <span className="text-[10px] text-[#5E5D57] block">Workflow Type:</span>
                    <strong className="font-semibold">{pack.workflow_type}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E5D57] block">Current Stage:</span>
                    <strong className="font-semibold">{pack.current_stage}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E5D57] block">Target Date:</span>
                    <strong className="font-semibold font-tabular">{pack.target_date} ({pack.days_remaining}d)</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E5D57] block">Internal Coordinator:</span>
                    <strong className="font-semibold">{pack.internal_owner_name}</strong>
                  </div>
                </div>
              </div>

              {/* Executive Summary Metrics */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917] mb-2 pb-1 border-b border-[#E2E0D8]">
                  I. Executive Readiness Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded text-center">
                    <span className="text-[10px] text-[#5E5D57] block uppercase">Approval Readiness</span>
                    <span className="text-xl font-bold font-tabular text-[#1E3A8A]">
                      {pack.executive_summary.approval_readiness_score}%
                    </span>
                  </div>
                  <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded text-center">
                    <span className="text-[10px] text-[#5E5D57] block uppercase">Evidence Files</span>
                    <span className="text-xl font-bold font-tabular text-[#1A1917]">
                      {pack.executive_summary.verified_documents} / {pack.executive_summary.total_documents}
                    </span>
                    <span className="text-[9px] text-[#5E5D57] block">Verified in Vault</span>
                  </div>
                  <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded text-center">
                    <span className="text-[10px] text-[#5E5D57] block uppercase">Compliance Rules</span>
                    <span className="text-xl font-bold font-tabular text-[#15803D]">
                      {pack.executive_summary.compliant_count} / {pack.executive_summary.total_compliance_rules}
                    </span>
                    <span className="text-[9px] text-[#5E5D57] block">Passed Norms</span>
                  </div>
                  <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded text-center">
                    <span className="text-[10px] text-[#5E5D57] block uppercase">Deficiencies / Flags</span>
                    <span className={`text-xl font-bold font-tabular ${pack.executive_summary.deficiencies_count > 0 ? 'text-[#8A1E20]' : 'text-[#15803D]'}`}>
                      {pack.executive_summary.deficiencies_count}
                    </span>
                    <span className="text-[9px] text-[#5E5D57] block">Requiring Action</span>
                  </div>
                </div>
              </div>

              {/* Evidence Inventory Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917] mb-2 pb-1 border-b border-[#E2E0D8]">
                  II. Statutory Evidence Vault Inventory
                </h3>
                <table className="w-full text-left text-xs border border-[#E2E0D8]">
                  <thead className="bg-[#FAF9F5] border-b border-[#E2E0D8] text-[10px] uppercase text-[#5E5D57]">
                    <tr>
                      <th className="p-2">Document Category</th>
                      <th className="p-2">Filename (v)</th>
                      <th className="p-2">Validity / Expiry</th>
                      <th className="p-2">SHA-256 Checksum</th>
                      <th className="p-2">Review Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E0D8]">
                    {pack.evidence_inventory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-[#5E5D57]">No evidence documents uploaded.</td>
                      </tr>
                    ) : (
                      pack.evidence_inventory.map((doc: any) => (
                        <tr key={doc.id} className="hover:bg-[#FBFBF9]">
                          <td className="p-2 font-semibold text-[#1A1917]">{doc.category}</td>
                          <td className="p-2 font-mono text-[11px]">{doc.original_filename} (v{doc.current_version})</td>
                          <td className={`p-2 font-tabular ${doc.is_expired ? 'text-[#8A1E20] font-bold' : ''}`}>
                            {doc.expiry_date} {doc.is_expired ? '(EXPIRED)' : ''}
                          </td>
                          <td className="p-2 font-mono text-[10px] text-[#5E5D57]">{doc.sha256_short}...</td>
                          <td className="p-2">
                            <span className="text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase">
                              {doc.review_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* APH Compliance Checklist */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917] mb-2 pb-1 border-b border-[#E2E0D8]">
                  III. AICTE APH 2024–2027 Compliance Audit
                </h3>
                <div className="space-y-2">
                  {pack.compliance_checklist.map((c: any, index: number) => (
                    <div key={`${c.rule_key}-${index}`} className="p-2.5 border border-[#E2E0D8] rounded text-xs bg-[#FFFFFF]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <strong className="text-[#1A1917]">{c.rule_key}: {c.rule_title}</strong>
                          <span className="text-[9px] font-bold px-1.5 py-0.2 border rounded uppercase">
                            {c.status}
                          </span>
                          {c.manual_override && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-[#F3E8FF] text-[#6B21A8] border border-[#D8B4FE] rounded">
                              MANUAL OVERRIDE
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#5E5D57] font-mono">
                          {c.citation}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5E5D57] mt-1">
                        <strong>Evaluation:</strong> {c.explanation}
                      </p>
                      {c.manual_override && (
                        <div className="mt-1 text-[10px] text-[#6B21A8] font-mono bg-[#FAF5FF] p-1 border border-[#E9D5FF] rounded">
                          Justification by {c.overridden_by}: &quot;{c.override_reason}&quot; (Automated was: {c.original_status})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage Transition History */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917] mb-2 pb-1 border-b border-[#E2E0D8]">
                  IV. Workflow Stage Audit Trail
                </h3>
                <div className="space-y-1.5">
                  {pack.stage_transitions.map((st: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-1.5 bg-[#FAF9F5] border border-[#E2E0D8] rounded">
                      <div>
                        <strong>{st.from_stage} ➔ {st.to_stage}</strong> by {st.changed_by}
                        <span className="text-[#5E5D57] ml-2 italic">&quot;{st.reason}&quot;</span>
                      </div>
                      <span className="text-[10px] text-[#89877E] font-tabular">
                        {new Date(st.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviewer Sign-Off Block */}
              <div className="pt-4 border-t-2 border-[#1A1917] page-break-inside-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917] mb-4">
                  V. Institutional Reviewer Sign-Off & Attestation
                </h3>
                <div className="grid grid-cols-3 gap-6 text-xs text-center">
                  <div className="border-t border-[#1A1917] pt-2">
                    <p className="font-bold text-[#1A1917]">{pack.sign_off_blocks.case_coordinator.name}</p>
                    <p className="text-[10px] text-[#5E5D57]">{pack.sign_off_blocks.case_coordinator.title}</p>
                    <p className="text-[9px] text-[#89877E] font-tabular mt-1">Date: {pack.sign_off_blocks.case_coordinator.date}</p>
                  </div>
                  <div className="border-t border-[#1A1917] pt-2">
                    <p className="font-bold text-[#1A1917]">{pack.sign_off_blocks.compliance_officer.name}</p>
                    <p className="text-[10px] text-[#5E5D57]">{pack.sign_off_blocks.compliance_officer.title}</p>
                    <p className="text-[9px] text-[#89877E] font-tabular mt-1">Signature & Date: _________________</p>
                  </div>
                  <div className="border-t border-[#1A1917] pt-2">
                    <p className="font-bold text-[#1A1917]">{pack.sign_off_blocks.head_of_institution.name}</p>
                    <p className="text-[10px] text-[#5E5D57]">{pack.sign_off_blocks.head_of_institution.title}</p>
                    <p className="text-[9px] text-[#89877E] font-tabular mt-1">Institutional Seal & Date: ________</p>
                  </div>
                </div>
              </div>

              {/* Bottom Mandatory Disclaimer */}
              <div className="p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded text-[9px] text-[#89877E] text-center leading-normal">
                {pack.disclaimer}
              </div>

            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center text-xs text-[#5E5D57] print:hidden">
          <span>AIClear Workflow Engine • APH 2024–27 Specification</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1A1917] text-white font-semibold rounded hover:bg-[#33322E] transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
