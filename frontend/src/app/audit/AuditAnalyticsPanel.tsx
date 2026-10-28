'use client';

import React, { useEffect, useState } from 'react';
import { AuditAnalytics, fetchAuditAnalytics } from '../../services/audit';

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function AuditAnalyticsPanel() {
  const [data, setData] = useState<AuditAnalytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchAuditAnalytics(30).then(result => {
      if (active) setData(result);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : 'Analytics unavailable.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const maxDaily = Math.max(1, ...(data?.daily.map(item => item.count) ?? [0]));
  const maxAction = Math.max(1, ...(data?.actions.map(item => item.count) ?? [0]));
  const activeDays = (data?.daily ?? []).filter(item => item.count > 0).length;
  const peakDay = (data?.daily ?? []).reduce((peak, item) => item.count > peak.count ? item : peak, { date: '', count: 0 });
  const actionTypes = data?.actions.length ?? 0;
  const chartPoints = (data?.daily ?? []).map((item, index) => ({
    ...item,
    x: data!.daily.length <= 1 ? 0 : 10 + index * 286 / (data!.daily.length - 1),
    y: 86 - (item.count / maxDaily) * 65,
  }));
  const points = chartPoints.map(point => `${point.x},${point.y}`).join(' ');
  const areaPoints = chartPoints.length ? `10,86 ${points} 296,86` : '';

  return (
    <section className="space-y-3" aria-label="Audit activity analytics">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#1A1917]">Activity overview</h2>
          <p className="mt-1 text-[11px] text-[#77756C]">Last 30 days · based on recorded workspace events</p>
        </div>
        {data && <p className="text-xs text-[#5E5D57]"><strong className="font-mono text-[#1A1917]">{data.total_events.toLocaleString()}</strong> events in period</p>}
      </div>

      {loading && <div className="rounded border border-[#E2E0D8] bg-white p-5 text-xs text-[#5E5D57]">Loading activity analytics…</div>}
      {error && <div role="status" className="rounded border border-[#E2E0D8] bg-white p-4 text-xs text-[#77756C]">Activity charts unavailable: {error}</div>}

      {data && !error && <>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="rounded-xl border border-[#DCE5F8] bg-gradient-to-br from-[#FFFFFF] to-[#F2F6FF] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5E6F96]">Recorded events</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#173574]">{data.total_events.toLocaleString()}</p>
            <p className="mt-1 text-[10px] text-[#77756C]">Selected 30-day window</p>
          </div>
          <div className="rounded-xl border border-[#D9EDE4] bg-gradient-to-br from-white to-[#F0FAF5] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#36745A]">Active days</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#176044]">{activeDays}<span className="ml-1 text-sm font-medium text-[#6B8F7D]">/ 30</span></p>
            <p className="mt-1 text-[10px] text-[#77756C]">Days with recorded activity</p>
          </div>
          <div className="rounded-xl border border-[#F1E2C9] bg-gradient-to-br from-white to-[#FFF8EC] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#94621D]">Peak day</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#8B5714]">{peakDay.count.toLocaleString()}</p>
            <p className="mt-1 text-[10px] text-[#77756C]">{peakDay.date ? shortDate(peakDay.date) : 'No activity recorded'}</p>
          </div>
          <div className="rounded-xl border border-[#E8DDF6] bg-gradient-to-br from-white to-[#F8F3FF] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7853A6]">Action types</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-[#59378B]">{actionTypes}</p>
            <p className="mt-1 text-[10px] text-[#77756C]">Distinct actions in the top list</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="rounded-xl border border-[#E2E0D8] bg-white p-5 shadow-[0_4px_18px_rgba(26,25,23,0.04)]">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-[#1A1917]">Daily activity</h3>
              <p className="mt-1 text-[10px] text-[#77756C]">Events per day; quiet days remain visible</p>
            </div>
            <svg viewBox="0 0 300 112" role="img" aria-label="Line chart showing daily audit event counts" className="h-44 w-full overflow-visible">
              {[14, 48, 82].map((y, index) => <g key={y}><line x1="0" x2="300" y1={y} y2={y} stroke="#E2E0D8" strokeDasharray="3 4" /><text x="2" y={y - 3} fill="#8A887F" fontSize="7">{Math.round(maxDaily * (1 - index / 2))}</text></g>)}
              {areaPoints && <polygon points={areaPoints} fill="#1E3A8A" opacity="0.09" />}
              <polyline points={points} fill="none" stroke="#1E3A8A" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {chartPoints.map(point => (
                <circle key={point.date} cx={point.x} cy={point.y} r={point.count ? 2.2 : 1} fill={point.count ? '#1E3A8A' : '#C6C4BA'}>
                  <title>{`${shortDate(point.date)}: ${point.count} events`}</title>
                </circle>
              ))}
            </svg>
            <div className="flex justify-between text-[10px] text-[#77756C]">
              <span>{data.daily[0] ? shortDate(data.daily[0].date) : ''}</span>
              <span>{data.daily[14] ? shortDate(data.daily[14].date) : ''}</span>
              <span>{data.daily[data.daily.length - 1] ? shortDate(data.daily[data.daily.length - 1].date) : ''}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#E2E0D8] bg-white p-5 shadow-[0_4px_18px_rgba(26,25,23,0.04)]">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-[#1A1917]">Activity heatmap</h3>
              <p className="mt-1 text-[10px] text-[#77756C]">Each square represents one day</p>
            </div>
            <div className="grid grid-cols-7 gap-2 sm:gap-2.5" role="img" aria-label="Calendar heatmap of daily audit event counts">
              {data.daily.map(item => {
                const intensity = item.count === 0 ? 0 : Math.min(4, Math.ceil((item.count / maxDaily) * 4));
                const backgrounds = ['#F0EFE9', '#DCE5F8', '#AFC4F0', '#6F91D5', '#1E3A8A'];
                return <div key={item.date} title={`${shortDate(item.date)}: ${item.count} event${item.count === 1 ? '' : 's'}`} className="aspect-square rounded-[3px]" style={{ backgroundColor: backgrounds[intensity] }} />;
              })}
            </div>
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-[#77756C]">
              <span>Less</span>{['#F0EFE9', '#DCE5F8', '#AFC4F0', '#6F91D5', '#1E3A8A'].map(color => <span key={color} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />)}<span>More</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E0D8] bg-white p-5 shadow-[0_4px_18px_rgba(26,25,23,0.04)]">
          <div className="mb-3">
            <h3 className="text-xs font-bold text-[#1A1917]">Most common actions</h3>
            <p className="mt-1 text-[10px] text-[#77756C]">Top recorded action types in the same 30-day period</p>
          </div>
          {data.actions.length === 0 ? <p className="text-xs text-[#77756C]">No actions recorded during this period.</p> : <div className="space-y-3">
            {data.actions.map(item => <div key={item.action} className="grid grid-cols-[minmax(0,1fr)_2fr_auto] items-center gap-3">
              <span className="truncate font-mono text-[10px] text-[#5E5D57]" title={item.action}>{item.action}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-[#F0EFE9]"><div className="h-full rounded-full bg-gradient-to-r from-[#7899E0] to-[#1E3A8A]" style={{ width: `${(item.count / maxAction) * 100}%` }} /></div>
              <span className="w-8 text-right font-mono text-[11px] font-semibold text-[#1A1917]">{item.count}</span>
            </div>)}
          </div>}
        </div>
        <p className="rounded-lg bg-[#F7F6F2] px-3 py-2 text-[10px] leading-4 text-[#77756C]">These charts describe recorded activity only. A high count is not, by itself, evidence of fraud or misconduct.</p>
      </>}
    </section>
  );
}
