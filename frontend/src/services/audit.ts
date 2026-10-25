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
  stats: {
    total_events: number;
    today_events: number;
    unique_actors: number;
  };
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

export async function fetchAuditEvents(filters: AuditFilters = {}): Promise<AuditEventResponse> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const role = typeof window !== 'undefined'
    ? localStorage.getItem('aiclear_active_role') || 'Institution Coordinator'
    : 'Institution Coordinator';
  const response = await fetch(`${apiBase}/audit/events?${params.toString()}`, {
    cache: 'no-store',
    headers: { 'X-AIClear-Role': role },
  });
  if (!response.ok) {
    let message = `Unable to load audit events (HTTP ${response.status}).`;
    try {
      const payload = await response.json();
      if (payload?.detail) message = payload.detail;
    } catch {
      // Keep the HTTP fallback message.
    }
    throw new Error(message);
  }
  return response.json();
}
