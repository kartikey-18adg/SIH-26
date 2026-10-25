# AIClear — Canonical Data Architecture & Data Mode Isolation

**Document Version:** 1.0.0  
**Project:** AIClear  
**Database Engine:** PostgreSQL 16+ (Target) / SQLite 3 (Portable Development Fallback via SQLAlchemy 2.0 ORM)  
**Security & Multi-Tenancy:** Workspace-level tenancy with explicit `data_mode` isolation, private file vault, SHA-256 evidence integrity hashing, and immutable audit logs.

---

## 1. Architectural Principles

1. **Strict Data Mode Isolation:** Synthetic demo records (`data_mode = 'DEMO'`) must never blend with authentic institutional data (`data_mode IN ('IMPORTED', 'MANUAL', 'CONNECTED')`).
2. **Provenance Traceability:** Every imported row retains raw batch identifiers, original filename, uploader name, SHA-256 hash, and validation timestamp.
3. **No Fabricated Regulatory Authority:** The software serves as an internal institutional administrative workflow tool. It never claims that an internal approval checklist equals an official AICTE sanction.
4. **Deterministic Compliance with Human Review:** Automated checks evaluate verifiable facts (document expiration, missing attachments, date conflicts). Any subjective or complex legal evaluation produces a state of `NEEDS_REVIEW` and requires human sign-off.
5. **Private Evidence Vault:** Uploaded files are stored in a private directory with server-generated UUID keys; public direct URL access is forbidden.

---

## 2. High-Level Entity Relationship Diagram

```
+-------------------------------------------------------------------------------------------------+
|                                    WORKSPACE (Tenant)                                           |
|  id, name, slug, active_data_mode (DEMO | IMPORTED | MANUAL | CONNECTED)                        |
+-------------------------------------------------------------------------------------------------+
                                      | 1
                                      |
                                      | *
                     +----------------------------------+
                     |         INSTITUTION MASTER       |
                     |  id, aicte_id, name, type, mode  |
                     +----------------------------------+
                                      | 1
                                      |
                                      | *
                     +----------------------------------+
                     |          APPROVAL CASE           |
                     |  id, ref, workflow_type, stage,  |
                     |  status, priority, owner, mode   |
                     +----------------------------------+
                               /      |      \
                              /       |       \
                             *        *        *
           +-----------------+   +----+----+   +-------------------+
           | EVIDENCE DOCS   |   |  TASKS  |   | COMPLIANCE RESULTS|
           | id, category,   |   | id, due,|   | id, rule_id,      |
           | storage_key,    |   | status, |   | status, evidence, |
           | hash, expiry,   |   | assignee|   | human_override    |
           | review_status   |   +---------+   +-------------------+
           +-----------------+        |                  |
                    \                 |                  |
                     \                |                  |
                      v               v                  v
                 +---------------------------------------------+
                 |              ALERTS & ESCALATIONS           |
                 | id, severity, category, title, status, age  |
                 +---------------------------------------------+
                                      |
                                      v
                 +---------------------------------------------+
                 |            NOTIFICATION OUTBOX              |
                 | id, channel, is_simulated, delivery_status  |
                 +---------------------------------------------+
```

---

## 3. Relational Schema Specification (DDL)

```sql
-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Workspace Configuration & Active Mode
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    active_data_mode VARCHAR(30) NOT NULL DEFAULT 'DEMO', -- 'DEMO', 'IMPORTED', 'MANUAL', 'CONNECTED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Source Registry
CREATE TABLE source_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_key VARCHAR(100) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'OFFICIAL_DOCUMENT', 'INSTITUTION_UPLOAD', 'PUBLIC_DATASET', 'SYNTHETIC_DEMO'
    canonical_url TEXT,
    verification_status VARCHAR(50) NOT NULL, -- 'VERIFIED_AVAILABLE', 'VERIFIED_RESTRICTED', 'MANUAL_IMPORT_ONLY', 'NEEDS_CONFIRMATION'
    last_verified_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Ingestion Batches & Provenance
CREATE TABLE ingestion_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_registry_id UUID REFERENCES source_registry(id),
    batch_reference VARCHAR(100) UNIQUE NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    total_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'VALIDATED', 'COMMITTED', 'FAILED'
    validation_report JSONB DEFAULT '{}'::jsonb,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Ingestion Row-Level Errors
CREATE TABLE ingestion_row_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES ingestion_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_content JSONB NOT NULL,
    error_message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Institutions Master
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    aicte_permanent_id VARCHAR(50),
    aishe_code VARCHAR(50),
    legal_name VARCHAR(255) NOT NULL,
    institution_type VARCHAR(100) NOT NULL, -- 'GOVERNMENT', 'GOVT_AIDED', 'PRIVATE_SELF_FINANCED', 'DEEMED_UNIVERSITY'
    state VARCHAR(100) NOT NULL,
    district VARCHAR(100) NOT NULL,
    address TEXT,
    data_mode VARCHAR(30) NOT NULL DEFAULT 'DEMO',
    provenance_batch_id UUID REFERENCES ingestion_batches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_institution_aicte_mode UNIQUE (aicte_permanent_id, workspace_id, data_mode)
);

-- 6. Approval Cases
CREATE TABLE approval_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    case_reference VARCHAR(50) NOT NULL, -- e.g. 'AICTE-DEMO-014' or 'CASE-2025-001'
    workflow_type VARCHAR(100) NOT NULL, -- 'EXTENSION_OF_APPROVAL', 'NEW_INSTITUTION', 'INCREASE_IN_INTAKE', 'NEW_COURSE'
    academic_period VARCHAR(50) NOT NULL, -- '2025-2026'
    current_stage VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'INFO_COLLECTION', 'DOCUMENT_REVIEW', 'COMPLIANCE_CHECKS', 'INTERNAL_REVIEW', 'CORRECTIONS_REQUIRED', 'READY_FOR_SUBMISSION', 'RECORDED_EXTERNALLY_SUBMITTED', 'CLOSED'
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'NEEDS_ATTENTION', 'AWAITING_REVIEW', 'BLOCKED', 'COMPLETED'
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    internal_owner_name VARCHAR(100) NOT NULL,
    target_date DATE NOT NULL,
    notes TEXT,
    data_mode VARCHAR(30) NOT NULL DEFAULT 'DEMO',
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_case_ref_workspace UNIQUE (case_reference, workspace_id)
);

-- 7. Case Stage Transition History (Audited)
CREATE TABLE case_stage_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES approval_cases(id) ON DELETE CASCADE,
    from_stage VARCHAR(50) NOT NULL,
    to_stage VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Document & Evidence Vault
CREATE TABLE evidence_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES approval_cases(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- 'LAND_DOCUMENTS', 'FIRE_SAFETY_NOC', 'OCCUPANCY_CERTIFICATE', 'FACULTY_MATRIX', 'BUILDING_PLAN', 'SOCIETY_REGISTRATION'
    original_filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(500) NOT NULL, -- Private path / UUID in server vault
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    document_date DATE,
    expiry_date DATE,
    version_number INTEGER NOT NULL DEFAULT 1,
    review_status VARCHAR(50) NOT NULL DEFAULT 'AWAITING_REVIEW', -- 'AWAITING_REVIEW', 'VERIFIED_VALID', 'NEEDS_CORRECTION', 'NOT_APPLICABLE'
    reviewed_by VARCHAR(100),
    review_notes TEXT,
    uploaded_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Document Versions
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    uploaded_by VARCHAR(100) NOT NULL,
    change_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Compliance Rules Catalog (Official vs Demo)
CREATE TABLE compliance_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_key VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    applicable_workflow VARCHAR(100) NOT NULL,
    rule_source_type VARCHAR(50) NOT NULL, -- 'OFFICIAL_APH_2024_27', 'INSTITUTION_POLICY', 'ILLUSTRATIVE_DEMO'
    official_source_title TEXT,
    official_section_ref VARCHAR(100),
    rule_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Compliance Evaluation Results
CREATE TABLE compliance_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES approval_cases(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES compliance_rules(id) ON DELETE CASCADE,
    rule_version_snapshot VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'COMPLIANT', 'NEEDS_REVIEW', 'NON_COMPLIANT', 'MISSING_EVIDENCE', 'EXPIRED_EVIDENCE', 'NOT_APPLICABLE'
    explanation TEXT NOT NULL,
    recommended_action TEXT,
    requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
    manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    override_reason TEXT,
    overridden_by VARCHAR(100),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Operational Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES approval_cases(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_name VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    status VARCHAR(50) NOT NULL DEFAULT 'TODO', -- 'TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'
    due_date DATE NOT NULL,
    completion_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Alerts & Escalations
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    case_id UUID REFERENCES approval_cases(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    alert_key VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'DEADLINE', 'DOCUMENT_EXPIRY', 'COMPLIANCE_DEFICIENCY', 'STAGE_STALLED'
    severity VARCHAR(20) NOT NULL, -- 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    title VARCHAR(255) NOT NULL,
    explanation TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'
    escalation_level INTEGER NOT NULL DEFAULT 1,
    assigned_to VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    CONSTRAINT uq_alert_key_case UNIQUE (alert_key, case_id)
);

-- 14. Notification Outbox (Simulated / Audited)
CREATE TABLE notification_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
    recipient_email VARCHAR(255) NOT NULL,
    channel VARCHAR(50) NOT NULL DEFAULT 'IN_APP', -- 'IN_APP', 'SIMULATED_EMAIL', 'OFFICIAL_EMAIL'
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'LOGGED',
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Immutable Audit Events
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    actor_name VARCHAR(100) NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_cases_workspace_mode ON approval_cases (workspace_id, data_mode);
CREATE INDEX idx_cases_stage ON approval_cases (current_stage);
CREATE INDEX idx_alerts_workspace_status ON alerts (workspace_id, status);
CREATE INDEX idx_tasks_case_status ON tasks (case_id, status);
CREATE INDEX idx_audit_entity ON audit_events (entity_type, entity_id);
```

---

## 4. Ingestion Pipeline & Reconciliation Flow

```
[ Upload File (CSV / XLSX / PDF) ]
              |
              v
[ SHA-256 Hash Calculation & Temporary Quarantine ]
              |
              v
[ Schema & Type Validation (Pydantic / Regex) ]
              |
       +------+------+
       |             |
   (Valid)       (Errors Detected)
       |             |
       v             v
[ Pre-Commit ]  [ Ingestion Rejection Report ]
[ Preview ]     (Row numbers & exact error reasons)
       |             |
       |             v
       |        [ User Corrects / Aborts ]
       v
[ User Confirms Commit ]
       |
       v
[ Atomic DB Transaction ]
- Create Ingestion Batch record
- Insert Institutions & Cases with data_mode = 'IMPORTED'
- Link Raw File SHA-256 to Ingestion Batch
- Append Audit Event
```
