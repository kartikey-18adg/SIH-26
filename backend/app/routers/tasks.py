import uuid
from datetime import datetime, date, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db, Base, engine
from ..models import Workspace, ApprovalCase, Task, AuditEvent
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api", tags=["Tasks"])

Base.metadata.create_all(bind=engine)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class TaskItem(BaseModel):
    id: str
    case_id: str
    case_reference: str
    institution_name: str
    title: str
    description: Optional[str] = None
    assignee_name: str
    priority: str
    status: str
    due_date: date
    days_remaining: int
    is_overdue: bool
    completion_notes: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TaskCreateRequest(BaseModel):
    case_id: str
    title: str = Field(..., min_length=3)
    description: Optional[str] = None
    assignee_name: str = Field(..., min_length=2)
    priority: str = "MEDIUM"  # LOW, MEDIUM, HIGH, CRITICAL
    due_date: date
    created_by: str = "Institutional Coordinator"

class TaskUpdateRequest(BaseModel):
    status: Optional[str] = None  # TODO, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED
    completion_notes: Optional[str] = None
    assignee_name: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    updated_by: str = "Institutional Coordinator"

def format_task_item(t: Task) -> TaskItem:
    today = date.today()
    case = t.case
    case_ref = case.case_reference if case else "N/A"
    inst_name = case.institution.legal_name if case and case.institution else "Technical Institution"
    days_left = (t.due_date - today).days
    is_overdue = bool(days_left < 0 and t.status != "COMPLETED")

    return TaskItem(
        id=t.id,
        case_id=t.case_id,
        case_reference=case_ref,
        institution_name=inst_name,
        title=t.title,
        description=t.description,
        assignee_name=t.assignee_name,
        priority=t.priority,
        status=t.status,
        due_date=t.due_date,
        days_remaining=days_left,
        is_overdue=is_overdue,
        completion_notes=t.completion_notes,
        completed_at=t.completed_at,
        created_by=t.created_by,
        created_at=t.created_at,
        updated_at=t.updated_at
    )

@router.get("/tasks", response_model=List[TaskItem])
def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    priority: Optional[str] = None,
    case_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)

    # Fetch active cases in current data mode
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).all()

    if not cases:
        return []

    case_ids = [c.id for c in cases]
    query = db.query(Task).filter(Task.case_id.in_(case_ids))

    if case_id and isinstance(case_id, str):
        query = query.filter(Task.case_id == case_id)

    if status_filter and isinstance(status_filter, str) and status_filter.upper() != "ALL":
        query = query.filter(Task.status == status_filter.upper())

    if priority and isinstance(priority, str) and priority.upper() != "ALL":
        query = query.filter(Task.priority == priority.upper())

    tasks = query.order_by(Task.due_date.asc()).all()

    today = date.today()
    results = []
    for t in tasks:
        item = format_task_item(t)
        if search and isinstance(search, str):
            term = search.lower()
            match = (
                term in item.title.lower() or
                term in item.case_reference.lower() or
                term in item.assignee_name.lower() or
                (item.description and term in item.description.lower())
            )
            if not match:
                continue
        results.append(item)

    # Sort priority: overdue & uncompleted first, then by due date
    def task_sort_key(t: TaskItem):
        if t.status == "COMPLETED":
            return (2, t.due_date)
        elif t.is_overdue:
            return (0, t.due_date)
        return (1, t.due_date)

    results.sort(key=task_sort_key)
    return results

@router.post("/tasks", response_model=TaskItem, status_code=status.HTTP_201_CREATED)
def create_task(req: TaskCreateRequest, db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == req.case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    new_task = Task(
        case_id=case.id,
        title=req.title,
        description=req.description,
        assignee_name=req.assignee_name,
        priority=req.priority.upper(),
        status="TODO",
        due_date=req.due_date,
        created_by=req.created_by
    )
    db.add(new_task)
    db.flush()

    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name=req.created_by,
        actor_role="COORDINATOR",
        entity_type="TASK",
        entity_id=new_task.id,
        action="TASK_CREATED",
        details_json={
            "case_reference": case.case_reference,
            "title": new_task.title,
            "assignee": new_task.assignee_name,
            "due_date": new_task.due_date.isoformat()
        }
    ))
    db.commit()
    db.refresh(new_task)
    return format_task_item(new_task)

@router.patch("/tasks/{task_id}", response_model=TaskItem)
def update_task(task_id: str, req: TaskUpdateRequest, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")

    prev_status = task.status
    if req.status:
        st_upper = req.status.upper()
        if st_upper in ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]:
            task.status = st_upper
            if st_upper == "COMPLETED" and not task.completed_at:
                task.completed_at = utc_now()
            elif st_upper != "COMPLETED":
                task.completed_at = None

    if req.completion_notes is not None:
        task.completion_notes = req.completion_notes

    if req.assignee_name:
        task.assignee_name = req.assignee_name

    if req.priority:
        task.priority = req.priority.upper()

    if req.due_date:
        task.due_date = req.due_date

    task.updated_at = utc_now()

    case = task.case
    ws_id = case.workspace_id if case else "default"

    db.add(AuditEvent(
        workspace_id=ws_id,
        actor_name=req.updated_by,
        actor_role="COORDINATOR",
        entity_type="TASK",
        entity_id=task.id,
        action="TASK_STATUS_UPDATED",
        details_json={
            "task_title": task.title,
            "previous_status": prev_status,
            "new_status": task.status,
            "notes": task.completion_notes
        }
    ))
    db.commit()
    db.refresh(task)
    return format_task_item(task)
