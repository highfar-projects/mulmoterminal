// The last version the What's new dialog was closed on. State the app keeps rather than config the
// user writes, so it sits beside the other registries in ~/.mulmoterminal rather than in config.json.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRecord } from "../../common/isRecord.js";
import { compareVersions } from "../../common/whatsNew.js";
import { withConfigLock } from "../config/config-lock.js";
import { writeFileAtomic } from "../files/atomic-write.js";
import { mulmoterminalHome } from "../infra/mulmoterminal-home.js";

const stateFile = (): string => path.join(mulmoterminalHome(), "whats-new.json");

const lastSeenOf = (raw: string): string | null => {
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) && typeof value.lastSeenVersion === "string" ? value.lastSeenVersion : null;
  } catch {
    // A corrupt file costs one extra showing of the current release, never a failed startup.
    return null;
  }
};

export async function readLastSeenVersion(): Promise<string | null> {
  const raw = await readFile(stateFile(), "utf-8").catch(() => null);
  return raw === null ? null : lastSeenOf(raw);
}

/** Claims the announcement of `version` and answers the version recorded before it.
 *
 *  Reading and recording happen under one lock, so of several tabs or browsers opening at once
 *  exactly one is answered with the older version and shows the dialog; the rest see `version`.
 *  The lock is cross-process because several checkouts on one machine share this file. The record
 *  never moves backwards, so an older server running beside a newer one cannot re-open anything. */
export async function claimSeenVersion(version: string): Promise<string | null> {
  const file = stateFile();
  return withConfigLock(file, async () => {
    const known = await readLastSeenVersion();
    if (known === null || compareVersions(known, version) < 0) {
      await writeFileAtomic(file, `${JSON.stringify({ lastSeenVersion: version }, null, 2)}\n`);
    }
    return known;
  });
}
