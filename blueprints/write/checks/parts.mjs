// Reads .blueprint/outline.json — the parts the outline step decided, which each draft round updates — and
// answers one question per mode. Exit 0 is yes. Modes:
//   outline   the outline is well formed, every part is still to do, and no output file exists yet
//             (the build never overwrites a file the person already has)
//   progress  more parts are done than at the last passing round, and every done part is written, raises no
//             chaff finding under the folder's style, and quotes its sources faithfully (chaff cite)
//   verify    every done part is written, clean and faithfully quoted — progress without its counter, for the
//             writer to run while working (running progress itself would record the count and fail the real
//             check that follows)
//   more      some part is still to do (the draft step's repeatWhile)
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize } from "node:path";
import { fromBase } from "./base.mjs";
import { outlineText } from "./outlineView.mjs";
const { actionable, fail, findingsIn, quotationProblems, readJson } = await import(fromBase("chaff.mjs"));
const { dismissalProblems, withoutDismissed } = await import(fromBase("dismissals.mjs"));

const OUTLINE = ".blueprint/outline.json";
// The outline as a person reads it before the parts are written.
const READABLE = ".blueprint/outline.txt";
const PROGRESS = ".blueprint/.parts-done";
const CITATIONS = ".blueprint/citations";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const STATUSES = ["todo", "done"];

const PARENT = "..";
const BLUEPRINT = ".blueprint";
/** The first folder of a normalized relative path: "../x" is outside, ".blueprint/x" is the build's own; "..notes.md" is neither. */
const firstSegment = (file) => normalize(file).split(/[\\/]/u)[0];

const partProblem = (part) => {
  if (typeof part !== "object" || part === null) return "a part is not an object";
  if (typeof part.id !== "string" || !ID_RE.test(part.id)) return `bad id ${JSON.stringify(part.id)}`;
  if (typeof part.title !== "string" || part.title.trim() === "") return `${part.id}: no title`;
  if (typeof part.file !== "string" || !part.file.endsWith(".md")) return `${part.id}: file must be a .md path`;
  if (isAbsolute(part.file) || [PARENT, BLUEPRINT].includes(firstSegment(part.file))) {
    return `${part.id}: file must be inside this folder and outside .blueprint/`;
  }
  if (!Array.isArray(part.points) || part.points.length === 0) return `${part.id}: no points to cover`;
  if (!part.points.every((point) => typeof point === "string" && point.trim() !== "")) return `${part.id}: every point is a line of text`;
  if (!STATUSES.includes(part.status)) return `${part.id}: status must be one of ${STATUSES.join(", ")}`;
  return null;
};

const readOutline = () => {
  const outline = readJson(OUTLINE, '{ "parts": [{ "id", "title", "file", "points", "status" }] }');
  if (!Array.isArray(outline?.parts) || outline.parts.length === 0) fail(`${OUTLINE} needs a non-empty "parts" array`);
  const problem = outline.parts.map(partProblem).find((found) => found !== null);
  if (problem) fail(`${OUTLINE}: ${problem}`);
  const ids = outline.parts.map((part) => part.id);
  if (new Set(ids).size !== ids.length) fail(`${OUTLINE}: part ids repeat`);
  const files = outline.parts.map((part) => normalize(part.file));
  if (new Set(files).size !== files.length) fail(`${OUTLINE}: two parts write the same file`);
  return outline.parts;
};

/** Each quotation a part took from the sources is written in that source: chaff cite, one source at a time. */
/** A source a part may cite: a plain file name in .blueprint/sources/ ("../../intro.md" would cite the draft itself). */
const sourcePath = (source) => {
  if (basename(source) !== source || source.startsWith(".")) return { problem: `source ${JSON.stringify(source)} must be a file name in .blueprint/sources/` };
  const path = join(".blueprint/sources", source);
  return existsSync(path) ? { path } : { problem: `cites ${source}, which is not in .blueprint/sources/` };
};

const citationProblems = (part) => {
  const file = join(CITATIONS, `${part.id}.json`);
  if (!existsSync(file)) return [];
  return quotationProblems(part.id, readJson(file, '[{ "source", "address", "quote" }]'), sourcePath);
};

const partProblems = (part) => {
  if (!existsSync(part.file) || !statSync(part.file).isFile()) return [`${part.id}: ${part.file} is not written`];
  if (readFileSync(part.file, "utf8").trim() === "") return [`${part.id}: ${part.file} is empty`];
  // A finding set aside with a reason (dismissals.mjs) does not count; one that no longer exists is a stale dismissal.
  const reported = findingsIn(part.file).filter(actionable);
  const findings = withoutDismissed(reported, part.dismissed).map((finding) => `${part.id}: ${finding.rule} (${finding.level})`);
  return [...dismissalProblems(part.id, part.dismissed, reported), ...findings, ...citationProblems(part)];
};

const mode = process.argv[2];
const parts = readOutline();

if (mode === "outline") {
  const started = parts.filter((part) => part.status !== "todo").map((part) => part.id);
  if (started.length > 0) fail(`the outline starts with every part to do; already marked: ${started.join(", ")}`);
  const existing = parts.filter((part) => existsSync(part.file)).map((part) => part.file);
  if (existing.length > 0) fail(`these files already exist and would be overwritten — choose other names: ${existing.join(", ")}`);
  if (existsSync(PROGRESS)) rmSync(PROGRESS);
  writeFileSync(READABLE, outlineText(parts));
  console.log(`${parts.length} part(s) planned`);
} else if (mode === "progress") {
  const done = parts.filter((part) => part.status === "done");
  const before = existsSync(PROGRESS) ? Number(readFileSync(PROGRESS, "utf8")) || 0 : 0;
  if (done.length <= before) fail(`no new part is done this round (${done.length} done, ${before} before): mark the part you wrote as done`);
  const problems = done.flatMap(partProblems);
  if (problems.length > 0) fail(problems.join("\n"));
  writeFileSync(PROGRESS, String(done.length));
  console.log(`${done.length} of ${parts.length} part(s) written and checked`);
} else if (mode === "verify") {
  const problems = parts.filter((part) => part.status === "done").flatMap(partProblems);
  if (problems.length > 0) fail(problems.join("\n"));
  console.log("every done part is written and checked");
} else if (mode === "more") {
  process.exit(parts.some((part) => part.status === "todo") ? 0 : 1);
} else {
  fail(`usage: parts.mjs outline | progress | verify | more (got ${JSON.stringify(mode)})`);
}
