import csv
import io
import hashlib
import secrets
from datetime import datetime, date, timezone, timedelta
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Workspace, IngestionBatch, IngestionPreview, Institution, ApprovalCase, CaseStageHistory, AuditEvent
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
    preview_token: str
    preview_expires_at: datetime
    file_name: str
    file_sha256: str
    total_rows: int
    valid_count: int
    error_count: int
    valid_records: List[IngestionRecord]
    row_errors: List[RowErrorItem]
    can_commit: bool

class IngestionCommitRequest(BaseModel):
    preview_token: str
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
ALLOWED_INSTITUTE_TYPES = ["GOVERNMENT", "GOVT_AIDED", "PRIVATE_SELF_FINANCED", "DEEMED_UNIVERSITY"]
ALLOWED_STAGES = ["DRAFT", "DOCUMENT_REVIEW", "COMPLIANCE_CHECKS", "INTERNAL_REVIEW", "CORRECTIONS_REQUIRED", "READY_FOR_SUBMISSION", "COMPLETED", "APPROVED", "REJECTED"]
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
SHA256_PATTERN = __import__("re").compile(r"^[a-fA-F0-9]{64}$")

def _normalized(value: Optional[str], default: str = "") -> str:
    return (value or default).strip()

def _validate_record_values(rec: IngestionRecord, row_number: int = 0) -> List[str]:
    errors = []
    prefix = f"Row {row_number}: " if row_number else ""
    for field_name, value in [
        ("aicte_permanent_id", rec.aicte_permanent_id),
        ("institute_name", rec.institute_name),
        ("case_reference", rec.case_reference),
        ("internal_owner_name", rec.internal_owner_name),
        ("state", rec.state),
        ("district", rec.district),
    ]:
        if not value or not value.strip():
            errors.append(f"{prefix}{field_name} cannot be blank.")
    if rec.workflow_type not in ALLOWED_WORKFLOWS:
        errors.append(f"{prefix}workflow_type must be one of: {', '.join(ALLOWED_WORKFLOWS)}.")
    if rec.priority not in ALLOWED_PRIORITIES:
        errors.append(f"{prefix}priority must be one of: {', '.join(ALLOWED_PRIORITIES)}.")
    if rec.institute_type not in ALLOWED_INSTITUTE_TYPES:
        errors.append(f"{prefix}institute_type must be one of: {', '.join(ALLOWED_INSTITUTE_TYPES)}.")
    if rec.current_stage not in ALLOWED_STAGES:
        errors.append(f"{prefix}current_stage must be one of: {', '.join(ALLOWED_STAGES)}.")
    try:
        date.fromisoformat(rec.target_date)
    except (TypeError, ValueError):
        errors.append(f"{prefix}target_date must be a valid YYYY-MM-DD date.")
    if not rec.academic_period or not __import__("re").fullmatch(r"\d{4}-\d{4}", rec.academic_period):
        errors.append(f"{prefix}academic_period must use YYYY-YYYY format.")
    return errors

def parse_and_validate_csv(content: bytes, filename: str, ws_id: str, db: Session) -> IngestionPreviewResponse:
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded CSV is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="CSV exceeds the 5 MB upload limit.")
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a .csv file.")

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
    original_fieldnames = csv_reader.fieldnames or []
    fieldnames = [f.strip().lower() if f else "" for f in original_fieldnames]

    if not fieldnames or any(not name for name in fieldnames):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV contains a blank column name.")
    if len(fieldnames) != len(set(fieldnames)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV contains duplicate column names after normalization.")
    # DictReader must use the normalized names too; otherwise headers with spaces/case
    # pass validation but fail to map row values correctly.
    csv_reader.fieldnames = fieldnames

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
        # Header keys are normalized above. Reject rows with extra unnamed values.
        if None in raw_row:
            row_errors.append(RowErrorItem(row_number=row_index, field="row", error_message="Row has more values than the CSV header.", raw_content={str(k): str(v) for k, v in raw_row.items() if k is not None}))
            continue
        row = {k: (v or "").strip() for k, v in raw_row.items() if k}

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

        if not aicte_id:
            row_errors.append(RowErrorItem(row_number=row_index, field="aicte_permanent_id", error_message="AICTE permanent ID cannot be blank.", raw_content=row))
            has_error = True
        if not inst_name:
            row_errors.append(RowErrorItem(
                row_number=row_index,
                field="institute_name",
                error_message="Institution name cannot be blank.",
                raw_content=row
            ))
            has_error = True
        if not owner_name:
            row_errors.append(RowErrorItem(row_number=row_index, field="internal_owner_name", error_message="Internal owner name cannot be blank.", raw_content=row))
            has_error = True
        if wf_type not in ALLOWED_WORKFLOWS:
            row_errors.append(RowErrorItem(row_number=row_index, field="workflow_type", error_message=f"Unsupported workflow '{wf_type}'. Allowed: {', '.join(ALLOWED_WORKFLOWS)}.", raw_content=row))
            has_error = True
        institute_type = row.get("institute_type", "PRIVATE_SELF_FINANCED").upper().replace(" ", "_")
        if institute_type not in ALLOWED_INSTITUTE_TYPES:
            row_errors.append(RowErrorItem(row_number=row_index, field="institute_type", error_message=f"Unsupported institute type '{institute_type}'.", raw_content=row))
            has_error = True
        stage = row.get("current_stage", "DOCUMENT_REVIEW").upper().replace(" ", "_")
        if stage not in ALLOWED_STAGES:
            row_errors.append(RowErrorItem(row_number=row_index, field="current_stage", error_message=f"Unsupported current stage '{stage}'.", raw_content=row))
            has_error = True
        priority = row.get("priority", "MEDIUM").upper()
        if priority not in ALLOWED_PRIORITIES:
            row_errors.append(RowErrorItem(row_number=row_index, field="priority", error_message=f"Unsupported priority '{priority}'.", raw_content=row))
            has_error = True
        if not row.get("state", "Maharashtra").strip() or not row.get("district", "Pune").strip():
            row_errors.append(RowErrorItem(row_number=row_index, field="location", error_message="State and district cannot be blank.", raw_content=row))
            has_error = True

        # Validate date
        try:
            date.fromisoformat(target_date_str)
        except (TypeError, ValueError):
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
                institute_type=institute_type,
                state=row.get("state", "Maharashtra"),
                district=row.get("district", "Pune"),
                case_reference=case_ref,
                workflow_type=wf_type,
                academic_period=row.get("academic_period", "2025-2026"),
                current_stage=stage,
                priority=priority,
                internal_owner_name=owner_name,
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
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a .csv file.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="CSV exceeds the 5 MB upload limit.")
    preview = parse_and_validate_csv(content, filename or "upload.csv", ws.id, db)
    # The client receives a random bearer token; only its SHA-256 hash is persisted.
    token = secrets.token_urlsafe(32)
    expires_at = utc_now() + timedelta(minutes=15)
    stored_records = [record.dict() for record in preview.valid_records]
    db.add(IngestionPreview(
        workspace_id=ws.id,
        token_hash=hashlib.sha256(token.encode("utf-8")).hexdigest(),
        original_filename=preview.file_name,
        file_sha256=preview.file_sha256,
        records_json=stored_records,
        expires_at=expires_at,
        consumed_at=None,
    ))
    db.commit()
    preview.preview_token = token
    preview.preview_expires_at = expires_at
    return preview

@router.post("/commit", response_model=IngestionCommitResponse)
def commit_ingestion_batch(
    req: IngestionCommitRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "data import and ingestion commit")
    if not req.records:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid records provided for commit.")
    if not req.original_filename or not req.original_filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="original_filename must be a .csv filename.")
    if not SHA256_PATTERN.fullmatch(req.file_sha256 or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="file_sha256 must be a 64-character SHA-256 hex digest.")
    if len(req.records) > 10000:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="A single batch cannot exceed 10,000 records.")
    if not req.preview_token or len(req.preview_token) > 256:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A valid preview_token is required.")

    ws = get_or_create_default_workspace(db)
    token_hash = hashlib.sha256(req.preview_token.encode("utf-8")).hexdigest()
    preview_row = db.query(IngestionPreview).filter(
        IngestionPreview.workspace_id == ws.id,
        IngestionPreview.token_hash == token_hash,
    ).with_for_update().first()
    if not preview_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preview token not found. Upload and preview the CSV again.")
    expires_at = preview_row.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= utc_now():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="This CSV preview has expired. Upload and preview the file again.")
    if preview_row.consumed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This preview has already been committed. Preview the CSV again for a new import.")
    if req.original_filename != preview_row.original_filename or req.file_sha256.lower() != preview_row.file_sha256:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Commit metadata does not match the reviewed CSV preview.")
    submitted_records = [record.dict() for record in req.records]
    if submitted_records != preview_row.records_json:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submitted records differ from the validated preview. Preview the CSV again before committing.")

    # Revalidate every field at commit time; clients must not be able to bypass preview validation.
    errors = []
    seen_refs = set()
    for index, rec in enumerate(req.records, start=1):
        errors.extend(_validate_record_values(rec, index))
        ref = rec.case_reference.strip()
        if ref in seen_refs:
            errors.append(f"Row {index}: duplicate case_reference '{ref}' within commit payload.")
        seen_refs.add(ref)
    if errors:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"message": "Commit validation failed.", "errors": errors[:100]})

    existing_refs = {
        row[0] for row in db.query(ApprovalCase.case_reference).filter(
            ApprovalCase.workspace_id == ws.id,
            ApprovalCase.data_mode == "IMPORTED"
        ).all()
    }
    duplicates = sorted(existing_refs.intersection(seen_refs))
    if duplicates:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "Case references already exist in IMPORTED mode.", "duplicates": duplicates[:100]})

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

    # Consume the preview in the same transaction as the imported records.
    preview_row.consumed_at = utc_now()

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
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

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
