#!/bin/sh
# The spec exists and every template placeholder in it was filled or marked undecided.
set -eu
[ -s .blueprint/spec.md ] || { echo "missing .blueprint/spec.md" >&2; exit 1; }
if grep -n '{{' .blueprint/spec.md >&2; then
  echo "unfilled placeholders are left in .blueprint/spec.md" >&2
  exit 1
fi
# A usecase may hold its spec to more than the template: when it ships its own spec check, that runs too.
if [ -n "${BLUEPRINT_USECASE:-}" ] && [ -f "$BLUEPRINT_USECASE/checks/spec.sh" ]; then
  sh "$BLUEPRINT_USECASE/checks/spec.sh"
fi
