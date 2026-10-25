import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.app.ai_compliance import generate_compliance_insights


class AiComplianceInsightTests(unittest.TestCase):
    def setUp(self):
        self.case = SimpleNamespace(
            case_reference="AICTE-DEMO-TEST",
            workflow_type="EXTENSION_OF_APPROVAL",
            academic_period="2026-2027",
            current_stage="COMPLIANCE_CHECKS",
        )
        self.rule = SimpleNamespace(
            rule_key="APH-2024-FIRE-002",
            title="Fire Safety NOC",
            severity="CRITICAL",
            rule_source_type="OFFICIAL_APH_2024_27",
            official_source_title="AICTE Approval Process Handbook 2024-27",
            official_section_ref="Appendix 16",
        )
        self.result = SimpleNamespace(
            rule=self.rule,
            status="MISSING_EVIDENCE",
            rule_version_snapshot="2024-27-v1",
            explanation="Fire safety evidence is missing.",
            recommended_action="Upload a valid Fire Safety NOC.",
            requires_human_review=True,
            manual_override=False,
        )

    def test_no_api_key_uses_transparent_rule_based_fallback(self):
        with patch.dict(os.environ, {}, clear=True):
            result = generate_compliance_insights(self.case, [self.result])
        self.assertEqual(result["analysis_mode"], "RULE_BASED_FALLBACK")
        self.assertIn("1 of 1", result["summary"])
        self.assertEqual(result["priority_actions"][0]["status"], "MISSING_EVIDENCE")
        self.assertEqual(result["priority_actions"][0]["section"], "Appendix 16")
        self.assertTrue(result["uncertainty_notes"])

    def test_fallback_does_not_change_source_result(self):
        original_status = self.result.status
        with patch.dict(os.environ, {}, clear=True):
            generate_compliance_insights(self.case, [self.result])
        self.assertEqual(self.result.status, original_status)


if __name__ == "__main__":
    unittest.main()
