# How to Set Up — Forcepoint Intelligence Platform Health Check Wizard

This guide walks an operator through deploying the **Forcepoint Intelligence Platform — Health Check Wizard** on a fresh Ubuntu server. The `deploy.sh` script handles everything end-to-end: system dependencies, Node.js, Nginx, the Vite frontend build, the companion API service, and the customer connector binary.

> **Requirements**
> - Ubuntu 20.04 / 22.04 / 24.04 with `sudo` access
> - Outbound internet to GitHub, npm, and the NodeSource repository
> - Ports `80` and `443` open on the host

---

## 1. Prepare the system and clone the repository

```bash
sudo apt update -y
sudo apt install -y git
git clone https://github.com/lupharos/SeBuilderHC2026.git
cd SeBuilderHC2026
```

> `deploy.sh` does **not** run `apt update` or install `git` — these are done here once, manually. The script installs `nginx`, `curl`, and Node.js 20 only if they are not already present.

---

## 2. Run the deployment script

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

`deploy.sh` performs the following steps in order:

1. **System dependencies** — installs `nginx`, `git`, `curl`, and Node.js 20 (skipped if already present).
2. **Repository** — clones the repo to `/var/www/sebuilderhc/app`, or runs `git pull` if the directory already exists.
3. **Frontend build** — runs `npm install --include=dev` and `npm run build` (Vite); output lands in `dist/`.
4. **Companion server** — installs production Node dependencies for `server/index.mjs`.
5. **Frontend deploy** — copies `dist/` to `/var/www/sebuilderhc/dist` (served by Nginx).
6. **Connector binary** — copies `ConnectorAgent/forcepoint-hc-connector.exe` to `/var/lib/forcepoint-hc/` (served by the companion API, not as a static Nginx asset).
7. **Systemd service** — registers and starts `sebuilderhc-companion` on `127.0.0.1:3001` (loopback only).
8. **Firewall (UFW)** — opens ports `80/tcp` and `443/tcp`; port `3001` stays closed publicly.
9. **Nginx** — writes the site config, enables it, and restarts Nginx.

When the script finishes you will see output similar to:

```
✅ DEPLOY COMPLETE — nginx is the single public ingress

   Public URLs (all served by nginx):
     Frontend  →  http://<SERVER_IP>/
     API       →  http://<SERVER_IP>/api/
     Health    →  http://<SERVER_IP>/health

   Companion (loopback-only, NOT publicly reachable):
     127.0.0.1:3001      ← nginx → here, no direct external access

   Customer Connector → connector.json hcEndpoint:
     http://<SERVER_IP>
```

---

## 3. Verify

Open `http://<server-ip>/` in a browser. The wizard should load on the **HC Sessions** screen.

To confirm the companion is running:

```bash
sudo systemctl status sebuilderhc-companion
curl -fsS http://127.0.0.1:3001/health
```

---

## 4. Re-deploying after updates

To pull the latest code and rebuild, simply re-run the script from the cloned repository directory:

```bash
cd ~/SeBuilderHC2026
sudo ./deploy.sh
```

The script detects the existing checkout and performs a `git pull` instead of re-cloning. All steps are idempotent — safe to run repeatedly.

---

## 5. Adding HTTPS (recommended for production)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

---

## 6. Useful systemd commands

```bash
# Check companion status
sudo systemctl status sebuilderhc-companion

# Restart companion
sudo systemctl restart sebuilderhc-companion

# Tail companion logs live
sudo journalctl -u sebuilderhc-companion -f

# Last 40 lines of companion logs
sudo journalctl -u sebuilderhc-companion -n 40 --no-pager
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| `❌ ERROR: build failed (dist not found)` | Review the `npm run build` output above the error; usually a TypeScript or missing-dependency issue. |
| Nginx returns `502` / blank page | `sudo nginx -t` then `sudo systemctl status nginx`. |
| Companion not responding on `/health` | `sudo journalctl -u sebuilderhc-companion -n 40 --no-pager` |
| `/api/connector/agent` returns `404` | Connector binary missing from repo — commit `ConnectorAgent/forcepoint-hc-connector.exe` to the SeBuilderHC2026 repo, then redeploy. |
| Old version still served after redeploy | Hard-refresh the browser (`Ctrl+F5`) — `index.html` is served fresh, but bundled assets are cache-busted by Vite. |
| `Permission denied` on `deploy.sh` | Ensure `chmod +x deploy.sh` ran before `sudo ./deploy.sh`. |