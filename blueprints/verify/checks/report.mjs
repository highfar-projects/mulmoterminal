// Decides, by machine, what is wrong with the extracted facts, writes it to .blueprint/verification.json, and
// passes when the report names every problem. The report explains; it cannot add or drop a problem.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { shapeProblems } from "./facts.mjs";
import { problemsIn } from "./rules.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));
const { fingerprint } = await import(fromBase("documents.mjs"));

const FACTS = ".blueprint/facts.json";
const VERIFICATION = ".blueprint/verification.json";
const REPORT = ".blueprint/verify-report.md";
const SECTIONS = [
  ["見つけたこと", "Problems"],
  ["確かめたこと", "What was checked"],
  ["確かめきれなかったこと", "Not checked"],
];

const CHECKED = ".blueprint/.facts-checked";

// The extract step proved each value was read from the document; facts edited after that proof are not.
const checked = existsSync(CHECKED) ? readFileSync(CHECKED, "utf8") : "";
if (!existsSync(FACTS) || checked !== fingerprint(FACTS)) fail(`${FACTS} changed since the extract step checked it: run that step again`);
const facts = readJson(FACTS, "the extracted facts");
if (shapeProblems(facts).length > 0) fail(`${FACTS} is not well formed: run the extract step again`);
const problems = problemsIn(facts);
writeFileSync(VERIFICATION, JSON.stringify({ problems }, null, 2) + "\n");

if (!existsSync(REPORT)) fail(`${REPORT} is missing. The machine found ${problems.length} problem(s), listed in ${VERIFICATION}`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
// An id pasted into a code block names nothing to the reader, so only the prose counts.
// A fence closes only with its own character and at least its own length: ~~~ inside ``` is code.
const fenceOf = (line) => /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
const closes = (fence, opener) => fence !== undefined && fence[0] === opener[0] && fence.length >= opener.length;
const outsideCode = (state, line) => {
  const fence = fenceOf(line);
  if (state.opener !== undefined) return closes(fence, state.opener) ? { ...state, opener: undefined } : state;
  return fence !== undefined ? { ...state, opener: fence } : { ...state, lines: [...state.lines, line] };
};
// An HTML comment is invisible to the reader, so an id inside one names nothing either.
const prose = text
  .split("\n")
  .reduce(outsideCode, { opener: undefined, lines: [] })
  .lines.join("\n")
  .replace(/<!--[\s\S]*?-->/gu, "");
const unnamed = problems.filter((found) => !prose.includes(found.id)).map((found) => found.id);
if (unnamed.length > 0) fail(`${REPORT} does not name: ${unnamed.join(", ")} (see ${VERIFICATION})`);
console.log(`${problems.length} problem(s) found by machine, all named in the report`);
