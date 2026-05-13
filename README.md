Forcepoint HC 2026 — Health Check Wizard

Forcepoint Intelligence Platform is a React + TypeScript + Vite-based internal tool used to perform customer health check assessments and generate executive-level PDF/HTML reports.

This application was developed by the Forcepoint engineering team to standardize evaluations of Forcepoint products (Web Security, DLP, Email Security, etc.) in customer environments, including versioning, configuration, certificates, and infrastructure assessments.

Table of Contents
Features
Technology Stack
Installation
Running the Application
Architecture Overview
Wizard Steps
Data Storage
Report Output
Folder Structure
Features
14-step Health Check Wizard — end-to-end flow from customer information to executive reporting
HC Sessions — save, load, and compare multiple customer assessments
HC Rule Engine — customizable question / recommendation / action templates
Product Lifecycle — Forcepoint product catalog with version and EOL/EOS tracking
DLP Server Info Bundle Parser — imports DLPServerInfo_* folders and parses 15+ system files (system info, hardware, services, SQL, network adapters, hotfixes, endpoints, active policies)
Certificate Analysis — parses .cer / .pem / .crt / .der X.509 certificates; extracts subject, issuer, validity, key size, CA flags
Recommended Enhancements — adds Forcepoint product suggestions such as License Expansion, DSPM, Data Classification, Email Security, RBI, AMDP
HTML Executive Report — printable, customer-ready report (Cover, TOC, KPI grid, observations, recommendations, action items, appendix)
Fully offline — no backend; all data stored in localStorage
Technology Stack
Layer	Technology
Framework	React 18, TypeScript
Build Tool	Vite 6
Styling	Tailwind CSS 4
UI Library	Radix UI primitives, MUI 7 (partial), lucide-react
Forms / Validation	react-hook-form
Date Handling	date-fns
Charts	recharts
Routing	react-router 7
State Persistence	custom useLocalStorage hook
Installation
git clone <repo-url>
cd "Forcepoint HC 2026"
npm install

Node.js 18+ is required.

Running the Application
Command	Description
npm run dev	Starts development server (default: http://localhost:5173)
npm run build	Builds for production (output: dist/)
npx vite preview	Previews production build locally
Architecture Overview
Single Source of Truth: Dashboard.tsx

All session-wide data is managed inside Dashboard.tsx using useLocalStorage and passed down to child components as props. There is no backend; everything runs in the browser.

Navigation Rail (left menu)
HC Sessions — saved assessments
HC Rule Engine — templates and question library
Product Lifecycle — product catalog and version roadmap
Health Check Wizard — 14-step assessment flow
Wizard Steps
#	Step	Description
1	Customer Info	Customer details, licensing, open cases
2	Product Scope	Products included in assessment
3	Data Collectors	SQL/REST connectors, report selection, DLP bundle upload
4	Version Check	Installed vs latest versions, EOL/EOS status
5	Server Details	Server inventory, disk, roles
6	Product Checklist	Product-specific control questions
7	Parsing Analysis	Log/configuration analysis results
8	Certificate Analysis	X.509 certificate import and comparison
9	Recommendations	Recommendation list
10	Next Steps	Action items
11	Feature Requests	Customer requests
12	Recommended Enhancements	Forcepoint product suggestions (DSPM, RBI, AMDP, etc.)
13	Summary Dashboard	Read-only summary
14	Executive Report	HTML report generation and export

Note: Step file names Step7…–Step11… reflect the structure before Certificate Analysis was added. Names were not changed to preserve import paths.

Data Storage

The following keys are stored in localStorage:

Key	Content
hc_sessions	All saved HC sessions
hc_checklist_answers	Active session checklist answers
hc_version_entries	Version check entries
hc_server_details	Server inventory
hc_recommendations	Recommendations
hc_action_items	Action items
hc_feature_requests	Feature requests
hc_templates	Global templates
hc_version_data	Product lifecycle catalog (global)
hc_sql_config	SQL connector settings
hc_api_connectors	REST connector settings
hc_selected_reports	Selected reports
hc_dlp_bundles	Parsed DLP bundle data
hc_certificates	Imported certificates
hc_enhancements	Selected enhancements

The Cancel button resets current session data. Save Session stores everything under hc_sessions.

Report Output

Step 14 — buildReportHTML generates a printable HTML report including:

Cover page
Table of Contents (dynamic)
Introduction
Executive Summary — KPI grid, key observations, recommendations, next steps
Infrastructure & Version Review
Server Infrastructure
DLP Server Bundle Analysis (if uploaded)
Certificate Analysis (if imported)
Per-product Security Assessment
Checklist Findings
Web / Data / Email Security Usage (15 reports each; SQL integration pending)
Recommendations
Action Items & Next Steps
Enhancement Requests
Licensing & End-of-Life Analysis
Appendix — Effort Score Card

Design: White background, teal accents #0ea5e9, dark navy table headers #0f2952.

Folder Structure
src/
├── app/
│   ├── Dashboard.tsx
│   ├── MainContent.tsx
│   ├── NavigationRail.tsx
│   ├── BottomPanel.tsx
│   ├── hooks/
│   │   └── useLocalStorage.ts
│   ├── steps/
│   │   ├── Step1CustomerInfo.tsx
│   │   ├── Step2ProductScope.tsx
│   │   ├── Step3DataCollectors.tsx
│   │   ├── Step4VersionCheck.tsx
│   │   ├── StepServerDetails.tsx
│   │   ├── Step6ProductChecklist.tsx
│   │   ├── Step7ParsingAnalysis.tsx
│   │   ├── Step7CertificateAnalysis.tsx
│   │   ├── Step8Recommendations.tsx
│   │   ├── Step9NextSteps.tsx
│   │   ├── Step10FeatureRequests.tsx
│   │   ├── StepRecommendedEnhancements.tsx
│   │   ├── Step10Summary.tsx
│   │   └── Step11Summary.tsx
│   └── parsers/
│       ├── dlpServerInfoParser.ts
│       └── certificateParser.ts
└── main.tsx
Upcoming / Future Work
SQL integration for Web / Data / Email Security usage sections
versionData and hc_templates are still global; will be per-session in future
Direct PDF export option (jsPDF / Puppeteer)
License

Internal use only — Forcepoint LLC. Distribution without authorization is prohibited.