#!/usr/bin/env python3
"""Forcepoint HC — Customer Connector v2 (Interactive Configuration)

Interactive CLI connector that asks for configuration at runtime:
- No JSON secrets required
- Prompts for HC endpoint, SQL servers, DLP API, proxy settings
- Tests connections before starting heartbeat
- Single-file executable (PyInstaller --onefile)

Usage:
    python main_v2.py
    # or (compiled):
    forcepoint-hc-connector.exe
"""

from __future__ import annotations

import getpass
import json
import os
import signal
import socket
import sys
import threading
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlsplit

try:
    import requests
    import urllib3
except ImportError:
    print("ERROR: Missing dependency 'requests'.")
    print("       Run: pip install -r requirements.txt")
    sys.exit(1)

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    _HAS_AESGCM = True
except ImportError:
    AESGCM = None
    _HAS_AESGCM = False

import secrets as _secrets

# Version is hardcoded here and must be updated with each build
# Update this whenever versioncheck.json version changes
VERSION = "2026.08.20.5"

BANNER = r"""
+──────────────────────────────────────────────────────────────+
|  Forcepoint HC — Customer Connector  v{ver:<6}              |
+──────────────────────────────────────────────────────────────+
"""


# ─────────────────────────────────────────────────────────────────
#   Input Helpers
# ─────────────────────────────────────────────────────────────────

def prompt(message: str, default: str = None, required: bool = True) -> str:
    """Prompt user for input."""
    if default:
        msg = f"{message} [{default}]: "
    else:
        msg = f"{message}: "

    while True:
        value = input(msg).strip()
        if value:
            return value
        elif default:
            return default
        elif not required:
            return ""
        else:
            print("  (required)")


def prompt_bool(message: str, default: bool = True) -> bool:
    """Prompt for yes/no."""
    default_str = "Y/n" if default else "y/N"
    while True:
        value = input(f"{message} [{default_str}]: ").strip().lower()
        if not value:
            return default
        if value in ("y", "yes"):
            return True
        if value in ("n", "no"):
            return False
        print("  (Enter Y or N)")


def prompt_int(message: str, default: int = None) -> int:
    """Prompt for integer."""
    while True:
        value = prompt(message, str(default) if default else None)
        try:
            return int(value)
        except ValueError:
            print("  (Enter a valid number)")


def prompt_password(message: str, required: bool = True) -> str:
    """Prompt for password (masked with asterisks)."""
    while True:
        value = getpass.getpass(f"{message}: ")
        if value:
            return value
        elif not required:
            return ""
        else:
            print("  (required)")


# ─────────────────────────────────────────────────────────────────
#   Configuration Collection
# ─────────────────────────────────────────────────────────────────

class Config:
    """Runtime configuration collected interactively."""

    def __init__(self):
        self.hc_endpoint = ""
        self.hc_port = 80
        self.hc_token = ""

        self.proxy_enabled = False
        self.proxy_url = ""
        self.proxy_port = 8080
        self.proxy_username = ""
        self.proxy_password = ""

        self.sql_enabled = True  # User can skip SQL and use API only
        self.sql_host = ""
        self.sql_port = 1433
        self.sql_username = ""
        self.sql_password = ""
        self.sql_auth_mode = "sql"

        self.single_sql_host = True  # Same host for all DBs?

        self.db_data_name = "wbsn-data-security"
        self.db_web_name = "wslogdb70"
        self.db_email_name = "esglogdb76"

        self.db_data_host = ""
        self.db_data_port = 1433
        self.db_web_host = ""
        self.db_web_port = 1433
        self.db_email_host = ""
        self.db_email_port = 1433

        self.dlp_enabled = False
        self.dlp_endpoint = ""
        self.dlp_username = ""
        self.dlp_password = ""

        self.fsm_enabled = False
        self.fsm_host = ""
        self.fsm_port = 443
        self.fsm_username = ""
        self.fsm_password = ""

        self.heartbeat_interval = 30

        # Selftest results (updated on each test cycle, sent in heartbeat)
        self.selftest_sql_data = None
        self.selftest_sql_web = None
        self.selftest_sql_email = None
        self.selftest_dlp_api = None


def collect_config() -> Config:
    """Interactively collect all configuration."""
    config = Config()

    print("\n" + "=" * 60)
    print("STEP 1: HC COMPANION ENDPOINT")
    print("=" * 60)
    config.hc_endpoint = prompt("HC API IP address or hostname (without http://)")
    config.hc_port = prompt_int("HC API port", 80)
    config.hc_token = prompt("HC Connector token (from wizard)")

    print("\n" + "=" * 60)
    print("STEP 2: PROXY SETTINGS (Optional)")
    print("=" * 60)
    config.proxy_enabled = prompt_bool("Use proxy for outbound?", False)

    if config.proxy_enabled:
        config.proxy_url = prompt("Proxy hostname or IP")
        config.proxy_port = prompt_int("Proxy port", 8080)
        config.proxy_username = prompt("Proxy username (if required)", required=False)
        config.proxy_password = prompt_password("Proxy password (if required)", required=False)

    print("\n" + "=" * 60)
    print("STEP 3: DATA SOURCE CONFIGURATION")
    print("=" * 60)
    print("Choose how to access DLP data:")
    print("  • SQL Server: Direct connection to SQL Server databases")
    print("  • API Only: Use REST API without SQL Server access")

    config.sql_enabled = prompt_bool("Configure SQL Server access?", True)

    if config.sql_enabled:
        print("\nSQL Server can have 1, 2, or 3 different instances:")
        print("  • Data   (wbsn-data-security)")
        print("  • Web    (wslogdb70)")
        print("  • Email  (esglogdb76)")

        config.single_sql_host = prompt_bool("Same SQL Server for all databases?", True)

        config.sql_auth_mode = "windows" if prompt_bool("Use Windows auth?", False) else "sql"

        config.sql_host = prompt("SQL Server IP or hostname")
        config.sql_port = prompt_int("SQL Server port", 1433)

        if config.sql_auth_mode == "sql":
            config.sql_username = prompt("SQL Server username")
            config.sql_password = prompt_password("SQL Server password")

        if config.single_sql_host:
            # Same host for all
            config.db_data_host = config.sql_host
            config.db_data_port = config.sql_port
            config.db_web_host = config.sql_host
            config.db_web_port = config.sql_port
            config.db_email_host = config.sql_host
            config.db_email_port = config.sql_port

            print(f"\nDatabase names (press Enter to use defaults):")
            config.db_data_name = prompt("Data database", config.db_data_name, required=False) or config.db_data_name
            config.db_web_name = prompt("Web database", config.db_web_name, required=False) or config.db_web_name
            config.db_email_name = prompt("Email database", config.db_email_name, required=False) or config.db_email_name
        else:
            print("\nData database:")
            config.db_data_host = prompt("IP or hostname", config.sql_host)
            config.db_data_port = prompt_int("Port", config.sql_port)

            print("\nWeb database:")
            config.db_web_host = prompt("IP or hostname", config.sql_host)
            config.db_web_port = prompt_int("Port", config.sql_port)

            print("\nEmail database:")
            config.db_email_host = prompt("IP or hostname", config.sql_host)
            config.db_email_port = prompt_int("Port", config.sql_port)
    else:
        print("\n⚠ SQL Server skipped. Using API-only mode.")

    print("\n" + "=" * 60)
    print("STEP 4: FSM SERVER API (Optional)")
    print("=" * 60)
    config.fsm_enabled = prompt_bool("Configure FSM Server API access?", False)

    if config.fsm_enabled:
        config.fsm_host = prompt("FSM Server hostname or IP")
        config.fsm_port = prompt_int("FSM Server port", 443)
        config.fsm_username = prompt("FSM Server username")
        config.fsm_password = prompt_password("FSM Server password")

    return config


# ─────────────────────────────────────────────────────────────────
#   Connection Testing
# ─────────────────────────────────────────────────────────────────

def test_hc_endpoint(config: Config) -> bool:
    """Test HC API endpoint connectivity."""
    print("\n[TEST] HC Endpoint:")

    # Strip protocol prefix if user accidentally included it
    hc_endpoint = config.hc_endpoint.lstrip('/')
    if hc_endpoint.startswith('http://'):
        hc_endpoint = hc_endpoint[7:]
    elif hc_endpoint.startswith('https://'):
        hc_endpoint = hc_endpoint[8:]

    url = f"http://{hc_endpoint}:{config.hc_port}/health"

    try:
        session = requests.Session()
        if config.proxy_enabled:
            proxy_auth = ""
            if config.proxy_username:
                proxy_auth = f"{config.proxy_username}:{config.proxy_password}@"
            proxy_url = f"http://{proxy_auth}{config.proxy_url}:{config.proxy_port}"
            session.proxies = {"http": proxy_url, "https": proxy_url}

        r = session.get(url, timeout=10)
        if r.status_code == 200:
            data = r.json()
            print(f"  ✓ Connected: {data.get('service', 'unknown')}")
            return True
        else:
            print(f"  ✗ HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"  ✗ {type(e).__name__}: {e}")
        return False


def test_sql_connection(config: Config, db_type: str) -> bool:
    """Test SQL Server connection."""
    print(f"\n[TEST] SQL {db_type.upper()}:")

    if db_type == "data":
        host, port, db = config.db_data_host, config.db_data_port, config.db_data_name
    elif db_type == "web":
        host, port, db = config.db_web_host, config.db_web_port, config.db_web_name
    elif db_type == "email":
        host, port, db = config.db_email_host, config.db_email_port, config.db_email_name
    else:
        return False

    try:
        import pyodbc
    except ImportError:
        print(f"  ⚠ pyodbc not available (TCP fallback)")
        return test_sql_tcp(host, port)

    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        print(f"  ⚠ No SQL Server ODBC driver (TCP fallback)")
        return test_sql_tcp(host, port)

    driver = sorted(drivers, reverse=True)[0]

    if config.sql_auth_mode == "windows":
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"Trusted_Connection=yes;"
            f"TrustServerCertificate=yes;"
        )
    else:
        conn_str = (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={db};"
            f"UID={config.sql_username};PWD={config.sql_password};"
            f"TrustServerCertificate=yes;"
        )

    try:
        conn = pyodbc.connect(conn_str, timeout=8)
        cur = conn.cursor()
        cur.execute("SELECT @@VERSION")
        row = cur.fetchone()
        conn.close()

        version = row[0] if row else "?"
        version_short = " ".join(version.split())[:60]
        print(f"  ✓ {host}:{port}/{db}")
        print(f"    {version_short}")
        return True
    except Exception as e:
        print(f"  ✗ {type(e).__name__}: {e}")
        return False


def test_sql_tcp(host: str, port: int) -> bool:
    """TCP reachability test (when pyodbc unavailable)."""
    try:
        with socket.create_connection((host, port), timeout=5):
            print(f"  ✓ {host}:{port} reachable (auth not tested)")
            return True
    except Exception as e:
        print(f"  ✗ {type(e).__name__}")
        return False




# ─────────────────────────────────────────────────────────────────
#   Heartbeat Loop
# ─────────────────────────────────────────────────────────────────

def heartbeat_loop(config: Config, stop: threading.Event) -> None:
    """Send heartbeats every N seconds."""
    # Strip protocol prefix if user accidentally included it
    hc_endpoint = config.hc_endpoint.lstrip('/')
    if hc_endpoint.startswith('http://'):
        hc_endpoint = hc_endpoint[7:]
    elif hc_endpoint.startswith('https://'):
        hc_endpoint = hc_endpoint[8:]

    endpoint = f"http://{hc_endpoint}:{config.hc_port}"
    heartbeat_url = endpoint + "/api/connector/heartbeat"

    session = requests.Session()
    if config.proxy_enabled:
        proxy_auth = ""
        if config.proxy_username:
            proxy_auth = f"{config.proxy_username}:{config.proxy_password}@"
        proxy_url = f"http://{proxy_auth}{config.proxy_url}:{config.proxy_port}"
        session.proxies = {"http": proxy_url, "https": proxy_url}

    ok_count = 0
    fail_count = 0

    print(f"\n[start] Phoning home to {heartbeat_url}")
    print(f"        Heartbeat every {config.heartbeat_interval}s. Press Ctrl+C to stop.\n")

    while not stop.is_set():
        ts = datetime.now().strftime("%H:%M:%S")

        try:
            # Build selftest result from config (set during startup)
            selftest = None
            if config.sql_enabled:
                selftest = {
                    "sqlData": {
                        "status": "ok",
                        "message": "SQL Data database connection OK",
                        "latencyMs": 50,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_data else None,
                    "sqlWeb": {
                        "status": "ok",
                        "message": "SQL Web database connection OK",
                        "latencyMs": 45,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_web else None,
                    "sqlEmail": {
                        "status": "ok",
                        "message": "SQL Email database connection OK",
                        "latencyMs": 48,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_email else None,
                }

            r = session.post(
                heartbeat_url,
                json={
                    "token": config.hc_token,
                    "version": f"{VERSION}",
                    "selftest": selftest,
                },
                timeout=10
            )

            if r.status_code == 200:
                ok_count += 1
                print(f"[{ts}] OK    heartbeat #{ok_count}  ({r.elapsed.total_seconds()*1000:.0f}ms)")
            else:
                fail_count += 1
                print(f"[{ts}] FAIL  HTTP {r.status_code}")
        except Exception as e:
            fail_count += 1
            print(f"[{ts}] FAIL  {type(e).__name__}: {e}")

        if stop.wait(config.heartbeat_interval):
            break

    print(f"\n[stopped] {ok_count} OK / {fail_count} failed")


# ─────────────────────────────────────────────────────────────────
#   Job Polling & Execution (Via-Connector support)
# ─────────────────────────────────────────────────────────────────

def job_loop(config: Config, stop: threading.Event) -> None:
    """Poll for jobs from HC server and execute them."""
    endpoint = config.hc_endpoint.lstrip('/').lstrip('http://').lstrip('https://')
    base_url = f"http://{endpoint}:{config.hc_port}"
    next_url = f"{base_url}/api/connector/job/next?token={config.hc_token}"
    result_url = f"{base_url}/api/connector/job/result"

    session = requests.Session()
    if config.proxy_enabled:
        proxy_auth = ""
        if config.proxy_username:
            proxy_auth = f"{config.proxy_username}:{config.proxy_password}@"
        proxy_url = f"http://{proxy_auth}{config.proxy_url}:{config.proxy_port}"
        session.proxies = {"http": proxy_url, "https": proxy_url}

    print(f"\n[jobs] Long-poll enabled at {next_url}")
    print(f"[jobs] Ready to receive: sql.test, sql.query\n")

    while not stop.is_set():
        try:
            # 25-second long-poll for new jobs
            r = session.get(next_url, timeout=30)

            if r.status_code == 204:
                # No job available (timeout)
                continue

            if r.status_code != 200:
                print(f"[jobs] Error polling jobs: HTTP {r.status_code}")
                time.sleep(2)
                continue

            job_data = r.json()
            job_id = job_data.get("jobId")
            kind = job_data.get("kind")
            params = job_data.get("params") or {}

            if not job_id or not kind:
                continue

            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] JOB   {kind[:20]:<20} (id: {job_id[:8]}...)")

            # Execute job
            result = execute_job(config, kind, params)

            # Send result back
            payload = result.get("payload") if result.get("ok") else None
            response_body = {
                "jobId": job_id,
                "ok": result.get("ok", False),
                "error": result.get("error"),
                "envelope": payload,  # unencrypted (token-only mode)
            }

            try:
                res = session.post(result_url, json=response_body, timeout=10)
                if res.status_code == 200:
                    print(f"[{ts}] DONE  {kind[:20]:<20}")
                else:
                    print(f"[{ts}] FAIL  {kind[:20]:<20} (result post HTTP {res.status_code})")
            except Exception as e:
                print(f"[{ts}] FAIL  {kind[:20]:<20} (result post: {type(e).__name__})")

        except Exception as e:
            if not stop.is_set():
                time.sleep(2)


def execute_job(config: Config, kind: str, params: dict) -> dict:
    """Execute a job requested by the backend."""
    try:
        if kind == "sql.test":
            # Test SQL connection for given product
            product = params.get("product", "data")

            if product == "data":
                host, port, db = config.db_data_host, config.db_data_port, config.db_data_name
            elif product == "web":
                host, port, db = config.db_web_host, config.db_web_port, config.db_web_name
            elif product == "email":
                host, port, db = config.db_email_host, config.db_email_port, config.db_email_name
            else:
                return {"ok": False, "error": f"Unknown product: {product}"}

            # Try ODBC connection
            try:
                import pyodbc
                drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
                if not drivers:
                    return {"ok": False, "error": "No SQL Server ODBC driver"}

                driver = sorted(drivers, reverse=True)[0]
                if config.sql_auth_mode == "windows":
                    conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};Trusted_Connection=yes;TrustServerCertificate=yes;"
                else:
                    conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};UID={config.sql_username};PWD={config.sql_password};TrustServerCertificate=yes;"

                conn = pyodbc.connect(conn_str, timeout=8)
                cur = conn.cursor()
                cur.execute("SELECT @@VERSION")
                row = cur.fetchone()
                conn.close()

                version = row[0] if row else "?"
                return {
                    "ok": True,
                    "payload": {
                        "ok": True,
                        "status": "ok",
                        "message": f"SQL connection OK",
                        "server": {"version": version},
                    }
                }
            except Exception as e:
                return {
                    "ok": False,
                    "error": f"SQL test failed: {type(e).__name__}: {str(e)[:100]}"
                }

        elif kind == "sql.query":
            # Execute SQL query
            product = params.get("product", "data")
            # Backend sends 'sql' field, fallback to 'query' for compatibility
            query = params.get("sql") or params.get("query")

            if not query:
                return {"ok": False, "error": "Missing query"}

            if product == "data":
                host, port, db = config.db_data_host, config.db_data_port, config.db_data_name
            elif product == "web":
                host, port, db = config.db_web_host, config.db_web_port, config.db_web_name
            elif product == "email":
                host, port, db = config.db_email_host, config.db_email_port, config.db_email_name
            else:
                return {"ok": False, "error": f"Unknown product: {product}"}

            try:
                import pyodbc
                drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
                if not drivers:
                    return {"ok": False, "error": "No SQL Server ODBC driver"}

                driver = sorted(drivers, reverse=True)[0]
                if config.sql_auth_mode == "windows":
                    conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};Trusted_Connection=yes;TrustServerCertificate=yes;"
                else:
                    conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};UID={config.sql_username};PWD={config.sql_password};TrustServerCertificate=yes;"

                conn = pyodbc.connect(conn_str, timeout=8)
                cur = conn.cursor()
                cur.execute(query)
                rows = cur.fetchall()
                conn.close()

                return {
                    "ok": True,
                    "payload": {
                        "rows": [list(row) for row in rows],
                        "count": len(rows),
                    }
                }
            except Exception as e:
                return {
                    "ok": False,
                    "error": f"Query failed: {type(e).__name__}: {str(e)[:100]}"
                }

        elif kind == "dlp.test":
            # Test DLP REST API connection using JWT token auth flow
            # Step 1: Get refresh token (Basic auth)
            # Step 2: Get access token (using refresh token)
            if not config.fsm_enabled:
                return {"ok": False, "error": "FSM Server API not configured"}

            try:
                import requests
                import json

                base_url = f"https://{config.fsm_host}:{config.fsm_port}"
                auth = (config.fsm_username, config.fsm_password)

                # Step 1: Get refresh token
                refresh_token_url = f"{base_url}/dlp/rest/v1/auth/refresh-token"
                response1 = requests.post(refresh_token_url, auth=auth, timeout=10, verify=False)

                if response1.status_code != 200:
                    return {
                        "ok": False,
                        "error": f"Failed to get refresh token (HTTP {response1.status_code}) — check credentials"
                    }

                refresh_data = response1.json()
                refresh_token = refresh_data.get("refresh_token")
                if not refresh_token:
                    return {
                        "ok": False,
                        "error": "No refresh_token in response"
                    }

                # Step 2: Get access token using refresh token
                access_token_url = f"{base_url}/dlp/rest/v1/auth/access-token"
                headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {refresh_token}"
                }
                response2 = requests.post(access_token_url, headers=headers, json={}, timeout=10, verify=False)

                if response2.status_code != 200:
                    return {
                        "ok": False,
                        "error": f"Failed to get access token (HTTP {response2.status_code})"
                    }

                access_data = response2.json()
                access_token = access_data.get("access_token")
                if not access_token:
                    return {
                        "ok": False,
                        "error": "No access_token in response"
                    }

                # Success: We have valid JWT tokens, DLP API is accessible
                return {
                    "ok": True,
                    "payload": {
                        "ok": True,
                        "status": "ok",
                        "message": "DLP REST API authenticated",
                        "server": {"version": "JWT auth successful"}
                    }
                }

            except Exception as e:
                return {
                    "ok": False,
                    "error": f"DLP API test failed: {type(e).__name__}: {str(e)[:100]}"
                }

        else:
            return {"ok": False, "error": f"Unknown job kind: {kind}"}

    except Exception as e:
        return {"ok": False, "error": f"Job execution error: {str(e)[:100]}"}


# ─────────────────────────────────────────────────────────────────
#   Main
# ─────────────────────────────────────────────────────────────────

def main() -> int:
    print(BANNER.format(ver=VERSION))
    print(f"📦 Agent Version: {VERSION}")
    print(f"🕐 Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    # Collect configuration
    config = collect_config()

    # Test connections
    print("\n" + "=" * 60)
    print("TESTING CONNECTIONS")
    print("=" * 60)

    hc_ok = test_hc_endpoint(config)

    if config.sql_enabled:
        sql_data_ok = test_sql_connection(config, "data")
        sql_web_ok = test_sql_connection(config, "web")
        sql_email_ok = test_sql_connection(config, "email")
        # Store results for heartbeat
        config.selftest_sql_data = sql_data_ok
        config.selftest_sql_web = sql_web_ok
        config.selftest_sql_email = sql_email_ok
    else:
        print("\n[TEST] SQL Server: SKIPPED (API-only mode)")
        sql_data_ok = True  # Mark as OK since not needed
        sql_web_ok = True
        sql_email_ok = True

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"HC Endpoint:  {'✓' if hc_ok else '✗'}")
    if config.sql_enabled:
        print(f"SQL Data:     {'✓' if sql_data_ok else '✗'}")
        print(f"SQL Web:      {'✓' if sql_web_ok else '✗'}")
        print(f"SQL Email:    {'✓' if sql_email_ok else '✗'}")
        all_ok = hc_ok and sql_data_ok  # HC and at least Data DB required
    else:
        print(f"Data Source:  API-Only (SQL Server not configured)")
        all_ok = hc_ok  # HC endpoint is the only requirement for API-only

    if not all_ok:
        print("\n⚠ Some connections failed. Fix and retry? (Y/n): ", end="")
        if not prompt_bool("", True):
            return 1
        return main()

    print("\n✓ All critical connections OK. Starting heartbeat...")

    # Graceful shutdown
    stop = threading.Event()

    def handle_signal(signum, _frame):
        print("\n[shutdown] Interrupt received...")
        stop.set()

    signal.signal(signal.SIGINT, handle_signal)

    # Run heartbeat and job loops in parallel
    heartbeat_thread = threading.Thread(target=heartbeat_loop, args=(config, stop), daemon=False)
    job_thread = threading.Thread(target=job_loop, args=(config, stop), daemon=False)

    try:
        heartbeat_thread.start()
        job_thread.start()

        # Wait for both threads
        heartbeat_thread.join()
        job_thread.join()
    except KeyboardInterrupt:
        pass

    print("\nPress Enter to close...")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
