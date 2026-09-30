#!/bin/sh
# The area's own tests exist (test/<area>.test.ts), and, against a fresh local database, everything builds and passes.
set -eu
area="$1"
[ -f "test/$area.test.ts" ] || { echo "missing test/$area.test.ts" >&2; exit 1; }
. "$(dirname "$0")/local-stack.sh"
yarn build
yarn test
