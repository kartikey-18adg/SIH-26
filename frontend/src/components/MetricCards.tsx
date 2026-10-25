'use client';

import React from 'react';
import { DashboardSummary } from '../types/aiclear';

interface MetricCardsProps {
  summary: DashboardSummary;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ summary }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
      {/* 1. Active Cases */}
      <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded p-3">
        <div className="text-[11px] font-semibold text-[#5E5D57] uppercase tracking-wide">
          Active Cases
        </div>
        <div className="text-2xl font-bold font-tabular text-[#1A1917] mt-1">
          {summary.total_active_cases}
        </div>
        <div className="text-[10px] text-[#5E5D57] mt-1">
          In-progress approval filings
        </div>
      </div>

      {/* 2. Requires Attention */}
      <div className={`bg-[#FFFFFF] border rounded p-3 ${
        summary.cases_requiring_action > 0 ? 'border-[#EBD9A4] bg-[#FFFDF7]' : 'border-[#E2E0D8]'
      }`}>
        <div className="text-[11px] font-semibold text-[#855304] uppercase tracking-wide">
          Requires Action
        </div>
        <div className="text-2xl font-bold font-tabular text-[#855304] mt-1">
          {summary.cases_requiring_action}
        </div>
        <div className="text-[10px] text-[#855304] mt-1">
          Action needed from team
        </div>
      </div>

      {/* 3. Overdue Tasks */}
      <div className={`bg-[#FFFFFF] border rounded p-3 ${
        summary.overdue_tasks > 0 ? 'border-[#F0C4C4] bg-[#FFFDFD]' : 'border-[#E2E0D8]'
      }`}>
        <div className="text-[11px] font-semibold text-[#8A1E20] uppercase tracking-wide">
          Overdue Tasks
        </div>
        <div className="text-2xl font-bold font-tabular text-[#8A1E20] mt-1">
          {summary.overdue_tasks}
        </div>
        <div className="text-[10px] text-[#8A1E20] mt-1">
          Past statutory or internal due date
        </div>
      </div>

      {/* 4. Open High-Priority Alerts */}
      <div className={`bg-[#FFFFFF] border rounded p-3 ${
        summary.open_high_priority_alerts > 0 ? 'border-[#F0C4C4] bg-[#FFFDFD]' : 'border-[#E2E0D8]'
      }`}>
        <div className="text-[11px] font-semibold text-[#8A1E20] uppercase tracking-wide">
          Critical Alerts
        </div>
        <div className="text-2xl font-bold font-tabular text-[#8A1E20] mt-1">
          {summary.open_high_priority_alerts}
        </div>
        <div className="text-[10px] text-[#8A1E20] mt-1">
          High/Critical open severity
        </div>
      </div>

      {/* 5. Upcoming Deadlines */}
      <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded p-3">
        <div className="text-[11px] font-semibold text-[#5E5D57] uppercase tracking-wide">
          Target ≤ 14 Days
        </div>
        <div className="text-2xl font-bold font-tabular text-[#1A1917] mt-1">
          {summary.upcoming_deadlines_count}
        </div>
        <div className="text-[10px] text-[#5E5D57] mt-1">
          Approaching deadline threshold
        </div>
      </div>

      {/* 6. Compliance Needing Review */}
      <div className={`bg-[#FFFFFF] border rounded p-3 ${
        summary.compliance_items_needing_review > 0 ? 'border-[#CAD6E2] bg-[#F8FAFC]' : 'border-[#E2E0D8]'
      }`}>
        <div className="text-[11px] font-semibold text-[#1E3A8A] uppercase tracking-wide">
          Items Needing Review
        </div>
        <div className="text-2xl font-bold font-tabular text-[#1E3A8A] mt-1">
          {summary.compliance_items_needing_review}
        </div>
        <div className="text-[10px] text-[#1E3A8A] mt-1">
          APH check needs human verification
        </div>
      </div>
    </div>
  );
};
