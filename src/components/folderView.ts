// The folder shown in the Files pane's empty file area (#3120): which folders are read for it, in
// what order their groups come, and what a list or a gallery draws of them. Pure, so a folder's view
// is checkable without a pane or a server.
import { galleryItems, type GalleryItem, type TreeOp } from "./filesGallery";
import type { ListingEntry } from "./filesTreeCache";

/** How far below the shown folder "Include subfolders" reads. */
export const FOLDER_VIEW_MAX_DEPTH = 2;
/** Folders read for one view, the shown one included: a wide tree would otherwise ask the server
 *  for hundreds of listings at once. */
export const FOLDER_VIEW_MAX_DIRS = 40;

export type FolderViewMode = "list" | "gallery";
export const FOLDER_VIEW_MODES: readonly FolderViewMode[] = ["list", "gallery"];

/** One folder's listing; `dirRel` is relative to the pane's root, like every path in the pane. */
export interface FolderGroup {
  dirRel: string;
  entries: ListingEntry[];
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const joinRel = (dirRel: string, name: string): string => (dirRel ? `${dirRel}/${name}` : name);

/** Read for the pictures in them, these are never worth a slot of the cap: a dot-folder is tooling
 *  (`.git` alone can hold thousands of folders) and `node_modules` is someone else's code. */
export const isDescended = (name: string): boolean => !name.startsWith(".") && name !== "node_modules";

/** The subfolders of `group` to read next, `depth` being how far below the shown folder it is.
 *  None past the depth limit, and no more than `room` — what the cap has left. */
export function subfoldersToRead(group: FolderGroup, depth: number, room: number): string[] {
  if (depth >= FOLDER_VIEW_MAX_DEPTH || room <= 0) return [];
  return group.entries
    .filter((entry) => entry.dir && isDescended(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => byName.compare(a, b))
    .slice(0, room)
    .map((name) => joinRel(group.dirRel, name));
}

/** Path order, segment by segment: `a`, `a/b`, `a/c`, `a10`, as a tree reads top to bottom. The
 *  shown folder (the shortest prefix of the others) comes first. */
export function compareDirRel(a: string, b: string): number {
  const left = a ? a.split("/") : [];
  const right = b ? b.split("/") : [];
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index++) {
    const order = byName.compare(left[index] ?? "", right[index] ?? "");
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

export const orderedGroups = (groups: readonly FolderGroup[]): FolderGroup[] => [...groups].sort((a, b) => compareDirRel(a.dirRel, b.dirRel));

/** A group's heading: its path below the shown folder, or null for the shown folder itself. */
export function groupHeading(shownDir: string, dirRel: string): string | null {
  if (dirRel === shownDir) return null;
  return shownDir ? dirRel.slice(shownDir.length + 1) : dirRel;
}

/** A listing as the list draws it: folders first, then files, each in name order. */
const listOrder = (a: ListingEntry, b: ListingEntry): number => {
  if (a.dir !== b.dir) return a.dir ? -1 : 1;
  return byName.compare(a.name, b.name);
};
export const listRows = (entries: readonly ListingEntry[]): ListingEntry[] => [...entries].sort(listOrder);

/** Every group's gallery items, in group order — the order ← and → walk. */
export const folderGalleryItems = (groups: readonly FolderGroup[]): GalleryItem[] => groups.flatMap((group) => galleryItems(group.entries, group.dirRel));

export const parentOf = (pathRel: string): string => pathRel.slice(0, Math.max(0, pathRel.lastIndexOf("/")));
const isAtOrAbove = (pathRel: string, dir: string): boolean => dir === pathRel || dir.startsWith(`${pathRel}/`);
const isWithin = (pathRel: string, dir: string): boolean => dir === "" || pathRel === dir || pathRel.startsWith(`${dir}/`);

/** What a tree operation does to the folder on show. Renaming or trashing it, or a folder above it,
 *  `recheck`s — it may be gone. A change anywhere inside it reads it again, since a subfolder group
 *  may be drawing what changed. Anything elsewhere leaves it be. */
export function folderAfterTreeOp(dir: string, op: TreeOp): "recheck" | "refresh" | "keep" {
  if ("dirRel" in op) return isWithin(op.dirRel, dir) ? "refresh" : "keep";
  if (dir !== "" && isAtOrAbove(op.pathRel, dir)) return "recheck";
  return isWithin(parentOf(op.pathRel), dir) ? "refresh" : "keep";
}

/** What a folder view's header calls the folder: its own name, or the root's for the root. */
export function folderTitle(cwd: string | null, dirRel: string): string {
  return dirRel.split("/").pop() || cwd?.split(/[\\/]/).filter(Boolean).pop() || ".";
}

export const parseFolderViewMode = (raw: string | null): FolderViewMode => (raw === "gallery" ? "gallery" : "list");

const BYTES_PER_UNIT = 1024;
const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
/** Below this, a size keeps one decimal (`1.5 MB`); at or above it, none (`15 MB`). */
const ONE_DECIMAL_BELOW = 10;

/** Bytes as a file manager shows them. A value that is not a byte count shows as 0 B. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < BYTES_PER_UNIT) return `${Number.isFinite(bytes) && bytes > 0 ? Math.trunc(bytes) : 0} B`;
  const power = Math.min(SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)));
  const value = bytes / BYTES_PER_UNIT ** power;
  return `${value < ONE_DECIMAL_BELOW ? value.toFixed(1) : Math.round(value)} ${SIZE_UNITS[power]}`;
}

export interface HeadedItem {
  item: GalleryItem;
  index: number;
  /** Set on the first item of each subfolder's run, which a heading is drawn above. */
  heading: string | null;
}

/** Gallery items with the heading each subfolder's run starts with, the shown folder's own run
 *  having none. `index` is the item's place in the whole list, which is what ← and → step through. */
export function withGroupHeadings(items: readonly GalleryItem[], shownDir: string): HeadedItem[] {
  return items.map((item, index) => {
    const dirRel = parentOf(item.pathRel);
    const startsRun = index === 0 || parentOf(items[index - 1]?.pathRel ?? "") !== dirRel;
    return { item, index, heading: startsRun ? groupHeading(shownDir, dirRel) : null };
  });
}
