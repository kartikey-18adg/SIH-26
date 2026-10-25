'use client';

import React, { useState } from 'react';
import { DataMode } from '../types/aiclear';

interface FirstRunModalProps {
  isOpen: boolean;
  onSelectMode: (mode: DataMode) => Promise<void>;
  onClose: () => void;
}

export const FirstRunModal: React.FC<FirstRunModalProps> = ({ isOpen, onSelectMode, onClose }) => {
  const [selectedMode, setSelectedMode] = useState<DataMode>('DEMO');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onSelectMode(selectedMode);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to initialize workspace data mode');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-xl overflow-hidden text-[#1A1917]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[#1A1917]">Workspace Data Source Setup</h2>
            <p className="text-xs text-[#5E5D57] mt-0.5">
              Select the initial data mode for institutional approval workflows and compliance monitoring.
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-[#EAF0F6] text-[#1E3A8A] border border-[#CAD6E2] rounded">
            FIRST-RUN CONFIGURATION
          </span>
        </div>

        {/* Notice */}
        <div className="px-6 py-3 bg-[#FDF6E4] border-b border-[#EBD9A4] text-xs text-[#855304] leading-relaxed">
          <strong>Non-Endorsement Notice:</strong> AIClear is an independent institutional workflow prototype and is not an official AICTE portal. No official approval can be granted through this prototype.
        </div>

        {/* Options */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* 1. Demo Workspace */}
          <label 
            className={`block p-4 border rounded cursor-pointer transition-colors ${
              selectedMode === 'DEMO' 
                ? 'border-[#1E3A8A] bg-[#F8FAFC]' 
                : 'border-[#E2E0D8] bg-[#FFFFFF] hover:bg-[#F7F7F5]'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="dataSource"
                value="DEMO"
                checked={selectedMode === 'DEMO'}
                onChange={() => setSelectedMode('DEMO')}
                className="mt-1 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#1A1917]">1. Demo Workspace</span>
                  <span className="text-[10px] font-semibold bg-[#EAF5EE] text-[#1C4D35] border border-[#B8DFC8] px-1.5 py-0.2 rounded">
                    RECOMMENDED
                  </span>
                  <span className="text-[10px] font-mono text-[#5E5D57]">
                    SYNTHETIC DATA
                  </span>
                </div>
                <p className="text-xs text-[#5E5D57] mt-1 leading-relaxed">
                  Loads 5 synthetic technical institutions and approval cases (<code className="text-[#1E3A8A]">AICTE-DEMO-014</code> to <code className="text-[#1E3A8A]">018</code>), realistic evidence files, illustrative compliance checks, and simulated alerts. Clearly isolated and resettable.
                </p>
              </div>
            </div>
          </label>

          {/* 2. Import My Data */}
          <label 
            className={`block p-4 border rounded cursor-pointer transition-colors ${
              selectedMode === 'IMPORTED' 
                ? 'border-[#1E3A8A] bg-[#F8FAFC]' 
                : 'border-[#E2E0D8] bg-[#FFFFFF] hover:bg-[#F7F7F5]'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="dataSource"
                value="IMPORTED"
                checked={selectedMode === 'IMPORTED'}
                onChange={() => setSelectedMode('IMPORTED')}
                className="mt-1 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#1A1917]">2. Import My Data</span>
                  <span className="text-[10px] font-mono text-[#5E5D57] border border-[#E2E0D8] px-1.5 py-0.2 rounded bg-[#F7F7F5]">
                    CSV / XLSX / PDF
                  </span>
                </div>
                <p className="text-xs text-[#5E5D57] mt-1 leading-relaxed">
                  Upload institutional schedules (faculty rolls, built-up area statements, deficiency checklists). Validates columns, reports row errors, and records SHA-256 provenance before database commit.
                </p>
              </div>
            </div>
          </label>

          {/* 3. Connect an Official / Public Source */}
          <label 
            className={`block p-4 border rounded cursor-pointer transition-colors ${
              selectedMode === 'CONNECTED' 
                ? 'border-[#855304] bg-[#FFFDF7]' 
                : 'border-[#E2E0D8] bg-[#FFFFFF] hover:bg-[#F7F7F5]'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="dataSource"
                value="CONNECTED"
                checked={selectedMode === 'CONNECTED'}
                onChange={() => setSelectedMode('CONNECTED')}
                className="mt-1 text-[#855304] focus:ring-[#855304]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#1A1917]">3. Connect an Official / Public Source</span>
                  <span className="text-[10px] font-mono bg-[#FDF6E4] text-[#855304] border border-[#EBD9A4] px-1.5 py-0.2 rounded">
                    RESTRICTED
                  </span>
                </div>
                <p className="text-xs text-[#5E5D57] mt-1 leading-relaxed">
                  Investigate verified live connectors (AICTE APH 2024-27, AISHE, ONOD).
                </p>
                <div className="mt-2 p-2 bg-[#F7F7F5] border border-[#E2E0D8] rounded text-[11px] text-[#5E5D57]">
                  <strong>Source Verification Status:</strong> AICTE portal and ONOD APIs require authenticated institutional credentials and NETF authorization. No anonymous public REST API is available. Automated sync is disabled to avoid violating terms.
                </div>
              </div>
            </div>
          </label>

          {/* 4. Enter Data Manually */}
          <label 
            className={`block p-4 border rounded cursor-pointer transition-colors ${
              selectedMode === 'MANUAL' 
                ? 'border-[#1E3A8A] bg-[#F8FAFC]' 
                : 'border-[#E2E0D8] bg-[#FFFFFF] hover:bg-[#F7F7F5]'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="dataSource"
                value="MANUAL"
                checked={selectedMode === 'MANUAL'}
                onChange={() => setSelectedMode('MANUAL')}
                className="mt-1 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#1A1917]">4. Enter Data Manually</span>
                </div>
                <p className="text-xs text-[#5E5D57] mt-1 leading-relaxed">
                  Initialize a clean, blank workspace. Create approval cases, attach evidence records, and assign team owners through structured administrative forms.
                </p>
              </div>
            </div>
          </label>
        </div>

        {errorMsg && (
          <div className="px-6 py-2 bg-[#FDF0F0] border-t border-[#F0C4C4] text-xs text-[#8A1E20]">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <button
            type="button"
            onClick={async () => {
              // Continue with default demo mode
              await onSelectMode('DEMO');
              onClose();
            }}
            className="text-xs text-[#5E5D57] hover:text-[#1A1917] underline underline-offset-2"
          >
            Configure later (Continue with demo mode)
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-1.5 text-xs font-medium text-white bg-[#1E3A8A] hover:bg-[#172554] rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Initializing...' : 'Confirm Workspace Setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
