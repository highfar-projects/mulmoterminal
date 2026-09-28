// Reads the disk and Claude Code's trust for the pure choices in newFolder.ts.
import path from "node:path";
import { stat } from "node:fs/promises";
import { nameCandidates, type Presence } from "./newFolder.js";

export async function presenceOf(dir: string): Promise<Presence> {
  const info = await stat(dir).catch(() => null);
  if (info === null) return "absent";
  return info.isDirectory() ? "folder" : "other";
}

/**
 * The first free name in the first home that exists and whose new folder Claude Code would trust; null when none.
 * Trust is asked of the new path itself, so a home inside a git repository counts only as far as the repository does.
 */
export async function suggestFolder(name: string, homes: readonly string[], isTrusted: (dir: string) => Promise<boolean>): Promise<string | null> {
  const [home, ...rest] = homes;
  if (home === undefined) return null;
  if ((await presenceOf(home)) === "folder") {
    const free = await firstFree(home, nameCandidates(name));
    if (free !== null && (await isTrusted(free))) return free;
  }
  return suggestFolder(name, rest, isTrusted);
}

async function firstFree(home: string, names: readonly string[]): Promise<string | null> {
  const [next, ...rest] = names;
  if (next === undefined) return null;
  const candidate = path.join(home, next);
  return (await presenceOf(candidate)) === "absent" ? candidate : firstFree(home, rest);
}
