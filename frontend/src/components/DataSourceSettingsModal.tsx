'use client';

import React, { useState, useEffect } from 'react';
import { DataMode, SourceRegistryItem } from '../types/aiclear';
import { fetchSources, resetDemoWorkspace } from '../services/api';

interface DataSourceSettingsModalProps {
  isOpen: boolean;
  currentMode: DataMode;
  onSwitchMode: (mode: DataMode) => Promise<void>;
  onClose: () => void;
  onRefreshDashboard: () => void;
}

export const DataSourceSettingsModal: React.FC<DataSourceSettingsModalProps> = ({
  isOpen,
  currentMode,
  onSwitchMode,
  onClose,
  onRefreshDashboard
}) => {
  const [sources, setSources] = useState<SourceRegistryItem[]>([]);
  const [targetMode, setTargetMode] = useState<DataMode>(currentMode);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTargetMode(currentMode);
      setMessage(null);
      fetchSources()
        .then(res => setSources(res.sources))
        .catch(err => console.error('Failed to load sources:', err));
    }
  }, [isOpen, currentMode]);

  if (!isOpen) return null;

  const handleModeChange = async () => {
    if (targetMode === currentMode) return;
    setLoading(true);
    setMessage(null);
    try {
      await onSwitchMode(targetMode);
      setMessage(`Workspace data mode switched to ${targetMode}.`);
      onRefreshDashboard();
    } catch (err: any) {
      setMessage(`Error switching mode: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDemo = async () => {
    if (!confirm('Re-seed the synthetic demo workspace? This will restore the 5 demo cases (AICTE-DEMO-014 to 018). Any authentic imported records will NOT be deleted.')) {
      return;
    }
    setResetting(true);
    try {
      const res = await resetDemoWorkspace();
      setMessage(res.message);
      onRefreshDashboard();
    } catch (err: any) {
      setMessage(`Failed to reset demo: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden text-[#1A1917]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[#1A1917]">Settings: Workspace Data Sources</h2>
            <p className="text-xs text-[#5E5D57]">
              Manage the operational data baseline, verify source connectors, and control workspace isolation.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-[#5E5D57] hover:text-[#1A1917] px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Active Mode Controller */}
          <div className="border border-[#E2E0D8] rounded p-4 bg-[#FBFBF9]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5E5D57] mb-2">
              Active Data Mode
            </h3>
            <p className="text-xs text-[#5E5D57] mb-3">
              Switching modes re-filters the operational workspace. It never deletes or silently migrates existing authentic records.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { id: 'DEMO', label: 'Demo Mode', sub: 'Synthetic Seed Data' },
                { id: 'IMPORTED', label: 'Imported Mode', sub: 'CSV/XLSX Uploads' },
                { id: 'MANUAL', label: 'Manual Mode', sub: 'User-entered Records' },
                { id: 'CONNECTED', label: 'Connected Mode', sub: 'Verified Connectors' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTargetMode(m.id as DataMode)}
                  className={`p-2.5 text-left border rounded transition-all ${
                    targetMode === m.id
                      ? 'border-[#1E3A8A] bg-[#FFFFFF] ring-1 ring-[#1E3A8A]'
                      : 'border-[#E2E0D8] bg-[#FFFFFF] hover:bg-[#F2F1EC]'
                  }`}
                >
                  <div className="text-xs font-semibold text-[#1A1917]">{m.label}</div>
                  <div className="text-[10px] text-[#5E5D57] font-mono mt-0.5">{m.sub}</div>
                  {currentMode === m.id && (
                    <span className="inline-block mt-1.5 text-[9px] uppercase font-bold text-[#1C4D35] bg-[#EAF5EE] border border-[#B8DFC8] px-1 py-0.2 rounded">
                      Current Active
                    </span>
                  )}
                </button>
              ))}
            </div>

            {targetMode !== currentMode && (
              <div className="mt-4 p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded flex items-center justify-between">
                <span className="text-xs text-[#166534]">
                  Confirm switch to <strong>{targetMode}</strong> mode? This will load only records associated with this mode.
                </span>
                <button
                  type="button"
                  onClick={handleModeChange}
                  disabled={loading}
                  className="px-3 py-1 bg-[#15803D] text-white text-xs font-medium rounded hover:bg-[#166534] transition-colors"
                >
                  {loading ? 'Switching...' : 'Apply Mode Change'}
                </button>
              </div>
            )}
          </div>

          {/* Reset Demo Section */}
          <div className="border border-[#E2E0D8] rounded p-4 bg-[#FFFFFF] flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-[#1A1917]">Reset Synthetic Demo Data</h4>
              <p className="text-xs text-[#5E5D57] mt-0.5">
                Restores the standard 5 demo cases (AICTE-DEMO-014 through 018). Any authentic imported institutional files remain strictly untouched.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetDemo}
              disabled={resetting}
              className="px-3 py-1.5 border border-[#C6C4BA] hover:bg-[#F2F1EC] text-xs font-medium rounded transition-colors text-[#1A1917]"
            >
              {resetting ? 'Resetting...' : 'Reset Demo Records'}
            </button>
          </div>

          {/* Verified Source Feasibility Register */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#5E5D57]">
                Live Source Registry & Verification Status
              </h3>
              <span className="text-[11px] text-[#5E5D57]">
                Source Feasibility Matrix (APH 2024-27 Specification)
              </span>
            </div>

            <div className="border border-[#E2E0D8] rounded overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F7F7F5] border-b border-[#E2E0D8] text-[#5E5D57]">
                    <th className="py-2 px-3 font-semibold">Source Name</th>
                    <th className="py-2 px-3 font-semibold">Type</th>
                    <th className="py-2 px-3 font-semibold">Verification Status</th>
                    <th className="py-2 px-3 font-semibold">Access Reality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E0D8]">
                  {sources.map(s => {
                    const statusBadge = {
                      'VERIFIED_AVAILABLE': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]',
                      'VERIFIED_RESTRICTED': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
                      'MANUAL_IMPORT_ONLY': 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]',
                      'NEEDS_CONFIRMATION': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]'
                    }[s.verification_status] || 'bg-gray-100 text-gray-800';

                    return (
                      <tr key={s.id} className="hover:bg-[#FBFBF9]">
                        <td className="py-2 px-3">
                          <div className="font-medium text-[#1A1917]">{s.source_name}</div>
                          {s.canonical_url && (
                            <a 
                              href={s.canonical_url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-[10px] text-[#1E3A8A] hover:underline block truncate max-w-xs"
                            >
                              {s.canonical_url}
                            </a>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[#5E5D57] font-mono text-[11px]">
                          {s.source_type}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border rounded ${statusBadge}`}>
                            {s.verification_status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#5E5D57] text-[11px] max-w-xs">
                          {s.metadata_json?.protocol || s.metadata_json?.access_method || s.metadata_json?.edition || s.metadata_json?.allowed_formats?.join(', ') || 'Official baseline'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {message && (
            <div className="p-3 bg-[#F2F1EC] border border-[#C6C4BA] rounded text-xs text-[#1A1917]">
              {message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-[#1A1917] bg-[#FFFFFF] border border-[#C6C4BA] hover:bg-[#F2F1EC] rounded transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
