// The glossary's two checks. `collect`: .blueprint/glossary.json gives every term the documents define, quotes
// every definition and spelling where it was found, and names the spelling to use for a term written more than one
// way; it writes the glossary as a person reads it at the gate and records what was checked. `apply`: when the
// person asked, the folder's chaff.yaml now carries the spellings and the jargon, keeps what it had, and chaff
// reports the spellings still in the documents; otherwise chaff.yaml is as it was.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { avoidedSpellings, citationsOf, definedTermsIn, definedTwice, glossaryProblems, jargonListed, jargonOf, writesOnItsOwn } from "./terms.mjs";
const { fail, findingsIn, quotationProblems, readJson, runChaff } = await import(fromBase("chaff.mjs"));
const { documentSource, documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));
const { treeOf } = await import(fromBase("places.mjs"));

const GLOSSARY = ".blueprint/glossary.json";
const READABLE = ".blueprint/glossary.txt";
const CHECKED = ".blueprint/.glossary-checked";
const CONFIG = "chaff.yaml";
const WRITE = "このフォルダの chaff.yaml に入れる";

const answers = readJson(".blueprint/answers.json", "the interview answers");
const files = documentsNamed(answers.documents);
const glossary = readJson(
  GLOSSARY,
  '{ "terms": [{ "term", "definitions": [{ "source", "address", "quote" }], "spellings": [{ "spelling", "citations" }], "preferred", "jargon" }] }',
);

const lineOf = (entry) => {
  const spellings = (entry.spellings ?? []).map((spelling) => spelling.spelling);
  const use = spellings.length > 1 ? `  (${spellings.join(" / ")} → ${entry.preferred})` : "";
  const defined = (entry.definitions ?? []).length > 1 ? `  [defined ${entry.definitions.length} times]` : "";
  return `- ${entry.term}${entry.jargon === true ? " *" : ""}${use}${defined}`;
};

const collect = () => {
  const defined = files.map((source) => {
    const tree = treeOf(source);
    if (tree === null) fail(`chaff could not read ${source}`);
    return { source, terms: definedTermsIn(tree) };
  });
  const problems = glossaryProblems(glossary, defined);
  if (problems.length > 0) fail(`${GLOSSARY}:\n  ${problems.join("\n  ")}`);
  const unquoted = quotationProblems("the glossary", citationsOf(glossary), documentSource(files));
  if (unquoted.length > 0) fail(unquoted.join("\n"));
  writeFileSync(READABLE, [...glossary.terms.map(lineOf), ""].join("\n"));
  const config = existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : null;
  writeFileSync(CHECKED, JSON.stringify({ documents: files.map(fingerprint), glossary: fingerprint(GLOSSARY), config }) + "\n");
  console.log(`${glossary.terms.length} term(s); ${definedTwice(glossary).length} defined more than once`);
};

const recorded = () => {
  try {
    return JSON.parse(readFileSync(CHECKED, "utf8"));
  } catch {
    return null;
  }
};

// A line of chaff.yaml that says something, as it was: what the team had must still be there.
const settingLines = (text) =>
  String(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("#"));

const stillWrites = (file, pair) => writesOnItsOwn(readFileSync(file, "utf8"), pair);

const appliedProblems = (before) => {
  if (!existsSync(CONFIG)) return [`${CONFIG} is missing, but the person asked for the spellings to go into it`];
  const now = readFileSync(CONFIG, "utf8");
  const lost = before === null ? [] : settingLines(before).filter((line) => !settingLines(now).includes(line));
  const run = runChaff(["rules", "--json"]);
  if (run.code !== 0) return [`chaff could not load ${CONFIG}:\n${run.stderr}`];
  const preferredTerm = JSON.parse(run.stdout).rules?.find((rule) => rule.id === "preferred-term");
  const avoided = avoidedSpellings(glossary);
  const unreported = avoided.flatMap((pair) =>
    files
      .filter((file) => stillWrites(file, pair))
      .filter((file) => !findingsIn(file).some((finding) => finding.rule === "preferred-term"))
      .map((file) => `${file} still writes 「${pair.avoided}」, but chaff does not report it`),
  );
  return [
    ...lost.map((line) => `${CONFIG} lost a line it had: ${line.trim()}`),
    ...(avoided.length > 0 && preferredTerm?.now?.level === "off" ? [`preferred-term is off in ${CONFIG}: name it under rules to turn it on`] : []),
    ...unreported,
    ...jargonOf(glossary)
      .filter((term) => !jargonListed(now).includes(term))
      .map((term) => `${CONFIG} does not list the jargon 「${term}」`),
  ];
};

const apply = () => {
  const checked = existsSync(CHECKED) ? recorded() : null;
  if (checked === null || typeof checked !== "object") fail("the collect step's record is missing: run that step again");
  if (checked.glossary !== fingerprint(GLOSSARY)) fail(`${GLOSSARY} changed since the collect step checked it: run that step again`);
  if (JSON.stringify(checked.documents) !== JSON.stringify(files.map(fingerprint)))
    fail("a document changed since the collect step checked it: run that step again");
  if (answers.write === WRITE) {
    const problems = appliedProblems(checked.config);
    if (problems.length > 0) fail(problems.join("\n"));
  } else if ((existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : null) !== checked.config) {
    fail(`${CONFIG} changed, but the person chose to keep the glossary under .blueprint only`);
  }
  console.log(answers.write === WRITE ? `${CONFIG} carries the glossary, and chaff reports what the documents still spell otherwise` : `${CONFIG} untouched`);
};

const mode = process.argv[2];
if (mode === "collect") collect();
else if (mode === "apply") apply();
else fail(`usage: glossary.mjs collect | apply (got ${JSON.stringify(mode)})`);
