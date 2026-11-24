# Deploying to offlinetiles.com with HTTPS

The stack runs on one server with Docker Compose. nginx (the `web` container) terminates TLS with
a free Let's Encrypt certificate. The `certbot` container renews that certificate, and nginx reloads
itself to pick it up. **No host cron job is involved.**

```
Internet ──▶ web (nginx)  :80  → ACME challenge files + redirect to https://offlinetiles.com
                          :443 → static app + /api proxy ──▶ server:3000 ──▶ postgres
                                                              worker ──▶ tile-generator
certbot ── every 12h: `certbot renew` (no-op until the certificate is due)
web     ── every 6h:  re-check certificate, `nginx -s reload`
            shared volumes: certbot-www (challenge files), certbot-etc (certificates)
```

## Why "HTTP first, then HTTPS"

Let's Encrypt proves you control the domain by fetching
`http://offlinetiles.com/.well-known/acme-challenge/<token>` over plain HTTP. nginx can't start with
the HTTPS config before a certificate exists (the files it points to are missing), so the first
start has to be HTTP-only.

You don't need to rebuild or redeploy to switch. `docker/web-entrypoint.sh` checks for
`/etc/letsencrypt/live/offlinetiles.com/fullchain.pem`:

- no certificate: it uses `docker/nginx.conf` (HTTP, serves the challenge files);
- certificate present: it uses `docker/nginx-https.conf` (port 80 redirects, port 443 serves the app).

The check runs at container start and before every 6-hourly reload. So after the first certificate is
issued, `docker compose restart web` switches to HTTPS immediately; without a restart it would
switch on its own within 6 hours.

## Why renewal kept failing in voice-assistant-langchain

I couldn't see that server's logs, but its setup has these defects. The first one is the most likely cause:

1. **nginx was never reloaded after a renewal.** The certbot container did renew the files on disk,
   but nginx keeps serving the certificate it loaded at startup until it is reloaded. The reload
   depended on a host cron job, and that cron job fails silently:
   - output went to `> /dev/null 2>&1`, so errors were never visible;
   - the guide's line used the placeholder `cd /path/to/voice-assistant-langchain`;
   - cron runs with `PATH=/usr/bin:/bin`, so `docker` isn't found if it was installed via snap
     (`/snap/bin/docker`) or another non-default location;
   - a crontab of a user who isn't in the `docker` group gets "permission denied".

   **Symptom:** the browser shows an expired certificate, but `certbot certificates` shows a valid one.
2. **No `restart:` policy.** After a server reboot or a crash, the certbot loop wasn't running, so
   nothing was renewed at all.
3. **Let's Encrypt stopped sending expiry reminder emails in June 2025**, so nobody was warned.
4. Running `certbot renew` from cron while the certbot container also renews can fail with
   "Another instance of Certbot is already running".
5. `ssl_stapling on` is obsolete: Let's Encrypt shut down OCSP in 2025. This only produces warnings
   and doesn't break renewal.

To confirm on the old server, compare the served certificate with the one on disk:

```bash
cd ~/voice-assistant-langchain     # wherever it is deployed
echo | openssl s_client -connect alexandr-nikiforov.com:443 -servername alexandr-nikiforov.com 2>/dev/null \
  | openssl x509 -noout -enddate                                          # what browsers get
docker compose run --rm --entrypoint certbot certbot certificates          # what is on disk
docker compose logs --tail 100 certbot                                     # renewal attempts
docker ps -a --filter name=certbot                                         # is the loop running?
grep CRON /var/log/syslog | tail                                           # did cron run at all?
```

If the disk date is later than the served date, it's cause 1, and running
`docker compose exec frontend nginx -s reload` fixes it immediately.

**What this project does instead:**

- nginx reloads itself every 6 hours inside the `web` container. A reload is graceful (no dropped
  connections), so no cron, PATH or permissions issues are possible.
- Every service has `restart: unless-stopped`, so the stack, including the renewal loop, comes back
  after reboots.
- Step 6 below runs a real renewal against Let's Encrypt's staging server (`renew --dry-run`), so
  you know renewal works on day 1 instead of finding out on day 60.
- OCSP stapling is removed.

---

## Step-by-step

All commands run on the server, in the project directory (e.g. `/opt/map-exporter`).

### 0. Prerequisites

- A Linux VPS with Docker Engine and the Compose plugin (`docker compose version` works).
- **Ports 80 and 443 are free on the server.** If voice-assistant-langchain runs on the same
  server, its `frontend` container already holds 80/443. Two nginx containers can't share them, so you'd
  need one shared reverse proxy in front of both projects.
- DNS at your registrar:
  - `A    offlinetiles.com      → <server IPv4>`
  - `A    www.offlinetiles.com  → <server IPv4>`
  - **No `AAAA` records** unless they point to this server's real IPv6 address. Let's Encrypt prefers
    IPv6, and a stale/parking `AAAA` record is a classic cause of failed validation.

  Check from your laptop:

  ```bash
  dig +short A offlinetiles.com; dig +short A www.offlinetiles.com; dig +short AAAA offlinetiles.com
  ```
- Firewall: allow 22, 80, 443. Postgres (5432) and the API (3000) are bound to `127.0.0.1`
  in `docker-compose.yml`, so they aren't reachable from the internet even though Docker bypasses `ufw`.

  ```bash
  sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
  ```

### 1. Get the code and configure `.env`

```bash
git clone <repo-url> /opt/map-exporter && cd /opt/map-exporter
cp .env.example .env
```

Edit `.env` and set:

```bash
PUBLIC_URL=https://offlinetiles.com
POSTGRES_PASSWORD=<openssl rand -hex 24>     # letters/digits only; set BEFORE the first start
ADMIN_LOGIN=admin
ADMIN_PASSWORD="<a new strong password>"       # quote it if it contains '#'; avoid '$'
COMPOSE_PROFILES=full                          # so plain `docker compose ...` includes all services
```

The rest of `.env` is for local `pnpm dev` and is ignored by the containers.

### 2. Put the map data in place

The containers read `./data` (bind-mounted at `/data`). It needs at least `data/master/` and
`data/assets/fonts/`. Either run `pnpm init-map ...` on the server, or copy them from your machine:

```bash
# from your laptop
rsync -avP data/master data/assets user@server:/opt/map-exporter/data/
```

### 3. Deploy over HTTP

```bash
docker compose up -d --build
docker compose ps                       # postgres, server, worker, web, certbot: all "Up"
docker compose logs web | grep web-entrypoint
# [web-entrypoint] using http.conf
```

Check that the ACME challenge path is reachable from the internet:

```bash
docker compose run --rm --entrypoint sh certbot -c \
  'mkdir -p /var/www/certbot/.well-known/acme-challenge && echo ok > /var/www/certbot/.well-known/acme-challenge/test'

curl http://offlinetiles.com/.well-known/acme-challenge/test        # → ok
curl http://www.offlinetiles.com/.well-known/acme-challenge/test    # → ok
```

> **Always use `--entrypoint certbot` (or `--entrypoint sh`) for one-off certbot commands.** The
> `certbot` service's entrypoint is the renewal loop. Without the override, your arguments are
> ignored and you only see "No renewals were attempted".

### 4. Issue the certificate

First a dry run against the staging server. It doesn't count towards rate limits and saves nothing:

```bash
docker compose run --rm --entrypoint certbot certbot certonly --dry-run \
  --webroot -w /var/www/certbot \
  -d offlinetiles.com -d www.offlinetiles.com \
  --email nikiforovalex.tusur@gmail.com --agree-tos --no-eff-email
# → The dry run was successful.
```

Then the real one (same command without `--dry-run`):

```bash
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d offlinetiles.com -d www.offlinetiles.com \
  --email nikiforovalex.tusur@gmail.com --agree-tos --no-eff-email
# → Successfully received certificate.
#   Certificate is saved at: /etc/letsencrypt/live/offlinetiles.com/fullchain.pem
```

The `--webroot -w /var/www/certbot` choice is stored in
`/etc/letsencrypt/renewal/offlinetiles.com.conf`, and every later `certbot renew` reuses it.

### 5. Switch to HTTPS

```bash
docker compose restart web
docker compose logs web | grep web-entrypoint
# [web-entrypoint] using https.conf

curl -I https://offlinetiles.com             # HTTP/2 200
curl -I http://offlinetiles.com              # 301 → https://offlinetiles.com/
curl -I https://www.offlinetiles.com         # 301 → https://offlinetiles.com/
curl -s https://offlinetiles.com/api/tiles.json | grep -o '"https://[^"]*' | head -1   # https tile URLs
```

### 6. Prove that renewal works (do not skip)

This runs the full renewal flow against the staging server, using the same stored settings and the
same challenge path the background loop uses:

```bash
docker compose run --rm --entrypoint certbot certbot renew --dry-run
# → Congratulations, all simulated renewals succeeded:
#     /etc/letsencrypt/live/offlinetiles.com/fullchain.pem (success)
```

Check that both background loops are running:

```bash
docker compose logs certbot     # "[certbot] ... renewal check" + "Certificate not yet due for renewal"
docker compose ps certbot web   # both "Up"
```

**Don't add a cron job for this project.** The `certbot` container renews, and the `web` container
reloads nginx every 6 hours.

---

## Day-to-day operations

**Deploy a new version.** Certificates live in the `map-exporter_certbot-etc` volume and survive rebuilds:

```bash
git pull && docker compose up -d --build
```

Never run `docker compose down -v`: `-v` deletes the certificate and database volumes.

**Check expiry, served vs. on disk.** The two dates should match. After a renewal they can differ
for at most 6 hours.

```bash
echo | openssl s_client -connect offlinetiles.com:443 -servername offlinetiles.com 2>/dev/null \
  | openssl x509 -noout -enddate
docker compose run --rm --entrypoint certbot certbot certificates
```

**Renew or reload right now** (normally not needed):

```bash
docker compose run --rm --entrypoint certbot certbot renew --webroot -w /var/www/certbot
docker compose exec web nginx -s reload
```

**Alerting.** Let's Encrypt no longer emails before expiry, so add the site to an uptime
monitor with SSL-expiry alerts (UptimeRobot, Better Stack, etc.). It will warn you if anything breaks.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `No renewals were attempted` after `certonly` | Missing `--entrypoint certbot` (see step 3). |
| `Timeout during connect` / `Connection refused` | Port 80 blocked (cloud firewall/security group, `ufw`) or `web` not running. Check `curl http://offlinetiles.com/.well-known/acme-challenge/test` from outside. |
| `Invalid response ... 404` | DNS points elsewhere, or an `AAAA` record points to a different machine. Check `dig`. |
| `too many certificates already issued` | Rate limit (5 identical certs/week). Use `--dry-run` until it passes, then wait. |
| `Another instance of Certbot is already running` | A second certbot is running at the same time (e.g. an old cron). Remove it, retry. |
| Browser shows an expired cert but `certbot certificates` is fine | nginx hasn't reloaded yet. Run `docker compose exec web nginx -s reload` and check `docker compose logs web` for `nginx reloaded`. |
| `web` keeps restarting after enabling HTTPS | `docker compose logs web` shows the nginx error (usually a missing/unreadable certificate file). |
| Map tiles blocked as "mixed content" | `/api/tiles.json` returned `http://` URLs. `X-Forwarded-Proto` must reach the API (set in `docker/nginx-app.conf`). |

## Files

| File | Purpose |
| --- | --- |
| `docker-compose.yml` | `web` on 80/443, `certbot` renewal loop, shared `certbot-www` / `certbot-etc` volumes, restart policies |
| `docker/web.Dockerfile` | Builds the app; installs both nginx configs and the entrypoint |
| `docker/web-entrypoint.sh` | Chooses HTTP/HTTPS config; reloads nginx every 6h (`NGINX_RELOAD_INTERVAL`) |
| `docker/nginx.conf` | HTTP-only server (local use and first deploy) |
| `docker/nginx-https.conf` | Port 80 → challenge + redirect; 443 → app; `www` → apex |
| `docker/nginx-app.conf` | Shared app locations (static files, `/api` proxy with SSE settings) |
| `docker/ssl-params.conf` | TLS 1.2/1.3 (Mozilla intermediate), HSTS, security headers |
| `.dockerignore` | Keeps `data/` (100+ GB), `node_modules`, `rust/target` out of the build context |
