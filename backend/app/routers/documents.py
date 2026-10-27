import os
import uuid
import hashlib
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db, Base, engine
from ..models import (
    Workspace, ApprovalCase, EvidenceDocument, DocumentVersion, 
    Alert, AuditEvent
)
from .workspace import get_or_create_default_workspace
from ..permissions import get_current_role, check_role_permission

router = APIRouter(prefix="/api", tags=["Evidence & Documents"])

# Ensure DB tables are synced with DocumentVersion
Base.metadata.create_all(bind=engine)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
VAULT_DIR = os.getenv("AICLEAR_VAULT_DIR", os.path.join(BACKEND_DIR, "vault"))
os.makedirs(VAULT_DIR, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
}

ALLOWED_CATEGORIES = [
    "FIRE_SAFETY_NOC",
    "OCCUPANCY_CERTIFICATE",
    "LAND_TITLE_DEED",
    "FACULTY_CADRE_MATRIX",
    "SOCIETY_REGISTRATION",
    "BUILDING_PLAN_APPROVAL",
    "AFFIDAVIT_UNDERTAKING",
    "OTHER_SUPPORTING_EVIDENCE"
]

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

# Pydantic Schemas
class VersionItem(BaseModel):
    id: str
    version_number: int
    original_filename: str
    size_bytes: int
    sha256_hash: str
    uploaded_by: str
    change_note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class DocumentResponse(BaseModel):
    id: str
    case_id: str
    category: str
    original_filename: str
    mime_type: str
    size_bytes: int
    sha256_hash: str
    document_date: Optional[date] = None
    expiry_date: Optional[date] = None
    days_to_expiry: Optional[int] = None
    is_expired: bool
    is_near_expiry: bool
    version_number: int
    review_status: str  # AWAITING_REVIEW, VERIFIED_VALID, NEEDS_CORRECTION, NOT_APPLICABLE
    reviewed_by: Optional[str] = None
    review_notes: Optional[str] = None
    uploaded_by: str
    created_at: datetime
    updated_at: datetime
    versions: List[VersionItem] = []

class ReviewDocumentRequest(BaseModel):
    review_status: str = Field(..., description="VERIFIED_VALID, NEEDS_CORRECTION, NOT_APPLICABLE")
    reviewed_by: str = "Document Reviewer"
    review_notes: Optional[str] = None

def format_document_response(d: EvidenceDocument, db: Session) -> DocumentResponse:
    today = date.today()
    days_to_exp = None
    is_exp = False
    is_near = False
    if d.expiry_date:
        days_to_exp = (d.expiry_date - today).days
        is_exp = days_to_exp < 0
        is_near = 0 <= days_to_exp <= 30

    versions_list = [
        VersionItem.model_validate(v) 
        for v in db.query(DocumentVersion).filter(DocumentVersion.document_id == d.id).order_by(DocumentVersion.version_number.desc()).all()
    ]

    return DocumentResponse(
        id=d.id,
        case_id=d.case_id,
        category=d.category,
        original_filename=d.original_filename,
        mime_type=d.mime_type,
        size_bytes=d.size_bytes,
        sha256_hash=d.sha256_hash,
        document_date=d.document_date,
        expiry_date=d.expiry_date,
        days_to_expiry=days_to_exp,
        is_expired=is_exp,
        is_near_expiry=is_near,
        version_number=d.version_number,
        review_status=d.review_status,
        reviewed_by=d.reviewed_by,
        review_notes=d.review_notes,
        uploaded_by=d.uploaded_by,
        created_at=d.created_at,
        updated_at=d.updated_at,
        versions=versions_list
    )

def store_evidence_document(
    case_id: str,
    content: bytes,
    filename: str,
    mime_type: str,
    category: str,
    document_date: Optional[str],
    expiry_date: Optional[str],
    uploaded_by: str,
    db: Session
) -> DocumentResponse:
    case = db.query(ApprovalCase).filter(ApprovalCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    cat_upper = category.upper().replace(" ", "_")
    if cat_upper not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")

    size_bytes = len(content)
    if size_bytes > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20MB limit.")

    file_sha256 = hashlib.sha256(content).hexdigest()

    doc_dt = None
    if document_date:
        try:
            doc_dt = date.fromisoformat(document_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document_date format.")

    exp_dt = None
    if expiry_date:
        try:
            exp_dt = date.fromisoformat(expiry_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid expiry_date format.")

    doc_uuid = str(uuid.uuid4())
    case_vault_dir = os.path.join(VAULT_DIR, case.workspace_id, case.id)
    os.makedirs(case_vault_dir, exist_ok=True)
    storage_key = os.path.join(case_vault_dir, f"{doc_uuid}_v1.bin")

    with open(storage_key, "wb") as f_out:
        f_out.write(content)

    doc = EvidenceDocument(
        id=doc_uuid,
        case_id=case.id,
        category=cat_upper,
        original_filename=filename,
        storage_key=storage_key,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256_hash=file_sha256,
        document_date=doc_dt,
        expiry_date=exp_dt,
        version_number=1,
        review_status="AWAITING_REVIEW",
        uploaded_by=uploaded_by
    )
    db.add(doc)
    db.flush()

    ver1 = DocumentVersion(
        document_id=doc.id,
        version_number=1,
        original_filename=filename,
        storage_key=storage_key,
        mime_type=mime_type,
        size_bytes=size_bytes,
        sha256_hash=file_sha256,
        uploaded_by=uploaded_by,
        change_note="Initial evidence upload"
    )
    db.add(ver1)

    # Automatic Expiry Alert
    today = date.today()
    if exp_dt:
        days_rem = (exp_dt - today).days
        if days_rem < 0:
            db.add(Alert(
                workspace_id=case.workspace_id,
                case_id=case.id,
                alert_key=f"ALERT-EXP-DOC-{doc.id[:8]}",
                category="DOCUMENT_EXPIRY",
                severity="CRITICAL",
                title=f"Expired Evidence Document: {doc.original_filename}",
                explanation=f"Evidence in category '{doc.category}' expired on {exp_dt}. Renewal certificate mandatory.",
                status="OPEN",
                assigned_to=uploaded_by
            ))
        elif days_rem <= 30:
            db.add(Alert(
                workspace_id=case.workspace_id,
                case_id=case.id,
                alert_key=f"ALERT-NEAR-DOC-{doc.id[:8]}",
                category="DOCUMENT_EXPIRY",
                severity="HIGH",
                title=f"Evidence Approaching Expiry: {doc.original_filename}",
                explanation=f"Evidence in category '{doc.category}' expires in {days_rem} days ({exp_dt}).",
                status="OPEN",
                assigned_to=uploaded_by
            ))

    db.add(AuditEvent(
        workspace_id=case.workspace_id,
        actor_name=uploaded_by,
        actor_role="COORDINATOR",
        entity_type="EVIDENCE_DOCUMENT",
        entity_id=doc.id,
        action="EVIDENCE_UPLOADED",
        details_json={
            "case_reference": case.case_reference,
            "filename": filename,
            "category": cat_upper,
            "sha256": file_sha256
        }
    ))
    db.commit()
    db.refresh(doc)
    return format_document_response(doc, db)

def store_document_version(
    document_id: str,
    content: bytes,
    filename: str,
    mime_type: str,
    change_note: Optional[str],
    uploaded_by: str,
    db: Session
) -> DocumentResponse:
    d = db.query(EvidenceDocument).filter(EvidenceDocument.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found.")

    case = d.case
    size_bytes = len(content)
    if size_bytes > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20MB limit.")

    file_sha256 = hashlib.sha256(content).hexdigest()
    new_ver_num = d.version_number + 1

    case_vault_dir = os.path.join(VAULT_DIR, case.workspace_id, case.id)
    os.makedirs(case_vault_dir, exist_ok=True)
    new_storage_key = os.path.join(case_vault_dir, f"{d.id}_v{new_ver_num}.bin")

    with open(new_storage_key, "wb") as f_out:
        f_out.write(content)

    d.version_number = new_ver_num
    d.original_filename = filename or d.original_filename
    d.storage_key = new_storage_key
    d.size_bytes = size_bytes
    d.sha256_hash = file_sha256
    d.review_status = "AWAITING_REVIEW"
    d.updated_at = utc_now()

    new_ver = DocumentVersion(
        document_id=d.id,
        version_number=new_ver_num,
        original_filename=filename,
        storage_key=new_storage_key,
        mime_type=mime_type or d.mime_type,
        size_bytes=size_bytes,
        sha256_hash=file_sha256,
        uploaded_by=uploaded_by,
        change_note=change_note or f"Uploaded version {new_ver_num}"
    )
    db.add(new_ver)

    db.add(AuditEvent(
        workspace_id=case.workspace_id,
        actor_name=uploaded_by,
        actor_role="COORDINATOR",
        entity_type="EVIDENCE_DOCUMENT",
        entity_id=d.id,
        action="DOCUMENT_VERSION_INCREMENTED",
        details_json={
            "document": d.original_filename,
            "version": new_ver_num,
            "sha256": file_sha256,
            "change_note": change_note
        }
    ))
    db.commit()
    db.refresh(d)
    return format_document_response(d, db)

# API Endpoints
@router.get("/cases/{case_id}/documents", response_model=List[DocumentResponse])
def list_case_documents(case_id: str, db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not case:
        raise HTTPException(status_code=404, detail=f"Case '{case_id}' not found.")

    docs = db.query(EvidenceDocument).filter(
        EvidenceDocument.case_id == case.id
    ).order_by(EvidenceDocument.created_at.desc()).all()

    return [format_document_response(d, db) for d in docs]

@router.post("/cases/{case_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_evidence_document(
    case_id: str,
    file: UploadFile = File(...),
    category: str = Form(...),
    document_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    uploaded_by: str = Form("Coordinator"),
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "evidence document upload")
    content = await file.read()
    mime_type = file.content_type or "application/pdf"
    return store_evidence_document(
        case_id=case_id,
        content=content,
        filename=file.filename or "uploaded_document.pdf",
        mime_type=mime_type,
        category=category,
        document_date=document_date,
        expiry_date=expiry_date,
        uploaded_by=uploaded_by,
        db=db
    )

@router.get("/documents/{document_id}", response_model=DocumentResponse)
def get_document_detail(document_id: str, db: Session = Depends(get_db)):
    d = db.query(EvidenceDocument).filter(EvidenceDocument.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found.")
    return format_document_response(d, db)

@router.get("/documents/{document_id}/download")
def download_evidence_document(document_id: str, db: Session = Depends(get_db)):
    d = db.query(EvidenceDocument).filter(EvidenceDocument.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found.")
    if not os.path.exists(d.storage_key):
        raise HTTPException(status_code=404, detail="File missing in vault.")

    return FileResponse(
        path=d.storage_key,
        media_type=d.mime_type,
        filename=d.original_filename
    )

@router.post("/documents/{document_id}/review", response_model=DocumentResponse)
def review_evidence_document(
    document_id: str,
    req: ReviewDocumentRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Reviewer", "Administrator"], "evidence document review")
    d = db.query(EvidenceDocument).filter(EvidenceDocument.id == document_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Document not found.")

    stat_upper = req.review_status.upper()
    if stat_upper not in ["VERIFIED_VALID", "NEEDS_CORRECTION", "NOT_APPLICABLE"]:
        raise HTTPException(status_code=400, detail="Invalid review status.")

    prev = d.review_status
    d.review_status = stat_upper
    d.reviewed_by = req.reviewed_by
    d.review_notes = req.review_notes
    d.updated_at = utc_now()

    case = d.case
    ws_id = case.workspace_id if case else "default"
    if stat_upper == "NEEDS_CORRECTION":
        db.add(Alert(
            workspace_id=ws_id,
            case_id=d.case_id,
            alert_key=f"ALERT-CORR-DOC-{d.id[:8]}",
            category="DOCUMENT_REVIEW",
            severity="HIGH",
            title=f"Document Correction Required: {d.original_filename}",
            explanation=f"Reviewer notes: {req.review_notes or 'Deficiency noted upon human verification.'}",
            status="OPEN",
            assigned_to=d.uploaded_by
        ))

    db.add(AuditEvent(
        workspace_id=ws_id,
        actor_name=req.reviewed_by,
        actor_role="DOCUMENT_REVIEWER",
        entity_type="EVIDENCE_DOCUMENT",
        entity_id=d.id,
        action="DOCUMENT_REVIEW_RECORDED",
        details_json={
            "document": d.original_filename,
            "previous_status": prev,
            "new_status": stat_upper,
            "notes": req.review_notes
        }
    ))
    db.commit()
    db.refresh(d)
    return format_document_response(d, db)

@router.post("/documents/{document_id}/versions", response_model=DocumentResponse)
async def upload_new_document_version(
    document_id: str,
    file: UploadFile = File(...),
    change_note: Optional[str] = Form(None),
    uploaded_by: str = Form("Coordinator"),
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Institution Coordinator", "Administrator"], "evidence document version upload")
    content = await file.read()
    mime_type = file.content_type or "application/pdf"
    return store_document_version(
        document_id=document_id,
        content=content,
        filename=file.filename or "updated_version.pdf",
        mime_type=mime_type,
        change_note=change_note,
        uploaded_by=uploaded_by,
        db=db
    )
