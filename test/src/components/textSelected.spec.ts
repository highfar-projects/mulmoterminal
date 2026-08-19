import { describe, it, expect } from "vitest";
import { isTextSelected } from "../../../src/components/textSelected";

describe("isTextSelected", () => {
  // Codex, #1806: what the range CONTAINS is deliberately not part of the rule. A prompt renders
  // pre-wrap, so indentation and blank lines are draggable content, and reading such a range as
  // "no selection" reclamped the row over the selection just made.
  it("is true for a live range and false for a caret", () => {
    expect(isTextSelected({ isCollapsed: false })).toBe(true);
    expect(isTextSelected({ isCollapsed: true })).toBe(false); // a plain click leaves this
  });

  it("treats no selection at all as no selection", () => {
    expect(isTextSelected(null)).toBe(false);
    expect(isTextSelected(undefined)).toBe(false);
  });
});
