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
# 6. Create / refresh the companion systemd service
# --------------------------------------------------
echo "🛠️ Registering companion as systemd service..."

NODE_BIN=$(command -v node)
if [ -z "$NODE_BIN" ]; then
  echo "❌ ERROR: node binary not found on PATH"
  exit 1
fi

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
ExecStart=${NODE_BIN} ${SERVER_DIR}/index.mjs
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${COMPANION_SERVICE}

# Hardening — companion only needs read access to its own folder and
# outbound network. No file persistence, no inbound state on disk.
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

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
