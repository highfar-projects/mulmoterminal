#!/bin/sh
# The records the build copied are in Postgres, and the files they point at in Storage — read back through the Supabase
# CLI, not through the app. `local`: the local database is reset to the migrations and the seed, `yarn import-source
# --local` runs twice, then the stack is read. `linked`: production is read through the person's supabase login (the
# step itself did the import, after its approval). A build that copied only the shape has nothing to move.
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
    . "$BLUEPRINT_BASE/checks/local-stack.sh"
    seeded=$(mktemp)
    trap 'rm -f "$seeded"' EXIT INT TERM
    node --no-warnings "$here/supabase-verify.mjs" --local --save-seeded "$seeded"
    yarn -s import-source --local >/dev/null || { echo "yarn import-source --local failed" >&2; yarn -s import-source --local >&2 || true; exit 1; }
    # Twice: moving the records again must leave the same rows, not a second copy of each.
    yarn -s import-source --local >/dev/null || { echo "yarn import-source failed the second time over the same database" >&2; exit 1; }
    node --no-warnings "$here/supabase-verify.mjs" --local --seeded "$seeded"
    yarn test >/dev/null || { echo "yarn test fails" >&2; yarn test >&2 || true; exit 1; }
    ;;
  linked)
    node --no-warnings "$here/supabase-verify.mjs" --linked
    ;;
  *)
    echo "usage: import-supabase.sh local|linked" >&2
    exit 2
    ;;
esac
