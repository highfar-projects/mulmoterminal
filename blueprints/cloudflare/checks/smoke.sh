#!/bin/sh
# Builds, starts the app with wrangler dev on a spare port, and checks that /api/health and / answer.
set -eu
. "$(dirname "$0")/serve.sh"
curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" | grep -q '"ok":true' || { echo '/api/health did not answer {"ok":true}' >&2; exit 1; }
curl -fsS --max-time 5 "http://127.0.0.1:$port/" | grep -q 'id="app"' || { echo "/ does not serve the app" >&2; exit 1; }
