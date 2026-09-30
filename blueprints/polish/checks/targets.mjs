// Reads .blueprint/polish.json — the files the survey chose, which each polish round updates — and answers
// one question per mode. Exit 0 is yes. Modes:
//   survey    the list is well formed, within the agreed count, every file still to do, and each file's
//             recorded finding count is what chaff says now; an empty list only when no named document the
//             person did not ask to leave alone has a finding
//   progress  more files are finished than at the last passing round, and every polished file kept what it
//             says: its original is saved, its headings, code blocks, link targets and chaff tree addresses are
//             unchanged, and it raises no chaff finding under the style
//   verify    every polished file kept what it says and is clean — progress without its counter, for the
//             agent to run while working (running progress itself would record the count and fail the real
//             check that follows)
//   more      some file is still to do (the polish step's repeatWhile)
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { fromBase } from "./base.mjs";
import { targetsText } from "./targetsView.mjs";
import { genreArgs, kindGenre } from "./kind.mjs";
import { readCatalog, readRecord, viewpointProblems, viewpointsFor } from "./viewpoints.mjs";
import { insidePath, namedTextFiles, TEXT_FILE } from "./named.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));
const { skeletonChanges } = await import(fromBase("markdown.mjs"));
const { dismissalProblems, withoutDismissed } = await import(fromBase("dismissals.mjs"));

const LIST = ".blueprint/polish.json";
// The list as a person reads it before any document is changed.
const READABLE = ".blueprint/polish.txt";
const PROGRESS = ".blueprint/.polish-finished";
const ORIGINALS = ".blueprint/originals";
const STATUSES = ["todo", "done", "skipped"];

const PARENT = "..";
const BLUEPRINT = ".blueprint";
/** The first folder of a normalized relative path: "../x" is outside, ".blueprint/x" is the build's own; "..notes.md" is neither. */
const firstSegment = (file) => normalize(file).split(/[\\/]/u)[0];

const targetProblem = (target) => {
  if (typeof target !== "object" || target === null) return "a target is not an object";
  if (typeof target.file !== "string" || !TEXT_FILE.test(target.file)) return `${JSON.stringify(target.file)}: must be a .md or .txt path`;
  if (isAbsolute(target.file) || [PARENT, BLUEPRINT].includes(firstSegment(target.file))) {
    return `${target.file}: must be inside this folder and outside .blueprint/`;
  }
  if (!Number.isInteger(target.before) || target.before < 0) return `${target.file}: "before" must be the number of findings before polishing`;
  if (!STATUSES.includes(target.status)) return `${target.file}: status must be one of ${STATUSES.join(", ")}`;
  if (target.status === "skipped" && !(typeof target.note === "string" && target.note.trim())) return `${target.file}: skipped without a note saying why`;
  // Only a polished file is compared with chaff, so only one can set a finding aside.
  if (target.status !== "done" && Array.isArray(target.dismissed) && target.dismissed.length > 0)
    return `${target.file}: only a file marked done can set findings aside`;
  return null;
};

const readList = () => {
  const list = readJson(LIST, '{ "targets": [{ "file", "before", "status" }] }');
  if (!Array.isArray(list?.targets)) fail(`${LIST} needs a "targets" array`);
  const problem = list.targets.map(targetProblem).find((found) => found !== null);
  if (problem) fail(`${LIST}: ${problem}`);
  const files = list.targets.map((target) => normalize(target.file));
  if (new Set(files).size !== files.length) fail(`${LIST}: a file is listed twice`);
  if (list.avoided !== undefined && !(Array.isArray(list.avoided) && list.avoided.every((file) => typeof file === "string")))
    fail(`${LIST}: "avoided" must be a list of the files left alone`);
  return { targets: list.targets, avoided: list.avoided ?? [] };
};

// The kind of document the person named decides chaff's genre, when the style is chaff's own.
const genre = kindGenre();
const byKind = genreArgs(genre);
// The kind's viewpoints: what a polished file is read for beyond chaff's findings.
const catalog = readCatalog(process.env.BLUEPRINT_USECASE);
const viewpointIds = viewpointsFor(catalog, genre);

const findingsNow = (file) => findingsIn(file, byKind).filter(actionable).length;

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
  // A finding set aside with a reason (dismissals.mjs) does not count; one that no longer exists is a stale dismissal.
  const reported = findingsIn(target.file, byKind).filter(actionable);
  const dismissals = dismissalProblems(target.file, target.dismissed, reported);
  const left = withoutDismissed(reported, target.dismissed).length;
  const findings = left === 0 ? [] : [`${target.file}: ${left} chaff finding(s) remain under the style`];
  const read = viewpointProblems({
    file: target.file,
    ids: viewpointIds,
    catalog,
    entries: readRecord()[target.file],
    original: before,
    current: after,
  });
  return [...changed, ...treeChanged, ...dismissals, ...findings, ...read];
};

// lstat, not stat: a symbolic link is reported by named.mjs rather than followed out of the folder or round a cycle.
const folder = {
  kindOf: (path) => {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) return "link";
      if (stat.isFile()) return "file";
      return stat.isDirectory() ? "dir" : null;
    } catch {
      return null;
    }
  },
  entries: (dir) => readdirSync(dir),
};

const inside = (file) => insidePath(String(file)) ?? String(file);

// The files left alone must be among the named documents, under a place the answer `avoid` names, and not also
// chosen: leaving a file out is the person's word, never the survey's own judgement.
const avoidedProblems = (named, avoided, chosen, avoidAnswer) => {
  const stray = avoided.filter((file) => !named.files.includes(inside(file)));
  if (stray.length > 0) return [`"avoided" names files that are not among the named documents: ${stray.join(", ")}`];
  const allowed = namedTextFiles(avoidAnswer, folder).files;
  const unasked = avoided.filter((file) => !allowed.includes(inside(file)));
  if (unasked.length > 0) return [`"avoided" names files the answer avoid does not: ${unasked.join(", ")}`];
  const both = avoided.filter((file) => chosen.includes(inside(file)));
  return both.length === 0 ? [] : [`both chosen and left alone: ${both.join(", ")}`];
};

// Nothing to polish is an answer only when it is true: every named document is clean, or one the person asked to
// leave alone. Anything else chosen out of the list comes back to the agent by name, and so does anything the
// check could not read as this folder's own.
const nothingChosenProblems = (named, avoided) => {
  if (named.refused.length > 0) return [`nothing chosen, but these could not be read as this folder's own documents: ${named.refused.join(", ")}`];
  if (named.files.length === 0) return ["the answer names no Markdown or text file in this folder"];
  const left = named.files.filter((file) => !avoided.map(inside).includes(file));
  const withFindings = left.filter((file) => findingsNow(file) > 0);
  return withFindings.length === 0 ? [] : [`nothing chosen, but these have chaff findings: ${withFindings.join(", ")}`];
};

// A kind with viewpoints is read for them whether or not chaff found anything, so every named document is worth a
// round: as many as the agreed number allows.
const underChosenProblems = (named, avoided, chosen, limit) => {
  if (viewpointIds.length === 0) return [];
  const left = named.files.filter((file) => !avoided.map(inside).includes(file));
  const wanted = Number.isFinite(limit) && limit > 0 ? Math.min(left.length, limit) : left.length;
  const unchosen = left.filter((file) => !chosen.includes(file));
  return left.length - unchosen.length >= wanted
    ? []
    : [`a ${genre} is read for its viewpoints: choose ${wanted} of the named documents; not chosen: ${unchosen.join(", ")}`];
};

const mode = process.argv[2];
const { targets, avoided } = readList();

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
  const named = namedTextFiles(answers.targets, folder);
  const chosen = targets.map((target) => inside(target.file));
  const leftAlone = avoided.length > 0 ? avoidedProblems(named, avoided, chosen, answers.avoid) : [];
  const under = underChosenProblems(named, avoided, chosen, limit);
  const empty = targets.length === 0 && under.length === 0 ? nothingChosenProblems(named, avoided) : [];
  const problems = [...leftAlone, ...under, ...empty];
  if (problems.length > 0) fail(problems.join("\n"));
  if (existsSync(PROGRESS)) rmSync(PROGRESS);
  writeFileSync(READABLE, targetsText(targets));
  console.log(`${targets.length} file(s) to polish`);
} else if (mode === "progress") {
  const finished = targets.filter((target) => target.status !== "todo");
  const before = existsSync(PROGRESS) ? Number(readFileSync(PROGRESS, "utf8")) || 0 : 0;
  // The survey found nothing to polish: the round has nothing to do, and a check that asked for progress could never pass.
  if (targets.length === 0) {
    console.log("nothing to polish");
    process.exit(0);
  }
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
