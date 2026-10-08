// @vitest-environment node
import { describe, it, expect } from "vitest";
import { computed, ref } from "vue";
import { useGridPaging } from "../../../src/composables/useGridPaging";
import { PAGE_SIZE, type Cell, type GridState } from "../../../src/components/gridTabs";

// #2654. Stepping pages from a key or the palette: one page at a time, no wrap, and the selection
// dropped when its cell leaves the screen — as a tab click does.
const cells = (count: number): Cell[] => Array.from({ length: count }, (_, uid) => ({ uid, session: `s${uid}`, cwd: "/w" }));
const setup = (count: number, page = 0) => {
  const state = ref<GridState>({ cells: cells(count), expanded: null, page, nextUid: count, sortMode: "manual", arrangement: "grid" });
  const displayCells = computed(() => state.value.cells.slice(state.value.page * PAGE_SIZE, (state.value.page + 1) * PAGE_SIZE));
  const focused = ref<number | null>(0);
  return { state, focused, paging: useGridPaging(state, displayCells, focused) };
};

describe("useGridPaging", () => {
  it("counts the pages and steps forward and back", () => {
    const { state, paging } = setup(PAGE_SIZE * 2 + 1);
    expect(paging.pages.value).toBe(3);
    expect(paging.stepPage(1)).toBe(true);
    expect(state.value.page).toBe(1);
    expect(paging.stepPage(-1)).toBe(true);
    expect(state.value.page).toBe(0);
  });

  it("does not wrap past either end", () => {
    const first = setup(PAGE_SIZE + 1, 0);
    expect(first.paging.stepPage(-1)).toBe(false);
    expect(first.state.value.page).toBe(0);
    const last = setup(PAGE_SIZE + 1, 1);
    expect(last.paging.stepPage(1)).toBe(false);
    expect(last.state.value.page).toBe(1);
  });

  it("refuses with a single page", () => {
    const { paging } = setup(3);
    expect(paging.stepPage(1)).toBe(false);
    expect(paging.stepPage(-1)).toBe(false);
  });

  it("drops the selection once its cell is off the page shown", () => {
    const { focused, paging } = setup(PAGE_SIZE + 1);
    paging.stepPage(1);
    expect(focused.value).toBeNull();
  });
});
