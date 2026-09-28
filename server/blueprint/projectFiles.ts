// The small text files a build reads back from the project (its spec, a reply, a usecase's report). A path can
// come from a pack's manifest, and a pack may come from the market, so a file is read only when it is a plain
// file whose real path is inside the project: never through a link, and never one larger than asked for.
import path from "node:path";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";

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
