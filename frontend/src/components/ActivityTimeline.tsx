'use client';

import React from 'react';
import { ActivityEventItem } from '../types/aiclear';

interface ActivityTimelineProps {
  activities: ActivityEventItem[];
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities }) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#E2E0D8] rounded shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A1917]">
            Audit Trail & Activity
          </h3>
          <p className="text-[11px] text-[#5E5D57]">
            Immutable chronological record of workflow changes and administrative decisions.
          </p>
        </div>
      </div>

      <div className="divide-y divide-[#E2E0D8] max-h-80 overflow-y-auto">
        {activities.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#5E5D57]">
            No recent activity recorded.
          </div>
        ) : (
          activities.map(act => (
            <div key={act.id} className="p-3 hover:bg-[#FBFBF9] transition-colors">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#1A1917]">
                  {act.actor_name}
                </span>
                <span className="text-[10px] text-[#89877E] font-mono">
                  {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-[11px] text-[#1E3A8A] font-medium mt-0.5">
                {act.action}
              </div>
              <div className="text-[10px] text-[#5E5D57] mt-0.5 font-mono truncate">
                Role: {act.actor_role} | Entity: {act.entity_type}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
