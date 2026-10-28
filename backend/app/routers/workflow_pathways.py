from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ApprovalCase, WorkflowPathwayAssignment, AuditEvent
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/workflows", tags=["Configurable Workflow Pathways"])

BUILT_IN_PATHWAYS = {
    "ONLY_SCRUTINY": {
        "name": "Only Scrutiny",
        "stages": ["DRAFT", "INFO_COLLECTION", "DOCUMENT_REVIEW", "COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"],
        "description": "Document scrutiny and internal compliance review; no EVC stage is included."
    },
    "SCRUTINY_EVC": {
        "name": "Scrutiny + EVC",
        "stages": ["DRAFT", "INFO_COLLECTION", "DOCUMENT_REVIEW", "EVC", "COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"],
        "description": "Document scrutiny followed by Expert Visit Committee coordination."
    },
    "EVC_SAC_SHC": {
        "name": "EVC + SAC/SHC",
        "stages": ["DRAFT", "INFO_COLLECTION", "EVC", "SAC_SHC", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"],
        "description": "EVC followed by the configured SAC/SHC review stage."
    },
    "ONLY_EVC": {
        "name": "Only EVC",
        "stages": ["DRAFT", "INFO_COLLECTION", "EVC", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"],
        "description": "EVC-focused route with internal recording and review."
    }
}

class PathwayAssignmentRequest(BaseModel):
    pathway_key: str = Field(..., min_length=3, max_length=80)
    pathway_name: Optional[str] = Field(None, min_length=3, max_length=255)
    stages: Optional[List[str]] = None
    configured_by: str = Field(..., min_length=2)

def _case(db: Session, ws, case_id: str):
    item = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id, ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Case not found in the active data mode.")
    return item

@router.get("/pathways")
def list_pathway_templates():
    return [{"pathway_key": key, **value, "is_custom": False} for key, value in BUILT_IN_PATHWAYS.items()] + [{
        "pathway_key": "CUSTOM_APH", "name": "Custom APH-compliant pathway",
        "stages": [], "description": "Provide a stage sequence configured and approved by the institution.",
        "is_custom": True
    }]

@router.get("/cases/{case_id}/pathway")
def get_case_pathway(case_id: str, db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    case = _case(db, ws, case_id)
    assignment = db.query(WorkflowPathwayAssignment).filter_by(workspace_id=ws.id, case_id=case.id).first()
    if not assignment:
        return {"assigned": False, "case_id": case.id, "pathway_key": None, "pathway_name": None, "stages": []}
    return {"assigned": True, "case_id": case.id, "pathway_key": assignment.pathway_key,
            "pathway_name": assignment.pathway_name, "stages": assignment.stage_sequence,
            "configured_by": assignment.configured_by, "updated_at": assignment.updated_at}

@router.post("/cases/{case_id}/pathway")
def assign_case_pathway(
    case_id: str, req: PathwayAssignmentRequest, db: Session = Depends(get_db),
    role: str = Depends(get_current_role)
):
    check_role_permission(role, ["Administrator", "Compliance Officer"], "configuring a case workflow pathway")
    ws = get_or_create_default_workspace(db)
    case = _case(db, ws, case_id)
    key = req.pathway_key.strip().upper()
    if key in BUILT_IN_PATHWAYS:
        template = BUILT_IN_PATHWAYS[key]
        name, stages = template["name"], template["stages"]
    elif key == "CUSTOM_APH":
        if not req.stages:
            raise HTTPException(status_code=400, detail="Custom pathways require a stage sequence.")
        name = req.pathway_name or "Custom APH-compliant pathway"
        stages = [str(x).strip().upper().replace(" ", "_") for x in req.stages]
    else:
        raise HTTPException(status_code=400, detail="Unknown pathway_key. Use a built-in template or CUSTOM_APH.")

    allowed_stages = {"DRAFT", "INFO_COLLECTION", "DOCUMENT_REVIEW", "EVC", "SAC_SHC",
                      "COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"}
    if len(stages) < 3 or len(stages) != len(set(stages)) or any(x not in allowed_stages for x in stages):
        raise HTTPException(status_code=400, detail="Pathway stages must be unique supported stage keys and contain at least three stages.")
    if case.current_stage not in stages:
        raise HTTPException(status_code=409, detail=f"Current stage {case.current_stage} is not present in this pathway; move the case through an authorized process before assigning it.")

    assignment = db.query(WorkflowPathwayAssignment).filter_by(workspace_id=ws.id, case_id=case.id).first()
    previous = {"pathway_key": assignment.pathway_key, "stages": assignment.stage_sequence} if assignment else None
    if not assignment:
        assignment = WorkflowPathwayAssignment(workspace_id=ws.id, case_id=case.id)
        db.add(assignment)
    assignment.pathway_key = key
    assignment.pathway_name = name
    assignment.stage_sequence = stages
    assignment.configured_by = req.configured_by.strip()
    assignment.updated_at = datetime.now(timezone.utc)
    db.add(AuditEvent(
        workspace_id=ws.id, actor_name=req.configured_by.strip(),
        actor_role=role.upper().replace(" ", "_"), entity_type="CASE_PATHWAY",
        entity_id=case.id, action="WORKFLOW_PATHWAY_ASSIGNED",
        details_json={"case_reference": case.case_reference, "previous": previous,
                      "pathway_key": key, "pathway_name": name, "stages": stages}
    ))
    db.commit()
    return {"assigned": True, "case_id": case.id, "pathway_key": key,
            "pathway_name": name, "stages": stages, "configured_by": assignment.configured_by}
