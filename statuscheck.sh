#!/bin/bash
#
# Forcepoint HC — post-deploy health check.
#
# Runs a series of probes against the deployed stack and prints a
# pass/fail report. Exits 0 when every probe passes, 1 otherwise — so
# it's also usable from CI / nagios / runbook scripts.
#
# Usage:
#     bash statuscheck.sh           # run all checks (no sudo required)
#     sudo bash statuscheck.sh      # include UFW firewall checks
#
# The script is read-only — never modifies state, safe to re-run at
# any time during or after a deploy.
#

set -uo pipefail

# ─────────────────────────────────────────────────────────────────────
#   Config (must match deploy.sh)
# ─────────────────────────────────────────────────────────────────────
COMPANION_SERVICE="sebuilderhc-companion"
COMPANION_PORT=3001

# ─────────────────────────────────────────────────────────────────────
#   Pretty-print helpers
# ─────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
  BOLD='\033[1m';     DIM='\033[2m';    NC='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; BOLD=''; DIM=''; NC=''
fi

PASS=0
FAIL=0
WARN=0

ok()    { echo -e "  ${GREEN}✓${NC} $*";              PASS=$((PASS + 1)); }
fail()  { echo -e "  ${RED}✗${NC} $*";                FAIL=$((FAIL + 1)); }
warn()  { echo -e "  ${YELLOW}!${NC} $*";             WARN=$((WARN + 1)); }
group() { echo -e "${BOLD}$*${NC}"; }
hint()  { echo -e "    ${DIM}↳ $*${NC}"; }

# ─────────────────────────────────────────────────────────────────────
#   Header
# ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}─── Forcepoint HC — system health ───${NC}"
echo "  date:     $(date -Iseconds)"
echo "  host:     $(hostname)"
echo "  uptime:   $(uptime -p 2>/dev/null || uptime)"
echo

# ─────────────────────────────────────────────────────────────────────
#   1) systemd services
# ─────────────────────────────────────────────────────────────────────
group "[systemd services]"
if systemctl is-active --quiet nginx; then
  ok "nginx                       active"
else
  fail "nginx                       NOT active"
  hint "sudo systemctl status nginx"
fi

if systemctl is-active --quiet "$COMPANION_SERVICE"; then
  ok "$COMPANION_SERVICE       active"
else
  fail "$COMPANION_SERVICE       NOT active"
  hint "sudo journalctl -u $COMPANION_SERVICE -n 40 --no-pager"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   2) Listening sockets
# ─────────────────────────────────────────────────────────────────────
group "[listening ports]"
if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE '(:|^)80$'; then
  ok "nginx listening on :80"
else
  fail "nginx NOT listening on :80"
fi

if ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "^127\.0\.0\.1:$COMPANION_PORT\$|^\[::1\]:$COMPANION_PORT\$"; then
  ok "companion listening on 127.0.0.1:$COMPANION_PORT (loopback-only)"
elif ss -tln 2>/dev/null | awk '{print $4}' | grep -qE "(^0\.0\.0\.0|^\[::\]):$COMPANION_PORT\$"; then
  warn "companion listening on 0.0.0.0:$COMPANION_PORT — should be loopback-only"
  hint "check HOST=127.0.0.1 env in /etc/systemd/system/$COMPANION_SERVICE.service"
else
  fail "companion NOT listening on :$COMPANION_PORT"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   3) Companion loopback health
# ─────────────────────────────────────────────────────────────────────
group "[companion direct]"
RESP=$(curl -fsS --max-time 3 "http://127.0.0.1:$COMPANION_PORT/health" 2>&1) && {
  ok "127.0.0.1:$COMPANION_PORT/health → $RESP"
} || {
  fail "companion /health loopback request failed"
  hint "process may be down or crashed mid-boot"
}
echo

# ─────────────────────────────────────────────────────────────────────
#   4) nginx → companion proxy
# ─────────────────────────────────────────────────────────────────────
group "[nginx → companion proxy]"
RESP=$(curl -fsS --max-time 3 "http://127.0.0.1/health" 2>&1) && {
  ok "nginx /health → $RESP"
} || {
  fail "nginx /health proxy failed"
  hint "verify /etc/nginx/sites-enabled/sebuilderhc has the /api + /health blocks"
}

HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
  "http://127.0.0.1/api/connector/status?token=__statuscheck__")
if [ "$HTTP" = "200" ]; then
  ok "nginx /api/connector/status → 200"
else
  fail "nginx /api/connector/status → HTTP $HTTP"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   5) Frontend SPA
# ─────────────────────────────────────────────────────────────────────
group "[frontend SPA]"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1/")
if [ "$HTTP" = "200" ]; then
  ok "127.0.0.1:80/ returns HTTP 200"
else
  fail "frontend returned HTTP $HTTP"
  hint "check /var/www/sebuilderhc/dist contains index.html"
fi

if [ -f /var/www/sebuilderhc/dist/index.html ]; then
  SIZE=$(stat -c '%s' /var/www/sebuilderhc/dist/index.html 2>/dev/null || echo 0)
  ok "dist/index.html present (${SIZE} bytes)"
else
  fail "dist/index.html missing"
  hint "rerun deploy.sh — build step may have been skipped"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   6) Firewall (UFW)
# ─────────────────────────────────────────────────────────────────────
group "[firewall — UFW]"
if ! command -v ufw &>/dev/null; then
  warn "ufw not installed — host-level firewall absent"
elif [ "$(id -u)" != "0" ]; then
  warn "skipped — run as sudo to inspect UFW rules"
elif ! ufw status | grep -q "Status: active"; then
  warn "UFW installed but not active"
else
  ufw status | grep -qE '(^|[[:space:]])80/tcp.*ALLOW' \
    && ok "80/tcp  ALLOW" \
    || fail "80/tcp  NOT allowed"
  ufw status | grep -qE '(^|[[:space:]])443/tcp.*ALLOW' \
    && ok "443/tcp ALLOW (needed once TLS is added)" \
    || warn "443/tcp not allowed — add with: sudo ufw allow 443/tcp"
  if ufw status | grep -qE "(^|[[:space:]])$COMPANION_PORT/tcp.*ALLOW"; then
    warn "$COMPANION_PORT/tcp is publicly allowed — close it once nginx is the only ingress"
    hint "sudo ufw delete allow $COMPANION_PORT/tcp"
  else
    ok "$COMPANION_PORT/tcp closed publicly (correct — only nginx is exposed)"
  fi
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   7) External reach (best-effort, via primary IP)
# ─────────────────────────────────────────────────────────────────────
group "[external reach]"
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "${SERVER_IP:-}" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://$SERVER_IP/health")
  if [ "$HTTP" = "200" ]; then
    ok "$SERVER_IP/health → 200 (reachable from LAN/public)"
  else
    fail "$SERVER_IP/health → HTTP $HTTP"
    hint "cloud security group / iptables may be blocking inbound 80"
  fi
else
  warn "could not determine primary IP (hostname -I returned nothing)"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   8) Connector telemetry (recent heartbeats)
# ─────────────────────────────────────────────────────────────────────
group "[connector telemetry]"
JOURNAL_BEATS=$(journalctl -u "$COMPANION_SERVICE" --since "10 minutes ago" 2>/dev/null \
  | grep -c "/api/connector/heartbeat" || true)
if [ -n "${JOURNAL_BEATS:-}" ] && [ "$JOURNAL_BEATS" -gt 0 ]; then
  ok "connector heartbeats in last 10m: $JOURNAL_BEATS"
else
  warn "no connector heartbeats in last 10m (no customer connector running, or none configured yet)"
fi
echo

# ─────────────────────────────────────────────────────────────────────
#   Summary
# ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}─── summary ───${NC}"
echo -e "  ${GREEN}pass:${NC} $PASS    ${YELLOW}warn:${NC} $WARN    ${RED}fail:${NC} $FAIL"
echo

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}✗ deployment has issues — see ✗ rows above.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ all critical checks passed.${NC}"
exit 0
