#!/bin/sh
# The security review's report exists, walks every OWASP Top 10:2025 category, and leaves no HIGH or
# MEDIUM finding open or merely accepted. A finding is one line: `- <HIGH|MEDIUM|LOW> <fixed|open|accepted>: …`.
set -eu
report=.blueprint/security-review.md
[ -s "$report" ] || { echo "missing $report" >&2; exit 1; }
for category in A01 A02 A03 A04 A05 A06 A07 A08 A09 A10; do
  grep -q "^#.*$category" "$report" || { echo "$report has no section for $category (OWASP Top 10:2025)" >&2; exit 1; }
done
open=$(grep -nE '^- (HIGH|MEDIUM) (open|accepted)' "$report" || true)
[ -z "$open" ] || { printf 'HIGH / MEDIUM findings must be fixed, but are open or accepted in %s:\n%s\n' "$report" "$open" >&2; exit 1; }
