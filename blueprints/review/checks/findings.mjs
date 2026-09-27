// Reads .blueprint/findings.json — what the review found — and answers one question per mode. Exit 0 is yes.
//   read     every finding is well formed and quotes the documents faithfully (chaff cite); every structure
//            problem chaff reports in the documents is either a finding or dismissed with a reason, and no
//            finding claims a machine result chaff did not report. Records a fingerprint of each document.
//   propose  the documents are unchanged since the read; with proposals asked for, every finding has one and
//            each document has a proposed copy beside it that differs and has no more structure problems
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";
import { fromBase } from "./base.mjs";
const { fail, findingsIn, quotationProblems, readJson } = await import(fromBase("chaff.mjs"));

const FINDINGS = ".blueprint/findings.json";
const FINGERPRINTS = ".blueprint/.documents.json";
const STRUCTURE_RULES = ["dangling-reference", "numbering-gap", "duplicate-definition"];
const KINDS = [...STRUCTURE_RULES, "contradiction", "ambiguity", "omission", "other"];
const SEVERITIES = ["high", "medium", "low"];
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const WITH_PROPOSALS = "直し方の案まで作る（原本は変えずに別のファイルに）";

const answers = readJson(".blueprint/answers.json", "the interview answers");
const documents = [
  ...new Set(
    String(answers?.documents ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => normalize(line)),
  ),
];
if (documents.length === 0) fail("the interview names no document to review");
const outside = documents.filter((file) => isAbsolute(file) || normalize(file).split(/[\\/]/u)[0] === "..");
if (outside.length > 0) fail(`documents must be inside this folder: ${outside.join(", ")}`);
const absent = documents.filter((file) => !existsSync(file) || !statSync(file).isFile());
if (absent.length > 0) fail(`not a file in this folder: ${absent.join(", ")}`);

const proposedPath = (file) => join(dirname(file), `${basename(file, extname(file))}.proposed${extname(file)}`);
const overlapping = documents.filter((file) => documents.includes(proposedPath(file)));
if (overlapping.length > 0) fail(`the proposed copy of ${overlapping.join(", ")} would be another document under review`);
const fingerprint = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const structureIn = (file) =>
  findingsIn(file, ["--experimental"])
    .filter((finding) => STRUCTURE_RULES.includes(finding.rule))
    .map((finding) => ({ rule: finding.rule, file, line: finding.line }));
const describeMachine = (result) => `${result.file}:${result.line} ${result.rule}`;
const isMachineResult = (value) =>
  typeof value === "object" && value !== null && typeof value.rule === "string" && typeof value.file === "string" && Number.isInteger(value.line);
const sameMachine = (claim, result) =>
  isMachineResult(claim) && claim.rule === result.rule && normalize(claim.file) === result.file && claim.line === result.line;

/** A document a quotation may cite: one of the documents under review, by the same path. */
const documentPath = (source) =>
  documents.includes(normalize(source)) ? { path: normalize(source) } : { problem: `cites ${source}, which is not a document under review` };

const findingProblem = (finding) => {
  if (typeof finding !== "object" || finding === null) return "a finding is not an object";
  if (typeof finding.id !== "string" || !ID_RE.test(finding.id)) return `bad id ${JSON.stringify(finding.id)}`;
  if (!KINDS.includes(finding.kind)) return `${finding.id}: kind must be one of ${KINDS.join(", ")}`;
  if (!SEVERITIES.includes(finding.severity)) return `${finding.id}: severity must be one of ${SEVERITIES.join(", ")}`;
  if (typeof finding.summary !== "string" || !finding.summary.trim()) return `${finding.id}: no summary`;
  if (typeof finding.explanation !== "string" || !finding.explanation.trim()) return `${finding.id}: no explanation`;
  if (finding.machine !== undefined && !isMachineResult(finding.machine)) return `${finding.id}: "machine" must be { "rule", "file", "line" }`;
  if (!Array.isArray(finding.citations) || finding.citations.length === 0) return `${finding.id}: a finding quotes the text it is about`;
  return null;
};

const readFindings = () => {
  const record = readJson(FINDINGS, '{ "findings": [...], "dismissed": [...] }');
  const findings = Array.isArray(record?.findings) ? record.findings : fail(`${FINDINGS} needs a "findings" array (empty when nothing was found)`);
  const dismissed = Array.isArray(record?.dismissed) ? record.dismissed : [];
  const problem = findings.map(findingProblem).find((found) => found !== null);
  if (problem) fail(`${FINDINGS}: ${problem}`);
  const ids = findings.map((finding) => finding.id);
  if (new Set(ids).size !== ids.length) fail(`${FINDINGS}: finding ids repeat`);
  const unexplained = dismissed.filter((entry) => typeof entry?.why !== "string" || !entry.why.trim());
  if (unexplained.length > 0) fail(`${FINDINGS}: a dismissed machine finding needs a "why"`);
  if (!dismissed.every(isMachineResult)) fail(`${FINDINGS}: a dismissed machine finding is { "rule", "file", "line", "why" }`);
  return { findings, dismissed };
};

/** The findings, once every structure result is addressed, nothing is invented, and every quotation is in its document. */
const verifiedFindings = () => {
  const { findings, dismissed } = readFindings();
  const machine = documents.flatMap(structureIn);
  const uncovered = machine.filter(
    (result) => !findings.some((finding) => sameMachine(finding.machine, result)) && !dismissed.some((entry) => sameMachine(entry, result)),
  );
  if (uncovered.length > 0)
    fail(`structure problems chaff reports that the review does not address:\n${uncovered.map((result) => "  " + describeMachine(result)).join("\n")}`);
  const invented = [...findings.map((finding) => finding.machine).filter((claim) => claim !== undefined), ...dismissed].filter(
    (claim) => !machine.some((result) => sameMachine(claim, result)),
  );
  if (invented.length > 0) fail(`claimed as chaff results, but chaff reports no such thing: ${invented.map(describeMachine).join(", ")}`);
  const quoted = findings.flatMap((finding) => quotationProblems(finding.id, finding.citations, documentPath));
  if (quoted.length > 0) fail(quoted.join("\n"));
  return { findings, machine };
};

const mode = process.argv[2];

if (mode === "read") {
  const { findings, machine } = verifiedFindings();
  writeFileSync(FINGERPRINTS, JSON.stringify(Object.fromEntries(documents.map((file) => [file, fingerprint(file)]))));
  console.log(`${findings.length} finding(s); ${machine.length} structure result(s) from chaff, all addressed`);
} else if (mode === "propose") {
  const recorded = readJson(FINGERPRINTS, "the fingerprints the read step recorded");
  if (typeof recorded !== "object" || recorded === null || Array.isArray(recorded))
    fail(`${FINGERPRINTS} is not what the read step records: run the read check again`);
  if (JSON.stringify(Object.keys(recorded).sort()) !== JSON.stringify([...documents].sort()))
    fail(`the documents named now are not the ones the review read (${Object.keys(recorded).join(", ")}): run the read check again`);
  const changed = documents.filter((file) => recorded[file] !== fingerprint(file));
  if (changed.length > 0) fail(`changed since the review read them — the originals must stay as they are: ${changed.join(", ")}`);
  const { findings } = verifiedFindings();
  if (answers?.proposals === WITH_PROPOSALS) {
    const bare = findings.filter((finding) => typeof finding.proposal !== "string" || !finding.proposal.trim()).map((finding) => finding.id);
    if (bare.length > 0) fail(`findings without a proposal: ${bare.join(", ")}`);
    const concerned = (file) => findings.some((finding) => finding.citations.some((citation) => normalize(citation.source) === file));
    const problems = documents.filter(concerned).flatMap((file) => {
      const proposed = proposedPath(file);
      if (!existsSync(proposed) || !statSync(proposed).isFile()) return [`${file}: no proposed copy at ${proposed}`];
      if (fingerprint(proposed) === fingerprint(file)) return [`${proposed}: identical to the original`];
      const [before, after] = [structureIn(file).length, structureIn(proposed).length];
      return after > before ? [`${proposed}: ${after} structure problem(s), more than the original's ${before}`] : [];
    });
    if (problems.length > 0) fail(problems.join("\n"));
  }
  console.log("the originals are untouched");
} else {
  fail(`usage: findings.mjs read | propose (got ${JSON.stringify(mode)})`);
}
