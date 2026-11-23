#!/bin/sh
# Runs database migrations, then execs the requested command under a virtual
# framebuffer so the MapLibre Native renderer sidecar has a display.
set -eu
cd /app
node --import tsx apps/server/src/main.ts migrate
if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a -s "-screen 0 1024x768x24" "$@"
fi
exec "$@"
