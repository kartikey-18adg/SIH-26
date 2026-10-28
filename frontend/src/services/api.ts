import { DashboardSummary, SourceRegistryItem, Workspace, DataMode } from '../types/aiclear';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

export function getActiveRole(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('aiclear_active_role') || 'Institution Coordinator';
  }
  return 'Institution Coordinator';
}

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const role = getActiveRole();
  return {
    'X-AIClear-Role': role,
    ...extraHeaders
  };
}

async function handleResponseError(res: Response, defaultMessage: string): Promise<never> {
  let detail = defaultMessage;
  try {
    const errorData = await res.json();
    if (errorData && errorData.detail) {
      detail = errorData.detail;
    }
  } catch {
    // Keep default message
  }
  throw new Error(detail);
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  try {
    const res = await fetch(`${API_BASE}/dashboard/summary`, { 
      cache: 'no-store',
      headers: getAuthHeaders()
    });
    if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Backend unavailable, using initial state:', err);
    throw err;
  }
}

export async function fetchWorkspace(): Promise<Workspace> {
  const res = await fetch(`${API_BASE}/workspace`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function submitFirstRunChoice(mode: DataMode): Promise<{ success: boolean; active_data_mode: string; message: string; guidance?: string }> {
  const res = await fetch(`${API_BASE}/workspace/first-run`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mode, confirm: true })
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function switchWorkspaceMode(mode: DataMode): Promise<{ success: boolean; active_data_mode: string; message: string; guidance?: string }> {
  const res = await fetch(`${API_BASE}/workspace/data-mode`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mode, confirm: true })
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchSources(): Promise<{ active_mode: string; sources: SourceRegistryItem[] }> {
  const res = await fetch(`${API_BASE}/workspace/sources`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function resetDemoWorkspace(): Promise<{ success: boolean; message: string; active_cases_count: number }> {
  const res = await fetch(`${API_BASE}/workspace/reset-demo`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

// Ingestion API calls
export async function uploadAndPreviewCsv(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/ingestion/preview`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) await handleResponseError(res, `Upload preview failed: HTTP ${res.status}`);
  return await res.json();
}

export async function commitIngestionBatch(preview_token: string, original_filename: string, file_sha256: string, records: any[]) {
  const res = await fetch(`${API_BASE}/ingestion/commit`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      preview_token,
      original_filename,
      file_sha256,
      records
    })
  });
  if (!res.ok) await handleResponseError(res, `Commit failed: HTTP ${res.status}`);
  return await res.json();
}

export async function fetchIngestionBatches() {
  const res = await fetch(`${API_BASE}/ingestion/batches`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchCsvTemplate() {
  const res = await fetch(`${API_BASE}/ingestion/template`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

// Case Management API calls
export async function fetchCases(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/cases?${query}` : `${API_BASE}/cases`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchCaseDetail(caseId: string) {
  const res = await fetch(`${API_BASE}/cases/${caseId}`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function createCaseApi(caseData: any) {
  const res = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(caseData)
  });
  if (!res.ok) await handleResponseError(res, `Failed to create case: HTTP ${res.status}`);
  return await res.json();
}

export async function transitionCaseStageApi(caseId: string, toStage: string, reason: string, changedBy?: string) {
  const role = changedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/cases/${caseId}/transition`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      to_stage: toStage,
      reason: reason,
      changed_by: role
    })
  });
  if (!res.ok) await handleResponseError(res, `Stage transition failed: HTTP ${res.status}`);
  return await res.json();
}

// Evidence Vault & Document API calls
export async function fetchCaseDocuments(caseId: string) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/documents`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function uploadCaseDocument(caseId: string, formData: FormData) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/documents`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) await handleResponseError(res, `Document upload failed: HTTP ${res.status}`);
  return await res.json();
}

export async function reviewDocumentApi(documentId: string, status: string, notes: string = '', reviewedBy?: string) {
  const role = reviewedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/documents/${documentId}/review`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      review_status: status,
      review_notes: notes,
      reviewed_by: role
    })
  });
  if (!res.ok) await handleResponseError(res, `Review update failed: HTTP ${res.status}`);
  return await res.json();
}

export async function uploadNewVersionApi(documentId: string, formData: FormData) {
  const res = await fetch(`${API_BASE}/documents/${documentId}/versions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData
  });
  if (!res.ok) await handleResponseError(res, `Version upload failed: HTTP ${res.status}`);
  return await res.json();
}

export function getDocumentDownloadUrl(documentId: string): string {
  return `${API_BASE}/documents/${documentId}/download`;
}

// Compliance Engine API calls
export async function fetchComplianceRules() {
  const res = await fetch(`${API_BASE}/compliance/rules`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function fetchCaseCompliance(caseId: string) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/compliance`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function evaluateCaseCompliance(caseId: string) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/compliance/evaluate`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  if (!res.ok) await handleResponseError(res, `Compliance evaluation failed: HTTP ${res.status}`);
  return await res.json();
}

export async function overrideComplianceResultApi(resultId: string, newStatus: string, reason: string, overriddenBy?: string) {
  const role = overriddenBy || getActiveRole();
  const res = await fetch(`${API_BASE}/compliance-results/${resultId}/override`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      new_status: newStatus,
      override_reason: reason,
      overridden_by: role
    })
  });
  if (!res.ok) await handleResponseError(res, `Override failed: HTTP ${res.status}`);
  return await res.json();
}

// Alert & Escalation Engine API calls
export async function fetchAlertsApi(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/alerts?${query}` : `${API_BASE}/alerts`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function triggerAlertScanApi() {
  const res = await fetch(`${API_BASE}/alerts/scan`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' })
  });
  if (!res.ok) await handleResponseError(res, `Scan failed: HTTP ${res.status}`);
  return await res.json();
}

export async function acknowledgeAlertApi(alertId: string, notes?: string, acknowledgedBy?: string) {
  const role = acknowledgedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ acknowledged_by: role, notes })
  });
  if (!res.ok) await handleResponseError(res, `Acknowledge failed: HTTP ${res.status}`);
  return await res.json();
}

export async function assignAlertApi(alertId: string, assignedTo: string, assigneeEmail?: string, assignedBy?: string) {
  const role = assignedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/alerts/${alertId}/assign`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      assigned_to: assignedTo,
      assignee_email: assigneeEmail,
      assigned_by: role,
      dispatch_notification: true
    })
  });
  if (!res.ok) await handleResponseError(res, `Assign failed: HTTP ${res.status}`);
  return await res.json();
}

export async function resolveAlertApi(alertId: string, resolutionNotes: string, resolvedBy?: string) {
  const role = resolvedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      resolution_notes: resolutionNotes,
      resolved_by: role
    })
  });
  if (!res.ok) await handleResponseError(res, `Resolve failed: HTTP ${res.status}`);
  return await res.json();
}

export async function fetchNotificationsApi(limit: number = 50) {
  const res = await fetch(`${API_BASE}/notifications?limit=${limit}`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

// Operational Reports & Export API calls
export async function fetchCaseReviewPackApi(caseId: string) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/review-pack`, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export function getCaseExportJsonUrl(caseId: string): string {
  return `${API_BASE}/cases/${caseId}/export/json`;
}

export function getCasesExportCsvUrl(): string {
  return `${API_BASE}/export/cases.csv`;
}

export function getComplianceExportCsvUrl(): string {
  return `${API_BASE}/export/compliance.csv`;
}

// Compliance Queue API calls
export async function fetchComplianceQueueApi(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/compliance/queue?${query}` : `${API_BASE}/compliance/queue`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

// Tasks API calls
export async function syncTasksApi(): Promise<{ success: boolean; created: number; updated: number }> {
  const res = await fetch(`${API_BASE}/tasks/sync`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    cache: 'no-store'
  });
  if (!res.ok) await handleResponseError(res, `Task synchronization failed: HTTP ${res.status}`);
  return await res.json();
}

export async function fetchTasksApi(params: Record<string, string> = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${API_BASE}/tasks?${query}` : `${API_BASE}/tasks`;
  const res = await fetch(url, { 
    cache: 'no-store',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `HTTP error ${res.status}`);
  return await res.json();
}

export async function createTaskApi(taskData: any) {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(taskData)
  });
  if (!res.ok) await handleResponseError(res, `Failed to create task: HTTP ${res.status}`);
  return await res.json();
}

export async function updateTaskStatusApi(taskId: string, status: string, notes?: string, updatedBy?: string) {
  const role = updatedBy || getActiveRole();
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      status: status,
      completion_notes: notes,
      updated_by: role
    })
  });
  if (!res.ok) await handleResponseError(res, `Failed to update task: HTTP ${res.status}`);
  return await res.json();
}


export async function fetchAiComplianceInsights(caseId: string): Promise<{
  analysis_mode: 'AI_ASSISTED' | 'RULE_BASED_FALLBACK';
  model: string | null;
  summary: string;
  priority_actions: Array<{ rule_key: string; title: string; status: string; action: string; reason: string; source: string | null; section: string | null }>;
  uncertainty_notes: string[];
  fallback_reason: string | null;
}> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/compliance/ai-insights`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    cache: 'no-store'
  });
  if (!res.ok) await handleResponseError(res, `AI compliance insights failed: HTTP ${res.status}`);
  return await res.json();
}


export async function removeImportedData() {
  const res = await fetch(`${API_BASE}/ingestion/imported-data`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!res.ok) await handleResponseError(res, `Failed to remove imported data: HTTP ${res.status}`);
  return await res.json();
}
