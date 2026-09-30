#!/bin/sh
# The layout the later checks rely on exists, the local Supabase stack starts, and the skeleton builds and its tests pass.
set -eu
for f in package.json supabase/config.toml wrangler.jsonc index.html vite.config.ts src/client/main.ts; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done
[ -d test ] || { echo "missing test/" >&2; exit 1; }
for script in db:start build start test deploy; do
  grep -q "\"$script\"" package.json || { echo "package.json has no $script script" >&2; exit 1; }
done
grep -q '"assets"' wrangler.jsonc || { echo "wrangler.jsonc serves no assets" >&2; exit 1; }
. "$(dirname "$0")/local-stack.sh"
yarn build
yarn test
