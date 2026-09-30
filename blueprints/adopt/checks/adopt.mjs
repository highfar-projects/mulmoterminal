// The adopt usecase's two checks. `survey`: .blueprint/adopt.json records the genre the person chose and how many
// findings chaff reports on the places today, measured again here; nothing in the repository has changed yet.
// `apply`: chaff.yaml names that genre and keeps what it had, .chaff-baseline.json shelves today's findings so chaff
// now reports none, and the workflow — when asked for — reports only what is new, with no more rights than that.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromBase } from "./base.mjs";
import { placesIn, workflowProblems } from "./setup.mjs";
const { actionable, fail, findingsIn, readJson, runChaff } = await import(fromBase("chaff.mjs"));
const { lostLines } = await import(fromBase("config.mjs"));

const RECORD = ".blueprint/adopt.json";
const READABLE = ".blueprint/adopt.txt";
const CHECKED = ".blueprint/.adopt-checked";
const CONFIG = "chaff.yaml";
const BASELINE = ".chaff-baseline.json";
const WORKFLOW = ".github/workflows/chaff.yml";
const WITH_CI = "GitHub の PR に指摘を出すワークフローを作る";

const answers = readJson(".blueprint/answers.json", "the interview answers");
const { places, refused } = placesIn(answers.places);
if (refused.length > 0) fail(`these places are outside this folder: ${refused.join(", ")}`);
if (places.length === 0) fail("the answer names no place to check");
const absent = places.filter((place) => !existsSync(place));
if (absent.length > 0) fail(`not in this folder: ${absent.join(", ")}`);
const kinds = JSON.parse(readFileSync(join(process.env.BLUEPRINT_USECASE, "kinds.json"), "utf8")).kinds;
const genre = kinds.find((kind) => kind.option === answers.kind)?.genre;
if (!genre) fail(`the answer kind ${JSON.stringify(answers.kind)} is not one of the kinds in kinds.json`);

const textOrNull = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);
const findingsNow = (extra) => places.flatMap((place) => findingsIn(place, extra).filter(actionable));
const byRule = (findings) =>
  Object.entries(findings.reduce((counts, finding) => ({ ...counts, [finding.rule]: (counts[finding.rule] ?? 0) + 1 }), {})).sort(
    ([a, x], [b, y]) => y - x || a.localeCompare(b),
  );

const survey = () => {
  const record = readJson(RECORD, '{ "genre", "findings" }');
  const measured = findingsNow(["--genre", genre]);
  if (record?.genre !== genre) fail(`${RECORD}: "genre" must be ${genre}, the genre of the kind the person chose`);
  if (record?.findings !== measured.length) fail(`${RECORD}: "findings" is ${record?.findings}, but chaff reports ${measured.length} as ${genre} now`);
  writeFileSync(
    READABLE,
    [`genre: ${genre}`, `findings: ${measured.length}`, ...byRule(measured).map(([rule, count]) => `  ${rule}: ${count}`), ""].join("\n"),
  );
  writeFileSync(CHECKED, JSON.stringify({ config: textOrNull(CONFIG), workflow: existsSync(WORKFLOW), findings: measured.length }) + "\n");
  console.log(`${measured.length} finding(s) today as ${genre}`);
};

const recorded = () => {
  try {
    return JSON.parse(readFileSync(CHECKED, "utf8"));
  } catch {
    return null;
  }
};

const workflowSide = (checked) => {
  if (answers.ci === WITH_CI)
    return existsSync(WORKFLOW)
      ? workflowProblems(readFileSync(WORKFLOW, "utf8"), places).map((problem) => `${WORKFLOW}: ${problem}`)
      : [`${WORKFLOW} is missing`];
  return !checked.workflow && existsSync(WORKFLOW) ? [`${WORKFLOW} was added, but the person chose no workflow`] : [];
};

const apply = () => {
  const checked = existsSync(CHECKED) ? recorded() : null;
  if (checked === null || typeof checked !== "object") fail("the survey step's record is missing: run that step again");
  if (!existsSync(CONFIG)) fail(`${CONFIG} is missing`);
  const run = runChaff(["rules", "--json"]);
  if (run.code !== 0) fail(`chaff could not load ${CONFIG}:\n${run.stderr}`);
  const detected = JSON.parse(run.stdout).detected?.genre;
  const baseline = existsSync(BASELINE) ? readJson(BASELINE, '{ "entries" }') : null;
  const left = findingsNow([]);
  const problems = [
    ...(detected === genre ? [] : [`${CONFIG} gives genre ${detected}, not ${genre}`]),
    ...lostLines(checked.config, readFileSync(CONFIG, "utf8")).map((line) => `${CONFIG} lost a line it had: ${line.trim()}`),
    ...(baseline === null ? [`${BASELINE} is missing: run chaff baseline on the places`] : []),
    ...(baseline !== null && (baseline.entries?.length ?? 0) < checked.findings
      ? [`${BASELINE} shelves ${baseline.entries?.length ?? 0} finding(s), fewer than the ${checked.findings} measured`]
      : []),
    ...(left.length === 0
      ? []
      : [
          `chaff still reports ${left.length} finding(s) the baseline does not shelve: ${byRule(left)
            .map(([rule, count]) => `${rule} ${count}`)
            .join(", ")}`,
        ]),
    ...workflowSide(checked),
  ];
  if (problems.length > 0) fail(problems.join("\n"));
  console.log(`chaff is set up: today's ${checked.findings} finding(s) shelved, only new ones will be reported`);
};

const mode = process.argv[2];
if (mode === "survey") survey();
else if (mode === "apply") apply();
else fail(`usage: adopt.mjs survey | apply (got ${JSON.stringify(mode)})`);
