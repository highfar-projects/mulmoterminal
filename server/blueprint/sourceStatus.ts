// Holds the copy a build started from against the same source taken again now. Pure: the caller reads source.json and
// takes the snapshot.
import { z } from "zod";
import type { SourceStatus } from "../../common/blueprint/sourceStatus.js";
import type { Snapshot } from "./collectionSnapshot.js";

const storedSourceSchema = z.object({ source: z.string().min(1), records: z.boolean(), takenAt: z.string(), fingerprint: z.string().min(1) });
export type StoredSource = z.infer<typeof storedSourceSchema>;

/** What source.json says was copied, or null when there is none, or it is not one this can take again. */
export function storedSource(text: string | null): StoredSource | null {
  if (text === null) return null;
  try {
    const parsed = storedSourceSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function compareSource(stored: StoredSource, retaken: Snapshot): SourceStatus {
  if (retaken.kind !== "ok") return { status: "unreadable", reason: retaken.kind };
  return retaken.fingerprint === stored.fingerprint ? { status: "same" } : { status: "changed", takenAt: stored.takenAt };
}
