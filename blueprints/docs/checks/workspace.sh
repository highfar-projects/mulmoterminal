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
# locally (.git/info/exclude), which changes nothing in the repository itself. Ask git, not the folder:
# in a worktree .git is a file, and an already-tracked .blueprint/ shows no change to notice.
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  if [ -n "$(git ls-files -- .blueprint)" ]; then
    echo ".blueprint/ is tracked by git: remove it from the index (git rm -r --cached .blueprint) and exclude it" >&2
    exit 1
  fi
  git check-ignore -q .blueprint/ || {
    echo "this folder is in a git repository and .blueprint/ would be committed: add .blueprint/ to .git/info/exclude" >&2
    exit 1
  }
fi
