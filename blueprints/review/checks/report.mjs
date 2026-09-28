// The report says what was found, what was checked, and what could not be — naming every finding.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { feedbackCases } from "./candidates.mjs";
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

// The cases chaff got wrong or missed are drafted as reports (feedback.mjs); the report hands them to the person.
const INDEX = ".blueprint/chaff-feedback/index.json";
const DRAFTS_SECTION = [["chaff への報告の下書き", "Drafts for chaff"]];
const record = readJson(".blueprint/findings.json", "the findings");
const cases = feedbackCases({ findings, dismissed: Array.isArray(record?.dismissed) ? record.dismissed : [] }, (file) => readFileSync(file, "utf8"));
if (cases.length > 0) {
  if (!existsSync(INDEX)) fail(`${cases.length} case(s) to report to chaff, but ${INDEX} is missing: run feedback.mjs`);
  const index = readJson(INDEX, "what feedback.mjs wrote");
  // Whole cases, not just ids: a missed case keeps its id when its quotation moves to another line.
  const listed = Array.isArray(index?.drafts) ? index.drafts.map(({ id, kind, file, rule, line }) => ({ id, kind, file, rule, line })) : [];
  if (JSON.stringify(listed) !== JSON.stringify(cases)) fail(`${INDEX} is out of date: run feedback.mjs again`);
  if (index.supported === true) {
    const absent = index.drafts.filter((entry) => typeof entry.draft !== "string" || !existsSync(entry.draft)).map((entry) => entry.id);
    if (absent.length > 0) fail(`drafts missing for: ${absent.join(", ")}: run feedback.mjs again`);
    if (missingSections(text, DRAFTS_SECTION).length > 0) fail(`${REPORT} lacks the section 「chaff への報告の下書き」 / "Drafts for chaff"`);
    const unlisted = index.drafts.filter((entry) => !text.includes(entry.draft)).map((entry) => entry.draft);
    if (unlisted.length > 0) fail(`${REPORT} does not name the drafts: ${unlisted.join(", ")}`);
  }
}
