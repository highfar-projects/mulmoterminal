#!/bin/sh
# Builds, starts the built server on a spare port with the default settings, and checks that
# /api/health and / answer — and that, left at its defaults, it listens on this computer only.
set -eu
. "$(dirname "$0")/serve.sh"
curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" | grep -q '"ok":true' || { echo '/api/health did not answer {"ok":true}' >&2; exit 1; }
curl -fsS --max-time 5 "http://127.0.0.1:$port/" | grep -q 'id="app"' || { echo "/ does not serve the app" >&2; exit 1; }
addresses=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR > 1 { print $9 }')
[ -n "$addresses" ] || { echo "could not see which address the server listens on (lsof found nothing for port $port)" >&2; exit 1; }
if printf '%s\n' "$addresses" | grep -qvE '^(127\.0\.0\.1|\[::1\]):'; then
  echo "left at its defaults the server must listen on this computer only (127.0.0.1), but it listens on: $addresses" >&2
  exit 1
fi
