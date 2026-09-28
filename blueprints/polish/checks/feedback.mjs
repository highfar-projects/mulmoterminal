// Drafts one report to chaff per finding a polished file set aside because chaff misread it (dismissals.mjs).
// Run from the folder by the report step; report.mjs checks the drafts.
import { fromBase } from "./base.mjs";
const { readJson } = await import(fromBase("chaff.mjs"));
const { wrongCases } = await import(fromBase("dismissals.mjs"));
const { draftReports } = await import(fromBase("drafts.mjs"));

const targets = readJson(".blueprint/polish.json", "the polish list").targets ?? [];
draftReports(wrongCases(targets.map((target, index) => ({ key: String(index + 1), file: target.file, dismissed: target.dismissed }))));
