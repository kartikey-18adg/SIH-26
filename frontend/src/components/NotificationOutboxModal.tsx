'use client';

import React, { useState, useEffect } from 'react';
import { fetchNotificationsApi } from '../services/api';

interface NotificationOutboxModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationOutboxModal: React.FC<NotificationOutboxModalProps> = ({ isOpen, onClose }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadNotifications = () => {
    setLoading(true);
    fetchNotificationsApi(50)
      .then(data => setNotifications(data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-3xl bg-[#FFFFFF] border border-[#C6C4BA] rounded shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#1A1917]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-[#1A1917]">
                Simulated Notification Outbox
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#EDF2F7] text-[#2B3B4C] border border-[#CAD6E2] rounded uppercase">
                Mock Dispatch Engine
              </span>
            </div>
            <p className="text-[11px] text-[#5E5D57] mt-0.5">
              Live audit record of institutional alerts dispatched to internal staff and coordinators.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-2.5 py-1 border border-[#C6C4BA] rounded hover:bg-[#E2E0D8] transition-colors"
          >
            ✕ Close
          </button>
        </div>

        {/* Mandatory Simulation Alert Banner */}
        <div className="px-6 py-2.5 bg-[#FFFDF7] border-b border-[#EBD9A4] text-[11px] text-[#855304] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠️ SIMULATION NOTICE:</span>
            <span>All outgoing messages in this log are captured for testing and review. No external SMTP traffic is transmitted.</span>
          </div>
          <button
            type="button"
            onClick={loadNotifications}
            disabled={loading}
            className="text-[10px] font-bold underline hover:text-[#533302]"
          >
            {loading ? 'Refreshing...' : '⚡ Refresh Outbox'}
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {notifications.length === 0 ? (
            <div className="p-8 text-center bg-[#FAF9F5] border border-dashed border-[#C6C4BA] rounded">
              <p className="font-semibold text-xs text-[#1A1917]">Outbox is currently empty.</p>
              <p className="text-[11px] text-[#5E5D57] mt-1">Triggering an escalation scan or assigning alerts will record simulated dispatches here.</p>
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className="border border-[#E2E0D8] rounded p-3 bg-[#FFFFFF] hover:bg-[#FBFBF9] transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-[#EAF0F6] text-[#1E3A8A] border border-[#CAD6E2] rounded font-mono">
                        {n.channel}
                      </span>
                      <span className="text-[10px] text-[#1A1917] font-semibold">
                        To: <span className="font-mono text-[#5E5D57]">{n.recipient_email}</span>
                      </span>
                      <span className="text-[9px] text-[#89877E] font-tabular ml-auto">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-[#1A1917]">
                      {n.subject}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                      className="text-[10px] text-[#1E3A8A] hover:underline mt-1 font-mono block"
                    >
                      {expandedId === n.id ? '▲ Hide Dispatched Payload' : '▼ Inspect Full Payload'}
                    </button>

                    {expandedId === n.id && (
                      <div className="mt-2.5 p-3 bg-[#FAF9F5] border border-[#E2E0D8] rounded font-mono text-[11px] text-[#2B3B4C] whitespace-pre-wrap leading-relaxed">
                        {n.body}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#E2E0D8] bg-[#F7F7F5] flex justify-between items-center text-[11px] text-[#5E5D57]">
          <span>Logged simulated dispatches: {notifications.length}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-[#1A1917] text-white text-xs font-semibold rounded hover:bg-[#33322E] transition-colors"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
