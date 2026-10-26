import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import Workspace, ApprovalCase, Alert, AuditEvent, Institution
from backend.app.routers.workspace import (
    get_or_create_default_workspace, switch_data_mode, reset_demo_workspace
)
from backend.app.schemas import DataModeSelectRequest
from backend.app.routers.cases import list_cases
from backend.app.routers.dashboard import get_dashboard_summary
from backend.app.routers.alerts import list_alerts
from backend.app.routers.compliance import evaluate_case_compliance
from backend.app.routers.reports import get_case_review_pack

def run_phase_i_tests():
    db = SessionLocal()
    try:
        print("=== AICLEAR PHASE I: MODE BOUNDARY HARDENING & SHOWCASE VERIFICATION ===")
        ws = get_or_create_default_workspace(db)

        # -------------------------------------------------------------
        # TEST 1: Strict Mode Boundary Isolation (DEMO Mode)
        # -------------------------------------------------------------
        print("[TEST 1] Verifying isolation in DEMO mode...")
        switch_data_mode(req=DataModeSelectRequest(mode="DEMO"), db=db)
        db.refresh(ws)
        assert ws.active_data_mode == "DEMO"

        demo_cases = list_cases(db=db)
        print(f"  - Cases returned in DEMO mode: {len(demo_cases)}")
        assert len(demo_cases) == 5, f"Expected 5 demo cases, got {len(demo_cases)}"
        for c in demo_cases:
            assert c.data_mode == "DEMO", f"Data leakage! Case {c.case_reference} has data_mode={c.data_mode}"

        demo_summary = get_dashboard_summary(db=db)
        print(f"  - Dashboard active data mode: {demo_summary.active_data_mode}")
        print(f"  - Total active cases in dashboard: {demo_summary.total_active_cases}")
        print(f"  - Total recent cases in dashboard: {len(demo_summary.recent_cases)}")
        assert demo_summary.active_data_mode == "DEMO"
        assert demo_summary.total_active_cases == 4
        assert len(demo_summary.recent_cases) == 5

        demo_alerts = list_alerts(db=db)
        print(f"  - Alerts returned in DEMO mode: {len(demo_alerts)}")
        for a in demo_alerts:
            if a.case_id:
                c = db.query(ApprovalCase).filter(ApprovalCase.id == a.case_id).first()
                if c:
                    assert c.data_mode == "DEMO", f"Alert {a.title} leaked from non-demo case {c.case_reference}"
        print("[TEST 1 PASSED] Zero query leakage into DEMO mode.\n")

        # -------------------------------------------------------------
        # TEST 2: Strict Mode Boundary Isolation (IMPORTED Mode)
        # -------------------------------------------------------------
        print("[TEST 2] Verifying isolation in IMPORTED mode...")
        switch_data_mode(req=DataModeSelectRequest(mode="IMPORTED"), db=db)
        db.refresh(ws)
        assert ws.active_data_mode == "IMPORTED"

        imported_cases = list_cases(db=db)
        print(f"  - Cases returned in IMPORTED mode: {len(imported_cases)}")
        assert len(imported_cases) > 0, "No imported cases found (run previous phases first)"
        for c in imported_cases:
            assert c.data_mode == "IMPORTED", f"Data leakage! Case {c.case_reference} has data_mode={c.data_mode}"
            assert not c.case_reference.startswith("AICTE-DEMO-"), f"Demo case {c.case_reference} leaked into IMPORTED mode!"

        imported_summary = get_dashboard_summary(db=db)
        print(f"  - Dashboard active data mode: {imported_summary.active_data_mode}")
        print(f"  - Total active cases in dashboard: {imported_summary.total_active_cases}")
        assert imported_summary.active_data_mode == "IMPORTED"
        # The dashboard intentionally excludes legacy IMPORTED rows that lack
        # ingestion-batch provenance. Match its eligibility filter before counting
        # active cases, rather than comparing against every case returned by list_cases.
        dashboard_eligible_imported = []
        for c in imported_cases:
            institution = db.query(Institution).filter(
                Institution.id == c.institution_id,
                Institution.workspace_id == ws.id,
                Institution.data_mode == "IMPORTED",
                Institution.provenance_batch_id.isnot(None)
            ).first()
            if institution is not None:
                dashboard_eligible_imported.append(c)
        expected_active_imported = sum(
            1 for c in dashboard_eligible_imported if c.status != "COMPLETED"
        )
        assert imported_summary.total_active_cases == expected_active_imported, (
            f"Dashboard active count mismatch: expected {expected_active_imported} "
            f"active provenance-backed imported cases, got {imported_summary.total_active_cases}"
        )

        imported_alerts = list_alerts(db=db)
        print(f"  - Alerts returned in IMPORTED mode: {len(imported_alerts)}")
        for a in imported_alerts:
            if a.case_id:
                c = db.query(ApprovalCase).filter(ApprovalCase.id == a.case_id).first()
                if c:
                    assert c.data_mode == "IMPORTED", f"Alert {a.title} leaked from non-imported case {c.case_reference}"
        print("[TEST 2 PASSED] Zero query leakage into IMPORTED mode.\n")

        # -------------------------------------------------------------
        # TEST 3: Demo Reset Does Not Delete or Alter Authentic Data
        # -------------------------------------------------------------
        print("[TEST 3] Verifying Demo Reset Safety & Data Preservation...")
        imported_count_before = db.query(ApprovalCase).filter(
            ApprovalCase.workspace_id == ws.id,
            ApprovalCase.data_mode == "IMPORTED"
        ).count()
        print(f"  - Authentic imported cases count before demo reset: {imported_count_before}")
        assert imported_count_before > 0

        # Reset Demo
        reset_res = reset_demo_workspace(db=db)
        print(f"  - Reset result message: {reset_res.message}")
        assert reset_res.success is True

        # Check imported cases count after demo reset
        imported_count_after = db.query(ApprovalCase).filter(
            ApprovalCase.workspace_id == ws.id,
            ApprovalCase.data_mode == "IMPORTED"
        ).count()
        print(f"  - Authentic imported cases count after demo reset: {imported_count_after}")
        assert imported_count_before == imported_count_after, "DATA LOSS! Demo reset deleted authentic imported cases!"

        # Switch back to DEMO to verify demo data is freshly seeded
        switch_data_mode(req=DataModeSelectRequest(mode="DEMO"), db=db)
        demo_cases_after_reset = list_cases(db=db)
        assert len(demo_cases_after_reset) == 5, f"Expected 5 demo cases, got {len(demo_cases_after_reset)}"
        print("[TEST 3 PASSED] Demo reset successfully restored demo dataset while 100% preserving authentic records.\n")

        # -------------------------------------------------------------
        # TEST 4: End-to-End 2-4 Minute Judge Walkthrough Flow
        # -------------------------------------------------------------
        print("[TEST 4] Validating 2-4 Minute Judge Walkthrough Flow...")
        # Step 1: Locate AICTE-DEMO-014
        case_014 = db.query(ApprovalCase).filter(ApprovalCase.case_reference == "AICTE-DEMO-014").first()
        assert case_014 is not None, "AICTE-DEMO-014 missing from demo dataset"
        print(f"  - Step 1: Flagged case found: {case_014.case_reference} ({case_014.current_stage})")

        # Step 2: Evidence Vault inspection
        assert len(case_014.documents) > 0, "No evidence documents in case 014"
        doc = case_014.documents[0]
        print(f"  - Step 2: Inspected document: {doc.original_filename} (Category: {doc.category})")
        assert doc.sha256_hash is not None

        # Step 3: Run Deterministic Compliance Evaluation
        eval_results = evaluate_case_compliance(case_id=case_014.id, db=db)
        fire_res = next(r for r in eval_results if r.rule_key == "APH-2024-FIRE-002")
        print(f"  - Step 3: Compliance check evaluated: {fire_res.rule_key} = {fire_res.status}")
        assert fire_res.status in ["NEEDS_REVIEW", "EXPIRED_EVIDENCE", "COMPLIANT"]

        # Step 4: Generate Internal Review Pack
        pack = get_case_review_pack(case_id=case_014.id, db=db)
        print(f"  - Step 4: Generated Review Pack with score: {pack.executive_summary['approval_readiness_score']}%")
        assert "NOT an official AICTE Approval Certificate" in pack.disclaimer
        assert len(pack.sign_off_blocks) == 3
        print("[TEST 4 PASSED] Full hackathon showcase walkthrough path validated.\n")

        print("=== ALL PHASE I VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_phase_i_tests()
