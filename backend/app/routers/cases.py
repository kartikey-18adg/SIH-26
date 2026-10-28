import uuid
from datetime import datetime, date, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (
    Workspace, ApprovalCase, CaseStageHistory, Institution, 
    EvidenceDocument, ComplianceResult, Task, Alert, AuditEvent, WorkflowPathwayAssignment
)
from .workspace import get_or_create_default_workspace
from ..permissions import get_current_role, check_role_permission, ROLE_PERMISSIONS, normalize_role

router = APIRouter(prefix="/api/cases", tags=["Case Management"])

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

# Allowed Stage Transitions Map
VALID_STAGE_TRANSITIONS: Dict[str, List[str]] = {
    "DRAFT": ["INFO_COLLECTION", "DOCUMENT_REVIEW", "CLOSED"],
    "INFO_COLLECTION": ["DOCUMENT_REVIEW", "EVC", "DRAFT"],
    "DOCUMENT_REVIEW": ["COMPLIANCE_CHECKS", "EVC", "CORRECTIONS_REQUIRED", "DRAFT"],
    "COMPLIANCE_CHECKS": ["INTERNAL_REVIEW", "CORRECTIONS_REQUIRED", "DOCUMENT_REVIEW"],
    "EVC": ["SAC_SHC", "COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "CORRECTIONS_REQUIRED"],
    "SAC_SHC": ["INTERNAL_REVIEW", "CORRECTIONS_REQUIRED"],
    "INTERNAL_REVIEW": ["READY_FOR_SUBMISSION", "CORRECTIONS_REQUIRED", "COMPLIANCE_CHECKS", "CLOSED"],
    "CORRECTIONS_REQUIRED": ["DOCUMENT_REVIEW", "COMPLIANCE_CHECKS", "INTERNAL_REVIEW"],
    "READY_FOR_SUBMISSION": ["RECORDED_EXTERNALLY_SUBMITTED", "INTERNAL_REVIEW", "CLOSED"],
    "RECORDED_EXTERNALLY_SUBMITTED": ["EXTERNAL_RESPONSE_RECEIVED", "CLOSED"],
    "EXTERNAL_RESPONSE_RECEIVED": ["CLOSED", "CORRECTIONS_REQUIRED"],
    "CLOSED": ["DRAFT"]
}

STAGE_STATUS_MAPPING: Dict[str, str] = {
    "DRAFT": "IN_PROGRESS",
    "INFO_COLLECTION": "IN_PROGRESS",
    "DOCUMENT_REVIEW": "IN_PROGRESS",
    "COMPLIANCE_CHECKS": "IN_PROGRESS",
    "EVC": "AWAITING_REVIEW",
    "SAC_SHC": "AWAITING_REVIEW",
    "INTERNAL_REVIEW": "AWAITING_REVIEW",
    "CORRECTIONS_REQUIRED": "NEEDS_ATTENTION",
    "READY_FOR_SUBMISSION": "COMPLETED",
    "RECORDED_EXTERNALLY_SUBMITTED": "COMPLETED",
    "EXTERNAL_RESPONSE_RECEIVED": "IN_PROGRESS",
    "CLOSED": "COMPLETED"
}


def _allowed_next_stages(db: Session, case: ApprovalCase) -> List[str]:
    """Return configured pathway next steps when present, otherwise legacy state-machine steps."""
    assignment = db.query(WorkflowPathwayAssignment).filter_by(
        workspace_id=case.workspace_id, case_id=case.id
    ).first()
    if not assignment:
        return VALID_STAGE_TRANSITIONS.get(case.current_stage, [])
    sequence = assignment.stage_sequence or []
    current = case.current_stage
    if current == "CORRECTIONS_REQUIRED":
        prior = db.query(CaseStageHistory).filter(
            CaseStageHistory.case_id == case.id,
            CaseStageHistory.to_stage == "CORRECTIONS_REQUIRED"
        ).order_by(CaseStageHistory.changed_at.desc()).first()
        return [prior.from_stage] if prior else []
    if current not in sequence:
        return VALID_STAGE_TRANSITIONS.get(current, [])
    if current == "READY_FOR_SUBMISSION":
        return ["RECORDED_EXTERNALLY_SUBMITTED", "CLOSED"]
    if current == "RECORDED_EXTERNALLY_SUBMITTED":
        return ["EXTERNAL_RESPONSE_RECEIVED", "CLOSED"]
    if current == "EXTERNAL_RESPONSE_RECEIVED":
        return ["CLOSED", "CORRECTIONS_REQUIRED"]
    index = sequence.index(current)
    result = [sequence[index + 1]] if index + 1 < len(sequence) else []
    if current not in {"DRAFT", "READY_FOR_SUBMISSION", "CLOSED"}:
        result.append("CORRECTIONS_REQUIRED")
    return result

# Pydantic Schemas
class CaseCreateRequest(BaseModel):
    institute_name: str
    aicte_permanent_id: Optional[str] = None
    institute_type: str = "PRIVATE_SELF_FINANCED"
    state: str = "Maharashtra"
    district: str = "Pune"
    case_reference: Optional[str] = None
    workflow_type: str = "EXTENSION_OF_APPROVAL"
    academic_period: str = "2025-2026"
    priority: str = "MEDIUM"
    internal_owner_name: str
    target_date: str
    notes: Optional[str] = None

class CaseUpdateRequest(BaseModel):
    priority: Optional[str] = None
    internal_owner_name: Optional[str] = None
    target_date: Optional[str] = None
    notes: Optional[str] = None

class CaseTransitionRequest(BaseModel):
    to_stage: str
    reason: str = Field(..., min_length=4, description="Justification for stage transition")
    changed_by: str = "Institutional Coordinator"

class StageHistoryItem(BaseModel):
    id: str
    from_stage: str
    to_stage: str
    changed_by: str
    reason: str
    changed_at: datetime

    class Config:
        from_attributes = True

class CaseDetailResponse(BaseModel):
    id: str
    case_reference: str
    institution_id: str
    institution_name: str
    aicte_permanent_id: Optional[str] = None
    institution_type: str
    state: str
    district: str
    workflow_type: str
    academic_period: str
    current_stage: str
    status: str
    priority: str
    internal_owner_name: str
    target_date: date
    days_remaining: int
    notes: Optional[str] = None
    data_mode: str
    created_at: datetime
    updated_at: datetime
    allowed_next_stages: List[str]
    stage_history: List[StageHistoryItem]
    documents_count: int
    compliance_results_count: int
    tasks_count: int
    alerts_count: int

@router.get("", response_model=List[CaseDetailResponse])
def list_cases(
    stage: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    workflow_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)
    query = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    )

    if stage and isinstance(stage, str) and stage != "ALL":
        query = query.filter(ApprovalCase.current_stage == stage.upper().replace(" ", "_"))
    if status_filter and isinstance(status_filter, str) and status_filter != "ALL":
        query = query.filter(ApprovalCase.status == status_filter.upper().replace(" ", "_"))
    if priority and isinstance(priority, str) and priority != "ALL":
        query = query.filter(ApprovalCase.priority == priority.upper())
    if workflow_type and isinstance(workflow_type, str) and workflow_type != "ALL":
        query = query.filter(ApprovalCase.workflow_type == workflow_type.upper().replace(" ", "_"))

    cases = query.order_by(ApprovalCase.target_date.asc()).all()

    today = date.today()
    results = []
    for c in cases:
        inst = c.institution
        # Search filter
        if search:
            term = search.lower()
            ref_match = term in c.case_reference.lower()
            inst_match = inst and term in inst.legal_name.lower()
            owner_match = term in c.internal_owner_name.lower()
            if not (ref_match or inst_match or owner_match):
                continue

        histories = [StageHistoryItem.model_validate(h) for h in c.stage_history]
        results.append(CaseDetailResponse(
            id=c.id,
            case_reference=c.case_reference,
            institution_id=c.institution_id,
            institution_name=inst.legal_name if inst else "Unknown",
            aicte_permanent_id=inst.aicte_permanent_id if inst else None,
            institution_type=inst.institution_type if inst else "N/A",
            state=inst.state if inst else "N/A",
            district=inst.district if inst else "N/A",
            workflow_type=c.workflow_type,
            academic_period=c.academic_period,
            current_stage=c.current_stage,
            status=c.status,
            priority=c.priority,
            internal_owner_name=c.internal_owner_name,
            target_date=c.target_date,
            days_remaining=(c.target_date - today).days,
            notes=c.notes,
            data_mode=c.data_mode,
            created_at=c.created_at,
            updated_at=c.updated_at,
            allowed_next_stages=_allowed_next_stages(db, c),
            stage_history=histories,
            documents_count=len(c.documents),
            compliance_results_count=len(c.compliance_results),
            tasks_count=len(c.tasks),
            alerts_count=len(c.alerts)
        ))

    return results

@router.post("", response_model=CaseDetailResponse, status_code=status.HTTP_201_CREATED)
def create_case(
    req: CaseCreateRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "case creation")
    ws = get_or_create_default_workspace(db)

    # Validate target date
    try:
        t_date = date.fromisoformat(req.target_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid target date format: '{req.target_date}'. Expected YYYY-MM-DD."
        )

    # Auto-generate case reference if not provided
    case_ref = req.case_reference
    if not case_ref:
        case_ref = f"CASE-{date.today().year}-{uuid.uuid4().hex[:5].upper()}"

    # Check uniqueness within active workspace & mode
    existing = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.case_reference == case_ref,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Case reference '{case_ref}' already exists in the active workspace."
        )

    # Upsert Institution
    inst = None
    if req.aicte_permanent_id:
        inst = db.query(Institution).filter(
            Institution.workspace_id == ws.id,
            Institution.aicte_permanent_id == req.aicte_permanent_id,
            Institution.data_mode == ws.active_data_mode
        ).first()

    if not inst:
        inst = Institution(
            workspace_id=ws.id,
            aicte_permanent_id=req.aicte_permanent_id,
            legal_name=req.institute_name,
            institution_type=req.institute_type,
            state=req.state,
            district=req.district,
            data_mode=ws.active_data_mode
        )
        db.add(inst)
        db.flush()

    new_case = ApprovalCase(
        workspace_id=ws.id,
        institution_id=inst.id,
        case_reference=case_ref,
        workflow_type=req.workflow_type.upper().replace(" ", "_"),
        academic_period=req.academic_period,
        current_stage="DRAFT",
        status="IN_PROGRESS",
        priority=req.priority.upper(),
        internal_owner_name=req.internal_owner_name,
        target_date=t_date,
        notes=req.notes,
        data_mode=ws.active_data_mode,
        created_by=req.internal_owner_name
    )
    db.add(new_case)
    db.flush()

    # Initial stage history
    hist = CaseStageHistory(
        case_id=new_case.id,
        from_stage="INITIALIZATION",
        to_stage="DRAFT",
        changed_by=req.internal_owner_name,
        reason="Case record initialized in workspace."
    )
    db.add(hist)

    # Audit event
    audit = AuditEvent(
        workspace_id=ws.id,
        actor_name=req.internal_owner_name,
        actor_role="COORDINATOR",
        entity_type="CASE",
        entity_id=new_case.id,
        action="CASE_CREATED",
        details_json={
            "case_reference": case_ref,
            "institution": req.institute_name,
            "workflow": req.workflow_type
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(new_case)

    today = date.today()
    return CaseDetailResponse(
        id=new_case.id,
        case_reference=new_case.case_reference,
        institution_id=inst.id,
        institution_name=inst.legal_name,
        aicte_permanent_id=inst.aicte_permanent_id,
        institution_type=inst.institution_type,
        state=inst.state,
        district=inst.district,
        workflow_type=new_case.workflow_type,
        academic_period=new_case.academic_period,
        current_stage=new_case.current_stage,
        status=new_case.status,
        priority=new_case.priority,
        internal_owner_name=new_case.internal_owner_name,
        target_date=new_case.target_date,
        days_remaining=(new_case.target_date - today).days,
        notes=new_case.notes,
        data_mode=new_case.data_mode,
        created_at=new_case.created_at,
        updated_at=new_case.updated_at,
        allowed_next_stages=VALID_STAGE_TRANSITIONS.get("DRAFT", []),
        stage_history=[StageHistoryItem.model_validate(hist)],
        documents_count=0,
        compliance_results_count=0,
        tasks_count=0,
        alerts_count=0
    )

@router.get("/{case_id}", response_model=CaseDetailResponse)
def get_case_detail(
    case_id: str,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)
    c = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()

    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Approval case '{case_id}' not found in active workspace."
        )

    inst = c.institution
    today = date.today()
    histories = [
        StageHistoryItem.model_validate(h) 
        for h in db.query(CaseStageHistory).filter(CaseStageHistory.case_id == c.id).order_by(CaseStageHistory.changed_at.desc()).all()
    ]

    return CaseDetailResponse(
        id=c.id,
        case_reference=c.case_reference,
        institution_id=c.institution_id,
        institution_name=inst.legal_name if inst else "Unknown",
        aicte_permanent_id=inst.aicte_permanent_id if inst else None,
        institution_type=inst.institution_type if inst else "N/A",
        state=inst.state if inst else "N/A",
        district=inst.district if inst else "N/A",
        workflow_type=c.workflow_type,
        academic_period=c.academic_period,
        current_stage=c.current_stage,
        status=c.status,
        priority=c.priority,
        internal_owner_name=c.internal_owner_name,
        target_date=c.target_date,
        days_remaining=(c.target_date - today).days,
        notes=c.notes,
        data_mode=c.data_mode,
        created_at=c.created_at,
        updated_at=c.updated_at,
        allowed_next_stages=_allowed_next_stages(db, c),
        stage_history=histories,
        documents_count=len(c.documents),
        compliance_results_count=len(c.compliance_results),
        tasks_count=len(c.tasks),
        alerts_count=len(c.alerts)
    )

@router.post("/{case_id}/transition", response_model=CaseDetailResponse)
def transition_case_stage(
    case_id: str,
    req: CaseTransitionRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    ws = get_or_create_default_workspace(db)
    c = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found."
        )

    current = c.current_stage
    target = req.to_stage.upper().replace(" ", "_")

    # Role-based transition authorization check
    norm_role = normalize_role(current_role)
    role_rules = ROLE_PERMISSIONS.get(norm_role, {})
    allowed_stages = role_rules.get("allowed_transition_stages", [])
    if "*" not in allowed_stages and target not in allowed_stages:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Permission Denied: Demo role '{norm_role}' cannot transition cases to '{target}'. "
                f"Permitted stages for your role: {', '.join(allowed_stages)}. "
                "Switch role via the top navigation bar to rehearse this workflow."
            )
        )

    # Validate transition
    allowed = _allowed_next_stages(db, c)
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid stage transition from '{current}' to '{target}'. Allowed next stages are: {', '.join(allowed)}"
        )

    # Transition logic
    c.current_stage = target
    c.status = STAGE_STATUS_MAPPING.get(target, "IN_PROGRESS")
    c.updated_at = utc_now()

    # Append Stage History
    hist = CaseStageHistory(
        case_id=c.id,
        from_stage=current,
        to_stage=target,
        changed_by=req.changed_by,
        reason=req.reason
    )
    db.add(hist)

    # Append Audit Event
    audit = AuditEvent(
        workspace_id=ws.id,
        actor_name=req.changed_by,
        actor_role="COORDINATOR",
        entity_type="CASE",
        entity_id=c.id,
        action="STAGE_TRANSITION",
        details_json={
            "case_reference": c.case_reference,
            "from_stage": current,
            "to_stage": target,
            "reason": req.reason
        }
    )
    db.add(audit)
    db.commit()
    db.refresh(c)

    return get_case_detail(c.id, db)

@router.patch("/{case_id}", response_model=CaseDetailResponse)
def update_case(
    case_id: str,
    req: CaseUpdateRequest,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)
    c = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found."
        )

    if req.priority:
        c.priority = req.priority.upper()
    if req.internal_owner_name:
        c.internal_owner_name = req.internal_owner_name
    if req.notes is not None:
        c.notes = req.notes
    if req.target_date:
        try:
            c.target_date = date.fromisoformat(req.target_date)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid target date format. Expected YYYY-MM-DD."
            )

    c.updated_at = utc_now()
    db.commit()
    db.refresh(c)

    return get_case_detail(c.id, db)
