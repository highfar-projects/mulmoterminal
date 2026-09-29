#!/bin/sh
# What the spec decided for the source's actions and ingests is done: each one to be built (`feature`) has a test that
# names it and the tests pass; each one left to a person (`manual`) has its steps in the README. A source with no
# actions or ingests has nothing to do.
set -eu
base="$1"
file=.blueprint/actions.json
[ -s "$file" ] || { echo "no $file: the source has no actions or ingests to handle"; exit 0; }
case "$base" in
  local) tests="test/actions.test.ts" ;;
  firebase) tests="test/blueprint/actions.spec.ts" ;;
  *) echo "usage: actions.sh local|firebase" >&2; exit 2 ;;
esac
features=$(node -e '
const fs = require("node:fs");
const [file, tests] = process.argv.slice(1);
const entries = JSON.parse(fs.readFileSync(file, "utf8")).actions ?? [];
const read = (path) => (fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "");
const testText = read(tests);
const readme = read("README.md");
const problems = entries.flatMap(({ name, decision }) => {
  if (decision === "feature" && !testText.includes(name)) return [`${name} is to be built, and ${tests} has no test naming it`];
  if (decision === "manual" && !readme.includes(name)) return [`${name} is left to a person, and README.md does not say how (name it there)`];
  return [];
});
if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }
process.stdout.write(String(entries.filter((entry) => entry.decision === "feature").length));
' "$file" "$tests")
[ "$features" -gt 0 ] || exit 0
case "$base" in
  local) sh "$BLUEPRINT_BASE/checks/tests-pass.sh" actions ;;
  firebase) sh "$BLUEPRINT_BASE/checks/emulator-test.sh" actions ;;
esac
