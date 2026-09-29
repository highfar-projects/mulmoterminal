#!/bin/sh
# Starts the app on this computer and checks that its page renders, and that the build talks to the local Supabase stack
# and is allowed to: the page's Content-Security-Policy lets it connect there.
set -eu
here="$(dirname "$0")"
. "$here/serve.sh"
csp=$(curl -s -D - -o /dev/null --max-time 5 "http://127.0.0.1:$port/" | tr -d '\r' | grep -i '^content-security-policy:' || true)
[ -n "$csp" ] || { echo "/ is served without a Content-Security-Policy" >&2; exit 1; }
printf '%s' "$csp" | grep -qiF "$api" || { echo "the page's Content-Security-Policy does not let it connect to the local Supabase ($api): $csp" >&2; exit 1; }
grep -rqF "$api" dist || { echo "the build in dist/ does not talk to the local Supabase ($api); yarn build must use the settings yarn db:start writes" >&2; exit 1; }
sh "$here/page-renders.sh" "http://127.0.0.1:$port/"
