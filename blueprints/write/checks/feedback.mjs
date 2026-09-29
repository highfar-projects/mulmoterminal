// Drafts one report to chaff per finding a part set aside because chaff misread it (dismissals.mjs).
// Run from the folder by the report step; report.mjs checks the drafts.
import { fromBase } from "./base.mjs";
const { readJson } = await import(fromBase("chaff.mjs"));
const { wrongCases } = await import(fromBase("dismissals.mjs"));
const { draftReports } = await import(fromBase("drafts.mjs"));

const outline = readJson(".blueprint/outline.json", "the outline");
const parts = Array.isArray(outline?.parts) ? outline.parts : [];
draftReports(wrongCases(parts.map((part) => ({ key: part.id, file: part.file, dismissed: part.dismissed }))));
