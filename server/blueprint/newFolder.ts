// Where a build may start: a folder that exists, or a new one whose parent does. And, for an example, where a new
// folder could go without the person making or trusting one first. The decisions are pure; the reads are passed in.
import path from "node:path";
import type { Refusal } from "../../common/blueprint/refusal.js";

export type Presence = "folder" | "other" | "absent";
export type FolderPlan = { ok: true; create: boolean } | { ok: false; refusal: Refusal };

/** Whether `dir` can hold a build: as it is, by being created inside its existing parent, or not at all. */
export function folderPlan(dir: string, self: Presence, parent: Presence): FolderPlan {
  if (!path.isAbsolute(dir) || path.parse(dir).root === dir) return { ok: false, refusal: { code: "not-absolute" } };
  if (self === "folder") return { ok: true, create: false };
  if (self === "other") return { ok: false, refusal: { code: "not-a-directory", dir } };
  return parent === "folder" ? { ok: true, create: true } : { ok: false, refusal: { code: "no-parent", dir: path.dirname(dir) } };
}

/** Where a new folder may go, most likely first: beside the person's recent builds (newest first), then the workspace. */
export function folderHomes(recentBuildDirs: readonly string[], workspace: string): string[] {
  return [...new Set([...recentBuildDirs.map((dir) => path.dirname(path.resolve(dir))), path.resolve(workspace)])];
}

const absoluteOnce = (dirs: readonly string[]): string[] => [...new Set(dirs.filter((dir) => path.isAbsolute(dir)).map((dir) => path.resolve(dir)))];

/**
 * The folders the form offers to pick: at most `recentMax` recent builds' first, in the order given, then the saved
 * ones; each once, absolute only. The share keeps many builds in one place from pushing every saved folder out.
 */
export function folderCandidates(recentBuildDirs: readonly string[], savedDirs: readonly string[], recentMax: number): string[] {
  return absoluteOnce([...absoluteOnce(recentBuildDirs).slice(0, recentMax), ...savedDirs]);
}

/**
 * A leading `~` as the person's home folder, as a shell would read it: `~` alone or `~` then a separator (`/`, and
 * `\\` where that is the separator). `~name` and a `~` anywhere else are left as they are, and so refused as relative.
 */
export function expandHome(input: string, home: string, separator: string = path.sep): string {
  if (input === "~") return home;
  const separators = separator === "/" ? ["/"] : ["/", separator];
  return separators.some((mark) => input.startsWith(`~${mark}`)) ? path.join(home, input.slice(2)) : input;
}

export const NAME_TRIES = 20;

/** `name`, then `name-2`, `name-3`, … : the names a new folder may take, in the order they are tried. */
export function nameCandidates(name: string, tries: number = NAME_TRIES): string[] {
  return Array.from({ length: tries }, (_unused, index) => (index === 0 ? name : `${name}-${index + 1}`));
}
