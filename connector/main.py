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

try:
    import requests
    import urllib3
except ImportError:
    print("ERROR: Missing dependency 'requests'. This .exe was built without it.")
    print("       Rebuild after running:  pip install -r requirements.txt")
    sys.exit(1)


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
        with open(config_path, "r", encoding="utf-8") as fh:
            cfg = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        die(f"connector.json could not be read: {e}", code=2)

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
        with open(secrets_path, "r", encoding="utf-8") as fh:
            sec = json.load(fh)
    except (OSError, json.JSONDecodeError) as e:
        die(f"connector-secrets.json could not be read: {e}", code=2)

    if sec.get("_format") != SECRETS_FORMAT:
        die(
            "connector-secrets.json _format mismatch — expected",
            f"\"{SECRETS_FORMAT}\". Drop the template file beside the .exe",
            "and fill it in. See README.md.",
            code=2,
        )

    # Both sub-sections are optional; an empty file is allowed (gives
    # the customer admin a way to ship the file without any creds yet
    # while iteration 2 ramps up).
    sec.setdefault("sql", None)
    sec.setdefault("dlpApi", None)
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
selftest_results: dict = {"sql": None, "dlpApi": None}
selftest_lock = threading.Lock()


def selftest_run_all(secrets: dict | None, insecure: bool) -> dict:
    """Run both selftests and return a JSON-friendly dict. Side-effect
    free — caller decides whether to update the shared holder."""
    sql_cfg = (secrets or {}).get("sql") or None
    api_cfg = (secrets or {}).get("dlpApi") or None
    return {
        "sql":    _selftest_to_dict(selftest_sql(sql_cfg))             if sql_cfg else None,
        "dlpApi": _selftest_to_dict(selftest_dlp_api(api_cfg, insecure)) if api_cfg else None,
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
    """Startup orchestrator — runs both selftests once at boot,
    prints the human-readable banner, AND seeds the shared
    selftest_results dict so the very first heartbeat already
    carries fresh data to the HC wizard."""
    if not secrets:
        return
    sql_cfg = secrets.get("sql") or None
    api_cfg = secrets.get("dlpApi") or None
    if not sql_cfg and not api_cfg:
        return

    print()
    print("[selftest] Validating local credentials before starting heartbeat loop...")

    sql_result = selftest_sql(sql_cfg) if sql_cfg else None
    api_result = selftest_dlp_api(api_cfg, insecure=insecure) if api_cfg else None

    if sql_result:
        status, msg, latency = sql_result
        marker = "OK  " if status == "ok" else "FAIL"
        print(f"  {marker}  SQL  {msg}  ({latency}ms)")
    if api_result:
        status, msg, latency = api_result
        marker = "OK  " if status == "ok" else "FAIL"
        url = (api_cfg.get("url") or "").strip()
        print(f"  {marker}  DLP REST API  {url}  {msg}  ({latency}ms)")

    print()

    # Seed the shared holder so the first heartbeat already carries
    # selftest info — the wizard will see it on its 5s status poll.
    with selftest_lock:
        selftest_results["sql"]    = _selftest_to_dict(sql_result)
        selftest_results["dlpApi"] = _selftest_to_dict(api_result)


def describe_secrets(secrets: dict | None) -> list[str]:
    """Format a human-readable summary of the loaded credentials for
    the startup banner. Always masks passwords and API keys."""
    if not secrets:
        return ["Local credentials:   — connector-secrets.json not present —",
                "                     (heartbeat-only mode; SQL / DLP queries will be rejected)"]
    lines: list[str] = ["Local credentials:"]
    sql = secrets.get("sql") or {}
    if sql:
        mode = sql.get("authMode", "sql")
        srv = sql.get("server", "?")
        port = sql.get("port", 1433)
        db = sql.get("database", "?")
        if mode == "windows":
            lines.append(f"  SQL:               windows auth · {srv}:{port}/{db}")
        else:
            user = sql.get("username", "?")
            lines.append(f"  SQL:               sql auth · {srv}:{port}/{db}  user={user}  pass={mask(sql.get('password',''))}")
    else:
        lines.append("  SQL:               — not configured —")
    api = secrets.get("dlpApi") or {}
    if api:
        url = api.get("url", "?")
        user = api.get("username", "?")
        lines.append(f"  DLP REST API:      {url}  user={user}  pass={mask(api.get('password',''))}")
    else:
        lines.append("  DLP REST API:      — not configured —")
    return lines


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
    # Embed hostname into the version string so the HC wizard's status
    # card can show "from host X" without us extending the server JSON
    # contract.
    version_string = f"{VERSION} ({hostname})"

    ok = 0
    fail = 0
    consecutive_fail = 0

    print(f"[start] Phoning home to {heartbeat_url}")
    print(f"        Heartbeat every {interval}s. Press Ctrl+C to stop.")
    print()

    while not stop.is_set():
        ts = datetime.now().strftime("%H:%M:%S")
        # Snapshot the latest selftest results under lock so the
        # background thread can't mutate them mid-serialisation.
        with selftest_lock:
            selftest_snapshot = {
                "sql":    selftest_results.get("sql"),
                "dlpApi": selftest_results.get("dlpApi"),
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
