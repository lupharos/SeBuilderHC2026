#!/bin/bash
#
# Forcepoint HC — full Ubuntu deployment.
#
# Architecture: nginx is the SOLE public ingress (the "router").
#   • Frontend (Vite SPA)  →  /  →  /var/www/sebuilderhc/dist
#   • Companion API        →  /api/*   →  reverse-proxy to 127.0.0.1:3001
#   • Health probe         →  /health  →  reverse-proxy to 127.0.0.1:3001
# The Node companion binds to LOOPBACK only — never publicly reachable.
# Customer Connector phones home through nginx (port 80 today, 443 when
# TLS is added with certbot). Blast radius = one process (nginx).
#
# Provisions:
#   1. System deps (nginx, git, curl, Node.js 20)
#   2. Repo clone / pull
#   3. Vite frontend build → /var/www/sebuilderhc/dist
#   4. Node companion (server/index.mjs) installed + systemd-managed,
#      bound to 127.0.0.1:3001 → loopback-only, no public socket.
#   5. UFW rule allowing 80/tcp + 443/tcp inbound (if UFW is active).
#      3001 stays closed publicly — only nginx can reach the companion.
#   6. Nginx config: routes / → dist, /api/* + /health → companion.
#
# Re-runnable: every step is idempotent. Safe to invoke after a `git pull`.
#

set -e

APP_NAME="sebuilderhc"
BASE_DIR="/var/www/sebuilderhc"
APP_DIR="$BASE_DIR/app"
DIST_DIR="$BASE_DIR/dist"
SERVER_DIR="$APP_DIR/server"
REPO_URL="https://github.com/lupharos/SeBuilderHC2026.git"
COMPANION_SERVICE="sebuilderhc-companion"
COMPANION_PORT=3001

# Connector binary deploy layout.
#   • Source path (inside the repo): $APP_DIR/ConnectorAgent/...
#   • Target path (system, served by the companion):
#       /var/lib/forcepoint-hc/forcepoint-hc-connector.exe
# The companion has ProtectHome=true / ProtectSystem=full in its systemd
# unit, so it can't reach the repo path under /home or /var/www reliably
# (and /home is invisible to it even as root). Copying the exe to
# /var/lib/forcepoint-hc/ keeps it on a path the hardened service can
# actually read.
CONNECTOR_AGENT_DIR="/var/lib/forcepoint-hc"
CONNECTOR_AGENT_BIN="forcepoint-hc-connector.exe"
CONNECTOR_AGENT_SRC="$APP_DIR/ConnectorAgent/$CONNECTOR_AGENT_BIN"
CONNECTOR_AGENT_DEST="$CONNECTOR_AGENT_DIR/$CONNECTOR_AGENT_BIN"

echo "🚀 FULL DEPLOY STARTING..."

# --------------------------------------------------
# 1. Install system dependencies
# --------------------------------------------------
echo "📦 Installing system dependencies..."

sudo apt update -y

if ! command -v nginx &> /dev/null; then
  sudo apt install -y nginx git curl
fi

if ! command -v node &> /dev/null; then
  echo "🟢 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# --------------------------------------------------
# 2. Clone or update repo
# --------------------------------------------------
echo "📁 Preparing repo..."

if [ ! -d "$APP_DIR/.git" ]; then
  sudo rm -rf $APP_DIR
  sudo git clone $REPO_URL $APP_DIR
else
  cd $APP_DIR
  git pull origin main
fi

cd $APP_DIR

# --------------------------------------------------
# 3. Build frontend (Vite)
# --------------------------------------------------
echo "📦 Installing frontend npm packages..."
npm install

echo "🏗️ Building project..."
npm run build

if [ ! -d "$APP_DIR/dist" ]; then
  echo "❌ ERROR: build failed (dist not found)"
  exit 1
fi

# --------------------------------------------------
# 4. Install companion server deps
# --------------------------------------------------
echo "📦 Installing companion server dependencies..."

if [ ! -d "$SERVER_DIR" ]; then
  echo "❌ ERROR: server/ folder missing from repo — expected at $SERVER_DIR"
  exit 1
fi

cd $SERVER_DIR
npm install --omit=dev
cd $APP_DIR

# --------------------------------------------------
# 5. Deploy frontend to nginx folder
# --------------------------------------------------
echo "🌐 Deploying frontend dist to Nginx..."

sudo mkdir -p $DIST_DIR
sudo rm -rf $DIST_DIR/*
sudo cp -r $APP_DIR/dist/* $DIST_DIR/

# --------------------------------------------------
# 5b. Sync the customer connector binary to /var/lib/forcepoint-hc/
# --------------------------------------------------
# The companion serves the .exe via GET /api/connector/agent, reading
# from CONNECTOR_AGENT_DEST. systemd hardening (ProtectHome=true) hides
# /home, and the SPA dist tree is publicly served by nginx (we don't
# want the binary directly addressable as a static asset), so we keep
# the binary in /var/lib/ — outside nginx's docroot, readable by the
# companion's root user.
echo "📥 Syncing customer connector binary to ${CONNECTOR_AGENT_DEST}..."

if [ ! -f "$CONNECTOR_AGENT_SRC" ]; then
  echo "⚠️  Connector binary missing from repo: $CONNECTOR_AGENT_SRC"
  echo "   The /api/connector/agent endpoint will return 404 until you commit"
  echo "   ConnectorAgent/${CONNECTOR_AGENT_BIN} to the SeBuilderHC2026 repo."
else
  sudo mkdir -p "$CONNECTOR_AGENT_DIR"
  sudo cp -f "$CONNECTOR_AGENT_SRC" "$CONNECTOR_AGENT_DEST"
  sudo chmod 0644 "$CONNECTOR_AGENT_DEST"
  echo "   ✓ Copied $(stat -c '%s bytes' "$CONNECTOR_AGENT_DEST") → ${CONNECTOR_AGENT_DEST}"
fi

# --------------------------------------------------
# 6. Create / refresh the companion systemd service
# --------------------------------------------------
echo "🛠️ Registering companion as systemd service..."

NODE_BIN=$(command -v node)
if [ -z "$NODE_BIN" ]; then
  echo "❌ ERROR: node binary not found on PATH"
  exit 1
fi

# Self-upgrade log directory — survives service restarts (PrivateTmp
# would make /tmp disappear between the old + new companion instance,
# so the post-upgrade UI poll would see an empty log). Owned by root,
# world-readable so the upgrade modal can tail it without privilege.
sudo mkdir -p /var/log/forcepoint-hc
sudo chmod 0755 /var/log/forcepoint-hc

sudo bash -c "cat > /etc/systemd/system/${COMPANION_SERVICE}.service" <<EOL
[Unit]
Description=Forcepoint HC Companion (SQL + DLP REST API + Customer Connector broker)
Documentation=https://github.com/lupharos/SeBuilderHC2026
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${SERVER_DIR}
Environment=PORT=${COMPANION_PORT}
Environment=HOST=127.0.0.1
Environment=NODE_ENV=production
Environment=CONNECTOR_AGENT_PATH=${CONNECTOR_AGENT_DEST}
Environment=HC_UPGRADE_LOG=/var/log/forcepoint-hc/upgrade.log
ExecStart=${NODE_BIN} ${SERVER_DIR}/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${COMPANION_SERVICE}

# Hardening — companion needs outbound network for SQL Server / DLP
# REST API connections, plus read access to the operator's repo checkout
# (under /home/<user>/SeBuilderHC2026) so the Profile → "Check for
# Updates" flow can run \`git pull && bash deploy.sh\` in-place.
#
# ProtectHome was previously \`true\` but that hid /home from this unit's
# mount namespace — and every child process inherits the namespace, so
# even \`su - student -c '...'\` couldn't see the repo. We can't tighten
# this back without breaking self-upgrade or moving the SE checkout
# outside \$HOME.
#
# PrivateTmp was previously \`true\` but that created a per-process /tmp
# that vanished when deploy.sh restarted this unit mid-upgrade — the
# new companion instance would lose the upgrade log right when the
# frontend needs to tail it. Logs now live at /var/log/forcepoint-hc/
# instead, which survives restarts independent of namespace flags.
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=false
PrivateTmp=false
ReadWritePaths=/var/log/forcepoint-hc /var/lib/forcepoint-hc

[Install]
WantedBy=multi-user.target
EOL

sudo systemctl daemon-reload
sudo systemctl enable ${COMPANION_SERVICE}
sudo systemctl restart ${COMPANION_SERVICE}

# Quick smoke check — give it 2s to bind then ping /health on loopback.
# Companion binds to 127.0.0.1 only; nginx is the public gateway.
sleep 2
if curl -fsS --max-time 3 http://127.0.0.1:${COMPANION_PORT}/health > /dev/null; then
  echo "✅ Companion is up on 127.0.0.1:${COMPANION_PORT} (loopback-only)"
else
  echo "⚠️  Companion did not respond on /health within 3s."
  echo "   Investigate with:  sudo journalctl -u ${COMPANION_SERVICE} -n 40 --no-pager"
fi

# --------------------------------------------------
# 6b. Firewall — nginx is the only public ingress
# --------------------------------------------------
# Open 80/443 for nginx. The companion port (3001) stays closed
# publicly — nginx reaches it over loopback. If 3001 was opened by an
# earlier deploy iteration, close it now so the model is consistent.
if command -v ufw &> /dev/null && sudo ufw status | grep -q "Status: active"; then
  echo "🔓 Opening 80/tcp + 443/tcp in UFW (nginx ingress)..."
  sudo ufw allow 80/tcp  comment "Forcepoint HC nginx"     || true
  sudo ufw allow 443/tcp comment "Forcepoint HC nginx TLS" || true
  # Idempotent cleanup of any prior direct-port rule.
  sudo ufw delete allow ${COMPANION_PORT}/tcp 2>/dev/null || true
  sudo ufw reload || true
else
  echo "ℹ️  UFW not active — skipping firewall rules."
  echo "   If iptables/firewalld is in use, ensure 80+443 inbound are allowed,"
  echo "   and ${COMPANION_PORT}/tcp stays closed publicly."
fi

# --------------------------------------------------
# 7. Configure Nginx
#    Static SPA on /  +  reverse proxy /api/* + /health → companion
# --------------------------------------------------
echo "⚙️ Configuring Nginx..."

sudo bash -c "cat > /etc/nginx/sites-available/$APP_NAME" <<EOL
server {
    listen 80;
    server_name _;

    root $DIST_DIR;
    index index.html;

    # ── ES modules (.mjs) MIME fix ───────────────────────────────────
    # Ubuntu's stock /etc/nginx/mime.types doesn't always include
    # \`.mjs\`, so the browser receives application/octet-stream and
    # refuses to load files like pdf.worker.min-XXXX.mjs as ES modules.
    # We override Content-Type here for any .mjs asset under dist/.
    location ~ \.mjs\$ {
        default_type application/javascript;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files \$uri =404;
    }

    # ── Companion API + health ───────────────────────────────────────
    # Single public ingress: every client hits nginx; nginx routes the
    # API + health traffic to the loopback-only companion. The
    # companion has NO public socket — only nginx can reach it.

    location /api/ {
        proxy_pass http://127.0.0.1:${COMPANION_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Long-poll friendly read timeout — Customer Connector's
        # /api/connector/job/next (iteration 2) holds the request open
        # up to 25s; nginx default of 60s is fine, but be explicit.
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
        proxy_buffering off;
    }

    location = /health {
        proxy_pass http://127.0.0.1:${COMPANION_PORT}/health;
    }

    # ── Frontend SPA ─────────────────────────────────────────────────
    location / {
        try_files \$uri /index.html;
    }
}
EOL

# enable site
sudo ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/

# remove default nginx page
sudo rm -f /etc/nginx/sites-enabled/default || true

# --------------------------------------------------
# 8. Restart nginx
# --------------------------------------------------
echo "🔁 Restarting Nginx..."

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# --------------------------------------------------
# DONE
# --------------------------------------------------
SERVER_IP_GUESS=$(hostname -I 2>/dev/null | awk '{print $1}')

echo ""
echo "✅ DEPLOY COMPLETE — nginx is the single public ingress"
echo ""
echo "   Public URLs (all served by nginx):"
echo "     Frontend  →  http://${SERVER_IP_GUESS:-SERVER_IP}/"
echo "     API       →  http://${SERVER_IP_GUESS:-SERVER_IP}/api/"
echo "     Health    →  http://${SERVER_IP_GUESS:-SERVER_IP}/health"
echo ""
echo "   Companion (loopback-only, NOT publicly reachable):"
echo "     127.0.0.1:${COMPANION_PORT}      ← nginx → here, no direct external access"
echo ""
echo "   Customer Connector → connector.json hcEndpoint:"
echo "     http://${SERVER_IP_GUESS:-SERVER_IP}"
echo ""
echo "   systemd:"
echo "     sudo systemctl status  ${COMPANION_SERVICE}"
echo "     sudo systemctl restart ${COMPANION_SERVICE}"
echo "     sudo journalctl -u ${COMPANION_SERVICE} -f"
echo ""
echo "   Next step — add HTTPS (single ingress on 443):"
echo "     sudo apt install -y certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d <your-domain>"
