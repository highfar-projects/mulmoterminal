import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClosedCell } from "../../../src/composables/recentlyClosed";
import type { PaletteTerminals } from "../../../src/composables/commandPalette";

const m = vi.hoisted(() => ({ openCellAt: vi.fn() }));
vi.mock("../../../src/composables/useNewTerminal", () => ({ openCellAt: m.openCellAt }));

import { reopenClosedCell, reopenLastClosedCell, reopenableNow } from "../../../src/composables/reopenClosedCell";
import { paletteTerminals } from "../../../src/composables/commandPalette";
import { recentlyClosed, recordClosedCell } from "../../../src/composables/useRecentlyClosed";

const entry = (session: string): ClosedCell => ({ kind: "session", session, cwd: "/w", agent: "claude", account: null, title: session, closedAt: 1 });

const terminals = (open: string[], full: boolean, current: number | null): PaletteTerminals => ({
  list: () => [],
  goTo: () => {},
  current: () => current,
  launchDirs: () => [],
  startDir: () => null,
  promptSource: () => null,
  openSessionIds: () => open,
  full: () => full,
});

beforeEach(() => {
  localStorage.clear();
  recentlyClosed.value = [];
  paletteTerminals.value = null;
  m.openCellAt.mockClear();
});
afterEach(() => {
  paletteTerminals.value = null;
});

describe("reopenLastClosedCell", () => {
  it("opens the newest closed cell beside the acting terminal and takes it off the list", () => {
    recordClosedCell(entry("old"));
    recordClosedCell(entry("new"));
    paletteTerminals.value = terminals([], false, 4);
    expect(reopenLastClosedCell()).toBe(true);
    expect(m.openCellAt).toHaveBeenCalledWith({ session: "new", cwd: "/w" }, "cell-4");
    expect(recentlyClosed.value.map((closed) => closed.title)).toEqual(["old"]);
  });

  it("skips a conversation the grid has open again", () => {
    recordClosedCell(entry("old"));
    recordClosedCell(entry("new"));
    paletteTerminals.value = terminals(["new"], false, null);
    expect(reopenableNow().map((closed) => closed.title)).toEqual(["old"]);
    expect(reopenLastClosedCell()).toBe(true);
    expect(m.openCellAt).toHaveBeenCalledWith({ session: "old", cwd: "/w" }, null);
  });

  it("works with no grid mounted, appending the cell", () => {
    recordClosedCell(entry("a"));
    expect(reopenLastClosedCell()).toBe(true);
    expect(m.openCellAt).toHaveBeenCalledWith({ session: "a", cwd: "/w" }, null);
  });

  it("does nothing when nothing was closed", () => {
    paletteTerminals.value = terminals([], false, null);
    expect(reopenLastClosedCell()).toBe(false);
    expect(m.openCellAt).not.toHaveBeenCalled();
  });

  it("keeps the entry when the grid is full, rather than spending it on nothing", () => {
    recordClosedCell(entry("a"));
    paletteTerminals.value = terminals([], true, null);
    expect(reopenLastClosedCell()).toBe(false);
    expect(m.openCellAt).not.toHaveBeenCalled();
    expect(recentlyClosed.value).toHaveLength(1);
  });
});

describe("reopenClosedCell", () => {
  it("reopens the entry named, not the newest", () => {
    recordClosedCell(entry("old"));
    recordClosedCell(entry("new"));
    reopenClosedCell(entry("old"));
    expect(m.openCellAt).toHaveBeenCalledWith({ session: "old", cwd: "/w" }, null);
    expect(recentlyClosed.value.map((closed) => closed.title)).toEqual(["new"]);
  });
});
