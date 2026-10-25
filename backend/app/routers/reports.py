import csv
import io
import json
from datetime import datetime, date, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db, Base, engine
from ..models import (
    Workspace, ApprovalCase, EvidenceDocument, ComplianceResult,
    CaseStageHistory, Alert, Task, AuditEvent
)
from .workspace import get_or_create_default_workspace

router = APIRouter(prefix="/api", tags=["Operational Reports & Exports"])

Base.metadata.create_all(bind=engine)

MANDATORY_DISCLAIMER = (
    "AIClear Internal Workflow Document. This report is an internal institutional planning "
    "and compliance monitoring artifact. It is NOT an official AICTE Approval Certificate, "
    "Statutory Endorsement, or Government Sanction. Final regulatory determinations must be "
    "verified through the official AICTE Portal pursuant to the Approval Process Handbook 2024–2027."
)

class ReviewPackResponse(BaseModel):
    disclaimer: str
    generated_at: datetime
    case_reference: str
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
    data_mode: str
    executive_summary: Dict[str, Any]
    evidence_inventory: List[Dict[str, Any]]
    compliance_checklist: List[Dict[str, Any]]
    stage_transitions: List[Dict[str, Any]]
    outstanding_alerts: List[Dict[str, Any]]
    sign_off_blocks: Dict[str, Any]

@router.get("/cases/{case_id}/review-pack", response_model=ReviewPackResponse)
def get_case_review_pack(case_id: str, db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    today = date.today()
    inst = case.institution

    # 1. Evidence Inventory
    docs = db.query(EvidenceDocument).filter(
        EvidenceDocument.case_id == case.id
    ).order_by(EvidenceDocument.created_at.desc()).all()

    evidence_items = []
    verified_count = 0
    expired_count = 0
    for d in docs:
        is_exp = bool(d.expiry_date and d.expiry_date < today)
        if is_exp:
            expired_count += 1
        if d.review_status == "VERIFIED_VALID":
            verified_count += 1

        evidence_items.append({
            "id": d.id,
            "category": d.category.replace("_", " "),
            "original_filename": d.original_filename,
            "document_date": str(d.document_date) if d.document_date else "N/A",
            "expiry_date": str(d.expiry_date) if d.expiry_date else "N/A",
            "is_expired": is_exp,
            "current_version": d.version_number,
            "sha256_short": d.sha256_hash[:16] if d.sha256_hash else "N/A",
            "review_status": d.review_status,
            "reviewed_by": d.reviewed_by or "Unassigned",
            "review_notes": d.review_notes or "None recorded"
        })

    # 2. Compliance Checklist
    results = db.query(ComplianceResult).filter(
        ComplianceResult.case_id == case.id
    ).all()

    comp_items = []
    compliant_count = 0
    deficiencies_count = 0
    overrides_count = 0

    for r in results:
        rule = r.rule
        if r.status == "COMPLIANT":
            compliant_count += 1
        elif r.status in ["NON_COMPLIANT", "EXPIRED_EVIDENCE", "MISSING_EVIDENCE", "NEEDS_REVIEW"]:
            deficiencies_count += 1

        if r.manual_override:
            overrides_count += 1

        comp_items.append({
            "rule_key": rule.rule_key if rule else "RULE",
            "rule_title": rule.title if rule else "Compliance Requirement",
            "rule_source_type": rule.rule_source_type if rule else "DEMO",
            "citation": f"{rule.official_source_title} ({rule.official_section_ref})" if rule and rule.official_source_title else "Institutional Guideline",
            "status": r.status,
            "original_status": r.original_status,
            "manual_override": r.manual_override,
            "override_reason": r.override_reason,
            "overridden_by": r.overridden_by,
            "explanation": r.explanation,
            "recommended_action": r.recommended_action,
            "evaluated_at": r.evaluated_at.isoformat() if r.evaluated_at else None
        })

    # 3. Stage History
    histories = db.query(CaseStageHistory).filter(
        CaseStageHistory.case_id == case.id
    ).order_by(CaseStageHistory.changed_at.asc()).all()

    stage_items = [
        {
            "from_stage": h.from_stage,
            "to_stage": h.to_stage,
            "changed_by": h.changed_by,
            "reason": h.reason,
            "created_at": h.changed_at.isoformat() if h.changed_at else ""
        }
        for h in histories
    ]

    # 4. Outstanding Alerts
    alerts = db.query(Alert).filter(
        Alert.case_id == case.id,
        Alert.status.in_(["OPEN", "ACKNOWLEDGED"])
    ).order_by(Alert.created_at.desc()).all()

    alert_items = [
        {
            "alert_key": a.alert_key,
            "category": a.category,
            "severity": a.severity,
            "title": a.title,
            "status": a.status,
            "assigned_to": a.assigned_to or "Unassigned"
        }
        for a in alerts
    ]

    executive_summary = {
        "total_documents": len(docs),
        "verified_documents": verified_count,
        "expired_documents": expired_count,
        "total_compliance_rules": len(results),
        "compliant_count": compliant_count,
        "deficiencies_count": deficiencies_count,
        "manual_overrides_count": overrides_count,
        "active_alerts_count": len(alerts),
        "approval_readiness_score": (
            int((compliant_count / len(results) * 100)) if results else 0
        )
    }

    sign_offs = {
        "case_coordinator": {
            "title": "Case Coordinator / Internal Owner",
            "name": case.internal_owner_name,
            "date": today.isoformat()
        },
        "compliance_officer": {
            "title": "Institutional Compliance Officer",
            "name": "Designated Verifier",
            "date": None
        },
        "head_of_institution": {
            "title": "Principal / Director / Dean",
            "name": "Head of Technical Institution",
            "date": None
        }
    }

    return ReviewPackResponse(
        disclaimer=MANDATORY_DISCLAIMER,
        generated_at=datetime.now(timezone.utc),
        case_reference=case.case_reference,
        institution_name=inst.legal_name if inst else "Technical Institution",
        aicte_permanent_id=inst.aicte_permanent_id if inst else None,
        institution_type=inst.institution_type if inst else "N/A",
        state=inst.state if inst else "N/A",
        district=inst.district if inst else "N/A",
        workflow_type=case.workflow_type,
        academic_period=case.academic_period,
        current_stage=case.current_stage,
        status=case.status,
        priority=case.priority,
        internal_owner_name=case.internal_owner_name,
        target_date=case.target_date,
        days_remaining=(case.target_date - today).days,
        data_mode=case.data_mode,
        executive_summary=executive_summary,
        evidence_inventory=evidence_items,
        compliance_checklist=comp_items,
        stage_transitions=stage_items,
        outstanding_alerts=alert_items,
        sign_off_blocks=sign_offs
    )

@router.get("/cases/{case_id}/export/json")
def export_case_json(case_id: str, db: Session = Depends(get_db)):
    pack = get_case_review_pack(case_id, db)
    json_data = pack.model_dump_json(indent=2)
    filename = f"aiclear_case_{pack.case_reference}_dossier.json"

    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/export/cases.csv")
def export_cases_csv(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).order_by(ApprovalCase.case_reference.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # Mandatory Disclaimer in Header Row
    writer.writerow(["# DISCLAIMER: " + MANDATORY_DISCLAIMER])
    writer.writerow([
        "Case Reference", "Institution Name", "AICTE Permanent ID",
        "Institution Type", "State", "Workflow Type", "Academic Period",
        "Current Stage", "Status", "Priority", "Internal Owner",
        "Target Date", "Data Mode", "Created At"
    ])

    for c in cases:
        inst = c.institution
        writer.writerow([
            c.case_reference,
            inst.legal_name if inst else "N/A",
            inst.aicte_permanent_id if inst else "N/A",
            inst.institution_type if inst else "N/A",
            inst.state if inst else "N/A",
            c.workflow_type,
            c.academic_period,
            c.current_stage,
            c.status,
            c.priority,
            c.internal_owner_name,
            c.target_date.isoformat(),
            c.data_mode,
            c.created_at.isoformat()
        ])

    csv_data = output.getvalue()
    filename = f"aiclear_cases_{ws.active_data_mode.lower()}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/export/compliance.csv")
def export_compliance_csv(db: Session = Depends(get_db)):
    ws = get_or_create_default_workspace(db)
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).all()
    case_ids = [c.id for c in cases]

    results = db.query(ComplianceResult).filter(
        ComplianceResult.case_id.in_(case_ids)
    ).all() if case_ids else []

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["# DISCLAIMER: " + MANDATORY_DISCLAIMER])
    writer.writerow([
        "Case Reference", "Institution Name", "Rule Key", "Rule Title",
        "Source Type", "Citation", "Status", "Original Status",
        "Manual Override", "Override Reason", "Overridden By",
        "Explanation", "Recommended Action", "Evaluated At"
    ])

    for r in results:
        c = r.case
        rule = r.rule
        inst = c.institution if c else None
        writer.writerow([
            c.case_reference if c else "N/A",
            inst.legal_name if inst else "N/A",
            rule.rule_key if rule else "N/A",
            rule.title if rule else "N/A",
            rule.rule_source_type if rule else "DEMO",
            f"{rule.official_source_title} ({rule.official_section_ref})" if rule and rule.official_source_title else "N/A",
            r.status,
            r.original_status or r.status,
            "YES" if r.manual_override else "NO",
            r.override_reason or "",
            r.overridden_by or "",
            r.explanation,
            r.recommended_action or "",
            r.evaluated_at.isoformat() if r.evaluated_at else ""
        ])

    csv_data = output.getvalue()
    filename = f"aiclear_compliance_{ws.active_data_mode.lower()}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
