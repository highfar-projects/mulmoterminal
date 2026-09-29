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
# The titles of the tests the file really declares — parsed, so a name in a comment or a string is not a test. Only read
# when something is to be built.
wanted=$(node -e 'process.stdout.write(String((JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).actions ?? []).filter((entry) => entry.decision === "feature").length))' "$file")
titles="[]"
[ "$wanted" -eq 0 ] || titles=$(node --no-warnings "$(dirname "$0")/test-titles.mjs" "$tests")
features=$(node -e '
const fs = require("node:fs");
const [file, tests, titlesJson] = process.argv.slice(1);
const entries = JSON.parse(fs.readFileSync(file, "utf8")).actions ?? [];
const titles = JSON.parse(titlesJson);
const readme = fs.existsSync("README.md") ? fs.readFileSync("README.md", "utf8") : "";
// A name counts only where it does its job: in the title of a test the file declares, or in a README heading.
const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const inTestTitle = (name) => titles.some((title) => title.includes(name));
const inHeading = (name) => new RegExp(`^#{1,6}\\s.*${escaped(name)}`, "m").test(readme);
const problems = entries.flatMap(({ name, decision }) => {
  if (decision === "feature" && !inTestTitle(name)) return [`${name} is to be built, and ${tests} has no test titled with it`];
  if (decision === "manual" && !inHeading(name)) return [`${name} is left to a person, and README.md has no heading naming it`];
  return [];
});
if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); }
process.stdout.write(String(entries.filter((entry) => entry.decision === "feature").length));
' "$file" "$tests" "$titles")
[ "$features" -gt 0 ] || exit 0
case "$base" in
  local) sh "$BLUEPRINT_BASE/checks/tests-pass.sh" actions ;;
  firebase) sh "$BLUEPRINT_BASE/checks/emulator-test.sh" actions ;;
esac
