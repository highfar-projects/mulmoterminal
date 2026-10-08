import { describe, it, expect } from "vitest";
import { rightPaneStyle } from "../../../src/components/rightPaneStyle";
import grid from "../../../src/components/TerminalGrid.vue?raw";

const SPLIT_WIDTH_PX = 480;
const HELPER_CALL = "rightPaneStyle(paneFull, paneWidth)";
const SIZED_PANES = ["ToolsPane", "PromptsPane", "TranscriptPane", "CollectionsPane", "QuestionPane"];

/** The `:style` of the one `<tag …/>` in `source`; null without one, "<duplicate>" when the tag appears twice. */
const styleOf = (source: string, tag: string): string | null => {
  const elements = [...source.matchAll(new RegExp(`<${tag}\\s[\\s\\S]*?/>`, "gu"))];
  if (elements.length > 1) return "<duplicate>";
  return elements[0]?.[0].match(/:style="([^"]*)"/u)?.[1] ?? null;
};

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
  });

  it.each(SIZED_PANES)("sizes %s through it", (pane) => {
    expect(styleOf(grid, pane)).toBe(HELPER_CALL);
  });
});

describe("styleOf", () => {
  it("reads the style of the named tag, across lines", () => {
    expect(styleOf('<A\n  :x="1"\n  :style="s(a)"\n/>\n<B :style="t" />', "A")).toBe("s(a)");
  });

  it("does not take a neighbour's style for a tag without one, or a longer tag name", () => {
    expect(styleOf('<A :x="1" />\n<B :style="t" />', "A")).toBeNull();
    expect(styleOf('<AB :style="t" />', "A")).toBeNull();
  });

  it("reports a tag that appears twice, so a duplicate cannot hide behind the first", () => {
    expect(styleOf('<A :style="s" />\n<A :style="t" />', "A")).toBe("<duplicate>");
  });
});
