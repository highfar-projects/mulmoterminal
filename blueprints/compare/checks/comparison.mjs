// The pair step's check: .blueprint/comparison.json pairs every article of the old version with its article in the
// new one, and says truly whether each changed. Writes the pairing as a person reads it at the gate, and records
// what was checked so the report can tell the documents and the pairing were not touched since.
import { writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { comparisonProblems } from "./articles.mjs";
import { comparisonText } from "./comparisonView.mjs";
import { readVersions } from "./versions.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { fingerprint } = await import(fromBase("documents.mjs"));

const PAIRING = ".blueprint/comparison.json";
const READABLE = ".blueprint/comparison.txt";
const CHECKED = ".blueprint/.comparison-checked";

const versions = readVersions();
const rows = readJson(PAIRING, '{ "rows": [{ "old", "new", "change", "what" }] }')?.rows;
const problems = comparisonProblems(rows, versions.old.articles, versions.new.articles);
if (problems.length > 0) fail(`${PAIRING}:\n  ${problems.join("\n  ")}`);
writeFileSync(READABLE, comparisonText(rows, versions.old.articles, versions.new.articles));
writeFileSync(CHECKED, JSON.stringify({ old: versions.old.print, new: versions.new.print, pairing: fingerprint(PAIRING) }) + "\n");
console.log(`${rows.length} pair(s): every article accounted for`);
