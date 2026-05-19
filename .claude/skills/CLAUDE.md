# CLAUDE.md

This file provides guidance to the Forcepoint Intelligence Platform when working with code in this repository.

## Project Overview

**Forcepoint HC 2026 — Health Check Wizard** is a React 18 + TypeScript + Vite internal tool used by the Forcepoint engineering team to perform customer health check assessments and generate executive-level HTML reports for Forcepoint products (Web Security, DLP, Email Security, etc.).

The application is **fully offline** — there is no backend. All state is persisted to the browser's `localStorage`.

## Commands

| Command | Description |
|---|---|
| `npm install` | Install dependencies (Node.js 18+ required) |
| `npm run dev` | Start the Vite dev server (default: `http://localhost:5173`) |
| `npm run build` | Production build → `dist/` |
| `npx vite preview` | Preview the production build locally |

There is no test runner or linter configured in `package.json`.

## Architecture

### Single Source of Truth
All session-wide state is held in [src/app/components/Dashboard.tsx](src/app/components/Dashboard.tsx) via the custom [useLocalStorage](src/app/hooks/) hook and passed down to children as props. There is no global state library — props drilling from `Dashboard.tsx` is the intended pattern.

### Navigation
The left rail ([NavigationRail.tsx](src/app/components/NavigationRail.tsx)) switches between five top-level views:
1. **HC Sessions** — saved assessments + system Backup Export/Import buttons
2. **HC Rule Engine** — templates and question library
3. **Product Lifecycle** — global product / EoL catalogue (HTML or JSON import)
4. **OS / Browser Support Matrix** — global F1E endpoint compatibility catalogue (HTML or JSON import)
5. **Health Check Wizard** — 18-step assessment flow. **Clicking this icon always starts a new session** (destructive reset of wizard state).

### Wizard Flow
The 18 wizard steps live under [src/app/components/steps/](src/app/components/steps/). **`StepN…` file names do not match display order** — they were preserved to avoid breaking imports. The router in [MainContent.tsx](src/app/components/MainContent.tsx) is the truth.

Step visibility is product-conditional. `STEP_SKIP_RULES` in [steps.ts](src/app/constants/steps.ts) hides:
- Step 6 (Endpoint Agent Analysis) and Step 7 (Agent Compatibility) when DLP isn't in Step 2's scope.

Sidebar, BottomPanel progress, prev/next, and a `useEffect` auto-correct all honour the skip rules. Step IDs stay fixed (1–18) so `STEP_COLORS` and state keys don't shift.

### Parsers
- **DLP Server Info bundle** ([dlpServerInfoParser.ts](src/app/components/steps/dlpServerInfoParser.ts)) — `DLPServerInfo_*` folders
- **Certificate** ([certificateParser.ts](src/app/components/steps/certificateParser.ts)) — X.509 .cer / .pem / .crt / .der
- **Endpoint Agent CSV** ([endpointAgentParser.ts](src/app/components/steps/endpointAgentParser.ts)) — 13-section summary
- **DLP Dashboard PDF** ([dlpDashboardParser.ts](src/app/components/steps/dlpDashboardParser.ts)) — pdfjs-dist worker, department-level rollup
- **Forcepoint Lifecycle HTML** ([forcepointHtmlImporter.ts](src/app/utils/forcepointHtmlImporter.ts)) — for Product Lifecycle import
- **F1E Endpoint Support Matrix HTML** ([endpointMatrixHtmlImporter.ts](src/app/utils/endpointMatrixHtmlImporter.ts)) — for OS/Browser Matrix import
- **Endpoint Compatibility Engine** ([endpointCompatibilityEngine.ts](src/app/utils/endpointCompatibilityEngine.ts)) — Step 7 customer-env analysis against the matrix

### Report Generation
Step 18 (`buildReportHTML` inside [Step11Summary.tsx](src/app/components/steps/Step11Summary.tsx), ~4,000 lines) builds the customer-facing HTML report. Brand palette:
```
--fp-navy:#023E8A  --fp-cyan:#36B0C9  --fp-violette:#A30080 (CRITICAL)
--fp-red:#DA1B2E (HIGH)  --fp-yellow:#FDCE12 (MEDIUM)  --fp-green:#69BC00 (OK)
```
Fonts: Inter + JetBrains Mono via Google Fonts.

### Session Completion
`HCSession.completedAt: Date | null` — set by `handleComplete()` when **Done** is clicked on Step 18. SessionsPage's COMPLETED badge filters on this field, NOT on `currentStep === TOTAL_STEPS`.

### System Backup
[systemBackup.ts](src/app/utils/systemBackup.ts) dumps every `hc_*` localStorage key to a versioned envelope (`_format`, `_version: 1`, `_exportedAt`, `keys`). Restore is destructive + requires page reload to rehydrate React state.

## Data Storage Keys (`localStorage`)

| Key | Content | Scope |
|---|---|---|
| `hc_sessions` | All saved HC sessions (with `completedAt`) | global |
| `hc_templates` | Rule-engine templates | global |
| `hc_version_data` | Product Lifecycle catalogue | global |
| `hc_endpoint_support_matrix` | OS / Browser Support Matrix | global |
| `hc_checklist_answers` | Step 8 checklist answers | session |
| `hc_version_entries` | Version check entries (supports `removed: true` + `isCustom`) | session |
| `hc_server_details` | Server inventory | session |
| `hc_recommendations` | Recommendations (with `featured?: boolean`) | session |
| `hc_action_items` | Action items (with `featured?: boolean`) | session |
| `hc_feature_requests` | Customer FRs | session |
| `hc_sql_config` | SQL connector settings | session |
| `hc_api_connectors` | REST connector settings | session |
| `hc_selected_reports` | Selected report IDs | session |
| `hc_dlp_bundles` | Parsed DLP Server bundles | session |
| `hc_certificates` | Imported X.509 certs | session |
| `hc_enhancements` | Selected Enhancement IDs | session |
| `hc_enhancement_overrides` | Per-enhancement content overrides | session |
| `hc_endpoint_agents` | Endpoint Agent CSV summary | session |
| `hc_endpoint_compat_input` | Step 7 customer-env form state | session |
| `hc_endpoint_compat_assessment` | Step 7 computed assessment | session |
| `hc_dlp_dashboard` | DLP Dashboard PDF summary | session |
| `hc_customer_logo` | Base64 logo | session |
| `hc_license_gaps` | License gap entries | session |
| `hc_compliance_frameworks` | Step 1 compliance framework selection | session |
| `hc_version_upgrades` | Step 12 upgrade proposals | session |

- **Cancel** resets current-session data.
- **Save Session** persists session-scoped keys into the active `HCSession` under `hc_sessions`.
- **Done** (Step 18) calls `handleComplete()` → saves + stamps `completedAt` + navigates to Sessions list.
- Global catalogues (`hc_templates`, `hc_version_data`, `hc_endpoint_support_matrix`) persist across sessions.

## Tech Stack Notes

- **React 18 + TypeScript** with **Vite 6** — peerDependencies, not regular deps (pnpm-style workspace).
- **Tailwind CSS 4** via `@tailwindcss/vite` — uses the new Vite plugin, not PostCSS.
- **UI**: Radix UI primitives + shadcn/ui patterns ([src/app/components/ui/](src/app/components/ui/)); MUI 7 used partially.
- **Forms**: `react-hook-form`. **Dates**: `date-fns`. **Charts**: `recharts`. **Routing**: `react-router` 7.
- Package manager: **pnpm** (see `pnpm-workspace.yaml`), but `npm install` is documented in the README.

## Deployment

Production deployment to an Ubuntu host is automated by [deploy.sh](deploy.sh):
- Installs `nginx`, `git`, `curl`, and Node.js 20 if missing.
- Clones / pulls `https://github.com/lupharos/SeBuilderHC2026.git` into `/var/www/sebuilderhc/app`.
- Runs `npm install` + `npm run build`, copies `dist/` into `/var/www/sebuilderhc/dist`.
- Writes an Nginx site config with SPA fallback (`try_files $uri /index.html`).

See [HowToSetup.md](HowToSetup.md) for the operator runbook.

## Conventions

- **Do not rename `StepN…` files** — paths are load-bearing across the wizard router.
- **All persistence goes through `useLocalStorage`** — do not call `localStorage` directly from components.
- **Report design tokens** (teal `#0ea5e9`, navy `#0f2952`, white background) are fixed for customer-facing output; do not change without product sign-off.
- This is **internal-only software** (Forcepoint LLC). Do not introduce external telemetry or third-party network calls.
