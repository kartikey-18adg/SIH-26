import sys
import os
import json
import csv
import io

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.database import SessionLocal
from backend.app.models import ApprovalCase
from backend.app.routers.reports import (
    get_case_review_pack, export_case_json, export_cases_csv,
    export_compliance_csv, MANDATORY_DISCLAIMER
)

def run_phase_h_tests():
    db = SessionLocal()
    try:
        print("=== AICLEAR PHASE H VERIFICATION TEST SUITE ===")
        
        # Test 1: Fetch Review Pack for an Institutional Case
        case = db.query(ApprovalCase).filter(ApprovalCase.case_reference == "AICTE-DEMO-014").first()
        if not case:
            case = db.query(ApprovalCase).first()
        assert case is not None, "No case found in database"
        
        print(f"[TEST 1] Generating Internal Review Pack for case {case.case_reference} ({case.institution.legal_name if case.institution else 'Institution'})")
        pack = get_case_review_pack(case_id=case.id, db=db)
        
        # Verify Mandatory Disclaimer
        print(f"  - Disclaimer Text: {pack.disclaimer[:60]}...")
        assert "NOT an official AICTE Approval Certificate" in pack.disclaimer
        assert "Approval Process Handbook 2024" in pack.disclaimer
        
        # Verify Executive Summary
        ex = pack.executive_summary
        print(f"  - Approval Readiness Score: {ex['approval_readiness_score']}%")
        print(f"  - Evidence Documents: {ex['verified_documents']}/{ex['total_documents']} Verified (Expired: {ex['expired_documents']})")
        print(f"  - Compliance Norms: {ex['compliant_count']}/{ex['total_compliance_rules']} Compliant (Deficiencies: {ex['deficiencies_count']})")
        assert "approval_readiness_score" in ex
        assert "total_compliance_rules" in ex
        
        # Verify Evidence Inventory
        print(f"  - Evidence Items Cataloged: {len(pack.evidence_inventory)}")
        if pack.evidence_inventory:
            sample_doc = pack.evidence_inventory[0]
            print(f"    * Sample Document: {sample_doc['original_filename']} ({sample_doc['category']}) - Status: {sample_doc['review_status']}")
            assert "sha256_short" in sample_doc
        
        # Verify Compliance Checklist
        print(f"  - Compliance Rules Cataloged: {len(pack.compliance_checklist)}")
        assert len(pack.compliance_checklist) > 0
        sample_rule = pack.compliance_checklist[0]
        print(f"    * Sample Rule: {sample_rule['rule_key']} - Citation: {sample_rule['citation']}")
        assert "citation" in sample_rule
        
        # Verify Reviewer Sign-Off Blocks
        sign_offs = pack.sign_off_blocks
        print(f"  - Reviewer Sign-Off Blocks:")
        print(f"    * Coordinator: {sign_offs['case_coordinator']['name']} ({sign_offs['case_coordinator']['title']})")
        print(f"    * Compliance Officer: {sign_offs['compliance_officer']['title']}")
        print(f"    * Head of Institution: {sign_offs['head_of_institution']['title']}")
        assert "case_coordinator" in sign_offs
        assert "head_of_institution" in sign_offs
        print("[TEST 1 PASSED] Review Pack generated with institutional structure and regulatory disclaimers.\n")

        # Test 2: JSON Export
        print(f"[TEST 2] Exporting Case Dossier as JSON")
        json_resp = export_case_json(case_id=case.id, db=db)
        assert json_resp.media_type == "application/json"
        assert "attachment; filename=" in json_resp.headers["Content-Disposition"]
        
        exported_obj = json.loads(json_resp.body.decode("utf-8"))
        assert exported_obj["case_reference"] == case.case_reference
        assert "disclaimer" in exported_obj
        assert "executive_summary" in exported_obj
        print(f"  - Exported JSON Payload Size: {len(json_resp.body)} bytes")
        print(f"  - Content-Disposition: {json_resp.headers['Content-Disposition']}")
        print("[TEST 2 PASSED] Full case history JSON export validated.\n")

        # Test 3: Cases CSV Export
        print(f"[TEST 3] Exporting Active Cases as CSV")
        cases_csv_resp = export_cases_csv(db=db)
        assert cases_csv_resp.media_type == "text/csv"
        assert "attachment; filename=" in cases_csv_resp.headers["Content-Disposition"]
        
        csv_text = cases_csv_resp.body.decode("utf-8")
        csv_lines = [line for line in csv_text.splitlines() if line.strip()]
        
        # Verify Disclaimer Header in Row 1
        print(f"  - CSV Row 1 (Disclaimer): {csv_lines[0][:70]}...")
        assert "# DISCLAIMER:" in csv_lines[0]
        assert "NOT an official AICTE Approval Certificate" in csv_lines[0]
        
        # Verify Column Headers in Row 2
        reader = csv.reader(io.StringIO("\n".join(csv_lines[1:])))
        header_row = next(reader)
        print(f"  - CSV Columns ({len(header_row)}): {', '.join(header_row[:6])}...")
        assert "Case Reference" in header_row
        assert "Institution Name" in header_row
        assert "Current Stage" in header_row
        
        data_rows = list(reader)
        print(f"  - Cases Exported: {len(data_rows)} rows")
        assert len(data_rows) > 0
        print("[TEST 3 PASSED] Cases CSV export verified with mandatory legal disclaimer.\n")

        # Test 4: Compliance CSV Export
        print(f"[TEST 4] Exporting Compliance Findings as CSV")
        comp_csv_resp = export_compliance_csv(db=db)
        assert comp_csv_resp.media_type == "text/csv"
        assert "attachment; filename=" in comp_csv_resp.headers["Content-Disposition"]
        
        comp_csv_text = comp_csv_resp.body.decode("utf-8")
        comp_csv_lines = [line for line in comp_csv_text.splitlines() if line.strip()]
        
        # Verify Disclaimer Header
        assert "# DISCLAIMER:" in comp_csv_lines[0]
        
        comp_reader = csv.reader(io.StringIO("\n".join(comp_csv_lines[1:])))
        comp_headers = next(comp_reader)
        print(f"  - Compliance CSV Columns ({len(comp_headers)}): {', '.join(comp_headers[:6])}...")
        assert "Rule Key" in comp_headers
        assert "Citation" in comp_headers
        assert "Manual Override" in comp_headers
        
        comp_data_rows = list(comp_reader)
        print(f"  - Compliance Findings Exported: {len(comp_data_rows)} rows")
        assert len(comp_data_rows) > 0
        print("[TEST 4 PASSED] Compliance CSV export verified with citations and audit details.\n")

        print("=== ALL PHASE H VERIFICATION TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_phase_h_tests()
