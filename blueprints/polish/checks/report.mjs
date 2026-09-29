// The report says what was polished, what was checked, and what was left as it was — naming every file.
import { existsSync, readFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, readJson } = await import(fromBase("chaff.mjs"));
const { missingSections } = await import(fromBase("markdown.mjs"));
const { unreportedDismissals, wrongCases } = await import(fromBase("dismissals.mjs"));
const { draftsProblems } = await import(fromBase("drafts.mjs"));

const REPORT = ".blueprint/polish-report.md";
const SECTIONS = [
  ["整えたもの", "What was polished"],
  ["確かめたこと", "What was checked"],
  ["直さずに残したもの", "Left as it was"],
];

if (!existsSync(REPORT)) fail(`${REPORT} is missing`);
const text = readFileSync(REPORT, "utf8");
const missing = missingSections(text, SECTIONS);
if (missing.length > 0) fail(`${REPORT} lacks sections: ${missing.join(", ")}`);
const targets = readJson(".blueprint/polish.json", "the polish list").targets ?? [];
const open = targets.filter((target) => target.status === "todo").map((target) => target.file);
if (open.length > 0) fail(`files still to do: ${open.join(", ")}`);
const unnamed = targets.filter((target) => !text.includes(target.file)).map((target) => target.file);
if (unnamed.length > 0) fail(`${REPORT} does not name: ${unnamed.join(", ")}`);

// Every finding set aside is the person's to judge, so the report gives each one's rule and reason.
const unexplained = unreportedDismissals(
  targets.map((target) => ({ key: target.file, dismissed: target.dismissed })),
  text,
);
if (unexplained.length > 0) fail(`${REPORT} does not give the rule and the reason, word for word, of the findings set aside: ${unexplained.join(", ")}`);
const cases = wrongCases(targets.map((target, index) => ({ key: String(index + 1), file: target.file, dismissed: target.dismissed })));
const draftsLeft = draftsProblems(cases, text, REPORT);
if (draftsLeft.length > 0) fail(draftsLeft.join("\n"));
