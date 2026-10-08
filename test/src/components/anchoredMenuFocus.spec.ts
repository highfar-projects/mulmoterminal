// Which item takes focus when an anchored menu opens, checked over generated item lists.
import { describe, it, expect } from "vitest";
import { ANCHORED_MENU_INITIAL_FOCUS, initialMenuItem, type MenuItemLike } from "../../../src/components/anchoredMenuFocus";

interface Item extends MenuItemLike {
  index: number;
}

// Values beside "true" that must NOT read as checked: absent, false, empty, other case, padded.
const ARIA_CHECKED_VALUES = [null, "true", "false", "", "TRUE", " true", "mixed"];
const MAX_ITEMS = 6;
const SAMPLE_COUNT = 2000;
const SEED = 2822;

const makeItem = (index: number, checked: string | null): Item => ({ index, getAttribute: (name) => (name === "aria-checked" ? checked : null) });

function* generatedLists(): Generator<Item[]> {
  let state = SEED;
  const next = (bound: number): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % bound;
  };
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const length = next(MAX_ITEMS + 1);
    yield Array.from({ length }, (_, index) => makeItem(index, ARIA_CHECKED_VALUES[next(ARIA_CHECKED_VALUES.length)] ?? null));
  }
}

const firstChecked = (items: Item[]): Item | undefined => items.find((item) => item.getAttribute("aria-checked") === "true");

describe("initialMenuItem", () => {
  it("returns nothing for an empty menu, whatever the mode", () => {
    ANCHORED_MENU_INITIAL_FOCUS.forEach((focus) => expect(initialMenuItem(focus, [])).toBeUndefined());
  });

  it("first: the top item, checked or not", () => {
    [...generatedLists()].forEach((items) => expect(initialMenuItem("first", items)).toBe(items[0]));
  });

  it("checked: the first item whose aria-checked is exactly true, else none", () => {
    [...generatedLists()].forEach((items) => expect(initialMenuItem("checked", items)).toBe(firstChecked(items)));
  });

  it("checkedOrFirst: the checked item, falling back to the top one", () => {
    [...generatedLists()].forEach((items) => expect(initialMenuItem("checkedOrFirst", items)).toBe(firstChecked(items) ?? items[0]));
  });

  it("does not count a near-miss value as checked", () => {
    const items = ["TRUE", " true", "mixed", "false", ""].map((value, index) => makeItem(index, value));
    expect(initialMenuItem("checked", items)).toBeUndefined();
    expect(initialMenuItem("checkedOrFirst", items)).toBe(items[0]);
  });

  it("picks the first of several checked items", () => {
    const items = [makeItem(0, null), makeItem(1, "true"), makeItem(2, "true")];
    expect(initialMenuItem("checked", items)).toBe(items[1]);
  });
});
