// The report is the comparison table the person keeps: every pair that is not unchanged is in it, the documents
// and the pairing are as the pair step checked them, and it says what was checked.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { mentions, sectionText } from "./articles.mjs";
import { readVersions } from "./versions.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));
const { fingerprint } = await import(fromBase("documents.mjs"));

const PAIRING = ".blueprint/comparison.json";
const CHECKED = ".blueprint/.comparison-checked";
const REPORT = ".blueprint/compare-report.md";
const TABLE = ["新旧対照表", "Comparison table"];
const SECTIONS = [TABLE, ["確かめたこと", "What was checked"]];

const versions = readVersions();
// What the pair step recorded; anything else (missing, not JSON) means that step has to run again.
const recorded = () => {
  try {
    return JSON.parse(readFileSync(CHECKED, "utf8"));
  } catch {
    return null;
  }
};
const checked = existsSync(CHECKED) ? recorded() : null;
if (checked === null || typeof checked !== "object") fail("the pair step's record is missing: run that step again");
if (checked?.old !== versions.old.print || checked?.new !== versions.new.print) fail("a version changed since the pair step checked it: run that step again");
if (checked.pairing !== fingerprint(PAIRING)) fail(`${PAIRING} changed since the pair step checked it: run that step again`);
const rows = readJson(PAIRING, "the pairing").rows;

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);

const table = sectionText(text, TABLE);

const labelOf = (articles, address) => articles.find((article) => article.address === address)?.label ?? address;
const absent = rows
  .filter((row) => row.change !== "same")
  .flatMap((row) => {
    const names = [...(row.old ? [labelOf(versions.old.articles, row.old)] : []), ...(row.new ? [labelOf(versions.new.articles, row.new)] : [])];
    return names.every((name) => mentions(table, name)) ? [] : [`${row.change} ${names.join(" → ")}`];
  });
if (absent.length > 0) fail(`${REPORT}: the table does not show: ${absent.join(", ")}`);
console.log("the report shows every article that changed, was added or was removed");
