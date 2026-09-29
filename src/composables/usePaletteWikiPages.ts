// The palette's side of the Wiki rows (#2503): read the index each time the palette opens, so a
// page written since is there. A failed read lists no pages rather than holding up the palette.
import { ref } from "vue";
import { fetchWikiIndex } from "../wikiApi";
import { paletteWikiPages, type PaletteWikiPage } from "./paletteWikiPages";

export function usePaletteWikiPages() {
  const pages = ref<PaletteWikiPage[]>([]);
  void (async () => {
    try {
      pages.value = paletteWikiPages((await fetchWikiIndex()).entries);
    } catch {
      pages.value = [];
    }
  })();
  return { pages };
}
