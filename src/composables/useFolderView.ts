// The folder the Files pane shows while no file is open (#3120), and the listings read for it. A
// folder is only read while it is seen: a tree click with a file open is remembered, and costs a
// request when the last tab closes.
import { ref, watch, type Ref } from "vue";
import {
  FOLDER_VIEW_MAX_DIRS,
  FOLDER_VIEW_READS_AT_ONCE,
  folderAfterTreeOp,
  levelToRead,
  orderedGroups,
  parseFolderViewMode,
  type FolderGroup,
  type FolderViewMode,
} from "../components/folderView";
import type { TreeOp } from "../components/filesGallery";
import { readStored, writeStored } from "../utils/localStore";
import { fetchListing } from "./useFilesTree";

const MODE_KEY = "files_folder_view_mode";

/** A subfolder that cannot be read is left out rather than failing the folder the user asked for. */
async function readSubfolder(cwd: string | null, dirRel: string): Promise<FolderGroup[]> {
  try {
    return [{ dirRel, entries: await fetchListing(cwd, dirRel) }];
  } catch {
    return [];
  }
}

/** `dirRels` read a few at a time, stopping as soon as the view no longer `wanted` them. */
async function readInTurn(cwd: string | null, dirRels: readonly string[], wanted: () => boolean): Promise<FolderGroup[]> {
  if (dirRels.length === 0 || !wanted()) return [];
  const batch = await Promise.all(dirRels.slice(0, FOLDER_VIEW_READS_AT_ONCE).map((dirRel) => readSubfolder(cwd, dirRel)));
  return [...batch.flat(), ...(await readInTurn(cwd, dirRels.slice(FOLDER_VIEW_READS_AT_ONCE), wanted))];
}

/** The listings below `level`, `depth` below the shown folder, a level at a time until the depth
 *  limit or the cap — `room` being what the cap has left of the folders it lets be asked for. */
async function readBelow(cwd: string | null, level: FolderGroup[], depth: number, room: number, wanted: () => boolean): Promise<FolderGroup[]> {
  const dirsToRead = levelToRead(level, depth, room);
  if (dirsToRead.length === 0 || !wanted()) return [];
  const groupsRead = await readInTurn(cwd, dirsToRead, wanted);
  return [...groupsRead, ...(await readBelow(cwd, groupsRead, depth + 1, room - dirsToRead.length, wanted))];
}

async function readGroups(cwd: string | null, dirRel: string, withSubfolders: boolean, wanted: () => boolean): Promise<FolderGroup[]> {
  const shown: FolderGroup = { dirRel, entries: await fetchListing(cwd, dirRel) };
  const below = withSubfolders ? await readBelow(cwd, [shown], 0, FOLDER_VIEW_MAX_DIRS - 1, wanted) : [];
  return orderedGroups([shown, ...below]);
}

/** The listings of the folder on show, the newest read's only: an answer a later read or a re-root
 *  has overtaken is dropped, and its walk below the folder stops there too. */
function folderReads(cwd: () => string | null, dir: Ref<string>, withSubfolders: Ref<boolean>) {
  /** null while the folder is being read, or when it has not been read since it last changed. */
  const groups = ref<FolderGroup[] | null>(null);
  const error = ref<string | null>(null);
  let generation = 0;
  let reading = false;

  /** `keepShown` leaves what is on screen there until the answer replaces it, as a re-read of the same
   *  folder should; going somewhere else clears it first. */
  async function load(keepShown = false): Promise<void> {
    const mine = ++generation;
    const asked = dir.value;
    reading = true;
    if (!keepShown) groups.value = null;
    error.value = null;
    try {
      const read = await readGroups(cwd(), asked, withSubfolders.value, () => mine === generation);
      if (mine === generation) groups.value = read;
    } catch (e) {
      if (mine === generation) error.value = `${asked || "."}: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      if (mine === generation) reading = false;
    }
  }

  /** Whatever is on its way is dropped; what is on screen stays. */
  function overtake(): void {
    generation++;
    reading = false;
  }

  function forget(): void {
    overtake();
    groups.value = null;
    error.value = null;
  }

  /** Neither read nor being read, so the view needs a read once it is seen. */
  const unread = (): boolean => !reading && groups.value === null && error.value === null;

  return { groups, error, load, overtake, forget, unread, inFlight: (): boolean => reading };
}

export function useFolderView(cwd: () => string | null, visible: () => boolean) {
  const dir = ref("");
  const withSubfolders = ref(false);
  const mode = ref<FolderViewMode>(parseFolderViewMode(readStored(MODE_KEY)));
  /** Counts re-roots, so the root is read again through the watch below even when already on show. */
  const rootChanges = ref(0);
  const { groups, error, load, overtake, forget, unread, inFlight } = folderReads(cwd, dir, withSubfolders);

  /** Read again if it is seen; otherwise forget what was read, so it is read when it is. */
  function reload(keepShown = false): void {
    if (visible()) void load(keepShown);
    else forget();
  }

  const show = (dirRel: string): void => {
    dir.value = dirRel;
  };

  function setMode(next: FolderViewMode): void {
    mode.value = next;
    writeStored(MODE_KEY, next);
  }

  /** A folder renamed or trashed while the view was hidden: rechecked when it is next seen, so a hidden
   *  view spends no request on it and a gone folder still falls back to the root rather than an error. */
  let recheckWhenSeen: string | null = null;

  /** The folder a recheck is reading now, so hiding the view mid-recheck can leave it marked. */
  let rechecking: string | null = null;

  async function recheck(): Promise<void> {
    const shown = dir.value;
    recheckWhenSeen = null;
    rechecking = shown;
    await load(true);
    if (rechecking !== shown) return;
    rechecking = null;
    if (error.value !== null && dir.value === shown) dir.value = "";
  }

  /** A tree operation that landed. A folder that may be gone is read again, and if it is gone the view
   *  falls back to the root rather than keeping an error. */
  async function afterTreeOp(op: TreeOp): Promise<void> {
    const outcome = folderAfterTreeOp(dir.value, op, groups.value?.map((group) => group.dirRel) ?? null);
    if (outcome === "keep") return;
    if (outcome === "refresh") return reload(true);
    if (visible()) return recheck();
    recheckWhenSeen = dir.value;
    forget();
  }

  /** A re-root: the folder on show is relative to a root the pane has left. Called by the pane's own
   *  teardown rather than from a watch on `cwd`, which the pane never reacts to by itself. The read
   *  goes through the watch below, which Vue stops before it runs when the pane is unmounting. */
  function reset(): void {
    overtake();
    dir.value = "";
    rootChanges.value++;
  }

  // One watch for both reasons to read, so a new folder and the view coming into sight in the same
  // tick read once.
  watch([dir, withSubfolders, rootChanges, visible], ([shownDir, subfolders, roots, seen], [wasDir, wasSubfolders, wasRoots]) => {
    if (shownDir !== wasDir || subfolders !== wasSubfolders || roots !== wasRoots) {
      recheckWhenSeen = null;
      rechecking = null;
      reload();
    } else if (seen && unread()) void (recheckWhenSeen === shownDir ? recheck() : load());
    // Hidden mid-read (a file opened during a subfolder walk): the walk stops, and what was on screen
    // goes with it, since a re-read it was waiting on would otherwise never finish.
    else if (!seen && inFlight()) {
      recheckWhenSeen = rechecking ?? recheckWhenSeen;
      rechecking = null;
      forget();
    }
  });
  if (visible()) void load();

  return { dir, withSubfolders, mode, groups, error, show, setMode, afterTreeOp, reset, refresh: () => reload(true) };
}
