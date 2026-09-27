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
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { fromBase } from "./base.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));

const OUTLINE = ".blueprint/outline.json";
const PROGRESS = ".blueprint/.parts-done";
const CITATIONS = ".blueprint/citations";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const STATUSES = ["todo", "done"];

const partProblem = (part) => {
  if (typeof part !== "object" || part === null) return "a part is not an object";
  if (typeof part.id !== "string" || !ID_RE.test(part.id)) return `bad id ${JSON.stringify(part.id)}`;
  if (typeof part.title !== "string" || part.title.trim() === "") return `${part.id}: no title`;
  if (typeof part.file !== "string" || !part.file.endsWith(".md")) return `${part.id}: file must be a .md path`;
  if (isAbsolute(part.file) || normalize(part.file).startsWith("..") || normalize(part.file).startsWith(".blueprint")) {
    return `${part.id}: file must be inside this folder and outside .blueprint/`;
  }
  if (!Array.isArray(part.points) || part.points.length === 0) return `${part.id}: no points to cover`;
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
const citationProblems = (part) => {
  const file = join(CITATIONS, `${part.id}.json`);
  if (!existsSync(file)) return [];
  const citations = readJson(file, '[{ "source", "address", "quote" }]');
  if (!Array.isArray(citations)) return [`${file} must be an array`];
  const bad = citations.findIndex((entry) => typeof entry?.source !== "string" || typeof entry?.address !== "string" || typeof entry?.quote !== "string");
  if (bad !== -1) return [`${file} entry ${bad + 1} needs "source", "address" and "quote"`];
  const bySource = new Map();
  citations.forEach((entry) => {
    const same = bySource.get(entry.source) ?? [];
    same.push(entry);
    bySource.set(entry.source, same);
  });
  const dir = mkdtempSync(join(tmpdir(), "cite-"));
  try {
    return [...bySource].flatMap(([source, entries]) => {
      const sourcePath = join(".blueprint/sources", source);
      if (!existsSync(sourcePath)) return [`${part.id}: cites ${source}, which is not in .blueprint/sources/`];
      const claims = join(dir, "claims.json");
      writeFileSync(claims, JSON.stringify(entries.map(({ address, quote }) => ({ address, quote }))));
      const run = runChaff(["cite", sourcePath, claims]);
      return run.code === 0 ? [] : [`${part.id}: quotations from ${source} are not in it:\n${run.stdout}${run.stderr}`];
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const partProblems = (part) => {
  if (!existsSync(part.file) || !statSync(part.file).isFile()) return [`${part.id}: ${part.file} is not written`];
  if (readFileSync(part.file, "utf8").trim() === "") return [`${part.id}: ${part.file} is empty`];
  const findings = findingsIn(part.file)
    .filter(actionable)
    .map((finding) => `${part.id}: ${finding.rule} (${finding.level})`);
  return [...findings, ...citationProblems(part)];
};

const mode = process.argv[2];
const parts = readOutline();

if (mode === "outline") {
  const started = parts.filter((part) => part.status !== "todo").map((part) => part.id);
  if (started.length > 0) fail(`the outline starts with every part to do; already marked: ${started.join(", ")}`);
  const existing = parts.filter((part) => existsSync(part.file)).map((part) => part.file);
  if (existing.length > 0) fail(`these files already exist and would be overwritten — choose other names: ${existing.join(", ")}`);
  if (existsSync(PROGRESS)) rmSync(PROGRESS);
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
