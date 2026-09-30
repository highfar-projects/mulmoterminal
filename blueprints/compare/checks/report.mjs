// The report is the comparison table the person keeps: every pair that is not unchanged is in it, the documents
// and the pairing are as the pair step checked them, and it says what was checked.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { mentions } from "./articles.mjs";
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
const checked = existsSync(CHECKED) ? JSON.parse(readFileSync(CHECKED, "utf8")) : null;
if (checked?.old !== versions.old.print || checked?.new !== versions.new.print) fail("a version changed since the pair step checked it: run that step again");
if (checked.pairing !== fingerprint(PAIRING)) fail(`${PAIRING} changed since the pair step checked it: run that step again`);
const rows = readJson(PAIRING, "the pairing").rows;

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);

// The table's part of the report: from its heading to the next.
const lines = text.split("\n");
const start = lines.findIndex((line) => line.startsWith("## ") && TABLE.some((name) => line.slice(3).trim().startsWith(name)));
const rest = lines.slice(start + 1);
const end = rest.findIndex((line) => /^#{1,2} /u.test(line));
const table = rest.slice(0, end < 0 ? rest.length : end).join("\n");

const labelOf = (articles, address) => articles.find((article) => article.address === address)?.label ?? address;
const absent = rows
  .filter((row) => row.change !== "same")
  .flatMap((row) => {
    const names = [...(row.old ? [labelOf(versions.old.articles, row.old)] : []), ...(row.new ? [labelOf(versions.new.articles, row.new)] : [])];
    return names.every((name) => mentions(table, name)) ? [] : [`${row.change} ${names.join(" → ")}`];
  });
if (absent.length > 0) fail(`${REPORT}: the table does not show: ${absent.join(", ")}`);
console.log("the report shows every article that changed, was added or was removed");
