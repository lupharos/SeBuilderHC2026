"""Forcepoint HC — Customer Connector.

Runs on the customer's FSM server (or any host with reachable SQL / FSM
on the LAN). Phones home to the HC companion over outbound HTTPS at a
configurable interval; the HC operator sees the connector come online
in the wizard's Step 3 Customer Connector card.

This is a one-shot interactive tool — NOT a Windows Service.
Start: drop `connector.json` next to the .exe and double-click (or run
       from cmd).
Stop:  Ctrl+C in the console window.

Customer admin sees a live console with heartbeat status; the SE sees
the same liveness in the HC wizard. When the SE is done collecting data
they tell the admin to Ctrl+C.

Build a single-file .exe with:
    pip install -r requirements.txt pyinstaller
    pyinstaller --onefile --console --name forcepoint-hc-connector main.py

The resulting .exe carries Python and `requests` baked in; nothing else
needs to be installed on the FSM host.
"""

from __future__ import annotations

import json
import os
import signal
import socket
import sys
import threading
import time
from datetime import datetime
from urllib.parse import quote as _url_quote, urlsplit

try:
    import requests
    import urllib3
except ImportError:
    print("ERROR: Missing dependency 'requests'. This .exe was built without it.")
    print("       Rebuild after running:  pip install -r requirements.txt")
    sys.exit(1)

# AES-256-GCM encryption for the "Via Connector" job runner. Optional
# at startup — if the operator only uses Direct mode there's no need
# for crypto, so we degrade gracefully when the binary was built
# without it instead of dying. The job poller thread skips itself when
# the import failed.
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAS_AESGCM = True
except ImportError:
    AESGCM = None  # type: ignore[assignment]
    _HAS_AESGCM = False

import secrets as _secrets  # stdlib — used for 12-byte IV generation


VERSION = "0.1.0"

BANNER = r"""
+----------------------------------------------------------+
|  Forcepoint HC -- Customer Connector  v{ver:<8}            |
|  One-way outbound tunnel to the HC companion              |
+----------------------------------------------------------+
"""


# ─────────────────────────────────────────────────────────────────────
#   Install-directory discovery — where connector.json lives
# ─────────────────────────────────────────────────────────────────────

def get_install_dir() -> str:
    """Return the directory the .exe / script lives in.

    PyInstaller --onefile extracts to a temp dir and sets sys._MEIPASS;
    that's NOT where the operator dropped connector.json. The .exe itself
    sits at the install location, which is what `sys.executable` points
    to. For raw `python main.py` we fall back to the script directory.
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


# ─────────────────────────────────────────────────────────────────────
#   Config loader + validator
# ─────────────────────────────────────────────────────────────────────

REQUIRED_FIELDS = ("hcEndpoint", "token", "encryptionKeyHex")


# Characters that sneak into hand-edited / copy-pasted bundles and break
# strict JSON parsing in the field. Email clients, Word, Teams and PDF
# viewers silently rewrite straight quotes as "smart quotes" and normal
# spaces as non-breaking spaces; Notepad / PowerShell `>` redirection add
# a UTF-8 or UTF-16 BOM. None of these are valid JSON, so we normalise
# them away before json.loads() instead of dying with a cryptic
# "Expecting property name ... (char 2)" that the customer admin can't
# act on. This is what makes the .exe parse the bundle identically on
# every host regardless of how the file got there.
_JSON_CHAR_FIXES = {
    "“": '"', "”": '"',   # “ ”  curly double quotes
    "‘": "'", "’": "'",   # ‘ ’  curly single quotes
    "«": '"', "»": '"',   # « »  guillemets (some locales)
    "–": "-", "—": "-",   # – —  en/em dash (rare, but harmless)
    " ": " ",                  # non-breaking space
    "﻿": "",                   # stray BOM / zero-width no-break space
    "​": "", "‌": "", "‍": "",  # zero-width space/joiners
}


def _read_json_tolerant(path: str) -> dict:
    """Read + parse a JSON bundle, tolerating the mangling that happens
    when a file is copied through a rich-text channel or re-saved by a
    Windows editor.

    Decodes UTF-8 (with or without BOM) and UTF-16 LE/BE (what Windows
    PowerShell 5.1 `>` / `Out-File` produce), then rewrites smart quotes,
    non-breaking spaces and zero-width characters back to their plain
    ASCII equivalents. Raises UnicodeDecodeError / json.JSONDecodeError /
    OSError on genuine problems so callers keep their existing handling.
    """
    with open(path, "rb") as fh:
        raw = fh.read()

    # BOM-based encoding detection. utf-8-sig transparently strips a
    # leading EF BB BF (and is a no-op for plain UTF-8); the UTF-16
    # branch covers PowerShell redirection output on Win PS 5.1.
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        text = raw.decode("utf-16")
    else:
        text = raw.decode("utf-8-sig")

    for bad, good in _JSON_CHAR_FIXES.items():
        if bad in text:
            text = text.replace(bad, good)

    return json.loads(text)


def load_config(install_dir: str) -> tuple[dict, str]:
    """Locate and parse connector.json next to the executable.

    Validates the bundle format / required fields. Bails out with a
    user-friendly error message if anything is off — the customer admin
    isn't expected to know the schema, so the error must be obvious.
    """
    config_path = os.path.join(install_dir, "connector.json")
    if not os.path.exists(config_path):
        die(
            "connector.json not found next to the executable.",
            f"Expected at: {config_path}",
            "",
            "Ask the Forcepoint SE for the connector.json bundle from the HC",
            "wizard's Step 3 Customer Connector card; drop it next to this",
            ".exe and re-run.",
            code=2,
        )

    try:
        cfg = _read_json_tolerant(config_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        die(
            f"connector.json could not be read: {e}",
            "",
            "The file must be plain UTF-8 JSON using straight quotes (\").",
            "If you copied it from an email, Teams or a PDF, the quotes were",
            "probably turned into “smart quotes”, which are not valid JSON.",
            "Re-download connector.json from the HC wizard's Step 3 Customer",
            "Connector card and transfer it as a file (do not copy-paste the",
            "text into Notepad).",
            code=2,
        )

    if cfg.get("_format") != "forcepoint-hc-customer-connector":
        die(
            "connector.json _format mismatch — this file isn't a Forcepoint",
            "HC connector bundle. Re-download from the HC wizard.",
            code=2,
        )

    missing = [k for k in REQUIRED_FIELDS if not cfg.get(k)]
    if missing:
        die(f"connector.json missing required field(s): {', '.join(missing)}", code=2)

    # Defensive default — the wizard always sets this but a hand-edited
    # bundle might not.
    cfg.setdefault("heartbeatIntervalSeconds", 30)
    cfg.setdefault("allowedSourceIp", "")
    cfg.setdefault("encryptionAlgorithm", "AES-256-GCM")
    # Outbound proxy is optional — absent / empty block means "direct".
    cfg.setdefault("proxy", {})

    return cfg, config_path


# ─────────────────────────────────────────────────────────────────────
#   Local secrets — SQL + DLP REST API credentials
# ─────────────────────────────────────────────────────────────────────
#
# `connector-secrets.json` lives next to the .exe and is filled in by
# the CUSTOMER ADMIN — NEVER by the SE, never transmitted over the
# network. The connector loads it once at startup and keeps the values
# in memory. When iteration 2 lands (job dispatch from HC), SQL queries
# and DLP REST API calls will use these locally-stored credentials.
#
# Two-file split is deliberate:
#   connector.json          — SE produces, contains token + AES key +
#                             HC endpoint (no customer secrets)
#   connector-secrets.json  — customer admin produces, contains SQL +
#                             DLP credentials (never leaves this host)
#
# The secrets file is OPTIONAL — without it the connector runs in
# heartbeat-only mode (current behaviour).

SECRETS_FORMAT = "forcepoint-hc-customer-connector-secrets"


def load_secrets(install_dir: str) -> tuple[dict | None, str | None]:
    """Locate and parse connector-secrets.json if present.

    Returns (secrets_dict, file_path) when found and valid, or
    (None, None) when the file is absent. Validation errors are fatal
    — same fail-closed pattern as connector.json so a misformatted
    file doesn't get silently ignored.
    """
    secrets_path = os.path.join(install_dir, "connector-secrets.json")
    if not os.path.exists(secrets_path):
        return None, None

    try:
        sec = _read_json_tolerant(secrets_path)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as e:
        die(
            f"connector-secrets.json could not be read: {e}",
            "",
            "The file must be plain UTF-8 JSON using straight quotes (\").",
            "If you edited it in Notepad and it was saved as UTF-16, or you",
            "pasted “smart quotes”, parsing fails. Save it as UTF-8 with a",
            "plain-text editor (VS Code / Notepad++) and re-run.",
            code=2,
        )

    if sec.get("_format") != SECRETS_FORMAT:
        die(
            "connector-secrets.json _format mismatch — expected",
            f"\"{SECRETS_FORMAT}\". Drop the template file beside the .exe",
            "and fill it in. See README.md.",
            code=2,
        )

    # Every SQL sub-block + the DLP API block is optional; the connector
    # only probes the blocks that are present and reports which ones
    # authenticate. Three discrete SQL blocks let the customer expose
    # whichever DBs are relevant to their deployment:
    #   - sql_Data   → DLP forensics / policy DB (wbsn-data-security)
    #   - sql_Web    → Web Security log DB        (wslogdb70)
    #   - sql_Email  → Email Security log DB      (esglogdb76)
    # Legacy v1 templates used a single `sql` key — treat it as sql_Data
    # so existing installs keep working after the .exe is rebuilt.
    if sec.get("sql") and not sec.get("sql_Data"):
        sec["sql_Data"] = sec["sql"]
    sec.setdefault("sql_Data",  None)
    sec.setdefault("sql_Web",   None)
    sec.setdefault("sql_Email", None)
    sec.setdefault("dlpApi",    None)
    return sec, secrets_path


def selftest_sql(sql_cfg: dict | None) -> tuple[str, str, int] | None:
    """SQL auth probe — connects with the configured credentials, runs
    `SELECT @@VERSION`, returns the server's reported product version.
    Falls back to a TCP-reachability check when no ODBC driver is
    installed (so the .exe still gives a useful signal on hosts that
    lack pyodbc — connector still runs in heartbeat-only mode).

    Auth modes:
      - 'windows' → Trusted_Connection=yes (uses the connector's process
                    identity, same as the customer admin who launched
                    .exe — typically a Windows domain account that
                    already has DLP database read access).
      - 'sql'     → UID / PWD from connector-secrets.json.

    Returns (status, message, latency_ms) or None when no SQL is
    configured.
    """
    if not sql_cfg:
        return None
    host = (sql_cfg.get("server") or "").strip()
    port = int(sql_cfg.get("port") or 1433)
    db = (sql_cfg.get("database") or "wbsn-data-security").strip()
    auth_mode = (sql_cfg.get("authMode") or "sql").lower()
    if not host:
        return ("fail", "no server host configured", 0)

    # Try real auth via pyodbc; fall back to TCP probe if pyodbc is
    # absent or no SQL Server ODBC driver is installed.
    try:
        import pyodbc  # type: ignore
    except ImportError:
        return _selftest_sql_tcp_fallback(host, port, "pyodbc not bundled")

    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        return _selftest_sql_tcp_fallback(host, port, "no SQL Server ODBC driver on this host")
    # Prefer the newest driver name (ODBC Driver 18 > 17 > native client)
    driver = sorted(drivers, reverse=True)[0]

    trust_cert = "yes" if sql_cfg.get("trustServerCertificate", True) else "no"
    if auth_mode == "windows":
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"Trusted_Connection=yes;"
            f"TrustServerCertificate={trust_cert};"
        )
    else:
        user = sql_cfg.get("username", "")
        pw = sql_cfg.get("password", "")
        if not user or not pw:
            return ("fail", "authMode=sql but username/password empty", 0)
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"UID={user};PWD={pw};"
            f"TrustServerCertificate={trust_cert};"
        )

    started = time.time()
    try:
        # pyodbc connect timeout is in seconds; on slow hosts we still
        # want to cap to 8s so the selftest doesn't hold up the boot
        # banner forever.
        conn = pyodbc.connect(conn_str, timeout=8)
        try:
            cur = conn.cursor()
            cur.execute("SELECT @@VERSION")
            row = cur.fetchone()
        finally:
            conn.close()
        latency = int((time.time() - started) * 1000)
        version = (row[0] if row else "?")
        # @@VERSION is a multi-line blob; squash + truncate for the banner.
        version_short = " ".join(version.split())[:80]
        return ("ok", f"{host}:{port}/{db} authenticated — {version_short}", latency)
    except pyodbc.Error as e:
        latency = int((time.time() - started) * 1000)
        msg = str(e).splitlines()[0][:160]
        return ("fail", f"{host}:{port}/{db} {msg}", latency)
    except Exception as e:  # noqa: BLE001 — defensive
        latency = int((time.time() - started) * 1000)
        return ("fail", f"{host}:{port}/{db} {type(e).__name__}: {e}", latency)


def _selftest_sql_tcp_fallback(host: str, port: int, reason: str) -> tuple[str, str, int]:
    """Used when pyodbc / a SQL Server ODBC driver isn't available.
    We can't authenticate, but we can still confirm the network path
    is open — better than skipping the test entirely."""
    started = time.time()
    try:
        with socket.create_connection((host, port), timeout=5):
            latency = int((time.time() - started) * 1000)
            return ("ok", f"{host}:{port} TCP reachable (auth skipped: {reason})", latency)
    except socket.timeout:
        return ("fail", f"{host}:{port} TCP timeout after 5s", 5000)
    except OSError as e:
        latency = int((time.time() - started) * 1000)
        return ("fail", f"{host}:{port} {type(e).__name__}: {e}", latency)


def selftest_dlp_api(api_cfg: dict | None, insecure: bool = True) -> tuple[str, str, int] | None:
    """Full DLP REST API auth probe — hits /auth/refresh-token with
    the operator-supplied credentials, then /deploy/status to recover
    the DLP version for display.

    NOTE: FSM ALWAYS uses self-signed certs (per Forcepoint reference),
    so cert verification is hard-disabled here regardless of the
    `insecure` flag, which only applies to the HC endpoint. Trying to
    validate against the system CA trust store would fail 100% of the
    time on production FSM hosts.

    Returns (status, message, latency_ms) or None when no DLP API is
    configured.
    """
    # Override: FSM REST API certs are always self-signed — see Forcepoint
    # DLP REST API documentation, section 1 (Authentication).
    del insecure  # explicit signal that we ignore the caller's value
    insecure = True
    if not api_cfg:
        return None
    url = (api_cfg.get("url") or "").strip().rstrip("/")
    if not url:
        return ("fail", "no DLP REST API url configured", 0)
    # Tolerate operators pasting bare host OR full /dlp/rest/v1 prefix
    base = url if url.lower().endswith("/dlp/rest/v1") else url + "/dlp/rest/v1"
    username = api_cfg.get("username", "")
    password = api_cfg.get("password", "")
    if not username or not password:
        return ("fail", "username or password missing", 0)

    if insecure:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    started = time.time()
    try:
        r = requests.post(
            f"{base}/auth/refresh-token",
            headers={"username": username, "password": password},
            timeout=10,
            verify=not insecure,
        )
        if r.status_code != 200:
            latency = int((time.time() - started) * 1000)
            body = (r.text or "").strip().splitlines()
            body_one = body[0][:80] if body else ""
            hint = "" if r.status_code != 403 else " (Application Administrator required)"
            return ("fail", f"auth HTTP {r.status_code}{hint} — {body_one}", latency)

        try:
            access_token = r.json().get("access_token", "")
        except Exception:
            access_token = ""
        if not access_token:
            latency = int((time.time() - started) * 1000)
            return ("fail", "auth ok but access_token missing in response", latency)

        # Bonus probe — /deploy/status to display the DLP version
        ver = "?"
        try:
            d = requests.get(
                f"{base}/deploy/status",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=5,
                verify=not insecure,
            )
            if d.ok:
                ver = d.json().get("dlp_version", "?")
        except Exception:
            pass
        latency = int((time.time() - started) * 1000)
        return ("ok", f"authenticated — DLP v{ver}", latency)

    except requests.exceptions.SSLError as e:
        latency = int((time.time() - started) * 1000)
        return ("fail", f"TLS error: {e}", latency)
    except requests.exceptions.ConnectionError:
        latency = int((time.time() - started) * 1000)
        return ("fail", "cannot reach DLP REST API host", latency)
    except requests.exceptions.Timeout:
        return ("fail", "timed out (>10s)", 10000)
    except requests.exceptions.RequestException as e:
        latency = int((time.time() - started) * 1000)
        return ("fail", f"{type(e).__name__}: {e}", latency)


def _selftest_to_dict(result: tuple[str, str, int] | None) -> dict | None:
    """Pack a selftest tuple into a JSON-friendly shape for transport
    in the heartbeat body. Adds a UTC timestamp so the HC wizard can
    show "checked X seconds ago"."""
    if result is None:
        return None
    status, msg, latency = result
    return {
        "status": status,
        "message": msg,
        "latencyMs": latency,
        "checkedAt": datetime.utcnow().isoformat() + "Z",
    }


# Shared, thread-safe holder for the latest selftest results. The
# heartbeat thread reads this every 30s and embeds it in the
# heartbeat body; the background selftest thread writes to it every
# 5 minutes (and once at startup). Lock keeps reads coherent.
#
# Keys mirror what the HC wizard renders in the "SELFTEST" panel of
# the Customer Connector card:
#   sqlData / sqlWeb / sqlEmail → one row per configured SQL DB
#   dlpApi                       → DLP REST API row
# A null value means the corresponding secrets block was absent on
# this connector host, so the wizard hides that row entirely (instead
# of showing it as "failed").
selftest_results: dict = {
    "sqlData":  None,
    "sqlWeb":   None,
    "sqlEmail": None,
    "dlpApi":   None,
}
selftest_lock = threading.Lock()


def selftest_run_all(secrets: dict | None, insecure: bool) -> dict:
    """Run every configured selftest and return a JSON-friendly dict.
    Each SQL block runs as its own probe — the connector reports per-DB
    pass/fail so the wizard can show "DLP DB ok, Web DB ok, Email DB
    auth failed" granularly instead of one blanket "SQL failed"."""
    sec = secrets or {}
    sql_data  = sec.get("sql_Data")  or None
    sql_web   = sec.get("sql_Web")   or None
    sql_email = sec.get("sql_Email") or None
    api_cfg   = sec.get("dlpApi")    or None
    return {
        "sqlData":  _selftest_to_dict(selftest_sql(sql_data))  if sql_data  else None,
        "sqlWeb":   _selftest_to_dict(selftest_sql(sql_web))   if sql_web   else None,
        "sqlEmail": _selftest_to_dict(selftest_sql(sql_email)) if sql_email else None,
        "dlpApi":   _selftest_to_dict(selftest_dlp_api(api_cfg, insecure)) if api_cfg else None,
    }


def selftest_background_loop(secrets: dict | None, insecure: bool, stop: threading.Event) -> None:
    """Re-runs selftests every 5 minutes so the HC wizard sees a
    relatively fresh snapshot even on long engagements. Runs in its
    own daemon thread; failures don't propagate to the heartbeat
    loop. Interruptible — stop event aborts immediately."""
    interval = 300  # 5 minutes
    while not stop.is_set():
        if stop.wait(interval):
            break
        try:
            fresh = selftest_run_all(secrets, insecure)
            with selftest_lock:
                selftest_results.update(fresh)
        except Exception as e:  # noqa: BLE001 — daemon thread, log + continue
            print(f"[selftest-bg] unexpected error: {type(e).__name__}: {e}")


def run_selftest(secrets: dict | None, insecure: bool = False) -> None:
    """Startup orchestrator — runs every configured selftest once at
    boot, prints the human-readable banner, AND seeds the shared
    selftest_results dict so the very first heartbeat already carries
    fresh data to the HC wizard."""
    if not secrets:
        return
    sql_data  = secrets.get("sql_Data")  or None
    sql_web   = secrets.get("sql_Web")   or None
    sql_email = secrets.get("sql_Email") or None
    api_cfg   = secrets.get("dlpApi")    or None
    if not any((sql_data, sql_web, sql_email, api_cfg)):
        return

    print()
    print("[selftest] Validating local credentials before starting heartbeat loop...")

    # Each SQL probe runs sequentially — they're cheap (single SELECT
    # @@VERSION) and parallelism would interleave banner output in a
    # way that's confusing to read. ~5-10s total for three probes.
    sql_results: list[tuple[str, dict | None, tuple[str, str, int] | None]] = []
    if sql_data:
        sql_results.append(("SQL DLP   ", sql_data,  selftest_sql(sql_data)))
    if sql_web:
        sql_results.append(("SQL Web   ", sql_web,   selftest_sql(sql_web)))
    if sql_email:
        sql_results.append(("SQL Email ", sql_email, selftest_sql(sql_email)))
    api_result = selftest_dlp_api(api_cfg, insecure=insecure) if api_cfg else None

    for label, _cfg, res in sql_results:
        if not res:
            continue
        status, msg, latency = res
        marker = "OK  " if status == "ok" else "FAIL"
        print(f"  {marker}  {label}  {msg}  ({latency}ms)")
    if api_result:
        status, msg, latency = api_result
        marker = "OK  " if status == "ok" else "FAIL"
        url = (api_cfg.get("url") or "").strip()
        print(f"  {marker}  DLP REST API  {url}  {msg}  ({latency}ms)")

    print()

    # Seed the shared holder so the first heartbeat already carries
    # selftest info — the wizard will see it on its 5s status poll.
    # Use selftest_run_all() rather than re-packaging the tuples we just
    # printed to keep one canonical packing path; the extra runtime is
    # negligible (a few hundred ms of network probes that already
    # cached pyodbc/requests imports above).
    with selftest_lock:
        selftest_results.update(selftest_run_all(secrets, insecure))


def _describe_sql_line(label: str, sql: dict | None) -> str:
    """Format a single SQL block as a banner row. Returns a 'not
    configured' placeholder when the block is missing."""
    if not sql:
        return f"  {label:18s} — not configured —"
    mode = sql.get("authMode", "sql")
    srv = sql.get("server", "?")
    port = sql.get("port", 1433)
    db = sql.get("database", "?")
    if mode == "windows":
        return f"  {label:18s} windows auth · {srv}:{port}/{db}"
    user = sql.get("username", "?")
    return f"  {label:18s} sql auth · {srv}:{port}/{db}  user={user}  pass={mask(sql.get('password',''))}"


def describe_secrets(secrets: dict | None) -> list[str]:
    """Format a human-readable summary of the loaded credentials for
    the startup banner. Always masks passwords and API keys."""
    if not secrets:
        return ["Local credentials:   — connector-secrets.json not present —",
                "                     (heartbeat-only mode; SQL / DLP queries will be rejected)"]
    lines: list[str] = ["Local credentials:"]
    lines.append(_describe_sql_line("SQL DLP:",   secrets.get("sql_Data")  or None))
    lines.append(_describe_sql_line("SQL Web:",   secrets.get("sql_Web")   or None))
    lines.append(_describe_sql_line("SQL Email:", secrets.get("sql_Email") or None))
    api = secrets.get("dlpApi") or {}
    if api:
        url = api.get("url", "?")
        user = api.get("username", "?")
        lines.append(f"  DLP REST API:      {url}  user={user}  pass={mask(api.get('password',''))}")
    else:
        lines.append("  DLP REST API:      — not configured —")
    return lines


# ─────────────────────────────────────────────────────────────────────
#   Outbound proxy resolution
# ─────────────────────────────────────────────────────────────────────
#
# Customer networks almost never allow direct outbound HTTPS — the
# connector has to egress through a corporate proxy, frequently one that
# demands Basic authentication. The proxy applies ONLY to the outbound
# traffic that reaches the HC companion (heartbeat + Via-Connector job
# poll). Internal SQL (pyodbc TCP) and DLP REST API calls live on the
# customer LAN and must NEVER be tunnelled through the proxy, so we attach
# the proxy to the two HC-facing requests.Session objects only — the SQL
# / DLP code paths are left untouched and stay direct.
#
# connector.json "proxy" block (every field optional):
#   "proxy": {
#     "enabled":        true,                       // master switch
#     "url":            "http://proxy.corp:8080",   // scheme optional → http
#     "username":       "svc_hc",                   // Basic proxy auth (opt)
#     "password":       "••••••",                   //                  (opt)
#     "useSystemProxy": false                       // defer to OS env vars
#   }
#
# CLI overrides (highest precedence): --no-proxy, --proxy <url>.


def _read_cli_value(flag: str) -> str | None:
    """Return the value for a `--flag value` or `--flag=value` CLI arg,
    or None when the flag isn't present / has no value."""
    argv = sys.argv
    for i, a in enumerate(argv):
        if a == flag and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith(flag + "="):
            return a.split("=", 1)[1]
    return None


def build_proxy_settings(cfg: dict) -> tuple[dict | None, bool, str]:
    """Resolve the outbound proxy used to reach the HC companion.

    Precedence (highest first):
      1. CLI  --no-proxy        → force a direct connection, ignore env
      2. CLI  --proxy <url>     → explicit proxy, overrides connector.json
      3. connector.json "proxy" block (enabled + url)
      4. connector.json proxy.useSystemProxy → defer to OS env vars
      5. nothing                → legacy behaviour: direct, but still
                                  inherit HTTP_PROXY / HTTPS_PROXY if set

    Returns (proxies, trust_env, human_desc):
      proxies    — dict for requests' Session.proxies, or None
      trust_env  — whether requests may read *_PROXY / NO_PROXY env vars
      human_desc — one-line banner summary (password is never shown)
    """
    # 1. Hard override — direct connection, ignore env + config entirely.
    if "--no-proxy" in sys.argv:
        return {"http": None, "https": None}, False, "disabled (--no-proxy)"

    proxy_cfg = cfg.get("proxy") or {}

    # 2/3. Explicit proxy URL — CLI wins over connector.json.
    cli_url = _read_cli_value("--proxy")
    url = (cli_url or proxy_cfg.get("url") or "").strip()
    enabled = bool(cli_url) or bool(proxy_cfg.get("enabled"))

    if enabled and url:
        # Corporate proxies are almost always plain HTTP even for HTTPS
        # targets — the CONNECT method tunnels TLS through them — so we
        # default a scheme-less host to http://.
        if "://" not in url:
            url = "http://" + url
        parts = urlsplit(url)
        scheme = parts.scheme or "http"
        host = parts.hostname or ""
        netloc_host = f"{host}:{parts.port}" if parts.port else host
        if not host:
            # Malformed URL — fail open to direct rather than crashing the
            # connector over a proxy typo; the banner makes it visible.
            return None, True, f"IGNORED (could not parse proxy url {url!r}); going direct"

        # Proxy auth — explicit fields win, else fall back to credentials
        # embedded in the URL (user:pass@host).
        username = (proxy_cfg.get("username") or parts.username or "").strip()
        password = proxy_cfg.get("password")
        if password is None:
            password = parts.password or ""

        if username:
            cred = _url_quote(username, safe="") + ":" + _url_quote(password or "", safe="")
            full = f"{scheme}://{cred}@{netloc_host}"
            auth_note = f" (Basic auth as {username})"
        else:
            full = f"{scheme}://{netloc_host}"
            auth_note = ""

        proxies = {"http": full, "https": full}
        src = "CLI --proxy" if cli_url else "connector.json"
        desc = f"{scheme}://{netloc_host}{auth_note} [{src}]"
        # Keep trust_env True so a NO_PROXY env list for internal hosts is
        # still honoured alongside our explicit proxy.
        return proxies, True, desc

    # 4. useSystemProxy — defer entirely to the OS environment variables.
    if proxy_cfg.get("useSystemProxy"):
        return None, True, "system environment (HTTP_PROXY / HTTPS_PROXY)"

    # 5. Default — unchanged legacy behaviour.
    return None, True, "none (direct; inherits OS environment if set)"


def apply_proxy_to_session(session: "requests.Session", cfg: dict) -> str:
    """Attach the resolved proxy (if any) to an HC-facing session and
    return the human-readable description for logging. Call this only on
    sessions that talk to the HC companion — never on SQL / DLP paths."""
    proxies, trust_env, desc = build_proxy_settings(cfg)
    session.trust_env = trust_env
    if proxies:
        # Drop None values (the --no-proxy sentinel) — trust_env=False has
        # already disabled env-based proxies in that case.
        explicit = {k: v for k, v in proxies.items() if v}
        if explicit:
            session.proxies.update(explicit)
    return desc


# ─────────────────────────────────────────────────────────────────────
#   Display helpers
# ─────────────────────────────────────────────────────────────────────

def mask(secret: str, keep: int = 8) -> str:
    """Print only the first N chars of a secret; mask the rest."""
    if not secret:
        return "-"
    return secret[:keep] + "..." + "*" * 8


def local_identity() -> tuple[str, str]:
    """Best-effort hostname + primary IP for logging.

    Uses a UDP socket trick that doesn't actually send anything but
    forces the OS to resolve a default route — works without DNS and
    avoids the `gethostbyname(hostname)` pitfall on multi-homed hosts.
    """
    hostname = socket.gethostname()
    ip = "?"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        try:
            ip = socket.gethostbyname(hostname)
        except OSError:
            pass
    return hostname, ip


def die(*lines: str, code: int = 1) -> None:
    """Print an error block and exit. When launched by double-click we
    pause so the customer admin can read the message before the cmd
    window vanishes."""
    print()
    print("ERROR:")
    for line in lines:
        print(f"  {line}")
    print()
    pause_if_double_clicked()
    sys.exit(code)


def pause_if_double_clicked() -> None:
    """If we're a frozen .exe running with no stdin redirection, the
    cmd window will close immediately on exit. Block on input() so the
    customer admin can read whatever's on screen.

    Heuristic: frozen + stdin is a tty + no `--no-pause` flag.
    """
    if "--no-pause" in sys.argv:
        return
    if not getattr(sys, "frozen", False):
        return
    if not sys.stdin or not sys.stdin.isatty():
        return
    try:
        input("Press Enter to close this window...")
    except (EOFError, KeyboardInterrupt):
        pass


# ─────────────────────────────────────────────────────────────────────
#   "Via Connector" job runner
# ─────────────────────────────────────────────────────────────────────
#
# The connector phones home with heartbeats every 30s, but separately
# also long-polls the companion for ad-hoc work — DLP REST API calls
# the HC wizard wants executed inside the customer network. The
# protocol is symmetric to the companion's Stage 2 implementation:
#
#   GET  /api/connector/job/next?token=...   (25s long-poll)
#        → 200 { jobId, kind, params }       — a job to execute
#        → 204                                — no work, re-poll
#
#   POST /api/connector/job/result
#        body { jobId, ok: true, envelope: {iv, ct, tag} }   (success)
#        body { jobId, ok: false, error: "…" }               (failure)
#
# The envelope is AES-256-GCM ciphertext of a JSON payload, using the
# 32-byte key the SE wrote into connector.json. Failures are sent in
# plaintext (the error message itself is not sensitive — bad creds,
# refused TCP, etc).
#
# Supported job kinds:
#   • dlp.test    — re-run the DLP REST API auth probe on demand and
#                   return {ok, message, latencyMs, serverVersion}.
#   • dlp.fetch   — generic DLP REST API call. Params: {path, method,
#                   body?, timeout?}. Connector handles auth transparently
#                   (cached Bearer token, refreshed on 401). Returns
#                   {status, body, headers}. The companion's posture
#                   handler issues several of these in parallel and
#                   aggregates the responses.

# Cached DLP REST API bearer token. Refreshed lazily (first dlp.fetch
# job) or eagerly on 401. Lifetime is conservative — the token itself
# is valid for an hour per the DLP REST API reference, but we treat
# it as 50min to leave headroom. Module-level so handlers across the
# poller thread reuse the same token.
_dlp_token_cache: dict = {
    "access_token": None,
    "expires_at": 0.0,   # epoch seconds
    "base_url":    None, # tracks the URL we authed against
}
_dlp_token_lock = threading.Lock()


def _aes_gcm_encrypt(plaintext_obj: dict, key_hex: str) -> dict:
    """Encrypt a JSON-serialisable object as an AES-256-GCM envelope.

    Returns {iv, ct, tag} with all three as lowercase hex strings —
    matches the companion's decryptEnvelope() shape. Raises ValueError
    when the AESGCM dependency is unavailable (binary built without
    `cryptography`); caller is expected to surface that as a job
    failure rather than crashing the poller.
    """
    if not _HAS_AESGCM:
        raise ValueError("cryptography library not installed in this .exe build")
    if not key_hex or len(key_hex) != 64:
        raise ValueError("encryption key must be 64 hex chars (32 bytes)")
    key = bytes.fromhex(key_hex)
    iv = _secrets.token_bytes(12)
    plaintext = json.dumps(plaintext_obj, separators=(",", ":")).encode("utf-8")
    aesgcm = AESGCM(key)
    ct_with_tag = aesgcm.encrypt(iv, plaintext, associated_data=None)
    # AESGCM appends the 16-byte tag to the ciphertext. Split it so the
    # envelope matches Node's setAuthTag() expectations.
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return {
        "iv":  iv.hex(),
        "ct":  ct.hex(),
        "tag": tag.hex(),
    }


def _dlp_base_url(api_cfg: dict) -> str:
    """Normalise the configured URL to its DLP REST API base — tolerate
    operators pasting bare host OR full /dlp/rest/v1 prefix. Mirrors
    the companion's normaliseDlpBaseUrl()."""
    url = (api_cfg.get("url") or "").strip().rstrip("/")
    if not url:
        return ""
    return url if url.lower().endswith("/dlp/rest/v1") else url + "/dlp/rest/v1"


def _dlp_acquire_token(api_cfg: dict, insecure: bool, force_refresh: bool = False) -> str:
    """Return a cached DLP access token, refreshing on demand. Caller
    handles ConnectionError / timeout; this function only raises
    ValueError for bad config and requests exceptions on auth failure."""
    if not api_cfg:
        raise ValueError("no dlpApi block in connector-secrets.json")
    base = _dlp_base_url(api_cfg)
    if not base:
        raise ValueError("dlpApi.url is empty")
    username = api_cfg.get("username", "")
    password = api_cfg.get("password", "")
    if not username or not password:
        raise ValueError("dlpApi.username or dlpApi.password missing")

    with _dlp_token_lock:
        now = time.time()
        cached = _dlp_token_cache
        # Cache miss / forced refresh / different base URL since last
        # call → re-auth. Same base URL with a fresh-enough token →
        # reuse.
        if (
            not force_refresh
            and cached["access_token"]
            and cached["base_url"] == base
            and now < cached["expires_at"]
        ):
            return cached["access_token"]

        if insecure:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        r = requests.post(
            f"{base}/auth/refresh-token",
            headers={"username": username, "password": password},
            timeout=15,
            verify=False,  # FSM REST API certs are always self-signed
        )
        if r.status_code != 200:
            body = (r.text or "").strip().splitlines()
            body_one = body[0][:120] if body else ""
            raise ValueError(f"refresh-token HTTP {r.status_code} — {body_one}")
        access = (r.json() or {}).get("access_token", "")
        if not access:
            raise ValueError("refresh-token response missing access_token")
        cached["access_token"] = access
        cached["base_url"] = base
        # 50 min lifetime — DLP tokens are good for 60 but we refresh
        # early to avoid race conditions on the 60th minute.
        cached["expires_at"] = now + (50 * 60)
        return access


def handle_dlp_test(_params: dict, secrets: dict | None, insecure: bool) -> dict:
    """Run the DLP REST API auth probe and return a structured result.
    Same shape the companion's POST /api/dlp/test produces, so the
    wizard's existing 'ok/error' parsing works regardless of transport."""
    api_cfg = (secrets or {}).get("dlpApi") or None
    if not api_cfg:
        return {
            "ok": False,
            "message": "Connector has no dlpApi block in connector-secrets.json. Add credentials and restart the .exe.",
            "latencyMs": 0,
        }
    result = selftest_dlp_api(api_cfg, insecure=insecure)
    if result is None:
        return {"ok": False, "message": "dlpApi block present but empty", "latencyMs": 0}
    status, message, latency = result
    return {"ok": status == "ok", "message": message, "latencyMs": latency}


def handle_dlp_fetch(params: dict, secrets: dict | None, insecure: bool) -> dict:
    """Generic DLP REST API proxy. Params: {path, method, body?, timeout?}
    where path is a string starting with '/' relative to /dlp/rest/v1.
    Connector handles the Bearer token transparently — first try uses
    the cached token, on 401 we refresh once and retry. Returns
    {status, body, headers} (body parsed as JSON when possible, else
    raw text)."""
    api_cfg = (secrets or {}).get("dlpApi") or None
    if not api_cfg:
        return {
            "ok": False,
            "error": "Connector has no dlpApi block; cannot proxy REST API calls.",
        }
    path = (params or {}).get("path") or ""
    method = ((params or {}).get("method") or "GET").upper()
    body = (params or {}).get("body")
    timeout = float((params or {}).get("timeout") or 60)
    if not path.startswith("/"):
        return {"ok": False, "error": "params.path must start with '/'."}

    base = _dlp_base_url(api_cfg)
    url = base + path

    if insecure:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _do_request(token: str):
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        kwargs: dict = {"headers": headers, "timeout": timeout, "verify": False}
        if body is not None:
            # body may be a dict (we JSON-encode) or a pre-encoded str
            if isinstance(body, (dict, list)):
                kwargs["json"] = body
            else:
                kwargs["data"] = body
                headers["Content-Type"] = "application/json"
        return requests.request(method, url, **kwargs)

    try:
        token = _dlp_acquire_token(api_cfg, insecure)
        r = _do_request(token)
        if r.status_code == 401:
            # Cached token went stale — refresh once and retry.
            token = _dlp_acquire_token(api_cfg, insecure, force_refresh=True)
            r = _do_request(token)
    except ValueError as e:
        return {"ok": False, "error": f"auth failure: {e}"}
    except requests.exceptions.SSLError as e:
        return {"ok": False, "error": f"TLS error: {e}"}
    except requests.exceptions.ConnectionError:
        return {"ok": False, "error": "cannot reach DLP REST API host"}
    except requests.exceptions.Timeout:
        return {"ok": False, "error": f"request timed out after {timeout:.0f}s"}
    except requests.exceptions.RequestException as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    # Parse body once — JSON when possible, raw text otherwise so the
    # companion can still see what came back from an unexpected error
    # page.
    try:
        parsed = r.json()
    except Exception:
        parsed = r.text
    return {
        "ok": True,
        "status": r.status_code,
        "body": parsed,
    }


_SQL_SECRET_KEY = {
    "data":  "sql_Data",
    "dlp":   "sql_Data",   # alias — wizard / report defs use 'dlp' for the same DB
    "web":   "sql_Web",
    "email": "sql_Email",
}


def _resolve_sql_cfg(secrets: dict | None, product: str) -> tuple[dict | None, str]:
    """Map a wizard product token ('data' | 'dlp' | 'web' | 'email')
    to the matching `sql_*` block in connector-secrets.json. Returns
    (cfg, secrets_key). cfg is None when the customer hasn't filled
    in that block."""
    if not product or not isinstance(product, str):
        return None, ""
    key = _SQL_SECRET_KEY.get(product.lower())
    if not key:
        return None, ""
    cfg = (secrets or {}).get(key) or None
    return cfg, key


def handle_sql_test(params: dict, secrets: dict | None, insecure: bool) -> dict:
    """Run the SQL auth probe against a single product's SQL block.
    Same shape as the companion's /api/sql/test response so the
    wizard can render it through the existing ConnStatus handling.
    Params: { product: 'data' | 'web' | 'email' }. Returns
    { ok, message, latencyMs, server? } — `server` carries the
    @@VERSION row and SQL Server metadata when ok=true."""
    del insecure  # SQL TLS is governed by trustServerCertificate, not the global insecure flag
    product = (params or {}).get("product") or "data"
    cfg, key = _resolve_sql_cfg(secrets, product)
    if not cfg:
        return {
            "ok": False,
            "message": f"Connector has no {key or 'sql'} block in connector-secrets.json for product '{product}'.",
            "latencyMs": 0,
        }
    result = selftest_sql(cfg)
    if result is None:
        return {"ok": False, "message": f"{key} block present but empty", "latencyMs": 0}
    status, message, latency = result
    # On success we MUST NOT pass `message` back unchanged — selftest_sql
    # returns the customer's host:port/db + @@VERSION banner there, which
    # would leak that to anyone reading the wizard's Test Connection
    # result row. The customer asked specifically for that not to be
    # exposed. The raw banner stays inside `server.versionBanner` for
    # callers that genuinely need it (none today), but the top-level
    # message goes generic.
    if status == "ok":
        return {
            "ok": True,
            "message": "Authenticated",
            "latencyMs": latency,
            "server": {
                "host":          cfg.get("server", ""),
                "port":          cfg.get("port", 1433),
                "database":      cfg.get("database", ""),
                "secretKey":     key,
                "versionBanner": message,
            },
        }
    # Failure path — keep selftest_sql's diagnostic message verbatim;
    # the operator genuinely needs the failure detail (driver missing,
    # auth refused, TCP timeout, etc.) to triage. These don't carry
    # customer secrets, just product / driver diagnostics.
    return {
        "ok": False,
        "message": message,
        "latencyMs": latency,
    }


def handle_sql_query(params: dict, secrets: dict | None, insecure: bool) -> dict:
    """Run a SQL query passed in by the companion. The companion
    resolved DLP_QUERIES[sqlKey] into a final SQL string + chose the
    product — the connector just needs to open a connection to the
    right secret-block DB and execute. Params:
        { product: 'data'|'web'|'email', sql: '<resolved SQL>', sqlKey?: '...' }
    Returns { ok, rows, rowCount, latencyMs } or { ok: false, error }.
    Rows are converted to a list of dicts keyed by column name so the
    companion's existing aggregator can consume the payload unchanged."""
    del insecure
    product = (params or {}).get("product") or "data"
    sql_text = ((params or {}).get("sql") or "").strip()
    if not sql_text:
        return {"ok": False, "error": "params.sql is empty"}
    cfg, key = _resolve_sql_cfg(secrets, product)
    if not cfg:
        return {"ok": False, "error": f"Connector has no {key or 'sql'} block for product '{product}'."}

    host = (cfg.get("server") or "").strip()
    port = int(cfg.get("port") or 1433)
    db   = (cfg.get("database") or "").strip()
    auth_mode = (cfg.get("authMode") or "sql").lower()
    trust_cert = "yes" if cfg.get("trustServerCertificate", True) else "no"
    if not host:
        return {"ok": False, "error": f"{key}.server is empty"}

    try:
        import pyodbc  # type: ignore
    except ImportError:
        return {"ok": False, "error": "pyodbc not bundled into this connector .exe"}

    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        return {"ok": False, "error": "no SQL Server ODBC driver detected on this host"}
    driver = sorted(drivers, reverse=True)[0]

    if auth_mode == "windows":
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"Trusted_Connection=yes;"
            f"TrustServerCertificate={trust_cert};"
        )
    else:
        user = cfg.get("username", "")
        pw   = cfg.get("password", "")
        if not user or not pw:
            return {"ok": False, "error": f"{key}.authMode=sql but username/password empty"}
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"UID={user};PWD={pw};"
            f"TrustServerCertificate={trust_cert};"
        )

    started = time.time()
    try:
        # Generous connect timeout — DLP reports against busy FSMs
        # occasionally take >30s; pyodbc's `timeout` is connect-only,
        # the query itself has no library-level cap.
        conn = pyodbc.connect(conn_str, timeout=15)
        try:
            cur = conn.cursor()
            cur.execute(sql_text)
            # Some templates use EXEC sp_executesql + dynamic SELECT —
            # pyodbc fetches whichever resultset arrived first via
            # nextset() walking. We grab the first one with rows.
            rows: list[dict] = []
            columns: list[str] = []
            while True:
                if cur.description is not None:
                    columns = [c[0] for c in cur.description]
                    for r in cur.fetchall():
                        # pyodbc Row → dict. Coerce non-JSON types
                        # (datetime, Decimal, bytes) to strings so the
                        # AES envelope can serialize them.
                        row_dict: dict = {}
                        for i, col in enumerate(columns):
                            v = r[i]
                            try:
                                json.dumps(v)
                                row_dict[col] = v
                            except (TypeError, ValueError):
                                row_dict[col] = str(v)
                        rows.append(row_dict)
                    break
                if not cur.nextset():
                    break
        finally:
            try: conn.close()
            except Exception: pass
        latency = int((time.time() - started) * 1000)
        return {
            "ok": True,
            "rows": rows,
            "rowCount": len(rows),
            "columns": columns,
            "latencyMs": latency,
        }
    except Exception as e:  # noqa: BLE001 — surface every error verbatim
        latency = int((time.time() - started) * 1000)
        return {
            "ok": False,
            "error": f"{type(e).__name__}: {e}",
            "latencyMs": latency,
        }


# Job-handler dispatch table. Add entries here when new kinds are
# introduced — keeps the poller loop body trivial.
_JOB_HANDLERS = {
    "dlp.test":  handle_dlp_test,
    "dlp.fetch": handle_dlp_fetch,
    "sql.test":  handle_sql_test,
    "sql.query": handle_sql_query,
}


def job_poll_loop(cfg: dict, secrets: dict | None, insecure: bool, stop: threading.Event) -> None:
    """Long-poll the companion for jobs and execute them locally.

    Runs as a daemon thread alongside the heartbeat loop. Each
    iteration:
      1. GET /api/connector/job/next  (25s long-poll)
      2. On 200: dispatch by `kind`, encrypt result, POST /result
      3. On 204 / timeout: re-poll immediately
      4. On any other failure: 3s back-off and continue

    Bails out quietly when the binary was built without AESGCM —
    Via-Connector mode is unavailable, but heartbeat keeps working.
    """
    if not _HAS_AESGCM:
        print("[job-poll] AESGCM unavailable — Via-Connector job runner DISABLED.")
        return
    key_hex = cfg.get("encryptionKeyHex") or ""
    if not key_hex or len(key_hex) != 64:
        print("[job-poll] encryptionKeyHex missing / wrong length — Via-Connector job runner DISABLED.")
        return

    endpoint = cfg["hcEndpoint"].rstrip("/")
    next_url   = f"{endpoint}/api/connector/job/next?token={cfg['token']}"
    result_url = f"{endpoint}/api/connector/job/result"

    session = requests.Session()
    # Same proxy as the heartbeat — the job poller is HC-facing too.
    job_proxy_desc = apply_proxy_to_session(session, cfg)
    consecutive_fail = 0

    print(f"[job-poll] active. Long-polling {next_url[:60]}…  (proxy: {job_proxy_desc})")

    while not stop.is_set():
        try:
            r = session.get(next_url, timeout=30, verify=not insecure)
        except requests.exceptions.Timeout:
            # Long-poll timed out naturally; re-poll without back-off.
            continue
        except requests.exceptions.RequestException as e:
            consecutive_fail += 1
            if consecutive_fail <= 3 or consecutive_fail % 10 == 0:
                print(f"[job-poll] /next failed: {type(e).__name__}: {e}")
            # 3s back-off, interruptible
            if stop.wait(3):
                break
            continue

        if r.status_code == 204:
            # No work — re-poll immediately.
            consecutive_fail = 0
            continue
        if r.status_code != 200:
            consecutive_fail += 1
            body = (r.text or "").strip().splitlines()
            body_one = body[0][:80] if body else ""
            if consecutive_fail <= 3 or consecutive_fail % 10 == 0:
                print(f"[job-poll] /next HTTP {r.status_code}: {body_one}")
            if stop.wait(3):
                break
            continue
        consecutive_fail = 0

        try:
            job = r.json() or {}
        except Exception as e:
            print(f"[job-poll] /next returned non-JSON: {type(e).__name__}: {e}")
            continue

        job_id = job.get("jobId")
        kind   = job.get("kind")
        params = job.get("params") or {}
        if not job_id or not kind:
            print(f"[job-poll] malformed job — missing jobId or kind: {job!r}")
            continue

        handler = _JOB_HANDLERS.get(kind)
        if not handler:
            _post_job_failure(session, result_url, job_id, f"unknown job kind: {kind}", insecure)
            continue

        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] [job] {kind}  jobId={job_id[:8]}…  starting")
        try:
            payload = handler(params, secrets, insecure)
        except Exception as e:  # noqa: BLE001 — never let one bad job kill the poller
            _post_job_failure(session, result_url, job_id, f"handler crashed: {type(e).__name__}: {e}", insecure)
            print(f"[{ts}] [job] {kind}  jobId={job_id[:8]}…  CRASH: {type(e).__name__}: {e}")
            continue

        # Encrypt result + POST back.
        try:
            envelope = _aes_gcm_encrypt(payload, key_hex)
        except Exception as e:  # noqa: BLE001
            _post_job_failure(session, result_url, job_id, f"encrypt failed: {type(e).__name__}: {e}", insecure)
            print(f"[{ts}] [job] {kind}  jobId={job_id[:8]}…  ENCRYPT FAIL")
            continue

        try:
            session.post(
                result_url,
                json={"jobId": job_id, "ok": True, "envelope": envelope},
                timeout=15,
                verify=not insecure,
            )
            print(f"[{ts}] [job] {kind}  jobId={job_id[:8]}…  done")
        except requests.exceptions.RequestException as e:
            print(f"[{ts}] [job] {kind}  jobId={job_id[:8]}…  /result POST failed: {type(e).__name__}: {e}")


def _post_job_failure(session: requests.Session, result_url: str, job_id: str, error: str, insecure: bool) -> None:
    """Best-effort plaintext failure report. Errors during the error
    report itself are swallowed — there's nothing useful to do at
    that point."""
    try:
        session.post(
            result_url,
            json={"jobId": job_id, "ok": False, "error": error},
            timeout=15,
            verify=not insecure,
        )
    except requests.exceptions.RequestException:
        pass


# ─────────────────────────────────────────────────────────────────────
#   Heartbeat loop
# ─────────────────────────────────────────────────────────────────────

def heartbeat_loop(cfg: dict, hostname: str, local_ip: str, stop: threading.Event) -> tuple[int, int]:
    """Phone home every `heartbeatIntervalSeconds` until `stop` is set.

    Returns (ok_count, fail_count). Surfaces each result on the console
    so the customer admin can see the connector is actually working
    without having to bother the SE.
    """
    endpoint = cfg["hcEndpoint"].rstrip("/")
    heartbeat_url = endpoint + "/api/connector/heartbeat"
    interval = int(cfg["heartbeatIntervalSeconds"])
    token = cfg["token"]
    insecure = bool(cfg.get("insecureTls")) or "--insecure" in sys.argv

    if endpoint.startswith("https") and insecure:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    session = requests.Session()
    # Route the outbound heartbeat through the customer's proxy when one
    # is configured. Internal SQL / DLP calls do NOT share this session,
    # so they stay direct on the LAN.
    proxy_desc = apply_proxy_to_session(session, cfg)
    # Embed hostname into the version string so the HC wizard's status
    # card can show "from host X" without us extending the server JSON
    # contract.
    version_string = f"{VERSION} ({hostname})"

    ok = 0
    fail = 0
    consecutive_fail = 0

    print(f"[start] Phoning home to {heartbeat_url}")
    print(f"        Heartbeat every {interval}s. Press Ctrl+C to stop.")
    print(f"        Outbound proxy: {proxy_desc}")
    print()

    while not stop.is_set():
        ts = datetime.now().strftime("%H:%M:%S")
        # Snapshot the latest selftest results under lock so the
        # background thread can't mutate them mid-serialisation.
        with selftest_lock:
            # Per-DB selftest snapshot — wizard renders one row per
            # configured probe. Each value is either None (block not
            # present on this connector) or {status, message,
            # latencyMs, checkedAt}.
            selftest_snapshot = {
                "sqlData":  selftest_results.get("sqlData"),
                "sqlWeb":   selftest_results.get("sqlWeb"),
                "sqlEmail": selftest_results.get("sqlEmail"),
                "dlpApi":   selftest_results.get("dlpApi"),
            }
        try:
            r = session.post(
                heartbeat_url,
                json={
                    "token": token,
                    "version": version_string,
                    "selftest": selftest_snapshot,
                },
                timeout=10,
                verify=not insecure,
            )
            latency_ms = r.elapsed.total_seconds() * 1000
            if r.status_code == 200:
                ok += 1
                consecutive_fail = 0
                print(f"[{ts}] OK    heartbeat #{ok}  ({latency_ms:.0f}ms)")
            elif r.status_code in (401, 403):
                # Explicit server-side rejection — either the token
                # isn't registered with the wizard (401) or the
                # source IP doesn't match the allowlist (403). Pull
                # the server's human-readable message out of the
                # JSON body and surface it cleanly.
                fail += 1
                consecutive_fail += 1
                try:
                    msg = (r.json() or {}).get("message", "")
                except Exception:
                    msg_lines = (r.text or "").strip().splitlines()
                    msg = msg_lines[0] if msg_lines else ""
                kind = "UNREGISTERED" if r.status_code == 401 else "ALLOWLIST"
                print(f"[{ts}] REJECT/{kind}  {msg or 'server refused this heartbeat'}")
                if r.status_code == 401:
                    print( "           The HC wizard does not currently recognise this token —")
                    print( "           the SE may have rotated it, disabled the connector, or")
                    print( "           revoked access. Ask for an updated connector.json.")
                else:
                    print( "           Ask the SE to update ALLOWED SOURCE IP / CIDR in the HC wizard.")
            else:
                fail += 1
                consecutive_fail += 1
                # Strip the response body to one line so the console
                # doesn't churn through paragraphs of HTML when an
                # upstream proxy returns its own error page.
                body = (r.text or "").strip().splitlines()
                body_one = body[0][:120] if body else ""
                print(f"[{ts}] FAIL  HTTP {r.status_code}  {body_one}")
        except requests.exceptions.SSLError as e:
            fail += 1
            consecutive_fail += 1
            print(f"[{ts}] FAIL  TLS error: {e}")
            print(f"           Hint: pass --insecure to skip cert validation (dev only).")
        except requests.exceptions.ConnectionError as e:
            fail += 1
            consecutive_fail += 1
            print(f"[{ts}] FAIL  cannot reach HC endpoint: {type(e).__name__}")
        except requests.exceptions.Timeout:
            fail += 1
            consecutive_fail += 1
            print(f"[{ts}] FAIL  timed out (10s)")
        except requests.exceptions.RequestException as e:
            fail += 1
            consecutive_fail += 1
            print(f"[{ts}] FAIL  {type(e).__name__}: {e}")

        if consecutive_fail == 5:
            print()
            print(f"[!] {consecutive_fail} consecutive failures. Check:")
            print(f"    - Is the HC endpoint URL correct?  ({endpoint})")
            print(f"    - Is outbound HTTPS allowed from this host?")
            print(f"    - Is the HC wizard open AND showing this token as enabled?")
            print(f"      (server only accepts heartbeats for currently-registered tokens)")
            print(f"    - Is the ALLOWED SOURCE IP / CIDR set in the HC wizard")
            print(f"      matching this host's outbound IP?  (REJECT messages above")
            print(f"      include the IP the companion actually saw)")
            print()

        # Interruptible sleep — break out immediately when Ctrl+C lands.
        if stop.wait(interval):
            break

    return ok, fail


# ─────────────────────────────────────────────────────────────────────
#   Main
# ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print(BANNER.format(ver=VERSION))

    install_dir = get_install_dir()
    cfg, config_path = load_config(install_dir)
    secrets, secrets_path = load_secrets(install_dir)

    hostname, local_ip = local_identity()

    # ── Sanitised banner — secrets masked ───────────────────────────
    print(f"  Install dir:        {install_dir}")
    print(f"  Config file:        {config_path}")
    if secrets_path:
        print(f"  Secrets file:       {secrets_path}")
    print(f"  HC endpoint:        {cfg['hcEndpoint']}")
    print(f"  Token (masked):     {mask(cfg['token'])}")
    print(f"  AES key (masked):   {mask(cfg['encryptionKeyHex'])}")
    print(f"  Encryption algo:    {cfg['encryptionAlgorithm']}")
    print(f"  Allowed source IP:  {cfg['allowedSourceIp'] or '-- any --'}")
    print(f"  Outbound proxy:     {build_proxy_settings(cfg)[2]}")
    print(f"  Heartbeat interval: {cfg['heartbeatIntervalSeconds']}s")
    print(f"  Local host:         {hostname} ({local_ip})")
    if "--insecure" in sys.argv:
        print(f"  TLS verify:         NO (--insecure)")
    for line in describe_secrets(secrets):
        print(f"  {line}")
    print()

    # Sanity warning when the operator-declared allowed-source-IP doesn't
    # match our actual outbound IP — heads off a "why is it offline?"
    # ticket later.
    if cfg["allowedSourceIp"] and cfg["allowedSourceIp"] != local_ip and "/" not in cfg["allowedSourceIp"]:
        print(f"  ! WARNING: allowedSourceIp ({cfg['allowedSourceIp']}) doesn't match local IP ({local_ip}).")
        print(f"             The HC companion may reject heartbeats. Update the IP in the HC wizard or use a CIDR.")
        print()

    # ── Self-test local credentials before phoning home ─────────────
    # Failure is informational — heartbeat loop starts regardless so
    # the customer admin doesn't lose the connector entirely just
    # because SQL credentials are wrong or the FSM is offline.
    if "--skip-selftest" not in sys.argv:
        run_selftest(secrets, insecure=("--insecure" in sys.argv))

    # ── Graceful shutdown ───────────────────────────────────────────
    stop = threading.Event()

    def handle_signal(signum, _frame):
        del signum  # unused
        print("\n[shutdown] Interrupt received, stopping heartbeat loop...")
        stop.set()

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    # ── Background selftest re-runner ────────────────────────────────
    # Keeps the shared selftest_results dict fresh every 5 minutes so
    # the HC wizard sees current SQL / DLP API status (not just the
    # boot-time snapshot). Daemon thread — dies when main exits.
    if "--skip-selftest" not in sys.argv and secrets:
        bg = threading.Thread(
            target=selftest_background_loop,
            args=(secrets, "--insecure" in sys.argv, stop),
            daemon=True,
            name="selftest-bg",
        )
        bg.start()

    # ── Via-Connector job poller ─────────────────────────────────────
    # Long-polls the companion for ad-hoc DLP REST API jobs. Daemon
    # thread — dies when main exits. Disabled (silently) when:
    #   • the binary was built without `cryptography`, or
    #   • connector.json has no / malformed encryptionKeyHex.
    # See `job_poll_loop` for the wire protocol.
    if "--no-job-poller" not in sys.argv:
        jp = threading.Thread(
            target=job_poll_loop,
            args=(cfg, secrets, "--insecure" in sys.argv, stop),
            daemon=True,
            name="job-poller",
        )
        jp.start()

    # ── Run ─────────────────────────────────────────────────────────
    start_ts = time.time()
    try:
        ok, fail = heartbeat_loop(cfg, hostname, local_ip, stop)
    except KeyboardInterrupt:
        # Belt-and-braces — signal handler should have already fired.
        ok, fail = 0, 0

    elapsed = time.time() - start_ts
    minutes = elapsed / 60
    print()
    print(f"[stopped] Ran for {minutes:.1f} minutes.  {ok} OK / {fail} failed heartbeats.")
    pause_if_double_clicked()
    return 0


if __name__ == "__main__":
    sys.exit(main())
