// Reads .blueprint/polish.json — the files the survey chose, which each polish round updates — and answers
// one question per mode. Exit 0 is yes. Modes:
//   survey    the list is well formed, within the agreed count, every file still to do, and each file's
//             recorded finding count is what chaff says now
//   progress  more files are finished than at the last passing round, and every polished file kept what it
//             says: its original is saved, its headings, code blocks, link targets and chaff tree addresses are
//             unchanged, and it raises no chaff finding under the style
//   verify    every polished file kept what it says and is clean — progress without its counter, for the
//             agent to run while working (running progress itself would record the count and fail the real
//             check that follows)
//   more      some file is still to do (the polish step's repeatWhile)
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { fromBase } from "./base.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));
const { skeletonChanges } = await import(fromBase("markdown.mjs"));

const LIST = ".blueprint/polish.json";
const PROGRESS = ".blueprint/.polish-finished";
const ORIGINALS = ".blueprint/originals";
const STATUSES = ["todo", "done", "skipped"];
const TEXT_FILE = /\.(?:md|markdown|txt)$/u;

const targetProblem = (target) => {
  if (typeof target !== "object" || target === null) return "a target is not an object";
  if (typeof target.file !== "string" || !TEXT_FILE.test(target.file)) return `${JSON.stringify(target.file)}: must be a .md or .txt path`;
  if (isAbsolute(target.file) || normalize(target.file).startsWith("..") || normalize(target.file).startsWith(".blueprint")) {
    return `${target.file}: must be inside this folder and outside .blueprint/`;
  }
  if (!Number.isInteger(target.before) || target.before < 0) return `${target.file}: "before" must be the number of findings before polishing`;
  if (!STATUSES.includes(target.status)) return `${target.file}: status must be one of ${STATUSES.join(", ")}`;
  if (target.status === "skipped" && !(typeof target.note === "string" && target.note.trim())) return `${target.file}: skipped without a note saying why`;
  return null;
};

const readList = () => {
  const list = readJson(LIST, '{ "targets": [{ "file", "before", "status" }] }');
  if (!Array.isArray(list?.targets) || list.targets.length === 0) fail(`${LIST} needs a non-empty "targets" array`);
  const problem = list.targets.map(targetProblem).find((found) => found !== null);
  if (problem) fail(`${LIST}: ${problem}`);
  const files = list.targets.map((target) => normalize(target.file));
  if (new Set(files).size !== files.length) fail(`${LIST}: a file is listed twice`);
  return list.targets;
};

const findingsNow = (file) => findingsIn(file).filter(actionable).length;

/** The addresses of chaff's tree (articles, sections, items) — what a reference to this document points at. */
const addressesOf = (file) => {
  const run = runChaff(["tree", file, "--format", "json"]);
  if (run.code !== 0) return undefined;
  const walk = (node) => [...(node.address ? [node.address] : []), ...(node.children ?? []).flatMap(walk)];
  return walk(JSON.parse(run.stdout));
};

const polishedProblems = (target) => {
  const original = join(ORIGINALS, target.file);
  if (!existsSync(original)) return [`${target.file}: its original is not saved in ${original}`];
  if (!existsSync(target.file)) return [`${target.file}: the file is gone`];
  const [before, after] = [readFileSync(original, "utf8"), readFileSync(target.file, "utf8")];
  const changed = skeletonChanges(before, after).map((part) => `${target.file}: ${part} changed`);
  const [wasTree, nowTree] = [addressesOf(original), addressesOf(target.file)];
  const treeChanged = JSON.stringify(wasTree) === JSON.stringify(nowTree) ? [] : [`${target.file}: the addresses in chaff's tree changed`];
  const left = findingsNow(target.file);
  const findings = left === 0 ? [] : [`${target.file}: ${left} chaff finding(s) remain under the style`];
  return [...changed, ...treeChanged, ...findings];
};

const mode = process.argv[2];
const targets = readList();

if (mode === "survey") {
  const answers = readJson(".blueprint/answers.json", "the interview answers");
  const limit = Number(answers.maxFiles);
  if (Number.isFinite(limit) && limit > 0 && targets.length > limit) fail(`${targets.length} files listed, more than the agreed ${limit}`);
  const started = targets.filter((target) => target.status !== "todo").map((target) => target.file);
  if (started.length > 0) fail(`every file starts to do; already marked: ${started.join(", ")}`);
  const absent = targets.filter((target) => !existsSync(target.file)).map((target) => target.file);
  if (absent.length > 0) fail(`not in this folder: ${absent.join(", ")}`);
  const miscounted = targets
    .filter((target) => findingsNow(target.file) !== target.before)
    .map((target) => `${target.file} (recorded ${target.before}, chaff says ${findingsNow(target.file)})`);
  if (miscounted.length > 0) fail(`"before" does not match chaff now: ${miscounted.join(", ")}`);
  if (existsSync(PROGRESS)) rmSync(PROGRESS);
  console.log(`${targets.length} file(s) to polish`);
} else if (mode === "progress") {
  const finished = targets.filter((target) => target.status !== "todo");
  const before = existsSync(PROGRESS) ? Number(readFileSync(PROGRESS, "utf8")) || 0 : 0;
  if (finished.length <= before)
    fail(`no file finished this round (${finished.length} finished, ${before} before): mark the file you polished as done, or skipped with a note`);
  const problems = targets.filter((target) => target.status === "done").flatMap(polishedProblems);
  if (problems.length > 0) fail(problems.join("\n"));
  writeFileSync(PROGRESS, String(finished.length));
  console.log(`${finished.length} of ${targets.length} file(s) finished`);
} else if (mode === "verify") {
  const problems = targets.filter((target) => target.status === "done").flatMap(polishedProblems);
  if (problems.length > 0) fail(problems.join("\n"));
  console.log("every polished file kept what it says and is clean");
} else if (mode === "more") {
  process.exit(targets.some((target) => target.status === "todo") ? 0 : 1);
} else {
  fail(`usage: targets.mjs survey | progress | verify | more (got ${JSON.stringify(mode)})`);
}
