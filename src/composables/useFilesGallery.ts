// The folder a Files pane is showing as a gallery (#3079), and what is in it. One folder at a time;
// opening another, or closing, drops a listing still on its way.
import { ref, watch } from "vue";
import { galleryAfterTreeOp, galleryItems, type GalleryItem, type TreeOp } from "../components/filesGallery";
import { fetchListing } from "./useFilesTree";

export function useFilesGallery(cwd: () => string | null) {
  /** The folder on show, relative to the pane's root; null when no gallery is open. */
  const dir = ref<string | null>(null);
  const items = ref<GalleryItem[] | null>(null);
  const error = ref<string | null>(null);
  let generation = 0;

  async function open(dirRel: string): Promise<void> {
    const mine = ++generation;
    dir.value = dirRel;
    items.value = null;
    error.value = null;
    try {
      const entries = await fetchListing(cwd(), dirRel);
      if (mine === generation) items.value = galleryItems(entries, dirRel);
    } catch (e) {
      if (mine === generation) error.value = `${dirRel}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  function close(): void {
    generation++;
    dir.value = null;
    items.value = null;
    error.value = null;
  }

  /** A tree operation that landed: the gallery follows what it did to the folder on show. */
  async function afterTreeOp(op: TreeOp): Promise<void> {
    const shown = dir.value;
    if (shown === null) return;
    const next = galleryAfterTreeOp(shown, op);
    if (next === "keep") return;
    await open(shown);
    if (next === "recheck" && error.value !== null && dir.value === shown) close();
  }

  /** The tree operations' `changed` listener: `alsoOnChange` (the pane's own reaction to a change on
   *  disk), then the gallery following what the operation did to its folder. */
  const treeOpListener =
    (alsoOnChange: () => void) =>
    (op: TreeOp): void => {
      alsoOnChange();
      void afterTreeOp(op);
    };

  // A re-root: the folder on show is relative to a root the pane has left.
  watch(cwd, close);

  return { dir, items, error, open, close, afterTreeOp, treeOpListener };
}
