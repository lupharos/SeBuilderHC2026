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

VERSION = "0.2.0"

BANNER = r"""
+──────────────────────────────────────────────────────────────+
|  Forcepoint HC -- Customer Connector  v{ver:<6}              |
|  Interactive Configuration · No JSON Secrets Required        |
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

        self.heartbeat_interval = 30


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
        config.proxy_password = prompt("Proxy password (if required)", required=False)

    print("\n" + "=" * 60)
    print("STEP 3: SQL SERVER CONFIGURATION")
    print("=" * 60)
    print("DLP can connect to 1, 2, or 3 different SQL Server instances:")
    print("  • Data   (wbsn-data-security)")
    print("  • Web    (wslogdb70)")
    print("  • Email  (esglogdb76)")

    config.single_sql_host = prompt_bool("Same SQL Server for all databases?", True)

    config.sql_auth_mode = "windows" if prompt_bool("Use Windows auth?", False) else "sql"

    config.sql_host = prompt("SQL Server IP or hostname")
    config.sql_port = prompt_int("SQL Server port", 1433)

    if config.sql_auth_mode == "sql":
        config.sql_username = prompt("SQL Server username")
        config.sql_password = prompt("SQL Server password")

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
            r = session.post(
                heartbeat_url,
                json={
                    "token": config.hc_token,
                    "version": f"{VERSION}",
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
#   Main
# ─────────────────────────────────────────────────────────────────

def main() -> int:
    print(BANNER.format(ver=VERSION))

    # Collect configuration
    config = collect_config()

    # Test connections
    print("\n" + "=" * 60)
    print("TESTING CONNECTIONS")
    print("=" * 60)

    hc_ok = test_hc_endpoint(config)
    sql_data_ok = test_sql_connection(config, "data")
    sql_web_ok = test_sql_connection(config, "web")
    sql_email_ok = test_sql_connection(config, "email")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"HC Endpoint:  {'✓' if hc_ok else '✗'}")
    print(f"SQL Data:     {'✓' if sql_data_ok else '✗'}")
    print(f"SQL Web:      {'✓' if sql_web_ok else '✗'}")
    print(f"SQL Email:    {'✓' if sql_email_ok else '✗'}")

    all_ok = hc_ok and sql_data_ok  # HC and at least Data DB required

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

    # Run heartbeat loop
    try:
        heartbeat_loop(config, stop)
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
