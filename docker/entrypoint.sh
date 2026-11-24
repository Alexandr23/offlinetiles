#!/bin/sh
# Runs database migrations, then starts the requested command with a virtual
# framebuffer so the MapLibre Native renderer sidecar has a display.
#
# Xvfb is started directly instead of through xvfb-run: xvfb-run waits for a
# readiness handshake from Xvfb that never completed in the container, so the
# API and worker were never started. Here we wait for Xvfb's unix socket instead.
set -eu
cd /app
node --import tsx apps/server/src/main.ts migrate

if command -v Xvfb >/dev/null 2>&1 && [ -z "${DISPLAY:-}" ]; then
  export DISPLAY=:99
  Xvfb "$DISPLAY" -screen 0 1024x768x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
  i=0
  while [ ! -S "/tmp/.X11-unix/X99" ] && [ "$i" -lt 50 ]; do
    sleep 0.2
    i=$((i + 1))
  done
  if [ ! -S "/tmp/.X11-unix/X99" ]; then
    echo "[entrypoint] Xvfb did not start, see /tmp/xvfb.log; continuing without a display" >&2
  fi
fi

exec "$@"
