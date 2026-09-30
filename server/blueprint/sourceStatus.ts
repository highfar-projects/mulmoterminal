// Holds the copy a build started from against the same source taken again now. Pure: the caller reads source.json and
// takes the snapshot.
import { z } from "zod";
import type { SourceStatus } from "../../common/blueprint/sourceStatus.js";
import { recordsWanted, sourceQuestion, type Hearing, type HearingAnswers } from "../../common/blueprint/hearing.js";
import type { Snapshot } from "./collectionSnapshot.js";

const storedSourceSchema = z.object({ source: z.string().min(1), records: z.boolean(), takenAt: z.iso.datetime(), fingerprint: z.string().min(1) });
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

/**
 * What to take again: the source the person chose and whether its records came, from the build's own answers, which the
 * server keeps. source.json sits in a folder an agent writes, so it is believed only where it agrees with them; a copy
 * that names anything else is not compared.
 */
export function retakeTarget(stored: StoredSource, hearing: Hearing, answers: HearingAnswers): { source: string; records: boolean } | null {
  const question = sourceQuestion(hearing);
  const chosen = question === undefined ? undefined : answers[question.id];
  if (typeof chosen !== "string") return null;
  const target = { source: chosen.trim(), records: recordsWanted(hearing, answers) };
  return target.source === stored.source && target.records === stored.records ? target : null;
}

export function compareSource(stored: StoredSource, retaken: Snapshot): SourceStatus {
  if (retaken.kind !== "ok") return { status: "unreadable", reason: retaken.kind };
  return retaken.fingerprint === stored.fingerprint ? { status: "same" } : { status: "changed", takenAt: stored.takenAt };
}
