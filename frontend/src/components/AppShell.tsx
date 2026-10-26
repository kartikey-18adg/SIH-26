'use client';

import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Header } from './Header';
import { FirstRunModal } from './FirstRunModal';
import { DataSourceSettingsModal } from './DataSourceSettingsModal';
import { ImportDataModal } from './ImportDataModal';
import { CreateCaseModal } from './CreateCaseModal';
import { CaseDetailModal } from './CaseDetailModal';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    summary,
    activeMode,
    loadData,
    selectedCase,
    setSelectedCase,
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
  } = useWorkspace();

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#1A1917] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        activeMode={activeMode}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenImport={() => setShowImportModal(true)}
        onOpenNewCase={() => setShowCreateCaseModal(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      {/* Institutional Legal Disclaimer Footer */}
      <footer className="border-t border-[#E2E0D8] bg-[#FFFFFF] py-4 text-center text-xs text-[#89877E] px-4">
        <p className="max-w-4xl mx-auto leading-relaxed">
          <strong>AIClear Prototype Disclaimer:</strong> This system is an independent administrative workflow management application. It is not affiliated with, authorized by, or endorsed by the All India Council for Technical Education (AICTE). No automated AI checks can replace official regulatory inspection or grant statutory approval. Always cross-reference all deficiency items directly with the official AICTE Approval Process Handbook (2024–2027).
        </p>
      </footer>

      {/* First-Run Source Choice Modal */}
      <FirstRunModal
        isOpen={showFirstRunModal}
        onSelectMode={handleFirstRunSelect}
        onClose={() => setShowFirstRunModal(false)}
      />

      {/* Data Source Settings Modal */}
      <DataSourceSettingsModal
        isOpen={showSettingsModal}
        currentMode={activeMode}
        onSwitchMode={handleSwitchMode}
        onClose={() => setShowSettingsModal(false)}
        onOpenImport={() => {
          setShowSettingsModal(false);
          setShowImportModal(true);
        }}
        onRefreshDashboard={loadData}
      />

      {/* Import Data Modal */}
      <ImportDataModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={loadData}
      />

      {/* Case Details Drawer / Modal */}
      <CaseDetailModal
        caseItem={selectedCase}
        onClose={() => setSelectedCase(null)}
        onRefreshData={loadData}
      />

      {/* Create Case Modal */}
      <CreateCaseModal
        isOpen={showCreateCaseModal}
        onClose={() => setShowCreateCaseModal(false)}
        onCaseCreated={(newCase) => {
          loadData();
          setSelectedCase(newCase);
        }}
      />
    </div>
  );
};
