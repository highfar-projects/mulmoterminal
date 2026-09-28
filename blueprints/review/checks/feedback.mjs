// Drafts one report to chaff per case the review found (candidates.mjs) with `chaff feedback`, which sends
// nothing, and keeps each under .blueprint/chaff-feedback/. With a chaff that has no `feedback`, it records
// that and drafts nothing. Run from the folder by the report step; report.mjs checks what it wrote.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromBase } from "./base.mjs";
import { feedbackCases } from "./candidates.mjs";
const { fail, readJson, runChaff } = await import(fromBase("chaff.mjs"));

const DRAFT = ".chaff-feedback.md";
const DIR = ".blueprint/chaff-feedback";

if (existsSync(DRAFT)) fail(`${DRAFT} already exists in this folder: it may be the person's own draft, so move it away first`);

const record = readJson(".blueprint/findings.json", "the findings");
const cases = feedbackCases(
  { findings: Array.isArray(record?.findings) ? record.findings : [], dismissed: Array.isArray(record?.dismissed) ? record.dismissed : [] },
  (file) => readFileSync(file, "utf8"),
);
const supported = runChaff(["--help"]).stdout.includes("chaff feedback");
mkdirSync(DIR, { recursive: true });

const argsFor = (entry) =>
  entry.kind === "wrong"
    ? ["feedback", entry.file, "--rule", entry.rule, "--line", String(entry.line), "--experimental"]
    : ["feedback", entry.file, "--missed", "--line", String(entry.line), "--experimental"];

// Everything this run made. On a failure it is all removed and no index is written, so a rerun starts clean.
// The root .chaff-feedback.md can only be this run's: the script refused to start when one was there.
const made = [];
const undo = (message) => {
  [DRAFT, ...made].forEach((file) => rmSync(file, { force: true }));
  fail(message);
};

const drafted = supported
  ? cases.map((entry) => {
      const run = runChaff(argsFor(entry));
      if (run.code !== 0 || !existsSync(DRAFT)) undo(`chaff feedback did not draft ${entry.id}:\n${run.stderr || run.stdout}`);
      const draft = join(DIR, `${entry.id}.md`);
      renameSync(DRAFT, draft);
      made.push(draft);
      return { ...entry, draft };
    })
  : cases;

writeFileSync(join(DIR, "index.json"), JSON.stringify({ supported, drafts: drafted }, null, 2) + "\n");
console.log(
  supported
    ? `${drafted.length} report draft(s) for chaff in ${DIR}; nothing was sent`
    : `${cases.length} case(s) for chaff, but this chaff has no \`feedback\` command, so no drafts were made`,
);
