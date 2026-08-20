// Which finished turn is the answer to what WE sent. Both sides ask it: the browser's
// cross-talk and round table wait for a partner cell to answer, and a server-side runner
// waits for the same thing without a tab open. One rule, one file — a second copy would
// diverge exactly where the two are supposed to agree.

export interface TurnSnapshot {
  prompt: string | null;
  reply: string | null;
}

// Enough of the sent text to identify it. Taken from the END because that is where the
// quoted excerpt sits: the opening lines are the same framing on every handoff, so a
// prefix would match the previous round's message just as well.
const CORRELATION_TAIL = 160;

const collapse = (text: string): string => text.replace(/\s+/g, " ").trim();

// Is this turn the one OUR message produced? The text we submit becomes that terminal's
// next prompt, so the prompt is the causal link — and the only thing that distinguishes
// the answer we are waiting for from a turn that was already in flight when we sent.
//
// Waiting on "any new turn" instead relays whatever the terminal happened to finish
// first, which for a busy partner is not our answer at all.
export function answersOurSend(prompt: string | null, sent: string): boolean {
  if (!prompt || !sent.trim()) return false;
  const needle = collapse(sent).slice(-CORRELATION_TAIL);
  return needle.length > 0 && collapse(prompt).includes(needle);
}

export type WaitVerdict = "answered" | "keep-waiting" | "timed-out";

// Whether to keep polling. The deadline is wall-clock rather than a poll count so a slow
// machine doesn't give up sooner than a fast one. A late answer still counts as answered:
// the terminal did reply, and relaying it beats discarding it.
export function waitVerdict(now: TurnSnapshot, sent: string, elapsedMs: number, timeoutMs: number): WaitVerdict {
  if (answersOurSend(now.prompt, sent)) return "answered";
  return elapsedMs >= timeoutMs ? "timed-out" : "keep-waiting";
}
