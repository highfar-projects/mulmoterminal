import { keysForAnswers, openQuestionOf, type AnswerResult, type RecordedCall } from "../../common/askQuestion.js";

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

// What we have already answered, until the record catches up.
//
// The lock above is released at the last keystroke, but the tool-call close arrives later — the
// terminal has to process that final Enter and Claude has to report it. Until then openQuestionOf
// still calls the dialog `running`, so a second request would pass the check and type its sequence
// into whatever the screen became. Refusing a toolUseId we have already answered closes that window
// without holding a lock for an unbounded time (nothing guarantees the close ever arrives).
//
// Held until the record moves on — which the next request for that session observes — and dropped
// with the session itself (forgetAnsweredQuestion, called from the reap paths).
//
// Neither a count nor a clock bounds it, and both were tried: a cap evicts whichever claim is
// OLDEST, which is exactly the one still waiting for its close, and a TTL releases a claim while
// the host still reports that dialog open — each reopening the window this shuts. What genuinely
// ends a claim's usefulness is the session going away, so that is what ends it. One short string
// per live session, and sessions are already bounded by the pty table.
const submitted = new Map<string, string>();

/** The session is gone; so is anything we remembered about answering its questions. */
export const forgetAnsweredQuestion = (sessionId: string): void => {
  submitted.delete(sessionId);
};

export interface AnswerQuestionDeps {
  /** The session's recorded tool calls — what openQuestionOf reads the live dialog out of. */
  callsOf: (sessionId: string) => Promise<readonly RecordedCall[]>;
  /** Write to the session's live PTY. False when this process holds none. */
  write: (sessionId: string, chunk: string) => boolean;
  /** How many times anything ELSE has typed into this session — see write-to-session.ts. */
  otherWriteCount: (sessionId: string) => number;
  /** Start / stop counting those. Held for exactly this answer, so nothing accumulates. */
  watchOtherWrites: (sessionId: string) => void;
  stopWatchingOtherWrites: (sessionId: string) => void;
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

// Abandoned the moment anything else types into this session. The lock above keeps two ANSWERS
// apart; this is what keeps an answer out of the way of the person at the keyboard, who can close
// the dialog inside one of these pauses and leave the rest of the sequence aimed at a prompt.
const sendPaced = async (deps: AnswerQuestionDeps, sessionId: string, keys: readonly string[]): Promise<AnswerResult> =>
  keys.reduce<Promise<AnswerResult>>(
    async (previous, key) => {
      const sofar = await previous;
      if (!sofar.ok) return sofar;
      await deps.pause(deps.gapMs);
      // Against ZERO, not a baseline read here: counting starts when the answer is claimed, which
      // is BEFORE the dialog is read. A keystroke during that read is one this answer must yield to
      // just as much as one between its keys — a baseline taken afterwards would fold it in and let
      // the sequence carry on into a dialog the user had already closed.
      if (deps.otherWriteCount(sessionId) !== 0) return { ok: false, reason: "closed" };
      return deps.write(sessionId, key) ? { ok: true } : { ok: false, reason: "unwritable" };
    },
    Promise.resolve<AnswerResult>({ ok: true }),
  );

const answerHeld = async (deps: AnswerQuestionDeps, { sessionId, toolUseId, picks }: AnswerQuestionRequest): Promise<AnswerResult> => {
  const open = openQuestionOf(await deps.callsOf(sessionId), sessionId);
  const openId = open?.toolUseId ?? null;
  const claimed = submitted.get(sessionId) ?? null;
  // The record has moved on to another dialog (or none): what we answered is history now.
  if (claimed !== openId) submitted.delete(sessionId);
  if (!open || openId !== toolUseId || claimed === toolUseId) return { ok: false, reason: "closed" };
  const keys = keysForAnswers(open.questions, picks);
  if (!keys) return { ok: false, reason: "bad-picks" };
  // The questions come from the HOST's own record of the dialog, not from the request: a caller
  // cannot widen its picks by describing a different question than the one on screen.
  const result = await sendPaced(deps, sessionId, keys);
  if (result.ok) submitted.set(sessionId, toolUseId);
  return result;
};

export async function answerQuestion(deps: AnswerQuestionDeps, request: AnswerQuestionRequest): Promise<AnswerResult> {
  // The loser is told `closed` rather than "busy": from its side the dialog IS about to be gone,
  // and that is the one outcome a client already knows to treat as ordinary rather than an error.
  if (answering.has(request.sessionId)) return { ok: false, reason: "closed" };
  answering.add(request.sessionId);
  // Watch from BEFORE the dialog is read: a keystroke during that read is one this answer must
  // yield to just as much as one between its own keys.
  deps.watchOtherWrites(request.sessionId);
  try {
    return await answerHeld(deps, request);
  } finally {
    deps.stopWatchingOtherWrites(request.sessionId);
    answering.delete(request.sessionId);
  }
}
