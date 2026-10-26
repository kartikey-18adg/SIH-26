'use client';

import React, { useState } from 'react';
import { uploadAndPreviewCsv, commitIngestionBatch, fetchCsvTemplate } from '../services/api';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ImportDataModal: React.FC<ImportDataModalProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    await processFile(selectedFile);
  };

  const processFile = async (f: File) => {
    setLoading(true);
    setErrorMsg(null);
    setPreviewData(null);
    try {
      const data = await uploadAndPreviewCsv(f);
      setPreviewData(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse and validate CSV file.');
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Load Representative Sample File for instant hackathon walkthrough
  const handleLoadSample = async () => {
    setLoading(true);
    setErrorMsg(null);
    setPreviewData(null);
    try {
      const sampleCsv = `aicte_permanent_id,institute_name,institute_type,state,district,case_reference,workflow_type,academic_period,current_stage,priority,internal_owner_name,target_date,notes
1-419208111,Pune Institute of Advanced Technology,PRIVATE_SELF_FINANCED,Maharashtra,Pune,PIAT-EOA-2025,EXTENSION_OF_APPROVAL,2025-2026,DOCUMENT_REVIEW,HIGH,Dr. V. Sharma,2026-11-15,Annual Extension of Approval filing with Fire NOC and Building Occupancy certificate
1-529011234,Sahyadri College of Engineering & Research,GOVT_AIDED,Karnataka,Mangaluru,SCER-INTAKE-01,INCREASE_IN_INTAKE,2025-2026,COMPLIANCE_CHECKS,MEDIUM,Prof. K. Rao,2026-11-20,Intake expansion in Artificial Intelligence & Data Science from 60 to 120 seats
1-772109832,Indira National Technical Academy,PRIVATE_SELF_FINANCED,Tamil Nadu,Chennai,INTA-NEW-003,NEW_COURSE,2025-2026,INTERNAL_REVIEW,CRITICAL,Dean S. Subramanian,2026-11-28,New M.Tech in Cyber Security; syllabus approved by Academic Council
1-998811220,Malformed Technical College,GOVERNMENT,Delhi,Central Delhi,MAL-ERR-999,EXTENSION_OF_APPROVAL,2025-2026,DRAFT,LOW,Admin User,invalid-date-format,Invalid row for testing error detection and rejection report`;

      const blob = new Blob([sampleCsv], { type: 'text/csv' });
      const sampleFile = new File([blob], 'representative_institutional_filings.csv', { type: 'text/csv' });
      setFile(sampleFile);
      const data = await uploadAndPreviewCsv(sampleFile);
      setPreviewData(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load representative sample file.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetchCsvTemplate();
      const blob = new Blob([res.content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMsg('Failed to download template: ' + err.message);
    }
  };

  const handleCommit = async () => {
    if (!previewData || !previewData.valid_records || previewData.valid_records.length === 0) return;
    setCommitting(true);
    setErrorMsg(null);
    try {
      const res = await commitIngestionBatch(
        previewData.preview_token,
        previewData.file_name,
        previewData.file_sha256,
        previewData.valid_records
      );
      setSuccessMsg(res.message);
      setTimeout(() => {
        onImportComplete();
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to commit ingestion batch.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-4xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#1A1917]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[#1A1917]">
              Institutional Data Ingestion Workstation
            </h2>
            <p className="text-xs text-[#5E5D57]">
              Upload institutional CSV schedules. Previews columns, reports rejected rows, and records SHA-256 provenance before database commit.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-[#5E5D57] hover:text-[#1A1917] px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Action Controls Bar */}
        <div className="px-6 py-3 bg-[#FAF9F5] border-b border-[#E2E0D8] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 text-xs font-medium text-[#1A1917] bg-[#FFFFFF] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded cursor-pointer transition-colors">
              <span>Choose CSV File</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-[#1E3A8A] bg-[#EAF0F6] border border-[#CAD6E2] hover:bg-[#DCE6F2] rounded transition-colors"
            >
              ⚡ Load Representative Sample File
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 text-xs text-[#5E5D57] hover:text-[#1A1917] border border-[#E2E0D8] bg-[#FFFFFF] rounded transition-colors"
            >
              Download Schema Template
            </button>
          </div>

          {file && (
            <span className="text-xs font-mono text-[#5E5D57] truncate max-w-xs">
              Selected: <strong>{file.name}</strong>
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs space-y-5">
          {loading && (
            <div className="py-12 text-center text-xs text-[#5E5D57]">
              <div className="inline-block animate-pulse font-medium">
                Parsing CSV schema, calculating SHA-256 checksum & validating rows...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-[#FDF0F0] border border-[#F0C4C4] rounded text-xs text-[#8A1E20]">
              <strong>Validation Error:</strong> {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-[#EAF5EE] border border-[#B8DFC8] rounded text-xs text-[#1C4D35] font-semibold">
              ✓ {successMsg}
            </div>
          )}

          {!loading && !previewData && !errorMsg && (
            <div className="border border-dashed border-[#C6C4BA] rounded-lg p-10 text-center bg-[#FAF9F5]">
              <div className="text-sm font-semibold text-[#1A1917]">No file selected for preview</div>
              <p className="text-xs text-[#5E5D57] mt-1 max-w-md mx-auto">
                Upload your institutional CSV or click <strong>&quot;Load Representative Sample File&quot;</strong> to inspect row-level error validation and commit genuine institutional cases into the database.
              </p>
            </div>
          )}

          {!loading && previewData && (
            <div className="space-y-4">
              {/* Provenance Header Strip */}
              <div className="bg-[#FBFBF9] border border-[#E2E0D8] rounded p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold text-[#1A1917]">
                    File: <span className="font-mono">{previewData.file_name}</span>
                  </div>
                  <div className="text-[10px] text-[#5E5D57] font-mono mt-0.5">
                    SHA-256: {previewData.file_sha256}
                  </div>
                </div>

                <div className="flex items-center gap-2 font-tabular">
                  <span className="px-2 py-0.5 bg-[#FFFFFF] border border-[#E2E0D8] rounded text-[11px] text-[#5E5D57]">
                    Total Rows: <strong>{previewData.total_rows}</strong>
                  </span>
                  <span className="px-2 py-0.5 bg-[#EAF5EE] border border-[#B8DFC8] text-[#1C4D35] rounded text-[11px] font-bold">
                    Valid Rows: <strong>{previewData.valid_count}</strong>
                  </span>
                  {previewData.error_count > 0 && (
                    <span className="px-2 py-0.5 bg-[#FDF0F0] border border-[#F0C4C4] text-[#8A1E20] rounded text-[11px] font-bold">
                      Rejected Rows: <strong>{previewData.error_count}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Row Errors Rejection Report */}
              {previewData.row_errors && previewData.row_errors.length > 0 && (
                <div className="border border-[#F0C4C4] rounded bg-[#FFFDFD] p-3">
                  <h4 className="text-xs font-bold text-[#8A1E20] mb-2 uppercase tracking-wide">
                    ⚠️ Validation Rejection Report ({previewData.row_errors.length} Rows Flagged)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-[#F0C4C4] text-[#8A1E20]">
                          <th className="py-1 px-2 font-bold">Row #</th>
                          <th className="py-1 px-2 font-bold">Field</th>
                          <th className="py-1 px-2 font-bold">Error Message</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F9E5E5]">
                        {previewData.row_errors.map((err: any, idx: number) => (
                          <tr key={idx}>
                            <td className="py-1 px-2 font-tabular font-bold text-[#8A1E20]">Row {err.row_number}</td>
                            <td className="py-1 px-2 font-mono text-[#1A1917]">{err.field}</td>
                            <td className="py-1 px-2 text-[#8A1E20]">{err.error_message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Valid Records Pre-Commit Table */}
              <div>
                <h4 className="text-xs font-bold text-[#1A1917] mb-2 uppercase tracking-wide">
                  Valid Records Ready for Commit ({previewData.valid_count} Cases)
                </h4>
                <div className="border border-[#E2E0D8] rounded overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F7F7F5] border-b border-[#E2E0D8] text-[#5E5D57]">
                        <th className="py-2 px-3 font-semibold">Case Reference</th>
                        <th className="py-2 px-3 font-semibold">Institution Name</th>
                        <th className="py-2 px-3 font-semibold">Permanent AICTE ID</th>
                        <th className="py-2 px-3 font-semibold">Workflow</th>
                        <th className="py-2 px-3 font-semibold">Target Date</th>
                        <th className="py-2 px-3 font-semibold">Internal Owner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E0D8]">
                      {previewData.valid_records.map((rec: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#FBFBF9]">
                          <td className="py-2 px-3 font-tabular font-bold text-[#1E3A8A]">{rec.case_reference}</td>
                          <td className="py-2 px-3 font-medium text-[#1A1917]">{rec.institute_name}</td>
                          <td className="py-2 px-3 font-tabular text-[#5E5D57]">{rec.aicte_permanent_id}</td>
                          <td className="py-2 px-3 text-[#5E5D57]">{rec.workflow_type}</td>
                          <td className="py-2 px-3 font-tabular">{rec.target_date}</td>
                          <td className="py-2 px-3 text-[#1A1917]">{rec.internal_owner_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div className="text-[11px] text-[#5E5D57]">
            Integrity check: Records committed with data_mode = &apos;IMPORTED&apos; and isolated from demo data.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-[#1A1917] bg-[#FFFFFF] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded transition-colors"
            >
              Cancel
            </button>
            {previewData && previewData.can_commit && (
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#15803D] hover:bg-[#166534] rounded transition-colors disabled:opacity-50"
              >
                {committing ? 'Committing...' : `Commit ${previewData.valid_count} Records & Switch Mode →`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
