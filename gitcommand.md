# Git → Server update playbook

İki adımlı güncelleme: önce **lokal repo**'yu GitHub'a pushla, sonra **Ubuntu sunucusu**ndan pull edip deploy et.

---

## 1) Lokal makinede — repo'yu push'la

Bu dizinden (`Forcepoint HC 2026/`) Windows / Git Bash / WSL:

```bash
# Değişiklikleri gör
git status

# Değişen her şeyi sahnele (selective istersen `git add <file>` kullan)
git add -A

# Commit — kısa açıklayıcı mesaj
git commit -m "describe what changed here"

# main'e push
git push origin main
```

Eğer "your branch is ahead" görüyorsan sadece push yeter:

```bash
git push origin main
```

Yeni branch üzerinde çalışıyorsan:

```bash
git push -u origin <branch-name>
```

---

## 2) Ubuntu sunucusunda — pull + deploy + verify

SSH ile bağlan:

```bash
ssh student@<SERVER_IP>
```

Sonra **tek satır** ile tüm güncelleme:

```bash
cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh && bash statuscheck.sh
```

veya adım adım:

```bash
# 1) Bootstrap repo'yu güncelle (deploy.sh'ı en sondan çekmek için)
cd ~/SeBuilderHC2026
git pull

# 2) Deploy — idempotent, kendi içinde /var/www/sebuilderhc/app'ı da pull eder
sudo bash deploy.sh

# 3) Sağlık kontrolü
bash statuscheck.sh
```

`statuscheck.sh` tüm ✓ ile bitiyorsa hazır. ✗ veya ! varsa altındaki `↳` ipucu satırlarına bak.

---

## Hızlı kontrol komutları (deploy sonrası)

```bash
# Companion service durumu
sudo systemctl status sebuilderhc-companion --no-pager

# Canlı log (Ctrl+C ile çık)
sudo journalctl -u sebuilderhc-companion -f

# Health probe — loopback (companion direct)
curl http://127.0.0.1:3001/health

# Health probe — public path (nginx üzerinden)
curl http://localhost/health

# Connector status — token ile
curl "http://localhost/api/connector/status?token=<TOKEN>" | python3 -m json.tool
```

---

## Sorun çıkarsa

```bash
# Sadece companion'ı restart
sudo systemctl restart sebuilderhc-companion

# Sadece nginx'i reload (graceful, kesintisiz)
sudo systemctl reload nginx

# Companion son 50 log satırı
sudo journalctl -u sebuilderhc-companion -n 50 --no-pager

# nginx hata logu
sudo tail -n 50 /var/log/nginx/error.log

# nginx config syntax kontrol
sudo nginx -t
```

---

## Pratik akış özeti

| Adım | Lokasyon | Komut |
|---|---|---|
| 1 | Lokal | `git add -A && git commit -m "msg" && git push origin main` |
| 2 | Sunucu | `cd ~/SeBuilderHC2026 && git pull && sudo bash deploy.sh && bash statuscheck.sh` |
| 3 | Sunucu (gerekirse) | `sudo systemctl restart sebuilderhc-companion` |
| 4 | Tarayıcı | `Ctrl+Shift+R` ile hard refresh (cache busted ama emin olalım) |
