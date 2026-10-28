import uuid
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db, Base, engine
from ..models import (
    Workspace, ApprovalCase, CaseStageHistory, Alert, Task, EvidenceDocument,
    ComplianceResult, NotificationOutbox, AuditEvent
)
from .workspace import get_or_create_default_workspace
from ..permissions import get_current_role, check_role_permission

router = APIRouter(prefix="/api", tags=["Alerts & Notifications"])

Base.metadata.create_all(bind=engine)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

# Pydantic Schemas
class AlertItem(BaseModel):
    id: str
    workspace_id: str
    case_id: Optional[str] = None
    case_reference: Optional[str] = None
    institution_name: Optional[str] = None
    task_id: Optional[str] = None
    alert_key: str
    category: str
    severity: str
    title: str
    explanation: str
    status: str
    escalation_level: int
    assigned_to: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None

    class Config:
        from_attributes = True

class AlertAcknowledgeRequest(BaseModel):
    acknowledged_by: str = "Institutional Coordinator"
    notes: Optional[str] = None

class AlertAssignRequest(BaseModel):
    assigned_to: str = Field(..., min_length=2)
    assignee_email: Optional[str] = None
    assigned_by: str = "Lead Administrator"
    dispatch_notification: bool = True

class AlertResolveRequest(BaseModel):
    resolution_notes: str = Field(..., min_length=4, description="Mandatory explanation of remedial action taken")
    resolved_by: str = "Compliance Officer"

class NotificationItem(BaseModel):
    id: str
    alert_id: Optional[str] = None
    recipient_email: str
    channel: str
    delivery_status: str
    is_simulated: bool
    subject: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True

class ScanAlertsResponse(BaseModel):
    scanned_cases_count: int
    new_alerts_created: int
    existing_alerts_updated: int
    total_active_alerts: int
    notifications_generated: int

def format_alert_item(a: Alert) -> AlertItem:
    case = a.case
    inst_name = None
    case_ref = None
    if case:
        case_ref = case.case_reference
        if case.institution:
            inst_name = case.institution.legal_name

    return AlertItem(
        id=a.id,
        workspace_id=a.workspace_id,
        case_id=a.case_id,
        case_reference=case_ref,
        institution_name=inst_name,
        task_id=a.task_id,
        alert_key=a.alert_key,
        category=a.category,
        severity=a.severity,
        title=a.title,
        explanation=a.explanation,
        status=a.status,
        escalation_level=a.escalation_level,
        assigned_to=a.assigned_to,
        created_at=a.created_at,
        resolved_at=a.resolved_at,
        resolution_notes=a.resolution_notes
    )

def dispatch_simulated_email(
    db: Session,
    alert: Alert,
    recipient_email: str,
    subject: str,
    body: str
) -> NotificationOutbox:
    notif = NotificationOutbox(
        alert_id=alert.id,
        recipient_email=recipient_email,
        channel="SIMULATED_EMAIL",
        delivery_status="DISPATCHED_SIMULATED",
        is_simulated=True,
        subject=subject,
        body=body,
        created_at=utc_now()
    )
    db.add(notif)
    return notif

# Alert Scanning Engine
def scan_workspace_alerts_logic(db: Session, ws: Workspace) -> Dict[str, int]:
    today = date.today()
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).all()

    new_count = 0
    updated_count = 0
    notifs_count = 0

    for case in cases:
        owner_email = f"{case.internal_owner_name.lower().replace(' ', '.')}@institute.ac.in"
        inst_title = case.institution.legal_name if case.institution else "Technical Institute"

        # 1. Target Deadline Check
        if case.status != "COMPLETED":
            days_left = (case.target_date - today).days
            if days_left < 0:
                key = f"ALERT-DEADLINE-OVERDUE-{case.id[:8]}"
                title = f"Statutory Target Overdue: {case.case_reference} ({abs(days_left)} Days Past)"
                desc = f"Institutional case target deadline was {case.target_date}. Approval dossier is pending stage completion."
                sev = "CRITICAL"
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, alert_key=key,
                        category="DEADLINE", severity=sev, title=title, explanation=desc,
                        status="OPEN", escalation_level=2, assigned_to=case.internal_owner_name
                    )
                    db.add(al)
                    db.flush()
                    dispatch_simulated_email(
                        db, al, owner_email,
                        f"[CRITICAL ESCALATION] Target Overdue - {case.case_reference}",
                        f"Target Date {case.target_date} has elapsed by {abs(days_left)} days for {inst_title}.\nImmediate coordinator review required."
                    )
                    new_count += 1
                    notifs_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    existing.severity = sev
                    updated_count += 1

            elif 0 <= days_left <= 7:
                key = f"ALERT-DEADLINE-NEAR-{case.id[:8]}"
                sev = "CRITICAL" if days_left <= 2 else "HIGH"
                title = f"Approaching Statutory Target: {days_left} Days Remaining ({case.case_reference})"
                desc = f"Target date for approval readiness is {case.target_date}. Complete pending evidence verifications."
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, alert_key=key,
                        category="DEADLINE", severity=sev, title=title, explanation=desc,
                        status="OPEN", escalation_level=1, assigned_to=case.internal_owner_name
                    )
                    db.add(al)
                    db.flush()
                    dispatch_simulated_email(
                        db, al, owner_email,
                        f"[{sev} ALERT] {days_left} Days Until Target - {case.case_reference}",
                        f"Deadline approaching for {inst_title}.\nTarget: {case.target_date}.\nPlease finalize all pending items."
                    )
                    new_count += 1
                    notifs_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    existing.severity = sev
                    updated_count += 1

        # 2. Stalled Stage Check (illustrative 14-day threshold; not an official APH deadline)
        latest_stage_history = db.query(CaseStageHistory).filter(
            CaseStageHistory.case_id == case.id,
            CaseStageHistory.to_stage == case.current_stage
        ).order_by(CaseStageHistory.changed_at.desc()).first()
        stage_started = latest_stage_history.changed_at.date() if latest_stage_history else (
            case.created_at.date() if isinstance(case.created_at, datetime) else today
        )
        days_in_current = max(0, (today - stage_started).days)
        if case.status != "COMPLETED" and days_in_current > 14:
            key = f"ALERT-STALLED-{case.id[:8]}"
            title = f"Workflow Stage Stalled: {case.current_stage} ({days_in_current} Days Inactive)"
            desc = f"Case {case.case_reference} has remained in stage '{case.current_stage}' for {days_in_current} days without progression."
            existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
            if not existing:
                al = Alert(
                    workspace_id=ws.id, case_id=case.id, alert_key=key,
                    category="STAGE_STALLED", severity="MEDIUM", title=title, explanation=desc,
                    status="OPEN", escalation_level=1, assigned_to=case.internal_owner_name
                )
                db.add(al)
                db.flush()
                new_count += 1
            elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                existing.title = title
                existing.explanation = desc
                updated_count += 1

        # 3. Evidence Expiry & Correction Checks
        docs = db.query(EvidenceDocument).filter(EvidenceDocument.case_id == case.id).all()
        for doc in docs:
            if doc.expiry_date and doc.expiry_date < today:
                key = f"ALERT-DOC-EXP-{doc.id[:8]}"
                title = f"Statutory Document Expired: {doc.original_filename}"
                desc = f"Mandatory evidence file ({doc.category.replace('_', ' ')}) expired on {doc.expiry_date}. Must be renewed per APH norms."
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, alert_key=key,
                        category="DOCUMENT_EXPIRY", severity="CRITICAL", title=title, explanation=desc,
                        status="OPEN", escalation_level=2, assigned_to=doc.uploaded_by
                    )
                    db.add(al)
                    db.flush()
                    dispatch_simulated_email(
                        db, al, owner_email,
                        f"[CRITICAL EXPIRY] Document Expired - {doc.original_filename}",
                        f"The document {doc.original_filename} ({doc.category}) expired on {doc.expiry_date} for case {case.case_reference}."
                    )
                    new_count += 1
                    notifs_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    updated_count += 1

            elif doc.expiry_date and 0 <= (doc.expiry_date - today).days <= 30:
                key = f"ALERT-DOC-SOON-{doc.id[:8]}"
                days_left = (doc.expiry_date - today).days
                title = f"Document Expiring Soon: {doc.original_filename} ({days_left} Days Left)"
                desc = f"Evidence certificate ({doc.category}) expires on {doc.expiry_date}. Statutory renewal window is within 30 days."
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, alert_key=key,
                        category="DOCUMENT_EXPIRY", severity="HIGH", title=title, explanation=desc,
                        status="OPEN", escalation_level=1, assigned_to=doc.uploaded_by
                    )
                    db.add(al)
                    db.flush()
                    new_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    updated_count += 1

            if doc.review_status == "NEEDS_CORRECTION":
                key = f"ALERT-DOC-CORR-{doc.id[:8]}"
                title = f"Document Review Correction Required: {doc.original_filename}"
                desc = f"Reviewer flagged: {doc.review_notes or 'Correction required'}. Re-upload required in Evidence Vault."
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, alert_key=key,
                        category="DOCUMENT_REVIEW", severity="HIGH", title=title, explanation=desc,
                        status="OPEN", escalation_level=1, assigned_to=doc.uploaded_by
                    )
                    db.add(al)
                    db.flush()
                    new_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    updated_count += 1

        # 4. Overdue Tasks Check
        tasks = db.query(Task).filter(Task.case_id == case.id).all()
        for t in tasks:
            if t.status != "COMPLETED" and t.due_date < today:
                key = f"ALERT-TASK-OVERDUE-{t.id[:8]}"
                title = f"Overdue Action Task: {t.title}"
                desc = f"Task assigned to {t.assignee_name} was due on {t.due_date}. Priority: {t.priority}."
                existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
                if not existing:
                    al = Alert(
                        workspace_id=ws.id, case_id=case.id, task_id=t.id, alert_key=key,
                        category="TASK_OVERDUE", severity="HIGH", title=title, explanation=desc,
                        status="OPEN", escalation_level=1, assigned_to=t.assignee_name
                    )
                    db.add(al)
                    db.flush()
                    new_count += 1
                elif existing.status in ["OPEN", "ACKNOWLEDGED"]:
                    existing.title = title
                    existing.explanation = desc
                    updated_count += 1

    db.commit()

    total_active = db.query(Alert).filter(
        Alert.workspace_id == ws.id,
        Alert.status.in_(["OPEN", "ACKNOWLEDGED"])
    ).count()

    return {
        "scanned_cases_count": len(cases),
        "new_alerts_created": new_count,
        "existing_alerts_updated": updated_count,
        "total_active_alerts": total_active,
        "notifications_generated": notifs_count
    }

# API Endpoints
@router.get("/alerts", response_model=List[AlertItem])
def list_alerts(
    severity: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = None,
    case_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)

    # Filter alerts belonging to active cases in this data mode
    query = db.query(Alert).filter(Alert.workspace_id == ws.id)

    # Join cases to enforce active data mode isolation
    cases_subquery = db.query(ApprovalCase.id).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).scalar_subquery()

    query = query.filter(or_(Alert.case_id == None, Alert.case_id.in_(cases_subquery)))

    if severity and isinstance(severity, str) and severity.upper() != "ALL":
        query = query.filter(Alert.severity == severity.upper())

    if status_filter and isinstance(status_filter, str) and status_filter.upper() != "ALL":
        query = query.filter(Alert.status == status_filter.upper())

    if category and isinstance(category, str) and category.upper() != "ALL":
        query = query.filter(Alert.category == category.upper())

    if case_id and isinstance(case_id, str):
        query = query.filter(Alert.case_id == case_id)

    alerts = query.order_by(
        Alert.created_at.desc()
    ).all()

    # Custom severity ordering priority: CRITICAL > HIGH > MEDIUM > LOW > INFO
    severity_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    alerts.sort(key=lambda a: (severity_rank.get(a.severity, 5), a.created_at), reverse=False)

    return [format_alert_item(a) for a in alerts]

@router.post("/alerts/scan", response_model=ScanAlertsResponse)
def trigger_alert_scan(
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Compliance Officer", "Administrator"], "escalation and alert scanning")
    ws = get_or_create_default_workspace(db)
    res = scan_workspace_alerts_logic(db, ws)

    # Log audit event
    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name="Escalation Engine",
        actor_role="SYSTEM_MONITOR",
        entity_type="ALERT_QUEUE",
        entity_id=ws.id,
        action="ALERT_SCAN_COMPLETED",
        details_json=res
    ))
    db.commit()

    return ScanAlertsResponse(**res)

@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertItem)
def acknowledge_alert(
    alert_id: str,
    req: AlertAcknowledgeRequest,
    db: Session = Depends(get_db)
):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    prev_status = alert.status
    alert.status = "ACKNOWLEDGED"

    db.add(AuditEvent(
        workspace_id=alert.workspace_id,
        actor_name=req.acknowledged_by,
        actor_role="COORDINATOR",
        entity_type="ALERT",
        entity_id=alert.id,
        action="ALERT_ACKNOWLEDGED",
        details_json={
            "alert_key": alert.alert_key,
            "title": alert.title,
            "previous_status": prev_status,
            "notes": req.notes
        }
    ))
    db.commit()
    db.refresh(alert)
    return format_alert_item(alert)

@router.post("/alerts/{alert_id}/assign", response_model=AlertItem)
def assign_alert(
    alert_id: str,
    req: AlertAssignRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "alert assignment")
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    prev_assignee = alert.assigned_to
    alert.assigned_to = req.assigned_to

    if req.dispatch_notification:
        email = req.assignee_email or f"{req.assigned_to.lower().replace(' ', '.')}@institute.ac.in"
        dispatch_simulated_email(
            db,
            alert,
            email,
            f"[ACTION REQUIRED] Alert Assigned to You: {alert.title}",
            f"You have been assigned to resolve the following institutional operational alert:\n\nTitle: {alert.title}\nSeverity: {alert.severity}\nExplanation: {alert.explanation}\n\nAssigned by: {req.assigned_by}"
        )

    db.add(AuditEvent(
        workspace_id=alert.workspace_id,
        actor_name=req.assigned_by,
        actor_role="ADMINISTRATOR",
        entity_type="ALERT",
        entity_id=alert.id,
        action="ALERT_ASSIGNED",
        details_json={
            "alert_key": alert.alert_key,
            "previous_assignee": prev_assignee,
            "new_assignee": req.assigned_to
        }
    ))
    db.commit()
    db.refresh(alert)
    return format_alert_item(alert)

@router.post("/alerts/{alert_id}/resolve", response_model=AlertItem)
def resolve_alert(
    alert_id: str,
    req: AlertResolveRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Compliance Officer", "Administrator"], "alert resolution")
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.status = "RESOLVED"
    alert.resolved_at = utc_now()
    alert.resolution_notes = req.resolution_notes

    db.add(AuditEvent(
        workspace_id=alert.workspace_id,
        actor_name=req.resolved_by,
        actor_role="COMPLIANCE_OFFICER",
        entity_type="ALERT",
        entity_id=alert.id,
        action="ALERT_RESOLVED",
        details_json={
            "alert_key": alert.alert_key,
            "title": alert.title,
            "resolution_notes": req.resolution_notes
        }
    ))
    db.commit()
    db.refresh(alert)
    return format_alert_item(alert)

# Simulated Notification Outbox Endpoints
@router.get("/notifications", response_model=List[NotificationItem])
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    notifs = db.query(NotificationOutbox).order_by(
        NotificationOutbox.created_at.desc()
    ).limit(limit).all()

    return [NotificationItem.model_validate(n) for n in notifs]
