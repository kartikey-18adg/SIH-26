# AIClear — Implementation Phases Specification

**Document Version:** 1.0.0  
**Project:** AIClear (Integrated AICTE Approval Workflow Automation, Compliance Monitoring, and Alert Management System)

---

## Overview

The development of AIClear proceeds strictly through nine disciplined, test-verified phases. Each phase establishes a stable layer upon which the next is built. No phase claims features that are not backed by executable code and verified tests.

---

## Phase A: Architecture, Source Discovery & Feasibility Matrix (Completed)
- Inspect existing workspace and environment.
- Verify candidate official data sources (AICTE APH 2024-27, AICTE Dashboard, ONOD, AISHE, data.gov.in).
- Create `docs/data-source-inventory.md` with source feasibility matrix.
- Create `docs/data-architecture.md` with PostgreSQL canonical schema and data-mode isolation.
- Formulate smallest verified real-data ingestion target.
- Formulate first-run data-source UX decision tree.

---

## Phase B: UI Shell, Design Tokens, Workspace Data-Mode Store & First-Run Setup Flow
- **Design Tokens:**
  - Background: `#FBFBF9` (warm editorial neutral).
  - Surface: `#FFFFFF` (pure card/panel) and `#F4F4F1` (secondary surface).
  - Ink: `#1A202C` (slate charcoal) and `#4A5568` (muted body).
  - Borders: Thin `1px solid #E2E8F0`.
  - Radius: Crisp `4px` to `6px` maximum (no pill shapes or oversized bubbles).
  - Accents: Restrained Navy `#1E3A8A` (primary action), Forest `#15803D` (compliant), Amber `#B45309` (attention/warning), Crimson `#B91C1C` (critical deficiency).
- **Workspace Data-Mode Store:**
  - Persisted mode selection: `DEMO`, `IMPORTED`, `MANUAL`, `CONNECTED`.
  - Clear visual indicator in navigation banner: `[DEMO DATA - EVALUATION WORKSPACE]`.
- **First-Run Setup Flow Modal:**
  1. *Demo Workspace (Recommended):* Instant launch with synthetic test data.
  2. *Import My Data:* Upload institutional CSV/XLSX schedules.
  3. *Connect Official Source:* Explicitly explains that no unauthenticated AICTE/ONOD open API is available, directing to manual import.
  4. *Enter Data Manually:* Blank workspace initialization.
  5. *Configure Later:* Enters demo mode immediately with persistent setting.
- **Settings > Data Sources:** Allows switching between modes or resetting demo data without touching imported files.

---

## Phase C: Demo Seed Pipeline & First Real Ingestion Path
- **Demo Seed Script (`seed_demo_workspace`):**
  - Synthesizes 5 realistic cases:
    - `AICTE-DEMO-014`: Extension of Approval (EoA) — Document Review stage, awaiting Fire Safety NOC review.
    - `AICTE-DEMO-015`: Increase in Intake (Computer Science) — Compliance Checks stage, 1 item needing review (FSR validation).
    - `AICTE-DEMO-016`: New Program (AI & Data Science) — Internal Review stage, awaiting Supervising Officer sign-off.
    - `AICTE-DEMO-017`: Extension of Approval — Corrections Required stage, overdue faculty matrix upload.
    - `AICTE-DEMO-018`: Regular EoA — Ready for Internal Review stage, all automated checks passed.
- **First Real-Data Ingestion Route:**
  - Standardized Institutional Application CSV template.
  - Multipart upload endpoint -> SHA-256 calculation -> Pydantic schema validation.
  - Pre-commit preview with row error breakdown.
  - Commit action tagging rows with `data_mode = 'IMPORTED'`.

---

## Phase D: Case Management & State Transition Engine
- **Case List View:**
  - Dense, responsive tabular view with column sorting and multi-criteria filters (Status, Stage, Priority, Owner).
  - Clear distinction between case reference, institutional identifier, and target date.
- **Case Detail Workspace:**
  - Header: Case reference, institutional metadata, current stage, owner, countdown to target date.
  - Tabbed or divided layout: Overview, Evidence Vault, Compliance Checklist, Tasks, Alert Log, Audit Timeline.
- **Workflow State Machine:**
  - Validated transitions: `Draft` -> `Info Collection` -> `Document Review` -> `Compliance Checks` -> `Internal Review` -> `Corrections Required` -> `Ready for Submission` -> `Recorded as Externally Submitted` -> `Closed`.
  - Backend transition guard requiring written justification for returns or overrides.
  - Audit log event generated on every transition.

---

## Phase E: Evidence Vault & Multi-Format Document Management
- **File Intake:** PDF, PNG, JPG, DOCX (up to 20MB).
- **Private Storage:** Stored in isolated directory with cryptographically random UUIDs.
- **Document Metadata:** Category, document date, validity/expiration date, version, checksum.
- **Document Review Workflow:**
  - Three distinct lifecycle states: `UPLOADED` != `AUTOMATED_CHECKED` != `HUMAN_VERIFIED`.
  - Actions: Mark as Validated, Request Correction with note, Mark as Not Applicable with reason.
- **Version Control:** Uploading a revised certificate increments version number without destroying prior file audit trail.

---

## Phase F: Traceable Rule-Based Compliance Engine
- **Rule Catalog Codification:**
  - Official rules: Linked to AICTE Approval Process Handbook (APH) 2024–27 Chapter/Section (e.g. Land Norms, Fire NOC validity, Faculty-Student Ratio).
  - Illustrative rules: Clearly tagged as `Illustrative Demo Rule - Verify Against Current Official Guidance`.
- **Deterministic Check Engine:**
  - Evaluates: Missing mandatory attachments, expired certificates, date ordering anomalies, unverified documents.
  - Outputs structured evaluations: `rule_id`, `rule_version`, `status`, `explanation`, `recommended_action`, `requires_human_review`.
- **Human Review & Override:**
  - Manual override preserves both the automated calculation and human justification in permanent audit records.

---

## Phase G: Alert Centre, Escalation Engine & Notification Outbox
- **Deterministic Alert Generation:**
  - Real-time generation based on database state: impending deadlines (< 7 days), expired documents, overdue tasks, stalled stages (> 14 days in draft).
  - Composite deduplication key (`alert_key + case_id`) prevents alert spamming.
- **Alert Queue Operations:**
  - Filter by severity (`Critical`, `High`, `Medium`, `Low`, `Info`).
  - Actions: Acknowledge, Assign to team member, Resolve with note.
- **Simulated Notification Outbox:**
  - In-app notification viewer demonstrating email/dispatch payloads.
  - Clearly tagged as `SIMULATED EMAIL` unless external SMTP is configured.

---

## Phase H: Operational Reports, Review Packs & Export Engine
- **Internal Review Pack Generation:**
  - Print-friendly case dossier compiling institutional summary, checklist results, evidence table, pending actions, and reviewer sign-offs.
  - Mandatory disclaimer on header and footer:
    > *"AIClear Internal Workflow Document. This is not an official AICTE Approval Certificate or Government Sanction."*
- **Data Export:**
  - Full case history export in JSON.
  - Filtered case and compliance lists in CSV.

---

## Phase I: Mode Boundary Hardening, Testing & Hackathon Showcase Path
- **Automated Mode Boundary Verification:**
  - Pytest test suite ensuring zero query leakage between `DEMO` and `IMPORTED` records.
  - Test verifying that demo reset preserves user-uploaded cases.
- **2–4 Minute Judge Walkthrough Flow:**
  1. Open Dashboard -> Notice `AICTE-DEMO-014` flagged with critical Fire Safety NOC expiry.
  2. Open Case -> Navigate to Evidence Vault -> Inspect expired document.
  3. Run Compliance Checks -> Observe explainable deficiency with APH 2024-27 citation.
  4. Assign Corrective Task to Administrator -> Acknowledge Alert.
  5. Record Review Decision -> View live Audit Log update.
  6. Export printable Internal Review Pack.
