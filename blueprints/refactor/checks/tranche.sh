#!/bin/sh
# A round is done when its target is finished (merged, or skipped with the reason written), the
# clone is back on a clean, up-to-date default branch, and every gate is still green there.
# Progress is recorded last, so a round that fails anything above is not counted.
set -eu
here=$(dirname "$0")
sh "$here/prs.sh"
sh "$BLUEPRINT_BASE/checks/repo-check.sh"
sh "$BLUEPRINT_BASE/checks/gates.sh"
node "$here/targets.mjs" progress
