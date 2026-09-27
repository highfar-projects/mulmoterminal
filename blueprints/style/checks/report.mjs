// The report says what became a machine rule, what went to the guide, and what was left out and why —
// each section with something in it.
import { existsSync, readFileSync } from "node:fs";
import { fail } from "./chaff.mjs";
import { missingSections } from "./markdown.mjs";

const REPORT = ".blueprint/style-report.md";
const SECTIONS = [
  ["機械の決まり", "Machine rules"],
  ["手引き", "The guide"],
  ["規約にしなかったこと", "Left out"],
];

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const missing = missingSections(readFileSync(REPORT, "utf8"), SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
