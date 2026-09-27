#!/bin/sh
# The CI survey is written down: which gaps there are (an empty list is an answer) and whether the
# default branch is green in CI. Nothing is changed in this step, so there is nothing else to check.
set -eu
[ -s .blueprint/ci.json ] || { echo "missing .blueprint/ci.json" >&2; exit 1; }
node -e '
const ci = JSON.parse(require("fs").readFileSync(".blueprint/ci.json", "utf8"));
const ok = Array.isArray(ci.gaps) && ci.gaps.every((gap) => typeof gap === "string" && gap.trim()) && typeof ci.defaultBranchGreen === "boolean";
if (!ok) { console.error(".blueprint/ci.json needs gaps (a list of strings) and defaultBranchGreen (true or false)"); process.exit(1); }
'
