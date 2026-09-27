#!/bin/sh
# The report says what became a machine rule, what went to the guide, and what was left out and why.
set -eu
report=.blueprint/style-report.md
[ -s "$report" ] || { echo "$report is missing or empty" >&2; exit 1; }
for section in "機械の決まり|Machine rules" "手引き|The guide" "規約にしなかったこと|Left out"; do
  grep -Eq "^#{2,3} ($section)" "$report" || { echo "$report lacks a section: $section" >&2; exit 1; }
done
