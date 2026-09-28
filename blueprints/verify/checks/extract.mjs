// Reads .blueprint/facts.json — the dates, times and amounts the AI took from the documents — and passes when
// every entry is well formed, every value is written in its own quotation, and every quotation is in its
// document (chaff cite). What the facts mean is decided later, by machine, in report.mjs.
import { writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { shapeProblems, unquotedValues } from "./facts.mjs";
const { fail, quotationProblems, readJson } = await import(fromBase("chaff.mjs"));
const { documentSource, documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));

const FACTS = ".blueprint/facts.json";
const SHAPE = '{ "events": [...], "amounts": [...], "totals": [...] }';

const answers = readJson(".blueprint/answers.json", "the interview answers");
const documents = documentsNamed(answers?.documents);
const facts = readJson(FACTS, SHAPE);

const malformed = shapeProblems(facts);
if (malformed.length > 0) fail(`${FACTS}:\n${malformed.map((line) => "  " + line).join("\n")}`);

const entries = ["events", "amounts", "totals"].flatMap((key) => (facts[key] ?? []).map((entry) => ({ key, entry })));
if (entries.length === 0)
  fail(`${FACTS} holds no events, amounts or totals: extract what the documents say, or say in the report that there was nothing to check`);

const unquoted = entries.flatMap(({ key, entry }) => unquotedValues(key, entry).map((value) => `  ${entry.id}: ${value} is not in its quotation`));
if (unquoted.length > 0) fail(`values that were not read from the quoted text:\n${unquoted.join("\n")}`);

const missing = quotationProblems(
  "facts",
  entries.map(({ entry }) => entry.citation),
  documentSource(documents),
);
if (missing.length > 0) fail(missing.join("\n"));

writeFileSync(".blueprint/.facts-checked", fingerprint(FACTS));
console.log(`${entries.length} fact(s), each written in its quotation, and every quotation found in the documents`);
