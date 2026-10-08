#!/bin/sh
# The layout the later checks rely on exists, and the skeleton builds and its tests pass inside the Workers runtime.
set -eu
for f in package.json wrangler.jsonc src/worker/index.ts index.html vitest.config.ts; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done
for d in migrations test; do
  [ -d "$d" ] || { echo "missing $d/" >&2; exit 1; }
done
grep -q '"start"' package.json || { echo "package.json has no start script" >&2; exit 1; }
grep -q '"d1_databases"' wrangler.jsonc || { echo "wrangler.jsonc binds no D1 database" >&2; exit 1; }
grep -q '"assets"' wrangler.jsonc || { echo "wrangler.jsonc serves no assets" >&2; exit 1; }
yarn build
yarn test
