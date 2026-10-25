# AIClear

**Integrated AICTE Approval Workflow Automation, Compliance Monitoring, and Alert Management System**

AIClear is an institutional workflow and regulatory operations management platform designed for technical education institutions (Engineering, Management, Pharmacy, MCA, Architecture) preparing for AICTE Approval rounds under the **Approval Process Handbook (APH) 2024–2027**.

---

## Important Regulatory & Prototype Notice

> **INDEPENDENT ADMINISTRATIVE AID — NOT AN OFFICIAL GOVERNMENT PORTAL**  
> AIClear is an independent institutional workflow-management application. It is not affiliated with, authorized by, or endorsed by the All India Council for Technical Education (AICTE) or the Ministry of Education. It cannot independently grant or guarantee AICTE approvals. All deficiency items and compliance checks must be verified against current official APH guidelines.

---

## Architectural Principles & Data Mode Isolation

AIClear separates demonstration fixtures from authentic institutional data through database-enforced `data_mode` isolation:

| Data Mode | Description | Isolation Guarantee |
|---|---|---|
| `DEMO` | Coherent synthetic institutions (`DEMO-INST-001`), cases (`AICTE-DEMO-014` to `018`), sample evidence, illustrative rules, and simulated alerts. | Isolated. Can be reset without touching real records. |
| `IMPORTED` | Operational records ingested from institutional CSV/XLSX schedules with SHA-256 integrity hashing and row-level error reporting. | Authentic data only. Never blended with synthetic fixtures in KPIs. |
| `MANUAL` | Records created through structured administrative forms by authorized staff. | User-entered and fully audited. |
| `CONNECTED` | Reserved for verified official API feeds (e.g. ONOD). | Marked as *Verified Restricted* until official institutional OAuth credentials are provided. |

---

## Core System Architecture

```
aiclear/
├── backend/
│   ├── aiclear.db                  # Local SQLite database (PostgreSQL 16+ dual-compatible)
│   ├── vault/                      # Private evidence storage directory (isolated by workspace/case)
│   ├── test_master_suite.py        # Master verification suite executing Phases A through I
│   ├── test_phase_f.py             # Compliance engine & APH citation verification
│   ├── test_phase_g.py             # Alert centre, deduplication, & outbox verification
│   ├── test_phase_h.py             # Internal review pack & export verification
│   ├── test_phase_i.py             # Mode boundary hardening & judge walkthrough verification
│   └── app/
│       ├── database.py             # SQLAlchemy 2.0 engine & session dependency
│       ├── models.py               # 15 Relational ORM models with audit provenance
│       ├── schemas.py              # Pydantic v2 validation models
│       ├── seed_data.py            # Isolated synthetic seeder & demo resetter
│       ├── main.py                 # FastAPI application & CORS configuration
│       └── routers/
│           ├── workspace.py        # /api/workspace (first-run, mode switch, sources, demo reset)
│           ├── dashboard.py        # /api/dashboard/summary (dynamic database KPI aggregation)
│           ├── ingestion.py        # /api/ingestion (CSV preview, rejection report, atomic commit)
│           ├── cases.py            # /api/cases (state machine with validated transitions)
│           ├── documents.py        # /api/cases/{id}/documents (vault, versioning, review workflow)
│           ├── compliance.py       # /api/compliance (deterministic APH 2024-27 checks & overrides)
│           ├── alerts.py           # /api/alerts (scanner, deduplication, assign, resolve, outbox)
│           └── reports.py          # /api/cases/{id}/review-pack (printable dossier, JSON/CSV exports)
├── frontend/
│   ├── package.json                # Next.js 16.3.4, React 19, Tailwind CSS v4, TypeScript
│   └── src/
│       ├── app/
│       │   ├── globals.css         # Warm neutral editorial tokens (#F7F7F5, #1A1917, #E2E0D8)
│       │   ├── layout.tsx          # Root layout & institutional metadata
│       │   └── page.tsx            # Operational dashboard workspace & modal state coordinator
│       ├── components/
│       │   ├── Header.tsx          # Institutional header, role switcher & mode pill
│       │   ├── FirstRunModal.tsx   # 5-choice first-run data source selection modal
│       │   ├── DataSourceSettingsModal.tsx # Mode switcher & live Source Feasibility Register
│       │   ├── ImportDataModal.tsx # CSV ingestion with rejection reporting & preview
│       │   ├── CreateCaseModal.tsx # Administrative case initialization form
│       │   ├── MetricCards.tsx     # Dynamic KPI metric cards derived from database queries
│       │   ├── CasesTable.tsx      # Tabular cases list with CSV export & stage filtering
│       │   ├── AlertsQueue.tsx     # Alert operations centre (status tabs, assign, resolve)
│       │   ├── NotificationOutboxModal.tsx # Simulated email outbox viewer with payload inspection
│       │   ├── ReviewPackModal.tsx # Printable Internal Review Pack dossier with @media print CSS
│       │   ├── ActivityTimeline.tsx# Immutable audit trail timeline
│       │   └── CaseDetailModal.tsx # Case inspection workstation (stages, vault, compliance, audit)
│       ├── services/
│       │   └── api.ts              # REST client connecting to FastAPI backend
│       └── types/
│           └── aiclear.ts          # TypeScript domain interfaces
├── docs/
│   ├── data-source-inventory.md    # Source Feasibility Matrix & official verification records
│   ├── data-architecture.md        # Relational schema DDL & provenance specification
│   ├── implementation-phases.md    # Phased delivery plan (Phase A to Phase I)
│   └── hackathon-showcase-walkthrough.md # 2-4 minute judge presentation script
└── start_server.py                 # Backend launch script
```

---

## Quickstart & Local Execution

### 1. Launch Backend & Frontend Together (Recommended)
You can launch both the FastAPI backend and Next.js frontend concurrently with a single command:
```bash
python run_all.py
```
*(On Windows, you can also simply double-click `start.bat` or run `.\start.ps1`)*

This starts:
* **Backend API:** `http://127.0.0.1:8000` (Docs: `http://127.0.0.1:8000/docs`)
* **Frontend Web App:** `http://localhost:3000`
* Press `Ctrl+C` to cleanly terminate both services together.

---

### 2. Run Complete Verification Suite (All Phases A through I)
```bash
python backend/test_master_suite.py
```

---

### 3. Launch Services Individually (Alternative)

**FastAPI Backend Only:**
```bash
python start_server.py
```

**Next.js Frontend Only:**
```bash
cd frontend
npm run dev
```

---

## 2–4 Minute Judge Showcase Walkthrough

See [`docs/hackathon-showcase-walkthrough.md`](docs/hackathon-showcase-walkthrough.md) for the complete judge demonstration script:
1. **Dashboard Inspection:** Observe institutional warm neutral theme, tabular numerals, and live `DEMO` badge.
2. **Alert Flagged:** Case `AICTE-DEMO-014` flagged for approaching Fire Safety NOC expiry.
3. **Evidence Vault:** Inspect attached certificate, SHA-256 hash, and non-destructive versioning (`v1` ➔ `v2`).
4. **Deterministic Compliance:** Re-evaluate checks against APH 2024–27 Appendix 16; demonstrate human override with permanent audit preservation.
5. **State Machine Transition:** Advance case stage with mandatory written justification.
6. **Printable Review Pack:** Generate executive dossier with readiness score, evidence inventory, compliance audit, and formal reviewer sign-offs.
7. **Mode Boundary Proof:** Switch between `DEMO` and `IMPORTED` mode to prove zero query leakage and safe demo resets.

---

## Verified Source Feasibility Register Summary

- **AICTE Approval Process Handbook (APH) 2024–2027:** `VERIFIED-AVAILABLE` (Official public policy document used as the normative baseline).
- **AICTE Public Directory:** `MANUAL-IMPORT-ONLY` (Protected by dynamic session tokens / CAPTCHAs; automated scraping prohibited).
- **AICTE One Nation One Data (ONOD):** `VERIFIED-RESTRICTED` (Requires institutional nodal officer login and NETF accreditation; no anonymous public API).
- **AISHE & data.gov.in:** `VERIFIED-AVAILABLE` (Public directory data for entity enrichment; contains zero private case dossiers).
- **Institutional Dossier (CSV/XLSX/PDF):** `VERIFIED-AVAILABLE` (Primary operational ingestion path for institutional case tracking).
#   S I H - 2 6  
 