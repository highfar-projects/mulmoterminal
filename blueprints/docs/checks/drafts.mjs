// Reports to chaff, drafted with `chaff feedback` (which sends nothing) and kept under .blueprint/chaff-feedback/,
// for the cases a usecase found: { id, kind: "wrong" | "missed", file, rule, line }. With a chaff that has no
// `feedback`, the index records that and nothing is drafted. Shared by every usecase that sets chaff aside.
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail, readJson, runChaff } from "./chaff.mjs";
import { missingSections } from "./markdown.mjs";

const DRAFT = ".chaff-feedback.md";
const DIR = ".blueprint/chaff-feedback";
const INDEX = join(DIR, "index.json");
const DRAFTS_SECTION = [["chaff への報告の下書き", "Drafts for chaff"]];

const argsFor = (entry, extra) =>
  entry.kind === "wrong"
    ? ["feedback", entry.file, "--rule", entry.rule, "--line", String(entry.line), "--experimental", ...extra]
    : ["feedback", entry.file, "--missed", "--line", String(entry.line), "--experimental", ...extra];

/**
 * Drafts one report per case and writes the index. Stops, leaving nothing behind, when a draft fails. `extra` adds
 * arguments (such as `--genre`), so a draft reproduces the finding under the same measure the check used.
 */
export const draftReports = (cases, extra = []) => {
  if (existsSync(DRAFT)) fail(`${DRAFT} already exists in this folder: it may be the person's own draft, so move it away first`);
  const supported = runChaff(["--help"]).stdout.includes("chaff feedback");
  mkdirSync(DIR, { recursive: true });
  // Everything this run made. On a failure it is all removed and no index is written, so a rerun starts clean.
  // The root .chaff-feedback.md can only be this run's: the function refused to start when one was there.
  const made = [];
  const undo = (message) => {
    [DRAFT, ...made].forEach((file) => rmSync(file, { force: true }));
    fail(message);
  };
  const drafted = supported
    ? cases.map((entry) => {
        const run = runChaff(argsFor(entry, extra));
        if (run.code !== 0 || !existsSync(DRAFT)) undo(`chaff feedback did not draft ${entry.id}:\n${run.stderr || run.stdout}`);
        const draft = join(DIR, `${entry.id}.md`);
        renameSync(DRAFT, draft);
        made.push(draft);
        return { ...entry, draft };
      })
    : cases;
  writeFileSync(INDEX, JSON.stringify({ supported, drafts: drafted }, null, 2) + "\n");
  console.log(
    supported
      ? `${drafted.length} report draft(s) for chaff in ${DIR}; nothing was sent`
      : `${cases.length} case(s) for chaff, but this chaff has no \`feedback\` command, so no drafts were made`,
  );
};

/** What is wrong with the drafts for `cases`, and with a report (`reportText` at `reportPath`) that hands them over. */
export const draftsProblems = (cases, reportText, reportPath) => {
  if (cases.length === 0) return [];
  if (!existsSync(INDEX)) return [`${cases.length} case(s) to report to chaff, but ${INDEX} is missing: run feedback.mjs`];
  const index = readJson(INDEX, "what feedback.mjs wrote");
  // Whole cases, not just ids: a missed case keeps its id when its quotation moves to another line.
  const listed = Array.isArray(index?.drafts) ? index.drafts.map(({ id, kind, file, rule, line }) => ({ id, kind, file, rule, line })) : [];
  if (JSON.stringify(listed) !== JSON.stringify(cases)) return [`${INDEX} is out of date: run feedback.mjs again`];
  if (index.supported !== true) return [];
  const absent = index.drafts.filter((entry) => typeof entry.draft !== "string" || !existsSync(entry.draft)).map((entry) => entry.id);
  if (absent.length > 0) return [`drafts missing for: ${absent.join(", ")}: run feedback.mjs again`];
  if (missingSections(reportText, DRAFTS_SECTION).length > 0) return [`${reportPath} lacks the section 「chaff への報告の下書き」 / "Drafts for chaff"`];
  const unlisted = index.drafts.filter((entry) => !reportText.includes(entry.draft)).map((entry) => entry.draft);
  return unlisted.length > 0 ? [`${reportPath} does not name the drafts: ${unlisted.join(", ")}`] : [];
};
