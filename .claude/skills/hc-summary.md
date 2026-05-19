---
name: hc-summary
description: Use when the user asks to recall the state of the Forcepoint HC 2026 wizard, what features were added, where things live, or "where did we leave off". Outputs a comprehensive project summary covering architecture, wizard structure, key features, and recent changes. Verify file paths and step ordering against the live codebase before reporting — this document is a starting map, not the source of truth.
---

# Forcepoint HC 2026 — Health Check Wizard · Project Summary

When this skill is invoked, output the structured summary below. Verify paths and step ordering against the live codebase before reporting; this document is a starting map.

---

## Project Identity

**What it is.** Internal Forcepoint engineering tool — React 18 + TypeScript + Vite SPA — for performing customer Health Check & Maturity Assessments and generating premium-grade HTML reports. Fully offline; all state persisted to `localStorage`. No backend.

**Entry point.** `src/app/components/Dashboard.tsx` is the single source of truth for all wizard state. State flows down through props — no global state library.

**Build.** `npm run dev` for local development, `npm run build` for production. No tests or linter configured.

---

## Top-level Views (left sidebar)

The `NavigationRail.tsx` switches between five views via `ActiveView` type:
1. **HC Sessions** — saved assessments list with COMPLETED badges + system backup buttons
2. **HC Rule Engine** — template / question library editor (`TemplateManager.tsx`)
3. **Product Lifecycle** — global Forcepoint product version/EoL catalogue (`VersionDataPage.tsx`)
4. **OS / Browser Support Matrix** — global F1E endpoint compatibility catalogue (`EndpointMatrixPage.tsx`)
5. **Health Check Wizard** — the 18-step assessment flow. **Clicking this icon starts a brand-new session** (resets all wizard state via `handleNewSession`).

---

## Wizard Structure (18 steps · `TOTAL_STEPS` = 18)

Defined in [`src/app/constants/steps.ts`](src/app/constants/steps.ts). The `StepN…` filenames do NOT match display order — they were preserved when new steps were inserted. Confirm routing in [`MainContent.tsx`](src/app/components/MainContent.tsx).

| Step | Label | Component file |
|---|---|---|
| 1  | Customer Information | `Step1CustomerInfo.tsx` |
| 2  | Product Scope | `Step2ProductScope.tsx` |
| 3  | Data Collection | `Step3DataCollectors.tsx` |
| 4  | Version & EoS Analysis | `Step4VersionCheck.tsx` |
| 5  | Server Infrastructure | `StepServerDetails.tsx` |
| 6  | **Endpoint Agent Analysis** (DLP-only) | `StepEndpointAgentAnalysis.tsx` |
| 7  | **Agent Compatibility** (DLP-only) | `StepEndpointCompatibility.tsx` |
| 8  | Per-Product Checklist | `Step6ProductChecklist.tsx` |
| 9  | Parsing & Analysis | `Step7ParsingAnalysis.tsx` |
| 10 | Certificate Analysis | `Step7CertificateAnalysis.tsx` |
| 11 | Recommendations | `Step8Recommendations.tsx` |
| 12 | Version Upgrade Proposals | `StepVersionUpgrades.tsx` |
| 13 | Next Steps & Roadmap | `Step9NextSteps.tsx` |
| 14 | Customer Feature Requests | `Step10FeatureRequests.tsx` |
| 15 | Recommended Enhancements | `StepRecommendedEnhancements.tsx` |
| 16 | License Gap | `StepLicenseGap.tsx` |
| 17 | Summary & Review | `Step10Summary.tsx` |
| 18 | Final Export | `Step11Summary.tsx` |

### Step-skip system

`steps.ts` defines `STEP_SKIP_RULES` — predicates keyed by step ID that hide a step when its product isn't in Step 2's scope. Current rules:
- Step 6 (Endpoint Agent Analysis) — hidden when `!selectedProducts.data`
- Step 7 (Agent Compatibility) — hidden when `!selectedProducts.data`

Helpers `isStepSkipped()` and `nextVisibleStep()` drive: Sidebar list filtering, BottomPanel dot strip + progress, Dashboard's prev/next, and a `useEffect` auto-correct that advances `currentStep` forward if the user lands on a now-hidden step (e.g. after deselecting DLP). Step IDs stay stable (STEP_COLORS / state keys don't shift); only visibility filters.

### Product-conditional Data Collection (Step 3)

Step 3 filters its sections by `selectedProducts`:
- **DLP-only**: DLP Server Info bundle upload, Customer DLP Dashboard PDF, DLP REST API connector, Data Security report group
- **V-Series-only** (`appl || vappl`): V Series API connector
- **NGFW-only**: NGFW SMC API connector
- **Web/DLP/Email** (any): SQL Server section, Report Selection panel (includes the Bulk Run card — Top X + Last Y + "Run N Selected" button)
- **Web**: Web Security report group
- **Email**: Email Security report group

The SQL Server section's DATABASE field is informational only for DLP queries — the companion server (port 3001) pins the connection to `wbsn-data-security` for any `sqlKey` starting with `dlp_`. The field still applies to `/api/sql/test` connectivity probes against arbitrary databases.

---

## SQL Companion Server (runtime only — no persistence)

The wizard cannot speak TCP from the browser, so DLP report queries are executed via a Node companion service that the operator runs alongside the wizard.

- **Location:** [server/](server/) — Express + cors + mssql, port 3001
- **Boot:** `cd server && npm install && npm start`
- **Endpoints:**
  - `POST /api/sql/test` — connection probe; returns version/edition/latency/login/DB
  - `POST /api/sql/query` — body: `{ ...SqlConfig, sqlKey, windowDays?, topN? }` → rows + rowCount + latency
  - `GET /api/sql/queries` — list of registered templates
  - `GET /health` — liveness
- **DB pinning:** For any `sqlKey` starting with `dlp_`, the server forces `database = 'wbsn-data-security'` regardless of caller input. `/api/sql/test` honors the caller's DB.
- **Query registry:** [server/queries.mjs](server/queries.mjs) — templates are `({ days, topN }) => string`. Each builds dynamic SQL against `PA_EVENTS_<ONLINE_ACTIVE partition>` from `PA_EVENT_PARTITION_CATALOG`. Two integer sanitisers (`sanitiseDays`, `topClause`) guard SQL injection — no string smuggling possible.
- **Templates registered (DLP):** `dlp_top_violators`, `dlp_top_policies`, `dlp_sensitive_data`, `dlp_repeated_exfil`, `dlp_cloud_uploads`, `dlp_critical_users`, `dlp_user_risk_profile`, `dlp_user_anomaly` (fixedWindow: 7-vs-100 spike), `dlp_domain_cluster`, `dlp_ai_usage`, `dlp_genai_leaks` (per-destination GenAI + cloud incident counts), `dlp_false_positive`. Web/Email templates not yet registered.
- **Runtime state:** `reportRuns: Record<string, ReportRunResult>` — `useState` in Dashboard (NOT `useLocalStorage`). Dies on refresh. Shape lives in [src/app/constants/reportDefinitions.ts](src/app/constants/reportDefinitions.ts).
- **Per-row Run:** [Step3DataCollectors.tsx](src/app/components/steps/Step3DataCollectors.tsx) `runReport(sqlKey, days, topN?)` — fires one query, inline result preview (first 10 rows) opens below the row on success.
- **Bulk Run:** Gray card above Report Selection list. Top X dropdown (5/10/20/50/100/All) + Last Y dropdown (WINDOW_OPTIONS) + "Run N Selected" button. Sequential execution; progress label `Running 3/12…`.
- **Report consumption:** [Step11Summary.tsx](src/app/components/steps/Step11Summary.tsx) `buildReportHTML` reads `reportRuns` and renders one card per selected report under Web/DLP/Email Security Usage via the in-scope helper `renderUsageReportCard(r, i, theme)`. Four states: OK+rows → table (first 12 rows, dynamic columns), OK+0 rows → no-activity note, ERROR → red pill, idle/running/undefined → PENDING placeholder.
- **Prop chain:** Dashboard → MainContent → {Step3DataCollectors writes, Step11Summary reads}. The user's hard rule is "runtime only" — never promote `reportRuns` to localStorage.

---

## State Architecture

Each persistent state slice uses the `useLocalStorage` hook with a stable key:

| Key | Content |
|---|---|
| `hc_sessions` | Saved HC sessions list |
| `hc_checklist_answers` | Active session checklist answers |
| `hc_version_entries` | Version check entries (supports `removed: true` tombstones + `isCustom` overrides) |
| `hc_server_details` | Server inventory |
| `hc_recommendations` | Recommendations (with `featured?: boolean` for ★ toggle) |
| `hc_action_items` | Action items (with `featured?: boolean`) |
| `hc_feature_requests` | Customer FRs |
| `hc_templates` | Global rule-engine templates (cross-session) |
| `hc_version_data` | Product Lifecycle catalogue (cross-session, global) |
| `hc_endpoint_support_matrix` | OS/Browser Support Matrix catalogue (cross-session, global) |
| `hc_dlp_bundles` | Parsed DLP Server bundles |
| `hc_certificates` | Imported X.509 certificates |
| `hc_enhancements` | Selected Recommended Enhancement IDs |
| `hc_enhancement_overrides` | Per-session content overrides for enhancements (name/tagline/body) |
| `hc_endpoint_agents` | Endpoint Agent CSV summary (bounded JSON) |
| `hc_endpoint_compat_input` | Per-session Step 7 customer-environment form state |
| `hc_endpoint_compat_assessment` | Per-session Step 7 computed assessment output |
| `hc_dlp_dashboard` | DLP Manager PDF summary |
| `hc_customer_logo` | Base64 data URL of customer logo |
| `hc_license_gaps` | License gap entries |
| `hc_selected_reports` | Selected usage report IDs |
| `hc_compliance_frameworks` | Per-session user-curated compliance scope (Step 1) |
| `hc_version_upgrades` | Step 12 version upgrade proposals |

`localStorage` budget ~5 MB. Large CSV/PDF inputs stored as bounded summaries, never as raw blobs.

---

## Session Completion Model

`HCSession.completedAt: Date | null` — set by `handleComplete()` when the operator clicks **Done** on Step 18. Source of truth for completion (NOT `currentStep === TOTAL_STEPS` — reaching the last step without clicking Done still counts as in-progress). SessionsPage shows a green "COMPLETED" badge for sessions with `completedAt`. Done is non-destructive: a completed session can be reopened and re-marked, which refreshes the timestamp.

---

## System Backup (Sessions page)

`src/app/utils/systemBackup.ts` exports:
- `downloadBackup()` — dumps every `hc_*` localStorage key into a versioned envelope JSON (`forcepoint-hc-backup-YYYY-MM-DDTHH-MM-SS.json`)
- `parseBackup()` + `summarize()` + `applyBackup()` — three-stage restore: validate, preview summary modal, replace all hc_* keys + reload page

Sessions page has **Export Backup** / **Import Backup** buttons next to "New HC Session". Restore is destructive; modal shows session/template/matrix counts before confirming.

---

## Catalogue Page Toolbar Convention

The three global-catalogue pages (`VersionDataPage`, `EndpointMatrixPage`, `TemplateManager`) share an identical header pattern:

`[Saved✓ flash] [Add Row primary blue] [Save] [Export JSON] [Import JSON] [Import HTML] [Clear all]`

- **Saved✓** — green pill that flashes 1.5s after every edit or explicit Save (useEffect on the state ref, skipped on first mount)
- **Save** — no-op against state (useLocalStorage already auto-persists); just triggers the flash. Decorative confirmation gesture.
- **Export JSON** — Blob download with wrap envelope: `{ _format: "...", _version: 1, _exportedAt, <payload> }`. Filename pattern: `<scope>-YYYY-MM-DD.json`
- **Import JSON** — file picker → shape validation → accepts either bare payload or envelope. Re-stamps row IDs to keep React keys stable
- **Import HTML** — page-specific (matrix HTML / lifecycle HTML)
- **Clear all** — double-click confirm pattern ("Click again to clear")

When the catalogue is empty: **Save, Export, Clear all are hidden**; Add Row + Import buttons stay visible. The body shows an empty-state CTA card (dashed border, gradient icon, primary blue Import HTML button + source link).

---

## Parsers (browser-side)

| Parser | Input | Output |
|---|---|---|
| `dlpServerInfoParser.ts` | DLPServerInfo bundle folder | Per-server hardware, services, SQL, policies |
| `certificateParser.ts` | X.509 PEM/DER/CER | Subject, issuer, validity, key strength |
| `endpointAgentParser.ts` | Endpoint Status Log CSV (`;`-delimited, UTF-8 BOM) | 13-section summary |
| `dlpDashboardParser.ts` | DLP Manager PDF | Severity/action/channel/policy/URL counts; department-level rollup |
| `forcepointHtmlImporter.ts` | Forcepoint Product Lifecycle HTML | Version data catalogue merge |
| `endpointMatrixHtmlImporter.ts` | F1E Endpoint Support Matrix HTML | Windows/macOS/VDI/Browsers/Critical Notes (permissive table-classifier) |
| `endpointCompatibilityEngine.ts` | Customer-env input + endpoint matrix | Findings, OS/browser compatibility rows, critical notes, upgrade recommendation |
| `complianceSuggest.ts` | country/region/industry | Auto-suggested compliance frameworks for Step 1 |

PDF parsing uses `pdfjs-dist` with Vite-bundled worker. F1E version comparison uses `YY.MM.BUILD` ordering; min-version row strings like `"v25.02.5708+, v26.02.5749"` are tokenized to find the lowest required.

---

## Report Generation (`Step11Summary.tsx`, ~4,000 lines)

The customer-facing HTML report is built by `buildReportHTML()`. Structure:
- **Cover page** — Navy hero, customer card with optional logo, KPI tiles
- **Part 0 · CISO Briefing** — Aggregate Finding Breakdown (version × infra × checklist × cert/support matrix), Compliance Frameworks, Top Risks cards
- **Part I · Executive Brief** — Verdict, health gauge, severity chart, KPIs, score deductions, Key Observations, High-Level Recommendations, Top Priority Actions, DLP Activity Snapshot
- **Part II · Technical Assessment** — Version & EoL, server health, DLP bundles, Endpoint Agent Analysis, Certificate Analysis, Per-product scorecard, Checklist findings
- **Part III · Roadmap** — Findings + Recommendations, Action Items, FRs, **Version Upgrades**, License Gap, Enhancements, **F1E Endpoint Compatibility Assessment** (Section 14 — driven by Step 7's assessment; falls back to raw matrix if no assessment, suppressed entirely if both empty)
- **Part IV · Reference** — Appendix Effort Score Card

Critical: `versionGroups` in Step11Summary filters by `selectedProducts[grp.productId]` AND excludes `removed: true` tombstones AND deduplicates "overridden" catalog rows (isCustom + catalog id). `vCounts` derives from the filtered set, not `versionEntries` directly — keeps cover headline consistent with body tables.

---

## Brand Palette

```
--fp-navy:      #023E8A
--fp-cyan:      #36B0C9
--fp-violette:  #A30080  (CRITICAL)
--fp-red:       #DA1B2E  (HIGH)
--fp-yellow:    #FDCE12  (MEDIUM, text #B58800)
--fp-green:     #69BC00  (OK)
--fp-ink:       #1D252C
```

Fonts: Inter (body, headings) + JetBrains Mono (versions, IDs, dates) via Google Fonts.

---

## Sensitive Data — Redacted from Report

- Service Run-As accounts, AD Domain, Logon Server — parsed but not rendered
- Individual user names from DLP Dashboard PDF — department-level rollup only

---

## Conventions

1. **Don't rename `StepN…` files** — paths are load-bearing across the wizard router.
2. **All persistence through `useLocalStorage`** — never call `localStorage` directly.
3. **Report design tokens are fixed** (FP brand palette) — do not change without sign-off.
4. **Bounded summaries** in localStorage — raw CSV/PDF data never persisted.
5. **PII redaction by default** in customer-facing report.
6. **Internal-only software** — no external telemetry or third-party network calls.
7. **JSON export envelope** for catalogue files: `{ _format, _version, _exportedAt, <payload> }` — future-proof for schema migration.
8. **Empty state CTA pattern** for global catalogues — gradient icon + title + description + primary blue button + source link.

---

## Recent Major Changes (most recent first)

- **SQL companion server + Bulk Run + report-time SQL result rendering** — Node companion at [server/](server/), DLP queries server-pinned to `wbsn-data-security`, per-row Run + bulk runner with Top X / Last Y selectors, results threaded through `reportRuns` (runtime-only useState) into the Web/DLP/Email Security Usage sections of the Final Export via `renderUsageReportCard()`. Added `dlp_genai_leaks` (GenAI + cloud destination incident counts) to the registry. Memory: [[project-hc-sql-runtime]]
- **CISO Briefing redesigned Summary & Review (Step 17)** — graphical/statistical card layout, no body text, replaces the prior detail dump
- **Forcepoint's Commitment closing section** in the report
- **MV3 false-CRITICAL fix** — engine renamed `CHROME_MV3_BREAKING_AGENT` → `FORCEPOINT_LATEST_FLOOR`; v25.09+ no longer flagged as breaking; replaced with single MEDIUM advisory for Chromium browsers on pre-26.02 streams
- **Generate Executive Report stuck-button fix** — try/catch wrapper around `handleExport` surfaces build errors as alerts instead of leaving the button in "Generating" forever
- **Agent Compatibility report-section gating** — Section hidden in the report when DLP is not in scope
- **Dynamic TOC + Product Lifecycle row icons** — replaced static `Section 08 · Endpoint OS & Browser Support Matrix` references; lifecycle rows show correct status icons
- **Product-conditional steps + Data Collection sections** — Step 6/7 hidden when DLP not selected; Step 3 sections filtered per Step 2 selections
- **Wizard menu icon = new session** — clicking Health Check Wizard in left rail starts a fresh session
- **HC Rule Engine save buttons rewired** — old File System Access "Save Config" replaced with the catalogue-page toolbar pattern (Save flash + Export JSON envelope + Import JSON)
- **System Backup** — full localStorage export/import via Sessions page, three-stage restore with preview modal
- **Session completion model** — `completedAt` field + Done button on Step 18, COMPLETED badge on Sessions list
- **Product Lifecycle empty state** — when all categories cleared, page shows Import HTML CTA pointing at https://support.forcepoint.com/s/productsupportlifecycle
- **OS / Browser Support Matrix** as a new left-rail menu — global catalogue, populated from F1E support-matrix HTML import (no bundled defaults). Empty when not imported; report Section 14 suppressed
- **F1E Endpoint Compatibility Assessment** (Step 7) — customer-env form + live dashboard cards, generates findings + upgrade recommendation against the global matrix. Replaces raw matrix dump in the report
- **Version Upgrade Proposals** (Step 12) — per-session list of product upgrade proposals (product / from / to / what's new / bug fixes / known issues / priority)
- **Compliance Frameworks selector** in Step 1 — auto-suggested from country/industry via `complianceSuggest.ts`, user-curated, drives Part 0 of the report
- **DLP component count bug fix** — Step11Summary `versionGroups` filter now mirrors Step 4's tombstone + product-scope rules; eliminated duplicate rendering of overridden catalog rows
- **★ Featured toggles**, **DLP Dashboard PDF parser**, **endpoint agent CSV parser**, **Customer logo upload**, **Sensitive field redaction**, **Brand palette migration** — see earlier history

---

## File-path index for fast recall

- Wizard state hub: [Dashboard.tsx](src/app/components/Dashboard.tsx)
- Step routing: [MainContent.tsx](src/app/components/MainContent.tsx)
- Step constants + skip rules: [steps.ts](src/app/constants/steps.ts)
- Sessions page (+ backup buttons): [SessionsPage.tsx](src/app/components/SessionsPage.tsx)
- Catalogue pages: [VersionDataPage.tsx](src/app/components/VersionDataPage.tsx), [EndpointMatrixPage.tsx](src/app/components/EndpointMatrixPage.tsx), [TemplateManager.tsx](src/app/components/TemplateManager.tsx)
- New wizard step: [StepEndpointCompatibility.tsx](src/app/components/steps/StepEndpointCompatibility.tsx)
- Backup helpers: [systemBackup.ts](src/app/utils/systemBackup.ts)
- Compatibility engine: [endpointCompatibilityEngine.ts](src/app/utils/endpointCompatibilityEngine.ts)
- Matrix HTML parser: [endpointMatrixHtmlImporter.ts](src/app/utils/endpointMatrixHtmlImporter.ts)
- Report builder: [Step11Summary.tsx](src/app/components/steps/Step11Summary.tsx)
- Data Collection step + Bulk Run UI: [Step3DataCollectors.tsx](src/app/components/steps/Step3DataCollectors.tsx)
- Report definitions + runtime result shape: [reportDefinitions.ts](src/app/constants/reportDefinitions.ts)
- SQL companion server: [server/index.mjs](server/index.mjs), [server/queries.mjs](server/queries.mjs), [server/package.json](server/package.json)
