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
        try:
            r = session.post(
                heartbeat_url,
                json={"token": token, "version": version_string},
                timeout=10,
                verify=not insecure,
            )
            latency_ms = r.elapsed.total_seconds() * 1000
            if r.status_code == 200:
                ok += 1
                consecutive_fail = 0
                print(f"[{ts}] OK    heartbeat #{ok}  ({latency_ms:.0f}ms)")
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
            print(f"    - Is the token expired or rotated?  (regenerate in HC wizard)")
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

    hostname, local_ip = local_identity()

    # ── Sanitised banner — secrets masked ───────────────────────────
    print(f"  Install dir:        {install_dir}")
    print(f"  Config file:        {config_path}")
    print(f"  HC endpoint:        {cfg['hcEndpoint']}")
    print(f"  Token (masked):     {mask(cfg['token'])}")
    print(f"  AES key (masked):   {mask(cfg['encryptionKeyHex'])}")
    print(f"  Encryption algo:    {cfg['encryptionAlgorithm']}")
    print(f"  Allowed source IP:  {cfg['allowedSourceIp'] or '-- any --'}")
    print(f"  Heartbeat interval: {cfg['heartbeatIntervalSeconds']}s")
    print(f"  Local host:         {hostname} ({local_ip})")
    if "--insecure" in sys.argv:
        print(f"  TLS verify:         NO (--insecure)")
    print()

    # Sanity warning when the operator-declared allowed-source-IP doesn't
    # match our actual outbound IP — heads off a "why is it offline?"
    # ticket later.
    if cfg["allowedSourceIp"] and cfg["allowedSourceIp"] != local_ip and "/" not in cfg["allowedSourceIp"]:
        print(f"  ! WARNING: allowedSourceIp ({cfg['allowedSourceIp']}) doesn't match local IP ({local_ip}).")
        print(f"             The HC companion may reject heartbeats. Update the IP in the HC wizard or use a CIDR.")
        print()

    # ── Graceful shutdown ───────────────────────────────────────────
    stop = threading.Event()

    def handle_signal(signum, _frame):
        del signum  # unused
        print("\n[shutdown] Interrupt received, stopping heartbeat loop...")
        stop.set()

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

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
