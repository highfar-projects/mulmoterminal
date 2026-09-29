#!/bin/sh
# What the spec decided for the source's actions and ingests is done: each one to be built (`feature`) has a test that
# names it and the tests pass; each one left to a person (`manual`) has its steps in the README. A source with no
# actions or ingests has nothing to do.
set -eu
base="$1"
file=.blueprint/actions.json
# The record itself first: a build that got here without the spec check is held to it all the same.
node --no-warnings "$(dirname "$0")/decisions.mjs"
[ -s "$file" ] || { echo "no $file: the source has no actions or ingests to handle"; exit 0; }
# A key for a model call lives in .env; the folder becomes a repository whenever its person adds git, and .env must not go with it.
if [ -f .env ] && ! grep -qxE '/?\.env(\*)?' .gitignore 2>/dev/null; then
  echo ".env exists and .gitignore does not ignore it; add a line .env to .gitignore before anything secret goes in" >&2
  exit 1
fi
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
// A name counts only where it does its job: in the title of an it()/test() (with .only, .skip and the like allowed),
// or in a README heading. In a comment or a passing sentence it proves nothing.
const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inTestTitle = (name) => new RegExp(`\\b(?:it|test)(?:\\.\\w+)*\\(\\s*(["\x27\x60])[^"\x27\x60\\n]*${escaped(name)}`).test(testText);
const inHeading = (name) => new RegExp(`^#{1,6}\\s.*${escaped(name)}`, "m").test(readme);
const problems = entries.flatMap(({ name, decision }) => {
  if (decision === "feature" && !inTestTitle(name)) return [`${name} is to be built, and ${tests} has no test titled with it`];
  if (decision === "manual" && !inHeading(name)) return [`${name} is left to a person, and README.md has no heading naming it`];
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
