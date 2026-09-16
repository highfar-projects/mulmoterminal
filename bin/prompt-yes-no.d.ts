/** The three ways a yes/no question can end. "unanswered" means nobody was there — not "no". */
export type YesNoOutcome = "yes" | "no" | "unanswered";

/** `Timer` is whatever `setTimer` returns, handed back to `clearTimer` unchanged. A parameter rather
 *  than `unknown`, because `(timer: unknown) => void` rejects Node's own `clearTimeout` — the
 *  default this module uses. */
export interface AskYesNoDeps<Timer = NodeJS.Timeout> {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  deadlineMs?: number;
  setTimer?: (fire: () => void, ms: number) => Timer;
  clearTimer?: (timer: Timer) => void;
}

export declare const ANSWER_DEADLINE_MS: number;

export declare function askYesNo<Timer = NodeJS.Timeout>(question: string, deps?: AskYesNoDeps<Timer>): Promise<YesNoOutcome>;
