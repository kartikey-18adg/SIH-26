from datetime import date, datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ApprovalCase, Alert, AuditEvent, EVCVisit, NotificationOutbox, WorkflowRoutingPolicy
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/evc", tags=["EVC Scheduling"])

SCHEDULING_ROLES = ["Administrator", "Compliance Officer", "Reviewer"]
QUEUE_ROLES = ["Administrator", "Compliance Officer", "Reviewer", "Institution Coordinator"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class EVCQueueRequest(BaseModel):
    case_id: str
    routing_basis: str = Field(..., min_length=8, max_length=1000,
                               description="Why the configured workflow requires an EVC visit")


class EVCScheduleRequest(BaseModel):
    scheduled_at: datetime
    venue: Optional[str] = Field(None, max_length=255)
    assigned_team: Optional[str] = Field(None, max_length=255)


class EVCRescheduleRequest(EVCScheduleRequest):
    reason: str = Field(..., min_length=4, max_length=1000)


class EVCCompleteRequest(BaseModel):
    completion_notes: str = Field(..., min_length=4, max_length=2000)


def _audit(db: Session, ws_id: str, actor: str, role: str, visit: EVCVisit,
           action: str, details: dict):
    db.add(AuditEvent(
        workspace_id=ws_id,
        actor_name=actor,
        actor_role=role,
        entity_type="EVC_VISIT",
        entity_id=visit.id,
        action=action,
        details_json={"case_id": visit.case_id, **details},
    ))


def _format(visit: EVCVisit, case: ApprovalCase) -> dict:
    inst = case.institution
    now = utc_now()
    scheduled_at = visit.scheduled_at
    if scheduled_at and scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
    overdue = bool(
        visit.status == "SCHEDULED" and scheduled_at and scheduled_at < now
    )
    return {
        "id": visit.id,
        "case_id": case.id,
        "case_reference": case.case_reference,
        "institution_name": inst.legal_name if inst else "Unknown institution",
        "current_stage": case.current_stage,
        "priority": case.priority,
        "target_date": case.target_date,
        "routing_basis": visit.routing_basis,
        "status": "OVERDUE" if overdue else visit.status,
        "scheduled_at": visit.scheduled_at,
        "venue": visit.venue,
        "assigned_team": visit.assigned_team,
        "completed_at": visit.completed_at,
        "completion_notes": visit.completion_notes,
        "created_by": visit.created_by,
        "created_at": visit.created_at,
        "updated_at": visit.updated_at,
        "is_overdue": overdue,
    }


@router.get("/queue")
def list_evc_queue(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, QUEUE_ROLES, "viewing the EVC queue")
    ws = get_or_create_default_workspace(db)
    rows = db.query(EVCVisit, ApprovalCase).join(
        ApprovalCase, EVCVisit.case_id == ApprovalCase.id
    ).filter(
        EVCVisit.workspace_id == ws.id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode,
    ).order_by(EVCVisit.scheduled_at.asc(), EVCVisit.created_at.asc()).all()

    items = [_format(visit, case) for visit, case in rows]
    if status_filter and status_filter.upper() != "ALL":
        wanted = status_filter.upper()
        items = [item for item in items if item["status"] == wanted]
    return {"items": items, "total": len(items), "active_data_mode": ws.active_data_mode}


@router.post("/queue", status_code=status.HTTP_201_CREATED)
def add_case_to_evc_queue(
    req: EVCQueueRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, ["Administrator", "Compliance Officer"], "routing a case to EVC")
    ws = get_or_create_default_workspace(db)
    policy = db.query(WorkflowRoutingPolicy).filter(
        WorkflowRoutingPolicy.workspace_id == ws.id
    ).first()
    if policy and policy.pathway == "SCRUTINY_ONLY":
        raise HTTPException(
            status_code=409,
            detail="The saved workspace pathway is Scrutiny only. Update the pathway configuration before routing a case to EVC, if the applicable verified workflow requires it."
        )
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == req.case_id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Approval case not found in the active workspace data mode.")

    active = db.query(EVCVisit).filter(
        EVCVisit.case_id == case.id,
        EVCVisit.status.in_(["WAITING_TO_SCHEDULE", "SCHEDULED"]),
    ).first()
    if active:
        raise HTTPException(status_code=409, detail="This case already has an active EVC visit.")

    visit = EVCVisit(
        workspace_id=ws.id,
        case_id=case.id,
        routing_basis=req.routing_basis.strip(),
        status="WAITING_TO_SCHEDULE",
        created_by=current_role,
    )
    db.add(visit)
    db.flush()
    _audit(db, ws.id, current_role, current_role, visit, "EVC_QUEUED",
           {"routing_basis": req.routing_basis.strip()})
    db.commit()
    db.refresh(visit)
    return _format(visit, case)


@router.put("/{visit_id}/schedule")
def schedule_evc_visit(
    visit_id: str,
    req: EVCScheduleRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, SCHEDULING_ROLES, "scheduling an EVC visit")
    if req.scheduled_at.tzinfo is None or req.scheduled_at.utcoffset() is None:
        raise HTTPException(status_code=400, detail="scheduled_at must include a timezone offset.")
    if req.scheduled_at <= utc_now():
        raise HTTPException(status_code=400, detail="EVC visit must be scheduled for a future time.")

    ws = get_or_create_default_workspace(db)
    visit = db.query(EVCVisit).filter(EVCVisit.id == visit_id, EVCVisit.workspace_id == ws.id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="EVC visit not found.")
    if visit.status != "WAITING_TO_SCHEDULE":
        raise HTTPException(status_code=409, detail="Only visits waiting to be scheduled can be scheduled.")

    visit.scheduled_at = req.scheduled_at
    visit.venue = req.venue
    visit.assigned_team = req.assigned_team
    visit.status = "SCHEDULED"
    visit.updated_at = utc_now()
    _audit(db, ws.id, current_role, current_role, visit, "EVC_SCHEDULED",
           {"scheduled_at": req.scheduled_at.isoformat(), "venue": req.venue, "assigned_team": req.assigned_team})
    db.commit()
    db.refresh(visit)
    case = db.query(ApprovalCase).filter(ApprovalCase.id == visit.case_id).first()
    return _format(visit, case)


@router.put("/{visit_id}/reschedule")
def reschedule_evc_visit(
    visit_id: str,
    req: EVCRescheduleRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, SCHEDULING_ROLES, "rescheduling an EVC visit")
    if req.scheduled_at.tzinfo is None or req.scheduled_at.utcoffset() is None:
        raise HTTPException(status_code=400, detail="scheduled_at must include a timezone offset.")
    if req.scheduled_at <= utc_now():
        raise HTTPException(status_code=400, detail="EVC visit must be rescheduled to a future time.")

    ws = get_or_create_default_workspace(db)
    visit = db.query(EVCVisit).filter(EVCVisit.id == visit_id, EVCVisit.workspace_id == ws.id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="EVC visit not found.")
    if visit.status != "SCHEDULED":
        raise HTTPException(status_code=409, detail="Only scheduled visits can be rescheduled.")

    old_time = visit.scheduled_at.isoformat() if visit.scheduled_at else None
    visit.scheduled_at = req.scheduled_at
    visit.venue = req.venue
    visit.assigned_team = req.assigned_team
    visit.updated_at = utc_now()
    _audit(db, ws.id, current_role, current_role, visit, "EVC_RESCHEDULED",
           {"previous_scheduled_at": old_time, "scheduled_at": req.scheduled_at.isoformat(),
            "reason": req.reason, "venue": req.venue, "assigned_team": req.assigned_team})
    db.commit()
    db.refresh(visit)
    case = db.query(ApprovalCase).filter(ApprovalCase.id == visit.case_id).first()
    return _format(visit, case)


@router.put("/{visit_id}/complete")
def complete_evc_visit(
    visit_id: str,
    req: EVCCompleteRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, SCHEDULING_ROLES, "completing an EVC visit")
    ws = get_or_create_default_workspace(db)
    visit = db.query(EVCVisit).filter(EVCVisit.id == visit_id, EVCVisit.workspace_id == ws.id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="EVC visit not found.")
    if visit.status != "SCHEDULED":
        raise HTTPException(status_code=409, detail="Only scheduled visits can be completed.")

    visit.status = "COMPLETED"
    visit.completed_at = utc_now()
    visit.completion_notes = req.completion_notes.strip()
    visit.updated_at = utc_now()
    _audit(db, ws.id, current_role, current_role, visit, "EVC_COMPLETED",
           {"completed_at": visit.completed_at.isoformat(), "completion_notes": visit.completion_notes})
    db.commit()
    db.refresh(visit)
    case = db.query(ApprovalCase).filter(ApprovalCase.id == visit.case_id).first()
    return _format(visit, case)


@router.post("/scan-reminders")
def scan_evc_reminders(
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    """Create idempotent in-app alerts for upcoming and overdue EVC visits.

    Email entries are explicitly marked simulated; this endpoint does not send real email.
    Run this endpoint periodically from an authorized scheduler or operator.
    """
    check_role_permission(current_role, ["Administrator", "Compliance Officer"], "EVC reminder scanning")
    ws = get_or_create_default_workspace(db)
    now = utc_now()
    horizon = now + timedelta(days=7)
    visits = db.query(EVCVisit, ApprovalCase).join(
        ApprovalCase, EVCVisit.case_id == ApprovalCase.id
    ).filter(
        EVCVisit.workspace_id == ws.id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode,
        EVCVisit.status == "SCHEDULED",
        EVCVisit.scheduled_at.isnot(None),
    ).all()

    created = 0
    updated = 0
    notifications = 0
    for visit, case in visits:
        scheduled = visit.scheduled_at
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        is_overdue = scheduled < now
        is_upcoming = now <= scheduled <= horizon
        if not is_overdue and not is_upcoming:
            continue

        key = f"EVC-{'OVERDUE' if is_overdue else 'UPCOMING'}-{visit.id}"
        severity = "CRITICAL" if is_overdue else "HIGH"
        level = 2 if is_overdue else 1
        title = (
            f"EVC Visit Overdue: {case.case_reference}"
            if is_overdue else f"EVC Visit Coming Up: {case.case_reference}"
        )
        explanation = (
            f"The scheduled EVC visit for {case.case_reference} was set for "
            f"{scheduled.isoformat()} and has passed without being marked complete. "
            "Confirm the visit status or reschedule with a recorded reason."
            if is_overdue else
            f"The EVC visit for {case.case_reference} is scheduled for "
            f"{scheduled.isoformat()}. Confirm team and venue readiness."
        )
        alert = db.query(Alert).filter(
            Alert.workspace_id == ws.id, Alert.alert_key == key
        ).first()
        if not alert:
            alert = Alert(
                workspace_id=ws.id, case_id=case.id, alert_key=key,
                category="EVC_VISIT_OVERDUE" if is_overdue else "EVC_VISIT_REMINDER",
                severity=severity, title=title, explanation=explanation,
                status="OPEN", escalation_level=level, assigned_to=case.internal_owner_name,
            )
            db.add(alert)
            db.flush()
            created += 1
            recipient = f"{case.internal_owner_name.lower().replace(' ', '.')}@institute.ac.in"
            db.add(NotificationOutbox(
                alert_id=alert.id,
                recipient_email=recipient,
                channel="SIMULATED_EMAIL",
                delivery_status="DISPATCHED_SIMULATED",
                is_simulated=True,
                subject=f"[{severity}] {title}",
                body=explanation,
                created_at=now,
            ))
            notifications += 1
        elif alert.status in ["OPEN", "ACKNOWLEDGED"]:
            if alert.severity != severity or alert.escalation_level != level or alert.explanation != explanation:
                alert.severity = severity
                alert.escalation_level = level
                alert.title = title
                alert.explanation = explanation
                updated += 1

    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name=current_role,
        actor_role=current_role,
        entity_type="EVC_QUEUE",
        entity_id=ws.id,
        action="EVC_REMINDER_SCAN_COMPLETED",
        details_json={"created": created, "updated": updated, "notifications_simulated": notifications},
    ))
    db.commit()
    return {
        "scanned_visits": len(visits),
        "new_alerts_created": created,
        "existing_alerts_updated": updated,
        "simulated_notifications_created": notifications,
        "delivery_note": "Notifications are logged as simulated only; no email was sent.",
    }
