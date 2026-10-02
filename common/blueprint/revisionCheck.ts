// Whether a document gate may be approved: not while the last revision's files fail the check of the step that wrote
// them, since the next step would start from records that check rejects. A later revision that passes clears it.
import type { BlueprintRun } from "./run.js";

export const lastRevisionCheckFailed = (chat: BlueprintRun["specChat"]): boolean => chat.at(-1)?.outcome === "check-failed";
