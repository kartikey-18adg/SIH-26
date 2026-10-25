# AIClear — Data Source Feasibility Matrix & Official Source Inventory

**Document Version:** 1.0.0  
**Last Verified At:** 2026-10-25T09:20:00+05:30  
**Project:** AIClear (Integrated AICTE Approval Workflow Automation, Compliance Monitoring, and Alert Management System)  
**Verification Standard:** Direct inspection of official Ministry of Education / AICTE publications, gazettes, and portal endpoints. No unverified third-party assumptions.

---

## 1. Executive Summary: Data Source Landscape

AICTE (All India Council for Technical Education) regulates technical education in India across Engineering, Technology, Management, Architecture, Pharmacy, Hotel Management, and Computer Applications (MCA/BCA). Approval processes are governed by the **Approval Process Handbook (APH)**, which is revised triennially or annually.

### Key Finding on Real-Time API Access:
- **No Anonymous Public REST APIs:** AICTE does not provide unauthenticated, anonymous public JSON REST APIs for application submission, deficiency querying, or live application tracking.
- **One Nation One Data (ONOD):** While architected with 2-way Open APIs under the National Digital Education Architecture (NDEAR) / InDEA 2.0 framework, **access is restricted** to accredited institutions, state Directorates of Technical Education (DTEs), and regulatory agencies via formal onboarding through the National Educational Technology Forum (NETF).
- **Authoritative Operational Pathway:** The only compliant, realistic, and legally sound architecture for technical institutions is **Institutional Ingestion of Authorized Dossiers** (CSV/XLSX schedules + PDF supporting evidence) alongside **Deterministic Codification of the Official Approval Process Handbook (2024–2027)**.
- **Public Reference Enrichment:** AISHE codes and state/district directory lists can be referenced from Open Government Data (`data.gov.in`) or AISHE portals for metadata normalization, but contain zero private application case records.

---

## 2. Source Feasibility Matrix

| Source Name | Official / Third-Party | Owner / Publisher | Canonical URL | Data Categories | Access Method | Auth Required | Format | Update Cadence | Terms / License | PII / Confidential Risk | Ingestion Method | Last Checked At | Verification Status | Confidence & Limitations | Priority |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **AICTE Approval Process Handbook (APH) 2024–2027** | Official | AICTE (Ministry of Education, GoI) | `https://www.aicte-india.org/bureaus/approval/ap-handbook` | Regulatory norms, deficiency criteria, land/building specifications, faculty-student ratios, mandatory amenities | Public HTTP Download | None (Open Public Access) | PDF (200+ pp) | Triennial (2024–2027 block) | Government Public Document | Low | Document parser / deterministic rules catalog engine | 2026-10-25 | **VERIFIED-AVAILABLE** | Official policy baseline. Rules must reference handbook version, chapter, and section. | **P1 (Core Engine)** |
| **AICTE Approved Institutions Public Directory** | Official | AICTE National Portal | `https://facilities.aicte-india.org/dashboard/` | Approved institution names, Permanent AICTE IDs, State, District, Programmes approved | Web Portal Query / Annual PDF Lists | None for web UI; dynamic session token / CAPTCHA | HTML / JSON (internal) / PDF | Annual | Government Portal Terms of Use | Low | Manual CSV/XLSX batch import of exported directory | 2026-10-25 | **MANUAL-IMPORT-ONLY** | Automated scraping violates portal terms and is fragile due to CAPTCHAs. No open API. | **P2** |
| **AICTE One Nation One Data (ONOD) / NETF** | Official | AICTE / NETF / Ministry of Education | `https://onod.aicte-india.org/` | Unified institutional profile, accreditation records, NIRF, AISHE synchronization | REST API (NDEAR / InDEA 2.0) | **Yes** (Institutional OAuth / Govt Nodal Token / MoU) | JSON REST | Real-time / Event-driven | Confidential Govt Platform; strict consent policy | **High** (Institutional records, faculty Aadhaar-linked IDs) | Secured API Connector (stubbed with warning until credentials verified) | 2026-10-25 | **VERIFIED-RESTRICTED** | **No public key or anonymous endpoint.** Must NOT be presented as active or connected without institutional credentials. | **P4 (Future Integration)** |
| **AISHE Institution Directory (MoE / data.gov.in)** | Official | Ministry of Education / NIC | `https://aishe.gov.in/`, `https://data.gov.in/` | AISHE codes, institution names, affiliating university, state, district | REST API (data.gov.in) / Bulk CSV | API Key for data.gov.in; None for public CSV downloads | CSV / JSON | Annual (historical lag of 1–2 years) | National Data Sharing and Accessibility Policy (NDSAP) | Low | Open Government Data Adapter | 2026-10-25 | **VERIFIED-AVAILABLE** | Directory enrichment only. **Contains no approval case statuses or internal compliance evidence.** | **P3** |
| **Institutional Application Dossier (Authorized Files)** | Institutional | Technical Institution Administration | Internal Institutional Records | Case details, faculty rolls, land deeds, Fire Safety NOCs, Building Plans, Society Registration | Direct User Upload (Multipart Form) | Tenant Session / RBAC Authorization | CSV, XLSX, PDF, PNG | Continuous / Per Case Workflow | Institution Proprietary / Confidential | **High** (Faculty salary data, land deeds, internal audits) | Multi-format Ingestion Pipeline (SHA256, schema validation, pre-commit preview) | 2026-10-25 | **VERIFIED-AVAILABLE** | Primary real operational ingestion path for institutional case tracking and evidence. | **P1 (Primary Real Source)** |
| **Synthetic Demonstration Fixtures** | Prototype Internal | AIClear Core Engine | `internal://fixtures/demo_v1` | Synthetic institutions (`DEMO-INST-001`), approval cases (`AICTE-DEMO-014`), evidence, rules, alerts | Local Python/JSON Seeder | None | In-Memory / Relational Seed | Static / Reset on demand | AIClear Open Source / MIT | None (Strictly fictional) | Standalone Seeder Script (`seed_demo_workspace`) | 2026-10-25 | **VERIFIED-AVAILABLE** | Clearly isolated with `data_mode = 'DEMO'`. Must never mix silently with real records. | **P0 (Hackathon Ready)** |

---

## 3. Detailed Verification Findings by Source

### 3.1 AICTE Approval Process Handbook (APH) 2024–2027
- **Verification Evidence:** Press Information Bureau (PIB) release and official AICTE Gazette confirm that APH 2024–2027 was released as a 3-year consolidated handbook (covering 2024-25, 2025-26, and 2026-27).
- **Core Regulatory Provisions:**
  - Chapter I: Grant of Approval for New Institutions.
  - Chapter II: Grant of Extension of Approval (EoA) / Increase in Intake / Additional Courses.
  - Multi-year EoA (up to 3 years) introduced for accredited/high-performing institutions.
  - Norms for built-up area, instructional area, administrative area, and amenities.
  - Faculty-Student Ratio (FSR) norms (1:15 or 1:20 depending on discipline and accreditation).
  - Fire Safety Certificate, Building Occupancy Certificate, Land Title Deed, and Trust/Society Registration requirements.
- **Limitations:** The document is distributed as a narrative PDF. For software automation, norms must be converted into deterministic, versioned rule definitions with citations.

### 3.2 AICTE One Nation One Data (ONOD)
- **Verification Evidence:** NETF and AICTE technical briefs demonstrate that ONOD is an interoperability protocol to connect regulatory databases (AICTE, NBA, NAAC, NIRF).
- **Access Truth:** The platform requires an institutional digital signature or nodal officer login. Third-party developers cannot sign up for open self-service API keys.
- **AIClear Policy:** In AIClear Settings > Data Sources, the ONOD connector must display:
  > *"Status: Verified Restricted. Access requires institutional authorization and NETF API keys. Direct anonymous sync is disabled."*
  AIClear will never simulate a fake connected state.

### 3.3 AISHE / Open Government Data (data.gov.in)
- **Verification Evidence:** The Department of Higher Education publishes the AISHE directory on data.gov.in.
- **Schema Available:** `aishe_code`, `institute_name`, `state_name`, `district_name`, `institute_type`.
- **Limitation:** Does not contain application filing dates, deficiency letters, expert committee visit (EVC) reports, or approval sanctions. It is suitable only for auto-completing institution master records.

---

## 4. Provenance & Data Mode Rules
1. Every record in the database has a mandatory `data_mode` column (`DEMO`, `IMPORTED`, `MANUAL`, `CONNECTED`).
2. Mode boundaries are strictly enforced: KPI totals and case lists for a workspace must filter strictly by `data_mode`.
3. Switching data modes in Settings > Data Sources requires confirmation and **never drops or mutates existing real records**.
