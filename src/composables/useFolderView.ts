// The folder the Files pane shows while no file is open (#3120), and the listings read for it. A
// folder is only read while it is seen: a tree click with a file open is remembered, and costs a
// request when the last tab closes.
import { ref, watch } from "vue";
import {
  FOLDER_VIEW_MAX_DIRS,
  folderAfterTreeOp,
  orderedGroups,
  parseFolderViewMode,
  subfoldersToRead,
  type FolderGroup,
  type FolderViewMode,
} from "../components/folderView";
import type { TreeOp } from "../components/filesGallery";
import { fetchListing } from "./useFilesTree";

const MODE_KEY = "mulmoterminal.files.folderViewMode";

function rememberedMode(): FolderViewMode {
  try {
    return parseFolderViewMode(localStorage.getItem(MODE_KEY));
  } catch {
    return "list";
  }
}

function rememberMode(mode: FolderViewMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // A browser that refuses storage still switches; it just will not remember.
  }
}

/** The listings of `level`'s subfolders, `depth` below the shown folder, added to `groups` — then
 *  theirs, a level at a time, until the depth limit or the cap. */
async function readBelow(cwd: string | null, level: FolderGroup[], depth: number, groups: FolderGroup[]): Promise<void> {
  const room = FOLDER_VIEW_MAX_DIRS - groups.length;
  const next = level.flatMap((group) => subfoldersToRead(group, depth, room)).slice(0, Math.max(0, room));
  if (next.length === 0) return;
  // A subfolder that cannot be read is left out rather than failing the folder the user asked for.
  const read = await Promise.all(next.map(async (dirRel) => ({ dirRel, entries: await fetchListing(cwd, dirRel).catch(() => null) })));
  const readable = read.flatMap(({ dirRel, entries }) => (entries ? [{ dirRel, entries }] : []));
  groups.push(...readable);
  await readBelow(cwd, readable, depth + 1, groups);
}

async function readGroups(cwd: string | null, dirRel: string, withSubfolders: boolean): Promise<FolderGroup[]> {
  const groups: FolderGroup[] = [{ dirRel, entries: await fetchListing(cwd, dirRel) }];
  if (withSubfolders) await readBelow(cwd, groups.slice(), 0, groups);
  return orderedGroups(groups);
}

export function useFolderView(cwd: () => string | null, visible: () => boolean) {
  const dir = ref("");
  const withSubfolders = ref(false);
  const mode = ref<FolderViewMode>(rememberedMode());
  /** null while the folder is being read, or when it has not been read since it last changed. */
  const groups = ref<FolderGroup[] | null>(null);
  const error = ref<string | null>(null);
  let generation = 0;

  async function load(): Promise<void> {
    const mine = ++generation;
    const asked = dir.value;
    groups.value = null;
    error.value = null;
    try {
      const read = await readGroups(cwd(), asked, withSubfolders.value);
      if (mine === generation) groups.value = read;
    } catch (e) {
      if (mine === generation) error.value = `${asked || "."}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /** Read again if it is seen; otherwise forget what was read, so it is read when it is. */
  function reload(): void {
    if (visible()) void load();
    else {
      generation++;
      groups.value = null;
      error.value = null;
    }
  }

  const show = (dirRel: string): void => {
    dir.value = dirRel;
  };

  function setMode(next: FolderViewMode): void {
    mode.value = next;
    rememberMode(next);
  }

  /** A tree operation that landed. A folder that may be gone is read again at once, seen or not, and
   *  if it is gone the view falls back to the root rather than keeping an error for later. */
  async function afterTreeOp(op: TreeOp): Promise<void> {
    const next = folderAfterTreeOp(dir.value, op);
    if (next === "keep") return;
    if (next === "refresh") return reload();
    const shown = dir.value;
    await load();
    if (error.value !== null && dir.value === shown) dir.value = "";
  }

  /** A re-root: the folder on show is relative to a root the pane has left. Called by the pane's own
   *  teardown rather than from a watch on `cwd`, which the pane never reacts to by itself. */
  function reset(): void {
    if (dir.value === "") reload();
    else dir.value = "";
  }

  watch([dir, withSubfolders], reload);
  watch(visible, (seen) => {
    if (seen && groups.value === null && error.value === null) void load();
  });
  if (visible()) void load();

  return { dir, withSubfolders, mode, groups, error, show, setMode, afterTreeOp, reset };
}
