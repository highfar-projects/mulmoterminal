// The wire shape of GET /api/transcript/prompts — the prompts the user sent one session (#1748).
//
// In `common/` because both sides decide from it: the server builds the window (which log it reads
// and how it caps is its own business, in server/session/prompt-history.ts), and the pane renders
// each field. A shape kept twice is the one that drifts.

import { isRecord } from "./isRecord";

export interface PromptEntry {
  /** Epoch ms, or null when the record carried no readable time — a prompt with an odd clock is
   *  still a prompt, so the TIME is what goes missing rather than the line. */
  at: number | null;
  text: string;
}

// `text` is the row; without it there is nothing to draw. A missing or unreadable `at` is an
// ordinary case the row renders as a blank time, so it is normalised rather than rejected.
export const readPrompt = (value: unknown): PromptEntry | null => {
  if (!isRecord(value) || typeof value.text !== "string" || !value.text) return null;
  return { at: typeof value.at === "number" ? value.at : null, text: value.text };
};

export interface PromptWindow {
  /** Oldest first; the pane reverses for display. */
  prompts: PromptEntry[];
  /** Older prompts exist that this does not carry. */
  truncated: boolean;
}
