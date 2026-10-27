'use client';

import React, { useState } from 'react';
import { createCaseApi } from '../services/api';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaseCreated: (newCase: any) => void;
}

export const CreateCaseModal: React.FC<CreateCaseModalProps> = ({ isOpen, onClose, onCaseCreated }) => {
  const [formData, setFormData] = useState({
    institute_name: '',
    aicte_permanent_id: '',
    institute_type: 'PRIVATE_SELF_FINANCED',
    state: 'Maharashtra',
    district: 'Pune',
    workflow_type: 'EXTENSION_OF_APPROVAL',
    academic_period: '2025-2026',
    priority: 'MEDIUM',
    internal_owner_name: '',
    target_date: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.institute_name.trim()) {
      setErrorMsg('Institution name is required.');
      return;
    }
    if (!formData.internal_owner_name.trim()) {
      setErrorMsg('Internal coordinator/owner name is required.');
      return;
    }
    if (!formData.target_date) {
      setErrorMsg('Target deadline date is required.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const created = await createCaseApi(formData);
      onCaseCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create case record.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden text-[#1A1917]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[#1A1917]">
              Create Approval Workflow Case
            </h2>
            <p className="text-xs text-[#5E5D57]">
              Initialize a new institutional approval tracking record with validated metadata and deadline SLA.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-[#5E5D57] hover:text-[#1A1917] px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
            {errorMsg && (
              <div className="p-3 bg-[#FDF0F0] border border-[#F0C4C4] rounded text-[#8A1E20] font-medium">
                {errorMsg}
              </div>
            )}

            {/* Institution Profile */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#5E5D57] border-b border-[#F2F1EC] pb-1">
                Institution Profile
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Institution Name <span className="text-[#8A1E20]">*</span>
                  </label>
                  <input
                    type="text"
                    name="institute_name"
                    required
                    placeholder="e.g. Pune Institute of Computer Technology"
                    value={formData.institute_name}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] focus:ring-1 focus:ring-[#1E3A8A] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Permanent AICTE ID (If assigned)
                  </label>
                  <input
                    type="text"
                    name="aicte_permanent_id"
                    placeholder="e.g. 1-419208111"
                    value={formData.aicte_permanent_id}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] focus:ring-1 focus:ring-[#1E3A8A] font-tabular text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Institution Type
                  </label>
                  <select
                    name="institute_type"
                    value={formData.institute_type}
                    onChange={handleChange}
                    className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  >
                    <option value="PRIVATE_SELF_FINANCED">Private Self-Financed</option>
                    <option value="GOVT_AIDED">Government-Aided</option>
                    <option value="GOVERNMENT">Government</option>
                    <option value="DEEMED_UNIVERSITY">Deemed University</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">State</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">District</label>
                  <input
                    type="text"
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Approval Case Scope */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#5E5D57] border-b border-[#F2F1EC] pb-1">
                Approval Case Scope
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Workflow Category
                  </label>
                  <select
                    name="workflow_type"
                    value={formData.workflow_type}
                    onChange={handleChange}
                    className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  >
                    <option value="EXTENSION_OF_APPROVAL">Extension of Approval (EoA)</option>
                    <option value="NEW_INSTITUTION">Grant of Approval for New Institution</option>
                    <option value="INCREASE_IN_INTAKE">Increase in Intake in Existing Program</option>
                    <option value="NEW_COURSE">Introduction of New Course / Program</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Academic Cycle
                  </label>
                  <input
                    type="text"
                    name="academic_period"
                    value={formData.academic_period}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Internal Owner / Coordinator <span className="text-[#8A1E20]">*</span>
                  </label>
                  <input
                    type="text"
                    name="internal_owner_name"
                    required
                    placeholder="e.g. Dr. A. Sharma"
                    value={formData.internal_owner_name}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Priority
                  </label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="w-full px-2 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                    Target Submission Deadline <span className="text-[#8A1E20]">*</span>
                  </label>
                  <input
                    type="date"
                    name="target_date"
                    required
                    value={formData.target_date}
                    onChange={handleChange}
                    className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs font-tabular"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#1A1917] mb-1">
                  Case Notes / Initial Remarks
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Record initial statutory requirements, accreditation goals, or department remarks..."
                  value={formData.notes}
                  onChange={handleChange}
                  className="w-full px-2.5 py-1.5 border border-[#C6C4BA] rounded bg-[#FFFFFF] text-xs"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-3.5 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
            <span className="text-[11px] text-[#5E5D57]">
              Initializes in <strong>Draft</strong> stage. Audit event will be logged.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-medium text-[#1A1917] bg-[#FFFFFF] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Case Record →'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
