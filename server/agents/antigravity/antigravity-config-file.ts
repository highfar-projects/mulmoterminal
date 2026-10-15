// Reading and writing the JSON files this server merges into agy's `.agents/` dir (skills.json,
// hooks.json). Both are shared with the user and with every agy session in the directory.
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { writeFileAtomicSync } from "../../files/atomic-write.js";
import { excludeFromGit } from "../git-exclude.js";

/** The parsed file: `{}` when absent, null when present but not JSON — someone else's file, and
 *  rewriting it would lose it. */
export function readAntigravityConfig(file: string): unknown {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** The rename replaces the file, so an existing one's mode (a user's 0600, say) is given to the
 *  temp — otherwise the umask decides it. Created with it, so a narrower mode holds even if the
 *  chmod (which only restores bits the umask stripped) fails. */
function keepingModeOf(file: string): (tmp: string, data: string) => void {
  const mode = existsSync(file) ? statSync(file).mode & 0o7777 : undefined;
  return (tmp, data) => {
    writeFileSync(tmp, data, { mode });
    if (mode === undefined) return;
    try {
      chmodSync(tmp, mode);
    } catch {
      // Best effort: the creation mode above already kept it from widening.
    }
  };
}

/** Write the merged file and keep it out of the user's `git status` (git-exclude.ts). Atomic,
 *  because agy re-reads these files on every turn and a running session must never see a
 *  truncated one — one malformed hooks.json entry drops the user's hooks along with ours. Quiet on
 *  failure: a read-only project is a reason for agy to go without, not for the cell to fail. */
export function writeAntigravityConfig(cwd: string, file: string, config: Record<string, unknown>, excludeEntry: string): void {
  try {
    writeFileAtomicSync(file, JSON.stringify(config, null, 2) + "\n", keepingModeOf(file));
    excludeFromGit(cwd, excludeEntry);
  } catch (err) {
    console.warn(`[antigravity] could not write ${file}: ${err}`);
  }
}
