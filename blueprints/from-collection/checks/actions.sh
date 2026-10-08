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
# A key for a model call lives in .env (.dev.vars on a Worker, supabase/functions/.env for Supabase's functions); the
# folder becomes a repository whenever its person adds git, and none of them must go with it. A line naming the file
# alone (.env) ignores it at any depth, as git reads it.
for secrets in .env .dev.vars supabase/functions/.env; do
  escape() { printf '%s' "$1" | sed 's/\./\\./g'; }
  pattern="/?$(escape "$secrets")(\*)?|$(escape "$(basename "$secrets")")(\*)?"
  if [ -f "$secrets" ] && ! grep -qxE "$pattern" .gitignore 2>/dev/null; then
    echo "$secrets exists and .gitignore does not ignore it; add a line $secrets to .gitignore before anything secret goes in" >&2
    exit 1
  fi
done
case "$base" in
  local|cloudflare|supabase) tests="test/actions.test.ts" ;;
  firebase) tests="test/blueprint/actions.spec.ts" ;;
  *) echo "usage: actions.sh local|firebase|cloudflare|supabase" >&2; exit 2 ;;
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
// Said with the titles it read and the rule it reads them by, so the one fixing it sees what is missing rather than guessing.
const untested = entries.some(({ name, decision }) => decision === "feature" && !inTestTitle(name));
const hint = untested
  ? [
      "",
      `The test titles ${tests} declares, as this check reads them: ${titles.length === 0 ? "(none)" : titles.map((title) => JSON.stringify(title)).join(", ")}.`,
      "Only the title of a test counts: the first argument, written as a plain string, of it(...) or test(...) imported from \"vitest\" in that file. A describe(...) name does not count, so put the whole name in each test title.",
    ]
  : [];
if (problems.length > 0) { console.error([...problems, ...hint].join("\n")); process.exit(1); }
process.stdout.write(String(entries.filter((entry) => entry.decision === "feature").length));
' "$file" "$tests" "$titles")
[ "$features" -gt 0 ] || exit 0
case "$base" in
  local|cloudflare|supabase) sh "$BLUEPRINT_BASE/checks/tests-pass.sh" actions ;;
  firebase) sh "$BLUEPRINT_BASE/checks/emulator-test.sh" actions ;;
esac
