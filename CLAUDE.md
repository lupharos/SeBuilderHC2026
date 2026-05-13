# Forcepoint HC 2026 — Claude Code Context

## Project Identity
This is the **Forcepoint Intelligence Platform** HC (Health Check) Wizard — a React + TypeScript + Vite app used by Forcepoint engineers to conduct customer health check assessments and generate executive PDF reports.

> Never call it "Claude" in the UI. It is always the **Forcepoint Intelligence Platform**.

---

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (utility classes)
- lucide-react (icons)
- `useLocalStorage` hook at `src/app/hooks/useLocalStorage.ts`
- No backend — all state is localStorage-persisted

---

## Key Architecture

### State Management (Dashboard.tsx is the single source of truth)
All session-bound data lives in `Dashboard.tsx` via `useLocalStorage` and is passed as props down the tree. The following are all saved/loaded/reset per session:

| State | localStorage key | Default |
|---|---|---|
| sessionData | — (React state only) | EMPTY_SESSION_DATA |
| selectedProducts | — | {} |
| checklistAnswers | `hc_checklist_answers` | {} |
| versionEntries | `hc_version_entries` | {} |
| serverDetails | `hc_server_details` | DEFAULT_SERVERS |
| recommendations | `hc_recommendations` | [] |
| actionItems | `hc_action_items` | [] |
| featureRequests | `hc_feature_requests` | [] |
| templates | `hc_templates` | initialTemplates |
| versionData | `hc_version_data` | INITIAL_VERSION_DATA |
| sqlConfig | `hc_sql_config` | DEFAULT_SQL_CONFIG |
| apiConnectors | `hc_api_connectors` | DEFAULT_API_CONNECTORS |
| selectedReports | `hc_selected_reports` | ALL_REPORT_IDS |
| dlpBundles | `hc_dlp_bundles` | [] |
| certificates | `hc_certificates` | [] |
| selectedEnhancements | `hc_enhancements` | [] |

### Sessions (HCSession interface in Dashboard.tsx)
Sessions include ALL 4 lifted fields (serverDetails, recommendations, actionItems, featureRequests). Old sessions without these fields get defaults via `deserializeSessions()`.

### Prop Flow
`Dashboard` → `MainContent` → individual step components  
All 4 session-bound data pairs are threaded as `[value, setter]` props.

---

## Navigation (NavigationRail.tsx)
Order (top → bottom):
1. **HC Sessions** (`sessions`) — FolderOpen icon
2. **HC Rule Engine** (`templates`) — Braces icon — formerly "HC Templates"
3. **Product Lifecycle** (`versions`) — Layers icon — formerly "Version Data"
4. **Health Check Wizard** (`wizard`) — ClipboardCheck icon

---

## Wizard Steps (14 total, TOTAL_STEPS = 14)
| Step | Component | Notes |
|---|---|---|
| 1 | Step1CustomerInfo | sessionData, licenses, cases, etc. |
| 2 | Step2ProductScope | selectedProducts |
| 3 | Step3DataCollectors | SQL/REST connectors, report selection, **DLP Server Info** (DLPServerInfo_* bundle folder upload → parses 15+ files for the report) |
| 4 | Step4VersionCheck | versionEntries + exports: CATALOG, GROUP_CONFIG, resolveLatest, resolveInstalledDates, STATUS_CFG |
| 5 | StepServerDetails | serverDetails prop (lifted to Dashboard) |
| 6 | Step6ProductChecklist | checklistAnswers |
| 7 | Step7ParsingAnalysis | checklistAnswers |
| 8 | **Step7CertificateAnalysis** | **NEW** — imports .cer/.pem/.crt/.der files. In-house X.509 parser extracts subject CN, issuer CN, validity, key bits, algorithm, CA flag. Comparison table mimics customer-facing layout. |
| 9 | Step8Recommendations | recommendations prop (lifted to Dashboard) — wizard position 9 |
| 10 | Step9NextSteps | actionItems prop (lifted to Dashboard) — wizard position 10 |
| 11 | Step10FeatureRequests | featureRequests prop (lifted to Dashboard) — wizard position 11 |
| 12 | **StepRecommendedEnhancements** | **NEW** — 6 Forcepoint product cards (License Expansion, DSPM, Data Classification, Email Security, RBI, AMDP). Selected entries render as full-detail section at the end of the executive report. |
| 13 | Step10Summary | summary dashboard (read-only view) — wizard position 13 |
| 14 | Step11Summary | executive report + HTML export — wizard position 14 |

> **Note on file naming:** the existing `Step7…`-`Step11…` filenames refer to their pre-2026-05-13 wizard positions. After inserting Certificate Analysis at position 7, the wizard positions in `MainContent.tsx` shifted by +1. Filenames were intentionally NOT renamed to keep imports stable.

---

## Exported Types (used across files)
From `StepServerDetails.tsx`: `ServerEntry`, `DriveInfo`, `ServerType`, `DEFAULT_SERVERS`  
From `Step8Recommendations.tsx`: `Recommendation`  
From `Step9NextSteps.tsx`: `ActionItem`  
From `Step10FeatureRequests.tsx`: `FeatureRequest`  
From `Step4VersionCheck.tsx`: `CATALOG`, `GROUP_CONFIG`, `resolveLatest`, `resolveInstalledDates`, `STATUS_CFG`, `VersionEntry`
From `dlpServerInfoParser.ts`: `parseDlpBundle`, `parseSystemInfoData`, `formatMemoryGB`, `memoryUsagePct`, `statusColor`, `DlpServerBundle`, `SystemInfoData`, `HardwareInfo`, `OsHotfixes`, `ServicesInfo`, `SqlServerInfo`, `DatabaseInfo`, `EndpointClients`, `ActivePolicies`, `ForcepointProducts`, `InstalledProduct`, `NetworkAdapter`, `UploadedFile`
From `certificateParser.ts`: `parseCertificateFile`, `parseSingleCertificate`, `formatRemaining`, `certStatusColor`, `certStatusIcon`, `ParsedCertificate`, `DistinguishedName`

---

## HTML Report (Step11Summary.tsx — buildReportHTML)
The executive report is generated as a printable HTML string opened in a new tab.

**Sections (conditional):**
1. Cover page
2. Table of Contents (dynamic)
3. Introduction
4. Executive Summary (KPI grid + Key Observations + Recommendations + Next Steps)
5. Infrastructure & Version Review (grouped by GROUP_CONFIG, resolves dates from versionData)
6. Server Infrastructure
7. **DLP Server Bundle Analysis** — only if user uploaded a `DLPServerInfo_*` bundle in Step 3. Per-bundle card with: KPI grid (CPU / RAM / Disk / Patch status), Forcepoint Products, SQL Server + Database, System Properties, Network Adapters, OS Hotfixes (with patch age), Websense Services (running / not-running), Endpoint Clients, Active Policies & Rules, Third-Party Installed Apps, DEP status
8. **Certificate Analysis** — only if user imported certificates in Step 7. Side-by-side comparison table (Type, CN/Subject, Issuer, Key, Algorithm, Valid From/To, Remaining, CA Flag, Self-Signed, Serial). Expired and expiring-soon certs bubble up to Executive Summary observations as CRITICAL/HIGH.
9. Per-Product Security Assessment
8. Checklist Findings — shows answer given + description + remediation per question
9. **Web Security Usage** — 15 reports, only if `web` template selected
10. **Data Security Usage** — 15 reports, only if `dlp` template selected
11. **Email Security Usage** — 15 reports, only if `email` template selected
12. Recommendations
13. Action Items & Next Steps
14. Enhancement Requests
15. Licensing & End-of-Life Analysis
16. Appendix — Effort Score Card

Web/Data/Email Usage sections are PENDING placeholders — will be populated via SQL integration.

**Design:** White background, teal `#0ea5e9` accents, dark navy `#0f2952` table headers. Matches Forcepoint Akbank PDF style.

---

## BottomPanel (BottomPanel.tsx)
Buttons (left → right): **Cancel** (red — discards in-progress data after confirm, goes to sessions view) | **Save Session** | Back | Continue
`onCancel` prop → `handleCancel` in Dashboard: shows `window.confirm`, then resets all session-bound state (sessionData, selectedProducts, checklistAnswers, versionEntries, serverDetails, recommendations, actionItems, featureRequests, sqlConfig, apiConnectors, selectedReports, dlpBundles, certificates, selectedEnhancements) and navigates to `'sessions'` view. Previously saved sessions in `hc_sessions` are not affected.

---

## New Session Reset
`handleNewSession` in Dashboard resets ALL state including the 4 lifted fields (serverDetails → DEFAULT_SERVERS, others → []).

---

## Pending / Future Work
- Web / Data / Email Security Usage report sections: populate via SQL integration
- Session save/load does NOT yet save `versionData` (the product lifecycle catalog) — it's global, not per-session
- The `hc_templates` key stores customized templates globally (not per-session)

---

## Build
```
npx vite build   # production build, should be clean
npm run dev      # dev server
```
Build produces a chunk size warning (>500kB) — this is expected due to large HTML template strings, not an error.
