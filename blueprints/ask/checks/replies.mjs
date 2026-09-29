// Reads .blueprint/replies.json — an answer to each question the person asked — and answers one question
// per mode. Exit 0 is yes.
//   answer  every question has exactly one reply; a reply found in the documents quotes them (chaff cite)
//           and names every address it quotes; a reply not found says what was searched. Records the
//           documents' and FAQ.md's fingerprints.
//   keep    the documents are unchanged; FAQ.md holds every question after what it held before when the
//           person asked to keep the answers, and is untouched otherwise
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fromBase } from "./base.mjs";
const { fail, quotationProblems, readJson } = await import(fromBase("chaff.mjs"));
const { digest, documentSource, documentsNamed, fingerprint } = await import(fromBase("documents.mjs"));

const REPLIES = ".blueprint/replies.json";
const REPLIES_PAGE = ".blueprint/replies.md";
const RECORDED = ".blueprint/.replies-before.json";
const FAQ = "FAQ.md";
const KEEP = "このフォルダの FAQ.md に書き足す";

const answers = readJson(".blueprint/answers.json", "the interview answers");
const documents = documentsNamed(answers?.documents);
const questions = String(answers?.questions ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "");
if (questions.length === 0) fail("the interview asks no question");
if (new Set(questions).size !== questions.length) fail("the interview asks the same question twice");
if (answers?.keep === KEEP && documents.includes(FAQ)) fail(`${FAQ} is one of the documents, so the answers cannot be added to it`);

const indented = (line) => "  " + line;
const nonEmpty = (value) => typeof value === "string" && value.trim() !== "";

const replyProblem = (reply) => {
  if (typeof reply !== "object" || reply === null) return "a reply is not an object";
  if (!nonEmpty(reply.question)) return "a reply names no question";
  const which = JSON.stringify(reply.question);
  if (typeof reply.found !== "boolean") return `${which}: "found" must be true or false`;
  if (!nonEmpty(reply.answer)) return `${which}: no answer`;
  const citations = reply.citations ?? [];
  if (!Array.isArray(citations)) return `${which}: citations must be an array`;
  if (reply.found && citations.length === 0) return `${which}: an answer found in the documents quotes them`;
  if (!citations.every((citation) => nonEmpty(citation?.address))) return `${which}: every quotation needs an "address"`;
  const unnamed = citations.filter((citation) => !reply.answer.includes(citation.address.trim()));
  if (unnamed.length > 0) return `${which}: the answer does not name ${unnamed.map((citation) => citation.address).join(", ")}, which it quotes`;
  if (!reply.found && (!Array.isArray(reply.searched) || !reply.searched.some(nonEmpty))) return `${which}: say what was searched ("searched")`;
  return null;
};

const readReplies = () => {
  const record = readJson(REPLIES, '{ "replies": [{ "question", "found", "answer", "citations", "searched" }] }');
  const replies = Array.isArray(record?.replies) ? record.replies : fail(`${REPLIES} needs a "replies" array`);
  const problem = replies.map(replyProblem).find((found) => found !== null);
  if (problem) fail(`${REPLIES}: ${problem}`);
  const asked = replies.map((reply) => reply.question.trim());
  const unanswered = questions.filter((question) => !asked.includes(question));
  if (unanswered.length > 0) fail(`no reply to:\n${unanswered.map(indented).join("\n")}`);
  const extra = asked.filter((question) => !questions.includes(question));
  if (extra.length > 0) fail(`replies to questions nobody asked:\n${extra.map(indented).join("\n")}`);
  if (new Set(asked).size !== asked.length) fail(`${REPLIES}: a question is answered twice`);
  return replies;
};

const faqState = () => (existsSync(FAQ) ? { bytes: readFileSync(FAQ).length, hash: fingerprint(FAQ) } : null);

const mode = process.argv[2];

if (mode === "answer") {
  const replies = readReplies();
  const quoted = replies.flatMap((reply) => quotationProblems(JSON.stringify(reply.question), reply.citations ?? [], documentSource(documents)));
  if (quoted.length > 0) fail(quoted.join("\n"));
  if (!existsSync(REPLIES_PAGE)) fail(`${REPLIES_PAGE} is missing: the replies for the person to read`);
  const page = readFileSync(REPLIES_PAGE, "utf8");
  const absent = questions.filter((question) => !page.includes(question));
  if (absent.length > 0) fail(`${REPLIES_PAGE} does not show: ${absent.join(" / ")}`);
  writeFileSync(RECORDED, JSON.stringify({ documents: Object.fromEntries(documents.map((file) => [file, fingerprint(file)])), faq: faqState() }));
  console.log(`${replies.length} repl(ies): ${replies.filter((reply) => reply.found).length} found in the documents`);
} else if (mode === "keep") {
  const recorded = readJson(RECORDED, "what the answer step recorded");
  const readThen = recorded?.documents;
  if (typeof readThen !== "object" || readThen === null || Array.isArray(readThen))
    fail(`${RECORDED} is not what the answer step records: run the answer check again`);
  if (JSON.stringify(Object.keys(readThen).sort()) !== JSON.stringify([...documents].sort()))
    fail(`the documents named now are not the ones that were read (${Object.keys(readThen).join(", ")}): run the answer check again`);
  const changed = documents.filter((file) => readThen[file] !== fingerprint(file));
  if (changed.length > 0) fail(`changed since they were read — the documents must stay as they are: ${changed.join(", ")}`);
  const before = recorded.faq ?? null;
  if (answers?.keep === KEEP) {
    if (!existsSync(FAQ)) fail(`${FAQ} is missing`);
    const now = readFileSync(FAQ);
    if (before !== null && digest(now.subarray(0, before.bytes)) !== before.hash) fail(`${FAQ}: what it held before must stay as it was; add after it`);
    const text = now.toString("utf8");
    const absent = questions.filter((question) => !text.includes(question));
    if (absent.length > 0) fail(`${FAQ} does not hold: ${absent.join(" / ")}`);
  } else if (JSON.stringify(faqState()) !== JSON.stringify(before)) {
    fail(`${FAQ} changed, but the person chose not to keep the answers`);
  }
  console.log("the documents are untouched");
} else {
  fail(`usage: replies.mjs answer | keep (got ${JSON.stringify(mode)})`);
}
