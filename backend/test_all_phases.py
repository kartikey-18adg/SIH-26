import sys
import os
import io

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import ApprovalCase, EvidenceDocument, AuditEvent, ComplianceResult
from backend.app.routers.workspace import get_or_create_default_workspace
from backend.app.schemas import DataModeSelectRequest
from backend.app.routers.dashboard import get_dashboard_summary
from backend.app.routers.cases import list_cases, get_case_detail, transition_case_stage, CaseTransitionRequest
from backend.app.routers.documents import store_evidence_document, review_evidence_document, ReviewDocumentRequest
from backend.app.routers.compliance import evaluate_case_compliance, override_compliance_result, ComplianceOverrideRequest

def test_full_flow():
    db = SessionLocal()
    try:
        print("=== RUNNING FULL END-TO-END SUITE (PHASES B -> F) ===")
        
        # 1. Workspace & Dashboard
        ws = get_or_create_default_workspace(db)
        print(f"[OK] Workspace loaded: ID={ws.id}, Mode={ws.active_data_mode}")
        
        summary = get_dashboard_summary(db=db)
        print(f"[OK] Dashboard summary: Active Cases={summary.total_active_cases}, Mode={summary.active_data_mode}")
        
        # 2. Case State Machine
        cases = list_cases(db=db)
        assert len(cases) > 0, "No cases found in database"
        test_case = cases[0]
        print(f"[OK] Testing case {test_case.case_reference} (Stage: {test_case.current_stage})")
        
        # 3. Evidence Vault Storage
        dummy_content = b"%PDF-1.4 sample AICTE fire compliance evidence document content"
        doc = store_evidence_document(
            case_id=test_case.id,
            content=dummy_content,
            filename="fire_noc_2025.pdf",
            mime_type="application/pdf",
            category="FIRE_SAFETY_NOC",
            document_date="2026-01-10",
            expiry_date="2027-06-30",
            uploaded_by="Institutional Safety Officer",
            db=db
        )
        print(f"[OK] Stored Evidence Document: ID={doc.id}, Hash={doc.sha256_hash[:12]}...")
        assert doc.review_status == "AWAITING_REVIEW"
        
        # 4. Human Verification of Evidence
        reviewed = review_evidence_document(
            document_id=doc.id,
            req=ReviewDocumentRequest(
                review_status="VERIFIED_VALID",
                review_notes="Verified against state fire safety online portal record.",
                reviewed_by="Compliance Officer"
            ),
            db=db
        )
        assert reviewed.review_status == "VERIFIED_VALID"
        print(f"[OK] Verified Evidence Document: Status={reviewed.review_status}")
        
        # 5. Deterministic Compliance Evaluation
        results = evaluate_case_compliance(case_id=test_case.id, db=db)
        print(f"[OK] Compliance evaluated: {len(results)} rules checked.")
        fire_res = next(r for r in results if r.rule_key == "APH-2024-FIRE-002")
        print(f"     Fire NOC check: {fire_res.status} ({fire_res.explanation})")
        assert fire_res.status == "COMPLIANT"
        
        print("\nALL SYSTEM COMPONENTS OPERATING ACCORDING TO SPECIFICATION!")
    finally:
        db.close()

if __name__ == "__main__":
    test_full_flow()
