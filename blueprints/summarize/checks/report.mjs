// The report is the summary the person keeps: every sentence the summarize step checked is in its summary section
// word for word, every part left out is named with its reason, and neither the documents nor the summary moved since.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections, namedIn, sectionText } = await import(fromBase("markdown.mjs"));
const { documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));
const { placeNamesOf } = await import(fromBase("places.mjs"));

const SUMMARY = ".blueprint/summary.json";
const CHECKED = ".blueprint/.summary-checked";
const REPORT = ".blueprint/summary-report.md";
const BODY = ["要約", "Summary"];
const LEFT_OUT = ["省いた部分", "Left out"];

// Spacing aside: the report may wrap a sentence the summary kept on one line.
const squash = (text) => String(text).replace(/\s+/gu, "");

const recorded = () => {
  try {
    return JSON.parse(readFileSync(CHECKED, "utf8"));
  } catch {
    return null;
  }
};
const checked = existsSync(CHECKED) ? recorded() : null;
if (checked === null || typeof checked !== "object") fail("the summarize step's record is missing: run that step again");
const files = documentsNamed(readJson(".blueprint/answers.json", "the interview answers").documents);
if (JSON.stringify(checked.documents) !== JSON.stringify(files.map(fingerprint)))
  fail("a document changed since the summarize step checked it: run that step again");
if (checked.summary !== fingerprint(SUMMARY)) fail(`${SUMMARY} changed since the summarize step checked it: run that step again`);
const summary = readJson(SUMMARY, "the summary");

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const omitted = Array.isArray(summary.omitted) ? summary.omitted : [];
const missing = missingSections(text, [BODY, ["出どころ", "Sources"], ...(omitted.length > 0 ? [LEFT_OUT] : [])]);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);

const body = squash(sectionText(text, BODY));
const dropped = summary.sentences.map((sentence, index) => [index + 1, sentence.text]).filter(([, sentence]) => !body.includes(squash(sentence)));
if (dropped.length > 0) fail(`${REPORT}: the summary section does not carry, word for word, sentence ${dropped.map(([number]) => number).join(", ")}`);

const leftOut = sectionText(text, LEFT_OUT);
// A heading's place name comes quoted (「申請のしかた」, "Getting started"); the report may quote it either way.
const unquoted = (name) => String(name).replace(/^[「"“](.*)[」"”]$/u, "$1");
const names = new Map(files.map((file) => [file, placeNamesOf(file)]));
const unnamed = omitted.map((entry) => unquoted(names.get(entry.source)?.get(entry.address) ?? entry.address)).filter((name) => !namedIn(leftOut, name));
if (unnamed.length > 0) fail(`${REPORT}: the part left out is not named under ${LEFT_OUT.join(" / ")}: ${unnamed.join(", ")}`);
console.log("the report carries the whole summary and names every part left out");
