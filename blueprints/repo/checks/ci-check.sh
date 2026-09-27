#!/bin/sh
# CI runs every recorded gate on pull requests, every workflow declares its permissions, and the
# default branch's current commit has passed CI.
set -eu
dir=.github/workflows
find "$dir" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | sort > .blueprint/.workflows || true
cleanup() { rm -f .blueprint/.workflows .blueprint/.ci-runs; }
trap cleanup EXIT
[ -s .blueprint/.workflows ] || { echo "no GitHub Actions workflows in $dir" >&2; exit 1; }
missing=""
runs_on_pr=""
while IFS= read -r file; do
  grep -q "^permissions:" "$file" || missing="$missing $file"
  grep -q "pull_request" "$file" && runs_on_pr=yes
done < .blueprint/.workflows
[ -z "$missing" ] || { echo "workflows without a top-level permissions: block:$missing" >&2; exit 1; }
[ -n "$runs_on_pr" ] || { echo "no workflow runs on pull_request" >&2; exit 1; }
node -e '
const g = JSON.parse(require("fs").readFileSync(".blueprint/gates.json", "utf8"));
for (const gate of g.gates) console.log(gate.name);
' | while IFS= read -r name; do
  found=""
  while IFS= read -r file; do
    # Every package manager's spelling of "run this script": yarn lint, yarn run lint, npm run lint,
    # npm test, pnpm (run) lint, bun run lint.
    grep -Eq "(yarn|npm|pnpm|bun)( run)? +$name([^a-zA-Z0-9:_-]|$)" "$file" && found=yes
  done < .blueprint/.workflows
  [ -n "$found" ] || { echo "no workflow runs the \"$name\" gate" >&2; exit 1; }
done
default=$(sh "$(dirname "$0")/default-branch.sh")
git fetch --quiet origin "$default"
head=$(git rev-parse "origin/$default")
gh run list --commit "$head" --json status,conclusion,workflowName -q '.[] | "\(.status) \(.conclusion) \(.workflowName)"' > .blueprint/.ci-runs
[ -s .blueprint/.ci-runs ] || { echo "no CI run for $default at $head" >&2; exit 1; }
bad=$(grep -v "^completed success " .blueprint/.ci-runs | grep -v "^completed skipped " || true)
[ -z "$bad" ] || { echo "CI on $default ($head) is not green: $bad" >&2; exit 1; }
