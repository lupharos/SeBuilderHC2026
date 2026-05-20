# How to Set Up — Forcepoint HC 2026

This guide walks an operator through deploying the **Forcepoint Intelligence Platform — Health Check Wizard** on a fresh Ubuntu server. The `deploy.sh` script handles Node.js, Nginx, the build, and the SPA routing config end-to-end.

> **Requirements**
> - Ubuntu 20.04 / 22.04 / 24.04 with `sudo` access
> - Outbound internet to GitHub, npm, and the NodeSource repository
> - Port `80` open on the host

---

## 1. Update the system and install Git

```bash
sudo apt update -y
sudo apt install -y git
```

## 2. Clone the repository

```bash
git clone https://github.com/lupharos/SeBuilderHC2026.git
cd SeBuilderHC2026
```

## 3. Run the deployment script

```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

`deploy.sh` will:

1. Install `nginx`, `curl`, and Node.js 20 (only if not already present).
2. Clone or `git pull` the latest `main` into `/var/www/sebuilderhc/app`.
3. Run `npm install` and `npm run build`.
4. Copy the build output into `/var/www/sebuilderhc/dist`.
5. Write an Nginx site config with SPA fallback and reload Nginx.

When the script finishes you will see:

```
✅ DEPLOY COMPLETE!
👉 App running at: http://SERVER_IP
```

---

## 4. Verify

Open `http://<server-ip>/` in a browser. The wizard should load on the **HC Sessions** screen.

## 5. Re-deploying after updates

To pull the latest code and rebuild, just re-run the script:

```bash
sudo ./deploy.sh
```

The script detects the existing checkout and performs a `git pull` instead of re-cloning.

---

## update server
cd ~/SeBuilderHC2026 && git pull

## Output
----
student@ubuntu-2204:~/SeBuilderHC2026$ cd ~/SeBuilderHC2026 && git pull
Already up to date.
----

## Troubleshooting

| Symptom | Check |
|---|---|
| `❌ ERROR: build failed (dist not found)` | Review the `npm run build` output above the error; usually a TypeScript or missing-dep issue. |
| Nginx returns `502` / blank page | `sudo nginx -t` then `sudo systemctl status nginx`. |
| Old version still served after redeploy | Hard-refresh the browser (`Ctrl+F5`) — `index.html` is served fresh, but bundled assets are cache-busted by Vite. |
| `Permission denied` on `deploy.sh` | Ensure `chmod +x deploy.sh` ran successfully. |
