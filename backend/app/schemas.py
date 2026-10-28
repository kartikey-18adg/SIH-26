from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, date

class WorkspaceRead(BaseModel):
    id: str
    name: str
    slug: str
    active_data_mode: str  # DEMO, IMPORTED, MANUAL, CONNECTED
    first_run_completed: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class DataModeSelectRequest(BaseModel):
    mode: str = Field(..., description="Selected data mode: DEMO, IMPORTED, MANUAL, CONNECTED")
    confirm: bool = Field(True, description="Confirmation flag acknowledging mode change")

class DataModeSelectResponse(BaseModel):
    success: bool
    active_data_mode: str
    message: str
    is_live_external: bool
    guidance: Optional[str] = None

class SourceRegistryItem(BaseModel):
    id: str
    source_key: str
    source_name: str
    source_type: str
    canonical_url: Optional[str] = None
    verification_status: str
    last_verified_at: Optional[datetime] = None
    metadata_json: Dict[str, Any] = {}

    class Config:
        from_attributes = True

class SourceRegistryListResponse(BaseModel):
    active_mode: str
    sources: List[SourceRegistryItem]

class CaseSummaryItem(BaseModel):
    id: str
    case_reference: str
    institution_name: str
    aicte_permanent_id: Optional[str] = None
    workflow_type: str
    academic_period: str
    current_stage: str
    status: str
    priority: str
    internal_owner_name: str
    target_date: date
    days_remaining: int
    data_mode: str
    created_at: datetime

class AlertSummaryItem(BaseModel):
    id: str
    case_id: Optional[str] = None
    case_reference: Optional[str] = None
    category: str
    severity: str
    title: str
    explanation: str
    status: str
    escalation_level: int
    assigned_to: Optional[str] = None
    created_at: datetime

class ActivityEventItem(BaseModel):
    id: str
    actor_name: str
    actor_role: str
    entity_type: str
    entity_id: str
    action: str
    details: Dict[str, Any]
    created_at: datetime

class StageBreakdown(BaseModel):
    stage_key: str
    stage_label: str
    count: int

class DashboardSummaryResponse(BaseModel):
    workspace_name: str
    active_data_mode: str
    first_run_completed: bool
    total_active_cases: int
    cases_requiring_action: int
    overdue_tasks: int
    open_high_priority_alerts: int
    upcoming_deadlines_count: int
    compliance_items_needing_review: int
    evc_waiting_to_schedule: int = 0
    evc_scheduled: int = 0
    evc_overdue: int = 0
    stage_breakdown: List[StageBreakdown]
    recent_cases: List[CaseSummaryItem]
    open_alerts: List[AlertSummaryItem]
    recent_activity: List[ActivityEventItem]
    data_mode_notice: str

class ResetDemoResponse(BaseModel):
    success: bool
    message: str
    active_cases_count: int
