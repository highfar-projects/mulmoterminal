import { describe, it, expect } from "vitest";
import { rightPaneStyle } from "../../../src/components/rightPaneStyle";
import grid from "../../../src/components/TerminalGrid.vue?raw";

const SPLIT_WIDTH_PX = 480;

describe("rightPaneStyle (#2899)", () => {
  it("fills the row while full, dropping the pane's own fixed width", () => {
    expect(rightPaneStyle(true, SPLIT_WIDTH_PX)).toEqual({ flex: "1 1 0%", width: "auto", minWidth: "0" });
  });

  it("holds the split width while split", () => {
    expect(rightPaneStyle(false, SPLIT_WIDTH_PX)).toEqual({ flex: `0 0 ${SPLIT_WIDTH_PX}px`, minWidth: "0" });
  });

  // Without it a flex item's minimum is its min-content width, and one unbreakable line in the
  // conversation pushed the pane, and the close button in its header, past the window's edge.
  it.each([true, false])("lets the pane shrink below its content's width (full: %s)", (full) => {
    expect(rightPaneStyle(full, SPLIT_WIDTH_PX).minWidth).toBe("0");
  });

  it("is the only way TerminalGrid sizes a right pane that drops its own width", () => {
    expect(grid).not.toMatch(/width:\s*['"]auto['"]/u);
    expect(grid.match(/rightPaneStyle\(paneFull, paneWidth\)/gu)?.length).toBeGreaterThan(0);
  });
});
