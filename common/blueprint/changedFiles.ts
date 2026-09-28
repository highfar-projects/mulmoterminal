// Which files in a build's folder changed since the build was created: mostly what it wrote, but a person's own
// edits or another build's in the same folder show too, so the list says "changed", not "wrote". The walk that
// gathers the entries lives on the server; what counts, in what order and how many, is decided here.

/** A plain file in the folder, by its path relative to it with `/` between the parts. */
export interface FolderEntry {
  readonly path: string;
  readonly mtimeMs: number;
}

export interface ChangedFiles {
  readonly files: readonly string[];
  /** More files changed than the list holds. */
  readonly more: boolean;
}

export const CHANGED_FILES_MAX = 50;

/** A folder or file the walk does not enter or list: hidden ones (.git, .blueprint's records) and installed packages. */
export const isSkippedName = (name: string): boolean => name.startsWith(".") || name === "node_modules";

// Not localeCompare: the order must not depend on the machine's locale.
const byCodeUnit = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** The files changed at or after `sinceMs`, in path order, at most `max` of them. */
export function changedFiles(entries: readonly FolderEntry[], sinceMs: number, max: number = CHANGED_FILES_MAX): ChangedFiles {
  const changed = entries
    .filter((entry) => entry.mtimeMs >= sinceMs && !entry.path.split("/").some(isSkippedName))
    .map((entry) => entry.path)
    .sort(byCodeUnit);
  return { files: changed.slice(0, max), more: changed.length > max };
}
