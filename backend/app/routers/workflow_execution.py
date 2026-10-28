from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ApprovalCase, AuditEvent, CaseWorkflowStep, EVCVisit, WorkflowRoutingPolicy
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/workflow-execution", tags=["Case Workflow Execution"])
VIEW_ROLES = ["Administrator", "Compliance Officer", "Reviewer", "Institution Coordinator"]
COMPLETE_ROLES = ["Administrator", "Compliance Officer", "Reviewer", "Institution Coordinator"]


def utc_now():
    return datetime.now(timezone.utc)


class CompleteStepRequest(BaseModel):
    notes: str = Field(..., min_length=4, max_length=2000)


PATHWAY_STEPS = {
    "SCRUTINY_ONLY": [
        ("DOCUMENT_COLLECTION", "Document collection"),
        ("DOCUMENT_REVIEW", "Document review"),
        ("COMPLIANCE_REVIEW", "Compliance review"),
        ("INTERNAL_REVIEW", "Internal review"),
    ],
    "SCRUTINY_EVC": [
        ("DOCUMENT_COLLECTION", "Document collection"),
        ("DOCUMENT_REVIEW", "Document review"),
        ("COMPLIANCE_REVIEW", "Compliance review"),
        ("INTERNAL_REVIEW", "Internal review"),
        ("EVC_VISIT", "EVC visit"),
    ],
    "EVC_SAC_SHC": [
        ("DOCUMENT_COLLECTION", "Document collection"),
        ("DOCUMENT_REVIEW", "Document review"),
        ("COMPLIANCE_REVIEW", "Compliance review"),
        ("INTERNAL_REVIEW", "Internal review"),
        ("EVC_VISIT", "EVC visit"),
        ("SAC_REVIEW", "SAC review"),
        ("SHC_REVIEW", "SHC review"),
    ],
    "EVC_ONLY": [("EVC_VISIT", "EVC visit")],
}


def _get_case(db, ws, case_id):
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode,
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found in the active workspace mode.")
    return case


def _ensure_steps(db, ws, case):
    policy = db.query(WorkflowRoutingPolicy).filter(
        WorkflowRoutingPolicy.workspace_id == ws.id
    ).first()
    pathway = policy.pathway if policy else "SCRUTINY_ONLY"
    existing = db.query(CaseWorkflowStep).filter(
        CaseWorkflowStep.case_id == case.id,
        CaseWorkflowStep.workspace_id == ws.id,
    ).all()
    if existing:
        return existing, pathway, bool(policy)
    steps = []
    for sequence, (key, label) in enumerate(PATHWAY_STEPS.get(pathway, PATHWAY_STEPS["SCRUTINY_ONLY"]), start=1):
        step = CaseWorkflowStep(
            workspace_id=ws.id,
            case_id=case.id,
            pathway_snapshot=pathway,
            step_key=key,
            step_label=label,
            sequence=sequence,
            status="PENDING",
        )
        db.add(step)
        steps.append(step)
    db.flush()
    return steps, pathway, bool(policy)


def _serialize(step):
    return {
        "id": step.id,
        "step_key": step.step_key,
        "step_label": step.step_label,
        "sequence": step.sequence,
        "status": step.status,
        "completion_notes": step.completion_notes,
        "completed_by": step.completed_by,
        "completed_at": step.completed_at,
        "pathway_snapshot": step.pathway_snapshot,
    }


@router.get("/cases")
def list_workflow_execution_cases(
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, VIEW_ROLES, "viewing case workflow execution")
    ws = get_or_create_default_workspace(db)
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode,
    ).order_by(ApprovalCase.target_date.asc()).all()
    return {
        "items": [{
            "id": c.id,
            "case_reference": c.case_reference,
            "institution_name": c.institution.legal_name if c.institution else "Unknown institution",
            "current_stage": c.current_stage,
        } for c in cases],
        "active_data_mode": ws.active_data_mode,
    }


@router.get("/cases/{case_id}")
def get_case_workflow_execution(
    case_id: str,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, VIEW_ROLES, "viewing case workflow execution")
    ws = get_or_create_default_workspace(db)
    case = _get_case(db, ws, case_id)
    steps, pathway, configured = _ensure_steps(db, ws, case)
    db.commit()
    steps = db.query(CaseWorkflowStep).filter(
        CaseWorkflowStep.case_id == case.id,
        CaseWorkflowStep.workspace_id == ws.id,
    ).order_by(CaseWorkflowStep.sequence.asc()).all()
    completed = sum(1 for step in steps if step.status == "COMPLETED")
    return {
        "case_id": case.id,
        "case_reference": case.case_reference,
        "institution_name": case.institution.legal_name if case.institution else "Unknown institution",
        "current_stage": case.current_stage,
        "pathway": steps[0].pathway_snapshot if steps else pathway,
        "pathway_configured": configured,
        "steps": [_serialize(step) for step in steps],
        "completed_steps": completed,
        "total_steps": len(steps),
        "completion_percent": round(completed * 100 / len(steps)) if steps else 0,
        "notice": "Checklist steps are local operational records, not proof of official AICTE compliance.",
    }


@router.post("/cases/{case_id}/steps/{step_key}/complete")
def complete_case_workflow_step(
    case_id: str,
    step_key: str,
    req: CompleteStepRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, COMPLETE_ROLES, "completing a case workflow step")
    ws = get_or_create_default_workspace(db)
    case = _get_case(db, ws, case_id)
    steps, pathway, configured = _ensure_steps(db, ws, case)
    step = next((item for item in steps if item.step_key == step_key.upper()), None)
    if not step:
        db.rollback()
        raise HTTPException(status_code=404, detail="Workflow step not found for this case's saved pathway.")
    if step.status == "COMPLETED":
        db.rollback()
        raise HTTPException(status_code=409, detail="This workflow step is already completed.")
    if step.step_key == "EVC_VISIT":
        visit = db.query(EVCVisit).filter(
            EVCVisit.workspace_id == ws.id,
            EVCVisit.case_id == case.id,
        ).order_by(EVCVisit.created_at.desc()).first()
        if not visit or visit.status != "COMPLETED":
            db.rollback()
            raise HTTPException(status_code=409, detail="Complete the case's EVC visit in EVC Scheduling before completing this workflow step.")
    step.status = "COMPLETED"
    step.completion_notes = req.notes.strip()
    step.completed_by = current_role
    step.completed_at = utc_now()
    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name=current_role,
        actor_role=current_role,
        entity_type="CASE_WORKFLOW_STEP",
        entity_id=step.id,
        action="WORKFLOW_STEP_COMPLETED",
        details_json={
            "case_id": case.id,
            "case_reference": case.case_reference,
            "step_key": step.step_key,
            "step_label": step.step_label,
            "pathway_snapshot": step.pathway_snapshot,
            "notes": req.notes.strip(),
            "official_rule_verified": False,
        },
    ))
    db.commit()
    db.refresh(step)
    return {"success": True, "step": _serialize(step), "message": "Workflow step completed and audited."}
