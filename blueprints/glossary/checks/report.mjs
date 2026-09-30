// The report is the glossary the person keeps: every term is in its glossary section, every term defined more than
// once is named where the report says so, and the documents and the glossary are as the collect step checked them.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { definedTwice } from "./terms.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections, namedIn, sectionText } = await import(fromBase("markdown.mjs"));
const { documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));

const GLOSSARY = ".blueprint/glossary.json";
const CHECKED = ".blueprint/.glossary-checked";
const REPORT = ".blueprint/glossary-report.md";
const TABLE = ["用語集", "Glossary"];
const TWICE = ["二重定義", "Defined twice"];

const recorded = () => {
  try {
    return JSON.parse(readFileSync(CHECKED, "utf8"));
  } catch {
    return null;
  }
};
const checked = existsSync(CHECKED) ? recorded() : null;
if (checked === null || typeof checked !== "object") fail("the collect step's record is missing: run that step again");
const files = documentsNamed(readJson(".blueprint/answers.json", "the interview answers").documents);
if (JSON.stringify(checked.documents) !== JSON.stringify(files.map(fingerprint)))
  fail("a document changed since the collect step checked it: run that step again");
if (checked.glossary !== fingerprint(GLOSSARY)) fail(`${GLOSSARY} changed since the collect step checked it: run that step again`);
const glossary = readJson(GLOSSARY, "the glossary");

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const twice = definedTwice(glossary);
const missing = missingSections(text, [TABLE, ["確かめたこと", "What was checked"], ...(twice.length > 0 ? [TWICE] : [])]);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);

const table = sectionText(text, TABLE);
const absent = glossary.terms.map((entry) => entry.term).filter((term) => !namedIn(table, term));
if (absent.length > 0) fail(`${REPORT}: the glossary section does not name: ${absent.join(", ")}`);
const told = sectionText(text, TWICE);
const untold = twice.filter((term) => !namedIn(told, term));
if (untold.length > 0) fail(`${REPORT}: ${TWICE.join(" / ")} does not name: ${untold.join(", ")}`);
console.log("the report names every term, and every term defined more than once");
