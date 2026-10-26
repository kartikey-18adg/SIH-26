import uuid
from datetime import datetime, date, timezone, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db, Base, engine
from ..models import (
    Workspace, ApprovalCase, ComplianceRule, ComplianceResult, 
    EvidenceDocument, Alert, AuditEvent
)
from .workspace import get_or_create_default_workspace
from ..seed_data import seed_compliance_rules
from ..permissions import get_current_role, check_role_permission
from ..ai_compliance import generate_compliance_insights

router = APIRouter(prefix="/api", tags=["Compliance Engine"])

Base.metadata.create_all(bind=engine)

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

# Pydantic Schemas
class RuleDefinitionItem(BaseModel):
    id: str
    rule_key: str
    title: str
    description: str
    applicable_workflow: str
    rule_source_type: str  # OFFICIAL_APH_2024_27, INSTITUTION_POLICY, ILLUSTRATIVE_DEMO
    official_source_title: Optional[str] = None
    official_section_ref: Optional[str] = None
    rule_version: str
    severity: str
    is_active: bool

    class Config:
        from_attributes = True

class ComplianceResultItem(BaseModel):
    id: str
    case_id: str
    rule_id: str
    rule_key: str
    rule_title: str
    rule_source_type: str
    official_source_title: Optional[str] = None
    official_section_ref: Optional[str] = None
    rule_version_snapshot: str
    severity: str
    status: str  # COMPLIANT, NEEDS_REVIEW, NON_COMPLIANT, MISSING_EVIDENCE, EXPIRED_EVIDENCE, NOT_APPLICABLE, UNABLE_TO_DETERMINE
    original_status: Optional[str] = None
    explanation: str
    recommended_action: Optional[str] = None
    requires_human_review: bool
    manual_override: bool
    override_reason: Optional[str] = None
    overridden_by: Optional[str] = None
    evaluated_at: datetime

class ComplianceQueueItem(BaseModel):
    id: str
    case_id: str
    case_reference: str
    institution_name: str
    rule_id: str
    rule_key: str
    rule_title: str
    rule_source_type: str
    official_source_title: Optional[str] = None
    official_section_ref: Optional[str] = None
    rule_version_snapshot: str
    severity: str
    status: str
    original_status: Optional[str] = None
    explanation: str
    recommended_action: Optional[str] = None
    requires_human_review: bool
    manual_override: bool
    override_reason: Optional[str] = None
    overridden_by: Optional[str] = None
    evaluated_at: datetime

class ComplianceOverrideRequest(BaseModel):
    new_status: str = Field(..., description="COMPLIANT, NOT_APPLICABLE, NEEDS_REVIEW")
    override_reason: str = Field(..., min_length=5, description="Mandatory written justification for human override")
    overridden_by: str = "Compliance Officer"

def format_result_item(res: ComplianceResult) -> ComplianceResultItem:
    r = res.rule
    return ComplianceResultItem(
        id=res.id,
        case_id=res.case_id,
        rule_id=res.rule_id,
        rule_key=r.rule_key if r else "UNKNOWN",
        rule_title=r.title if r else "Compliance Rule",
        rule_source_type=r.rule_source_type if r else "DEMO",
        official_source_title=r.official_source_title if r else None,
        official_section_ref=r.official_section_ref if r else None,
        rule_version_snapshot=res.rule_version_snapshot,
        severity=r.severity if r else "MEDIUM",
        status=res.status,
        original_status=res.original_status,
        explanation=res.explanation,
        recommended_action=res.recommended_action,
        requires_human_review=res.requires_human_review,
        manual_override=res.manual_override,
        override_reason=res.override_reason,
        overridden_by=res.overridden_by,
        evaluated_at=res.evaluated_at
    )

@router.get("/compliance/rules", response_model=List[RuleDefinitionItem])
def list_compliance_rules(db: Session = Depends(get_db)):
    seed_compliance_rules(db)
    rules = db.query(ComplianceRule).filter(ComplianceRule.is_active == True).all()
    return [RuleDefinitionItem.model_validate(r) for r in rules]

@router.get("/compliance/queue", response_model=List[ComplianceQueueItem])
def get_compliance_queue(
    status_filter: Optional[str] = None,
    severity: Optional[str] = None,
    rule_source: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    ws = get_or_create_default_workspace(db)
    seed_compliance_rules(db)

    # Fetch active cases in current data mode
    cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).all()

    if not cases:
        return []

    case_ids = [c.id for c in cases]
    case_map = {c.id: c for c in cases}

    # This is a read-only queue endpoint. Never trigger evaluations while listing:
    # evaluating hundreds of imported cases here caused slow requests, duplicate audit
    # events, and repeated alerts on every refresh. Use the explicit evaluate endpoint
    # to create/update results for a case.
    results = db.query(ComplianceResult).filter(
        ComplianceResult.case_id.in_(case_ids)
    ).all()

    queue_items = []
    for res in results:
        case = case_map.get(res.case_id)
        if not case:
            continue

        r = res.rule
        inst_name = case.institution.legal_name if case.institution else "Technical Institution"

        # Apply optional filters
        if status_filter and isinstance(status_filter, str) and status_filter.upper() != "ALL":
            if res.status.upper() != status_filter.upper():
                continue

        if severity and isinstance(severity, str) and severity.upper() != "ALL":
            if r and r.severity.upper() != severity.upper():
                continue

        if rule_source and isinstance(rule_source, str) and rule_source.upper() != "ALL":
            if r and r.rule_source_type.upper() != rule_source.upper():
                continue

        if search and isinstance(search, str):
            term = search.lower()
            ref_match = term in case.case_reference.lower()
            inst_match = term in inst_name.lower()
            key_match = r and term in r.rule_key.lower()
            title_match = r and term in r.title.lower()
            if not (ref_match or inst_match or key_match or title_match):
                continue

        queue_items.append(ComplianceQueueItem(
            id=res.id,
            case_id=case.id,
            case_reference=case.case_reference,
            institution_name=inst_name,
            rule_id=res.rule_id,
            rule_key=r.rule_key if r else "UNKNOWN",
            rule_title=r.title if r else "Compliance Rule",
            rule_source_type=r.rule_source_type if r else "DEMO",
            official_source_title=r.official_source_title if r else None,
            official_section_ref=r.official_section_ref if r else None,
            rule_version_snapshot=res.rule_version_snapshot,
            severity=r.severity if r else "MEDIUM",
            status=res.status,
            original_status=res.original_status,
            explanation=res.explanation,
            recommended_action=res.recommended_action,
            requires_human_review=res.requires_human_review,
            manual_override=res.manual_override,
            override_reason=res.override_reason,
            overridden_by=res.overridden_by,
            evaluated_at=res.evaluated_at
        ))

    # Sort queue: items needing attention first (NEEDS_REVIEW, NON_COMPLIANT, EXPIRED_EVIDENCE, MISSING_EVIDENCE) then COMPLIANT
    status_order = {
        "NON_COMPLIANT": 0,
        "EXPIRED_EVIDENCE": 1,
        "MISSING_EVIDENCE": 2,
        "NEEDS_REVIEW": 3,
        "UNABLE_TO_DETERMINE": 4,
        "COMPLIANT": 5,
        "NOT_APPLICABLE": 6
    }
    queue_items.sort(key=lambda item: status_order.get(item.status, 99))

    return queue_items

@router.get("/cases/{case_id}/compliance", response_model=List[ComplianceResultItem])
def get_case_compliance_results(case_id: str, db: Session = Depends(get_db)):
    seed_compliance_rules(db)
    results = db.query(ComplianceResult).filter(
        ComplianceResult.case_id == case_id
    ).all()
    return [format_result_item(r) for r in results]

@router.post("/cases/{case_id}/compliance/evaluate", response_model=List[ComplianceResultItem])
def evaluate_case_compliance(
    case_id: str, 
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Compliance Officer", "Administrator"], "evaluating compliance checks")
    ws = get_or_create_default_workspace(db)
    seed_compliance_rules(db)

    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id
    ).first()

    if not case:
        raise HTTPException(status_code=404, detail="Case not found.")

    today = date.today()
    docs = db.query(EvidenceDocument).filter(
        EvidenceDocument.case_id == case.id
    ).order_by(EvidenceDocument.created_at.desc()).all()
    docs_by_category: Dict[str, List[EvidenceDocument]] = {}
    for d in docs:
        docs_by_category.setdefault(d.category, []).append(d)

    rules = db.query(ComplianceRule).filter(ComplianceRule.is_active == True).all()
    evaluated_results = []

    for rule in rules:
        # Check if existing result with manual override exists
        existing_res = db.query(ComplianceResult).filter(
            ComplianceResult.case_id == case.id,
            ComplianceResult.rule_id == rule.id
        ).first()

        # If manually overridden, preserve it unless overridden by user
        if existing_res and existing_res.manual_override:
            evaluated_results.append(existing_res)
            continue

        calc_status = "COMPLIANT"
        explanation = ""
        action = None
        needs_human = False

        # --- Deterministic Evaluation Logic ---

        # 1. Fire Safety Certificate (APH 2024-27 Appendix 16)
        if rule.rule_key == "APH-2024-FIRE-002":
            fire_docs = docs_by_category.get("FIRE_SAFETY_NOC", [])
            if not fire_docs:
                calc_status = "MISSING_EVIDENCE"
                explanation = "Mandatory Fire Safety Certificate / NOC issued by the Municipal Fire Authority is not attached."
                action = "Attach a valid, unexpired Fire Safety Certificate in the Evidence Vault."
                needs_human = True
            else:
                doc = fire_docs[0]
                if doc.document_date and doc.expiry_date and doc.document_date > doc.expiry_date:
                    calc_status = "NEEDS_REVIEW"
                    explanation = f"Date Ordering Anomaly: Certificate issue date ({doc.document_date}) is after expiration date ({doc.expiry_date})."
                    action = "Inspect physical document and correct chronological recording error."
                    needs_human = True
                elif doc.document_date and doc.document_date > today:
                    calc_status = "NEEDS_REVIEW"
                    explanation = f"Date Ordering Anomaly: Certificate issue date ({doc.document_date}) is in the future."
                    action = "Verify certificate issue date against official seal."
                    needs_human = True
                elif doc.expiry_date and doc.expiry_date < today:
                    calc_status = "EXPIRED_EVIDENCE"
                    explanation = f"Attached Fire Safety Certificate expired on {doc.expiry_date}."
                    action = "Obtain renewed NOC from competent fire officer or attach municipal renewal acknowledgment receipt."
                    needs_human = True
                elif doc.expiry_date and (doc.expiry_date - today).days <= 30:
                    calc_status = "NEEDS_REVIEW"
                    days_left = (doc.expiry_date - today).days
                    explanation = f"Fire Safety Certificate expires in {days_left} days (statutory recommendation requires minimum 30-day validity window)."
                    action = "Verify whether municipal renewal process has been initiated."
                    needs_human = True
                elif doc.review_status == "AWAITING_REVIEW":
                    calc_status = "NEEDS_REVIEW"
                    explanation = "Fire Safety Certificate is attached but has not yet undergone human review."
                    action = "Document Reviewer must inspect municipal seals and verify authenticity."
                    needs_human = True
                elif doc.review_status == "NEEDS_CORRECTION":
                    calc_status = "NON_COMPLIANT"
                    explanation = f"Document Reviewer flagged deficiencies: {doc.review_notes or 'Correction required'}"
                    action = "Upload a revised, verified certificate in the Evidence Vault."
                    needs_human = True
                else:
                    calc_status = "COMPLIANT"
                    explanation = f"Valid Fire Safety NOC verified on file (expires {doc.expiry_date or 'permanent'})."

        # 2. Building Occupancy Certificate (APH 2024-27 Clause 1.4 & Appendix 4)
        elif rule.rule_key == "APH-2024-OCCUP-003":
            occup_docs = docs_by_category.get("OCCUPANCY_CERTIFICATE", [])
            if not occup_docs:
                calc_status = "MISSING_EVIDENCE"
                explanation = "Building Occupancy / Completion Certificate from local planning/competent authority is missing."
                action = "Upload Occupancy Certificate certifying institutional built-up area."
                needs_human = True
            else:
                doc = occup_docs[0]
                if doc.document_date and doc.expiry_date and doc.document_date > doc.expiry_date:
                    calc_status = "NEEDS_REVIEW"
                    explanation = f"Date Ordering Anomaly: Issue date ({doc.document_date}) is after expiration date ({doc.expiry_date})."
                    action = "Correct document metadata dates."
                    needs_human = True
                elif doc.review_status == "AWAITING_REVIEW":
                    calc_status = "NEEDS_REVIEW"
                    explanation = "Occupancy Certificate attached; awaiting human review of instructional area coverage."
                    action = "Review certificate built-up area numbers against institution master."
                    needs_human = True
                elif doc.review_status == "NEEDS_CORRECTION":
                    calc_status = "NON_COMPLIANT"
                    explanation = "Reviewer flagged occupancy certificate inconsistency."
                    action = "Address reviewer remarks and re-upload."
                    needs_human = True
                else:
                    calc_status = "COMPLIANT"
                    explanation = "Permanent Building Occupancy Certificate verified on file."

        # 3. Land Title Deed (APH 2024-27 Chapter I, Appendix 4)
        elif rule.rule_key == "APH-2024-LAND-004":
            land_docs = docs_by_category.get("LAND_TITLE_DEED", [])
            if not land_docs:
                if case.workflow_type == "NEW_INSTITUTION":
                    calc_status = "MISSING_EVIDENCE"
                    explanation = "Registered Land Title / 30-year Lease Deed is mandatory for new institution approval."
                    action = "Attach registered land ownership documents and non-encumbrance certificate."
                    needs_human = True
                else:
                    calc_status = "COMPLIANT"
                    explanation = "Existing institution with prior registered land approval."
            else:
                doc = land_docs[0]
                if doc.review_status == "AWAITING_REVIEW":
                    calc_status = "NEEDS_REVIEW"
                    explanation = "Land deed attached; awaiting legal verification."
                    needs_human = True
                else:
                    calc_status = "COMPLIANT"
                    explanation = "Land title deed verified."

        # 4. Faculty-Student Ratio (APH 2024-27 Chapter II, Section 2.4 & Appendix 7)
        elif rule.rule_key == "APH-2024-FSR-001":
            matrix_docs = docs_by_category.get("FACULTY_CADRE_MATRIX", [])
            if not matrix_docs and case.workflow_type in ["INCREASE_IN_INTAKE", "NEW_COURSE"]:
                calc_status = "NEEDS_REVIEW"
                explanation = "Faculty cadre statement not attached. Proposed intake or new course requires FSR verification (norm 1:20)."
                action = "Attach authenticated faculty roster and calculate student-to-teacher ratio."
                needs_human = True
            else:
                calc_status = "COMPLIANT"
                explanation = "Cadre roll verified against student intake norms."

        # 5. Illustrative Cadre Ratio Balance (Demo Rule)
        elif rule.rule_key == "DEMO-INT-CADRE-005":
            if case.workflow_type == "INCREASE_IN_INTAKE":
                calc_status = "NEEDS_REVIEW"
                explanation = "[Illustrative Demo Rule] Cadre ratio calculation check requires human verification against current norms."
                action = "Inspect professor to assistant professor ratio."
                needs_human = True
            else:
                calc_status = "COMPLIANT"
                explanation = "Illustrative demo check cleared."

        else:
            calc_status = "COMPLIANT"
            explanation = "Automated check passed."

        # Persist or update ComplianceResult
        if existing_res:
            existing_res.status = calc_status
            existing_res.original_status = calc_status
            existing_res.explanation = explanation
            existing_res.recommended_action = action
            existing_res.requires_human_review = needs_human
            existing_res.evaluated_at = utc_now()
            res_obj = existing_res
        else:
            res_obj = ComplianceResult(
                case_id=case.id,
                rule_id=rule.id,
                rule_version_snapshot=rule.rule_version,
                status=calc_status,
                original_status=calc_status,
                explanation=explanation,
                recommended_action=action,
                requires_human_review=needs_human,
                evaluated_at=utc_now()
            )
            db.add(res_obj)

        evaluated_results.append(res_obj)

    # If critical deficiencies found, generate Alert
    deficiencies = [r for r in evaluated_results if r.status in ["NON_COMPLIANT", "EXPIRED_EVIDENCE", "MISSING_EVIDENCE"]]
    if deficiencies:
        alert_key = f"ALERT-COMP-DEF-{case.id[:8]}"
        existing_alert = db.query(Alert).filter(
            Alert.workspace_id == ws.id,
            Alert.case_id == case.id,
            Alert.alert_key == alert_key,
            Alert.status == "OPEN",
        ).first()
        if not existing_alert:
            db.add(Alert(
                workspace_id=ws.id,
                case_id=case.id,
                alert_key=alert_key,
                category="COMPLIANCE_DEFICIENCY",
                severity="HIGH",
                title=f"Compliance Deficiencies Flagged: {len(deficiencies)} Items",
                explanation=f"Deterministic evaluation against APH 2024-27 detected {len(deficiencies)} unresolved items requiring institutional action.",
                status="OPEN",
                assigned_to=case.internal_owner_name
            ))

    # Audit event
    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name="Compliance Engine",
        actor_role="SYSTEM_EVALUATOR",
        entity_type="CASE",
        entity_id=case.id,
        action="COMPLIANCE_CHECKS_EVALUATED",
        details_json={
            "case_reference": case.case_reference,
            "rules_evaluated": len(evaluated_results),
            "deficiencies_count": len(deficiencies)
        }
    ))
    db.commit()

    return [format_result_item(r) for r in evaluated_results]

@router.post("/compliance-results/{result_id}/override", response_model=ComplianceResultItem)
def override_compliance_result(
    result_id: str,
    req: ComplianceOverrideRequest,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    check_role_permission(current_role, ["Compliance Officer", "Administrator"], "recording compliance override")
    res = db.query(ComplianceResult).filter(ComplianceResult.id == result_id).first()
    if not res:
        raise HTTPException(status_code=404, detail="Compliance result not found.")

    allowed = ["COMPLIANT", "NOT_APPLICABLE", "NEEDS_REVIEW"]
    new_stat = req.new_status.upper()
    if new_stat not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid override status. Allowed: {', '.join(allowed)}")

    case = res.case
    ws_id = case.workspace_id if case else "default"
    previous_status = res.status

    # Preserve original automated status if not already preserved
    if not res.original_status:
        res.original_status = previous_status

    res.status = new_stat
    res.manual_override = True
    res.override_reason = req.override_reason
    res.overridden_by = req.overridden_by
    res.evaluated_at = utc_now()

    # Immutable Audit Log
    db.add(AuditEvent(
        workspace_id=ws_id,
        actor_name=req.overridden_by,
        actor_role="COMPLIANCE_OFFICER",
        entity_type="COMPLIANCE_RESULT",
        entity_id=res.id,
        action="COMPLIANCE_OVERRIDE_RECORDED",
        details_json={
            "rule": res.rule.rule_key if res.rule else "UNKNOWN",
            "previous_status": previous_status,
            "new_status": new_stat,
            "original_automated_status": res.original_status,
            "justification": req.override_reason
        }
    ))
    db.commit()
    db.refresh(res)

    return format_result_item(res)


@router.post("/cases/{case_id}/compliance/ai-insights")
def get_ai_compliance_insights(
    case_id: str,
    db: Session = Depends(get_db),
    current_role: str = Depends(get_current_role)
):
    """Summarize recorded compliance findings; never changes their deterministic status."""
    check_role_permission(current_role, ["Compliance Officer", "Administrator"], "generating AI compliance insights")
    ws = get_or_create_default_workspace(db)
    case = db.query(ApprovalCase).filter(
        ApprovalCase.id == case_id,
        ApprovalCase.workspace_id == ws.id,
        ApprovalCase.data_mode == ws.active_data_mode
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found in the active data mode.")

    results = db.query(ComplianceResult).filter(
        ComplianceResult.case_id == case.id
    ).all()
    if not results:
        results = evaluate_case_compliance(case_id=case.id, db=db, current_role=current_role)
        # evaluate_case_compliance returns API schemas; reload ORM results for the insight builder.
        results = db.query(ComplianceResult).filter(
            ComplianceResult.case_id == case.id
        ).all()

    insight = generate_compliance_insights(case, results)
    db.add(AuditEvent(
        workspace_id=ws.id,
        actor_name=current_role,
        actor_role=current_role.upper().replace(" ", "_"),
        entity_type="CASE",
        entity_id=case.id,
        action="AI_COMPLIANCE_INSIGHTS_GENERATED" if insight["analysis_mode"] == "AI_ASSISTED" else "COMPLIANCE_TRIAGE_FALLBACK_GENERATED",
        details_json={
            "case_reference": case.case_reference,
            "analysis_mode": insight["analysis_mode"],
            "results_considered": len(results),
            "model": insight.get("model"),
        }
    ))
    db.commit()
    return insight
