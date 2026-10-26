"""Focused Phase 3 tests for CSV validation and commit payload validation.

Run from the repository root with:
    python -m unittest backend.test_phase_c_ingestion
"""
import sys
import os
import unittest

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app.database import Base
from backend.app.routers.ingestion import (
    parse_and_validate_csv,
    IngestionRecord,
    _validate_record_values,
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
