#!/bin/sh
# CI runs every recorded gate on pull requests, every workflow declares its permissions, and the
# default branch's current commit has passed CI.
set -eu
dir=.github/workflows
ls "$dir"/*.yml "$dir"/*.yaml >/dev/null 2>&1 || { echo "no GitHub Actions workflows in $dir" >&2; exit 1; }
missing_permissions=$(grep -L "^permissions:" "$dir"/*.yml "$dir"/*.yaml 2>/dev/null || true)
[ -z "$missing_permissions" ] || { echo "workflows without a top-level permissions: block: $missing_permissions" >&2; exit 1; }
grep -lq "pull_request" "$dir"/*.yml "$dir"/*.yaml 2>/dev/null || { echo "no workflow runs on pull_request" >&2; exit 1; }
node -e '
const g = JSON.parse(require("fs").readFileSync(".blueprint/gates.json", "utf8"));
for (const gate of g.gates) console.log(gate.name);
' | while IFS= read -r name; do
  grep -Eq "(yarn|npm run|pnpm( run)?|bun run) +$name([^a-zA-Z0-9:_-]|$)" "$dir"/*.yml "$dir"/*.yaml 2>/dev/null ||
    { echo "no workflow runs the \"$name\" gate" >&2; exit 1; }
done
default=$(sh "$(dirname "$0")/default-branch.sh")
git fetch --quiet origin "$default"
head=$(git rev-parse "origin/$default")
gh run list --commit "$head" --json status,conclusion,workflowName -q '.[] | "\(.status) \(.conclusion) \(.workflowName)"' > .blueprint/.ci-runs
[ -s .blueprint/.ci-runs ] || { rm -f .blueprint/.ci-runs; echo "no CI run for $default at $head" >&2; exit 1; }
bad=$(grep -v "^completed success " .blueprint/.ci-runs | grep -v "^completed skipped " || true)
rm -f .blueprint/.ci-runs
[ -z "$bad" ] || { echo "CI on $default ($head) is not green: $bad" >&2; exit 1; }
