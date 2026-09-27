// The report says what was found, what was checked, and what could not be — naming every finding.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));

const REPORT = ".blueprint/review-report.md";
const SECTIONS = [
  ["見つけたこと", "Findings"],
  ["確かめたこと", "What was checked"],
  ["確かめきれなかったこと", "Not checked"],
];

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
const findings = readJson(".blueprint/findings.json", "the findings")?.findings;
if (!Array.isArray(findings)) fail('.blueprint/findings.json needs a "findings" array');
const unnamed = findings.filter((finding) => !text.includes(String(finding?.id))).map((finding) => finding?.id);
if (unnamed.length > 0) fail(`${REPORT} does not name: ${unnamed.join(", ")}`);
