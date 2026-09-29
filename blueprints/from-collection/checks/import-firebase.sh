#!/bin/sh
# The records the build copied are in Firestore, and the files they point at in Cloud Storage — read back over the REST
# APIs, not through the app. `emulator`: `yarn import-source --target emulator` runs twice inside the emulators, then the
# emulators are read. `prod`: production is read with the person's gcloud token (the step itself did the import, after
# its approval). A build that copied only the shape has nothing to move.
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
verify="node --no-warnings $here/firestore-verify.mjs"
case "$target" in
  emulator)
    . "$BLUEPRINT_BASE/checks/java21.sh"
    only="firestore"
    [ ! -d .blueprint/source/files ] || only="firestore,storage"
    # Twice: moving the records again must leave the same documents, not a second copy of each.
    firebase emulators:exec --project demo-blueprint --only "$only" \
      "yarn -s import-source --target emulator && yarn -s import-source --target emulator && $verify emulator"
    ;;
  prod)
    # Taken one at a time: a failure inside an assignment that prefixes a command would not stop `set -e`.
    prod=$(sh "$BLUEPRINT_BASE/checks/project-id.sh" prod)
    token=$(gcloud auth print-access-token)
    PROJECT_ID="$prod" ACCESS_TOKEN="$token" $verify prod
    ;;
  *)
    echo "usage: import-firebase.sh emulator|prod" >&2
    exit 2
    ;;
esac
