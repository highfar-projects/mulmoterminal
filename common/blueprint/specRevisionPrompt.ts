// The prompt for a session that changes the spec on a person's word, while the build waits at the
// spec's review gate. The conversation so far goes in whole: each message gets a fresh session, and
// it must not undo what an earlier one agreed.
import type { BlueprintRun } from "./run.js";
import { personLanguageLine, type PersonLanguage } from "./personLanguage.js";

export const SPEC_FILE = ".blueprint/spec.md";
export const OPEN_QUESTIONS_FILE = ".blueprint/open-questions.md";
// One reply file per session: a session that was given up on and writes late cannot land its words
// in the next message's reply.
export const replyFile = (sessionId: string): string => `.blueprint/reply-${sessionId}.md`;

type ChatEntry = BlueprintRun["specChat"][number];

const transcript = (chat: readonly ChatEntry[]): string[] =>
  chat.length === 0 ? [] : ["", "The conversation so far:", ...chat.map((entry) => `${entry.role === "person" ? "User" : "You"}: ${entry.text}`)];

type RevisionInput = {
  chat: readonly ChatEntry[];
  message: string;
  packDirs: { base: string; usecase: string };
  replyPath: string;
  language?: PersonLanguage | null;
  /** The files the gate asks the person to read; a document build's gate names them in place of the spec. */
  reads?: readonly string[];
  /** The files the conversation may change: what the next step reads. The reads are often views drawn from these. */
  revises?: readonly string[];
};

// A document build has no spec: its gate asks the person to read what the earlier steps wrote (the brief, the style,
// the outline), and the person's message changes those files — an answer to an open question becomes a fact there.
function documentRevisionPrompt(input: RevisionInput, reads: readonly string[], revises: readonly string[]): string {
  const views = reads.filter((read) => !revises.includes(read));
  return [
    "You are revising, with the person they are for, the files the earlier steps of a document build wrote, BEFORE the next step uses them.",
    `The person has just read: ${reads.join(", ")}. The interview answers are in .blueprint/answers.json.`,
    `Base pack: ${input.packDirs.base}. Usecase pack: ${input.packDirs.usecase}.`,
    ...personLanguageLine(input.language),
    ...transcript(input.chat),
    "",
    `The person now says: ${input.message}`,
    "",
    `1. Change ${revises.join(", ")} — the files the next step reads — to reflect it. When the person answers an open question (決まっていないこと, Open questions), write the answer where the file keeps what is decided or known, and remove the question. Keep each file's shape (its sections, or its JSON structure), so the step that wrote it still accepts it; change nothing the person did not ask for.`,
    ...(views.length > 0
      ? [
          `   ${views.join(", ")} ${views.length === 1 ? "is a view" : "are views"} drawn from those files: do not edit ${views.length === 1 ? "it" : "them"}. When you stop, the step that wrote them is checked again, which redraws ${views.length === 1 ? "it" : "them"} and says if a file no longer fits.`,
        ]
      : []),
    "2. Do not touch the documents themselves, or any other file.",
    `3. Write your reply to the person in ${input.replyPath}: in their language, short — what you changed, and anything you still need them to decide.`,
    "4. Stop.",
  ].join("\n");
}

export function specRevisionPrompt(input: RevisionInput): string {
  if (input.reads && input.reads.length > 0) return documentRevisionPrompt(input, input.reads, input.revises?.length ? input.revises : input.reads);
  return [
    "You are refining the specification of an app with its owner, BEFORE anything is built.",
    `The spec is ${SPEC_FILE}; undecided points are in ${OPEN_QUESTIONS_FILE}; the interview answers are in .blueprint/answers.json.`,
    `Base pack: ${input.packDirs.base}. Usecase pack: ${input.packDirs.usecase}.`,
    ...personLanguageLine(input.language),
    ...transcript(input.chat),
    "",
    `The user now says: ${input.message}`,
    "",
    `1. Change ${SPEC_FILE} (and ${OPEN_QUESTIONS_FILE}) to reflect it. Keep the document's structure; mark your own proposals （提案）; remove a point from the open questions once it is decided. Keep the first version small: what the user asks for, nothing more.`,
    "2. Do not build anything and do not touch any other file.",
    `3. Write your reply to the user in ${input.replyPath}: in the user's language, short — what you changed, and anything you need them to decide.`,
    "4. Stop.",
  ].join("\n");
}
