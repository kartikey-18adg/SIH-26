# Remaining Workflow Features

This branch adds operational workflow coverage for time-bound undertakings, EVC activity, configurable case pathways, and pendency analytics.

## API endpoints

All endpoints use the existing demo-role header `X-AIClear-Role`. The role header is a prototype role simulator, not production authentication.

### Configurable pathways
- `GET /api/workflows/pathways` — built-in pathway templates.
- `GET /api/workflows/cases/{case_id}/pathway` — assigned pathway for a case.
- `POST /api/workflows/cases/{case_id}/pathway` — assign a built-in template or custom stage sequence. Restricted to Administrator / Compliance Officer. Assignments are audited and constrain available stage transitions.
- `GET/POST /api/workflows/cases/{case_id}/committee-reviews` — record and inspect SAC/SHC recommendations with rationale. A `RECOMMEND` record is required before advancing from SAC/SHC to internal review.
- Supported templates: Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, Only EVC. Custom sequences must start at `DRAFT`, end at `READY_FOR_SUBMISSION`, use supported unique stages, and place EVC before SAC/SHC.
- Correction loops return to the stage from which the case was returned. Evidence review, EVC completion, SAC/SHC recommendation, and compliance disposition are enforced as transition gates. External submission and closure remain separate recorded steps.

### Undertakings / time-bound obligations
- `GET /api/obligations` — list obligations in the active data mode; supports `case_id` and `status`.
- `POST /api/obligations` — create an obligation with due date, reminder lead, escalation threshold, and responsible person.
- `PATCH /api/obligations/{id}` — update the obligation schedule / assignee.
- `POST /api/obligations/{id}/submit` — attach a document already in the same case's Evidence Vault and record submission notes.
- `POST /api/obligations/{id}/verify` — authorized reviewer/compliance officer accepts or rejects the evidence with a mandatory rationale.
- `POST /api/obligations/scan` — create idempotent due-soon / overdue alerts and simulated notifications. Verified obligations resolve their open reminder alerts.

### EVC
- `GET /api/evc/appointments` — queue and schedule list.
- `POST /api/evc/appointments` — schedule an EVC visit with configurable reminder lead.
- `PATCH /api/evc/appointments/{id}` — reschedule, cancel, mark missed, or mark completed with completion notes.
- `POST /api/evc/scan` — create idempotent upcoming / overdue EVC alerts and simulated notifications.

### Operations metrics
- `GET /api/operations/summary` — stage and region/state pendency, stage ageing based on stage history, open-case workload by owner, case deadline buckets, pending/overdue obligations, EVC counts, and documents expiring within 30 days.
- `backend/run_deadline_scans.py` — one-shot daily scanner for case deadlines/document expiry, obligations, and EVC reminders. Schedule it with Windows Task Scheduler or cron; the outbox remains simulated.

## UI

Open `/operations` from the main dashboard. It provides pathway assignment, obligation creation, vault-evidence selection, verification, EVC scheduling/completion, reminder scans, and the operational pendency / ageing / workload panels.

## Tests

The master suite includes `backend/test_obligations.py`, covering:
- Pathway assignment and out-of-sequence transition rejection.
- Obligation creation, same-case evidence submission, and authorized verification.
- Idempotent undertaking and EVC scans.
- EVC completion with notes.
- Operations metrics and audit-event creation.

Run the daily scanner from the repository root with `python backend/run_deadline_scans.py` (then schedule that command daily for unattended reminders). Run tests from the repository root:
```bash
python backend/test_master_suite.py
```

Reminder windows and the 14-day stalled-stage alert threshold are prototype configuration values, not official AICTE deadlines. Notification delivery is simulated. A real deployment still needs production authentication, secure notification-provider configuration, database migrations, and institution-authorized integration credentials. AIClear does not make statutory decisions.
