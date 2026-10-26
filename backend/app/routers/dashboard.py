from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import get_db
from ..models import (
    Workspace, ApprovalCase, Alert, Task, ComplianceResult, 
    AuditEvent, Institution
)
from ..schemas import (
    DashboardSummaryResponse, CaseSummaryItem, AlertSummaryItem, 
    ActivityEventItem, StageBreakdown
)
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    mode = ws.active_data_mode
    today = date.today()

    # Query cases strictly filtered by active_data_mode
    cases_query = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == mode
    )
    # Imported mode must only surface records backed by an actual ingestion batch.
    # This excludes legacy/placeholder rows that may have been tagged IMPORTED
    # before provenance tracking was enforced.
    if mode == "IMPORTED":
        cases_query = cases_query.join(Institution, ApprovalCase.institution_id == Institution.id).filter(
            Institution.workspace_id == ws.id,
            Institution.data_mode == "IMPORTED",
            Institution.provenance_batch_id.isnot(None)
        )
    cases = cases_query.order_by(ApprovalCase.target_date.asc()).all()

    total_active_cases = sum(1 for c in cases if c.status != "COMPLETED")
    cases_requiring_action = sum(1 for c in cases if c.status == "NEEDS_ATTENTION")
    upcoming_deadlines_count = sum(1 for c in cases if (c.target_date - today).days <= 14 and c.status != "COMPLETED")

    # Linked case IDs for filtering child items
    case_ids = [c.id for c in cases]

    # Tasks
    tasks = db.query(Task).filter(Task.case_id.in_(case_ids)).all() if case_ids else []
    overdue_tasks = sum(1 for t in tasks if t.due_date < today and t.status != "COMPLETED")

    # Compliance results
    compliance_results = db.query(ComplianceResult).filter(ComplianceResult.case_id.in_(case_ids)).all() if case_ids else []
    compliance_items_needing_review = sum(
        1 for cr in compliance_results 
        if cr.status in ("NEEDS_REVIEW", "NON_COMPLIANT", "EXPIRED_EVIDENCE", "MISSING_EVIDENCE")
    )

    # Alerts (Filtered to workspace and cases belonging to active mode)
    alerts_query = db.query(Alert).filter(Alert.workspace_id == ws.id)
    if case_ids:
        alerts = alerts_query.filter(Alert.case_id.in_(case_ids)).order_by(Alert.created_at.desc()).all()
    else:
        alerts = []
    
    open_alerts = [a for a in alerts if a.status == "OPEN"]
    open_high_priority_alerts = sum(1 for a in open_alerts if a.severity in ("HIGH", "CRITICAL"))

    # Stage Breakdown
    stage_labels = {
        "DRAFT": "Draft",
        "INFO_COLLECTION": "Information Collection",
        "DOCUMENT_REVIEW": "Document Review",
        "COMPLIANCE_CHECKS": "Compliance Checks",
        "INTERNAL_REVIEW": "Internal Review",
        "CORRECTIONS_REQUIRED": "Corrections Required",
        "READY_FOR_SUBMISSION": "Ready for Submission",
        "RECORDED_EXTERNALLY_SUBMITTED": "Externally Submitted (Recorded)",
        "CLOSED": "Closed"
    }
    stage_counts = {}
    for c in cases:
        stage_counts[c.current_stage] = stage_counts.get(c.current_stage, 0) + 1

    stage_breakdown = [
        StageBreakdown(
            stage_key=k,
            stage_label=stage_labels.get(k, k.replace("_", " ").title()),
            count=v
        )
        for k, v in stage_counts.items()
    ]

    # Recent Cases Summary
    recent_cases = []
    for c in cases:
        inst = c.institution
        recent_cases.append(CaseSummaryItem(
            id=c.id,
            case_reference=c.case_reference,
            institution_name=inst.legal_name if inst else "Unknown Institution",
            aicte_permanent_id=inst.aicte_permanent_id if inst else None,
            workflow_type=c.workflow_type.replace("_", " ").title(),
            academic_period=c.academic_period,
            current_stage=stage_labels.get(c.current_stage, c.current_stage),
            status=c.status.replace("_", " ").title(),
            priority=c.priority,
            internal_owner_name=c.internal_owner_name,
            target_date=c.target_date,
            days_remaining=(c.target_date - today).days,
            data_mode=c.data_mode,
            created_at=c.created_at
        ))

    # Open Alerts Summary
    open_alerts_summary = []
    for a in open_alerts[:10]:
        case_ref = a.case.case_reference if a.case else None
        open_alerts_summary.append(AlertSummaryItem(
            id=a.id,
            case_id=a.case_id,
            case_reference=case_ref,
            category=a.category.replace("_", " ").title(),
            severity=a.severity,
            title=a.title,
            explanation=a.explanation,
            status=a.status,
            escalation_level=a.escalation_level,
            assigned_to=a.assigned_to,
            created_at=a.created_at
        ))

    # Recent Activity Events
    activity_events = db.query(AuditEvent).filter(
        AuditEvent.workspace_id == ws.id
    ).order_by(AuditEvent.created_at.desc()).limit(8).all()

    recent_activity = [
        ActivityEventItem(
            id=ev.id,
            actor_name=ev.actor_name,
            actor_role=ev.actor_role.replace("_", " ").title(),
            entity_type=ev.entity_type,
            entity_id=ev.entity_id,
            action=ev.action.replace("_", " ").title(),
            details=ev.details_json or {},
            created_at=ev.created_at
        )
        for ev in activity_events
    ]

    # Data Mode Notice
    if mode == "DEMO":
        notice = "DEMO WORKSPACE — Displaying synthetic demonstration data for evaluation. No real institutional or personal information is stored. Settings can be reconfigured under Data Sources."
    elif mode == "IMPORTED":
        notice = "IMPORTED WORKSPACE — Metrics derived solely from uploaded institutional batches. No synthetic records are blended."
    elif mode == "MANUAL":
        notice = "MANUAL ENTRY WORKSPACE — Displaying user-entered institutional records. Synthetic demo records are excluded."
    elif mode == "CONNECTED":
        notice = "CONNECTED WORKSPACE (READ-ONLY) — Official connector requires authenticated institutional credentials. Direct sync is disabled."
    else:
        notice = f"ACTIVE MODE: {mode}"

    return DashboardSummaryResponse(
        workspace_name=ws.name,
        active_data_mode=mode,
        first_run_completed=ws.first_run_completed,
        total_active_cases=total_active_cases,
        cases_requiring_action=cases_requiring_action,
        overdue_tasks=overdue_tasks,
        open_high_priority_alerts=open_high_priority_alerts,
        upcoming_deadlines_count=upcoming_deadlines_count,
        compliance_items_needing_review=compliance_items_needing_review,
        stage_breakdown=stage_breakdown,
        recent_cases=recent_cases,
        open_alerts=open_alerts_summary,
        recent_activity=recent_activity,
        data_mode_notice=notice
    )
