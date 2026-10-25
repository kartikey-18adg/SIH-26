'use client';

import React, { useState, useMemo } from 'react';
import { CaseSummaryItem } from '../types/aiclear';
import { getCasesExportCsvUrl, getComplianceExportCsvUrl } from '../services/api';

interface CasesTableProps {
  cases: CaseSummaryItem[];
  onSelectCase: (caseItem: CaseSummaryItem) => void;
}

export const CasesTable: React.FC<CasesTableProps> = ({ cases, onSelectCase }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      const matchSearch = (
        c.case_reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.institution_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.internal_owner_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      const matchStage = stageFilter === 'ALL' || c.current_stage === stageFilter;
      const matchPriority = priorityFilter === 'ALL' || c.priority === priorityFilter;
      return matchSearch && matchStage && matchPriority;
    });
  }, [cases, searchTerm, stageFilter, priorityFilter]);

  const uniqueStages = useMemo(() => {
    return Array.from(new Set(cases.map(c => c.current_stage)));
  }, [cases]);

  return (
    <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs overflow-hidden mb-6">
      {/* Table Header & Controls */}
      <div className="px-5 py-3 border-b border-[#E2E0D8] bg-[#F7F7F5] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1A1917]">Approval Workflow Cases</h3>
          <p className="text-[11px] text-[#5E5D57]">
            Active institutional cases requiring workflow actions, evidence validation, and compliance checks.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <input
            type="text"
            placeholder="Search ref, institute, owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2.5 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[#1A1917] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] w-52"
          />

          {/* Stage Filter */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[#1A1917] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
          >
            <option value="ALL">All Stages</option>
            {uniqueStages.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2 py-1 text-xs border border-[#C6C4BA] rounded bg-[#FFFFFF] text-[#1A1917] focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {/* Export Actions */}
          <div className="flex items-center gap-1.5 pl-1 border-l border-[#E2E0D8]">
            <a
              href={getCasesExportCsvUrl()}
              download
              className="px-2 py-1 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917]"
              title="Download all active cases in CSV format"
            >
              📥 Cases CSV
            </a>
            <a
              href={getComplianceExportCsvUrl()}
              download
              className="px-2 py-1 text-xs font-semibold border border-[#C6C4BA] bg-[#FFFFFF] hover:bg-[#F2F1EC] rounded transition-colors text-[#1A1917]"
              title="Download compliance results across all cases in CSV format"
            >
              📥 Compliance CSV
            </a>
          </div>
        </div>
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#FAF9F5] border-b border-[#E2E0D8] text-[#5E5D57]">
              <th className="py-2.5 px-4 font-semibold">Case Reference</th>
              <th className="py-2.5 px-4 font-semibold">Institution / AICTE ID</th>
              <th className="py-2.5 px-4 font-semibold">Workflow</th>
              <th className="py-2.5 px-4 font-semibold">Stage</th>
              <th className="py-2.5 px-4 font-semibold">Status</th>
              <th className="py-2.5 px-4 font-semibold">Priority</th>
              <th className="py-2.5 px-4 font-semibold">Internal Owner</th>
              <th className="py-2.5 px-4 font-semibold">Target Date</th>
              <th className="py-2.5 px-4 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E0D8]">
            {filteredCases.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-[#5E5D57] bg-[#FFFFFF]">
                  <p className="font-medium text-xs">No cases match the current filters.</p>
                  <p className="text-[11px] text-[#89877E] mt-1">
                    Try adjusting search terms or switch data modes in Settings &gt; Data Sources.
                  </p>
                </td>
              </tr>
            ) : (
              filteredCases.map(c => {
                const priorityBadge = {
                  'CRITICAL': 'bg-[#FDF0F0] text-[#8A1E20] border-[#F0C4C4]',
                  'HIGH': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
                  'MEDIUM': 'bg-[#EDF2F7] text-[#2B3B4C] border-[#CAD6E2]',
                  'LOW': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]'
                }[c.priority] || 'bg-gray-100 text-gray-800';

                const statusBadge = {
                  'Needs Attention': 'bg-[#FDF6E4] text-[#855304] border-[#EBD9A4]',
                  'In Progress': 'bg-[#EDF2F7] text-[#1E3A8A] border-[#CAD6E2]',
                  'Awaiting Review': 'bg-[#F4F4F1] text-[#2B3B4C] border-[#C6C4BA]',
                  'Completed': 'bg-[#EAF5EE] text-[#1C4D35] border-[#B8DFC8]'
                }[c.status] || 'bg-gray-100 text-gray-800';

                const isOverdue = c.days_remaining < 0 && c.status !== 'Completed';

                return (
                  <tr 
                    key={c.id} 
                    className="hover:bg-[#FBFBF9] transition-colors cursor-pointer"
                    onClick={() => onSelectCase(c)}
                  >
                    <td className="py-3 px-4 font-tabular font-bold text-[#1E3A8A]">
                      {c.case_reference}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#1A1917]">{c.institution_name}</div>
                      {c.aicte_permanent_id && (
                        <div className="text-[10px] text-[#5E5D57] font-tabular">
                          AICTE ID: {c.aicte_permanent_id}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#5E5D57]">
                      <div>{c.workflow_type}</div>
                      <div className="text-[10px] text-[#89877E] font-tabular">{c.academic_period}</div>
                    </td>
                    <td className="py-3 px-4 text-[#1A1917] font-medium">
                      {c.current_stage}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded ${statusBadge}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold border rounded ${priorityBadge}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#1A1917]">
                      {c.internal_owner_name}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-tabular text-[#1A1917]">{c.target_date}</div>
                      <div className={`text-[10px] font-semibold font-tabular ${
                        isOverdue ? 'text-[#8A1E20]' : 'text-[#5E5D57]'
                      }`}>
                        {isOverdue 
                          ? `${Math.abs(c.days_remaining)}d overdue` 
                          : `${c.days_remaining}d remaining`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCase(c);
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-[#1E3A8A] hover:bg-[#EAF0F6] border border-[#CAD6E2] rounded transition-colors"
                      >
                        Open Case →
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
