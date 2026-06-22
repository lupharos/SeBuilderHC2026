# Forcepoint HC — Customer Connector

A small Python program packaged as a single Windows `.exe`. The customer
runs it on their **FSM server** (or any host with reachable SQL / FSM on
the LAN) so the Forcepoint SE can collect data through the HC application
without opening any inbound firewall ports.

The connector opens **outbound HTTPS only**. Nothing listens at the
customer side; nothing initiates a connection toward the customer
network.

It is **not a Windows Service** — it runs interactively in a console
window. The customer admin starts it when the SE asks, watches the
heartbeat log, and presses **Ctrl+C** to stop when the engagement is
done.

---

## What the SE ships to the customer

Two files from the SE, **plus one file the customer admin fills in**:

```
fsm-host/forcepoint-hc/
├── forcepoint-hc-connector.exe         ← the program (built from this folder)
├── connector.json                      ← per-engagement bundle (SE produces it)
└── connector-secrets.json   (optional) ← SQL / DLP credentials (customer fills it in)
```

### `connector.json` — produced by SE

Downloaded from HC wizard's **Step 3 → Customer Connector → Download
connector.json**. Contains:

- `hcEndpoint` — where the connector phones home
- `token` — unique 256-bit random identifier
- `encryptionKeyHex` — AES-256-GCM key (used by iteration 2 for job payloads)
- `allowedSourceIp` — optional IP/CIDR the HC companion validates against
- `heartbeatIntervalSeconds` — usually 30
- `proxy` — **optional** outbound proxy block (see below). Most customer
  networks require egress through a corporate proxy; this is where it's
  configured.

**No customer credentials in this file.** Safe for the SE to email,
upload to a shared drive, or paste into a ticket.

#### Outbound proxy (optional)

If the FSM host can only reach the internet through a corporate proxy,
add a `proxy` block to `connector.json`. The proxy applies **only** to
the outbound HTTPS traffic that reaches the HC companion (heartbeat +
job poll). Internal SQL and DLP REST API calls stay on the LAN and are
**never** routed through the proxy.

```jsonc
{
  "_format": "forcepoint-hc-customer-connector",
  "hcEndpoint": "https://hc.forcepoint-se.com",
  "token": "…",
  "encryptionKeyHex": "…",
  "proxy": {
    "enabled": true,
    "url": "http://proxy.corp.local:8080",  // scheme optional → defaults to http://
    "username": "svc_hc",                    // optional — Basic proxy auth
    "password": "••••••",                    // optional
    "useSystemProxy": false                  // true → defer to OS HTTP_PROXY/HTTPS_PROXY env vars
  }
}
```

- Leave the block out (or `"enabled": false`) for a direct connection;
  the connector still honours `HTTP_PROXY` / `HTTPS_PROXY` env vars if
  they're set on the host (legacy behaviour).
- `"useSystemProxy": true` makes the connector defer entirely to the OS
  proxy environment variables instead of an explicit URL.
- Passwords are URL-encoded automatically — special characters
  (`@ : / #`) are safe to type as-is. The startup banner masks the
  password and shows only the proxy host + username.
- CLI overrides win over the config block: `--proxy <url>` forces a
  proxy, `--no-proxy` forces a direct connection (and ignores env vars).

### `connector-secrets.json` — filled in by customer admin

Optional file. Copy `connector-secrets.json.template` (shipped beside
the .exe), rename to `connector-secrets.json`, and fill in the SQL +
DLP REST API credentials. These never leave the customer host:

- The SE never sees them — they're not in `connector.json`.
- They are not transmitted over the network.
- They live only on this FSM host, readable by the user who launched
  the .exe.

When iteration 2 of the connector lands (SQL query / DLP REST API job
dispatch from the HC wizard), the connector uses these credentials
locally to talk to SQL Server / FSM. Until then, the file is loaded +
validated at startup but only used by heartbeat-mode for the console
banner.

If the file is **absent**, the connector runs in heartbeat-only mode
— no SQL / DLP queries will succeed. This is the safe default for
engagements where credentials haven't been provisioned yet.

The customer admin does **not** need Python, pip, or anything else
installed.

---

## Build (run on a Windows host with Python 3.10+)

```cmd
cd connector
python -m pip install -r requirements.txt pyinstaller
build.bat
```

Output: `dist\forcepoint-hc-connector.exe` (single file, ~15 MB).

> Cross-compilation note: PyInstaller doesn't cross-compile. Build the
> Windows `.exe` on a Windows host.

---

## Customer-side run

1. Place `forcepoint-hc-connector.exe` and `connector.json` in the same
   folder on the FSM server.
2. Double-click the `.exe` (or `cd` into the folder and run it).
3. Watch the console. After a couple of seconds you should see:

   ```
   [start] Phoning home to https://hc.forcepoint-se.com/api/connector/heartbeat
           Heartbeat every 30s. Press Ctrl+C to stop.

   [10:42:13] OK    heartbeat #1  (88ms)
   [10:42:43] OK    heartbeat #2  (74ms)
   ```

4. The Forcepoint SE confirms the connector is **ONLINE** in the HC
   wizard.
5. When the SE is done, press **Ctrl+C** to stop. The window pauses on
   a "Press Enter to close" prompt so accidental closes don't lose any
   diagnostic output.

---

## Common errors

| Console message | Meaning | Fix |
|---|---|---|
| `connector.json not found next to the executable` | The bundle file isn't in the same folder as the `.exe` | Move both files into the same folder |
| `connector.json _format mismatch` | Wrong JSON file — not from the HC wizard | Re-download the bundle from the wizard |
| `connector.json missing required field(s): token` | Bundle was edited or partial | Re-download a fresh bundle |
| `FAIL cannot reach HC endpoint` | Outbound HTTPS blocked or wrong URL | Confirm the URL; ask network team to allowlist outbound to `<hcEndpoint>`. If egress requires a proxy, add a `proxy` block to `connector.json` (see above) |
| `FAIL HTTP 407` | Proxy requires authentication | Add `username` / `password` to the `proxy` block in `connector.json` |
| `FAIL TLS error` | Self-signed cert on HC endpoint | Run with `--insecure` for dev only: `forcepoint-hc-connector.exe --insecure` |
| `WARNING: allowedSourceIp doesn't match local IP` | The IP recorded in the HC wizard doesn't match this FSM's outbound IP | Update the IP in the HC wizard or use a CIDR (`10.10.0.0/16`) |

---

## CLI flags

```
forcepoint-hc-connector.exe [--insecure] [--no-pause] [--proxy <url>] [--no-proxy]
                            [--skip-selftest] [--no-job-poller]
```

- `--insecure` — skip TLS certificate validation (dev / self-signed servers only).
- `--no-pause` — don't pause on exit. Useful when scripted from a batch file.
- `--proxy <url>` — force outbound traffic through this proxy, overriding
  `connector.json`. Accepts `http://user:pass@host:port` or a bare
  `host:port` (defaults to `http://`).
- `--no-proxy` — force a direct connection; ignores both the config
  `proxy` block and any `HTTP_PROXY` / `HTTPS_PROXY` env vars.
- `--skip-selftest` — skip the startup SQL / DLP credential probes.
- `--no-job-poller` — disable the Via-Connector job poller (heartbeat only).

---

## Security model — current iteration

- **Outbound-only**: no inbound ports, no listening sockets.
- **Token-based identity**: the HC companion stores the token and
  validates every heartbeat against it. Token rotation = re-download
  the bundle from the wizard.
- **IP allowlist** (optional but recommended): companion rejects
  heartbeats whose source IP doesn't match the wizard-declared value.
- **AES-256-GCM key** is held in the bundle for **future use**: job
  payload encryption isn't wired yet (heartbeat is plain JSON over
  HTTPS). The key ships now so iteration 2 (job dispatch + result
  return) can adopt it without changing the bundle format.

The connector does **not** perform TLS pinning — that field was removed
from the wizard for operational simplicity. Standard TLS transport
between connector and HC companion is the only protection at the
HTTPS layer.

---

## What this connector does NOT yet do

These are roadmap items for iteration 2:

- **Long-poll for jobs**: the connector currently only sends
  heartbeats. SQL queries and DLP REST API calls still run from the SE
  laptop in direct mode. To route them through the connector, the
  connector needs:
  - `GET /api/connector/job/next?token=…&wait=25` long-poll loop.
  - Local `pymssql` / `requests` execution against customer SQL / FSM.
  - `POST /api/connector/job/result` with AES-256-GCM-encrypted output.

- **No Windows Service registration**. Each engagement is an
  interactive console session.

- **No payload encryption**: heartbeat body is JSON-over-HTTPS only;
  AES-256-GCM kicks in once job dispatch lands.

---

## File layout

```
connector/
├── main.py             ← the connector (single file)
├── requirements.txt    ← pinned Python deps (requests, urllib3, certifi)
├── build.bat           ← one-line PyInstaller build
├── README.md           ← this file
└── .gitignore          ← excludes build/ dist/ *.spec
```
