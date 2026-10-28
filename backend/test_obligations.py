import uuid
from datetime import date, datetime, timedelta, timezone

from backend.app.database import SessionLocal
from backend.app.models import (
    Workspace, Institution, ApprovalCase, EvidenceDocument, ComplianceObligation,
    EVCAppointment, Alert, NotificationOutbox, AuditEvent
)
from backend.app.routers.workspace import get_or_create_default_workspace
from backend.app.routers.obligations import (
    ObligationCreate, EvidenceSubmission, ObligationVerification,
    EVCAppointmentCreate, EVCAppointmentUpdate, create_obligation,
    submit_obligation_evidence, verify_obligation, scan_obligation_deadlines,
    create_evc_appointment, update_evc_appointment, operational_summary
)

def run_obligation_tests():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    case = None
    obligation = None
    appointment = None
    try:
        print("=== UNDERTAKINGS, EVC SCHEDULING & OPERATIONS TESTS ===")
        ws = get_or_create_default_workspace(db)
        original_mode = ws.active_data_mode
        ws.active_data_mode = "DEMO"
        institution = Institution(
            workspace_id=ws.id, legal_name=f"Test Institute {suffix}",
            institution_type="PRIVATE_SELF_FINANCED", state="Test State", district="Test District",
            data_mode="DEMO"
        )
        db.add(institution)
        db.flush()
        case = ApprovalCase(
            workspace_id=ws.id, institution_id=institution.id,
            case_reference=f"AICTE-TEST-{suffix}", workflow_type="EXTENSION_OF_APPROVAL",
            academic_period="2026-2027", current_stage="DOCUMENT_REVIEW", status="IN_PROGRESS",
            priority="MEDIUM", internal_owner_name="Test Coordinator", target_date=date.today() + timedelta(days=30),
            data_mode="DEMO", created_by="Test Suite"
        )
        db.add(case)
        db.flush()
        document = EvidenceDocument(
            case_id=case.id, category="AFFIDAVIT_UNDERTAKING", original_filename="test-evidence.pdf",
            storage_key=f"test/{suffix}.pdf", mime_type="application/pdf", size_bytes=10,
            sha256_hash="a" * 64, uploaded_by="Test Coordinator"
        )
        db.add(document)
        db.commit()
        db.refresh(case)
        db.refresh(document)

        # Create a due-today obligation and prove the scanner is idempotent.
        obligation_data = ObligationCreate(
            case_id=case.id, title="Submit signed undertaking",
            description="Submit the signed undertaking and supporting evidence.",
            due_date=date.today(), reminder_days=14, escalation_days=0,
            assigned_to="Test Coordinator", created_by="Test Administrator"
        )
        obligation_result = create_obligation(obligation_data, db, "Administrator")
        obligation_id = obligation_result["id"]
        obligation = db.query(ComplianceObligation).filter_by(id=obligation_id).first()
        assert obligation and obligation.status == "PENDING"

        first_scan = scan_obligation_deadlines(db, "Administrator")
        second_scan = scan_obligation_deadlines(db, "Administrator")
        assert first_scan["new_alerts_created"] >= 1
        assert second_scan["new_alerts_created"] == 0, "Repeated scans must not duplicate obligation alerts"
        assert db.query(NotificationOutbox).filter(NotificationOutbox.alert_id.in_(
            db.query(Alert.id).filter(Alert.alert_key.like(f"ALERT-OBLIGATION-%-{obligation_id[:8]}"))
        )).count() >= 1

        submitted = submit_obligation_evidence(
            obligation_id, EvidenceSubmission(evidence_document_id=document.id,
            notes="Signed undertaking attached for verification.", submitted_by="Test Coordinator"),
            db, "Institution Coordinator"
        )
        assert submitted["status"] == "SUBMITTED"
        verified = verify_obligation(
            obligation_id, ObligationVerification(decision="VERIFIED",
            notes="Document checked and accepted by authorized reviewer.", verified_by="Test Reviewer"),
            db, "Reviewer"
        )
        assert verified["status"] == "VERIFIED"
        assert verified["verified_by"] == "Test Reviewer"

        appointment_result = create_evc_appointment(
            EVCAppointmentCreate(case_id=case.id, committee_name="Test EVC Committee",
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=2),
            location_or_mode="On-site", scheduled_by="Test Reviewer"),
            db, "Reviewer"
        )
        appointment_id = appointment_result["id"]
        appointment = db.query(EVCAppointment).filter_by(id=appointment_id).first()
        assert appointment and appointment.status == "SCHEDULED"
        completed = update_evc_appointment(
            appointment_id, EVCAppointmentUpdate(status="COMPLETED",
            completion_notes="Visit completed; report awaits authorized review.", updated_by="Test Reviewer"),
            db, "Reviewer"
        )
        assert completed["status"] == "COMPLETED"
        assert completed["completed_at"] is not None

        summary = operational_summary(db)
        assert "stage_pendency" in summary and "obligations_pending" in summary and "evc_scheduled" in summary
        audit_count = db.query(AuditEvent).filter(
            AuditEvent.workspace_id == ws.id,
            AuditEvent.entity_id.in_([obligation_id, appointment_id])
        ).count()
        assert audit_count >= 4, "Create, submission, verification and EVC changes must be audited"
        print("[PASSED] Obligation lifecycle, evidence validation, idempotent reminders, EVC scheduling/completion, metrics and audit trail.")
        ws.active_data_mode = original_mode
        db.commit()
    finally:
        if obligation:
            db.query(Alert).filter(Alert.case_id == obligation.case_id,
                Alert.alert_key.like(f"ALERT-OBLIGATION-%-{obligation.id[:8]}")).delete(synchronize_session=False)
            db.query(ComplianceObligation).filter_by(id=obligation.id).delete(synchronize_session=False)
        if appointment:
            db.query(EVCAppointment).filter_by(id=appointment.id).delete(synchronize_session=False)
        if case:
            db.query(NotificationOutbox).filter(NotificationOutbox.alert_id.in_(
                db.query(Alert.id).filter(Alert.case_id == case.id)
            )).delete(synchronize_session=False)
            db.query(Alert).filter(Alert.case_id == case.id).delete(synchronize_session=False)
            db.query(EvidenceDocument).filter(EvidenceDocument.case_id == case.id).delete(synchronize_session=False)
            db.query(AuditEvent).filter(AuditEvent.entity_id == case.id).delete(synchronize_session=False)
            db.delete(case)
            inst = db.query(Institution).filter(Institution.id == case.institution_id).first()
            if inst:
                db.delete(inst)
        db.commit()
        db.close()

if __name__ == "__main__":
    run_obligation_tests()
