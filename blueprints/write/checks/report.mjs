// The report says what was written, what was checked, and what could not be — with every part's file
// named, so the person can find each one.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));

const REPORT = ".blueprint/write-report.md";
const SECTIONS = [
  ["書いたもの", "What was written"],
  ["確かめたこと", "What was checked"],
  ["確かめきれなかったこと", "Not checked"],
];

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
const outline = readJson(".blueprint/outline.json", "the outline");
const parts = Array.isArray(outline?.parts) ? outline.parts : [];
const unfinished = parts.filter((part) => part.status !== "done").map((part) => part.id);
if (unfinished.length > 0) fail(`parts not written: ${unfinished.join(", ")}`);
const unnamed = parts.filter((part) => !text.includes(part.file)).map((part) => part.file);
if (unnamed.length > 0) fail(`${REPORT} does not name: ${unnamed.join(", ")}`);
