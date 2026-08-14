import { answerQuestion } from "./answerQuestion.js";
import type { AnswerResult } from "../../common/askQuestion.js";
import { otherWriteCount, writeAnswerKey } from "./write-to-session.js";
import { isUnknownArray } from "../../common/isUnknownArray.js";
import { sanitizeTerminalInput } from "../backends/remoteHost/terminalInput.js";

// Between the keystrokes that answer a dialog: it rebuilds itself between questions, so a burst
// written in one go risks arriving while it does (measured in #1679).
const QUESTION_KEY_GAP_MS = 30;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The picks as they arrive from a client, read rather than trusted. Only the SHAPE is decided
// here — whether the indexes fit the dialog is keysForAnswers' call, made against the questions
// the host itself recorded. A body that is not this shape is refused as bad-picks rather than
// coerced, because a coerced pick is a keystroke aimed at a row nobody chose.
const readPicks = (picks: unknown): number[][] | null => {
  if (!isUnknownArray(picks)) return null;
  const rows = picks.map((row) => (isUnknownArray(row) && row.every((idx) => typeof idx === "number") ? row.filter((idx) => typeof idx === "number") : null));
  return rows.some((row) => row === null) ? null : rows.filter((row) => row !== null);
};

/**
 * Answer a session's live AskUserQuestion dialog with the host's own PTY and tool-call history.
 * Every client goes through here — the pane beside the terminal, and the phone — so the check and
 * the keystrokes have one implementation between them.
 */
export async function answerQuestionOnHost(sessionId: string, toolUseId: string, picks: unknown, callsOf: CallsOf, text?: unknown): Promise<AnswerResult> {
  const deps = { callsOf, write: writeAnswerKey, otherWriteCount, pause, gapMs: QUESTION_KEY_GAP_MS };
  // Words rather than indexes (#1693). The ONE thing a client sends that is not a number, so it is
  // sanitized to printable text first — the same rule the phone's typing has followed since #445.
  // Without it a caller could put an ESC or a bracketed-paste terminator into somebody's terminal.
  if (typeof text === "string") {
    const clean = sanitizeTerminalInput(text);
    if (!clean) return { ok: false, reason: "bad-picks" };
    return answerQuestion(deps, { sessionId, toolUseId, text: clean });
  }
  const chosen = readPicks(picks);
  if (!chosen) return { ok: false, reason: "bad-picks" };
  return answerQuestion(deps, { sessionId, toolUseId, picks: chosen });
}

/** The session's recorded tool calls — injected so this module holds no store of its own. */
export type CallsOf = Parameters<typeof answerQuestion>[0]["callsOf"];
