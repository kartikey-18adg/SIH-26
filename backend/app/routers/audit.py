from datetime import datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AuditEvent
from ..permissions import get_current_role, check_role_permission
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api/audit", tags=["Audit Trail"])
READ_ROLES = ["Administrator", "Compliance Officer", "Reviewer"]


def _authorized_workspace(db: Session, current_role: str):
    check_role_permission(current_role, READ_ROLES, "viewing the audit trail")
    return get_or_create_default_workspace(db)


@router.get("/events")
def list_audit_events(
    search: Optional[str] = Query(None, max_length=120),
    action: Optional[str] = Query(None, max_length=80),
    actor: Optional[str] = Query(None, max_length=100),
    entity_type: Optional[str] = Query(None, max_length=50),
    start_date: Optional[str] = Query(None, description="Inclusive date in YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="Inclusive date in YYYY-MM-DD format"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    """Read-only, workspace-scoped audit log for authorized review roles."""
    ws = _authorized_workspace(db, current_role)
    query = db.query(AuditEvent).filter(AuditEvent.workspace_id == ws.id)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(or_(
            AuditEvent.actor_name.ilike(term),
            AuditEvent.actor_role.ilike(term),
            AuditEvent.action.ilike(term),
            AuditEvent.entity_type.ilike(term),
            AuditEvent.entity_id.ilike(term),
        ))
    if action:
        query = query.filter(AuditEvent.action == action)
    if actor:
        query = query.filter(AuditEvent.actor_name.ilike(f"%{actor.strip()}%"))
    if entity_type:
        query = query.filter(AuditEvent.entity_type == entity_type.upper())

    try:
        if start_date:
            start = datetime.combine(datetime.strptime(start_date, "%Y-%m-%d").date(), time.min)
            query = query.filter(AuditEvent.created_at >= start)
        if end_date:
            end = datetime.combine(datetime.strptime(end_date, "%Y-%m-%d").date(), time.max)
            query = query.filter(AuditEvent.created_at <= end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format.")

    total = query.count()
    today = datetime.now(timezone.utc).date()
    today_start = datetime.combine(today, time.min)
    today_end = datetime.combine(today, time.max)
    today_count = db.query(func.count(AuditEvent.id)).filter(
        AuditEvent.workspace_id == ws.id,
        AuditEvent.created_at >= today_start,
        AuditEvent.created_at <= today_end,
    ).scalar() or 0
    actor_count = db.query(func.count(func.distinct(AuditEvent.actor_name))).filter(
        AuditEvent.workspace_id == ws.id
    ).scalar() or 0
    events = query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return {
        "items": [{
            "id": event.id,
            "actor_name": event.actor_name,
            "actor_role": event.actor_role,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "action": event.action,
            "details": event.details_json or {},
            "created_at": event.created_at,
        } for event in events],
        "total": total,
        "page": page,
        "page_size": page_size,
        "stats": {
            "total_events": db.query(func.count(AuditEvent.id)).filter(AuditEvent.workspace_id == ws.id).scalar() or 0,
            "today_events": today_count,
            "unique_actors": actor_count,
        },
    }


@router.get("/analytics")
def audit_analytics(
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role),
):
    """Workspace-scoped daily counts and action distribution for the audit dashboard."""
    ws = _authorized_workspace(db, current_role)
    today = datetime.now(timezone.utc).date()
    start_day = today - timedelta(days=days - 1)
    start_at = datetime.combine(start_day, time.min)
    end_at = datetime.combine(today + timedelta(days=1), time.min)

    rows = db.query(
        func.date(AuditEvent.created_at).label("day"),
        func.count(AuditEvent.id).label("count"),
    ).filter(
        AuditEvent.workspace_id == ws.id,
        AuditEvent.created_at >= start_at,
        AuditEvent.created_at < end_at,
    ).group_by(func.date(AuditEvent.created_at)).all()
    daily_counts = {str(row.day): int(row.count) for row in rows}
    daily = [{
        "date": (start_day + timedelta(days=i)).isoformat(),
        "count": daily_counts.get((start_day + timedelta(days=i)).isoformat(), 0),
    } for i in range(days)]

    action_rows = db.query(
        AuditEvent.action,
        func.count(AuditEvent.id).label("count"),
    ).filter(
        AuditEvent.workspace_id == ws.id,
        AuditEvent.created_at >= start_at,
        AuditEvent.created_at < end_at,
    ).group_by(AuditEvent.action).order_by(func.count(AuditEvent.id).desc()).limit(6).all()

    return {
        "days": days,
        "total_events": sum(item["count"] for item in daily),
        "daily": daily,
        "actions": [{"action": row.action, "count": int(row.count)} for row in action_rows],
    }
