#!/bin/sh
# The first page the finished build shows says where the published app is and what to try to see it works.
set -eu
start=.blueprint/start-here.md
[ -s "$start" ] || { echo "missing $start" >&2; exit 1; }
prod=$(sh "$(dirname "$0")/project-id.sh" prod)
grep -q "https://$prod.web.app" "$start" || { echo "$start does not name the production URL (https://$prod.web.app)" >&2; exit 1; }
grep -q '^- \[ \] ' "$start" || { echo "$start has no checklist of what to try (- [ ] …)" >&2; exit 1; }
