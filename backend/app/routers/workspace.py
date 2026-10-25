from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Workspace, SourceRegistry, AuditEvent
from ..schemas import (
    WorkspaceRead, DataModeSelectRequest, DataModeSelectResponse,
    SourceRegistryListResponse, SourceRegistryItem, ResetDemoResponse
)
from ..seed_data import seed_demo_workspace_data, clear_demo_data
from ..permissions import get_current_role, check_role_permission, SUPPORTED_ROLES, ROLE_PERMISSIONS

router = APIRouter(prefix="/api/workspace", tags=["Workspace"])

def get_or_create_default_workspace(db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.slug == "default").first()
    if not ws:
        ws = Workspace(
            name="Technical Institution Operations Workspace",
            slug="default",
            active_data_mode="DEMO",
            first_run_completed=False
        )
        db.add(ws)
        db.commit()
        db.refresh(ws)
        seed_demo_workspace_data(db, ws.id)
    return ws

@router.get("", response_model=WorkspaceRead)
def get_current_workspace(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    return ws

@router.get("/roles")
def get_roles_info(current_role: str = Depends(get_current_role)):
    return {
        "active_role": current_role,
        "roles": SUPPORTED_ROLES,
        "permissions": ROLE_PERMISSIONS
    }

@router.post("/first-run", response_model=DataModeSelectResponse)
def complete_first_run(req: DataModeSelectRequest, db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    allowed_modes = ["DEMO", "IMPORTED", "MANUAL", "CONNECTED"]
    mode = req.mode.upper()
    if mode not in allowed_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid data mode. Allowed modes are: {', '.join(allowed_modes)}"
        )

    guidance = None
    is_live = False
    message = f"Workspace initialized in {mode} mode."

    if mode == "CONNECTED":
        guidance = "No unauthenticated public AICTE or ONOD REST APIs are available. Automated external sync is disabled to comply with official terms of service. Please use 'Import My Data' for institutional dossiers."
        message = "Selected mode is CONNECTED, but no verified public connector is currently available without institutional credentials."
    elif mode == "DEMO":
        seed_demo_workspace_data(db, ws.id)
        message = "Loaded synthetic demo workspace with 5 sample approval cases and illustrative rules."
    elif mode == "IMPORTED":
        message = "Active mode set to IMPORTED. Ready for institutional CSV/XLSX/PDF file uploads."
    elif mode == "MANUAL":
        message = "Active mode set to MANUAL. Blank institutional records ready for form entry."

    ws.active_data_mode = mode
    ws.first_run_completed = True
    db.commit()
    db.refresh(ws)

    # Audit event
    audit = AuditEvent(
        workspace_id=ws.id,
        actor_name="Administrative User",
        actor_role="INSTITUTION_COORDINATOR",
        entity_type="WORKSPACE",
        entity_id=ws.id,
        action="FIRST_RUN_MODE_SELECTED",
        details_json={"selected_mode": mode, "guidance": guidance}
    )
    db.add(audit)
    db.commit()

    return DataModeSelectResponse(
        success=True,
        active_data_mode=mode,
        message=message,
        is_live_external=is_live,
        guidance=guidance
    )

@router.post("/data-mode", response_model=DataModeSelectResponse)
def switch_data_mode(
    req: DataModeSelectRequest, 
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Administrator"], "modifying workspace data mode")
    ws = get_or_create_default_workspace(db)
    allowed_modes = ["DEMO", "IMPORTED", "MANUAL", "CONNECTED"]
    mode = req.mode.upper()
    if mode not in allowed_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid data mode. Allowed modes are: {', '.join(allowed_modes)}"
        )

    previous_mode = ws.active_data_mode
    guidance = None
    is_live = False
    message = f"Workspace switched from {previous_mode} to {mode}."

    if mode == "CONNECTED":
        guidance = "No unauthenticated public AICTE or ONOD REST APIs are available. External sync requires verified institutional NETF credentials."
        message = "Switched to CONNECTED mode (Read-only connector inspection; no automated sync available)."
    elif mode == "DEMO":
        # Check if demo records exist, if not seed them
        cases_count = len(ws.cases)
        if cases_count == 0:
            seed_demo_workspace_data(db, ws.id)
        message = "Active workspace switched to DEMO mode (Synthetic evaluation data)."
    elif mode in ["IMPORTED", "MANUAL"]:
        message = f"Active workspace switched to {mode} mode. Only authentic records in this mode will be displayed."

    ws.active_data_mode = mode
    db.commit()
    db.refresh(ws)

    # Log audit event
    audit = AuditEvent(
        workspace_id=ws.id,
        actor_name="Administrative User",
        actor_role="INSTITUTION_COORDINATOR",
        entity_type="WORKSPACE",
        entity_id=ws.id,
        action="DATA_MODE_SWITCHED",
        details_json={"from_mode": previous_mode, "to_mode": mode}
    )
    db.add(audit)
    db.commit()

    return DataModeSelectResponse(
        success=True,
        active_data_mode=mode,
        message=message,
        is_live_external=is_live,
        guidance=guidance
    )

@router.get("/sources", response_model=SourceRegistryListResponse)
def list_workspace_sources(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    sources = db.query(SourceRegistry).filter(SourceRegistry.workspace_id == ws.id).all()
    return SourceRegistryListResponse(
        active_mode=ws.active_data_mode,
        sources=[SourceRegistryItem.model_validate(s) for s in sources]
    )

@router.post("/reset-demo", response_model=ResetDemoResponse)
def reset_demo_workspace(
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Administrator"], "resetting synthetic demo data")
    ws = get_or_create_default_workspace(db)
    seed_demo_workspace_data(db, ws.id)
    return ResetDemoResponse(
        success=True,
        message="Synthetic demo workspace successfully re-seeded. Authentic institutional data was preserved.",
        active_cases_count=5
    )
