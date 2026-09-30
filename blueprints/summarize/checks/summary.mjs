// The summarize step's check: every sentence of .blueprint/summary.json is backed by quotations that are in the
// documents, states no number its quotations do not, and between them the sentences cite every part of every
// document or leave it out with a reason. Writes the summary as a person reads it at the gate, and records what
// was checked so the report can tell nothing moved since.
import { writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { partsIn, summaryProblems } from "./parts.mjs";
const { fail, quotationProblems, readJson } = await import(fromBase("chaff.mjs"));
const { documentSource, documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));
const { placeNamesIn, treeOf } = await import(fromBase("places.mjs"));

const SUMMARY = ".blueprint/summary.json";
const READABLE = ".blueprint/summary.txt";
const CHECKED = ".blueprint/.summary-checked";
// The most sentences each length allows; the longest has no limit.
const LENGTHS = { "短く（5 文まで）": 5, "ふつう（10 文まで）": 10, "くわしく（部分ごとに）": null };

const answers = readJson(".blueprint/answers.json", "the interview answers");
const files = documentsNamed(answers.documents);
const documents = files.map((source) => {
  const tree = treeOf(source);
  if (tree === null) fail(`chaff could not read ${source}`);
  const parts = partsIn(tree);
  // With no parts, "nothing was dropped" could not be checked at all: refused rather than passed.
  if (parts.length === 0) fail(`${source} has no headings or articles chaff reads, so a summary of it cannot be shown to leave nothing out`);
  return { source, parts, names: placeNamesIn(tree) };
});
const nameOf = (source, address) => documents.find((document) => document.source === source)?.names.get(String(address));
const maxSentences = LENGTHS[answers.length] ?? null;

const summary = readJson(
  SUMMARY,
  '{ "sentences": [{ "text", "citations": [{ "source", "address", "quote" }] }], "omitted": [{ "source", "address", "why" }] }',
);
const problems = summaryProblems(summary, documents, maxSentences, nameOf);
if (problems.length > 0) fail(`${SUMMARY}:\n  ${problems.join("\n  ")}`);
const unquoted = summary.sentences.flatMap((sentence, index) => quotationProblems(`sentence ${index + 1}`, sentence.citations, documentSource(files)));
if (unquoted.length > 0) fail(unquoted.join("\n"));

const placeOf = (citation) => `${citation.source} ${nameOf(citation.source, citation.address) ?? citation.address}`;
const readable = [
  ...summary.sentences.map((sentence) => `${sentence.text}\n  (${[...new Set(sentence.citations.map(placeOf))].join(", ")})`),
  ...(summary.omitted ?? []).map((entry) => `[${entry.source} ${nameOf(entry.source, entry.address) ?? entry.address}] ${entry.why}`),
  "",
].join("\n");
writeFileSync(READABLE, readable);
writeFileSync(CHECKED, JSON.stringify({ documents: files.map(fingerprint), summary: fingerprint(SUMMARY) }) + "\n");
console.log(`${summary.sentences.length} sentence(s), every one quoted, every part accounted for`);
