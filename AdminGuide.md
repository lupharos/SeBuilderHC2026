# Forcepoint HC 2026 — Admin Guide

> Audience: Forcepoint SEs (Sales Engineers) and account admins who run
> Health Check engagements with this tool.
> Last updated: 2026-05.

This guide walks through every menu, every wizard step, and the common
workflows. If you just want to set up the host, see `HowToSetup.md`. If
you want to know what each button **does** — you're in the right file.

---

## 1. What this tool is

The Forcepoint HC Wizard takes a customer's Forcepoint deployment data
— Salesforce account info, license inventory, DLP server diagnostic
dumps, log files, SQL telemetry, REST API posture — and turns it into
two deliverables:

1. **Executive Risk Briefing** (~10 pages) — for CISO / CIO / Director
   audience. Risk verdict, compliance lens, current licensing posture,
   security telemetry snapshot, recommended roadmap.
2. **Health Check & Maturity Assessment** (~40-60 pages) — full
   technical document for the security / SOC / infra teams. Same
   verdict plus every supporting datapoint, EoS analysis, server health
   tables, certificate validity, per-product checklist findings, etc.

A single wizard session feeds both reports — operator picks which
variant to export at the end (Step 18).

### Where things run

```
┌─────────────────────────────────────────────────────────────┐
│ Deploy host (Ubuntu — /var/www/sebuilderhc/)                │
│   ├─ nginx        → /             SPA static assets         │
│   │              → /api/*        proxy → companion          │
│   ├─ companion    → 127.0.0.1:3001 (Node, systemd-managed)  │
│   │              SQL Server client, DLP REST API client,    │
│   │              Customer Connector job broker, AES decrypt │
│   └─ /var/lib/forcepoint-hc/forcepoint-hc-connector.exe     │
│              served via /api/connector/agent                │
└─────────────────────────────────────────────────────────────┘
        ↑ HTTPS via nginx
        │
   SE browser (the wizard)
        │
        │   (Optional) Customer Connector binary running inside
        │   the customer environment, phones home over outbound
        │   HTTPS — never inbound. Routes SQL + DLP REST API
        ↓   queries when the SE has no direct line of sight.
   Customer FSM host
```

The wizard never has direct line of sight into the customer's
environment unless the SE explicitly chooses Direct mode for SQL or
DLP REST API. By default, every credential touches the customer host
only.

---

## 2. Navigation rail (left side)

Seven main pages. Below them you'll always see:

- **Companion health pill** — small dot that turns green when the
  companion is reachable; red when not.
- **User avatar** — click to open Profile & Settings.
- **Build version chip** — short git SHA of the deployed build; hover
  for full version + build timestamp. Use this when reporting bugs.

| Menu                              | Purpose                                                                                                                                                                                       |
|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Health Check Wizard**           | Starts a new session OR resumes the active session. The 18-step assessment.                                                                                                                   |
| **HC Sessions**                   | List of every saved session. Each row shows customer name, last-saved date, completion state, health score. Click to resume. Right-side toolbar has Export/Import Backup of the whole estate. |
| **HC Rule Engine**                | Edit the checklist templates (DLP / Web / Email). This is where you tune the per-product questions, severity weights, remediation text. Changes apply to all future sessions.                 |
| **Product Lifecycle**             | The catalogue of Forcepoint product versions + EoS / EoM dates. Auto-pulled into Step 4's analysis. Update this when Forcepoint publishes new EoS notices.                                    |
| **OS / Browser Support Matrix**   | Endpoint agent compatibility matrix (Windows / macOS / browsers). Drives Step 7's Agent Compatibility report. Update when new platforms ship.                                                 |
| **GenAI Apps & Destination Patterns** | Substring patterns that classify URLs as GenAI / SaaS / Webmail. Used by the DLP REST API posture aggregator to bucket exfil destinations. Edit when new apps emerge.                     |
| **Version & Release Catalog**     | Pre-canned version-upgrade proposals (e.g. "DLP 25.05 → 26.02"). Step 12 lets the operator pull from this catalogue instead of typing recommendations from scratch.                           |

### Why each one matters

- **HC Sessions** — every customer is saved as a separate session.
  Export Backup before doing destructive ops (template edits, bulk
  delete). Import Backup restores the whole estate from a single JSON.
- **HC Rule Engine** — the checklist is the spine of the Per-Product
  Security Assessment. If your customer industry has unique
  requirements (e.g. financial services adds extra audit questions),
  this is where to add them.
- **Product Lifecycle** — Step 4's "EoS — replace immediately" verdict
  pulls dates from here. Stale catalogue → wrong verdict.
- **GenAI Apps & Destination Patterns** — when ChatGPT, Claude, etc.
  ship under new domains, add them here so the posture dashboard
  correctly attributes incidents to the GenAI bucket.

---

## 3. The Health Check Wizard — 18 steps

The wizard is product-aware: some steps are skipped automatically based
on what you select in Step 2 (e.g. Step 6 Endpoint Agent Analysis is
DLP-only). The numbered list below is the full canonical flow.

### Step 1 · Customer Information

Customer identification + account context.

- **Import JSON from Salesforce** (top of page) — fastest path. Drop
  a `customerx_hc.json` exported via the Claude **Salesforce
  Connector**. Customer info, licenses, hardware, recent cases, and
  feature requests auto-fill. Click the **(?) How to generate**
  button to see the exact Claude prompt template (requires Salesforce
  Connector + WBSN ID).
- Manual fields: name, country, theatre, region, industry, CSM /
  Account Owner / SE, support level.
- Compliance frameworks: auto-suggested from country + industry; you
  can override per framework.
- License inventory: rows for product / quantity / status / expiry.
  Becomes Section 3 in the Executive Briefing ("Current Licensing
  Posture") and Section 02 in the Technical report.

**Tip**: When the customer name is sensitive, ALWAYS use Salesforce
import — never type the name in cleartext. The Salesforce data flows
directly into the wizard without showing up in the browser address bar
or screen-share captures.

### Step 2 · Product Scope

Tick which Forcepoint products are in scope: **Data Security**, **Web
Security**, **Email Security**, **NGFW**, **V-Series Appliances**, etc.

This step drives step visibility downstream (e.g. only ticking Data
Security skips Web-specific steps).

### Step 3 · Data Collection ⭐

The data-ingestion superpage. Each card is independent:

#### SQL Server card
Direct connection to the customer's `wbsn-data-security` /
`wslogdb70` / `esglogdb76` databases. Used by the report queries
(Step 3 → Reports list at the bottom of the same page).

- **Transport: Direct** — companion dials the customer SQL Server.
  Needs server host / port / database / Windows or SQL auth.
- **Transport: Via Connector** — customer Connector .exe runs the
  query locally using `connector-secrets.json`. Wizard fields are
  hidden (connector owns the creds). Pick this when the SE has no
  direct route to the customer FSM.

#### DLP REST API card
Same transport toggle. When ON, you can:
- **Test Connection** (proves the credentials work)
- **Fetch posture data** (pulls deploy status + enabled policies +
  incidents over the last N days; aggregates into the Posture
  Telemetry section of the report)

#### V Series API + NGFW SMC API cards
Direct only. Standard REST API connectors for appliance management.

#### Reports (bottom of page)
Pre-defined SQL templates grouped by product (DLP / Web / Email). Tick
the ones you want, set window (last N days) + TOP N, then:
- **Per-row Run** — fires that one report
- **Run X Selected** — sequential bulk run of every ticked report

Results are pure runtime — they vanish on browser refresh, so export
the report (Step 18) in the same session.

#### DLP Server Telemetry card
Drop a `DLPServerInfo_*` folder (the Forcepoint diagnostic tool's
output). The wizard parses 30+ files:
- `systeminfo.txt` → host + OS + memory + boot time
- `services_info.txt` → Forcepoint services running/stopped
- `mem_cpu_hdd.txt` → resource utilisation
- `SQL queries/*.csv` → DLP audit logs (auto-routed to the audit
  analyzer)
- `\Data Security\Logs\*.log` → 8 service log files (auto-routed to
  the unified log analyzer)
- `allcerts.cer` + `ca.cer` → certificate chain

Two analyzers run automatically on bundle drop:
- **DLP Log & Audit Findings** — pattern-classifies log errors into
  buckets (CRITICAL / HIGH / MEDIUM / LOW), with first/last seen +
  occurrences. Filters: must be ≥10 occurrences AND last seen in past
  30 days. Each finding has Star ★ (include in report + auto-spawn
  Urgent Action) and Trash 🗑 (hide).
- **Service Logs Analyzer** — same, across 8 cross-correlated service
  log files.

#### Customer DLP Dashboard PDF
Drop the PDF exported from DLP Manager Reports. Parses severity /
action / channel / policy / URL category breakdowns.

#### Endpoint Agent CSV
Drop the export from F1E Endpoint console. Used by Step 6 for the
agent-version analysis.

#### Customer Connector card
The pivotal "agent" for Via Connector mode:

1. **Enable** the card → wizard generates a random token + AES-256-GCM
   key.
2. Set the **HC endpoint** (the deploy host URL) + optional
   **Allowed Source IP** allowlist.
3. **Download connector.json** + **Download connector-secrets.json**
   (template form, pre-filled with what the wizard already knows).
4. **Download forcepoint-hc-connector.exe** (served directly from the
   deploy host).
5. Hand all three to the customer admin; they drop them in one folder
   and double-click the .exe.
6. Status pill turns **ONLINE** within 30s. The SELFTEST panel below
   shows per-DB + DLP REST API pass/fail.

Each download button has a **Show JSON / Eye icon** secondary button —
shows the JSON content inline before you ship it.

### Step 4 · Version & EoS Analysis

For each Forcepoint product in scope, list the installed version +
latest available + EoS / EoM dates. Auto-fills from the DLP Server
Telemetry FSM Server + SQL Server values if available.

- Status badges: HEALTHY / WARNING / EoS-NEAR / EoS / EoL
- Score deduction: EoS items penalise the overall health score the
  most (-4 each), warning versions -1 each.

### Step 5 · Server Infrastructure

For each Forcepoint server (FSM / Web Server / SMC / etc.), enter
CPU / RAM / disks. Disk usage ≥85% = critical, 70-85% = warning. Same
auto-fill from DLP Server Telemetry where available.

### Step 6 · Endpoint Agent Analysis (DLP only)

Imports the Endpoint Agent CSV from F1E console. Aggregates:
- Total endpoints
- Version distribution (latest / one-behind / 24.x / ≤23.x / unknown)
- Stale agents (>30 days, >90 days)
- Client status breakdown (Enabled / Disabled / Stopped)
- Top stale samples (hostname + last-update date)

### Step 7 · Agent Compatibility (DLP and/or Web)

Cross-references the endpoint fleet against the OS / Browser Support
Matrix (from the left-rail menu). Output:
- Compatibility verdict (Supported / At-Risk / Critical)
- Per-OS / per-browser tables
- Optional Critical Notes (operator picks which to surface)
- Upgrade recommendation banner

### Step 8 · Per-Product Checklist

Walks the operator through the questions from the **HC Rule Engine**
(Web / DLP / Email templates). For each question:
- Select Yes / No / N/A
- Optional analyst note
- Severity → finding when answer = trigger value

Output: list of findings with severity, ready for Step 11.

### Step 9 · Parsing & Analysis

Visualises checklist answers + heuristics: which sections need work,
which are healthy, which are unanswered.

### Step 10 · Certificate Analysis

Drop .cer / .pem / .crt / .der files (typically `allcerts.cer` +
`ca.cer` from the DLP Server Telemetry). Parses:
- Subject + Issuer
- Validity (not-before / not-after)
- Key length + signature algorithm
- CA constraint
- Status (VALID / EXPIRING ≤90d / EXPIRED / INVALID)

### Step 11 · Recommendations

Free-form list of recommendations. Each carries:
- Category (Configuration / Architecture / Operational / etc.)
- Priority (Critical / High / Medium / Low)
- Status (Open / In Progress / Closed)
- Optional description + remediation steps

### Step 12 · Version Upgrade Proposals

Pull from the **Version & Release Catalog** (left rail) OR type custom.
Each proposal has: source version → target version, urgency, rationale,
deployment notes, optional bug-fix highlights.

### Step 13 · Customer Feature Requests

Tracks what the customer is asking Forcepoint to build. Used for
internal advocacy + included in the Technical report's "Customer
Voice" section.

### Step 14 · License Gap

Where the customer is under-licensed (deployment exceeds entitlement)
OR mis-licensed (e.g. needs Hybrid Cloud but has on-prem only). Each
gap proposes a quantity + rationale. Surfaces in BOTH report variants
as "Recommended License Extension" — a buying signal for sales.

### Step 15 · Urgent Actions

Time-bound items the customer needs to address quickly. Has owner +
due date. Auto-populated entries arrive here when you ★-star a log
finding in Step 3. Surfaces in the Technical report as "Action Items
& Next Steps".

### Step 16 · Recommended Enhancements

The "what should the customer add to their Forcepoint estate?" pitch.
Pick from a catalogue (CASB, DLP Cloud, F1E premium features, etc.)
or write custom. Each carries a benefit narrative + (optionally) the
license SKU.

### Step 17 · Summary & Review

In-wizard preview of everything. Shows:
- Health score gauge + verdict
- Severity tile breakdown
- Risk Category Matrix
- **Coverage Stats** — quick read: how many servers, version entries,
  SQL reports run, DLP REST API posture fetched, certificates,
  endpoints
- Per-product scorecards
- Compliance lens

If something looks wrong, click the corresponding step in the left
sidebar to fix.

### Step 18 · Final Export

Generate the report. **Two formats**:

| Variant | Audience | Pages | Contents |
|---|---|---|---|
| **Executive Risk Briefing** | CISO / CIO / Director | ~10 | Risk verdict, Compliance Lens, Current Licensing Posture, Security Posture (DLP telemetry), Roadmap (License Extension + Strategic Initiatives) |
| **Health Check & Maturity Assessment** | Security / SOC / Infra teams | ~40-60 | Everything: full Part II Technical Assessment, per-product checklist findings, server health tables, certificate dump, action items, all Part III roadmap items |

Each opens in a new browser tab — print to PDF from there.

---

## 4. Customer Connector — the agent in detail

### Why it exists

Many customers won't let an outside HC server reach into their
network. The connector is a **single-binary outbound-only agent** the
customer runs inside their FSM environment. It:

1. **Phones home** every 30s with a heartbeat (presence + selftest
   results).
2. **Long-polls** for jobs — the HC server queues encrypted work
   ("test SQL", "fetch posture", "run report X"); the connector picks
   them up and executes locally.
3. **Encrypts every result** with AES-256-GCM using the symmetric key
   from `connector.json` — even the HC server only sees ciphertext on
   the wire.

### Three artifacts you hand the customer

1. **`connector.json`** — identity. HC endpoint URL, random token,
   AES-256 key, optional source-IP allowlist. SE generates this in
   the wizard.
2. **`connector-secrets.json`** — credentials. Three SQL blocks
   (`sql_Data`, `sql_Web`, `sql_Email`) + one DLP REST API block.
   Customer admin fills in (or verifies SE's pre-fill).
3. **`forcepoint-hc-connector.exe`** — single-file Python binary.
   ~25 MB. Drops next to the JSON files.

Customer puts all three in one folder, runs the .exe, sees a console
banner. The wizard's ONLINE pill turns green within 30s.

### Direct vs Via Connector — when to use which

| Mode | Best when... | Picture |
|---|---|---|
| **Direct** | The SE has network reach to the customer FSM (POC / lab / open network). | Wizard → companion → customer FSM, all over the SE's network. |
| **Via Connector** | The customer's firewall blocks inbound. The SE can ONLY reach the connector's outbound heartbeat. | Wizard → companion → enqueue job → connector pulls job → connector hits FSM → encrypted result. |

Direct fallback is **never automatic**. If you pick Via Connector but
the connector is offline, queries fail with a clear error — you have
to either bring the connector ONLINE or manually switch to Direct.

### The SELFTEST panel

Inside the Customer Connector card, below the status pill, the wizard
shows what the connector itself is reporting:

- **SQL · DLP** — connector tested its `sql_Data` block
- **SQL · Web** — connector tested its `sql_Web` block
- **SQL · Email** — connector tested its `sql_Email` block
- **DLP REST API** — connector tested its `dlpApi` block

Each row is **PASS / FAIL** with latency. Refreshed every 5 minutes
automatically. This is your continuous health check — if PASS for the
product you're about to query, Via Connector queries for that product
will succeed.

---

## 5. The Salesforce JSON import

Click **(?) How to generate** at the top of Step 1's "Import JSON from
Salesforce" panel for the canonical Claude prompt.

### Prereqs
- Salesforce Connector enabled on your Claude account
- The customer's **WBSN ID** (Salesforce account identifier)

### Flow
1. Open Claude in another tab
2. Paste the prompt template, replace `<PASTE_WBSN_ID_HERE>` with the
   real ID
3. Claude returns a JSON document
4. Save as `customerx_hc.json` (or any `.json` filename — the wizard
   doesn't care)
5. Drop into the wizard's dropzone

### What gets filled
- `customer` block → Customer Information fields (name, country,
  industry, support level, account team)
- `licenses[]` → License inventory
- `entitlements[]` → Support entitlements
- `hardware[]` → Hardware inventory
- `active_cases_last5[]` → Recent support cases
- `feature_requests[]` → Customer Feature Requests

Everything stays editable after import — you can correct any field the
SF data got wrong.

---

## 6. Reports

### Generation
Step 18 → click **Generate Executive Risk Briefing** OR **Generate
Health Check Report**. New browser tab opens with the rendered HTML.
Print → Save as PDF from the browser.

### What's in each

#### Executive Risk Briefing (~10 pages)
```
Cover
Part 1 · Executive Briefing
   Section 1 · Risk Posture & Executive Summary
   Section 2 · Compliance Exposure
   Section 3 · Current Licensing Posture           ← inventory + expiry
Part 2 · Security Posture
   Section 4 · Information Security Posture Dashboard   ← DLP REST API telemetry
Part 3 · Roadmap & Strategy
   Section 5 · Recommended License Extension       ← what to buy
   Section 6 · Recommended Enhancements             ← strategic adds
Closing
```

#### Health Check & Maturity Assessment (~40-60 pages)
Includes Parts I–IV — covers the full Part II Technical Assessment
(Version Lifecycle, Server Health, DLP Telemetry, DLP Log Evidence,
Endpoint Agents, Agent Compatibility, Certificates, Product
Scorecards, Feature Posture Control, per-product Usage sections,
Posture Telemetry). Part III adds prioritized recommendations,
version upgrade path, action items, customer FRs, licensing roadmap,
enhancements. Part IV has the scoring rubric appendix.

### Tips

- **Always run Step 17 (Summary & Review) first** to catch missing
  data before generating.
- **Health score** reflects checklist + EoS + infra weighted. Anything
  under 60 = AT RISK; under 40 = CRITICAL.
- **Coverage Stats** in Step 17 tells you exactly what evidence the
  reports will cite. Empty rows = thin report.

---

## 7. Common workflows

### A. Greenfield Health Check (SE has L3 reach to customer)

1. **HC Sessions** → Start new wizard session
2. **Step 1** — Import Salesforce JSON via Claude prompt
3. **Step 2** — Tick Data Security (and Web Security if in scope)
4. **Step 3** — Direct mode on SQL Server + DLP REST API. Test
   Connection both. Drop the DLP Server Telemetry folder.
5. **Step 3 Reports** — tick the relevant reports (DLP / Web by
   scope), bulk Run
6. **Step 3 → Fetch posture data** (DLP REST API)
7. **Steps 4–16** — fill in / verify auto-populated data
8. **Step 17** — eyeball Coverage Stats
9. **Step 18** — Generate both Executive + Technical, hand to AE
   and SE Manager respectively

### B. Customer with strict firewall (SE has NO L3 reach)

1. Same Steps 1–2
2. **Step 3 Customer Connector card** — Enable. Download three
   artifacts. Hand to customer admin. Wait for ONLINE pill.
3. **Step 3 SQL Server + DLP REST API cards** — pick **Via
   Connector** mode on both. SELFTEST panel above shows PASS for the
   relevant products.
4. **Step 3 Reports + Posture** — bulk Run + Fetch as normal. Every
   call routes through the connector.
5. **Steps 4-16, 17, 18** — same.

### C. Log analysis only (no SQL access)

1. Steps 1–2 normal
2. **Step 3 DLP Server Telemetry card** — drop the bundle.
3. Browse the **DLP Log & Audit Findings** + **Service Logs** panels.
   Star ★ the relevant findings — they auto-spawn Urgent Actions and
   appear in the report's Log Evidence section.
4. Skip everything else, jump to Step 18.

### D. Recurring engagement (data refresh)

1. **HC Sessions** → open the previous session
2. Step 3 → re-Run reports + re-Fetch posture for the new time window
3. Step 17 → confirm metrics moved
4. Step 18 → re-export

---

## 8. Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| Companion health pill RED | Companion service down on deploy host | `sudo systemctl status sebuilderhc-companion` then `restart` |
| Customer Connector OFFLINE despite running | Token mismatch (rotation) OR allowlist IP mismatch | Compare wizard token with the one in `connector.json` on customer host. Check `ALLOWED SOURCE IP` value. |
| Test Connection (Direct SQL) says "Local SQL companion not running" | nginx → companion proxy chain broken | `curl http://127.0.0.1:3001/health` on deploy host — should return JSON |
| Run buttons grayed out | SQL Server card not enabled OR (Via Connector mode) connector not ONLINE | Enable the card; for Via Connector, wait until ONLINE pill |
| "Connector OFFLINE — wait for the customer to start..." but customer says it's running | `isConnectorOnline` reading wrong field (FIXED in build 087ef66+) | Update deploy host: `git pull && deploy.sh` |
| Posture fetch times out | FSM REST API busy OR creds wrong | Test Connection first — if THAT fails, fix creds. If Test passes but Fetch times out, the /incidents endpoint is just slow; raise the wizard's timeout in Step 3 advanced (default 75s) |
| Show JSON button empty in via-connector mode | `customerConnector` state not flushed; refresh browser | Hard reload (Ctrl+Shift+R) |
| Executive Report missing Section 3 Licensing | No licenses captured AND no support level set | Either Step 1 manually adds licenses OR re-import SF JSON |
| Report shows `Section 13 · Part II` instead of `Section 3 · Part 2` | Stale build cached by browser | Hard reload |

### Diagnostic commands (deploy host)

```bash
# Companion liveness
sudo systemctl status sebuilderhc-companion
sudo journalctl -u sebuilderhc-companion -n 40 --no-pager

# Connector binary present?
ls -lh /var/lib/forcepoint-hc/forcepoint-hc-connector.exe

# Connector .exe download endpoint
curl -I http://127.0.0.1:3001/api/connector/agent

# Job queue endpoint (after wizard enables Customer Connector)
curl -s http://127.0.0.1:3001/api/connector/status?token=<token-prefix>
```

### Customer-side diagnostic

When the customer admin runs the connector, the console shows:

```
+----------------------------------------------------------+
|  Forcepoint HC -- Customer Connector  v0.1.0             |
+----------------------------------------------------------+
  HC endpoint:        https://hc.forcepoint-se.com
  Token (masked):     ab12cd34...
  AES key (masked):   de56f789...
  ...
[selftest] Validating local credentials before starting heartbeat loop...
  OK    SQL DLP     wbsn-data-security authenticated (3 ms)
  OK    DLP REST API authenticated — DLP v10.3.0 (251 ms)

[start] Phoning home to https://hc.forcepoint-se.com/api/connector/heartbeat
[job-poll] active. Long-polling https://hc.forcepoint-se.com/api/connector/job/next...
[14:32:01] OK    heartbeat #1  (84ms)
```

If `[job-poll] active` is missing, the binary was built without the
`cryptography` library or the `encryptionKeyHex` in `connector.json`
is wrong — rebuild + re-deploy.

---

## 9. Quick reference — keyboard / button shortcuts

| Action | Where |
|---|---|
| Resume the active session | Click the wizard step number in the sidebar |
| Save the session manually | Step button "Save" (top-right of wizard) — auto-saves on every step transition too |
| Export full estate backup | HC Sessions page → Export Backup (downloads all sessions + templates + catalogs as one JSON) |
| Import estate backup | HC Sessions page → Import Backup (destructive — replaces everything) |
| Show JSON preview | Customer Connector card → eye icon next to each Download button |
| Generate the Claude prompt | Step 1 → SF EXPORT section → (?) How to generate |
| See build version | Bottom of left nav rail — short SHA chip, hover for full info |

---

## 10. Update workflow (for the SE Admin)

When the dev team ships a new build:

```bash
# On the deploy host (Ubuntu)
cd ~/SeBuilderHC2026
git pull
sudo bash deploy.sh
bash statuscheck.sh
```

When a new connector .exe is released:

- `deploy.sh` automatically copies the new binary out of
  `ConnectorAgent/forcepoint-hc-connector.exe` (in the repo) to
  `/var/lib/forcepoint-hc/`.
- The wizard's "Download forcepoint-hc-connector.exe" button
  serves the latest copy from that path.
- Customers who installed an older .exe should re-download + replace
  on their host. The token + secrets file don't need to change.

---

## 11. Things to NEVER do

- ❌ Edit a session's JSON in localStorage by hand — corrupts the
  state machine, may break load.
- ❌ Type the customer name in cleartext when capturing screenshots —
  use Salesforce import so the name comes from SF directly.
- ❌ Push connector binaries with `-dirty` build tag to customers —
  rebuild from a clean checkout.
- ❌ Run the connector .exe with `--insecure` against a production
  customer — that flag disables HC endpoint TLS verification (dev
  only).
- ❌ Hand the customer the `connector-secrets.json` from a different
  customer engagement — it's per-engagement; mixing leaks data.

---

## 12. Where to ask for help

- **Build / deploy issues** — check `journalctl -u
  sebuilderhc-companion` first, then ping the dev team with the build
  SHA from the nav rail chip.
- **Logic / template questions** — the HC Rule Engine page is fully
  editable; you can experiment safely (Export Backup first).
- **Customer-side connector issues** — get the console output from
  the customer's .exe session; the `[selftest]` lines + any
  `REJECT/UNREGISTERED` or `REJECT/ALLOWLIST` lines tell you exactly
  what's wrong.

---

> **Bottom line**: 90% of engagements run through the same loop —
> SF import (Step 1) → connector setup (Step 3) → drop the DLPServerInfo
> bundle (Step 3) → bulk Run reports (Step 3) → Fetch posture (Step 3) →
> walk through 8 quick checklist screens → click Generate in Step 18.
> The rest of this guide exists for the 10% that doesn't.
