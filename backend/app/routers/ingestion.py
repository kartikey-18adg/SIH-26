import csv
import io
import hashlib
from datetime import datetime, date, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Workspace, IngestionBatch, Institution, ApprovalCase, CaseStageHistory, AuditEvent
from .workspace import get_or_create_default_workspace
from ..permissions import get_current_role, check_role_permission

router = APIRouter(prefix="/api/ingestion", tags=["Ingestion Pipeline"])

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

# Pydantic Schemas for Ingestion
class IngestionRecord(BaseModel):
    aicte_permanent_id: str
    institute_name: str
    institute_type: str = "PRIVATE_SELF_FINANCED"
    state: str = "Maharashtra"
    district: str = "Pune"
    case_reference: str
    workflow_type: str = "EXTENSION_OF_APPROVAL"
    academic_period: str = "2025-2026"
    current_stage: str = "DOCUMENT_REVIEW"
    priority: str = "MEDIUM"
    internal_owner_name: str
    target_date: str
    notes: Optional[str] = None

class RowErrorItem(BaseModel):
    row_number: int
    field: str
    error_message: str
    raw_content: Dict[str, Any]

class IngestionPreviewResponse(BaseModel):
    file_name: str
    file_sha256: str
    total_rows: int
    valid_count: int
    error_count: int
    valid_records: List[IngestionRecord]
    row_errors: List[RowErrorItem]
    can_commit: bool

class IngestionCommitRequest(BaseModel):
    original_filename: str
    file_sha256: str
    records: List[IngestionRecord]

class IngestionCommitResponse(BaseModel):
    success: bool
    batch_reference: str
    records_committed: int
    active_data_mode: str
    message: str

class BatchSummaryItem(BaseModel):
    id: str
    batch_reference: str
    original_filename: str
    file_sha256: str
    total_records: int
    successful_records: int
    failed_records: int
    status: str
    created_at: datetime

REQUIRED_COLUMNS = [
    "aicte_permanent_id", "institute_name", "case_reference", 
    "workflow_type", "target_date", "internal_owner_name"
]

ALLOWED_WORKFLOWS = [
    "EXTENSION_OF_APPROVAL", "NEW_INSTITUTION", "INCREASE_IN_INTAKE", "NEW_COURSE"
]

ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

def parse_and_validate_csv(content: bytes, filename: str, ws_id: str, db: Session) -> IngestionPreviewResponse:
    file_sha256 = hashlib.sha256(content).hexdigest()

    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text_content = content.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to decode file. Please upload a UTF-8 or ASCII encoded CSV."
            )

    csv_reader = csv.DictReader(io.StringIO(text_content))
    fieldnames = [f.strip().lower() for f in (csv_reader.fieldnames or [])]

    # Validate header
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in fieldnames]
    if missing_cols:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CSV header is missing mandatory columns: {', '.join(missing_cols)}"
        )

    # Fetch existing case references in IMPORTED mode to detect duplicates
    existing_imported_refs = set(
        r[0] for r in db.query(ApprovalCase.case_reference).filter(
            ApprovalCase.workspace_id == ws_id,
            ApprovalCase.data_mode == "IMPORTED"
        ).all()
    )

    valid_records: List[IngestionRecord] = []
    row_errors: List[RowErrorItem] = []
    seen_refs_in_file = set()

    row_index = 1
    for raw_row in csv_reader:
        row_index += 1
        # Normalize keys
        row = {k.strip().lower(): v.strip() for k, v in raw_row.items() if k}

        # Check required values
        has_error = False
        aicte_id = row.get("aicte_permanent_id", "")
        inst_name = row.get("institute_name", "")
        case_ref = row.get("case_reference", "")
        wf_type = row.get("workflow_type", "EXTENSION_OF_APPROVAL").upper().replace(" ", "_")
        target_date_str = row.get("target_date", "")
        owner_name = row.get("internal_owner_name", "")

        if not case_ref:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="case_reference",
                error_message="Case reference is missing or empty.",
                raw_content=row
            ))
            has_error = True

        if case_ref in seen_refs_in_file:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="case_reference",
                error_message=f"Duplicate case reference '{case_ref}' found within the uploaded file.",
                raw_content=row
            ))
            has_error = True
        else:
            seen_refs_in_file.add(case_ref)

        if case_ref in existing_imported_refs:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="case_reference",
                error_message=f"Case reference '{case_ref}' already exists in the IMPORTED workspace.",
                raw_content=row
            ))
            has_error = True

        if not inst_name:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="institute_name",
                error_message="Institution name cannot be blank.",
                raw_content=row
            ))
            has_error = True

        # Validate date
        try:
            date.fromisoformat(target_date_str)
        except ValueError:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="target_date",
                error_message=f"Invalid date format '{target_date_str}'. Expected YYYY-MM-DD.",
                raw_content=row
            ))
            has_error = True

        if not has_error:
            valid_records.append(IngestionRecord(
                aicte_permanent_id=aicte_id,
                institute_name=inst_name,
                institute_type=row.get("institute_type", "PRIVATE_SELF_FINANCED").upper().replace(" ", "_"),
                state=row.get("state", "Maharashtra"),
                district=row.get("district", "Pune"),
                case_reference=case_ref,
                workflow_type=wf_type if wf_type in ALLOWED_WORKFLOWS else "EXTENSION_OF_APPROVAL",
                academic_period=row.get("academic_period", "2025-2026"),
                current_stage=row.get("current_stage", "DOCUMENT_REVIEW").upper().replace(" ", "_"),
                priority=row.get("priority", "MEDIUM").upper(),
                internal_owner_name=owner_name or "Administrative Coordinator",
                target_date=target_date_str,
                notes=row.get("notes")
            ))

    total_rows = row_index - 1

    return IngestionPreviewResponse(
        file_name=filename,
        file_sha256=file_sha256,
        total_rows=total_rows,
        valid_count=len(valid_records),
        error_count=len(row_errors),
        valid_records=valid_records,
        row_errors=row_errors,
        can_commit=len(valid_records) > 0
    )

@router.post("/preview", response_model=IngestionPreviewResponse)
async def preview_ingestion_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)
    content = await file.read()
    return parse_and_validate_csv(content, file.filename or "upload.csv", ws.id, db)

@router.post("/commit", response_model=IngestionCommitResponse)
def commit_ingestion_batch(
    req: IngestionCommitRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "data import and ingestion commit")
    if not req.records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid records provided for commit."
        )

    ws = get_or_create_default_workspace(db)

    # 1. Create Ingestion Batch
    batch_ref = f"BATCH-{datetime.now().strftime('%Y%m%d')}-{hashlib.md5(req.file_sha256.encode()).hexdigest()[:6].upper()}"
    batch = IngestionBatch(
        workspace_id=ws.id,
        batch_reference=batch_ref,
        original_filename=req.original_filename,
        file_sha256=req.file_sha256,
        total_records=len(req.records),
        successful_records=len(req.records),
        failed_records=0,
        status="COMMITTED",
        validation_report={
            "committed_at": utc_now().isoformat(),
            "records_count": len(req.records)
        },
        created_by="Institutional Coordinator"
    )
    db.add(batch)
    db.flush()

    # 2. Upsert Institutions and Insert Cases
    committed_count = 0
    for rec in req.records:
        inst = db.query(Institution).filter(
            Institution.workspace_id == ws.id,
            Institution.aicte_permanent_id == rec.aicte_permanent_id,
            Institution.data_mode == "IMPORTED"
        ).first()

        if not inst:
            inst = Institution(
                workspace_id=ws.id,
                aicte_permanent_id=rec.aicte_permanent_id,
                legal_name=rec.institute_name,
                institution_type=rec.institute_type,
                state=rec.state,
                district=rec.district,
                data_mode="IMPORTED",
                provenance_batch_id=batch.id
            )
            db.add(inst)
            db.flush()

        case = ApprovalCase(
            workspace_id=ws.id,
            institution_id=inst.id,
            case_reference=rec.case_reference,
            workflow_type=rec.workflow_type,
            academic_period=rec.academic_period,
            current_stage=rec.current_stage,
            status="IN_PROGRESS",
            priority=rec.priority if rec.priority in ALLOWED_PRIORITIES else "MEDIUM",
            internal_owner_name=rec.internal_owner_name,
            target_date=date.fromisoformat(rec.target_date),
            notes=rec.notes,
            data_mode="IMPORTED",
            created_by="Institutional File Ingestion"
        )
        db.add(case)
        db.flush()

        # Record Initial Stage History
        hist = CaseStageHistory(
            case_id=case.id,
            from_stage="IMPORTED",
            to_stage=rec.current_stage,
            changed_by="Batch Ingestion Pipeline",
            reason=f"Ingested from file '{req.original_filename}' with SHA-256 {req.file_sha256[:12]}..."
        )
        db.add(hist)
        committed_count += 1

    # 3. Switch workspace mode to IMPORTED
    ws.active_data_mode = "IMPORTED"

    # 4. Append Audit Event
    audit = AuditEvent(
        workspace_id=ws.id,
        actor_name="Institutional Coordinator",
        actor_role="COORDINATOR",
        entity_type="INGESTION_BATCH",
        entity_id=batch.id,
        action="INSTITUTIONAL_BATCH_COMMITTED",
        details_json={
            "batch_reference": batch_ref,
            "filename": req.original_filename,
            "sha256": req.file_sha256,
            "records_count": committed_count
        }
    )
    db.add(audit)
    db.commit()

    return IngestionCommitResponse(
        success=True,
        batch_reference=batch_ref,
        records_committed=committed_count,
        active_data_mode="IMPORTED",
        message=f"Successfully imported {committed_count} authentic institutional records. Workspace active mode switched to IMPORTED."
    )

@router.get("/batches", response_model=List[BatchSummaryItem])
def list_ingestion_batches(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    batches = db.query(IngestionBatch).filter(
        IngestionBatch.workspace_id == ws.id
    ).order_by(IngestionBatch.created_at.desc()).all()

    return [
        BatchSummaryItem(
            id=b.id,
            batch_reference=b.batch_reference,
            original_filename=b.original_filename,
            file_sha256=b.file_sha256,
            total_records=b.total_records,
            successful_records=b.successful_records,
            failed_records=b.failed_records,
            status=b.status,
            created_at=b.created_at
        )
        for b in batches
    ]

@router.get("/template")
def get_csv_template():
    header = "aicte_permanent_id,institute_name,institute_type,state,district,case_reference,workflow_type,academic_period,current_stage,priority,internal_owner_name,target_date,notes\n"
    example = "1-419208111,Bhartiya Institute of Technology,PRIVATE_SELF_FINANCED,Maharashtra,Pune,CASE-2025-001,EXTENSION_OF_APPROVAL,2025-2026,DOCUMENT_REVIEW,HIGH,Dr. V. Sharma,2026-11-15,Annual EoA filing with updated Fire NOC\n"
    return {
        "filename": "institutional_cases_template.csv",
        "content": header + example
    }
