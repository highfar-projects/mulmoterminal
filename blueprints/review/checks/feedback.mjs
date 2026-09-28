// Drafts one report to chaff per case the review found (candidates.mjs): a structure result it dismissed, and
// a structure finding chaff did not report. Run from the folder by the report step; report.mjs checks the drafts.
import { readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
import { feedbackCases } from "./candidates.mjs";
const { readJson } = await import(fromBase("chaff.mjs"));
const { draftReports } = await import(fromBase("drafts.mjs"));

const record = readJson(".blueprint/findings.json", "the findings");
const cases = feedbackCases(
  { findings: Array.isArray(record?.findings) ? record.findings : [], dismissed: Array.isArray(record?.dismissed) ? record.dismissed : [] },
  (file) => readFileSync(file, "utf8"),
);
draftReports(cases);
