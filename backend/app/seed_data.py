from datetime import datetime, date, timedelta, timezone
from sqlalchemy.orm import Session
from .models import (
    Workspace, SourceRegistry, Institution, ApprovalCase, 
    CaseStageHistory, EvidenceDocument, DocumentVersion, ComplianceRule, 
    ComplianceResult, Task, Alert, NotificationOutbox, AuditEvent
)

def utc_now():
    return datetime.now(timezone.utc)

def seed_source_registry(db: Session, workspace_id: str):
    existing = db.query(SourceRegistry).filter(SourceRegistry.workspace_id == workspace_id).first()
    if existing:
        return

    sources = [
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="AICTE_APH_2024_27",
            source_name="AICTE Approval Process Handbook (APH) 2024-2027",
            source_type="OFFICIAL_DOCUMENT",
            canonical_url="https://www.aicte-india.org/bureaus/approval/ap-handbook",
            verification_status="VERIFIED_AVAILABLE",
            last_verified_at=utc_now(),
            metadata_json={
                "edition": "2024-2027 Triennial",
                "authority": "All India Council for Technical Education",
                "format": "Official PDF (Chapters I-X, Appendices 1-16)"
            }
        ),
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="AICTE_APPROVED_DIR",
            source_name="AICTE Approved Institutions Public Directory",
            source_type="PUBLIC_DATASET",
            canonical_url="https://facilities.aicte-india.org/dashboard/",
            verification_status="MANUAL_IMPORT_ONLY",
            last_verified_at=utc_now(),
            metadata_json={
                "access_method": "Web Portal lookup with CAPTCHA / Annual CSV download",
                "notice": "Automated scrapers prohibited; user batch import supported."
            }
        ),
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="AICTE_ONOD_PORTAL",
            source_name="AICTE One Nation One Data (ONOD) Platform",
            source_type="OFFICIAL_DOCUMENT",
            canonical_url="https://onod.aicte-india.org/",
            verification_status="VERIFIED_RESTRICTED",
            last_verified_at=utc_now(),
            metadata_json={
                "protocol": "NDEAR / InDEA 2.0 REST Protocol",
                "access_state": "Requires institutional digital certificate & NETF accreditation",
                "anonymous_access": "Unavailable"
            }
        ),
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="AISHE_DIRECTORY",
            source_name="All India Survey on Higher Education (AISHE)",
            source_type="PUBLIC_DATASET",
            canonical_url="https://aishe.gov.in/",
            verification_status="VERIFIED_AVAILABLE",
            last_verified_at=utc_now(),
            metadata_json={
                "content": "Master codes, affiliated universities, state/district mapping",
                "limitations": "Contains no application dossiers or active deficiency notices"
            }
        ),
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="INSTITUTION_FILE_UPLOAD",
            source_name="Authorized Institutional Dossier Upload (CSV/XLSX/PDF)",
            source_type="INSTITUTION_UPLOAD",
            canonical_url="local://institution-vault",
            verification_status="VERIFIED_AVAILABLE",
            last_verified_at=utc_now(),
            metadata_json={
                "allowed_formats": ["CSV", "XLSX", "PDF", "PNG", "JPEG"],
                "security": "SHA-256 integrity hash, tenant boundary isolation, private file vault"
            }
        ),
        SourceRegistry(
            workspace_id=workspace_id,
            source_key="SYNTHETIC_DEMO_SEED",
            source_name="AIClear Synthetic Demo Environment",
            source_type="SYNTHETIC_DEMO",
            canonical_url="internal://fixtures/demo_v1",
            verification_status="VERIFIED_AVAILABLE",
            last_verified_at=utc_now(),
            metadata_json={
                "purpose": "Evaluation, local testing, and hackathon presentation",
                "label": "DEMO / SYNTHETIC DATA"
            }
        )
    ]
    db.add_all(sources)
    db.commit()

def seed_compliance_rules(db: Session):
    existing = db.query(ComplianceRule).first()
    if existing:
        return

    rules = [
        ComplianceRule(
            rule_key="APH-2024-FSR-001",
            title="Faculty Student Ratio (FSR) Compliance",
            description="Engineering & Technology degree programmes must maintain an FSR of 1:20 (or 1:15 for accredited tiers) as prescribed in APH norms.",
            applicable_workflow="EXTENSION_OF_APPROVAL",
            rule_source_type="OFFICIAL_APH_2024_27",
            official_source_title="AICTE Approval Process Handbook 2024-27",
            official_section_ref="Chapter II, Section 2.4 & Appendix 7",
            rule_version="2024-27-v1",
            severity="HIGH"
        ),
        ComplianceRule(
            rule_key="APH-2024-FIRE-002",
            title="Valid Fire Safety Certificate / NOC",
            description="Institution must possess a valid, unexpired Fire Safety Certificate issued by the competent State/Municipal Authority.",
            applicable_workflow="EXTENSION_OF_APPROVAL",
            rule_source_type="OFFICIAL_APH_2024_27",
            official_source_title="AICTE Approval Process Handbook 2024-27",
            official_section_ref="Chapter I/II Mandatory Documents, Appendix 16",
            rule_version="2024-27-v1",
            severity="CRITICAL"
        ),
        ComplianceRule(
            rule_key="APH-2024-OCCUP-003",
            title="Building Occupancy / Completion Certificate",
            description="Institution must possess an Occupancy Certificate from local planning/competent authority certifying instructional built-up area.",
            applicable_workflow="EXTENSION_OF_APPROVAL",
            rule_source_type="OFFICIAL_APH_2024_27",
            official_source_title="AICTE Approval Process Handbook 2024-27",
            official_section_ref="Chapter I, Clause 1.4 & Appendix 4",
            rule_version="2024-27-v1",
            severity="HIGH"
        ),
        ComplianceRule(
            rule_key="APH-2024-LAND-004",
            title="Land Title Deed & Non-Encumbrance Verification",
            description="Clear registered ownership/lease deed of land for not less than 30 years with non-encumbrance certificate.",
            applicable_workflow="NEW_INSTITUTION",
            rule_source_type="OFFICIAL_APH_2024_27",
            official_source_title="AICTE Approval Process Handbook 2024-27",
            official_section_ref="Chapter I, Appendix 4 (Land Norms)",
            rule_version="2024-27-v1",
            severity="CRITICAL"
        ),
        ComplianceRule(
            rule_key="DEMO-INT-CADRE-005",
            title="Illustrative Demo: Cadre Ratio Balance (1:2:6)",
            description="Demonstration rule checking Professor to Associate Professor to Assistant Professor ratio balance. Marked as illustrative demo rule.",
            applicable_workflow="INCREASE_IN_INTAKE",
            rule_source_type="ILLUSTRATIVE_DEMO",
            official_source_title="Illustrative Demo Rule - Verify Against Current Official Cadre Circulars",
            official_section_ref="Internal Reference Guideline",
            rule_version="demo-v1.0",
            severity="MEDIUM"
        )
    ]
    db.add_all(rules)
    db.commit()

def clear_demo_data(db: Session, workspace_id: str):
    """Safely clear only records marked with data_mode = 'DEMO'. Never touches real/imported data."""
    # Find all demo cases
    demo_cases = db.query(ApprovalCase).filter(
        ApprovalCase.workspace_id == workspace_id,
        ApprovalCase.data_mode == "DEMO"
    ).all()
    demo_case_ids = [c.id for c in demo_cases]

    if demo_case_ids:
        # Clear notifications linked to demo alerts
        demo_alerts = db.query(Alert.id).filter(Alert.case_id.in_(demo_case_ids)).all()
        demo_alert_ids = [a[0] for a in demo_alerts]
        if demo_alert_ids:
            db.query(NotificationOutbox).filter(NotificationOutbox.alert_id.in_(demo_alert_ids)).delete(synchronize_session=False)

        # Clear document versions linked to demo documents
        demo_docs = db.query(EvidenceDocument.id).filter(EvidenceDocument.case_id.in_(demo_case_ids)).all()
        demo_doc_ids = [d[0] for d in demo_docs]
        if demo_doc_ids:
            db.query(DocumentVersion).filter(DocumentVersion.document_id.in_(demo_doc_ids)).delete(synchronize_session=False)

        # Clear child elements
        db.query(Alert).filter(Alert.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        db.query(ComplianceResult).filter(ComplianceResult.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        db.query(EvidenceDocument).filter(EvidenceDocument.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        db.query(CaseStageHistory).filter(CaseStageHistory.case_id.in_(demo_case_ids)).delete(synchronize_session=False)
        db.query(ApprovalCase).filter(ApprovalCase.id.in_(demo_case_ids)).delete(synchronize_session=False)

    # Clear standalone demo alerts
    db.query(Alert).filter(Alert.workspace_id == workspace_id, Alert.category == "DEMO").delete(synchronize_session=False)

    # Clear demo institutions
    db.query(Institution).filter(
        Institution.workspace_id == workspace_id,
        Institution.data_mode == "DEMO"
    ).delete(synchronize_session=False)

    db.commit()

def seed_demo_workspace_data(db: Session, workspace_id: str):
    """Seed the 5 canonical synthetic demo cases into the workspace."""
    clear_demo_data(db, workspace_id)
    seed_compliance_rules(db)
    seed_source_registry(db, workspace_id)

    today = date.today()

    # Synthetic Institutions
    inst1 = Institution(
        workspace_id=workspace_id,
        aicte_permanent_id="1-984210981",
        aishe_code="C-54321",
        legal_name="Northstar Technical Institute - Demo",
        institution_type="PRIVATE_SELF_FINANCED",
        state="Maharashtra",
        district="Pune",
        address="Sector 14, Hinjawadi Phase 2, Pune, Maharashtra 411057",
        data_mode="DEMO"
    )
    inst2 = Institution(
        workspace_id=workspace_id,
        aicte_permanent_id="1-764392019",
        aishe_code="C-61209",
        legal_name="Apex Institute of Technology & Management - Demo",
        institution_type="GOVT_AIDED",
        state="Karnataka",
        district="Bengaluru Urban",
        address="Plot 88, Electronic City Phase 1, Bengaluru 560100",
        data_mode="DEMO"
    )
    db.add_all([inst1, inst2])
    db.flush()

    # Case 1: AICTE-DEMO-014 (Document Review - Fire Safety NOC expired / needing attention)
    case14 = ApprovalCase(
        workspace_id=workspace_id,
        institution_id=inst1.id,
        case_reference="AICTE-DEMO-014",
        workflow_type="EXTENSION_OF_APPROVAL",
        academic_period="2025-2026",
        current_stage="DOCUMENT_REVIEW",
        status="NEEDS_ATTENTION",
        priority="HIGH",
        internal_owner_name="A. Coordinator",
        target_date=today + timedelta(days=10),
        notes="Annual Extension of Approval. Fire Safety certificate is approaching statutory validity limit.",
        data_mode="DEMO",
        created_by="A. Coordinator"
    )

    # Case 2: AICTE-DEMO-015 (Compliance Checks - 1 item needs review)
    case15 = ApprovalCase(
        workspace_id=workspace_id,
        institution_id=inst1.id,
        case_reference="AICTE-DEMO-015",
        workflow_type="INCREASE_IN_INTAKE",
        academic_period="2025-2026",
        current_stage="COMPLIANCE_CHECKS",
        status="IN_PROGRESS",
        priority="HIGH",
        internal_owner_name="R. Reviewer",
        target_date=today + timedelta(days=13),
        notes="Requesting intake increase in B.Tech CSE (from 120 to 180). FSR validation pending review.",
        data_mode="DEMO",
        created_by="R. Reviewer"
    )

    # Case 3: AICTE-DEMO-016 (Internal Review - Awaiting Approving Officer)
    case16 = ApprovalCase(
        workspace_id=workspace_id,
        institution_id=inst2.id,
        case_reference="AICTE-DEMO-016",
        workflow_type="NEW_COURSE",
        academic_period="2025-2026",
        current_stage="INTERNAL_REVIEW",
        status="AWAITING_REVIEW",
        priority="MEDIUM",
        internal_owner_name="S. Officer",
        target_date=today + timedelta(days=15),
        notes="Introduction of new PG course in Artificial Intelligence & Data Science. All evidence verified.",
        data_mode="DEMO",
        created_by="A. Coordinator"
    )

    # Case 4: AICTE-DEMO-017 (Corrections Required - Overdue task)
    case17 = ApprovalCase(
        workspace_id=workspace_id,
        institution_id=inst2.id,
        case_reference="AICTE-DEMO-017",
        workflow_type="EXTENSION_OF_APPROVAL",
        academic_period="2025-2026",
        current_stage="CORRECTIONS_REQUIRED",
        status="NEEDS_ATTENTION",
        priority="CRITICAL",
        internal_owner_name="M. Registrar",
        target_date=today - timedelta(days=2),  # Overdue
        notes="Cadre matrix was rejected by Document Reviewer due to missing Assistant Professor appointment letters.",
        data_mode="DEMO",
        created_by="R. Reviewer"
    )

    # Case 5: AICTE-DEMO-018 (Ready for Internal Review - Checklist complete)
    case18 = ApprovalCase(
        workspace_id=workspace_id,
        institution_id=inst1.id,
        case_reference="AICTE-DEMO-018",
        workflow_type="EXTENSION_OF_APPROVAL",
        academic_period="2025-2026",
        current_stage="READY_FOR_SUBMISSION",
        status="COMPLETED",
        priority="LOW",
        internal_owner_name="S. Officer",
        target_date=today + timedelta(days=25),
        notes="All internal compliance checklists cleared. Dossier ready for Internal Review pack export.",
        data_mode="DEMO",
        created_by="S. Officer"
    )
    db.add_all([case14, case15, case16, case17, case18])
    db.flush()

    # Stage Histories
    h1 = CaseStageHistory(case_id=case14.id, from_stage="DRAFT", to_stage="DOCUMENT_REVIEW", changed_by="A. Coordinator", reason="All primary certificates uploaded")
    h2 = CaseStageHistory(case_id=case15.id, from_stage="DOCUMENT_REVIEW", to_stage="COMPLIANCE_CHECKS", changed_by="R. Reviewer", reason="Documents cataloged; initiated deterministic compliance check")
    h3 = CaseStageHistory(case_id=case16.id, from_stage="COMPLIANCE_CHECKS", to_stage="INTERNAL_REVIEW", changed_by="R. Reviewer", reason="Compliance results verified; forwarded to Supervising Officer")
    h4 = CaseStageHistory(case_id=case17.id, from_stage="DOCUMENT_REVIEW", to_stage="CORRECTIONS_REQUIRED", changed_by="R. Reviewer", reason="Faculty cadre certificate missing endorsement")
    h5 = CaseStageHistory(case_id=case18.id, from_stage="INTERNAL_REVIEW", to_stage="READY_FOR_SUBMISSION", changed_by="S. Officer", reason="Internal approval granted. Ready for packaging.")
    db.add_all([h1, h2, h3, h4, h5])

    # Evidence Documents for Case 14
    doc_fire = EvidenceDocument(
        case_id=case14.id,
        category="FIRE_SAFETY_NOC",
        original_filename="Fire_Safety_NOC_Municipal_2024.pdf",
        storage_key="vault/demo/case14_fire_noc.pdf",
        mime_type="application/pdf",
        size_bytes=1048576,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        document_date=today - timedelta(days=350),
        expiry_date=today + timedelta(days=15),  # Near expiry!
        version_number=1,
        review_status="AWAITING_REVIEW",
        uploaded_by="A. Coordinator"
    )
    doc_occup = EvidenceDocument(
        case_id=case14.id,
        category="OCCUPANCY_CERTIFICATE",
        original_filename="Building_Occupancy_Authority_Approval.pdf",
        storage_key="vault/demo/case14_occupancy.pdf",
        mime_type="application/pdf",
        size_bytes=2450000,
        sha256_hash="f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149a",
        document_date=today - timedelta(days=700),
        expiry_date=None,  # Permanent
        version_number=1,
        review_status="VERIFIED_VALID",
        reviewed_by="R. Reviewer",
        review_notes="Permanent occupancy certificate verified against municipal records.",
        uploaded_by="A. Coordinator"
    )
    db.add_all([doc_fire, doc_occup])

    # Rules lookup
    rule_fsr = db.query(ComplianceRule).filter(ComplianceRule.rule_key == "APH-2024-FSR-001").first()
    rule_fire = db.query(ComplianceRule).filter(ComplianceRule.rule_key == "APH-2024-FIRE-002").first()
    rule_occup = db.query(ComplianceRule).filter(ComplianceRule.rule_key == "APH-2024-OCCUP-003").first()

    if rule_fire:
        cr1 = ComplianceResult(
            case_id=case14.id,
            rule_id=rule_fire.id,
            rule_version_snapshot="2024-27-v1",
            status="NEEDS_REVIEW",
            explanation="Fire Safety Certificate validity expires within 15 days (less than minimum 30-day recommended buffer).",
            recommended_action="Obtain renewed NOC from Municipal Chief Fire Officer or provide renewal application receipt.",
            requires_human_review=True,
            evaluated_at=utc_now()
        )
        db.add(cr1)

    if rule_fsr:
        cr2 = ComplianceResult(
            case_id=case15.id,
            rule_id=rule_fsr.id,
            rule_version_snapshot="2024-27-v1",
            status="NEEDS_REVIEW",
            explanation="Calculated Faculty-Student Ratio is 1:21.4 for proposed intake of 180. APH norm specifies maximum 1:20.",
            recommended_action="Attach appointment orders for 2 additional Assistant Professors in Computer Science.",
            requires_human_review=True,
            evaluated_at=utc_now()
        )
        db.add(cr2)

    # Tasks
    t1 = Task(
        case_id=case14.id,
        title="Verify Fire Safety renewal application submission",
        description="Check if municipal fire dept acknowledgment receipt is available while renewed NOC is in process.",
        assignee_name="A. Coordinator",
        priority="HIGH",
        status="IN_PROGRESS",
        due_date=today + timedelta(days=4),
        created_by="R. Reviewer"
    )
    t2 = Task(
        case_id=case17.id,
        title="Upload authenticated Assistant Professor appointment orders",
        description="Cadre matrix must include verified joining reports for 3 assistant professors.",
        assignee_name="M. Registrar",
        priority="CRITICAL",
        status="TODO",
        due_date=today - timedelta(days=2),  # Overdue!
        created_by="R. Reviewer"
    )
    t3 = Task(
        case_id=case15.id,
        title="Cross-check faculty count with AICTE Web Portal Faculty Database",
        description="Ensure faculty Aadhaar/PAN entries match the official AICTE portal registration.",
        assignee_name="R. Reviewer",
        priority="MEDIUM",
        status="TODO",
        due_date=today + timedelta(days=7),
        created_by="S. Officer"
    )
    db.add_all([t1, t2, t3])
    db.flush()

    # Alerts (Derived and deduplicated)
    a1 = Alert(
        workspace_id=workspace_id,
        case_id=case14.id,
        alert_key="ALERT-CASE14-FIRE-EXPIRY",
        category="DOCUMENT_EXPIRY",
        severity="HIGH",
        title="Fire Safety Certificate Approaching Expiration",
        explanation="Fire Safety NOC expires on " + (today + timedelta(days=15)).strftime("%d-%b-%Y") + ". Renewal evidence required before submission.",
        status="OPEN",
        escalation_level=1,
        assigned_to="A. Coordinator"
    )
    a2 = Alert(
        workspace_id=workspace_id,
        case_id=case17.id,
        task_id=t2.id,
        alert_key="ALERT-CASE17-TASK-OVERDUE",
        category="DEADLINE",
        severity="CRITICAL",
        title="Overdue Corrective Task: Faculty Appointment Orders",
        explanation="Task assigned to M. Registrar was due on " + (today - timedelta(days=2)).strftime("%d-%b-%Y") + " and is blocking EoA progression.",
        status="OPEN",
        escalation_level=2,
        assigned_to="M. Registrar"
    )
    a3 = Alert(
        workspace_id=workspace_id,
        case_id=case15.id,
        alert_key="ALERT-CASE15-FSR-DEFICIENCY",
        category="COMPLIANCE_DEFICIENCY",
        severity="HIGH",
        title="FSR Deficit for Proposed Intake Increase",
        explanation="Proposed intake increase requires 2 additional faculty members to satisfy APH 1:20 norm.",
        status="OPEN",
        escalation_level=1,
        assigned_to="R. Reviewer"
    )
    db.add_all([a1, a2, a3])

    # Outbox notification
    n1 = NotificationOutbox(
        alert_id=a1.id,
        recipient_email="coordinator@northstar-tech.edu.in",
        channel="IN_APP",
        delivery_status="DELIVERED",
        is_simulated=True,
        subject="[AIClear] Urgent: Fire Safety NOC Renewal Required - AICTE-DEMO-014",
        body="Automated Alert: The Fire Safety NOC attached to case AICTE-DEMO-014 expires in 15 days. Please attach the renewal acknowledgment."
    )
    db.add(n1)

    # Audit Events
    aud1 = AuditEvent(
        workspace_id=workspace_id,
        actor_name="System Seeder",
        actor_role="SYSTEM_ADMIN",
        entity_type="WORKSPACE",
        entity_id=workspace_id,
        action="DEMO_WORKSPACE_INITIALIZED",
        details_json={"cases_seeded": 5, "mode": "DEMO"}
    )
    aud2 = AuditEvent(
        workspace_id=workspace_id,
        actor_name="R. Reviewer",
        actor_role="DOCUMENT_REVIEWER",
        entity_type="CASE",
        entity_id=case14.id,
        action="DOCUMENT_REVIEW_COMPLETED",
        details_json={"document": "Building_Occupancy_Authority_Approval.pdf", "status": "VERIFIED_VALID"}
    )
    aud3 = AuditEvent(
        workspace_id=workspace_id,
        actor_name="S. Officer",
        actor_role="SUPERVISING_OFFICER",
        entity_type="CASE",
        entity_id=case18.id,
        action="INTERNAL_APPROVAL_RECORDED",
        details_json={"verdict": "READY_FOR_PACKAGING", "notes": "Approved for final checklist export."}
    )
    db.add_all([aud1, aud2, aud3])

    db.commit()
