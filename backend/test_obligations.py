import uuid
from datetime import date, datetime, timedelta, timezone

from backend.app.database import SessionLocal, Base, engine
from backend.app.models import (
    Workspace, Institution, ApprovalCase, EvidenceDocument, ComplianceObligation,
    EVCAppointment, Alert, NotificationOutbox, AuditEvent, WorkflowPathwayAssignment, CaseStageHistory, CommitteeReviewRecord
)
from backend.app.routers.workspace import get_or_create_default_workspace
from backend.app.routers.workflow_pathways import PathwayAssignmentRequest, assign_case_pathway, CommitteeReviewRequest, record_committee_review
from backend.app.routers.cases import CaseTransitionRequest, transition_case_stage
from fastapi import HTTPException

Base.metadata.create_all(bind=engine)
from backend.app.routers.obligations import (
    ObligationCreate, EvidenceSubmission, ObligationVerification,
    EVCAppointmentCreate, EVCAppointmentUpdate, create_obligation,
    submit_obligation_evidence, verify_obligation, scan_obligation_deadlines,
    create_evc_appointment, update_evc_appointment, operational_summary, scan_evc_deadlines
)

def run_obligation_tests():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    case = None
    obligation = None
    appointment = None
    committee_review = None
    workspace = None
    original_mode = None
    try:
        print("=== UNDERTAKINGS, EVC SCHEDULING & OPERATIONS TESTS ===")
        ws = get_or_create_default_workspace(db)
        workspace = ws
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

        # A configured pathway rejects out-of-sequence movement and incomplete document review.
        assigned_path = assign_case_pathway(
            case.id, PathwayAssignmentRequest(pathway_key="CUSTOM_APH", pathway_name="Test EVC + SAC/SHC", stages=["DRAFT", "INFO_COLLECTION", "DOCUMENT_REVIEW", "EVC", "SAC_SHC", "INTERNAL_REVIEW", "READY_FOR_SUBMISSION"], configured_by="Test Administrator"),
            db, "Administrator"
        )
        assert assigned_path["assigned"] is True
        try:
            transition_case_stage(case.id, CaseTransitionRequest(to_stage="COMPLIANCE_CHECKS",
                reason="Intentional out-of-sequence transition test.", changed_by="Test Administrator"),
                db, "Administrator")
            raise AssertionError("Configured pathway should require EVC before compliance checks")
        except HTTPException as exc:
            assert exc.status_code == 400
        try:
            transition_case_stage(case.id, CaseTransitionRequest(to_stage="EVC",
                reason="Attempt EVC before evidence review is complete.", changed_by="Test Administrator"),
                db, "Administrator")
            raise AssertionError("Evidence review gate should block an awaiting-review document")
        except HTTPException as exc:
            assert exc.status_code == 409
        document.review_status = "VERIFIED_VALID"
        document.reviewed_by = "Test Reviewer"
        db.commit()
        moved_to_evc = transition_case_stage(case.id, CaseTransitionRequest(to_stage="EVC",
            reason="Evidence review completed; schedule EVC.", changed_by="Test Administrator"),
            db, "Administrator")
        assert moved_to_evc.current_stage == "EVC"

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
        evc_first_scan = scan_evc_deadlines(db, "Administrator")
        evc_second_scan = scan_evc_deadlines(db, "Administrator")
        assert evc_first_scan["new_alerts_created"] >= 1
        assert evc_second_scan["new_alerts_created"] == 0, "Repeated EVC scans must not duplicate reminders"
        completed = update_evc_appointment(
            appointment_id, EVCAppointmentUpdate(status="COMPLETED",
            completion_notes="Visit completed; report awaits authorized review.", updated_by="Test Reviewer"),
            db, "Reviewer"
        )
        assert completed["status"] == "COMPLETED"
        assert completed["completed_at"] is not None
        moved_after_evc = transition_case_stage(case.id, CaseTransitionRequest(to_stage="SAC_SHC",
            reason="EVC visit completed and recorded; proceed to committee review.", changed_by="Test Administrator"),
            db, "Administrator")
        assert moved_after_evc.current_stage == "SAC_SHC"
        try:
            transition_case_stage(case.id, CaseTransitionRequest(to_stage="INTERNAL_REVIEW",
                reason="Intentional missing committee record test.", changed_by="Test Administrator"),
                db, "Administrator")
            raise AssertionError("SAC/SHC gate should require a recorded recommendation")
        except HTTPException as exc:
            assert exc.status_code == 409
        review_result = record_committee_review(
            case.id, CommitteeReviewRequest(committee_type="SAC", decision="RECOMMEND",
            notes="Committee recommends progression to internal review.", recorded_by="Test Committee"),
            db, "Reviewer"
        )
        committee_review = db.query(CommitteeReviewRecord).filter_by(id=review_result["id"]).first()
        assert committee_review is not None
        moved_after_committee = transition_case_stage(case.id, CaseTransitionRequest(to_stage="INTERNAL_REVIEW",
            reason="SAC recommendation recorded; proceed to internal review.", changed_by="Test Administrator"),
            db, "Administrator")
        assert moved_after_committee.current_stage == "INTERNAL_REVIEW"

        summary = operational_summary(db)
        assert "stage_pendency" in summary and "obligations_pending" in summary and "evc_scheduled" in summary
        audit_count = db.query(AuditEvent).filter(
            AuditEvent.workspace_id == ws.id,
            AuditEvent.entity_id.in_([obligation_id, appointment_id])
        ).count()
        assert audit_count >= 4, "Create, submission, verification and EVC changes must be audited"
        print("[PASSED] Obligation lifecycle, evidence validation, idempotent reminders, EVC scheduling/completion, metrics and audit trail.")
        db.commit()
    finally:
        if obligation:
            db.query(ComplianceObligation).filter_by(id=obligation.id).delete(synchronize_session=False)
        if appointment:
            db.query(EVCAppointment).filter_by(id=appointment.id).delete(synchronize_session=False)
        if case:
            db.query(NotificationOutbox).filter(NotificationOutbox.alert_id.in_(
                db.query(Alert.id).filter(Alert.case_id == case.id)
            )).delete(synchronize_session=False)
            db.query(Alert).filter(Alert.case_id == case.id).delete(synchronize_session=False)
            db.query(AuditEvent).filter(AuditEvent.entity_id.in_(
                [x for x in [case.id, obligation.id if obligation else None, appointment.id if appointment else None, committee_review.id if committee_review else None] if x]
            )).delete(synchronize_session=False)
            db.query(CommitteeReviewRecord).filter_by(case_id=case.id).delete(synchronize_session=False)
            db.query(WorkflowPathwayAssignment).filter_by(case_id=case.id).delete(synchronize_session=False)
            db.query(CaseStageHistory).filter_by(case_id=case.id).delete(synchronize_session=False)
            db.query(EvidenceDocument).filter(EvidenceDocument.case_id == case.id).delete(synchronize_session=False)
            inst_id = case.institution_id
            db.delete(case)
            inst = db.query(Institution).filter(Institution.id == inst_id).first()
            if inst:
                db.delete(inst)
        if workspace is not None and original_mode is not None:
            workspace.active_data_mode = original_mode
        db.commit()
        db.close()

if __name__ == "__main__":
    run_obligation_tests()
