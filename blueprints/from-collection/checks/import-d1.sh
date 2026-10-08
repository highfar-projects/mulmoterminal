#!/bin/sh
# The records the build copied are in D1, and the files they point at in R2 — read back through wrangler, not through
# the app. `local`: into a fresh local state, the migrations are applied and `yarn import-source --local` runs twice,
# then that state is read. `remote`: production is read with the person's wrangler login (the step itself did the
# import, after its approval). A build that copied only the shape has nothing to move.
set -eu
target="$1"
here="$(dirname "$0")"
source=.blueprint/source/source.json
[ -s "$source" ] || { echo "missing $source; the build was started without a collection" >&2; exit 1; }
if [ "$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).records === true))' "$source")" != true ]; then
  echo "only the shape was copied; there are no records to move"
  exit 0
fi
grep -q '"import-source"' package.json || { echo "package.json has no import-source script" >&2; exit 1; }
case "$target" in
  local)
    state=$(mktemp -d)
    trap 'rm -rf "$state"' EXIT INT TERM
    # The location every wrangler call below is pointed at, as the positional parameters so the path stays one word.
    set -- --local --persist-to "$state"
    yarn -s wrangler d1 migrations apply DB "$@" >/dev/null 2>&1 || { echo "the migrations do not apply to a fresh local D1" >&2; yarn -s wrangler d1 migrations apply DB "$@" >&2 || true; exit 1; }
    yarn -s import-source "$@" >/dev/null || { echo "yarn import-source $* failed" >&2; yarn -s import-source "$@" >&2 || true; exit 1; }
    # Twice: moving the records again must leave the same rows, not a second copy of each.
    yarn -s import-source "$@" >/dev/null || { echo "yarn import-source failed the second time over the same state" >&2; exit 1; }
    node --no-warnings "$here/d1-verify.mjs" "$@"
    yarn test >/dev/null || { echo "yarn test fails" >&2; yarn test >&2 || true; exit 1; }
    ;;
  remote)
    node --no-warnings "$here/d1-verify.mjs" --remote
    ;;
  *)
    echo "usage: import-d1.sh local|remote" >&2
    exit 2
    ;;
esac
