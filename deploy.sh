#!/bin/bash

set -e

APP_NAME="sebuilderhc"
BASE_DIR="/var/www/sebuilderhc"
APP_DIR="$BASE_DIR/app"
DIST_DIR="$BASE_DIR/dist"
REPO_URL="https://github.com/lupharos/SeBuilderHC2026.git"

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
# 3. Build app
# --------------------------------------------------
echo "📦 Installing npm packages..."
npm install

echo "🏗️ Building project..."
npm run build

if [ ! -d "$APP_DIR/dist" ]; then
  echo "❌ ERROR: build failed (dist not found)"
  exit 1
fi

# --------------------------------------------------
# 4. Deploy to nginx folder
# --------------------------------------------------
echo "🌐 Deploying to Nginx..."

sudo mkdir -p $DIST_DIR
sudo rm -rf $DIST_DIR/*
sudo cp -r $APP_DIR/dist/* $DIST_DIR/

# --------------------------------------------------
# 5. Configure Nginx (overwrite safe)
# --------------------------------------------------
echo "⚙️ Configuring Nginx..."

sudo bash -c "cat > /etc/nginx/sites-available/$APP_NAME" <<EOL
server {
    listen 80;
    server_name _;

    root $DIST_DIR;
    index index.html;

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
# 6. Restart nginx
# --------------------------------------------------
echo "🔁 Restarting Nginx..."

sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# --------------------------------------------------
# DONE
# --------------------------------------------------
echo "✅ DEPLOY COMPLETE!"
echo "👉 App running at: http://SERVER_IP"