"""Focused Phase 3 tests for CSV validation and commit payload validation.

Run from the repository root with:
    python -m unittest backend.test_phase_c_ingestion
"""
import sys
import os
import unittest
from unittest.mock import patch
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import create_engine, update
from sqlalchemy.orm import sessionmaker
from backend.app.database import Base
from backend.app.models import Workspace, Institution, ApprovalCase, IngestionPreview, IngestionBatch, CaseStageHistory, AuditEvent
from backend.app.routers.ingestion import (
    parse_and_validate_csv,
    IngestionRecord,
    _validate_record_values,
    commit_ingestion_batch,
    IngestionCommitRequest,
)
from fastapi import HTTPException


class IngestionValidationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_normalizes_headers_and_accepts_valid_row(self):
        csv_bytes = (
            b" AICTE_PERMANENT_ID , Institute_Name,case_reference,workflow_type,"
            b"target_date,internal_owner_name\n"
            b"ID-001,Example Institute,CASE-001,EXTENSION_OF_APPROVAL,"
            b"2026-11-15,Coordinator\n"
        )
        result = parse_and_validate_csv(csv_bytes, "valid.csv", "workspace-test", self.db)
        self.assertEqual(result.valid_count, 1)
        self.assertEqual(result.error_count, 0)
        self.assertTrue(result.can_commit)
        self.assertEqual(result.valid_records[0].aicte_permanent_id, "ID-001")

    def test_rejects_unsupported_workflow_and_blank_required_fields(self):
        csv_bytes = (
            b"aicte_permanent_id,institute_name,case_reference,workflow_type,"
            b"target_date,internal_owner_name\n"
            b",Example Institute,CASE-002,NOT_A_WORKFLOW,2026-11-15,\n"
        )
        result = parse_and_validate_csv(csv_bytes, "invalid.csv", "workspace-test", self.db)
        self.assertEqual(result.valid_count, 0)
        error_fields = {error.field for error in result.row_errors}
        self.assertIn("aicte_permanent_id", error_fields)
        self.assertIn("workflow_type", error_fields)
        self.assertIn("internal_owner_name", error_fields)

    def test_rejects_duplicate_normalized_headers(self):
        csv_bytes = (
            b"aicte_permanent_id, AICTE_PERMANENT_ID ,institute_name,"
            b"case_reference,workflow_type,target_date,internal_owner_name\n"
        )
        with self.assertRaises(HTTPException):
            parse_and_validate_csv(csv_bytes, "duplicate-headers.csv", "workspace-test", self.db)

    def test_rejects_non_csv_and_empty_upload(self):
        with self.assertRaises(HTTPException):
            parse_and_validate_csv(b"content", "data.txt", "workspace-test", self.db)
        with self.assertRaises(HTTPException):
            parse_and_validate_csv(b"", "empty.csv", "workspace-test", self.db)

    def test_malformed_rows_are_reported_not_committed(self):
        csv_bytes = (
            b"aicte_permanent_id,institute_name,case_reference,workflow_type,target_date,internal_owner_name\n"
            b"ID-004,Short Row,CASE-004,EXTENSION_OF_APPROVAL\n"
            b"ID-005,Extra Value,CASE-005,EXTENSION_OF_APPROVAL,2026-11-15,Coordinator,unexpected\n"
            b"ID-006,Bad Date,CASE-006,EXTENSION_OF_APPROVAL,not-a-date,Coordinator\n"
        )
        result = parse_and_validate_csv(csv_bytes, "malformed.csv", "workspace-test", self.db)
        self.assertEqual(result.valid_count, 0)
        self.assertFalse(result.can_commit)
        self.assertTrue(any(error.field == "row" for error in result.row_errors))
        self.assertTrue(any(error.field == "target_date" for error in result.row_errors))

    def test_duplicate_case_references_within_file_are_rejected(self):
        csv_bytes = (
            b"aicte_permanent_id,institute_name,case_reference,workflow_type,target_date,internal_owner_name\n"
            b"ID-007,Institute A,DUP-CASE,EXTENSION_OF_APPROVAL,2026-11-15,Coordinator\n"
            b"ID-008,Institute B,DUP-CASE,EXTENSION_OF_APPROVAL,2026-11-16,Coordinator\n"
        )
        result = parse_and_validate_csv(csv_bytes, "duplicates.csv", "workspace-test", self.db)
        self.assertEqual(result.valid_count, 1)
        self.assertTrue(any("Duplicate case reference" in error.error_message for error in result.row_errors))
        self.assertFalse(result.can_commit is False)

    def test_existing_imported_case_reference_is_rejected(self):
        ws = Workspace(name="Test Workspace", slug="default", active_data_mode="IMPORTED")
        self.db.add(ws)
        self.db.flush()
        inst = Institution(
            workspace_id=ws.id,
            legal_name="Existing Institute",
            institution_type="PRIVATE_SELF_FINANCED",
            state="Uttarakhand",
            district="Dehradun",
            data_mode="IMPORTED",
        )
        self.db.add(inst)
        self.db.flush()
        self.db.add(ApprovalCase(
            workspace_id=ws.id,
            institution_id=inst.id,
            case_reference="ALREADY-IMPORTED",
            workflow_type="EXTENSION_OF_APPROVAL",
            academic_period="2025-2026",
            current_stage="DOCUMENT_REVIEW",
            status="IN_PROGRESS",
            priority="MEDIUM",
            internal_owner_name="Coordinator",
            target_date=__import__("datetime").date(2026, 11, 15),
            data_mode="IMPORTED",
        ))
        self.db.commit()
        csv_bytes = (
            b"aicte_permanent_id,institute_name,case_reference,workflow_type,target_date,internal_owner_name\n"
            b"ID-009,New Institute,ALREADY-IMPORTED,EXTENSION_OF_APPROVAL,2026-11-15,Coordinator\n"
        )
        result = parse_and_validate_csv(csv_bytes, "existing.csv", ws.id, self.db)
        self.assertEqual(result.valid_count, 0)
        self.assertTrue(any("already exists in the IMPORTED workspace" in error.error_message for error in result.row_errors))

    def test_demo_reference_does_not_block_imported_mode_preview(self):
        ws = Workspace(name="Test Workspace", slug="default", active_data_mode="DEMO")
        self.db.add(ws)
        self.db.flush()
        inst = Institution(
            workspace_id=ws.id,
            legal_name="Demo Institute",
            institution_type="PRIVATE_SELF_FINANCED",
            state="Uttarakhand",
            district="Dehradun",
            data_mode="DEMO",
        )
        self.db.add(inst)
        self.db.flush()
        self.db.add(ApprovalCase(
            workspace_id=ws.id,
            institution_id=inst.id,
            case_reference="SHARED-REFERENCE",
            workflow_type="EXTENSION_OF_APPROVAL",
            academic_period="2025-2026",
            current_stage="DOCUMENT_REVIEW",
            status="IN_PROGRESS",
            priority="MEDIUM",
            internal_owner_name="Demo Coordinator",
            target_date=__import__("datetime").date(2026, 11, 15),
            data_mode="DEMO",
        ))
        self.db.commit()
        csv_bytes = (
            b"aicte_permanent_id,institute_name,case_reference,workflow_type,target_date,internal_owner_name\n"
            b"ID-010,Imported Institute,SHARED-REFERENCE,EXTENSION_OF_APPROVAL,2026-11-15,Coordinator\n"
        )
        result = parse_and_validate_csv(csv_bytes, "mode-isolation.csv", ws.id, self.db)
        self.assertEqual(result.valid_count, 1)
        self.assertEqual(result.error_count, 0)

    def test_preview_claim_avoids_naive_aware_datetime_python_comparison(self):
        ws = Workspace(name="Timezone Test Workspace", slug="timezone-test", active_data_mode="IMPORTED")
        self.db.add(ws)
        self.db.flush()
        now = datetime.now(timezone.utc)
        preview = IngestionPreview(
            workspace_id=ws.id,
            token_hash="a" * 64,
            original_filename="institutional_cases_template.csv",
            file_sha256="b" * 64,
            records_json=[],
            expires_at=now + timedelta(minutes=10),
        )
        self.db.add(preview)
        self.db.commit()

        # SQLite may reload DateTime(timezone=True) values as naive datetimes.
        # The database must evaluate this conditional update rather than SQLAlchemy
        # comparing the loaded timestamp with an aware Python datetime.
        result = self.db.execute(
            update(IngestionPreview)
            .where(
                IngestionPreview.id == preview.id,
                IngestionPreview.consumed_at.is_(None),
                IngestionPreview.expires_at > now,
            )
            .values(consumed_at=now)
            .execution_options(synchronize_session=False)
        )
        self.assertEqual(result.rowcount, 1)
        self.db.commit()


    def test_failed_commit_rolls_back_preview_claim_and_all_batch_writes(self):
        ws = Workspace(name="Rollback Workspace", slug="default", active_data_mode="DEMO")
        self.db.add(ws)
        self.db.flush()
        record = IngestionRecord(
            aicte_permanent_id="ID-ROLLBACK",
            institute_name="Rollback Institute",
            case_reference="CASE-ROLLBACK",
            workflow_type="EXTENSION_OF_APPROVAL",
            target_date="2026-11-15",
            internal_owner_name="Coordinator",
        )
        token = "rollback-preview-token"
        preview = IngestionPreview(
            workspace_id=ws.id,
            token_hash=__import__("hashlib").sha256(token.encode("utf-8")).hexdigest(),
            original_filename="rollback.csv",
            file_sha256="c" * 64,
            records_json=[record.dict()],
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        )
        self.db.add(preview)
        self.db.commit()

        request = IngestionCommitRequest(
            preview_token=token,
            original_filename="rollback.csv",
            file_sha256="c" * 64,
            records=[record],
        )

        # Simulate a database failure at the first write-stage flush, after
        # the preview has been claimed but before any batch records are stored.
        with patch.object(self.db, "flush", side_effect=RuntimeError("simulated database failure")):
            with self.assertRaisesRegex(RuntimeError, "simulated database failure"):
                commit_ingestion_batch(request, db=self.db, current_role="Administrator")

        self.db.expire_all()
        stored_preview = self.db.query(IngestionPreview).filter_by(id=preview.id).one()
        self.assertIsNone(stored_preview.consumed_at)
        self.assertEqual(self.db.query(IngestionBatch).count(), 0)
        self.assertEqual(self.db.query(ApprovalCase).filter_by(case_reference="CASE-ROLLBACK").count(), 0)
        self.assertEqual(self.db.query(CaseStageHistory).count(), 0)
        self.assertEqual(self.db.query(AuditEvent).count(), 0)

    def test_commit_record_validation_rejects_invalid_values(self):
        record = IngestionRecord(
            aicte_permanent_id="",
            institute_name="Example Institute",
            case_reference="CASE-003",
            workflow_type="NOT_A_WORKFLOW",
            target_date="not-a-date",
            internal_owner_name="Coordinator",
        )
        errors = _validate_record_values(record)
        self.assertTrue(any("aicte_permanent_id" in error for error in errors))
        self.assertTrue(any("workflow_type" in error for error in errors))
        self.assertTrue(any("target_date" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
