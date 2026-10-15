// Records each file the Files pane opens into its directory's "recently opened" list (#3058), kept in
// this browser across reloads. A convenience: storage that is blocked or full only loses the list.
import { computed, ref, watch, type ComputedRef } from "vue";
import { parseRecentStore, recentFor, recordRecent } from "../components/filesRecent";

const RECENT_FILES_KEY = "files_recent";

function readStore(): string | null {
  try {
    return localStorage.getItem(RECENT_FILES_KEY);
  } catch {
    return null;
  }
}

function writeStore(value: string): void {
  try {
    localStorage.setItem(RECENT_FILES_KEY, value);
  } catch {
    // Storage blocked or full: the list just is not kept.
  }
}

/** `cwd` is null while the pane has no directory: nothing is recorded or listed then. */
export function useRecentFiles(cwd: () => string | null, openPath: () => string | null): { recent: ComputedRef<string[]> } {
  const store = ref(parseRecentStore(readStore()));
  // Re-read before each write: another pane, or another tab, may have recorded since this one loaded.
  watch(
    [cwd, openPath],
    ([dir, pathRel]) => {
      if (!dir || !pathRel) return;
      store.value = recordRecent(parseRecentStore(readStore()), dir, pathRel);
      writeStore(JSON.stringify(store.value));
    },
    { immediate: true },
  );
  return {
    recent: computed(() => {
      const dir = cwd();
      return dir ? recentFor(store.value, dir) : [];
    }),
  };
}
