// WHICH directories become stories roots (#1951). Pure, and its own file, because the whole of the
// containment decision is here: what the plugin may serve from is exactly what this returns.
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/** `cwdPresets` is capped at 50 and the workspace is one more. The ceiling is for a hand-edited
 *  config, not for anything the app produces. */
export const MAX_ROOTS = 64;

/** Whether a saved directory is still a directory. A preset for a repository that has since been
 *  deleted must register nothing: the plugin resolves against the path, and a root that is not
 *  there answers every request under it with an error the user cannot act on. */
export const isDirectory = (dir: string): boolean => {
  try {
    return existsSync(dir) && statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The directories to register, in order, with the first one — the workspace — kept first.
 *
 * Deduplicated by RESOLVED path rather than by string: `cwdPresets` holds a directory as the user
 * saved it, and the workspace arrives as the launcher spelled it, so the same directory reaches
 * here twice under two spellings. Registering it twice is not a cosmetic problem — the plugin
 * throws on a duplicate id, and the ids come from the resolved path.
 */
export function uniqueRootPaths(dirs: readonly string[], exists: (dir: string) => boolean = isDirectory): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const dir of dirs) {
    if (kept.length >= MAX_ROOTS) break;
    const trimmed = dir.trim();
    if (trimmed === "") continue;
    const resolved = path.resolve(trimmed);
    if (seen.has(resolved) || !exists(trimmed)) continue;
    seen.add(resolved);
    kept.push(trimmed);
  }
  return kept;
}
