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

export const NAME_TRIES = 20;

/** `name`, then `name-2`, `name-3`, … : the names a new folder may take, in the order they are tried. */
export function nameCandidates(name: string, tries: number = NAME_TRIES): string[] {
  return Array.from({ length: tries }, (_unused, index) => (index === 0 ? name : `${name}-${index + 1}`));
}
