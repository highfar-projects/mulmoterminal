// ~/.mulmoterminal/remote-host.json: this machine's channel, decided once (#3092).
// Deleting it makes the next connect decide again, which is the documented way to
// move a machine off a channel it shares with another.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { hasErrnoCode } from "../../errors.js";
import { writeFileAtomic } from "../../files/atomic-write.js";
import { mulmoterminalHome } from "../../infra/fs/mulmoterminal-home.js";
import type { HostIdentity } from "./hostIdentity.js";

export const hostIdentityFile = (): string => path.join(mulmoterminalHome(), "remote-host.json");

// A record is four short strings; anything far larger is not one.
const MAX_IDENTITY_FILE_BYTES = 64 * 1024;

// Missing: not decided yet. Any other read error (permissions, I/O) rejects, because
// deciding again would overwrite a channel this machine may still own.
const readBounded = async (file: string): Promise<string | null> => {
  try {
    const { size } = await stat(file);
    if (size > MAX_IDENTITY_FILE_BYTES) {
      console.warn(`[remote-host] ignoring ${file}: ${size} bytes is not a host identity`);
      return null;
    }
    return await readFile(file, "utf-8");
  } catch (error) {
    if (hasErrnoCode(error) && error.code === "ENOENT") return null;
    throw new Error(`[remote-host] cannot read ${file}`, { cause: error });
  }
};

// An oversized or unparsable file was written badly; it is reported and decided again.
export const readHostIdentityFile = async (file: string = hostIdentityFile()): Promise<unknown> => {
  const text = await readBounded(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn(`[remote-host] ignoring ${file}:`, error);
    return null;
  }
};

export const writeHostIdentityFile = (identity: HostIdentity, file: string = hostIdentityFile()): Promise<void> =>
  writeFileAtomic(file, `${JSON.stringify(identity, null, 2)}\n`);
