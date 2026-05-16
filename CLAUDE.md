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
The left rail ([NavigationRail.tsx](src/app/components/NavigationRail.tsx)) switches between four top-level views:
1. **HC Sessions** — saved assessments
2. **HC Rule Engine** — templates and question library
3. **Product Lifecycle** — product catalog with EOL/EOS roadmap
4. **Health Check Wizard** — 14-step assessment flow

### Wizard Flow
The 14 wizard steps live under [src/app/components/steps/](src/app/components/steps/). **Step file names (`Step7…`–`Step11…`) do not match their display order** — names were preserved when Certificate Analysis was inserted to avoid breaking import paths. Always confirm the display order in [MainContent.tsx](src/app/components/MainContent.tsx) before renaming.

### Parsers
Domain-specific parsing logic lives in [src/app/components/](src/app/components/):
- **DLP Server Info bundle parser** — ingests `DLPServerInfo_*` folders (15+ system files)
- **Certificate parser** — X.509 `.cer` / `.pem` / `.crt` / `.der` extraction

### Report Generation
Step 14 (`buildReportHTML` inside `Step11Summary.tsx`) builds a printable HTML report. Design tokens: white background, teal accents `#0ea5e9`, navy table headers `#0f2952`.

## Data Storage Keys (`localStorage`)

| Key | Content |
|---|---|
| `hc_sessions` | All saved HC sessions |
| `hc_checklist_answers` | Active session checklist answers |
| `hc_version_entries` | Version check entries |
| `hc_server_details` | Server inventory |
| `hc_recommendations` | Recommendations |
| `hc_action_items` | Action items |
| `hc_feature_requests` | Feature requests |
| `hc_templates` | Global templates |
| `hc_version_data` | Product lifecycle catalog (global) |
| `hc_sql_config` | SQL connector settings |
| `hc_api_connectors` | REST connector settings |
| `hc_selected_reports` | Selected reports |
| `hc_dlp_bundles` | Parsed DLP bundle data |
| `hc_certificates` | Imported certificates |
| `hc_enhancements` | Selected enhancements |

- **Cancel** resets current-session data.
- **Save Session** persists everything under `hc_sessions`.
- `hc_templates` and `hc_version_data` are currently **global** (not per-session); migration to per-session is planned.

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
