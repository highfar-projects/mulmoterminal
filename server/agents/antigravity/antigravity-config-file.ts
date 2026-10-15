// Reading and writing the JSON files this server merges into agy's `.agents/` dir (skills.json,
// hooks.json). Both are shared with the user and with every agy session in the directory.
import { existsSync, readFileSync } from "node:fs";
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

/** Write the merged file and keep it out of the user's `git status` (git-exclude.ts). Atomic,
 *  because agy re-reads these files on every turn and a running session must never see a
 *  truncated one — one malformed hooks.json entry drops the user's hooks along with ours. Quiet on
 *  failure: a read-only project is a reason for agy to go without, not for the cell to fail. */
export function writeAntigravityConfig(cwd: string, file: string, config: Record<string, unknown>, excludeEntry: string): void {
  try {
    writeFileAtomicSync(file, JSON.stringify(config, null, 2) + "\n");
    excludeFromGit(cwd, excludeEntry);
  } catch (err) {
    console.warn(`[antigravity] could not write ${file}: ${err}`);
  }
}
