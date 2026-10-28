export type DataMode = 'DEMO' | 'IMPORTED' | 'MANUAL' | 'CONNECTED';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  active_data_mode: DataMode;
  first_run_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface SourceRegistryItem {
  id: string;
  source_key: string;
  source_name: string;
  source_type: string;
  canonical_url: string | null;
  verification_status: string;
  last_verified_at: string | null;
  metadata_json: Record<string, any>;
}

export interface CaseSummaryItem {
  id: string;
  case_reference: string;
  institution_name: string;
  aicte_permanent_id: string | null;
  workflow_type: string;
  academic_period: string;
  current_stage: string;
  status: string;
  priority: string;
  internal_owner_name: string;
  target_date: string;
  days_remaining: number;
  data_mode: DataMode;
  created_at: string;
}

export interface AlertSummaryItem {
  id: string;
  case_id: string | null;
  case_reference: string | null;
  category: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  explanation: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
  escalation_level: number;
  assigned_to: string | null;
  created_at: string;
}

export interface ActivityEventItem {
  id: string;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface StageBreakdown {
  stage_key: string;
  stage_label: string;
  count: number;
}

export interface DashboardSummary {
  workspace_name: string;
  active_data_mode: DataMode;
  first_run_completed: boolean;
  total_active_cases: number;
  cases_requiring_action: number;
  overdue_tasks: number;
  open_high_priority_alerts: number;
  upcoming_deadlines_count: number;
  compliance_items_needing_review: number;
  evc_waiting_to_schedule?: number;
  evc_scheduled?: number;
  evc_overdue?: number;
  stage_breakdown: StageBreakdown[];
  recent_cases: CaseSummaryItem[];
  open_alerts: AlertSummaryItem[];
  recent_activity: ActivityEventItem[];
  data_mode_notice: string;
}
