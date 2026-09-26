#!/bin/sh
# The build works in a clean clone of a GitHub repository, on its up-to-date default branch, and
# never commits its own notes.
set -eu
top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not a git repository" >&2; exit 1; }
[ "$(cd "$top" && pwd -P)" = "$(pwd -P)" ] || { echo "the project folder must be the repository root ($top)" >&2; exit 1; }
git remote get-url origin 2>/dev/null | grep -q "github.com" || { echo "origin is not a GitHub repository" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not signed in (gh auth login)" >&2; exit 1; }
grep -qx ".blueprint/" .git/info/exclude 2>/dev/null || { echo ".blueprint/ is not in .git/info/exclude" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "the working tree has changes:" >&2; git status --short >&2; exit 1; }
default=$(sh "$(dirname "$0")/default-branch.sh")
[ "$(git branch --show-current)" = "$default" ] || { echo "not on the default branch $default" >&2; exit 1; }
git fetch --quiet origin "$default"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$default")" ] || { echo "$default is not the same as origin/$default" >&2; exit 1; }
