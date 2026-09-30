// The report tells the person what was set up and how chaff behaves from now on: it names chaff.yaml, the baseline,
// and the workflow when one was made.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));

const REPORT = ".blueprint/adopt-report.md";
const WITH_CI = "GitHub の PR に指摘を出すワークフローを作る";

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, [
  ["入れたもの", "What was set up"],
  ["棚に上げた指摘", "Shelved findings"],
  ["これから", "From now on"],
]);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
const ci = readJson(".blueprint/answers.json", "the interview answers").ci === WITH_CI;
const named = ["chaff.yaml", ".chaff-baseline.json", ...(ci ? [".github/workflows/chaff.yml"] : [])].filter((file) => !text.includes(file));
if (named.length > 0) fail(`${REPORT} does not name: ${named.join(", ")}`);
console.log("the report names what was set up");
