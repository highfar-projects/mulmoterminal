// ~/.mulmoterminal/remote-host.json: this machine's channel, decided once (#3092).
// Deleting it makes the next connect decide again, which is the documented way to
// move a machine off a channel it shares with another.
import { readFile } from "node:fs/promises";
import path from "node:path";

import { hasErrnoCode } from "../../errors.js";
import { writeFileAtomic } from "../../files/atomic-write.js";
import { mulmoterminalHome } from "../../infra/fs/mulmoterminal-home.js";
import type { HostIdentity } from "./hostIdentity.js";

export const hostIdentityFile = (): string => path.join(mulmoterminalHome(), "remote-host.json");

// A missing file is a machine that has not decided yet. An unreadable or unparsable
// one is reported and treated the same way, so the next connect writes a good one.
export const readHostIdentityFile = async (file: string = hostIdentityFile()): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch (error) {
    if (!(hasErrnoCode(error) && error.code === "ENOENT")) console.warn(`[remote-host] ignoring ${file}:`, error);
    return null;
  }
};

export const writeHostIdentityFile = (identity: HostIdentity, file: string = hostIdentityFile()): Promise<void> =>
  writeFileAtomic(file, `${JSON.stringify(identity, null, 2)}\n`);
