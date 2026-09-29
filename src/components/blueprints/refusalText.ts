import type { ApiFailure } from "../../composables/blueprintsApi";
import type { Refusal, RefusalCode } from "../../../common/blueprint/refusal";
import type { Messages } from "../../i18n/messages";

type RefusalKey = keyof Messages["blueprints"]["refusals"];
type Translate = (key: string, values: Record<string, string>) => string;

const REFUSAL_KEYS: Record<RefusalCode, RefusalKey> = {
  "not-absolute": "notAbsolute",
  "not-a-directory": "notADirectory",
  "record-folder-not-real": "recordFolderNotReal",
  "no-parent": "noParent",
  "folder-taken": "folderTaken",
  untrusted: "untrusted",
  "folder-busy": "folderBusy",
  "samples-clash": "samplesClash",
  "held-elsewhere": "heldElsewhere",
  "revision-pending": "revisionPending",
  "spec-not-at-review": "specNotAtReview",
  "message-pending": "messagePending",
  "agent-working": "agentWorking",
  "registry-url-not-allowed": "registryUrlNotAllowed",
  "registry-unknown": "registryUnknown",
  "pack-not-listed": "packNotListed",
  "pack-busy": "packBusy",
  "pack-not-installed": "packNotInstalled",
  "pack-builtin": "packBuiltin",
  "pack-local-repo": "packLocalRepo",
  "pack-broken": "packBroken",
  "install-failed": "installFailed",
};

function valuesOf(refusal: Refusal): Record<string, string> {
  switch (refusal.code) {
    case "not-a-directory":
    case "no-parent":
    case "folder-taken":
    case "record-folder-not-real":
      return { dir: refusal.dir };
    case "untrusted":
      return { dir: refusal.dir, trustIn: refusal.trustIn };
    case "folder-busy":
      return { dir: refusal.dir, runId: refusal.runId };
    case "samples-clash":
      return { files: refusal.files.join(", ") };
    case "held-elsewhere":
      return { port: refusal.port };
    case "registry-url-not-allowed":
      return { urls: refusal.urls.join(", ") };
    case "registry-unknown":
      return { url: refusal.url };
    case "pack-not-listed":
      return { url: refusal.url, slug: refusal.slug };
    case "pack-busy":
    case "pack-not-installed":
    case "pack-builtin":
      return { slug: refusal.slug };
    case "pack-local-repo":
      return { repo: refusal.repo };
    case "pack-broken":
    case "install-failed":
      return { detail: refusal.detail };
    default:
      return {};
  }
}

/** A failed call's message in the person's language when the server said why as data; its English otherwise. */
export function failureText(t: Translate, failure: Pick<ApiFailure, "error" | "refusal">): string {
  const { refusal } = failure;
  return refusal ? t(`blueprints.refusals.${REFUSAL_KEYS[refusal.code]}`, valuesOf(refusal)) : failure.error;
}
