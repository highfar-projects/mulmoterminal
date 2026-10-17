// The folder a Files pane is showing as a gallery (#3079), and what is in it. One folder at a time;
// opening another, or closing, drops a listing still on its way.
import { ref } from "vue";
import { galleryItems, type GalleryItem } from "../components/filesGallery";
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

  return { dir, items, error, open, close };
}
