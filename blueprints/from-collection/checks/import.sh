#!/bin/sh
# The records the build copied are in the app: `yarn import-source` is run twice into a fresh database, and the
# database is then held against the source by reading it directly — the import's own word is not taken. A build that
# copied only the shape has nothing to move.
set -eu
source=.blueprint/source/source.json
[ -s "$source" ] || { echo "missing $source; the build was started without a collection" >&2; exit 1; }
if [ "$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).records === true))' "$source")" != true ]; then
  echo "only the shape was copied; there are no records to move"
  exit 0
fi
grep -q '"import-source"' package.json || { echo "package.json has no import-source script" >&2; exit 1; }
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
db="$work/app.db"
yarn -s import-source "$db" >/dev/null || { echo "yarn import-source failed" >&2; yarn -s import-source "$db" >&2 || true; exit 1; }
# Twice: moving the records again must leave the same rows, not a second copy of each.
yarn -s import-source "$db" >/dev/null || { echo "yarn import-source failed the second time over the same database" >&2; exit 1; }
node --no-warnings "$(dirname "$0")/import-verify.mjs" "$db"
yarn test >/dev/null || { echo "yarn test fails" >&2; yarn test >&2 || true; exit 1; }
