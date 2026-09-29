#!/bin/sh
# The README tells a non-engineer how to start the app and how to back up its data, and the first page
# the finished build shows says how to start it, where to open it, and what to try to see it works.
set -eu
[ -s README.md ] || { echo "missing README.md" >&2; exit 1; }
grep -q "yarn start" README.md || { echo "README.md does not say how to start (yarn start)" >&2; exit 1; }
grep -q "data/app.db" README.md || { echo "README.md does not say where the data is (data/app.db)" >&2; exit 1; }
start=.blueprint/start-here.md
[ -s "$start" ] || { echo "missing $start" >&2; exit 1; }
grep -q "yarn start" "$start" || { echo "$start does not say how to start (yarn start)" >&2; exit 1; }
grep -q "http://localhost:" "$start" || { echo "$start does not say where to open it (http://localhost:…)" >&2; exit 1; }
grep -q '^- \[ \] ' "$start" || { echo "$start has no checklist of what to try (- [ ] …)" >&2; exit 1; }
