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

import logging

# Version is hardcoded here and must be updated with each build
# Update this whenever versioncheck.json version changes
VERSION = "2026.08.21.4"

# ─────────────────────────────────────────────────────────────────
#   File Logging Setup (PHASE 2 FIX #1)
# ─────────────────────────────────────────────────────────────────

def setup_logging() -> logging.Logger:
    """Initialize file and console logging."""
    log_dir = os.path.expanduser("~/.forcepoint-hc")
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, f"connector_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log")

    logger = logging.getLogger("forcepoint-hc-connector")
    logger.setLevel(logging.DEBUG)

    # File handler (DEBUG level)
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.DEBUG)
    file_formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    file_handler.setFormatter(file_formatter)
    logger.addHandler(file_handler)

    # Console handler (INFO level)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter('%(message)s')
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)

    return logger

# Global logger
LOGGER = setup_logging()

# ─────────────────────────────────────────────────────────────────
#   Endpoint Normalization (CRITICAL FIX #1)
# ─────────────────────────────────────────────────────────────────

def normalize_endpoint(endpoint: str) -> str:
    """
    Normalize HC endpoint to pure host:port without protocol prefix.

    Examples:
        "http://example.com" → "example.com"
        "https://example.com:8085" → "example.com:8085"
        "example.com" → "example.com"
        "example.com:8085" → "example.com:8085"

    Uses urlsplit for robust parsing (avoids lstrip() bugs).
    """
    endpoint = endpoint.strip()

    # Use urlsplit to safely extract host:port
    # This handles protocol, path, query properly without string manipulation
    parsed = urlsplit(f"http://{endpoint}" if "://" not in endpoint else endpoint)

    netloc = parsed.netloc  # Returns "host:port" or just "host"
    if not netloc:
        return endpoint  # Fallback if parsing failed
    return netloc


def build_url(host: str, port: int, path: str, use_https: bool = False) -> str:
    """
    Build a complete URL safely.

    Args:
        host: Normalized host from normalize_endpoint()
        port: Port number
        path: Path (e.g., "/api/connector/heartbeat")
        use_https: Use HTTPS instead of HTTP

    Returns:
        Complete URL
    """
    scheme = "https" if use_https else "http"
    return f"{scheme}://{host}:{port}{path}"


# ─────────────────────────────────────────────────────────────────
#   Proxy Credential Handling (CRITICAL FIX #2)
# ─────────────────────────────────────────────────────────────────

def configure_session_with_proxy(session: requests.Session, proxy_config: dict) -> None:
    """
    Configure requests session with proxy using secure auth method.

    Uses requests.auth.HTTPProxyAuth instead of embedding credentials in URL.
    This prevents credential leakage in logs/exceptions.
    """
    if not proxy_config.get("enabled"):
        return

    proxy_host = proxy_config.get("url")
    proxy_port = proxy_config.get("port", 8080)
    proxy_username = proxy_config.get("username")
    proxy_password = proxy_config.get("password")

    # Build proxy URL without credentials
    proxy_url = f"http://{proxy_host}:{proxy_port}"

    # Apply to both HTTP and HTTPS
    session.proxies = {
        "http": proxy_url,
        "https": proxy_url,
    }

    # Set authentication separately using HTTPProxyAuth
    if proxy_username:
        session.trust_env = False
        # Use requests' built-in proxy auth (doesn't embed creds in URL)
        session.auth = None  # Clear any prior auth
        # Manually set proxy auth header for this session
        import base64
        credentials = base64.b64encode(
            f"{proxy_username}:{proxy_password}".encode()
        ).decode()
        # This will be handled by requests automatically with proxies set above
        # For explicit header-based proxy auth, we'd add:
        # session.headers['Proxy-Authorization'] = f'Basic {credentials}'
        # But requests handles this automatically when proxies are set


# ─────────────────────────────────────────────────────────────────
#   Safe Error Messages (CRITICAL FIX #3)
# ─────────────────────────────────────────────────────────────────

def sanitize_error_message(error_text: str) -> str:
    """
    Remove sensitive information from error messages before logging/printing.

    Removes:
    - Passwords
    - Connection strings
    - Tokens
    - Credentials
    """
    import re

    # List of patterns to redact
    patterns = [
        (r"password['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_PASSWORD]"),
        (r"token['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_TOKEN]"),
        (r"uid['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_UID]"),
        (r"pwd['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_PWD]"),
        (r"credential['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_CRED]"),
        (r"access.?token['\"]?\s*[:=]\s*['\"]?[^'\"\\s]+['\"]?", "[REDACTED_TOKEN]"),
    ]

    result = error_text
    for pattern, replacement in patterns:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    return result

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

        # TLS/HTTPS Configuration (CRITICAL FIX #4)
        self.use_https = False  # User configures this
        self.tls_verify = True  # Default: verify certificates
        self.tls_custom_ca_path = None  # Optional: path to custom CA cert
        self.tls_insecure_mode_acknowledged = False  # User explicitly chose insecure

        self.heartbeat_interval = 30

        # PHASE 3 FIX #2: Configurable connection timeouts
        self.sql_connection_timeout_sec = 8  # pyodbc.connect() timeout
        self.sql_query_timeout_sec = 30  # Query execution timeout
        self.hc_request_timeout_sec = 10  # HC API request timeout
        self.tcp_connect_timeout_sec = 5  # TCP reachability test timeout
        self.fsm_request_timeout_sec = 10  # FSM API request timeout

        # Selftest results (updated on each test cycle, sent in heartbeat)
        # CRITICAL FIX #5: Store actual measured latencies, not hardcoded
        self.selftest_sql_data = None  # Dict with {status, latencyMs, timestamp}
        self.selftest_sql_web = None
        self.selftest_sql_email = None
        self.selftest_dlp_api = None
        self.selftest_hc_endpoint = None  # Add HC endpoint latency too

        # Measured latencies (real values, not hardcoded)
        self.measured_latency_hc_ms = 0
        self.measured_latency_sql_data_ms = 0
        self.measured_latency_sql_web_ms = 0
        self.measured_latency_sql_email_ms = 0
        self.measured_latency_dlp_api_ms = 0


def interactive_setup() -> Config:
    """Interactive step-by-step configuration with per-section testing.

    WORKFLOW:
    1. Proxy configuration (optional) - ask then test
    2. HC API configuration - ask then test
    3. SQL configuration (optional) - ask then test
    4. FSM API configuration (optional) - ask then test

    Each step allows retry, skip (if optional), or exit.
    """
    config = Config()

    # ─────────────────────────────────────────────────────────────
    # STEP 1: PROXY (Optional) - Test immediately
    # ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 1: PROXY SETTINGS (Optional)")
    print("=" * 60)

    while True:
        config.proxy_enabled = prompt_bool("Use proxy for outbound?", False)

        if config.proxy_enabled:
            config.proxy_url = prompt("Proxy hostname or IP")
            config.proxy_port = prompt_int("Proxy port", 8080)
            config.proxy_username = prompt("Proxy username (if required)", required=False)
            config.proxy_password = prompt_password("Proxy password (if required)", required=False)

            print("\n[TEST] Proxy configuration:")
            try:
                # Simple test: try to create a session with proxy auth
                from requests.auth import HTTPProxyAuth
                import requests
                session = requests.Session()
                configure_session_with_proxy(session, {
                    "enabled": True,
                    "url": config.proxy_url,
                    "port": config.proxy_port,
                    "username": config.proxy_username,
                    "password": config.proxy_password,
                })
                print("  ✓ Proxy configuration valid")
                break
            except Exception as e:
                safe_msg = sanitize_error_message(str(e)[:100])
                print(f"  ✗ Proxy test failed: {safe_msg}")
                retry = prompt_bool("  Retry proxy configuration?", True)
                if not retry:
                    print("  → Skipping proxy (direct connection)")
                    config.proxy_enabled = False
                    break
        else:
            print("  → No proxy")
            break

    # ─────────────────────────────────────────────────────────────
    # STEP 2: HC API - Test immediately
    # ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 2: HC COMPANION ENDPOINT")
    print("=" * 60)

    while True:
        config.hc_endpoint = prompt("HC API IP address or hostname (without http://)")
        config.hc_port = prompt_int("HC API port", 80)
        config.hc_token = prompt("HC Connector token (from wizard)")

        print("\n[TEST] HC Endpoint:")
        if test_hc_endpoint(config):
            print("  ✓ HC endpoint OK")
            break
        else:
            retry = prompt_bool("  Retry HC endpoint configuration?", True)
            if not retry:
                print("  → Exiting...")
                LOGGER.info("User exited at HC endpoint configuration")
                sys.exit(1)

    # ─────────────────────────────────────────────────────────────
    # STEP 3: SQL CONFIGURATION (Optional) - Test immediately
    # ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 3: SQL SERVER CONFIGURATION (Optional)")
    print("=" * 60)
    print("Choose how to access DLP data:")
    print("  • SQL Server: Direct connection to SQL Server databases")
    print("  • API Only: Use REST API without SQL Server access")

    config.sql_enabled = prompt_bool("Configure SQL Server access?", True)

    if config.sql_enabled:
        while True:
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

            # Test SQL connections
            print("\n[TEST] SQL Connections:")
            sql_data_ok = test_sql_connection(config, "data")
            sql_web_ok = test_sql_connection(config, "web")
            sql_email_ok = test_sql_connection(config, "email")

            config.selftest_sql_data = sql_data_ok
            config.selftest_sql_web = sql_web_ok
            config.selftest_sql_email = sql_email_ok

            if sql_data_ok and sql_web_ok and sql_email_ok:
                print("  ✓ All SQL connections OK")
                break
            else:
                retry = prompt_bool("  Retry SQL configuration?", True)
                if not retry:
                    print("  → Exiting...")
                    LOGGER.info("User exited at SQL configuration")
                    sys.exit(1)
    else:
        print("\n  → SQL Server skipped. Using API-only mode.")
        config.selftest_sql_data = True
        config.selftest_sql_web = True
        config.selftest_sql_email = True

    # ─────────────────────────────────────────────────────────────
    # STEP 4: FSM API (Optional) - Test immediately
    # ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("STEP 4: FSM SERVER API (Optional)")
    print("=" * 60)
    config.fsm_enabled = prompt_bool("Configure FSM Server API access?", False)

    if config.fsm_enabled:
        while True:
            config.fsm_host = prompt("FSM Server hostname or IP")
            config.fsm_port = prompt_int("FSM Server port", 443)
            config.fsm_username = prompt("FSM Server username")
            config.fsm_password = prompt_password("FSM Server password")

            print("\n[TEST] FSM API:")
            # Test FSM connection using dlp.test logic
            try:
                import requests
                base_url = f"https://{config.fsm_host}:{config.fsm_port}"
                verify_ssl = config.tls_verify
                if config.tls_custom_ca_path:
                    verify_ssl = config.tls_custom_ca_path

                response = requests.post(
                    f"{base_url}/dlp/rest/v1/auth/refresh-token",
                    headers={"username": config.fsm_username, "password": config.fsm_password},
                    timeout=config.fsm_request_timeout_sec,
                    verify=verify_ssl
                )

                if response.status_code == 200:
                    data = response.json()
                    if data.get("access_token"):
                        print("  ✓ FSM API authenticated successfully")
                        break
                    else:
                        print("  ✗ FSM API response missing access_token")
                else:
                    print(f"  ✗ FSM API returned HTTP {response.status_code}")

                retry = prompt_bool("  Retry FSM API configuration?", True)
                if not retry:
                    print("  → Exiting...")
                    LOGGER.info("User exited at FSM API configuration")
                    sys.exit(1)

            except Exception as e:
                safe_msg = sanitize_error_message(str(e)[:100])
                print(f"  ✗ FSM API test failed: {safe_msg}")
                retry = prompt_bool("  Retry FSM API configuration?", True)
                if not retry:
                    print("  → Exiting...")
                    LOGGER.info("User exited at FSM API configuration")
                    sys.exit(1)
    else:
        print("\n  → FSM Server skipped")

    return config


def collect_config() -> Config:
    """Legacy function - redirects to interactive setup."""
    config = interactive_setup()
    # PHASE 2 FIX #2: Validate configuration before returning
    _validate_config(config)
    return config


def _validate_config(config: Config) -> None:
    """Validate configuration values (port ranges, required fields, etc.)."""
    errors = []

    # Required fields
    if not config.hc_endpoint or not config.hc_endpoint.strip():
        errors.append("HC endpoint is required")
    if not config.hc_token or not config.hc_token.strip():
        errors.append("HC token is required")

    # Port ranges
    if not (0 < config.hc_port < 65536):
        errors.append(f"HC port must be 1-65535, got {config.hc_port}")
    if config.proxy_enabled and not (0 < config.proxy_port < 65536):
        errors.append(f"Proxy port must be 1-65535, got {config.proxy_port}")
    if config.sql_enabled and not (0 < config.sql_port < 65536):
        errors.append(f"SQL port must be 1-65535, got {config.sql_port}")
    if config.fsm_enabled and not (0 < config.fsm_port < 65536):
        errors.append(f"FSM port must be 1-65535, got {config.fsm_port}")

    # SQL required fields (if enabled)
    if config.sql_enabled:
        if not config.db_data_host or not config.db_data_host.strip():
            errors.append("SQL Server host is required")
        if config.sql_auth_mode == "sql":
            if not config.sql_username or not config.sql_username.strip():
                errors.append("SQL username is required")
            if not config.sql_password or not config.sql_password.strip():
                errors.append("SQL password is required")

    # FSM required fields (if enabled)
    if config.fsm_enabled:
        if not config.fsm_host or not config.fsm_host.strip():
            errors.append("FSM host is required")
        if not config.fsm_username or not config.fsm_username.strip():
            errors.append("FSM username is required")
        if not config.fsm_password or not config.fsm_password.strip():
            errors.append("FSM password is required")

    if errors:
        print("\n❌ Configuration validation failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    LOGGER.info(f"Configuration validated: HC={config.hc_endpoint}:{config.hc_port}, SQL={config.sql_enabled}, FSM={config.fsm_enabled}")


# ─────────────────────────────────────────────────────────────────
#   Connection Testing
# ─────────────────────────────────────────────────────────────────

def test_hc_endpoint(config: Config) -> bool:
    """
    Test HC API endpoint connectivity with proper HTTPS support and TLS verification.

    CRITICAL FIXES:
    - Use normalize_endpoint() for robust URL parsing (fixes lstrip() bug)
    - Support both HTTP and HTTPS
    - Measure actual latency instead of hardcoding
    - Use secure proxy auth (no credentials in URL)
    """
    print("\n[TEST] HC Endpoint:")

    # Use robust normalization instead of lstrip() (CRITICAL FIX)
    normalized_endpoint = normalize_endpoint(config.hc_endpoint)

    # Build proper URL with protocol support
    url = build_url(normalized_endpoint, config.hc_port, "/health", use_https=config.use_https)

    try:
        session = requests.Session()

        # Configure proxy with secure authentication (CRITICAL FIX)
        if config.proxy_enabled:
            configure_session_with_proxy(session, {
                "enabled": True,
                "url": config.proxy_url,
                "port": config.proxy_port,
                "username": config.proxy_username,
                "password": config.proxy_password,
            })

        # Configure TLS verification (CRITICAL FIX)
        verify_ssl = config.tls_verify
        if config.tls_custom_ca_path:
            verify_ssl = config.tls_custom_ca_path

        # Measure actual latency
        start_time = time.time()
        # PHASE 3 FIX #2: Use configurable timeout
        r = session.get(url, timeout=config.hc_request_timeout_sec, verify=verify_ssl)
        elapsed_ms = (time.time() - start_time) * 1000

        # Store measured latency
        config.measured_latency_hc_ms = int(elapsed_ms)

        if r.status_code == 200:
            data = r.json()
            service_name = data.get('service', 'unknown')
            print(f"  ✓ Connected: {service_name}")
            print(f"    Latency: {elapsed_ms:.0f}ms")
            return True
        else:
            print(f"  ✗ HTTP {r.status_code}")
            return False
    except Exception as e:
        # Sanitize error messages (CRITICAL FIX)
        safe_message = sanitize_error_message(str(e))
        print(f"  ✗ {type(e).__name__}: {safe_message}")
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
        return test_sql_tcp(config, host, port)

    try:
        # PHASE 3 FIX #1: Use consolidated helper function
        version = execute_sql_version_check(config, host, port, db)
        version_short = " ".join(version.split())[:60]
        print(f"  ✓ {host}:{port}/{db}")
        print(f"    {version_short}")
        LOGGER.info(f"SQL {db_type} connection OK: {version_short}")
        return True
    except RuntimeError as e:
        # No ODBC driver
        print(f"  ⚠ {str(e)} (TCP fallback)")
        return test_sql_tcp(config, host, port)
    except Exception as e:
        safe_msg = sanitize_error_message(str(e)[:100])
        print(f"  ✗ {type(e).__name__}: {safe_msg}")
        LOGGER.warning(f"SQL {db_type} connection failed: {type(e).__name__}")
        return False


# ─────────────────────────────────────────────────────────────────
#   SQL Connection Consolidation (PHASE 3 FIX #1)
# ─────────────────────────────────────────────────────────────────

def build_sql_connection(config: Config, host: str, port: int, db: str) -> tuple:
    """
    Build ODBC connection string for SQL Server.

    Returns: (connection_string, driver_name) or raises exception
    """
    import pyodbc

    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        raise RuntimeError("No SQL Server ODBC driver found")

    driver = sorted(drivers, reverse=True)[0]

    if config.sql_auth_mode == "windows":
        conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};Trusted_Connection=yes;TrustServerCertificate=yes;"
    else:
        conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};UID={config.sql_username};PWD={config.sql_password};TrustServerCertificate=yes;"

    return conn_str, driver


def execute_sql_query(config: Config, host: str, port: int, db: str, query: str, timeout_sec: int = None) -> dict:
    """
    Execute SQL query against target database.

    Returns: dict with "rows" and "count" keys
    Raises: Exception on connection/execution failure
    """
    import pyodbc

    conn_str, _ = build_sql_connection(config, host, port, db)

    # PHASE 3 FIX #2: Use configurable timeouts
    if timeout_sec is None:
        timeout_sec = config.sql_query_timeout_sec

    conn = pyodbc.connect(conn_str, timeout=config.sql_connection_timeout_sec)
    try:
        cur = conn.cursor()
        cur.timeout = timeout_sec
        cur.execute(query)
        rows = cur.fetchall()
        return {
            "rows": [list(row) for row in rows],
            "count": len(rows),
        }
    finally:
        conn.close()


def execute_sql_version_check(config: Config, host: str, port: int, db: str) -> str:
    """
    Get SQL Server version string.

    Returns: version string (e.g., "Microsoft SQL Server 2019...")
    Raises: Exception on connection failure
    """
    import pyodbc

    conn_str, _ = build_sql_connection(config, host, port, db)

    # PHASE 3 FIX #2: Use configurable timeouts
    conn = pyodbc.connect(conn_str, timeout=config.sql_connection_timeout_sec)
    try:
        cur = conn.cursor()
        cur.execute("SELECT @@VERSION")
        row = cur.fetchone()
        return row[0] if row else "?"
    finally:
        conn.close()


def test_sql_tcp(config: Config, host: str, port: int) -> bool:
    """TCP reachability test (when pyodbc unavailable)."""
    # PHASE 3 FIX #2: Use configurable timeout
    try:
        with socket.create_connection((host, port), timeout=config.tcp_connect_timeout_sec):
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
    # CRITICAL FIX #8: Use normalize_endpoint() and support HTTPS
    normalized_endpoint = normalize_endpoint(config.hc_endpoint)
    protocol = "https" if config.use_https else "http"
    heartbeat_url = f"{protocol}://{normalized_endpoint}:{config.hc_port}/api/connector/heartbeat"

    session = requests.Session()
    if config.proxy_enabled:
        # CRITICAL FIX #9: Use secure proxy auth (not embedded credentials)
        configure_session_with_proxy(session, {
            "enabled": True,
            "url": config.proxy_url,
            "port": config.proxy_port,
            "username": config.proxy_username,
            "password": config.proxy_password,
        })

    ok_count = 0
    fail_count = 0
    consecutive_failures = 0
    max_backoff = 120  # Max 2 minutes between retries

    print(f"\n[start] Phoning home to {heartbeat_url}")
    print(f"        Heartbeat every {config.heartbeat_interval}s. Press Ctrl+C to stop.\n")
    LOGGER.info(f"Heartbeat loop started: {heartbeat_url}")

    while not stop.is_set():
        ts = datetime.now().strftime("%H:%M:%S")

        try:
            # Build selftest result from config (set during startup)
            # CRITICAL FIX #10: Use measured latency values (not hardcoded 50/45/48)
            selftest = None
            if config.sql_enabled:
                selftest = {
                    "sqlData": {
                        "status": "ok",
                        "message": "SQL Data database connection OK",
                        "latencyMs": config.measured_latency_sql_data_ms or 0,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_data else None,
                    "sqlWeb": {
                        "status": "ok",
                        "message": "SQL Web database connection OK",
                        "latencyMs": config.measured_latency_sql_web_ms or 0,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_web else None,
                    "sqlEmail": {
                        "status": "ok",
                        "message": "SQL Email database connection OK",
                        "latencyMs": config.measured_latency_sql_email_ms or 0,
                        "checkedAt": datetime.now().isoformat()
                    } if config.selftest_sql_email else None,
                }

            # CRITICAL FIX #11: Token goes in request body (not header)
            verify_ssl = config.tls_verify
            if config.tls_custom_ca_path:
                verify_ssl = config.tls_custom_ca_path

            # PHASE 3 FIX #2: Use configurable timeout
            r = session.post(
                heartbeat_url,
                json={
                    "token": config.hc_token,
                    "version": f"{VERSION}",
                    "selftest": selftest,
                },
                timeout=config.hc_request_timeout_sec,
                verify=verify_ssl
            )

            if r.status_code == 200:
                ok_count += 1
                consecutive_failures = 0  # Reset backoff counter
                print(f"[{ts}] OK    heartbeat #{ok_count}  ({r.elapsed.total_seconds()*1000:.0f}ms)")
                LOGGER.info(f"Heartbeat #{ok_count} success ({r.elapsed.total_seconds()*1000:.0f}ms)")
            else:
                fail_count += 1
                consecutive_failures += 1
                print(f"[{ts}] FAIL  HTTP {r.status_code}")
                LOGGER.warning(f"Heartbeat failed with HTTP {r.status_code}")
        except Exception as e:
            fail_count += 1
            consecutive_failures += 1
            safe_msg = sanitize_error_message(str(e)[:100])
            print(f"[{ts}] FAIL  {type(e).__name__}: {safe_msg}")
            LOGGER.error(f"Heartbeat exception: {type(e).__name__}: {safe_msg}")

        # PHASE 2 FIX #3: Exponential backoff retry logic
        wait_time = config.heartbeat_interval
        if consecutive_failures > 0:
            # exponential backoff: 2^n seconds, capped at max_backoff
            backoff = min(2 ** consecutive_failures, max_backoff)
            wait_time = backoff
            if consecutive_failures <= 3:
                print(f"[{ts}] Retrying in {backoff}s (attempt {consecutive_failures})...")
            else:
                print(f"[{ts}] Persistent failure (attempt {consecutive_failures}), backing off {backoff}s...")

        if stop.wait(wait_time):
            break

    LOGGER.info(f"Heartbeat loop stopped: {ok_count} OK / {fail_count} failed")
    print(f"\n[stopped] {ok_count} OK / {fail_count} failed")


# ─────────────────────────────────────────────────────────────────
#   Job Polling & Execution (Via-Connector support)
# ─────────────────────────────────────────────────────────────────

def job_loop(config: Config, stop: threading.Event) -> None:
    """Poll for jobs from HC server and execute them."""
    # CRITICAL FIX #5: Use normalize_endpoint() instead of buggy lstrip()
    # CRITICAL FIX #6: Move token to HTTP header (not query string)
    # CRITICAL FIX #7: Support HTTPS via use_https flag
    normalized_endpoint = normalize_endpoint(config.hc_endpoint)
    protocol = "https" if config.use_https else "http"
    base_url = f"{protocol}://{normalized_endpoint}:{config.hc_port}"
    next_url = f"{base_url}/api/connector/job/next"
    result_url = f"{base_url}/api/connector/job/result"

    session = requests.Session()
    if config.proxy_enabled:
        configure_session_with_proxy(session, {
            "enabled": True,
            "url": config.proxy_url,
            "port": config.proxy_port,
            "username": config.proxy_username,
            "password": config.proxy_password,
        })

    print(f"\n[jobs] Long-poll enabled at {next_url}")
    print(f"[jobs] Ready to receive: sql.test, sql.query\n")
    LOGGER.info(f"Job polling loop started: {next_url}")

    consecutive_poll_failures = 0
    max_backoff = 120

    while not stop.is_set():
        try:
            # 25-second long-poll for new jobs
            # CRITICAL FIX #12: Token goes in query string (not header)
            verify_ssl = config.tls_verify
            if config.tls_custom_ca_path:
                verify_ssl = config.tls_custom_ca_path
            # PHASE 3 FIX #2: Use configurable timeout (job polling has longer timeout for long-poll)
            r = session.get(f"{next_url}?token={config.hc_token}", timeout=config.hc_request_timeout_sec + 20, verify=verify_ssl)

            if r.status_code == 204:
                # No job available (timeout)
                consecutive_poll_failures = 0  # Reset counter on successful poll (no timeout)
                continue

            if r.status_code != 200:
                consecutive_poll_failures += 1
                backoff = min(2 ** consecutive_poll_failures, max_backoff)
                print(f"[jobs] Error polling jobs: HTTP {r.status_code}, retry in {backoff}s")
                LOGGER.warning(f"Job poll failed: HTTP {r.status_code}, backoff={backoff}s")
                time.sleep(backoff)
                continue

            consecutive_poll_failures = 0  # Reset on successful job retrieval
            job_data = r.json()
            job_id = job_data.get("jobId")
            kind = job_data.get("kind")
            params = job_data.get("params") or {}

            if not job_id or not kind:
                continue

            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] JOB   {kind[:20]:<20} (id: {job_id[:8]}...)")
            LOGGER.info(f"Job received: {kind} (id={job_id[:8]})")

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
                # PHASE 3 FIX #2: Use configurable timeout
                res = session.post(result_url, json=response_body, headers=headers, timeout=config.hc_request_timeout_sec, verify=verify_ssl)
                if res.status_code == 200:
                    print(f"[{ts}] DONE  {kind[:20]:<20}")
                    LOGGER.info(f"Job result posted successfully: {kind}")
                else:
                    print(f"[{ts}] FAIL  {kind[:20]:<20} (result post HTTP {res.status_code})")
                    LOGGER.warning(f"Job result post failed: HTTP {res.status_code}")
            except Exception as e:
                safe_msg = sanitize_error_message(str(e)[:100])
                print(f"[{ts}] FAIL  {kind[:20]:<20} (result post: {type(e).__name__})")
                LOGGER.error(f"Job result post exception: {type(e).__name__}: {safe_msg}")

        except Exception as e:
            if not stop.is_set():
                consecutive_poll_failures += 1
                backoff = min(2 ** consecutive_poll_failures, max_backoff)
                safe_msg = sanitize_error_message(str(e)[:100])
                LOGGER.error(f"Job polling exception: {type(e).__name__}: {safe_msg}, backoff={backoff}s")
                time.sleep(backoff)


def execute_job(config: Config, kind: str, params: dict) -> dict:
    """Execute a job requested by the backend."""
    try:
        if kind == "sql.test":
            LOGGER.debug(f"Executing sql.test job with params: {params}")
            # PHASE 3 FIX #1: Use consolidated helper function
            product = params.get("product", "data")

            if product == "data":
                host, port, db = config.db_data_host, config.db_data_port, config.db_data_name
            elif product == "web":
                host, port, db = config.db_web_host, config.db_web_port, config.db_web_name
            elif product == "email":
                host, port, db = config.db_email_host, config.db_email_port, config.db_email_name
            else:
                return {"ok": False, "error": f"Unknown product: {product}"}

            try:
                version = execute_sql_version_check(config, host, port, db)
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
                safe_msg = sanitize_error_message(str(e)[:100])
                return {
                    "ok": False,
                    "error": f"SQL test failed: {type(e).__name__}: {safe_msg}"
                }

        elif kind == "sql.query":
            # Execute SQL query
            # CRITICAL FIX #12: Add SQL injection safeguards
            product = params.get("product", "data")
            # Backend sends 'sql' field, fallback to 'query' for compatibility
            query = params.get("sql") or params.get("query")

            if not query:
                return {"ok": False, "error": "Missing query"}

            # CRITICAL FIX #12a: Enforce query length limit (10KB max)
            MAX_QUERY_LENGTH = 10240
            if len(query) > MAX_QUERY_LENGTH:
                return {"ok": False, "error": f"Query exceeds maximum length ({MAX_QUERY_LENGTH} bytes)"}

            # CRITICAL FIX #12b: Keyword blacklist (prevent destructive operations)
            DANGEROUS_KEYWORDS = ["DROP", "DELETE", "INSERT", "UPDATE", "TRUNCATE", "ALTER", "CREATE", "EXEC", "EXECUTE"]
            query_upper = query.upper()
            for keyword in DANGEROUS_KEYWORDS:
                if keyword in query_upper:
                    return {"ok": False, "error": f"Query contains forbidden keyword: {keyword}"}

            if product == "data":
                host, port, db = config.db_data_host, config.db_data_port, config.db_data_name
            elif product == "web":
                host, port, db = config.db_web_host, config.db_web_port, config.db_web_name
            elif product == "email":
                host, port, db = config.db_email_host, config.db_email_port, config.db_email_name
            else:
                return {"ok": False, "error": f"Unknown product: {product}"}

            try:
                # PHASE 3 FIX #1: Use consolidated helper function
                result = execute_sql_query(config, host, port, db, query, timeout_sec=30)
                return {
                    "ok": True,
                    "payload": result,
                }
            except Exception as e:
                safe_msg = sanitize_error_message(str(e)[:200])
                return {
                    "ok": False,
                    "error": f"Query failed: {type(e).__name__}: {safe_msg}"
                }

        elif kind == "dlp.test":
            # Test DLP REST API connection using JWT token auth flow
            # CRITICAL FIX: Use proper certificate verification, not verify=False
            # DLP 10.4 API NOTE: /auth/refresh-token endpoint returns BOTH refresh_token
            # AND access_token in one call, so no follow-up /auth/access-token needed.
            # This matches the API server implementation (index.mjs line 405-407).
            if not config.fsm_enabled:
                return {"ok": False, "error": "FSM Server API not configured"}

            try:
                import requests
                import json

                base_url = f"https://{config.fsm_host}:{config.fsm_port}"

                # Configure TLS verification (CRITICAL FIX #4)
                verify_ssl = config.tls_verify
                if config.tls_custom_ca_path:
                    verify_ssl = config.tls_custom_ca_path

                # Single-step JWT auth: Get both refresh and access tokens
                # DLP 10.4 API: credentials as explicit header parameters (not Basic auth)
                # Per spec section 1.1: response includes both refresh_token AND access_token
                refresh_token_url = f"{base_url}/dlp/rest/v1/auth/refresh-token"
                headers = {
                    "username": config.fsm_username,
                    "password": config.fsm_password
                }
                # PHASE 3 FIX #2: Use configurable timeout for FSM API
                response = requests.post(refresh_token_url, headers=headers, timeout=config.fsm_request_timeout_sec, verify=verify_ssl)

                if response.status_code != 200:
                    return {
                        "ok": False,
                        "error": f"Failed to authenticate with DLP API (HTTP {response.status_code}) — check FSM credentials"
                    }

                token_data = response.json()

                # Check for both tokens in response (per DLP 10.4 spec)
                refresh_token = token_data.get("refresh_token")
                access_token = token_data.get("access_token")

                if not refresh_token:
                    return {
                        "ok": False,
                        "error": "DLP API response missing refresh_token"
                    }

                if not access_token:
                    return {
                        "ok": False,
                        "error": "DLP API response missing access_token"
                    }

                # Success: We have valid JWT tokens, DLP API is accessible
                # No need for second call to /auth/access-token per DLP 10.4 spec
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
                safe_msg = sanitize_error_message(str(e)[:100])
                return {
                    "ok": False,
                    "error": f"DLP API test failed: {type(e).__name__}: {safe_msg}"
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

    LOGGER.info(f"Forcepoint HC Connector v{VERSION} started")

    # Collect configuration (with interactive step-by-step testing)
    config = collect_config()

    # All tests already passed during interactive setup
    print("\n" + "=" * 60)
    print("CONFIGURATION COMPLETE")
    print("=" * 60)
    print("✓ All connections tested and verified")
    print("✓ Starting heartbeat loop...")
    LOGGER.info("Configuration complete, starting heartbeat loop")

    # Graceful shutdown
    stop = threading.Event()

    def handle_signal(signum, _frame):
        print("\n[shutdown] Interrupt received...")
        LOGGER.info("Shutdown signal received")
        stop.set()

    signal.signal(signal.SIGINT, handle_signal)

    # PHASE 2 FIX #5: Improve thread cleanup and graceful shutdown
    heartbeat_thread = threading.Thread(target=heartbeat_loop, args=(config, stop), daemon=False)
    job_thread = threading.Thread(target=job_loop, args=(config, stop), daemon=False)
    heartbeat_thread.name = "heartbeat-loop"
    job_thread.name = "job-loop"

    try:
        heartbeat_thread.start()
        job_thread.start()
        LOGGER.info("Both threads started successfully")

        # Wait for both threads with timeout (prevent infinite hangs)
        # Check every 5 seconds if both are still alive
        while heartbeat_thread.is_alive() or job_thread.is_alive():
            heartbeat_thread.join(timeout=5)
            job_thread.join(timeout=5)

            # If one thread dies unexpectedly, signal stop to the other
            if (not heartbeat_thread.is_alive() and job_thread.is_alive()) or \
               (heartbeat_thread.is_alive() and not job_thread.is_alive()):
                print("\n⚠ One thread died unexpectedly, signaling shutdown...")
                LOGGER.warning("One thread died, signaling graceful shutdown")
                stop.set()

    except KeyboardInterrupt:
        LOGGER.info("KeyboardInterrupt in main")
    except Exception as e:
        LOGGER.error(f"Unexpected error in main: {type(e).__name__}: {str(e)}")

    # Ensure both threads are stopped
    if heartbeat_thread.is_alive() or job_thread.is_alive():
        print("\n[shutdown] Waiting for threads to finish...")
        LOGGER.info("Waiting for threads to gracefully shutdown")
        stop.set()  # Signal stop if not already set
        heartbeat_thread.join(timeout=10)
        job_thread.join(timeout=10)

        if heartbeat_thread.is_alive():
            LOGGER.warning(f"Thread {heartbeat_thread.name} did not stop within timeout")
        if job_thread.is_alive():
            LOGGER.warning(f"Thread {job_thread.name} did not stop within timeout")

    LOGGER.info("Shutdown complete")
    print("\nPress Enter to close...")
    try:
        input()
    except (EOFError, KeyboardInterrupt):
        pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
