from datetime import date, datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Workspace, ApprovalCase, EvidenceDocument, ComplianceObligation, EVCAppointment,
    Alert, NotificationOutbox, AuditEvent
)
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api", tags=["Undertakings & EVC"])

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class ObligationCreate(BaseModel):
    case_id: str
    title: str = Field(..., min_length=3, max_length=255)
    description: str = Field(..., min_length=4)
    obligation_type: str = "UNDERTAKING"
    due_date: date
    reminder_days: int = Field(14, ge=0, le=365)
    escalation_days: int = Field(0, ge=0, le=365)
    assigned_to: str = Field(..., min_length=2, max_length=100)
    created_by: str = "Administrator"

class ObligationUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = Field(None, min_length=4)
    due_date: Optional[date] = None
    reminder_days: Optional[int] = Field(None, ge=0, le=365)
    escalation_days: Optional[int] = Field(None, ge=0, le=365)
    assigned_to: Optional[str] = Field(None, min_length=2, max_length=100)
    updated_by: str = "Administrator"

class EvidenceSubmission(BaseModel):
    evidence_document_id: str
    notes: str = Field(..., min_length=4)
    submitted_by: str = Field(..., min_length=2)

class ObligationVerification(BaseModel):
    decision: str = Field(..., description="VERIFIED or REJECTED")
    notes: str = Field(..., min_length=4)
    verified_by: str = Field(..., min_length=2)

class EVCAppointmentCreate(BaseModel):
    case_id: str
    committee_name: str = Field(..., min_length=2, max_length=255)
    scheduled_at: datetime
    location_or_mode: Optional[str] = None
    scheduled_by: str = Field(..., min_length=2)

class EVCAppointmentUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    committee_name: Optional[str] = Field(None, min_length=2, max_length=255)
    location_or_mode: Optional[str] = None
    status: Optional[str] = None
    completion_notes: Optional[str] = None
    updated_by: str = "Administrator"

def _active_case(db: Session, ws: Workspace, case_id: str) -> ApprovalCase:
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found in the active data mode.")
    return case

def _obligation_dict(item: ComplianceObligation, today: Optional[date] = None):
    today = today or date.today()
    case = item.case_id
    return {
        "id": item.id, "case_id": case, "case_reference": item.case.case_reference if item.case else None,
        "institution_name": item.case.institution.legal_name if item.case and item.case.institution else None,
        "title": item.title, "description": item.description, "obligation_type": item.obligation_type,
        "due_date": item.due_date, "days_remaining": (item.due_date - today).days,
        "is_overdue": item.due_date < today and item.status != "VERIFIED",
        "reminder_days": item.reminder_days, "escalation_days": item.escalation_days,
        "assigned_to": item.assigned_to, "status": item.status,
        "submitted_evidence_document_id": item.submitted_evidence_document_id,
        "submission_notes": item.submission_notes, "submitted_by": item.submitted_by,
        "submitted_at": item.submitted_at, "verification_notes": item.verification_notes,
        "verified_by": item.verified_by, "verified_at": item.verified_at,
        "created_by": item.created_by, "created_at": item.created_at, "updated_at": item.updated_at,
    }

def _evc_dict(item: EVCAppointment):
    return {
        "id": item.id, "case_id": item.case_id,
        "case_reference": item.case.case_reference if item.case else None,
        "institution_name": item.case.institution.legal_name if item.case and item.case.institution else None,
        "committee_name": item.committee_name, "scheduled_at": item.scheduled_at,
        "location_or_mode": item.location_or_mode, "status": item.status,
        "completion_notes": item.completion_notes, "scheduled_by": item.scheduled_by,
        "completed_by": item.completed_by, "completed_at": item.completed_at,
        "created_at": item.created_at, "updated_at": item.updated_at,
    }

def _audit(db: Session, ws: Workspace, actor: str, role: str, entity: str, entity_id: str, action: str, details: dict):
    db.add(AuditEvent(
        workspace_id=ws.id, actor_name=actor, actor_role=role, entity_type=entity,
        entity_id=entity_id, action=action, details_json=details
    ))

@router.get("/obligations")
def list_obligations(
    case_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    ws = get_or_create_default_workspace(db)
    query = db.query(ComplianceObligation).join(ApprovalCase).filter(
        ComplianceObligation.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    )
    if case_id:
        query = query.filter(ComplianceObligation.case_id == case_id)
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(ComplianceObligation.status == status_filter.upper())
    return [_obligation_dict(x) for x in query.order_by(ComplianceObligation.due_date.asc()).all()]

@router.post("/obligations", status_code=status.HTTP_201_CREATED)
def create_obligation(
    req: ObligationCreate, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Institution Coordinator", "Administrator"], "creating compliance obligations")
    ws = get_or_create_default_workspace(db)
    case = _active_case(db, ws, req.case_id)
    item = ComplianceObligation(
        workspace_id=ws.id, case_id=case.id, title=req.title.strip(),
        description=req.description.strip(), obligation_type=req.obligation_type.upper(),
        due_date=req.due_date, reminder_days=req.reminder_days, escalation_days=req.escalation_days,
        assigned_to=req.assigned_to.strip(), status="PENDING", created_by=req.created_by.strip()
    )
    db.add(item)
    db.flush()
    _audit(db, ws, req.created_by, role.upper().replace(" ", "_"), "OBLIGATION", item.id,
           "OBLIGATION_CREATED", {"case_reference": case.case_reference, "title": item.title,
           "due_date": item.due_date.isoformat(), "reminder_days": item.reminder_days})
    db.commit()
    db.refresh(item)
    return _obligation_dict(item)

@router.patch("/obligations/{obligation_id}")
def update_obligation(
    obligation_id: str, req: ObligationUpdate, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Institution Coordinator", "Administrator"], "updating compliance obligations")
    ws = get_or_create_default_workspace(db)
    item = db.query(ComplianceObligation).join(ApprovalCase).filter(
        ComplianceObligation.id == obligation_id, ComplianceObligation.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Obligation not found in the active data mode.")
    before = {"due_date": item.due_date.isoformat(), "assigned_to": item.assigned_to, "status": item.status}
    for field in ("title", "description", "due_date", "reminder_days", "escalation_days", "assigned_to"):
        value = getattr(req, field)
        if value is not None:
            setattr(item, field, value.strip() if isinstance(value, str) else value)
    item.updated_at = utc_now()
    _audit(db, ws, req.updated_by, role.upper().replace(" ", "_"), "OBLIGATION", item.id,
           "OBLIGATION_UPDATED", {"before": before, "after": {"due_date": item.due_date.isoformat(),
           "assigned_to": item.assigned_to, "status": item.status}})
    db.commit()
    db.refresh(item)
    return _obligation_dict(item)

@router.post("/obligations/{obligation_id}/submit")
def submit_obligation_evidence(
    obligation_id: str, req: EvidenceSubmission, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Institution Coordinator", "Administrator"], "submitting obligation evidence")
    ws = get_or_create_default_workspace(db)
    item = db.query(ComplianceObligation).filter(
        ComplianceObligation.id == obligation_id, ComplianceObligation.workspace_id == ws.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Obligation not found.")
    case = _active_case(db, ws, item.case_id)
    doc = db.query(EvidenceDocument).filter(
        EvidenceDocument.id == req.evidence_document_id, EvidenceDocument.case_id == case.id
    ).first()
    if not doc:
        raise HTTPException(status_code=400, detail="Evidence must be an existing document attached to the same case.")
    if item.status == "VERIFIED":
        raise HTTPException(status_code=409, detail="A verified obligation cannot be resubmitted; create a new obligation if required.")
    item.submitted_evidence_document_id = doc.id
    item.submission_notes = req.notes.strip()
    item.submitted_by = req.submitted_by.strip()
    item.submitted_at = utc_now()
    item.status = "SUBMITTED"
    item.updated_at = utc_now()
    _audit(db, ws, req.submitted_by, role.upper().replace(" ", "_"), "OBLIGATION", item.id,
           "OBLIGATION_EVIDENCE_SUBMITTED", {"evidence_document_id": doc.id, "sha256_hash": doc.sha256_hash})
    db.commit()
    db.refresh(item)
    return _obligation_dict(item)

@router.post("/obligations/{obligation_id}/verify")
def verify_obligation(
    obligation_id: str, req: ObligationVerification, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Compliance Officer", "Reviewer", "Administrator"], "verifying obligation evidence")
    decision = req.decision.upper()
    if decision not in {"VERIFIED", "REJECTED"}:
        raise HTTPException(status_code=400, detail="Decision must be VERIFIED or REJECTED.")
    ws = get_or_create_default_workspace(db)
    item = db.query(ComplianceObligation).filter(
        ComplianceObligation.id == obligation_id, ComplianceObligation.workspace_id == ws.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Obligation not found.")
    _active_case(db, ws, item.case_id)
    if item.status != "SUBMITTED" or not item.submitted_evidence_document_id:
        raise HTTPException(status_code=409, detail="Evidence must be submitted before verification.")
    item.status = decision
    item.verification_notes = req.notes.strip()
    item.verified_by = req.verified_by.strip()
    item.verified_at = utc_now()
    item.updated_at = utc_now()
    if decision == "VERIFIED":
        active_alerts = db.query(Alert).filter(
            Alert.workspace_id == ws.id, Alert.case_id == item.case_id,
            Alert.alert_key.like(f"ALERT-OBLIGATION-%-{item.id[:8]}"),
            Alert.status.in_(["OPEN", "ACKNOWLEDGED"])
        ).all()
        for alert in active_alerts:
            alert.status = "RESOLVED"
            alert.resolved_at = utc_now()
            alert.resolution_notes = "Obligation evidence verified by authorized reviewer."
    _audit(db, ws, req.verified_by, role.upper().replace(" ", "_"), "OBLIGATION", item.id,
           "OBLIGATION_EVIDENCE_" + decision, {"evidence_document_id": item.submitted_evidence_document_id,
           "notes": item.verification_notes})
    db.commit()
    db.refresh(item)
    return _obligation_dict(item)

@router.post("/obligations/scan")
def scan_obligation_deadlines(
    db: Session = Depends(get_db), role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Compliance Officer", "Administrator"], "scanning obligation deadlines")
    ws = get_or_create_default_workspace(db)
    today = date.today()
    items = db.query(ComplianceObligation).join(ApprovalCase).filter(
        ComplianceObligation.workspace_id == ws.id, ApprovalCase.data_mode == ws.active_data_mode,
        ComplianceObligation.status != "VERIFIED"
    ).all()
    created = 0
    notifications = 0
    for item in items:
        days_left = (item.due_date - today).days
        overdue = days_left < 0
        if not overdue and days_left > item.reminder_days:
            continue
        level = 2 if overdue and abs(days_left) > item.escalation_days else (1 if overdue else 0)
        suffix = "OVERDUE" if overdue else "DUE"
        key = f"ALERT-OBLIGATION-{suffix}-{item.id[:8]}"
        existing = db.query(Alert).filter(Alert.workspace_id == ws.id, Alert.alert_key == key).first()
        if existing:
            if existing.status in ["OPEN", "ACKNOWLEDGED"]:
                existing.severity = "CRITICAL" if level == 2 else ("HIGH" if level == 1 else "MEDIUM")
                existing.escalation_level = max(existing.escalation_level, level)
                existing.explanation = (f"Obligation '{item.title}' for {item.case.case_reference} is overdue by {abs(days_left)} day(s)." if overdue
                    else f"Obligation '{item.title}' for {item.case.case_reference} is due in {days_left} day(s).")
            continue
        alert = Alert(
            workspace_id=ws.id, case_id=item.case_id, alert_key=key,
            category="UNDERTAKING_OVERDUE" if overdue else "UNDERTAKING_DUE",
            severity="CRITICAL" if level == 2 else ("HIGH" if level == 1 else "MEDIUM"),
            title=(f"Overdue obligation: {item.title}" if overdue else f"Obligation due soon: {item.title}"),
            explanation=(f"Obligation '{item.title}' for {item.case.case_reference} is overdue by {abs(days_left)} day(s)." if overdue
                else f"Obligation '{item.title}' for {item.case.case_reference} is due in {days_left} day(s)."),
            status="OPEN", escalation_level=level, assigned_to=item.assigned_to
        )
        db.add(alert)
        db.flush()
        db.add(NotificationOutbox(
            alert_id=alert.id, recipient_email=f"{item.assigned_to.lower().replace(' ', '.')}@institute.ac.in",
            channel="SIMULATED_EMAIL", delivery_status="DISPATCHED_SIMULATED", is_simulated=True,
            subject=f"[AIClear {suffix}] {item.title}",
            body=f"Case: {item.case.case_reference}\nDue date: {item.due_date}\nStatus: {item.status}\nPlease review this obligation.\nNotifications are simulated in this prototype."
        ))
        _audit(db, ws, "Obligation Deadline Scanner", "SYSTEM_MONITOR", "OBLIGATION", item.id,
               "OBLIGATION_DEADLINE_ALERT_CREATED", {"alert_key": key, "days_remaining": days_left, "escalation_level": level})
        created += 1
        notifications += 1
    db.commit()
    return {"scanned_obligations": len(items), "new_alerts_created": created, "notifications_generated": notifications}

@router.get("/evc/appointments")
def list_evc_appointments(
    status_filter: Optional[str] = Query(None, alias="status"),
    case_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    ws = get_or_create_default_workspace(db)
    query = db.query(EVCAppointment).join(ApprovalCase).filter(
        EVCAppointment.workspace_id == ws.id, ApprovalCase.data_mode == ws.active_data_mode
    )
    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(EVCAppointment.status == status_filter.upper())
    if case_id:
        query = query.filter(EVCAppointment.case_id == case_id)
    return [_evc_dict(x) for x in query.order_by(EVCAppointment.scheduled_at.asc()).all()]

@router.post("/evc/appointments", status_code=status.HTTP_201_CREATED)
def create_evc_appointment(
    req: EVCAppointmentCreate, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Reviewer", "Compliance Officer", "Administrator"], "scheduling EVC appointments")
    ws = get_or_create_default_workspace(db)
    case = _active_case(db, ws, req.case_id)
    appointment = EVCAppointment(
        workspace_id=ws.id, case_id=case.id, committee_name=req.committee_name.strip(),
        scheduled_at=req.scheduled_at, location_or_mode=req.location_or_mode,
        status="SCHEDULED", scheduled_by=req.scheduled_by.strip()
    )
    db.add(appointment)
    db.flush()
    _audit(db, ws, req.scheduled_by, role.upper().replace(" ", "_"), "EVC_APPOINTMENT", appointment.id,
           "EVC_APPOINTMENT_SCHEDULED", {"case_reference": case.case_reference, "scheduled_at": req.scheduled_at.isoformat()})
    db.commit()
    db.refresh(appointment)
    return _evc_dict(appointment)

@router.patch("/evc/appointments/{appointment_id}")
def update_evc_appointment(
    appointment_id: str, req: EVCAppointmentUpdate, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Reviewer", "Compliance Officer", "Administrator"], "updating EVC appointments")
    ws = get_or_create_default_workspace(db)
    appointment = db.query(EVCAppointment).join(ApprovalCase).filter(
        EVCAppointment.id == appointment_id, EVCAppointment.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="EVC appointment not found in the active data mode.")
    if req.status:
        new_status = req.status.upper()
        if new_status not in {"SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED", "MISSED"}:
            raise HTTPException(status_code=400, detail="Unsupported EVC appointment status.")
        appointment.status = new_status
        if new_status == "COMPLETED":
            if not req.completion_notes or len(req.completion_notes.strip()) < 4:
                raise HTTPException(status_code=400, detail="Completion notes are required when marking an EVC complete.")
            appointment.completion_notes = req.completion_notes.strip()
            appointment.completed_by = req.updated_by
            appointment.completed_at = utc_now()
        elif new_status != "COMPLETED":
            appointment.completed_by = None
            appointment.completed_at = None
    if req.scheduled_at:
        appointment.scheduled_at = req.scheduled_at
        if appointment.status == "SCHEDULED":
            appointment.status = "RESCHEDULED"
    if req.committee_name:
        appointment.committee_name = req.committee_name.strip()
    if req.location_or_mode is not None:
        appointment.location_or_mode = req.location_or_mode
    appointment.updated_at = utc_now()
    _audit(db, ws, req.updated_by, role.upper().replace(" ", "_"), "EVC_APPOINTMENT", appointment.id,
           "EVC_APPOINTMENT_UPDATED", {"status": appointment.status, "scheduled_at": appointment.scheduled_at.isoformat(),
           "completion_notes": appointment.completion_notes})
    db.commit()
    db.refresh(appointment)
    return _evc_dict(appointment)

@router.get("/operations/summary")
def operational_summary(db: Session = Depends(get_db)):
    """Mode-isolated operational metrics for stage, region, EVC, obligations and expiring documents."""
    ws = get_or_create_default_workspace(db)
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id, ApprovalCase.data_mode == ws.active_data_mode
    ).all()
    case_ids = [c.id for c in cases]
    today = date.today()
    stages = {}
    regions = {}
    for case in cases:
        stages[case.current_stage] = stages.get(case.current_stage, 0) + 1
        region = case.institution.state if case.institution else "Unknown"
        regions[region] = regions.get(region, 0) + 1
    obligations = db.query(ComplianceObligation).filter(ComplianceObligation.workspace_id == ws.id,
        ComplianceObligation.case_id.in_(case_ids)).all() if case_ids else []
    evcs = db.query(EVCAppointment).filter(EVCAppointment.workspace_id == ws.id,
        EVCAppointment.case_id.in_(case_ids)).all() if case_ids else []
    documents = db.query(EvidenceDocument).filter(EvidenceDocument.case_id.in_(case_ids)).all() if case_ids else []
    return {
        "active_data_mode": ws.active_data_mode,
        "cases_total": len(cases),
        "stage_pendency": [{"stage": key, "count": value} for key, value in sorted(stages.items())],
        "region_pendency": [{"region": key, "count": value} for key, value in sorted(regions.items())],
        "obligations_pending": sum(1 for x in obligations if x.status != "VERIFIED"),
        "obligations_overdue": sum(1 for x in obligations if x.status != "VERIFIED" and x.due_date < today),
        "evc_scheduled": sum(1 for x in evcs if x.status in {"SCHEDULED", "RESCHEDULED"}),
        "evc_overdue": sum(1 for x in evcs if x.status in {"SCHEDULED", "RESCHEDULED"} and x.scheduled_at.date() < today),
        "documents_expiring_30_days": sum(1 for x in documents if x.expiry_date and 0 <= (x.expiry_date - today).days <= 30),
    }
