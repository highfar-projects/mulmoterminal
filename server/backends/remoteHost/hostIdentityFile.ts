// ~/.mulmoterminal/remote-host.json: this machine's channel, decided once (#3092).
// Deleting it makes the next connect decide again, which is the documented way to
// move a machine off a channel it shares with another.
import { open } from "node:fs/promises";
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
// Reads at most one byte past the bound, so the size is judged on what was read.
const readUpToBound = async (file: string): Promise<Buffer> => {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(MAX_IDENTITY_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const readBounded = async (file: string): Promise<string | null> => {
  try {
    const bytes = await readUpToBound(file);
    if (bytes.length > MAX_IDENTITY_FILE_BYTES) {
      console.warn(`[remote-host] ignoring ${file}: larger than ${MAX_IDENTITY_FILE_BYTES} bytes, so not a host identity`);
      return null;
    }
    return bytes.toString("utf-8");
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

export const writeHostIdentityFile = (identities: HostIdentity[], file: string = hostIdentityFile()): Promise<void> =>
  writeFileAtomic(file, `${JSON.stringify({ identities }, null, 2)}\n`);
