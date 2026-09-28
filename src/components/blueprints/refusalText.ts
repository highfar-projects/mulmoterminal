import type { ApiFailure } from "../../composables/blueprintsApi";
import type { Refusal, RefusalCode } from "../../../common/blueprint/refusal";
import type { Messages } from "../../i18n/messages";

type RefusalKey = keyof Messages["blueprints"]["refusals"];
type Translate = (key: string, values: Record<string, string>) => string;

const REFUSAL_KEYS: Record<RefusalCode, RefusalKey> = {
  "not-absolute": "notAbsolute",
  "not-a-directory": "notADirectory",
  untrusted: "untrusted",
  "folder-busy": "folderBusy",
  "samples-clash": "samplesClash",
  "held-elsewhere": "heldElsewhere",
  "revision-pending": "revisionPending",
  "spec-not-at-review": "specNotAtReview",
  "message-pending": "messagePending",
  "agent-working": "agentWorking",
};

function valuesOf(refusal: Refusal): Record<string, string> {
  switch (refusal.code) {
    case "not-a-directory":
    case "untrusted":
      return { dir: refusal.dir };
    case "folder-busy":
      return { dir: refusal.dir, runId: refusal.runId };
    case "samples-clash":
      return { files: refusal.files.join(", ") };
    case "held-elsewhere":
      return { port: refusal.port };
    default:
      return {};
  }
}

/** A failed call's message in the person's language when the server said why as data; its English otherwise. */
export function failureText(t: Translate, failure: Pick<ApiFailure, "error" | "refusal">): string {
  const { refusal } = failure;
  return refusal ? t(`blueprints.refusals.${REFUSAL_KEYS[refusal.code]}`, valuesOf(refusal)) : failure.error;
}
