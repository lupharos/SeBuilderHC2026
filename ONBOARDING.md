# 🎓 Forcepoint HC 2026 — Complete Developer Onboarding

> **Last Updated:** 2026-08-18  
> **For:** Developers joining the HC 2026 project  
> **Status:** COMPREHENSIVE — covers architecture, deployment, connector, APIs, and auth layer

---

## 📚 Table of Contents

1. [Project Overview](#-project-overview)
2. [Architecture at a Glance](#-architecture-at-a-glance)
3. [Technology Stack](#-technology-stack)
4. [Development Setup](#-development-setup)
5. [Running Locally](#-running-locally)
6. [Production Deployment](#-production-deployment)
7. [Frontend Deep Dive](#-frontend-deep-dive)
8. [Backend Deep Dive](#-backend-deep-dive)
9. [Customer Connector](#-customer-connector)
10. [API Reference](#-api-reference)
11. [Data Storage & State](#-data-storage--state)
12. [Authentication & MFA](#-authentication--mfa)
13. [Report Generation](#-report-generation)
14. [Debugging & Troubleshooting](#-debugging--troubleshooting)
15. [File Location Map](#-file-location-map)

---

## 🎯 Project Overview

**Forcepoint HC 2026 (Health Check Wizard)** is an **internal tool** for the Forcepoint engineering team to:

- ✅ Perform customer health assessments for Forcepoint products (Web Security, DLP, Email Security)
- ✅ Analyze infrastructure, versions, certificates, and configurations
- ✅ Generate executive-level HTML reports
- ✅ Track customer sessions and assessment history
- ✅ Provide role-based access control (login + MFA)

**Key Facts:**
- Fully **offline** — wizard state lives in browser `localStorage`, not backend
- **Backend exists only for:** auth (login/MFA), SQL queries, DLP REST API proxy, connector management
- **Internal use only** — `@forcepoint.com` email restriction enforced
- **18-step wizard** with conditional steps (e.g., DLP steps hidden if DLP not selected)
- **PowerPoint & HTML export** with executive summaries

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                          BROWSER (SPA)                           │
│  Frontend: React 18 + TypeScript + Vite                         │
│  State: localStorage (offline wizard data)                      │
│  Auth Token: localStorage['hc_auth_token']                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │ /api/* requests
                       │ (Bearer token auth)
                       ↓
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js)                              │
│  Port: 3001 (loopback-only in production, proxied via nginx)   │
│  Framework: Express.js (no framework really, raw routing)      │
│                                                                  │
│  ├─ Auth Layer (server/auth.mjs)                               │
│  │  ├─ User registration / login                               │
│  │  ├─ MFA (TOTP) enrollment / verification                    │
│  │  ├─ Session management (bearer tokens)                      │
│  │  └─ User approvals / admin actions                          │
│  │                                                               │
│  ├─ SQL Companion (server/index.mjs)                           │
│  │  ├─ /api/sql/test (connect to customer SQL Server)          │
│  │  ├─ /api/sql/queries (list available reports)               │
│  │  ├─ /api/sql/query (execute a report template)              │
│  │  └─ SQL connection pooling                                  │
│  │                                                               │
│  ├─ DLP REST API Proxy (server/index.mjs)                      │
│  │  ├─ /api/dlp/test (auth probe)                              │
│  │  └─ /api/dlp/posture (fetch incidents, policies, status)    │
│  │                                                               │
│  └─ Customer Connector Management (server/index.mjs)            │
│     ├─ /api/connector/register (wizard → register token)        │
│     ├─ /api/connector/heartbeat (connector.exe → ping)          │
│     ├─ /api/connector/status (wizard polls liveness)            │
│     ├─ /api/connector/job/queue (wizard → enqueue work)         │
│     ├─ /api/connector/job/next (connector long-polls)           │
│     └─ /api/connector/job/result (connector → result)           │
│                                                                  │
│  Data Storage:                                                   │
│  ├─ users.json (user accounts, passwords, MFA)                 │
│  ├─ sessions.json (active bearer tokens, expiry)               │
│  └─ In-memory caches (connectorState, pendingJobs, etc)        │
└─────────────────────────────────────────────────────────────────┘
         ↑
         │ (Production: nginx proxy, reverse-proxy :3001)
         │
┌────────┴──────────────────────────────────────────────────────┐
│                  NGINX (Production Only)                        │
│  Ports: 80 (HTTP) + 443 (HTTPS)                                │
│  ├─ GET  /               → dist/ (frontend SPA)                │
│  ├─ GET  /api/*          → 127.0.0.1:3001 (backend)            │
│  └─ GET  /health         → 127.0.0.1:3001 (liveness)           │
└─────────────────────────────────────────────────────────────────┘
         ↑
         │ (Customer network)
         │
┌────────┴──────────────────────────────────────────────────────┐
│            CUSTOMER CONNECTOR (connector/main.py)               │
│  Format: Single Windows .exe (forcepoint-hc-connector.exe)     │
│  Location: Customer FSM host                                   │
│  Runs: Interactive console (not a service)                     │
│  Action: Phones home every 30s → POST /api/connector/heartbeat │
│                                                                 │
│  Can also:                                                      │
│  ├─ Long-poll for jobs (Via-Connector mode)                    │
│  ├─ Execute SQL queries locally                                │
│  ├─ Execute DLP REST API calls                                 │
│  └─ Return encrypted results                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18 + TypeScript | SPA, offline wizard |
| **Build** | Vite 6 | Hot reload dev, fast build |
| **Styling** | Tailwind CSS 4 | Via `@tailwindcss/vite` plugin |
| **UI Components** | Radix UI + shadcn/ui | Accessible primitives |
| **Forms** | react-hook-form | Lightweight validation |
| **Routing** | react-router 7 | Client-side navigation |
| **State** | useLocalStorage hook | No Redux/Zustand |
| **Backend** | Node.js 20 + Express | Minimal framework |
| **Auth** | scrypt (stdlib) | Passwords hashed server-side |
| **MFA** | TOTP (RFC 6238) | Backup codes supported |
| **Database** | JSON files (users.json, sessions.json) | No SQL/MongoDB for auth |
| **SQL** | mssql npm package | Tedious driver, SQL Server auth |
| **DLP API** | native fetch + undici | Self-signed certs OK |
| **Deployment** | Ubuntu + nginx | Linux only, deploy.sh automation |
| **Charts** | recharts | For report summaries |
| **PDF** | pptxgenjs | PowerPoint export |
| **PDF Parsing** | pdfjs-dist | DLP Dashboard PDF import |

---

## 🛠️ Development Setup

### Prerequisites

- **Node.js 18+** (20 recommended)
- **npm** or **pnpm**
- **Git**
- **curl** (for testing APIs)

### Clone & Install

```bash
git clone https://github.com/lupharos/SeBuilderHC2026.git
cd SeBuilderHC2026

# Root dependencies
npm install

# Server dependencies
cd server && npm install && cd ..
```

### Environment Setup

No `.env` files — config lives in:
- **Frontend:** `vite.config.ts` (dev proxy)
- **Backend:** hardcoded or CLI flags (see deploy.sh)

---

## 🚀 Running Locally

### Terminal 1: Backend (Node.js Companion)

```bash
cd server
npm start
# ✅ Listens on http://localhost:3001
# ✅ Serves /health, /api/*, auth endpoints
```

### Terminal 2: Frontend (Vite)

```bash
npm run dev
# ✅ Listens on http://localhost:5173
# ✅ Auto-proxies /api/* to localhost:3001
# ✅ Hot reload enabled
```

### Terminal 3: First Login (Bootstrap)

Navigate to `http://localhost:5173`:

1. Click "Register"
2. Email: `your-name@forcepoint.com` (required suffix)
3. Password: set your password
4. **First user auto-approves + becomes admin**
5. Login
6. Optional: Enable MFA in profile

---

## 📦 Production Deployment

### Automated (Recommended)

All on one Ubuntu 22.04+ host:

```bash
# On the target host as root:
cd /tmp
git clone https://github.com/lupharos/SeBuilderHC2026.git
cd SeBuilderHC2026
sudo bash deploy.sh
```

**What deploy.sh does:**

1. ✅ Installs `nginx`, `git`, `curl`, **Node.js 20**
2. ✅ Clones repo into `/var/www/sebuilderhc/app`
3. ✅ Runs `npm install` + `npm run build`
4. ✅ Copies `dist/` to `/var/www/sebuilderhc/dist` (nginx root)
5. ✅ Creates nginx site config (`/etc/nginx/sites-enabled/default`)
6. ✅ Systemd units for Node.js companion
7. ✅ UFW rules for ports 80 + 443
8. ✅ Connector .exe placed at `/var/lib/forcepoint-hc/`

### Manual Verification

```bash
# Check services
sudo systemctl status nginx
sudo systemctl status sebuilderhc-companion

# Check ports
sudo netstat -tlnp | grep -E "80|443|3001"

# Health check
curl http://localhost/health
curl http://localhost/api/connector/status?token=test

# Logs
sudo tail -f /var/log/nginx/error.log
sudo journalctl -u sebuilderhc-companion -f
```

### TLS/HTTPS Setup

```bash
# Certbot (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# Deploy.sh handles HTTP; certbot upgrades to HTTPS
# Nginx auto-redirects 80 → 443
```

---

## 💻 Frontend Deep Dive

### Entry Point

| File | Role |
|------|------|
| `src/main.tsx` | React root, imports `App.tsx` |
| `src/app/App.tsx` | Gate: shows `LoginScreen` if no auth, else `Dashboard` |
| `src/app/components/Dashboard.tsx` | Single source of truth for all wizard state |

### Architecture: Props Drilling from Dashboard

```
Dashboard
  ├─ NavigationRail (left menu)
  │  ├─ HC Sessions
  │  ├─ HC Rule Engine
  │  ├─ Product Lifecycle
  │  └─ Health Check Wizard
  ├─ MainContent (wizard router)
  │  ├─ Step1CustomerInfo
  │  ├─ Step2ProductScope
  │  ├─ Step3DataCollectors
  │  └─ ... (18 steps)
  └─ BottomPanel (Cancel / Save / Back / Continue buttons)

All state: useLocalStorage hooks in Dashboard
All updates: callbacks passed down as props
```

**Why props drilling, not Redux?** — Keeps the bundle small and logic transparent. The dashboard is the single source of truth.

### localStorage Keys (Frontend Only)

| Key | Content | Cleared on Cancel? |
|-----|---------|-------------------|
| `hc_sessions` | Saved assessments | ❌ (global) |
| `hc_templates` | Question library | ❌ (global) |
| `hc_version_data` | Product catalog | ❌ (global) |
| `hc_checklist_answers` | Step 8 answers | ✅ (session) |
| `hc_certificates` | Imported certs | ✅ (session) |
| `hc_dlp_bundles` | Parsed DLP data | ✅ (session) |
| `hc_endpoint_agents` | Agent CSV data | ✅ (session) |
| `hc_auth_token` | Bearer token | ❌ (auth only) |
| `hc_last_activity` | Idle logout timer | ❌ (auth only) |

### Key Components

#### Step Files (src/app/components/steps/)

File names **do NOT match display order!** Truth is in `MainContent.tsx` router.

| File | Step # | Purpose |
|------|--------|---------|
| Step1CustomerInfo.tsx | 1 | Name, licensing, compliance |
| Step2ProductScope.tsx | 2 | Check Web/DLP/Email/Data Residency |
| Step3DataCollectors.tsx | 3 | SQL config, REST auth, bundle uploads |
| Step4VersionCheck.tsx | 4 | Product versions vs. latest |
| StepServerDetails.tsx | 5 | Server inventory |
| Step6ProductChecklist.tsx | 8 | Yes/no checklist per product |
| Step7ParsingAnalysis.tsx | 6 | DLP bundle parsing results |
| Step7CertificateAnalysis.tsx | 7 | X.509 cert import + analysis |
| Step8Recommendations.tsx | 9 | Recommended fixes |
| Step9NextSteps.tsx | 10 | Action items |
| Step10FeatureRequests.tsx | 11 | Customer feature requests |
| StepRecommendedEnhancements.tsx | 12 | DSPM, Email Security, etc. upsells |
| Step10Summary.tsx | 13 | Read-only summary |
| Step11Summary.tsx | 14 | **Report generation** (~4,000 LOC) |

#### AuthContext (src/app/auth/AuthContext.tsx)

Manages:
- ✅ Token storage (`localStorage['hc_auth_token']`)
- ✅ Fetch interceptor (adds `Authorization: Bearer` header)
- ✅ Login / logout / register workflows
- ✅ Idle auto-logout (15 min inactivity)
- ✅ MFA flows

Usage: `const { user, token, login, logout, isLoading } = useAuth()`

#### Parsers (src/app/components/steps/)

| Parser | Input | Output |
|--------|-------|--------|
| `dlpServerInfoParser.ts` | `DLPServerInfo_*.zip` folder | 15+ parsed system files |
| `certificateParser.ts` | `.cer`, `.pem`, `.der` files | X.509 subject, issuer, key size |
| `endpointAgentParser.ts` | CSV from Endpoint Agent | 13-section summary |
| `dlpDashboardParser.ts` | DLP Dashboard PDF | Department-level rollup |

---

## 🔧 Backend Deep Dive

### server/index.mjs (Main Express Server)

Serves:

1. **Frontend SPA** (dev only; production uses nginx)
   ```
   GET / → dist/index.html (Vite build output)
   ```

2. **Health Check**
   ```
   GET /health
   Response: { ok: true, service: "forcepoint-hc-sql-companion", port: 3001 }
   ```

3. **Auth Endpoints** (server/auth.mjs)
   ```
   POST /api/auth/register         public
   POST /api/auth/login            public (returns token or mfaRequired)
   POST /api/auth/logout           protected
   GET  /api/auth/me               protected
   GET  /api/auth/info             public (bootstrap signals)
   GET  /api/auth/users            admin
   POST /api/auth/users/:id/*      admin (approve, reject, suspend, etc.)
   POST /api/mfa/verify            in-MFA-challenge
   POST /api/mfa/enroll/begin|confirm|cancel
   POST /api/mfa/disable           re-auth gated
   ```

4. **SQL Companion**
   ```
   POST /api/sql/test              test connection to SQL Server
   GET  /api/sql/queries           list available report templates
   POST /api/sql/query             execute a template query
   ```

5. **DLP REST API Proxy**
   ```
   POST /api/dlp/test              auth + /deploy/status
   POST /api/dlp/posture           fetch incidents + policies + status
   ```

6. **Customer Connector Management**
   ```
   POST /api/connector/register    wizard registers token + key + IP
   POST /api/connector/heartbeat   connector.exe pings home
   GET  /api/connector/status      wizard polls liveness
   POST /api/connector/job/queue   wizard enqueues work
   GET  /api/connector/job/next    connector long-polls (25s)
   POST /api/connector/job/result  connector posts encrypted result
   GET  /api/connector/job/result  wizard drains result
   GET  /api/connector/agent       serve connector.exe binary
   ```

### server/auth.mjs (Authentication)

**Key Functions:**

```javascript
registerUser(email, password)          // @forcepoint.com only, auto-approve first
loginUser(email, password)             // returns token or mfaRequired
verifyMfaChallenge(token, code)        // TOTP or backup code
beginMfaEnrollment(userId)             // mint secret + 10 backup codes
confirmMfaEnrollment(userId, code)     // verify QR code setup
requireAuth(req, res, next)            // middleware — checks Bearer token
requireAdmin(req, res, next)           // middleware — checks admin role
listUsers()                            // all users (pending/approved/etc)
setUserStatus(userId, status)          // admin action
setUserRole(userId, isAdmin)           // admin toggle
deleteUser(userId)                     // admin action
adminResetMfa(userId)                  // admin force-reset (lost phone case)
changeOwnPassword(userId, old, new)    // self-service
adminSetPassword(userId, newPwd)       // admin sets password
```

**Password Hashing:**

Uses Node.js stdlib `scrypt` (no bcrypt, no external deps):

```javascript
// Format: scrypt$<saltHex>$<hashHex>
// Example: scrypt$a1b2c3d4...$e5f6g7h8...
```

**Session Bearer Tokens:**

- 32-byte hex strings (256 bits)
- **24-hour sliding expiry:** bumped when <23h remain
- Stored in `sessions.json` (persisted to disk)

**MFA (TOTP — RFC 6238):**

- Enroll: user scans QR (otpauth URI), confirms with 6-digit code
- **10 backup codes** shown **once** during enroll
- Login: password + 6-digit code (or 1 backup code)
- Disable: requires re-auth (current password)

**Policy:**

- Registration: `@forcepoint.com` email only (enforced server-side)
- Approval: first user auto-approved + admin, others pending until approved
- Status flow: `pending → approved` (or `rejected`) → `suspended`
- Only `approved` users can log in

### server/totp.mjs (RFC 6238)

```javascript
randomSecret()                     // 32-byte base32 secret
verifyCode(secret, code, window)   // check 6-digit code (±30s window)
buildOtpauthUri(secret, email)     // otpauth://... for QR
generateBackupCodes(count)         // 10x 8-character codes
verifyBackupCode(code, hashes)     // constant-time check
```

### Data Storage (Backend)

```
/var/lib/forcepoint-hc/
├── users.json          # { id, email, passwordHash, mfaSecret, mfaEnabled, role, status, createdAt }
└── sessions.json       # { token, userId, expiresAt, createdAt }
```

**Atomicity:** writes use temp file + rename pattern (no partial reads).

**In-Memory Caches:**

- `connectorState` — liveness tracking (token → {firstSeen, lastSeen, total, version, rejected, selftest})
- `connectorAllowlist` — registered tokens + IP restrictions
- `connectorKeys` — AES-256-GCM symmetric keys per token
- `pendingJobs`, `inflightJobs`, `completedJobs` — Via-Connector job queues
- `jobWaiters` — long-poll subscribers

---

## 🔌 Customer Connector

### What It Is

**forcepoint-hc-connector.exe** — single-file Windows executable (built with PyInstaller)

Runs on customer's **FSM host** (or any host with LAN access to SQL / DLP REST API).

**Lifecycle:**
1. Customer admin downloads `connector.json` + `connector-secrets.json` from wizard
2. Places `.exe` and `.json` in same folder
3. Double-clicks `.exe` (or runs from cmd)
4. Watches console for heartbeat status
5. Presses Ctrl+C to stop

### connector/main.py

**Key Classes / Functions:**

| Function | Purpose |
|----------|---------|
| `load_config(install_dir)` | Read + validate `connector.json` |
| `load_secrets(install_dir)` | Read + validate `connector-secrets.json` (optional) |
| `selftest_sql(sql_cfg)` | Test SQL Server auth (SELECT @@VERSION) |
| `selftest_dlp_api(api_cfg)` | Test DLP REST API auth + /deploy/status |
| `run_selftest(secrets)` | Run all probes at boot, seed results |
| `heartbeat_loop(cfg, ...)` | Main loop: POST every 30s to /api/connector/heartbeat |
| `job_poll_loop(cfg, ...)` | Background: long-poll /api/connector/job/next (25s) |
| `handle_dlp_test(...)` | Job handler: re-run DLP auth probe |
| `handle_dlp_fetch(...)` | Job handler: proxy a DLP REST API call |
| `handle_sql_test(...)` | Job handler: test SQL auth for a product |
| `handle_sql_query(...)` | Job handler: execute a SQL template |

**Threads:**

1. **Main thread:** heartbeat loop (30s interval)
2. **selftest-bg thread:** re-run probes every 5 min
3. **job-poller thread:** long-poll for jobs (25s timeout)

**Heartbeat Body:**

```json
{
  "token": "...",
  "version": "0.1.0 (hostname)",
  "selftest": {
    "sqlData": { "status": "ok"|"fail", "message": "...", "latencyMs": 123, "checkedAt": "..." },
    "sqlWeb": {...},
    "sqlEmail": {...},
    "dlpApi": {...}
  }
}
```

**Via-Connector (Iteration 2):**

- Connector polls `/api/connector/job/next?token=...` every 25s
- Wizard enqueues work: `POST /api/connector/job/queue`
- Connector executes locally (SQL / DLP API)
- Connector posts encrypted result: `POST /api/connector/job/result`
  - Body: `{ jobId, ok: true, envelope: { iv, ct, tag } }`
  - Encryption: AES-256-GCM with key from connector.json
- Wizard polls `/api/connector/job/result?jobId=...` every 2s until done

---

## 🔗 API Reference

### Health Check

```bash
curl -v http://localhost:3001/health
```

Response:
```json
{ "ok": true, "service": "forcepoint-hc-sql-companion", "port": 3001 }
```

---

### Authentication

#### Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@forcepoint.com","password":"pwd"}'
```

Response (first user auto-approves):
```json
{ "ok": true, "user": { "id": "...", "email": "...", "role": "admin", "status": "approved" }, "token": "..." }
```

#### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@forcepoint.com","password":"pwd"}'
```

Response (no MFA):
```json
{ "ok": true, "token": "...", "user": { "id": "...", "email": "..." } }
```

Response (MFA enabled):
```json
{ "ok": false, "mfaRequired": true, "challengeToken": "..." }
```

#### Verify MFA

```bash
curl -X POST http://localhost:3001/api/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeToken":"...","code":"123456"}'
```

Response:
```json
{ "ok": true, "token": "...", "user": { ... } }
```

---

### SQL Testing

#### Test Connection

```bash
curl -X POST http://localhost:3001/api/sql/test \
  -H "Content-Type: application/json" \
  -d '{
    "server": "192.168.10.50",
    "port": 1433,
    "database": "wbsn-data-security",
    "authType": "windows"
  }'
```

Response:
```json
{
  "ok": true,
  "message": "Connected in 245 ms",
  "server": {
    "productVersion": "15.0.4316.3",
    "edition": "Enterprise Edition",
    "serverName": "SQLSERVER",
    "currentDatabase": "wbsn-data-security"
  },
  "latencyMs": 245
}
```

#### List Queries

```bash
curl http://localhost:3001/api/sql/queries
```

Response:
```json
{
  "ok": true,
  "queries": [
    {
      "sqlKey": "dlp_top_violators",
      "title": "DLP Top Violators",
      "description": "Employees with most incidents",
      "defaultWindowDays": 30
    },
    ...
  ]
}
```

#### Execute Query

```bash
curl -X POST http://localhost:3001/api/sql/query \
  -H "Content-Type: application/json" \
  -d '{
    "server": "192.168.10.50",
    "port": 1433,
    "database": "wbsn-data-security",
    "authType": "windows",
    "sqlKey": "dlp_top_violators",
    "windowDays": 30
  }'
```

Response:
```json
{
  "ok": true,
  "sqlKey": "dlp_top_violators",
  "rowCount": 10,
  "rows": [
    { "user": "alice@company.com", "incidents": 45, "severity": "HIGH" },
    ...
  ],
  "latencyMs": 1234
}
```

---

### DLP REST API

#### Test Auth

```bash
curl -X POST http://localhost:3001/api/dlp/test \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://dlp.company.com:9443",
    "username": "dlp_admin",
    "password": "pwd"
  }'
```

Response:
```json
{
  "ok": true,
  "message": "Authenticated · DLP 10.4.0 · 456 ms",
  "server": {
    "dlpVersion": "10.4.0",
    "deploymentStatus": "OPERATIONAL"
  },
  "latencyMs": 456
}
```

#### Fetch Posture

```bash
curl -X POST http://localhost:3001/api/dlp/posture \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://dlp.company.com:9443",
    "username": "dlp_admin",
    "password": "pwd",
    "windowDays": 30
  }'
```

Response:
```json
{
  "ok": true,
  "dlpVersion": "10.4.0",
  "totalIncidents": 127,
  "bySeverity": { "HIGH": 12, "MEDIUM": 34, "LOW": 81 },
  "topUsers": [
    { "label": "alice@company.com", "count": 23 },
    ...
  ],
  "topPolicies": [
    { "label": "PCI DSS", "count": 45 },
    ...
  ],
  "latencyMs": 2456
}
```

---

### Connector Management

#### Register Connector

```bash
curl -X POST http://localhost:3001/api/connector/register \
  -H "Content-Type: application/json" \
  -d '{
    "token": "...",
    "allowedSourceIp": "10.10.10.5",
    "encryptionKey": "..."
  }'
```

Response:
```json
{ "ok": true, "token": "...…", "allowedSourceIp": "10.10.10.5", "keyRegistered": true }
```

#### Check Status

```bash
curl "http://localhost:3001/api/connector/status?token=..."
```

Response:
```json
{
  "online": true,
  "lastHeartbeatAt": "2026-08-18T21:45:30.123Z",
  "secondsSinceLastHeartbeat": 15,
  "totalHeartbeats": 342,
  "connectorVersion": "0.1.0 (ubuntu-2204)",
  "selftest": {
    "sqlData": { "status": "ok", "message": "authenticated", "latencyMs": 245 },
    "dlpApi": { "status": "ok", "message": "authenticated — DLP v10.4.0", "latencyMs": 456 }
  }
}
```

---

## 💾 Data Storage & State

### Frontend (localStorage)

**Wizard State (Session-Scoped):**

Cleared on **Cancel**. Persisted to `hc_sessions` on **Save**.

```javascript
hc_checklist_answers      // Step 8: yes/no/na per product
hc_version_entries         // Step 4: product versions
hc_server_details          // Step 5: server inventory
hc_recommendations         // Step 9: findings
hc_action_items            // Step 10: TODOs
hc_feature_requests        // Step 11: customer FRs
hc_dlp_bundles             // Parsed DLP Server bundle
hc_certificates            // Imported X.509 certs
hc_endpoint_agents         // Parsed Endpoint Agent CSV
hc_endpoint_compat_input   // Step 7: customer env form
hc_endpoint_compat_assessment  // Step 7: computed results
hc_dlp_dashboard           // Parsed DLP Dashboard PDF
hc_enhancements            // Step 12: selected upsells
hc_customer_logo           // Base64 image
hc_license_gaps            // License gap entries
hc_compliance_frameworks   // Step 1: chosen frameworks
hc_version_upgrades        // Step 12: upgrade proposals
```

**Global (Persisted Across Sessions):**

```javascript
hc_sessions                // All saved HC sessions
hc_templates               // Rule engine question library
hc_version_data            // Product lifecycle catalog
hc_endpoint_support_matrix // OS / Browser compatibility
```

**Auth (Protected):**

```javascript
hc_auth_token              // Bearer token (localStorage — ⚠️ XSS risk!)
hc_last_activity           // Timestamp (idle logout timer)
hc_logout_reason           // "idle" if auto-logged-out
```

### Backend (Persistent Files)

**Location:** `/var/lib/forcepoint-hc/` (or `./data/` in dev)

```json
users.json
// [
//   {
//     "id": "...",
//     "email": "user@forcepoint.com",
//     "passwordHash": "scrypt$...$...",
//     "mfaSecret": "...",
//     "mfaEnabled": false,
//     "backupCodes": ["code1", "code2", ...],
//     "role": "admin" | "user",
//     "status": "approved" | "pending" | "rejected" | "suspended",
//     "createdAt": "2026-08-18T21:00:00Z"
//   },
//   ...
// ]

sessions.json
// [
//   {
//     "token": "...",
//     "userId": "...",
//     "expiresAt": "2026-08-19T21:00:00Z",
//     "createdAt": "2026-08-18T21:00:00Z"
//   },
//   ...
// ]
```

**In-Memory (Lost on Restart):**

- `connectorState` — liveness tracking
- Job queues (pending, inflight, completed)
- Long-poll waiters

---

## 🔐 Authentication & MFA

### Login Flow (No MFA)

```
User enters email + password
         ↓
POST /api/auth/login
         ↓
Backend validates password (scrypt)
         ↓
Check if MFA enabled:
  ├─ No  → generate bearer token → return { ok: true, token, user }
  └─ Yes → mint 5-min challengeToken → return { ok: false, mfaRequired: true, challengeToken }
         ↓
Frontend stores token in localStorage['hc_auth_token']
         ↓
All subsequent /api/* requests attach: Authorization: Bearer <token>
```

### Login Flow (With MFA)

```
User enters email + password
         ↓
POST /api/auth/login → { mfaRequired: true, challengeToken }
         ↓
Frontend shows MFA prompt (6-digit code or backup code)
         ↓
User enters code
         ↓
POST /api/mfa/verify { challengeToken, code }
         ↓
Backend verifies (TOTP or backup code)
         ↓
Generate bearer token → return { ok: true, token, user }
         ↓
Frontend stores token, dismisses MFA dialog
```

### MFA Enrollment

```
User clicks "Enable MFA" in profile
         ↓
POST /api/mfa/enroll/begin → { secret, otpauthUri, backupCodes }
         ↓
Frontend renders QR code (otpauth:// URI)
         ↓
User scans with authenticator app (Google Authenticator, Authy, etc.)
         ↓
User enters 6-digit code from app
         ↓
POST /api/mfa/enroll/confirm { secret, code }
         ↓
Backend validates code against secret
         ↓
Commit MFA enable, return backup codes (shown once!)
         ↓
User saves backup codes securely
```

### Auto-Logout (15 min inactivity)

**Client-side mechanism:**

```javascript
// AuthContext: IDLE_TIMEOUT_MS = 15 * 60 * 1000

// Activity events (click, type, scroll) write to localStorage['hc_last_activity']
// Poll every 15s: if (now - lastActivity > 15 min) → logout()

// Multi-tab safe: shared localStorage clock
```

---

## 📄 Report Generation

### Step 18 (Step11Summary.tsx)

**Function:** `buildReportHTML(session, ...)` (~4,000 LOC)

**Output:** Single HTML file (can be printed → PDF via browser)

**Sections:**

1. **Cover Page** — customer name, date, wizard version
2. **Table of Contents** — dynamic, links to sections
3. **Executive Summary** — KPI grid, key findings, top 3 recommendations
4. **Infrastructure Review** — servers, disk, roles
5. **DLP Server Analysis** — (if DLP bundle uploaded)
6. **Certificate Analysis** — (if certs imported)
7. **Per-Product Security Assessment** — Web / DLP / Email / Data Residency
8. **Checklist Findings** — answered questions
9. **Usage Reports** — (15 templates each for Web / DLP / Email)
10. **Recommendations** — detailed list
11. **Action Items** — prioritized TODOs
12. **Licensing & EOL** — version roadmap
13. **Appendix** — effort scorecard, glossary

**Design:**

```css
Brand colors:
  --fp-navy: #023E8A
  --fp-cyan: #36B0C9
  --fp-red: #DA1B2E
  --fp-yellow: #FDCE12
  --fp-green: #69BC00
  --fp-violette: #A30080 (CRITICAL)

Fonts: Inter (body) + JetBrains Mono (code)
```

**Export Formats:**

- ✅ HTML (download as `.html`)
- ✅ Print-to-PDF (via browser Ctrl+P)
- ✅ PowerPoint (via pptxgenjs) — coming soon

---

## 🐛 Debugging & Troubleshooting

### Frontend Issues

#### Blank page / infinite spinner

```bash
# Check browser console (F12)
# Look for fetch errors, auth token missing

# Clear localStorage
localStorage.clear()
# Reload page

# Check backend is running
curl http://localhost:3001/health
```

#### Step not visible

Check `STEP_SKIP_RULES` in `src/app/constants/steps.ts`:

```typescript
STEP_SKIP_RULES: {
  6: (session) => !session.productScope.includes('DLP'),
  7: (session) => !session.productScope.includes('DLP'),
}
```

If DLP not in Step 2's scope, Steps 6–7 hidden.

#### localStorage quota exceeded

```bash
# Firefox: about:config → dom.storage.default_quota_bytes
# Chrome: DevTools → Application → Local Storage → size

# Clear old sessions
localStorage.removeItem('hc_sessions')
```

---

### Backend Issues

#### Port 3001 already in use

```bash
# Find process
sudo lsof -i :3001
# or
sudo netstat -tlnp | grep 3001

# Kill it
kill -9 <PID>
```

#### Auth token rejected (401)

```bash
# Token expired (24h)
# Token malformed
# Server restarted (in-memory sessions cleared)

# Solution: login again
```

#### SQL connection timeout

```bash
# Check firewall / network
ping 192.168.10.50

# Verify SQL Server is running
# Check authType + username/password
```

---

### Connector Issues

#### Connector times out connecting to HC server

```bash
# Test endpoint is reachable
curl -v http://51.178.203.109/api/connector/status?token=test

# Check connector.json hcEndpoint is correct
cat connector.json | grep hcEndpoint

# Check firewall allows outbound 80/443
# Check proxy (if configured in connector.json)
```

#### Heartbeat rejected (401 / 403)

```bash
# 401 = token not registered with server
# Solution: wizard must POST /api/connector/register first

# 403 = source IP allowlist mismatch
# Solution: update allowedSourceIp in wizard
```

---

### Deployment Issues

#### deploy.sh fails

```bash
# Check prerequisites
sudo apt list --installed | grep nginx
sudo apt list --installed | grep nodejs

# Re-run deploy.sh (idempotent)
cd /tmp/SeBuilderHC2026
sudo bash deploy.sh

# Check logs
sudo journalctl -xe
```

#### Nginx returns 502 Bad Gateway

```bash
# Node.js companion not running
sudo systemctl status sebuilderhc-companion

# Restart it
sudo systemctl restart sebuilderhc-companion

# Check logs
sudo journalctl -u sebuilderhc-companion -f
```

---

## 📍 File Location Map

### Frontend (src/)

```
src/
├── main.tsx                          # React root
├── app/
│   ├── App.tsx                       # Auth gate
│   ├── Dashboard.tsx                 # Wizard state + router
│   ├── MainContent.tsx               # Step router
│   ├── NavigationRail.tsx            # Left menu
│   ├── BottomPanel.tsx               # Prev / Next / Save / Cancel
│   ├── LoginScreen.tsx               # Auth UI
│   ├── MfaSecurity.tsx               # MFA enable/disable, change password
│   ├── UserManagementPage.tsx        # Admin: approve/reject/delete users
│   ├── SessionsPage.tsx              # Saved HC sessions
│   ├── auth/
│   │   └── AuthContext.tsx           # useAuth() hook, token storage
│   ├── components/
│   │   ├── steps/
│   │   │   ├── Step1CustomerInfo.tsx
│   │   │   ├── Step2ProductScope.tsx
│   │   │   ├── ... (18 step files)
│   │   │   └── dlpServerInfoParser.ts
│   │   │   └── certificateParser.ts
│   │   │   └── endpointAgentParser.ts
│   │   │   └── dlpDashboardParser.ts
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── Button.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── ... (20+ primitives)
│   │   └── (other presentational components)
│   ├── hooks/
│   │   └── useLocalStorage.ts        # Custom storage hook
│   ├── utils/
│   │   ├── systemBackup.ts           # Export / Import all data
│   │   ├── forcepointHtmlImporter.ts # Product Lifecycle HTML parser
│   │   ├── endpointMatrixHtmlImporter.ts # OS/Browser Matrix parser
│   │   ├── endpointCompatibilityEngine.ts # Step 7 compatibility checker
│   │   └── (other utilities)
│   ├── constants/
│   │   ├── steps.ts                  # STEP_SKIP_RULES, step IDs
│   │   ├── colors.ts                 # Tailwind palette
│   │   └── (other constants)
│   ├── types/
│   │   ├── build.d.ts                # __BUILD_INFO__ type
│   │   ├── hc.d.ts                   # HCSession, Step types
│   │   └── (other TS types)
│   └── assets/
│       ├── fp-logo.svg
│       └── (images, icons)
└── (CSS, global styles, etc)
```

### Backend (server/)

```
server/
├── index.mjs                         # Express app, all routes
├── auth.mjs                          # Authentication logic
├── totp.mjs                          # TOTP secret + backup codes
├── queries.mjs                       # SQL report templates (DLP_QUERIES)
├── package.json
├── package-lock.json
├── data/                             # (dev only)
│   ├── users.json
│   └── sessions.json
└── (node_modules/)
```

### Connector (connector/)

```
connector/
├── main.py                           # Connector logic
├── requirements.txt                  # pip dependencies (requests, pyinstaller)
├── connector-secrets.json.template   # Template for customer to fill
├── build.bat                         # Batch script: pyinstaller --onefile
├── README.md                         # Customer runbook
├── .gitignore
└── dist/
    └── forcepoint-hc-connector.exe   # Built executable
```

### Deployment (Root)

```
.
├── ONBOARDING.md                     # This file
├── CLAUDE.md                         # Project instructions for Claude
├── README.md                         # User-facing readme
├── HowToSetup.md                     # Operator runbook
├── deploy.sh                         # Automated Ubuntu deployment
├── vite.config.ts                    # Vite build config
├── tsconfig.json                     # TypeScript config
├── tailwind.config.ts                # Tailwind theme
├── versioncheck.json                 # Version + release notes (bumped per commit)
├── seed.json                         # Default knowledge base
├── package.json
├── pnpm-workspace.yaml               # Monorepo (frontend + server)
└── .claude/
    ├── skills/
    │   ├── README.md                 # Skills overview
    │   ├── CLAUDE.md                 # Main project guide (duplicate of root CLAUDE.md)
    │   ├── hc-summary.md             # Executive summary (outdated)
    │   └── dlp-restapi.md            # DLP REST API reference
    └── auth-access-control.md        # Authentication subsystem guide
```

---

## 🎯 Quick Reference: "Where is X?"

| Question | Answer |
|----------|--------|
| How do I add a new step? | Edit `MainContent.tsx` router + create `StepNx.tsx` |
| How do I add a SQL report? | Add to `DLP_QUERIES` in `server/queries.mjs` |
| How do I change the report design? | Edit `buildReportHTML` in `Step11Summary.tsx` (~4,000 LOC) |
| How do I add a new user role? | Edit `server/auth.mjs`, update TypeScript types |
| How do I change the MFA timeout? | Edit `TOTP_WINDOW` in `server/totp.mjs` or `challengeToken` TTL in `auth.mjs` |
| How do I disable DLP steps? | Edit `STEP_SKIP_RULES` in `src/app/constants/steps.ts` |
| How do I change the idle logout timer? | Edit `IDLE_TIMEOUT_MS` in `src/app/auth/AuthContext.tsx` |
| How do I test the connector? | Run connector.exe with test token, watch console |
| How do I deploy to prod? | Run `sudo bash deploy.sh` on target Ubuntu host |
| How do I enable HTTPS? | Run `sudo certbot --nginx` after deploy.sh |
| How do I check if server is healthy? | `curl http://localhost:3001/health` |
| Where is the frontend state stored? | Browser `localStorage` (see keys list above) |
| Where are user passwords stored? | `server/data/users.json`, scrypt-hashed |
| Where are sessions stored? | `server/data/sessions.json`, bearer tokens |
| How do I backup all data? | `localStorage.setItem('hc_backup', ...)` or click "Backup" button |
| How do I restore from backup? | Click "Restore" button, select JSON file, page reloads |

---

## 📞 Support & Questions

For questions:

1. **Architecture**: Check CLAUDE.md + auth-access-control.md
2. **DLP API**: See dlp-restapi.md
3. **Connector**: Check connector/README.md
4. **Deployment**: See HowToSetup.md + deploy.sh
5. **Code**: Search file map above, grep for function name

**Key contacts (within Forcepoint):**

- **Engineering lead:** (TBD)
- **Product owner:** (TBD)
- **Connector dev:** (TBD)

---

**Last updated:** 2026-08-18  
**Written by:** Claude  
**Version:** HC 2026 v2026.08.18.1
