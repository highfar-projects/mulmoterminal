import { describe, it, expect } from "vitest";
import { SORT_MODES, sortModeButton, sortModeIcon } from "../../../src/components/sortModeButton";
import type { SortMode } from "../../../src/components/gridTabs";

const EVERY_MODE: SortMode[] = ["auto", "manual", "priority"];

describe("SORT_MODES", () => {
  // The menu is the ONLY way to reach "priority", so a mode missing from the list would strand it.
  it("lists every mode exactly once", () => {
    expect([...SORT_MODES].sort()).toEqual([...EVERY_MODE].sort());
  });
});

describe("sortModeButton", () => {
  it("gives each mode its own icon, the same one the menu shows", () => {
    const icons = EVERY_MODE.map((mode) => sortModeButton(mode).icon);
    expect(new Set(icons).size).toBe(EVERY_MODE.length);
    EVERY_MODE.forEach((mode) => expect(sortModeButton(mode).icon).toBe(sortModeIcon(mode)));
  });

  it("highlights only the automatic orderings, not the hand-arranged one", () => {
    expect(sortModeButton("manual").active).toBe(false);
    expect(sortModeButton("auto").active).toBe(true);
    expect(sortModeButton("priority").active).toBe(true);
  });
});
