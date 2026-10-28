import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, BigInteger, Boolean, 
    DateTime, Date, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False, default="Default Technical Workspace")
    slug = Column(String(100), unique=True, nullable=False, default="default")
    active_data_mode = Column(String(30), nullable=False, default="DEMO")  # DEMO, IMPORTED, MANUAL, CONNECTED
    first_run_completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    sources = relationship("SourceRegistry", back_populates="workspace", cascade="all, delete-orphan")
    institutions = relationship("Institution", back_populates="workspace", cascade="all, delete-orphan")
    cases = relationship("ApprovalCase", back_populates="workspace", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="workspace", cascade="all, delete-orphan")
    audit_events = relationship("AuditEvent", back_populates="workspace", cascade="all, delete-orphan")

class SourceRegistry(Base):
    __tablename__ = "source_registry"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    source_key = Column(String(100), nullable=False)
    source_name = Column(String(255), nullable=False)
    source_type = Column(String(50), nullable=False)  # OFFICIAL_DOCUMENT, INSTITUTION_UPLOAD, PUBLIC_DATASET, SYNTHETIC_DEMO
    canonical_url = Column(Text, nullable=True)
    verification_status = Column(String(50), nullable=False)  # VERIFIED_AVAILABLE, VERIFIED_RESTRICTED, MANUAL_IMPORT_ONLY, NEEDS_CONFIRMATION
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    workspace = relationship("Workspace", back_populates="sources")

class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    source_registry_id = Column(String(36), ForeignKey("source_registry.id"), nullable=True)
    batch_reference = Column(String(100), unique=True, nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_sha256 = Column(String(64), nullable=False)
    total_records = Column(Integer, default=0)
    successful_records = Column(Integer, default=0)
    failed_records = Column(Integer, default=0)
    status = Column(String(50), nullable=False, default="PENDING")  # PENDING, VALIDATED, COMMITTED, FAILED
    validation_report = Column(JSON, default=dict)
    created_by = Column(String(100), nullable=False, default="System Administrator")
    created_at = Column(DateTime(timezone=True), default=utc_now)

    institutions = relationship("Institution", back_populates="ingestion_batch")

class IngestionPreview(Base):
    __tablename__ = "ingestion_previews"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    original_filename = Column(String(255), nullable=False)
    file_sha256 = Column(String(64), nullable=False)
    records_json = Column(JSON, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Institution(Base):
    __tablename__ = "institutions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    aicte_permanent_id = Column(String(50), nullable=True)
    aishe_code = Column(String(50), nullable=True)
    legal_name = Column(String(255), nullable=False)
    institution_type = Column(String(100), nullable=False)  # GOVERNMENT, GOVT_AIDED, PRIVATE_SELF_FINANCED, DEEMED_UNIVERSITY
    state = Column(String(100), nullable=False)
    district = Column(String(100), nullable=False)
    address = Column(Text, nullable=True)
    data_mode = Column(String(30), nullable=False, default="DEMO")  # DEMO, IMPORTED, MANUAL, CONNECTED
    provenance_batch_id = Column(String(36), ForeignKey("ingestion_batches.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="institutions")
    cases = relationship("ApprovalCase", back_populates="institution", cascade="all, delete-orphan")
    ingestion_batch = relationship("IngestionBatch", back_populates="institutions")

class ApprovalCase(Base):
    __tablename__ = "approval_cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    institution_id = Column(String(36), ForeignKey("institutions.id"), nullable=False)
    case_reference = Column(String(50), nullable=False)  # e.g. AICTE-DEMO-014
    workflow_type = Column(String(100), nullable=False)  # EXTENSION_OF_APPROVAL, NEW_INSTITUTION, INCREASE_IN_INTAKE, NEW_COURSE
    academic_period = Column(String(50), nullable=False, default="2025-2026")
    current_stage = Column(String(50), nullable=False, default="DRAFT")
    status = Column(String(50), nullable=False, default="IN_PROGRESS")  # IN_PROGRESS, NEEDS_ATTENTION, AWAITING_REVIEW, BLOCKED, COMPLETED
    priority = Column(String(20), nullable=False, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    internal_owner_name = Column(String(100), nullable=False)
    target_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)
    data_mode = Column(String(30), nullable=False, default="DEMO")  # DEMO, IMPORTED, MANUAL, CONNECTED
    created_by = Column(String(100), nullable=False, default="System Administrator")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    workspace = relationship("Workspace", back_populates="cases")
    institution = relationship("Institution", back_populates="cases")
    stage_history = relationship("CaseStageHistory", back_populates="case", cascade="all, delete-orphan")
    documents = relationship("EvidenceDocument", back_populates="case", cascade="all, delete-orphan")
    compliance_results = relationship("ComplianceResult", back_populates="case", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="case", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="case", cascade="all, delete-orphan")

class CaseStageHistory(Base):
    __tablename__ = "case_stage_history"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=False)
    from_stage = Column(String(50), nullable=False)
    to_stage = Column(String(50), nullable=False)
    changed_by = Column(String(100), nullable=False)
    reason = Column(Text, nullable=False)
    changed_at = Column(DateTime(timezone=True), default=utc_now)

    case = relationship("ApprovalCase", back_populates="stage_history")

class EvidenceDocument(Base):
    __tablename__ = "evidence_documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=False)
    category = Column(String(100), nullable=False)  # FIRE_SAFETY_NOC, LAND_TITLE_DEED, BUILDING_OCCUPANCY_CERTIFICATE, FACULTY_CADRE_MATRIX, SOCIETY_REGISTRATION
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False, default="application/pdf")
    size_bytes = Column(BigInteger, nullable=False, default=0)
    sha256_hash = Column(String(64), nullable=False)
    document_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)
    version_number = Column(Integer, nullable=False, default=1)
    review_status = Column(String(50), nullable=False, default="AWAITING_REVIEW")  # AWAITING_REVIEW, VERIFIED_VALID, NEEDS_CORRECTION, NOT_APPLICABLE
    reviewed_by = Column(String(100), nullable=True)
    review_notes = Column(Text, nullable=True)
    uploaded_by = Column(String(100), nullable=False, default="Coordinator")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    case = relationship("ApprovalCase", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")

class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("evidence_documents.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=False)
    mime_type = Column(String(100), nullable=False, default="application/pdf")
    size_bytes = Column(BigInteger, nullable=False, default=0)
    sha256_hash = Column(String(64), nullable=False)
    uploaded_by = Column(String(100), nullable=False, default="Coordinator")
    change_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    document = relationship("EvidenceDocument", back_populates="versions")

class ComplianceRule(Base):
    __tablename__ = "compliance_rules"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    rule_key = Column(String(100), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    applicable_workflow = Column(String(100), nullable=False)
    rule_source_type = Column(String(50), nullable=False)  # OFFICIAL_APH_2024_27, INSTITUTION_POLICY, ILLUSTRATIVE_DEMO
    official_source_title = Column(Text, nullable=True)
    official_section_ref = Column(String(100), nullable=True)
    rule_version = Column(String(50), nullable=False, default="2024-2027-v1")
    severity = Column(String(20), nullable=False, default="MEDIUM")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    results = relationship("ComplianceResult", back_populates="rule")

class ComplianceResult(Base):
    __tablename__ = "compliance_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=False)
    rule_id = Column(String(36), ForeignKey("compliance_rules.id"), nullable=False)
    rule_version_snapshot = Column(String(50), nullable=False)
    status = Column(String(50), nullable=False)  # COMPLIANT, NEEDS_REVIEW, NON_COMPLIANT, MISSING_EVIDENCE, EXPIRED_EVIDENCE, NOT_APPLICABLE, UNABLE_TO_DETERMINE
    original_status = Column(String(50), nullable=True)  # Preserves automated result before any human override
    explanation = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=True)
    requires_human_review = Column(Boolean, default=False)
    manual_override = Column(Boolean, default=False)
    override_reason = Column(Text, nullable=True)
    overridden_by = Column(String(100), nullable=True)
    evaluated_at = Column(DateTime(timezone=True), default=utc_now)

    case = relationship("ApprovalCase", back_populates="compliance_results")
    rule = relationship("ComplianceRule", back_populates="results")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    assignee_name = Column(String(100), nullable=False)
    priority = Column(String(20), nullable=False, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(50), nullable=False, default="TODO")  # TODO, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED
    due_date = Column(Date, nullable=False)
    completion_notes = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String(100), nullable=False, default="System Administrator")
    created_at = Column(DateTime(timezone=True), default=utc_now)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    case = relationship("ApprovalCase", back_populates="tasks")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=True)
    task_id = Column(String(36), ForeignKey("tasks.id"), nullable=True)
    alert_key = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False)  # DEADLINE, DOCUMENT_EXPIRY, COMPLIANCE_DEFICIENCY, STAGE_STALLED
    severity = Column(String(20), nullable=False)  # INFO, LOW, MEDIUM, HIGH, CRITICAL
    title = Column(String(255), nullable=False)
    explanation = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="OPEN")  # OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
    escalation_level = Column(Integer, nullable=False, default=1)
    assigned_to = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)

    workspace = relationship("Workspace", back_populates="alerts")
    case = relationship("ApprovalCase", back_populates="alerts")

class NotificationOutbox(Base):
    __tablename__ = "notification_outbox"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    alert_id = Column(String(36), ForeignKey("alerts.id"), nullable=True)
    recipient_email = Column(String(255), nullable=False)
    channel = Column(String(50), nullable=False, default="IN_APP")  # IN_APP, SIMULATED_EMAIL, OFFICIAL_EMAIL
    delivery_status = Column(String(50), nullable=False, default="LOGGED")
    is_simulated = Column(Boolean, nullable=False, default=True)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False)
    actor_name = Column(String(100), nullable=False)
    actor_role = Column(String(50), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(36), nullable=False)
    action = Column(String(50), nullable=False)
    details_json = Column(JSON, default=dict)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    workspace = relationship("Workspace", back_populates="audit_events")


class EVCVisit(Base):
    """Explicitly routed EVC visit; never inferred from case stage alone."""
    __tablename__ = "evc_visits"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    workspace_id = Column(String(36), ForeignKey("workspaces.id"), nullable=False, index=True)
    case_id = Column(String(36), ForeignKey("approval_cases.id"), nullable=False, index=True)
    routing_basis = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="WAITING_TO_SCHEDULE")
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    venue = Column(String(255), nullable=True)
    assigned_team = Column(String(255), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    completion_notes = Column(Text, nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
