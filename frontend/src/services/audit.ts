export interface AuditEvent {
  id: string;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AuditEventResponse {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
  stats: { total_events: number; today_events: number; unique_actors: number };
}

export interface AuditFilters {
  search?: string;
  action?: string;
  actor?: string;
  entity_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export interface AuditAnalytics {
  days: number;
  total_events: number;
  daily: { date: string; count: number }[];
  actions: { action: string; count: number }[];
}

function auditRequestHeaders() {
  const role = typeof window !== 'undefined'
    ? localStorage.getItem('aiclear_active_role') || 'Institution Coordinator'
    : 'Institution Coordinator';
  return { 'X-AIClear-Role': role };
}

async function auditJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', headers: auditRequestHeaders() });
  if (!response.ok) {
    let message = `Unable to load audit data (HTTP ${response.status}).`;
    try {
      const payload = await response.json();
      if (payload?.detail) message = payload.detail;
    } catch { /* Keep fallback. */ }
    throw new Error(message);
  }
  return response.json();
}

function auditApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';
}

export async function fetchAuditEvents(filters: AuditFilters = {}): Promise<AuditEventResponse> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return auditJson<AuditEventResponse>(`${auditApiBase()}/audit/events?${params.toString()}`);
}

export async function fetchAuditAnalytics(days = 30): Promise<AuditAnalytics> {
  return auditJson<AuditAnalytics>(`${auditApiBase()}/audit/analytics?days=${days}`);
}
