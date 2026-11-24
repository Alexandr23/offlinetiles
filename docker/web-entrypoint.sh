#!/bin/sh
# Picks the HTTP or HTTPS nginx config depending on whether a Let's Encrypt
# certificate exists, then periodically reloads nginx so renewed certificates
# (written by the certbot container into the shared volume) are picked up
# without any host cron job. The same check runs on every reload, so the switch
# from HTTP to HTTPS also happens automatically after the first issuance.
set -eu

CERT_DIR="/etc/letsencrypt/live/offlinetiles.com"
RELOAD_INTERVAL="${NGINX_RELOAD_INTERVAL:-6h}"

select_config() {
  if [ -s "$CERT_DIR/fullchain.pem" ] && [ -s "$CERT_DIR/privkey.pem" ]; then
    src=/etc/nginx/sites/https.conf
  else
    src=/etc/nginx/sites/http.conf
  fi
  echo "[web-entrypoint] using $(basename "$src")"
  cmp -s "$src" /etc/nginx/conf.d/default.conf || cp "$src" /etc/nginx/conf.d/default.conf
}

select_config

(
  set +e
  while :; do
    sleep "$RELOAD_INTERVAL"
    select_config
    if nginx -t -q; then
      nginx -s reload
      echo "[web-entrypoint] nginx reloaded"
    else
      echo "[web-entrypoint] nginx config test failed, keeping the running config" >&2
    fi
  done
) &

exec nginx -g 'daemon off;'
