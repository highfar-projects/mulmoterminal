/** The three ways a yes/no question can end. "unanswered" means nobody was there — not "no". */
export type YesNoOutcome = "yes" | "no" | "unanswered";

export interface AskYesNoDeps {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  deadlineMs?: number;
  /** The timer is opaque: whatever `setTimer` returns is only ever handed back to `clearTimer`. */
  setTimer?: (fire: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

export declare const ANSWER_DEADLINE_MS: number;

export declare function askYesNo(question: string, deps?: AskYesNoDeps): Promise<YesNoOutcome>;
