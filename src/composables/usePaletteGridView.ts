// The grid's side of the palette's view switches (#2458).
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import type { SortMode } from "../components/gridTabs";
import { paletteGridView, type PaletteGridView } from "./commandPalette";

export function usePaletteGridView(
  listMode: Ref<boolean>,
  toggleListMode: () => void,
  sortMode: () => SortMode,
  setSortMode: (mode: SortMode) => void,
  stepPage: (dir: -1 | 1) => boolean,
): void {
  const view: PaletteGridView = { listMode: () => listMode.value, toggleListMode, sortMode, setSortMode, stepPage };
  onMounted(() => (paletteGridView.value = view));
  onBeforeUnmount(() => {
    if (paletteGridView.value === view) paletteGridView.value = null;
  });
}
