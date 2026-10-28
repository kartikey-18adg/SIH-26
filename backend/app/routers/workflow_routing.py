from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditEvent, WorkflowRoutingPolicy
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/workflow-routing", tags=["Approval Pathway Configuration"])

ALLOWED_PATHWAYS = {
    "SCRUTINY_ONLY",
    "SCRUTINY_EVC",
    "EVC_SAC_SHC",
    "EVC_ONLY",
}
MANAGE_ROLES = ["Administrator", "Compliance Officer"]


def utc_now():
    return datetime.now(timezone.utc)


class WorkflowRoutingPolicyRequest(BaseModel):
    pathway: str = Field(..., description="Operator-selected workflow pathway")
    rationale: str = Field(..., min_length=8, max_length=2000,
                           description="Local policy or workflow reference supporting this choice")


def serialize_policy(policy, configured=True):
    return {
        "configured": configured,
        "pathway": policy.pathway,
        "rationale": policy.rationale,
        "updated_by": policy.updated_by,
        "updated_at": policy.updated_at,
        "is_official_rule_verified": False,
        "notice": "Operator-configured workflow only. Verify the applicable current official APH before relying on this pathway.",
    }


@router.get("/policy")
def get_workflow_routing_policy(
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, ["Administrator", "Compliance Officer", "Reviewer", "Institution Coordinator"], "viewing approval pathway configuration")
    ws = get_or_create_default_workspace(db)
    policy = db.query(WorkflowRoutingPolicy).filter(
        WorkflowRoutingPolicy.workspace_id == ws.id
    ).first()
    if not policy:
        return {
            "configured": False,
            "pathway": "SCRUTINY_ONLY",
            "rationale": "",
            "updated_by": None,
            "updated_at": None,
            "is_official_rule_verified": False,
            "notice": "No pathway has been saved yet. The displayed option is only a default, not a recommendation or official rule determination.",
        }
    return serialize_policy(policy)


@router.put("/policy")
def save_workflow_routing_policy(
    req: WorkflowRoutingPolicyRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    check_role_permission(current_role, MANAGE_ROLES, "changing approval pathway configuration")
    pathway = req.pathway.strip().upper()
    if pathway not in ALLOWED_PATHWAYS:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=f"Unsupported pathway. Choose one of: {', '.join(sorted(ALLOWED_PATHWAYS))}.")

    ws = get_or_create_default_workspace(db)
    policy = db.query(WorkflowRoutingPolicy).filter(
        WorkflowRoutingPolicy.workspace_id == ws.id
    ).first()
    old_pathway = policy.pathway if policy else None
    if policy:
        policy.pathway = pathway
        policy.rationale = req.rationale.strip()
        policy.updated_by = current_role
        policy.updated_at = utc_now()
    else:
        policy = WorkflowRoutingPolicy(
            workspace_id=ws.id,
            pathway=pathway,
            rationale=req.rationale.strip(),
            updated_by=current_role,
        )
        db.add(policy)
    db.flush()
    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name=current_role,
        actor_role=current_role,
        entity_type="WORKFLOW_POLICY",
        entity_id=policy.id,
        action="APPROVAL_PATHWAY_CONFIGURED",
        details_json={
            "previous_pathway": old_pathway,
            "pathway": pathway,
            "rationale": req.rationale.strip(),
            "official_rule_verified": False,
        },
    ))
    db.commit()
    db.refresh(policy)
    return serialize_policy(policy)
