import { describe, it, expect } from "vitest";
import { attentionAction, fitMenu } from "../../../src/components/rowMenu";
import type { AttentionStatus } from "../../../src/components/attentionStatus";

describe("attentionAction (#2299)", () => {
  const cases: Array<[AttentionStatus, boolean, ReturnType<typeof attentionAction>]> = [
    ["idle", true, "unread"],
    ["done", true, "read"],
    ["blocked", true, "read"],
    ["working", true, null],
    // A command / launcher cell, or one still on its launch form, has no attention to mark.
    ["idle", false, null],
    ["done", false, null],
    ["blocked", false, null],
    ["working", false, null],
  ];
  it.each(cases)("%s (markable: %s) → %s", (status, markable, expected) => {
    expect(attentionAction(status, markable)).toBe(expected);
  });
});

describe("fitMenu", () => {
  const VIEW = { width: 800, height: 600 };
  const MENU = { width: 160, height: 200 };

  it("keeps a menu that already fits where it was asked for", () => {
    expect(fitMenu({ top: 100, left: 100 }, MENU, VIEW)).toEqual({ top: 100, left: 100 });
  });

  it("pulls a menu opened near the bottom-right corner back inside the viewport", () => {
    expect(fitMenu({ top: 590, left: 790 }, MENU, VIEW)).toEqual({ top: 600 - 200 - 8, left: 800 - 160 - 8 });
  });

  it("keeps the margin at the top-left when asked for a negative position", () => {
    expect(fitMenu({ top: -20, left: -5 }, MENU, VIEW)).toEqual({ top: 8, left: 8 });
  });

  it("pins a menu taller or wider than the viewport to its top-left margin", () => {
    expect(fitMenu({ top: 50, left: 50 }, { width: 900, height: 700 }, VIEW)).toEqual({ top: 8, left: 8 });
  });

  it("rounds fractional pointer positions to whole pixels", () => {
    expect(fitMenu({ top: 10.6, left: 20.4 }, MENU, VIEW)).toEqual({ top: 11, left: 20 });
  });
});
