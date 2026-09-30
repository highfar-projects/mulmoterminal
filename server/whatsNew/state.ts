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

/** Records `version` unless a newer one is already recorded — a tab left open on an old server
 *  must not re-open everything a newer server has already shown. Locked across processes because
 *  several checkouts on one machine share this file, and an unlocked read-compare-write lets the
 *  older version land last. */
export async function recordSeenVersion(version: string): Promise<void> {
  const file = stateFile();
  await withConfigLock(file, async () => {
    const known = await readLastSeenVersion();
    if (known !== null && compareVersions(known, version) >= 0) return;
    await writeFileAtomic(file, `${JSON.stringify({ lastSeenVersion: version }, null, 2)}\n`);
  });
}
