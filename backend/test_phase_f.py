import sys
import os
from datetime import date, timedelta

# Add backend to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import (
    Workspace, ApprovalCase, ComplianceRule, ComplianceResult,
    EvidenceDocument, Alert, AuditEvent
)
from backend.app.routers.compliance import (
    list_compliance_rules, evaluate_case_compliance, override_compliance_result,
    ComplianceOverrideRequest
)

def run_tests():
    db = SessionLocal()
    try:
        print("=== AICLEAR PHASE F VERIFICATION TEST SUITE ===")
        
        # Test 1: Rule Catalog Listing & Citations
        rules = list_compliance_rules(db=db)
        print(f"[TEST 1] Loaded {len(rules)} compliance rules.")
        assert len(rules) >= 5, f"Expected at least 5 compliance rules, found {len(rules)}"
        
        official_rules = [r for r in rules if r.rule_source_type == "OFFICIAL_APH_2024_27"]
        demo_rules = [r for r in rules if r.rule_source_type == "ILLUSTRATIVE_DEMO"]
        
        print(f"  - Official APH 2024-27 Rules: {len(official_rules)}")
        print(f"  - Illustrative Demo Rules: {len(demo_rules)}")
        assert len(official_rules) >= 4, "Missing official APH 2024-27 rules"
        assert len(demo_rules) >= 1, "Missing illustrative demo rules"
        
        # Verify citations
        fire_rule = next(r for r in rules if r.rule_key == "APH-2024-FIRE-002")
        print(f"  - Fire NOC Rule Citation: {fire_rule.official_source_title} ({fire_rule.official_section_ref})")
        assert "Appendix 16" in (fire_rule.official_section_ref or ""), "Fire NOC missing Appendix 16 citation"
        print("[TEST 1 PASSED] Rule catalog codification validated with authentic citations.\n")

        # Test 2: Deterministic Evaluation on Expired Evidence (AICTE-DEMO-014)
        case_014 = db.query(ApprovalCase).filter(ApprovalCase.case_reference == "AICTE-DEMO-014").first()
        assert case_014 is not None, "AICTE-DEMO-014 not found in database"
        
        # Reset any leftover manual overrides for clean idempotent test run
        db.query(ComplianceResult).filter(ComplianceResult.case_id == case_014.id).delete()
        db.commit()
        
        eval_results = evaluate_case_compliance(case_id=case_014.id, db=db)
        print(f"[TEST 2] Evaluated {len(eval_results)} compliance checks for case {case_014.case_reference}.")
        
        fire_res = next(r for r in eval_results if r.rule_key == "APH-2024-FIRE-002")
        print(f"  - Fire NOC Status: {fire_res.status}")
        print(f"  - Explanation: {fire_res.explanation}")
        print(f"  - Recommended Action: {fire_res.recommended_action}")
        assert fire_res.status in ["EXPIRED_EVIDENCE", "NEEDS_REVIEW"], f"Expected EXPIRED_EVIDENCE or NEEDS_REVIEW, got {fire_res.status}"
        assert fire_res.requires_human_review is True
        print("[TEST 2 PASSED] Expired certificate correctly detected deterministically.\n")

        # Test 3: Manual Override with Traceable Audit Records
        override_req = ComplianceOverrideRequest(
            new_status="COMPLIANT",
            override_reason="Physical municipal fire NOC copy verified with Municipal Fire Division Chief Receipt #58204",
            overridden_by="Lead Compliance Inspector"
        )
        overridden = override_compliance_result(
            result_id=fire_res.id,
            req=override_req,
            db=db
        )
        print(f"[TEST 3] Recorded manual override for result ID {fire_res.id}.")
        print(f"  - New Status: {overridden.status}")
        print(f"  - Original Automated Status: {overridden.original_status}")
        print(f"  - Manual Override Flag: {overridden.manual_override}")
        print(f"  - Override Reason: {overridden.override_reason}")
        print(f"  - Overridden By: {overridden.overridden_by}")
        
        assert overridden.status == "COMPLIANT"
        assert overridden.manual_override is True
        assert overridden.original_status in ["EXPIRED_EVIDENCE", "NEEDS_REVIEW"]
        assert overridden.override_reason == override_req.override_reason
        
        # Verify Audit Log entry
        audit_event = db.query(AuditEvent).filter(
            AuditEvent.entity_id == fire_res.id,
            AuditEvent.action == "COMPLIANCE_OVERRIDE_RECORDED"
        ).order_by(AuditEvent.created_at.desc()).first()
        
        assert audit_event is not None, "No audit event created for compliance override"
        print(f"  - Audit Event Action: {audit_event.action}")
        print(f"  - Audit Event Actor: {audit_event.actor_name} ({audit_event.actor_role})")
        print(f"  - Audit Event Details: {audit_event.details_json}")
        assert audit_event.details_json["original_automated_status"] == overridden.original_status
        print("[TEST 3 PASSED] Manual override preserves automated finding and records permanent audit entry.\n")

        # Test 4: Re-evaluation Preserves Overridden Results
        re_eval_results = evaluate_case_compliance(case_id=case_014.id, db=db)
        re_fire_res = next(r for r in re_eval_results if r.rule_key == "APH-2024-FIRE-002")
        assert re_fire_res.status == "COMPLIANT", "Re-evaluation should preserve manual override"
        assert re_fire_res.manual_override is True
        print("[TEST 4 PASSED] Re-evaluation safely preserves manually overridden findings.\n")

        # Test 5: Date Ordering Anomaly Detection
        # Create an anomaly document on a test case
        anomaly_doc = db.query(EvidenceDocument).filter(
            EvidenceDocument.case_id == case_014.id,
            EvidenceDocument.category == "FIRE_SAFETY_NOC"
        ).order_by(EvidenceDocument.created_at.desc()).first()
        if anomaly_doc:
            orig_doc_date = anomaly_doc.document_date
            orig_exp_date = anomaly_doc.expiry_date
            
            # Intentionally invert dates: Issue date (2026-12-01) > Expiry date (2025-01-01)
            anomaly_doc.document_date = date(2026, 12, 1)
            anomaly_doc.expiry_date = date(2025, 1, 1)
            # Reset override to test evaluation engine directly
            raw_fire_res = db.query(ComplianceResult).filter(ComplianceResult.id == fire_res.id).first()
            raw_fire_res.manual_override = False
            db.commit()

            anomaly_eval = evaluate_case_compliance(case_id=case_014.id, db=db)
            anomaly_fire_res = next(r for r in anomaly_eval if r.rule_key == "APH-2024-FIRE-002")
            print(f"[TEST 5] Date ordering anomaly evaluation:")
            print(f"  - Status: {anomaly_fire_res.status}")
            print(f"  - Explanation: {anomaly_fire_res.explanation}")
            assert "Date Ordering Anomaly" in anomaly_fire_res.explanation, "Date ordering anomaly was not detected"
            print("[TEST 5 PASSED] Date ordering anomaly successfully detected.\n")

            # Restore original dates and re-apply override
            anomaly_doc.document_date = orig_doc_date
            anomaly_doc.expiry_date = orig_exp_date
            raw_fire_res.manual_override = True
            raw_fire_res.status = "COMPLIANT"
            db.commit()

        print("=== ALL PHASE F VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
