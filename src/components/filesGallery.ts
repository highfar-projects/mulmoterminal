// A folder as a gallery (#3079): which of its files are drawn, in what order, and how ← and → move
// through them. Pure, so what a folder shows is checkable without a pane.
import { rawContentType } from "../../common/rawContentType";
import { fileMediaKind, type FileMediaKind } from "./filePreviewKind";
import type { ListingEntry } from "./filesTreeCache";

export interface GalleryItem {
  pathRel: string;
  name: string;
  kind: FileMediaKind;
}

/** Tiles drawn before "Show more": a folder of hundreds of videos would otherwise ask the server
 *  for every one of them at once. */
export const GALLERY_PAGE_SIZE = 60;

/** How a file is drawn in a gallery, or null when it is not. An SVG is a picture here: an <img>
 *  never runs its scripts, which is why the pane's own SVG Preview can be one too. */
export function galleryKind(name: string): FileMediaKind | null {
  return fileMediaKind(name) ?? (rawContentType(name) === "image/svg+xml" ? "image" : null);
}

const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The folder's own files that a gallery draws, in name order with numbers counted as numbers
 *  (`2.png` before `10.png`), as a file manager lists them. Subfolders are not looked into. */
export function galleryItems(entries: readonly ListingEntry[], dirRel: string): GalleryItem[] {
  return entries
    .filter((entry) => !entry.dir)
    .flatMap((entry): GalleryItem[] => {
      const kind = galleryKind(entry.name);
      return kind ? [{ pathRel: dirRel ? `${dirRel}/${entry.name}` : entry.name, name: entry.name, kind }] : [];
    })
    .sort((a, b) => byName.compare(a.name, b.name));
}

/** The item `step` away from `index`, going round at the ends. */
export function steppedIndex(index: number, step: 1 | -1, length: number): number {
  if (length <= 0) return 0;
  return (((index + step) % length) + length) % length;
}

/** What a tree operation does to an open gallery of `dir`. A rename or Trash of the folder, or of one
 *  above it, `recheck`s: the folder is read again and the gallery closes if it is gone, since its tiles
 *  would all point at nothing — and stays if the rename was cancelled or refused. A change among its
 *  own files reads it again; anything elsewhere leaves it be. */
export type GalleryAfterOp = "recheck" | "refresh" | "keep";

export type TreeOp = { id: "new-file" | "new-folder"; dirRel: string } | { id: "rename" | "trash"; pathRel: string };

const parentOf = (pathRel: string): string => pathRel.slice(0, Math.max(0, pathRel.lastIndexOf("/")));
const isAtOrAbove = (pathRel: string, dir: string): boolean => dir === pathRel || dir.startsWith(`${pathRel}/`);

export function galleryAfterTreeOp(dir: string, op: TreeOp): GalleryAfterOp {
  if ("dirRel" in op) return op.dirRel === dir ? "refresh" : "keep";
  if (isAtOrAbove(op.pathRel, dir)) return "recheck";
  return parentOf(op.pathRel) === dir ? "refresh" : "keep";
}
