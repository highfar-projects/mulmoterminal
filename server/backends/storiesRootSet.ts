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
 * The directories to register, in order. The FIRST entry is the workspace and is kept whatever
 * else is true of it — the caller's own launch directory, which the plugin's default stories
 * directory already hangs off, and which the browser reads as "the root addressed without an id".
 * Dropping it would silently promote a saved preset into that position.
 *
 * Every OTHER entry has to be a directory that is there: a preset for a repository since deleted
 * would otherwise register a root the plugin resolves against nothing.
 *
 * Deduplicated by RESOLVED path rather than by string: `cwdPresets` holds a directory as the user
 * saved it, and the workspace arrives as the launcher spelled it, so the same directory reaches
 * here twice under two spellings. (The caller dedupes again by REALPATH, which is the key the ids
 * come from — a symlinked preset passes this check and collapses there.)
 */
export function uniqueRootPaths(dirs: readonly string[], exists: (dir: string) => boolean = isDirectory): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  dirs.forEach((dir, at) => {
    if (kept.length >= MAX_ROOTS) return;
    const trimmed = dir.trim();
    if (trimmed === "") return;
    const resolved = path.resolve(trimmed);
    if (seen.has(resolved)) return;
    if (at > 0 && !exists(trimmed)) return;
    seen.add(resolved);
    kept.push(trimmed);
  });
  return kept;
}
