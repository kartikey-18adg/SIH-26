'use client';

import React, { useMemo, useState } from 'react';
import { AppShell } from '../../components/AppShell';
import { useWorkspace } from '../../context/WorkspaceContext';

type LineageNode = {
  id: string;
  type: string;
  label: string;
  data: Record<string, unknown>;
};
type LineageEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
};
type LineageResponse = {
  case_id: string;
  case_reference: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  summary: {
    documents: number;
    document_versions: number;
    compliance_results: number;
    rules: number;
    audit_events: number;
    node_count: number;
    edge_count: number;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';
const TYPE_STYLE: Record<string, { title: string; color: string; badge: string }> = {
  case: { title: 'Approval case', color: '#1E3A8A', badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  evidence_document: { title: 'Evidence document', color: '#0F766E', badge: 'bg-teal-50 text-teal-800 border-teal-200' },
  document_version: { title: 'Document version', color: '#0D9488', badge: 'bg-teal-50 text-teal-800 border-teal-200' },
  compliance_result: { title: 'Compliance result', color: '#B45309', badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  compliance_rule: { title: 'Compliance rule', color: '#7C3AED', badge: 'bg-violet-50 text-violet-800 border-violet-200' },
  audit_event: { title: 'Audit event', color: '#475569', badge: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const COLUMN_BY_TYPE: Record<string, number> = {
  case: 0,
  evidence_document: 1,
  compliance_result: 1,
  document_version: 2,
  compliance_rule: 2,
  audit_event: 3,
};
const COLUMN_TITLES = ['Case', 'Evidence & checks', 'Versions & rules', 'Audit trail'];
const CARD_W = 220;
const CARD_H = 116;
const X_GAP = 70;
const Y_GAP = 28;
const LEFT = 24;
const TOP = 58;

function pretty(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function short(value: string, length = 34): string {
  return value.length > length ? value.slice(0, length - 1) + '…' : value;
}

export default function EvidenceLineagePage() {
  const { activeRole, summary } = useWorkspace();
  const [caseId, setCaseId] = useState('');
  const [graph, setGraph] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const graphLayout = useMemo(() => {
    if (!graph) return { positions: {} as Record<string, { x: number; y: number }>, height: 520, width: 4 * (CARD_W + X_GAP) };
    const grouped: Record<number, LineageNode[]> = { 0: [], 1: [], 2: [], 3: [] };
    graph.nodes.forEach(node => grouped[COLUMN_BY_TYPE[node.type] ?? 1].push(node));
    const positions: Record<string, { x: number; y: number }> = {};
    Object.entries(grouped).forEach(([column, nodes]) => {
      nodes.forEach((node, index) => {
        positions[node.id] = {
          x: LEFT + Number(column) * (CARD_W + X_GAP),
          y: TOP + index * (CARD_H + Y_GAP),
        };
      });
    });
    const maxCount = Math.max(1, ...Object.values(grouped).map(items => items.length));
    return {
      positions,
      height: TOP + maxCount * (CARD_H + Y_GAP) + 28,
      width: LEFT * 2 + 4 * CARD_W + 3 * X_GAP,
    };
  }, [graph]);

  const selectedNode = graph?.nodes.find(node => node.id === selectedNodeId) ?? null;

  async function loadLineage(nextCaseId = caseId) {
    const id = nextCaseId.trim();
    if (!id) {
      setError('Enter a case reference to find its approval case ID and lineage.');
      return;
    }
    setLoading(true);
    setError('');
    setGraph(null);
    setSelectedNodeId(null);
    try {
      const response = await fetch(`${API_BASE}/cases/${encodeURIComponent(id)}/lineage`, {
        cache: 'no-store',
        headers: { 'X-AIClear-Role': activeRole, Accept: 'application/json' },
      });
      if (!response.ok) {
        let message = `Request failed (HTTP ${response.status}).`;
        try {
          const body = await response.json();
          if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
        } catch {}
        throw new Error(message);
      }
      const data = await response.json() as LineageResponse;
      setGraph(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the lineage graph. Check that the backend is running.');
    } finally {
      setLoading(false);
    }
  }

  const suggestedCases = summary.recent_cases ?? [];

  return (
    <AppShell>
      <div className="mb-5 flex flex-col gap-3 border-b border-[#E2E0D8] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1E3A8A]">
            <span className="h-2 w-2 rounded-full bg-[#1E3A8A]" /> Evidence intelligence
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1917]">Evidence Lineage Graph</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5E5D57]">
            Trace a case through its evidence, document versions, compliance decisions, governing rules, and audit events.
          </p>
        </div>
        <span className="inline-flex w-fit items-center rounded border border-[#CAD6E2] bg-[#EDF2F7] px-3 py-1.5 text-xs font-semibold text-[#2B3B4C]">
          Active role: {activeRole}
        </span>
      </div>

      <section className="mb-5 rounded-lg border border-[#E2E0D8] bg-white p-4 shadow-sm">
        <label htmlFor="lineage-case-id" className="mb-1.5 block text-xs font-bold text-[#1A1917]">Case reference</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="lineage-case-id"
            value={caseId}
            onChange={e => setCaseId(e.target.value)}
            placeholder="Enter case reference (e.g. AICTE-DEMO-017)"
            className="min-w-0 flex-1 rounded border border-[#C6C4BA] px-3 py-2 font-mono text-xs text-[#1A1917] outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => loadLineage()}
            className="rounded bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172554] disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Loading graph…' : 'Load lineage'}
          </button>
        </div>
        {suggestedCases.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#5E5D57]">Recent cases:</span>
            {suggestedCases.slice(0, 5).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { setCaseId(item.case_reference); loadLineage(item.case_reference); }}
                className="rounded border border-[#E2E0D8] bg-[#FAF9F5] px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] hover:bg-[#EDF2F7]"
                title={`Approval case ID: ${item.id}`}
              >
                {item.case_reference}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <strong className="mr-1">Could not load graph:</strong>{error}
            {activeRole === 'Institution Coordinator' && ' Switch your active role to Administrator, Compliance Officer, or Reviewer to view lineage.'}
          </div>
        )}
      </section>

      {graph && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ['Nodes', graph.summary.node_count],
              ['Connections', graph.summary.edge_count],
              ['Evidence docs', graph.summary.documents],
              ['Versions', graph.summary.document_versions],
              ['Compliance checks', graph.summary.compliance_results],
              ['Rules', graph.summary.rules],
              ['Audit events', graph.summary.audit_events],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#E2E0D8] bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5E5D57]">{label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-[#1A1917]">{value}</div>
              </div>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#1A1917]">{graph.case_reference}</h2>
              <p className="mt-1 break-all font-mono text-xs text-[#5E5D57]">Approval case ID: {graph.case_id}</p>
              <p className="mt-1 text-xs text-[#5E5D57]">Select any node to inspect its stored metadata. Scroll horizontally to explore the full graph.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `lineage-${graph.case_reference}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded border border-[#C6C4BA] bg-white px-3 py-1.5 text-xs font-semibold text-[#1A1917] hover:bg-[#F2F1EC]"
            >
              Export graph JSON
            </button>
          </div>

          <div className="overflow-auto rounded-lg border border-[#E2E0D8] bg-[#FAF9F5]">
            <div className="relative" style={{ width: graphLayout.width, height: graphLayout.height }}>
              <div className="absolute inset-x-0 top-0 grid grid-cols-4 border-b border-[#E2E0D8] bg-white/90 py-3 text-center">
                {COLUMN_TITLES.map(title => <div key={title} className="text-[11px] font-bold uppercase tracking-wide text-[#5E5D57]">{title}</div>)}
              </div>
              <svg className="pointer-events-none absolute inset-0" width={graphLayout.width} height={graphLayout.height} aria-label="Connections between lineage nodes">
                <defs>
                  <marker id="lineage-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L6,3 z" fill="#94A3B8" />
                  </marker>
                </defs>
                {graph.edges.map(edge => {
                  const source = graphLayout.positions[edge.source];
                  const target = graphLayout.positions[edge.target];
                  if (!source || !target) return null;
                  const x1 = source.x + CARD_W;
                  const y1 = source.y + CARD_H / 2;
                  const x2 = target.x;
                  const y2 = target.y + CARD_H / 2;
                  const curve = Math.max(28, (x2 - x1) / 2);
                  return (
                    <g key={edge.id}>
                      <path d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`} fill="none" stroke="#94A3B8" strokeWidth="1.5" markerEnd="url(#lineage-arrow)" />
                    </g>
                  );
                })}
              </svg>
              {graph.nodes.map(node => {
                const position = graphLayout.positions[node.id];
                const style = TYPE_STYLE[node.type] ?? TYPE_STYLE.audit_event;
                const meta = Object.entries(node.data).filter(([key]) => !['case_id', 'document_id', 'result_id', 'rule_id', 'version_id', 'event_id', 'details'].includes(key)).slice(0, 2);
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`absolute overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selectedNodeId === node.id ? 'ring-2 ring-[#1E3A8A] ring-offset-1' : ''}`}
                    style={{ left: position.x, top: position.y, width: CARD_W, minHeight: CARD_H, borderTopWidth: 3, borderTopColor: style.color }}
                  >
                    <div className="px-3 pb-2 pt-2.5">
                      <div className={`mb-1 inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${style.badge}`}>{style.title}</div>
                      <div className="text-xs font-bold leading-snug text-[#1A1917]">{short(node.label, 42)}</div>
                      <div className="mt-1 space-y-0.5">
                        {meta.map(([key, value]) => <div key={key} className="truncate text-[10px] text-[#5E5D57]"><span className="font-semibold">{key.replaceAll('_', ' ')}:</span> {short(pretty(value), 36)}</div>)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedNode && (
            <section className="mt-4 rounded-lg border border-[#E2E0D8] bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#5E5D57]">{TYPE_STYLE[selectedNode.type]?.title ?? selectedNode.type}</div>
                  <h3 className="mt-1 text-base font-bold text-[#1A1917]">{selectedNode.label}</h3>
                  <p className="mt-1 break-all font-mono text-[10px] text-[#89877E]">{selectedNode.id}</p>
                </div>
                <button type="button" onClick={() => setSelectedNodeId(null)} className="rounded border border-[#E2E0D8] px-2 py-1 text-xs text-[#5E5D57] hover:bg-[#F7F7F5]">Close</button>
              </div>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(selectedNode.data).map(([key, value]) => (
                  <div key={key} className="rounded border border-[#EEECE5] bg-[#FAF9F5] p-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#5E5D57]">{key.replaceAll('_', ' ')}</dt>
                    <dd className="mt-1 break-words text-xs text-[#1A1917]">{pretty(value)}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 border-t border-[#E2E0D8] pt-3">
                <h4 className="mb-2 text-xs font-bold text-[#1A1917]">Connected nodes</h4>
                <div className="flex flex-wrap gap-2">
                  {graph.edges.filter(edge => edge.source === selectedNode.id || edge.target === selectedNode.id).map(edge => {
                    const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                    const other = graph.nodes.find(node => node.id === otherId);
                    return other ? (
                      <button key={edge.id} type="button" onClick={() => setSelectedNodeId(other.id)} className="rounded border border-[#E2E0D8] px-2 py-1 text-[11px] text-[#1E3A8A] hover:bg-[#EDF2F7]">
                        {edge.label.replaceAll('_', ' ')} · {other.label}
                      </button>
                    ) : null;
                  })}
                  {graph.edges.every(edge => edge.source !== selectedNode.id && edge.target !== selectedNode.id) && <span className="text-xs text-[#89877E]">No connections returned for this node.</span>}
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {!graph && !error && !loading && (
        <div className="rounded-lg border border-dashed border-[#C6C4BA] bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2F7] text-xl text-[#1E3A8A]">⌘</div>
          <h2 className="text-base font-bold text-[#1A1917]">Explore a case’s evidence history</h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-[#5E5D57]">Enter a case reference to retrieve its approval case ID and see connected compliance checks, governing rules, uploaded evidence, version history, and audit events.</p>
          <button type="button" onClick={() => loadLineage()} className="mt-4 rounded bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#172554]">Load lineage</button>
        </div>
      )}
    </AppShell>
  );
}
