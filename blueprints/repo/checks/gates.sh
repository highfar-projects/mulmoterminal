#!/bin/sh
# Every gate recorded in .blueprint/gates.json passes, each judged by its own exit code. The record
# is read, not trusted: an empty list, or a gate without a command, fails.
set -eu
[ -s .blueprint/gates.json ] || { echo "missing .blueprint/gates.json" >&2; exit 1; }
node -e '
const g = JSON.parse(require("fs").readFileSync(".blueprint/gates.json", "utf8"));
const ok = typeof g.install === "string" && Array.isArray(g.gates) && g.gates.length > 0 &&
  g.gates.every((gate) => typeof gate.name === "string" && typeof gate.command === "string" && gate.command.length > 0);
if (!ok) { console.error(".blueprint/gates.json needs install and a non-empty gates list of { name, command }"); process.exit(1); }
console.log(g.install);
for (const gate of g.gates) console.log(gate.command);
' > .blueprint/.gates-to-run
failed=""
while IFS= read -r command; do
  [ -n "$command" ] || continue
  if ! sh -c "$command" > .blueprint/.gate-output 2>&1; then
    failed="$failed
--- $command
$(tail -40 .blueprint/.gate-output)"
  fi
done < .blueprint/.gates-to-run
rm -f .blueprint/.gates-to-run .blueprint/.gate-output
[ -z "$failed" ] || { echo "gates failed:$failed" >&2; exit 1; }
