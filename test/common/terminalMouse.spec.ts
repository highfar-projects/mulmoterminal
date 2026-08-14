// @vitest-environment node
// Mouse reports arrive as input because the TUI asked for them, and counting them as "the user
// typed" is what made every pane answer be refused once the mouse had been touched (#1693).
import { describe, it, expect } from "vitest";
import { isMouseReportOnly } from "../../common/terminalMouse";

describe("isMouseReportOnly", () => {
  it("recognises the SGR reports xterm.js sends", () => {
    expect(isMouseReportOnly("\x1b[<0;12;34M")).toBe(true); // press
    expect(isMouseReportOnly("\x1b[<0;12;34m")).toBe(true); // release
    expect(isMouseReportOnly("\x1b[<64;12;34M")).toBe(true); // wheel
    expect(isMouseReportOnly("\x1b[<0;1;1M\x1b[<0;1;1m")).toBe(true); // a whole click in one chunk
  });

  it("recognises the older X10 form, control bytes and all", () => {
    expect(isMouseReportOnly("\x1b[M\x20\x21\x22")).toBe(true);
  });

  it("does not excuse real typing", () => {
    expect(isMouseReportOnly("a")).toBe(false);
    expect(isMouseReportOnly("\r")).toBe(false);
    expect(isMouseReportOnly("\x1b[B")).toBe(false); // an arrow key IS the user answering
    expect(isMouseReportOnly("\x1b")).toBe(false);
  });

  // A chunk that carries both is typing: the keystroke in it still moved the dialog.
  it("does not excuse a mixed chunk", () => {
    expect(isMouseReportOnly("\x1b[<0;12;34Mx")).toBe(false);
  });

  it("has nothing to ignore in an empty chunk", () => {
    expect(isMouseReportOnly("")).toBe(false);
  });
});
