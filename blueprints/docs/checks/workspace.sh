#!/bin/sh
# The folder holds .blueprint/ for the build's records, chaff runs here, and the configuration it reads
# (if any) loads without an error.
set -eu
[ -d .blueprint ] || { echo "no .blueprint/ folder here" >&2; exit 1; }
chaff="$(dirname "$0")/chaff.sh"
sh "$chaff" rules --json > .blueprint/.chaff-rules.json 2> .blueprint/.chaff-rules.err || {
  echo "chaff did not run here:" >&2
  cat .blueprint/.chaff-rules.err >&2
  rm -f .blueprint/.chaff-rules.json .blueprint/.chaff-rules.err
  exit 1
}
rm -f .blueprint/.chaff-rules.json .blueprint/.chaff-rules.err
# In a git repository the build's records must not be committed with the documents. They are excluded
# locally (.git/info/exclude), which changes nothing in the repository itself.
if [ -d .git ] && [ -n "$(git status --porcelain --untracked-files=all -- .blueprint 2>/dev/null)" ]; then
  echo "this folder is a git repository and .blueprint/ would be committed: add .blueprint/ to .git/info/exclude" >&2
  exit 1
fi
