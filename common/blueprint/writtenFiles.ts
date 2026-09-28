// Which files in a build's folder the build wrote: the ones changed since it was created. The walk that
// gathers the entries lives on the server; what counts, in what order and how many, is decided here.

/** A plain file in the folder, by its path relative to it with `/` between the parts. */
export interface FolderEntry {
  readonly path: string;
  readonly mtimeMs: number;
}

export interface WrittenFiles {
  readonly files: readonly string[];
  /** More files than the list holds were written. */
  readonly more: boolean;
}

export const WRITTEN_FILES_MAX = 50;

/** A folder or file the walk does not enter or list: hidden ones (.git, .blueprint's records) and installed packages. */
export const isSkippedName = (name: string): boolean => name.startsWith(".") || name === "node_modules";

// Not localeCompare: the order must not depend on the machine's locale.
const byCodeUnit = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** The files changed at or after `sinceMs`, in path order, at most `max` of them. */
export function writtenFiles(entries: readonly FolderEntry[], sinceMs: number, max: number = WRITTEN_FILES_MAX): WrittenFiles {
  const changed = entries
    .filter((entry) => entry.mtimeMs >= sinceMs && !entry.path.split("/").some(isSkippedName))
    .map((entry) => entry.path)
    .sort(byCodeUnit);
  return { files: changed.slice(0, max), more: changed.length > max };
}
