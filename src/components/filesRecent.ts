// The files recently opened in the Files pane, per directory (#3058). Not a file's earlier versions —
// that is the History menu (#2574) — but WHICH files were open, so one closed a moment ago can be
// found again.
//
// Pure: the composable reads and writes the string through localStorage.
import { isRecord } from "../../common/isRecord";

export interface RecentFiles {
  cwd: string;
  /** Paths relative to `cwd`, most recently opened first. */
  paths: string[];
}

export const MAX_RECENT_FILES = 30;
export const MAX_RECENT_DIRS = 20;

const asRecent = (value: unknown): RecentFiles | null => {
  if (!isRecord(value) || typeof value.cwd !== "string" || !Array.isArray(value.paths)) return null;
  const paths = [...new Set(value.paths.filter((path): path is string => typeof path === "string" && path.length > 0))];
  return { cwd: value.cwd, paths: paths.slice(0, MAX_RECENT_FILES) };
};

/** What was stored, or nothing: a value this build cannot read starts the list again rather than
 *  breaking the pane. */
export function parseRecentStore(raw: string | null): RecentFiles[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(asRecent)
          .filter((entry): entry is RecentFiles => entry !== null)
          .slice(0, MAX_RECENT_DIRS)
      : [];
  } catch {
    return [];
  }
}

/** `pathRel` moved to the front of `cwd`'s list, and `cwd` to the front of the store. */
export function recordRecent(store: readonly RecentFiles[], cwd: string, pathRel: string): RecentFiles[] {
  const before = recentFor(store, cwd).filter((path) => path !== pathRel);
  const entry = { cwd, paths: [pathRel, ...before].slice(0, MAX_RECENT_FILES) };
  return [entry, ...store.filter((other) => other.cwd !== cwd)].slice(0, MAX_RECENT_DIRS);
}

export const recentFor = (store: readonly RecentFiles[], cwd: string): string[] => store.find((entry) => entry.cwd === cwd)?.paths ?? [];
