// The filesystem half of `mobileFiles` (#2911): which files a project's declared directories hold,
// and whether a path the PHONE sent names one of them.
//
// The phone is a remote client, so the path it sends is checked from scratch on every request —
// against the declaration, not against a listing it may or may not have seen. Symlinks are never
// followed by the walk, and a requested path is contained again after realpath, so a link inside a
// declared directory cannot point the read anywhere else.
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { isExcludedSegment, isServableMobilePath, mobileFileKind, type MobileFileEntry } from "../../../common/mobileFiles.js";
import type { MobileFilesConfig } from "../../config/dir/dir-config.js";
import { isWithin } from "../../infra/path-within.js";

/** How deep under a declared directory the walk descends. */
export const MAX_WALK_DEPTH = 6;
/** How many directory entries one listing may examine before it stops and says it was truncated. */
export const MAX_WALK_ENTRIES = 5000;

const toPosix = (relative: string): string => relative.split(path.sep).join("/");

interface WalkState {
  examined: number;
  truncated: boolean;
  files: { absolute: string; declaredDir: string }[];
}

async function walkDir(declaredDir: string, dir: string, depth: number, config: MobileFilesConfig, state: WalkState): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (state.examined >= MAX_WALK_ENTRIES) {
      state.truncated = true;
      return;
    }
    state.examined += 1;
    if (isExcludedSegment(entry.name) || entry.isSymbolicLink()) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_WALK_DEPTH) await walkDir(declaredDir, absolute, depth + 1, config, state);
      continue;
    }
    if (entry.isFile() && isServableMobilePath(toPosix(path.relative(declaredDir, absolute)), config.extensions)) {
      state.files.push({ absolute, declaredDir });
    }
  }
}

async function describe(projectRoot: string, absolute: string): Promise<MobileFileEntry | null> {
  const relative = toPosix(path.relative(projectRoot, absolute));
  const kind = mobileFileKind(relative);
  if (kind === null) return null;
  try {
    const stats = await stat(absolute);
    return { path: relative, kind, bytes: stats.size, modifiedAt: stats.mtime.toISOString() };
  } catch {
    return null;
  }
}

/** Every servable file in the declared directories, newest first. */
export async function listDeclaredFiles(projectRoot: string, config: MobileFilesConfig): Promise<{ files: MobileFileEntry[]; truncated: boolean }> {
  const state: WalkState = { examined: 0, truncated: false, files: [] };
  for (const declaredDir of config.dirs) {
    await walkDir(declaredDir, declaredDir, 0, config, state);
  }
  const unique = [...new Set(state.files.map((file) => file.absolute))];
  const described = await Promise.all(unique.map((absolute) => describe(projectRoot, absolute)));
  const files = described.filter((entry): entry is MobileFileEntry => entry !== null);
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || (a.path < b.path ? -1 : 1));
  return { files, truncated: state.truncated };
}

async function containedRealFile(declaredDir: string, absolute: string): Promise<boolean> {
  try {
    const [realDir, realFile] = await Promise.all([realpath(declaredDir), realpath(absolute)]);
    if (!isWithin(realDir, realFile)) return false;
    return (await stat(realFile)).isFile();
  } catch {
    return false;
  }
}

/** The absolute path a phone-sent `requested` names, or null unless it is a servable file inside
 *  one of the declared directories — lexically AND after realpath. */
export async function resolveRequestedFile(projectRoot: string, config: MobileFilesConfig, requested: unknown): Promise<string | null> {
  if (typeof requested !== "string" || requested === "" || requested.includes("\\") || path.posix.isAbsolute(requested)) return null;
  const absolute = path.resolve(projectRoot, ...requested.split("/"));
  for (const declaredDir of config.dirs) {
    if (!isWithin(declaredDir, absolute)) continue;
    if (!isServableMobilePath(toPosix(path.relative(declaredDir, absolute)), config.extensions)) continue;
    if (await containedRealFile(declaredDir, absolute)) return absolute;
  }
  return null;
}
