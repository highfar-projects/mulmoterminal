#!/bin/sh
# The README tells a non-engineer how to run the app on this computer, how to publish a change, and how to back up the
# data; the first page the finished build shows says where the published app is and what to try to see it works.
set -eu
[ -s README.md ] || { echo "missing README.md" >&2; exit 1; }
grep -q "yarn start" README.md || { echo "README.md does not say how to run it on this computer (yarn start)" >&2; exit 1; }
grep -q "wrangler deploy\|yarn deploy" README.md || { echo "README.md does not say how to publish a change (yarn deploy)" >&2; exit 1; }
grep -q "d1 export" README.md || { echo "README.md does not say how to back up the data (wrangler d1 export)" >&2; exit 1; }
start=.blueprint/start-here.md
[ -s "$start" ] || { echo "missing $start" >&2; exit 1; }
[ -s .blueprint/deploy-url ] || { echo "missing .blueprint/deploy-url" >&2; exit 1; }
url=$(tr -d ' \n\r' < .blueprint/deploy-url)
grep -qF "${url%/}" "$start" || { echo "$start does not name the published URL (${url%/})" >&2; exit 1; }
grep -q '^- \[ \] ' "$start" || { echo "$start has no checklist of what to try (- [ ] …)" >&2; exit 1; }
