import { describe, it, expect } from "vitest";
import { hasChoice, historyEntries, toolEntries, type CellPaneMenuState } from "../../../src/components/cellPaneMenuEntries";

const t = (key: string) => key;
const state = (over: Partial<CellPaneMenuState> = {}): CellPaneMenuState => ({
  expanded: true,
  rightPane: null,
  canvasAvailable: true,
  collectionsAvailable: false,
  timelineAvailable: false,
  restartAvailable: false,
  ...over,
});
const ids = (entries: { id: string }[]) => entries.map((entry) => entry.id);

describe("historyEntries", () => {
  it("lists prompts and conversation, plus the timeline when the cell has one", () => {
    expect(ids(historyEntries(state(), t))).toEqual(["prompts", "transcript"]);
    expect(ids(historyEntries(state({ timelineAvailable: true }), t))).toEqual(["prompts", "transcript", "timeline"]);
  });

  // Panes need the enlarged cell's room; the timeline is an overlay and opens from a tile.
  it("disables the panes on a tile, saying why, and keeps the timeline", () => {
    const entries = historyEntries(state({ expanded: false, timelineAvailable: true }), t);
    expect(entries.map((entry) => [entry.id, entry.disabled])).toEqual([
      ["prompts", true],
      ["transcript", true],
      ["timeline", false],
    ]);
    expect(entries[0].detail).toBe("cellMenu.enlargeFirst");
  });

  it("checks the pane that is open, and never the timeline", () => {
    const entries = historyEntries(state({ rightPane: "transcript", timelineAvailable: true }), t);
    expect(entries.map((entry) => entry.checked)).toEqual([false, true, undefined]);
  });
});

describe("toolEntries", () => {
  it("lists tools and canvas, and collections only where the directory has the collection tools", () => {
    expect(ids(toolEntries(state(), t))).toEqual(["tools", "canvas"]);
    expect(ids(toolEntries(state({ collectionsAvailable: true }), t))).toEqual(["tools", "canvas", "collections"]);
  });

  // The collections pane has no close of its own, so its entry stays while it is open.
  it("keeps collections while its pane is open, even with the tools gone", () => {
    const entries = toolEntries(state({ rightPane: "collections" }), t);
    expect(ids(entries)).toEqual(["tools", "canvas", "collections"]);
    expect(entries[2].checked).toBe(true);
  });

  it("does not bring collections back for another open pane", () => {
    expect(ids(toolEntries(state({ rightPane: "tools" }), t))).toEqual(["tools", "canvas"]);
  });

  // Disabled rather than missing: the line is where the fix goes.
  it("disables canvas without the render tools, with the fix as its line", () => {
    const canvas = toolEntries(state({ canvasAvailable: false }), t)[1];
    expect(canvas.disabled).toBe(true);
    expect(canvas.detail).toBe("cellMenu.canvasUnavailable");
    expect(toolEntries(state(), t)[1].disabled).toBe(false);
  });
});

describe("the restart entry", () => {
  it("closes the Tools menu, set apart, when the cell has an agent to restart", () => {
    const entries = toolEntries(state({ restartAvailable: true }), t);
    expect(ids(entries)).toEqual(["tools", "canvas", "restart"]);
    expect(entries[2].separated).toBe(true);
    expect(entries[2].checked).toBeUndefined();
  });

  // An action, not a view: a tile has no room for the panes but can still restart.
  it("stays pickable on a tile, where it is the only choice", () => {
    const entries = toolEntries(state({ expanded: false, restartAvailable: true }), t);
    expect(entries.filter((entry) => !entry.disabled).map((entry) => entry.id)).toEqual(["restart"]);
    expect(hasChoice(entries)).toBe(true);
    expect(hasChoice(toolEntries(state({ expanded: false }), t))).toBe(false);
  });

  it("is absent without an agent to restart", () => {
    expect(ids(toolEntries(state(), t))).not.toContain("restart");
  });
});

describe("hasChoice", () => {
  it("is false only when every entry is disabled", () => {
    expect(hasChoice(historyEntries(state({ expanded: false }), t))).toBe(false);
    expect(hasChoice(historyEntries(state({ expanded: false, timelineAvailable: true }), t))).toBe(true);
    expect(hasChoice([])).toBe(false);
  });
});
