import { describe, it, expect } from "vitest";
import { isTextSelected } from "../../../src/components/textSelected";

const selection = (text: string, isCollapsed = false) => ({ isCollapsed, toString: () => text });

describe("isTextSelected", () => {
  it("is true only for a selection that actually holds text", () => {
    expect(isTextSelected(selection("a prompt"))).toBe(true);
    expect(isTextSelected(selection("a prompt", true))).toBe(false); // a caret, not a range
    expect(isTextSelected(selection(""))).toBe(false);
    expect(isTextSelected(selection("  \n "))).toBe(false); // whitespace is not worth suppressing a click for
  });

  it("treats no selection at all as no selection", () => {
    expect(isTextSelected(null)).toBe(false);
    expect(isTextSelected(undefined)).toBe(false);
  });
});
