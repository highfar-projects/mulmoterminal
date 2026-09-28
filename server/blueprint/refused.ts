// A refusal a person may meet carries it as data, so the UI can word it in their language; the message is its English.
import { englishRefusal, type Refusal } from "../../common/blueprint/refusal.js";

export class Refused extends Error {
  readonly refusal: Refusal | undefined;
  constructor(reason: string | Refusal) {
    super(typeof reason === "string" ? reason : englishRefusal(reason));
    this.refusal = typeof reason === "string" ? undefined : reason;
  }
}

export type RefusalBody = { error: string; refusal?: Refusal };

/** The JSON a refused request answers with: the English always, the refusal when there is one. */
export const refusalBody = (reason: string | Refusal): RefusalBody =>
  typeof reason === "string" ? { error: reason } : { error: englishRefusal(reason), refusal: reason };
