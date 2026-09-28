// The small text files a build reads back from the project (its spec, a reply, a usecase's report). A path can
// come from a pack's manifest, and a pack may come from the market, so a file is read only when it is a plain
// file whose real path is inside the project: never through a link, and never one larger than asked for.
import path from "node:path";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isSkippedName, type FolderEntry } from "../../common/blueprint/writtenFiles.js";

export const PROJECT_FILE_MAX_BYTES = 1024 * 1024;

// Opened without following a link in the last component, and judged by the handle it opened: checking the
// path first and reopening it would leave a moment in which the file could be swapped for a link. The folders
// on the way (.blueprint/) are checked not to be links just before the open; Node cannot open them without
// following, so a folder swapped in the moment between that check and the open is the one gap left. The
// files read are the build's own records, written by the agent the build runs.
const NO_FOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

/** Every folder between `dir` and the file is a real folder, not a link. */
async function foldersAreReal(dir: string, relativePath: string): Promise<boolean> {
  const segments = path
    .dirname(path.normalize(relativePath))
    .split(path.sep)
    .filter((segment) => segment !== "" && segment !== ".");
  const folders = segments.map((_segment, index) => path.join(dir, ...segments.slice(0, index + 1)));
  const infos = await Promise.all(folders.map((folder) => lstat(folder).catch(() => null)));
  return infos.every((info) => info !== null && info.isDirectory());
}

/** The file's text; null when it is absent, not a plain file, or not really inside `dir`; a note when too large. */
export async function readProjectFile(dir: string, relativePath: string): Promise<string | null> {
  const file = path.join(dir, relativePath);
  const [realFile, realDir] = await Promise.all([realpath(file).catch(() => ""), realpath(dir).catch(() => "")]);
  if (realDir === "" || !realFile.startsWith(realDir + path.sep)) return null;
  if (!(await foldersAreReal(dir, relativePath))) return null;
  const handle = await open(file, NO_FOLLOW).catch(() => null);
  if (handle === null) return null;
  try {
    const info = await handle.stat();
    if (!info.isFile()) return null;
    if (info.size > PROJECT_FILE_MAX_BYTES) return `(${relativePath} is ${info.size} bytes, too large to show)`;
    return await handle.readFile("utf8");
  } finally {
    await handle.close();
  }
}

// A folder a person points a build at can be large (a checkout, a documents tree); the walk stops early
// rather than reading all of it.
export const WALK_LIMITS = { maxDepth: 6, maxEntries: 5000 };
type WalkLimits = typeof WALK_LIMITS;

/** The plain files under `dir`, not entering links, hidden folders or installed packages; bounded. */
export function listProjectFiles(dir: string, limits: WalkLimits = WALK_LIMITS): Promise<FolderEntry[]> {
  return walk(dir, [""], 0, limits.maxEntries, limits.maxDepth);
}

type Level = { seen: number; files: FolderEntry[]; folders: string[] };

// One depth at a time, so the entries budget stops the walk at the shallow files a person is likeliest to want.
async function walk(dir: string, folders: readonly string[], depth: number, budget: number, maxDepth: number): Promise<FolderEntry[]> {
  if (folders.length === 0 || budget <= 0) return [];
  const levels = await Promise.all(folders.map((folder) => readLevel(dir, folder)));
  const seen = levels.reduce((sum, level) => sum + level.seen, 0);
  const deeper = depth < maxDepth ? levels.flatMap((level) => level.folders) : [];
  return [...levels.flatMap((level) => level.files), ...(await walk(dir, deeper, depth + 1, budget - seen, maxDepth))];
}

// Dirent types come from lstat, so a link is neither a file nor a folder here and is left out.
async function readLevel(dir: string, folder: string): Promise<Level> {
  const entries = await readdir(path.join(dir, folder), { withFileTypes: true }).catch(() => []);
  const kept = entries.filter((entry) => !isSkippedName(entry.name));
  const filePaths = kept.filter((entry) => entry.isFile()).map((entry) => path.posix.join(folder, entry.name));
  const stats = await Promise.all(filePaths.map((file) => lstat(path.join(dir, file)).catch(() => null)));
  const files = filePaths.flatMap((file, index) => {
    const info = stats[index];
    return info?.isFile() ? [{ path: file, mtimeMs: info.mtimeMs }] : [];
  });
  const folders = kept.filter((entry) => entry.isDirectory()).map((entry) => path.posix.join(folder, entry.name));
  return { seen: entries.length, files, folders };
}
