// The grid's pages (9 cells each): how many, going to one, and stepping to the next or previous.
import { computed, type ComputedRef, type Ref } from "vue";
import { pageCount, switchPage, type Cell, type GridState } from "../components/gridTabs";

export function useGridPaging(state: Ref<GridState>, displayCells: ComputedRef<Cell[]>, focusedCellUid: Ref<number | null>) {
  const pages = computed(() => pageCount(state.value.cells.length));
  // Switching page BY HAND is the one page change that moves no cursor: the cells leaving the screen
  // unmount, nothing emits focus-cell, and the retained uid goes on naming a terminal nobody can see —
  // so walking from it sent the user straight back to the page they had just left (CodeRabbit on #2120).
  // INVARIANT 4 makes the focused cell the un-zoomed selection, and a selection off-screen is not one.
  //
  // The condition is what is VISIBLE afterwards, not that a tab was clicked: `switchPage` returns the
  // state unchanged for the page already shown, where nothing unmounted and the selection is still in
  // front of the user — dropping it there would take `zoom-toggle`, `next-attention` and
  // `terminal-new-here` with it for a click that changed nothing (Codex on #2120).
  const switchTo = (page: number) => {
    state.value = switchPage(state.value, page);
    if (!displayCells.value.some((c) => c.uid === focusedCellUid.value)) focusedCellUid.value = null;
  };
  /** The next (+1) or previous (-1) page; false past either end, which it does not wrap. */
  const stepPage = (dir: -1 | 1): boolean => {
    const next = state.value.page + dir;
    if (next < 0 || next >= pages.value) return false;
    switchTo(next);
    return true;
  };
  return { pages, switchTo, stepPage };
}
