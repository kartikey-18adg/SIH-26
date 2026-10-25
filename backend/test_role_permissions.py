"""
Automated Role & Permissions Verification Test Suite for AIClear
Tests permissions matrix enforcement across all 4 institutional roles:
- Institution Coordinator
- Reviewer
- Compliance Officer
- Administrator
"""
import sys
import os
from fastapi import HTTPException

# Ensure root directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import Workspace, ApprovalCase, EvidenceDocument, ComplianceResult, Alert
from backend.app.permissions import (
    SUPPORTED_ROLES, ROLE_PERMISSIONS, check_role_permission, normalize_role
)
from backend.app.routers.workspace import (
    get_or_create_default_workspace, get_roles_info, switch_data_mode, reset_demo_workspace
)
from backend.app.routers.cases import (
    create_case, transition_case_stage, CaseCreateRequest, CaseTransitionRequest, list_cases
)
from backend.app.routers.documents import (
    review_evidence_document, ReviewDocumentRequest
)
from backend.app.routers.compliance import (
    evaluate_case_compliance, override_compliance_result, ComplianceOverrideRequest
)
from backend.app.routers.alerts import (
    trigger_alert_scan, assign_alert, resolve_alert,
    AlertAssignRequest, AlertResolveRequest
)
from backend.app.routers.ingestion import (
    commit_ingestion_batch, IngestionCommitRequest, IngestionRecord
)

def run_role_permissions_tests():
    db = SessionLocal()
    print("=====================================================================")
    print("      AICLEAR ROLE & PERMISSIONS VERIFICATION TEST SUITE             ")
    print("=====================================================================\n")

    ws = get_or_create_default_workspace(db)
    print(f"[SETUP] Workspace: {ws.name} | Active Mode: {ws.active_data_mode}")

    # Section 1: Verify Roles Engine Configuration
    print("\n>>> SECTION 1: ROLE CATALOG & PERMISSIONS ENGINE <<<")
    roles_info = get_roles_info(current_role="Administrator")
    assert len(roles_info["roles"]) == 4, f"Expected 4 roles, got {len(roles_info['roles'])}"
    for r in ["Institution Coordinator", "Compliance Officer", "Reviewer", "Administrator"]:
        assert r in roles_info["roles"], f"Missing supported role: {r}"
        assert r in roles_info["permissions"], f"Missing permissions config for {r}"
    print("[PASS] Roles catalog properly defines all 4 supported institutional roles.")

    # Fetch test fixtures
    doc = db.query(EvidenceDocument).first()
    assert doc is not None, "No evidence documents found in database"
    doc_id = doc.id
    case_id = doc.case_id

    comp_result = db.query(ComplianceResult).first()
    assert comp_result is not None, "No compliance results found in database"
    comp_id = comp_result.id

    alerts = db.query(Alert).all()
    assert len(alerts) > 0, "No alerts available for testing"
    alert_id = alerts[0].id

    # Section 2: Institution Coordinator Tests
    print("\n>>> SECTION 2: INSTITUTION COORDINATOR PERMISSIONS <<<")
    coord_role = "Institution Coordinator"

    # 2.1 Case Creation (Allowed)
    new_case_req = CaseCreateRequest(
        institute_name="Coordinator Test Technical Institute",
        institute_type="PRIVATE_SELF_FINANCED",
        state="Maharashtra",
        district="Pune",
        workflow_type="EXTENSION_OF_APPROVAL",
        academic_period="2025-2026",
        priority="MEDIUM",
        internal_owner_name="Prof. Coordinator",
        target_date="2026-06-30"
    )
    res_case = create_case(req=new_case_req, db=db, current_role=coord_role)
    assert res_case.id is not None
    print("[PASS] Institution Coordinator allowed to initialize cases.")

    # 2.2 Alert Assignment (Allowed)
    res_assign = assign_alert(
        alert_id=alert_id,
        req=AlertAssignRequest(assigned_to="Staff Reviewer", assigned_by="Prof. Coordinator"),
        db=db,
        current_role=coord_role
    )
    assert res_assign.assigned_to == "Staff Reviewer"
    print("[PASS] Institution Coordinator allowed to assign operational alerts.")

    # 2.3 Evidence Review (Denied - 403 Forbidden to prevent self-approval)
    try:
        review_evidence_document(
            document_id=doc_id,
            req=ReviewDocumentRequest(review_status="VERIFIED_VALID", review_notes="Self-approval attempt"),
            db=db,
            current_role=coord_role
        )
        assert False, "Institution Coordinator should NOT be permitted to verify documents (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        assert "Permission Denied" in e.detail
        print(f"[PASS] Document review blocked for Institution Coordinator (403: {e.detail[:55]}...)")

    # 2.4 Compliance Override (Denied - 403 Forbidden)
    try:
        override_compliance_result(
            result_id=comp_id,
            req=ComplianceOverrideRequest(new_status="COMPLIANT", override_reason="Coordinator override"),
            db=db,
            current_role=coord_role
        )
        assert False, "Institution Coordinator should NOT be permitted to record compliance overrides (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Compliance override blocked for Institution Coordinator (403: {e.detail[:55]}...)")

    # 2.5 Alert Resolution (Denied - 403 Forbidden)
    try:
        resolve_alert(
            alert_id=alert_id,
            req=AlertResolveRequest(resolution_notes="Attempted resolution"),
            db=db,
            current_role=coord_role
        )
        assert False, "Institution Coordinator should NOT be permitted to resolve alerts (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Alert resolution blocked for Institution Coordinator (403: {e.detail[:55]}...)")

    # 2.6 Demo Reset / Config (Denied - 403 Forbidden)
    try:
        reset_demo_workspace(db=db, current_role=coord_role)
        assert False, "Institution Coordinator should NOT be permitted to reset workspace (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Demo workspace reset blocked for Institution Coordinator (403: {e.detail[:55]}...)")

    # Section 3: Reviewer Tests
    print("\n>>> SECTION 3: REVIEWER PERMISSIONS <<<")
    rev_role = "Reviewer"

    # 3.1 Document Review (Allowed)
    res_rev = review_evidence_document(
        document_id=doc_id,
        req=ReviewDocumentRequest(review_status="VERIFIED_VALID", review_notes="Verified by independent reviewer", reviewed_by="Auditor Smith"),
        db=db,
        current_role=rev_role
    )
    assert res_rev.review_status == "VERIFIED_VALID"
    print("[PASS] Reviewer allowed to record document verification.")

    # 3.2 Case Creation (Denied - 403 Forbidden)
    try:
        create_case(req=new_case_req, db=db, current_role=rev_role)
        assert False, "Reviewer should NOT be permitted to create cases (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Case creation blocked for Reviewer (403: {e.detail[:55]}...)")

    # 3.3 Compliance Override (Denied - 403 Forbidden)
    try:
        override_compliance_result(
            result_id=comp_id,
            req=ComplianceOverrideRequest(new_status="COMPLIANT", override_reason="Reviewer override attempt"),
            db=db,
            current_role=rev_role
        )
        assert False, "Reviewer should NOT be permitted to record compliance overrides (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Compliance override blocked for Reviewer (403: {e.detail[:55]}...)")

    # 3.4 Alert Assignment (Denied - 403 Forbidden)
    try:
        assign_alert(
            alert_id=alert_id,
            req=AlertAssignRequest(assigned_to="Someone"),
            db=db,
            current_role=rev_role
        )
        assert False, "Reviewer should NOT be permitted to assign alerts (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Alert assignment blocked for Reviewer (403: {e.detail[:55]}...)")

    # Section 4: Compliance Officer Tests
    print("\n>>> SECTION 4: COMPLIANCE OFFICER PERMISSIONS <<<")
    comp_role = "Compliance Officer"

    # 4.1 Compliance Evaluation (Allowed)
    eval_res = evaluate_case_compliance(case_id=case_id, db=db, current_role=comp_role)
    assert len(eval_res) > 0
    print(f"[PASS] Compliance Officer allowed to evaluate normative checks ({len(eval_res)} rules).")

    # 4.2 Compliance Override (Allowed)
    override_res = override_compliance_result(
        result_id=comp_id,
        req=ComplianceOverrideRequest(new_status="COMPLIANT", override_reason="Human auditor verified municipal clearance physically.", overridden_by="Inspector Verma"),
        db=db,
        current_role=comp_role
    )
    assert override_res.status == "COMPLIANT"
    assert override_res.manual_override is True
    print("[PASS] Compliance Officer allowed to record compliance overrides.")

    # 4.3 Alert Resolution (Allowed)
    resolve_res = resolve_alert(
        alert_id=alert_id,
        req=AlertResolveRequest(resolution_notes="Remediation audited and verified compliant.", resolved_by="Inspector Verma"),
        db=db,
        current_role=comp_role
    )
    assert resolve_res.status == "RESOLVED"
    print("[PASS] Compliance Officer allowed to resolve alerts.")

    # 4.4 Escalation Scan (Allowed)
    scan_res = trigger_alert_scan(db=db, current_role=comp_role)
    assert scan_res.scanned_cases_count >= 0
    print("[PASS] Compliance Officer allowed to trigger escalation scans.")

    # 4.5 Case Creation (Denied - 403 Forbidden)
    try:
        create_case(req=new_case_req, db=db, current_role=comp_role)
        assert False, "Compliance Officer should NOT be permitted to create cases (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Case creation blocked for Compliance Officer (403: {e.detail[:55]}...)")

    # 4.6 Document Review (Denied - 403 Forbidden)
    try:
        review_evidence_document(
            document_id=doc_id,
            req=ReviewDocumentRequest(review_status="VERIFIED_VALID", review_notes="Compliance officer doc review"),
            db=db,
            current_role=comp_role
        )
        assert False, "Compliance Officer should NOT be permitted to verify documents (403 expected)"
    except HTTPException as e:
        assert e.status_code == 403
        print(f"[PASS] Document verification blocked for Compliance Officer (403: {e.detail[:55]}...)")

    # Section 5: Administrator Tests
    print("\n>>> SECTION 5: ADMINISTRATOR PERMISSIONS <<<")
    admin_role = "Administrator"

    # 5.1 Case Creation (Allowed)
    admin_case = create_case(
        req=CaseCreateRequest(
            institute_name="Administrator Apex Institute of Tech",
            institute_type="GOVERNMENT",
            state="Maharashtra",
            district="Mumbai",
            workflow_type="NEW_INSTITUTION",
            academic_period="2025-2026",
            priority="HIGH",
            internal_owner_name="System Admin",
            target_date="2026-08-31"
        ),
        db=db,
        current_role=admin_role
    )
    assert admin_case.id is not None
    print("[PASS] Administrator allowed to create cases.")

    # 5.2 Document Review (Allowed)
    admin_review = review_evidence_document(
        document_id=doc_id,
        req=ReviewDocumentRequest(review_status="VERIFIED_VALID", review_notes="Admin supervisor verification", reviewed_by="Admin"),
        db=db,
        current_role=admin_role
    )
    assert admin_review.review_status == "VERIFIED_VALID"
    print("[PASS] Administrator allowed to verify evidence documents.")

    # 5.3 Compliance Override (Allowed)
    admin_override = override_compliance_result(
        result_id=comp_id,
        req=ComplianceOverrideRequest(new_status="NOT_APPLICABLE", override_reason="Administrative waiver sanctioned.", overridden_by="Admin"),
        db=db,
        current_role=admin_role
    )
    assert admin_override.status == "NOT_APPLICABLE"
    print("[PASS] Administrator allowed to issue compliance overrides.")

    # 5.4 Demo Workspace Reset (Allowed)
    admin_reset = reset_demo_workspace(db=db, current_role=admin_role)
    assert admin_reset.success is True
    print("[PASS] Administrator allowed to reset demo workspace.")

    print("\n=====================================================================")
    print("   ALL ROLE PERMISSIONS TESTS (ALLOWED & DENIED) PASSED 100%!        ")
    print("=====================================================================")

if __name__ == "__main__":
    run_role_permissions_tests()
