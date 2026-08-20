// What a cross-terminal exchange tells the CELL once it is over. The rule that decides
// whether a turn answered us lives in `common/turnCorrelation.ts`, because a server-side
// runner asks it too; this file is the part only a browser needs — the wording.

// An exchange stops for one of these; the first four are ordinary, `failed` is not.
export type ExchangeOutcome = "answered" | "stopped" | "timed-out" | "nothing-to-send" | "session-changed" | "failed";

const OUTCOME_MESSAGE: Record<Exclude<ExchangeOutcome, "answered">, string> = {
  stopped: "Stopped",
  "session-changed": "A terminal switched session — stopped",
  "timed-out": "The other terminal did not answer in time",
  "nothing-to-send": "No completed turn to send yet",
  failed: "Could not reach the other terminal",
};

// What the cell shows afterwards. A completed exchange says nothing — the answer arriving
// in the terminal is the feedback.
export const outcomeMessage = (outcome: ExchangeOutcome): string | null => (outcome === "answered" ? null : OUTCOME_MESSAGE[outcome]);
