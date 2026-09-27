#!/bin/sh
# The campaign ends with the record written and CI doing its job: every gate run on pull requests,
# and the default branch green.
set -eu
node "$(dirname "$0")/targets.mjs" report
sh "$BLUEPRINT_BASE/checks/ci-check.sh"
