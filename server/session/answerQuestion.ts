import { keysForAnswers, openQuestionOf, type RecordedCall } from "../../common/askQuestion.js";

// Answering a live AskUserQuestion dialog, from whichever client asked (#1685).
//
// The rule that makes this safe, and the reason it is one function rather than a route: **the
// bytes written to the PTY are never the caller's**. A client sends the option indexes it chose;
// keysForAnswers turns those into keystrokes, and it refuses picks that do not fit the questions.
// So a phone — or anything else reaching the host — cannot deliver a control byte by asking for
// one. That is #781's trust boundary, drawn tighter.
//
// Checking and writing belong together for the same reason they are atomic here: between "is this
// dialog still open" and the first keystroke, the user may have answered it in the terminal, and
// keys aimed at a dialog that has closed reach the prompt underneath — where an arrow walks the
// input history and Enter submits what it found.

/** Why an answer did not go out. Each is a different thing to tell the user. */
export type AnswerFailure =
  /** The dialog was answered (in the terminal, or by another client) before this arrived. */
  | "closed"
  /** picks do not fit the questions — wrong count, out of range, or not ascending. */
  | "bad-picks"
  /** No PTY in this process to type into: the session outlived a server restart. */
  | "unwritable";

export type AnswerResult = { ok: true } | { ok: false; reason: AnswerFailure };

// One answer at a time per session, held across the check AND the whole key sequence.
//
// The check and the typing are only atomic together. Two clients — the pane and the phone, which
// is the pair this change exists to create — can both read the dialog as `running`, and their
// paced keystrokes then interleave: the first stream commits the dialog and the second's leftovers
// land at the prompt underneath, where an arrow reaches the input history and Enter runs it. That
// is the outcome the toolUseId check was meant to prevent, so the check alone is not enough.
//
// In-process is the right scope: the PTY table it writes to is this process's.
const answering = new Set<string>();

export interface AnswerQuestionDeps {
  /** The session's recorded tool calls — what openQuestionOf reads the live dialog out of. */
  callsOf: (sessionId: string) => Promise<readonly RecordedCall[]>;
  /** Write to the session's live PTY. False when this process holds none. */
  write: (sessionId: string, chunk: string) => boolean;
  /** Between keystrokes: the dialog rebuilds itself between questions (#1679). */
  pause: (ms: number) => Promise<void>;
  gapMs: number;
}

export interface AnswerQuestionRequest {
  sessionId: string;
  /** The dialog the caller believes it is answering. Stale ids are refused, never guessed at. */
  toolUseId: string;
  /** Chosen option indexes, one entry per question. */
  picks: readonly (readonly number[])[];
}

const sendPaced = async (deps: AnswerQuestionDeps, sessionId: string, keys: readonly string[]): Promise<boolean> =>
  keys.reduce(async (previous, key) => {
    if (!(await previous)) return false;
    await deps.pause(deps.gapMs);
    return deps.write(sessionId, key);
  }, Promise.resolve(true));

const answerHeld = async (deps: AnswerQuestionDeps, { sessionId, toolUseId, picks }: AnswerQuestionRequest): Promise<AnswerResult> => {
  const open = openQuestionOf(await deps.callsOf(sessionId), sessionId);
  if (open?.toolUseId !== toolUseId) return { ok: false, reason: "closed" };
  const keys = keysForAnswers(open.questions, picks);
  if (!keys) return { ok: false, reason: "bad-picks" };
  // The questions come from the HOST's own record of the dialog, not from the request: a caller
  // cannot widen its picks by describing a different question than the one on screen.
  return (await sendPaced(deps, sessionId, keys)) ? { ok: true } : { ok: false, reason: "unwritable" };
};

export async function answerQuestion(deps: AnswerQuestionDeps, request: AnswerQuestionRequest): Promise<AnswerResult> {
  // The loser is told `closed` rather than "busy": from its side the dialog IS about to be gone,
  // and that is the one outcome a client already knows to treat as ordinary rather than an error.
  if (answering.has(request.sessionId)) return { ok: false, reason: "closed" };
  answering.add(request.sessionId);
  try {
    return await answerHeld(deps, request);
  } finally {
    answering.delete(request.sessionId);
  }
}
