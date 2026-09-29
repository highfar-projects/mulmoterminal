import { describe, it, expect } from "vitest";
import {
  PALETTE_ACTIONS,
  paletteRows,
  rowKey,
  type ActionRow,
  type PaletteRow,
  type PaletteState,
  type PaletteText,
} from "../../../src/composables/commandPaletteRows";
import type { Keymap } from "../../../common/keymap";
import { visibleScreens } from "../../../src/composables/paletteScreens";

// #2266. What the palette lists, how it ranks, and what it says about each row.
const TEXT: PaletteText = {
  label: (action) => `Label of ${action}`,
  description: (action) => `About ${action}`,
  needsEnlarged: "needs enlarged",
  needsNothingEnlarged: "not while enlarged",
  needsManualOrder: "manual order only",
  gridHidden: "grid hidden",
  screenLabel: (screen) => `Screen ${screen}`,
  screenDescription: (screen) => `Open ${screen}`,
  settingsLabel: (tab) => `Section ${tab}`,
  openInSettings: "in settings",
};
const NONE = { screens: [], terminals: [], settings: [] };
const ZOOMED = { zoomed: true, available: true, manualOrder: true };
const UNZOOMED = { zoomed: false, available: true, manualOrder: true };
const labelText = (row: { label: { text: string }[] }) => row.label.map((part) => part.text).join("");

// The grid actions alone, as every test below written before screens were rows reads them.
const isAction = (row: PaletteRow): row is ActionRow => row.kind === "action";
const actionRowsOf = (query: string, keymap: Keymap, state: PaletteState, text: PaletteText): ActionRow[] =>
  paletteRows(query, keymap, state, text, NONE).filter(isAction);

describe("PALETTE_ACTIONS", () => {
  it("leaves out copy, paste and the palette itself", () => {
    expect(PALETTE_ACTIONS).not.toContain("copy");
    expect(PALETTE_ACTIONS).not.toContain("paste");
    expect(PALETTE_ACTIONS).not.toContain("command-palette");
    expect(PALETTE_ACTIONS).toContain("files-find");
  });
});

describe("paletteRows", () => {
  it("lists every action in order when nothing is typed", () => {
    expect(actionRowsOf("", {}, ZOOMED, TEXT).map((row) => row.action)).toEqual([...PALETTE_ACTIONS]);
  });

  it("finds an action by its id, and puts the closest first", () => {
    const [first] = actionRowsOf("find", {}, ZOOMED, TEXT);
    expect(first?.action).toBe("files-find");
  });

  it("finds an action by its name", () => {
    const rows = actionRowsOf("restart", {}, ZOOMED, { ...TEXT, label: (action) => (action === "terminal-restart" ? "Restart the agent" : "Other") });
    expect(rows[0]?.action).toBe("terminal-restart");
  });

  it("highlights only within the name, never in the id searched beside it", () => {
    const [row] = actionRowsOf("files-find", {}, ZOOMED, { ...TEXT, label: () => "Open" });
    expect(row && labelText(row)).toBe("Open");
  });

  it("lists nothing for a query no action matches", () => {
    expect(actionRowsOf("zzzzqqq", {}, ZOOMED, TEXT)).toEqual([]);
  });

  it("shows the binding as the user wrote it, and null when there is none", () => {
    const rows = actionRowsOf("", { "files-find": "Cmd+k p" }, ZOOMED, TEXT);
    expect(rows.find((row) => row.action === "files-find")?.binding).toBe("Cmd+k p");
    expect(rows.find((row) => row.action === "zoom-toggle")?.binding).toBeNull();
  });

  it("says why an action cannot run in the current view", () => {
    const unzoomed = actionRowsOf("", {}, UNZOOMED, TEXT);
    expect(unzoomed.find((row) => row.action === "files-find")?.disabledReason).toBe("needs enlarged");
    expect(unzoomed.find((row) => row.action === "focus-next")?.disabledReason).toBeNull();
    const zoomed = actionRowsOf("", {}, ZOOMED, TEXT);
    expect(zoomed.find((row) => row.action === "focus-next")?.disabledReason).toBe("not while enlarged");
    expect(zoomed.find((row) => row.action === "zoom-toggle")?.disabledReason).toBeNull();
  });

  it("carries each action's description", () => {
    expect(actionRowsOf("", {}, ZOOMED, TEXT)[0]?.description).toBe(`About ${PALETTE_ACTIONS[0]}`);
  });

  // Over another view or the launch panel the grid takes no keys, and a pick would act on a grid
  // nobody is looking at (codex on #2286).
  it("disables every row while the grid is not in front", () => {
    const rows = actionRowsOf("", {}, { zoomed: true, available: false, manualOrder: true }, TEXT);
    expect(rows.every((row) => row.disabledReason === "grid hidden")).toBe(true);
  });
});

// Moving a terminal only means something in manual order; in auto and priority order the grid
// decides the position, so the row says why instead of running a move the next sort would undo.
describe("the move actions", () => {
  it("are listed, and runnable in manual order in either view", () => {
    for (const state of [ZOOMED, UNZOOMED]) {
      const rows = actionRowsOf("", {}, state, TEXT).filter((row) => row.action.startsWith("terminal-move-"));
      expect(rows.map((row) => [row.action, row.disabledReason])).toEqual([
        ["terminal-move-prev", null],
        ["terminal-move-next", null],
      ]);
    }
  });

  it("say they need manual order otherwise", () => {
    const rows = actionRowsOf("", {}, { ...UNZOOMED, manualOrder: false }, TEXT);
    expect(rows.find((row) => row.action === "terminal-move-next")?.disabledReason).toBe("manual order only");
    // Nothing else depends on the order.
    expect(rows.find((row) => row.action === "zoom-toggle")?.disabledReason).toBeNull();
  });
});

// #2441. Screens are rows too: they need no grid, so they are never disabled, and they lead the
// list wherever the grid is not in front.
describe("screen rows", () => {
  const ALL_SET_UP = { prs: true, rooms: true, worklog: true };
  const HIDDEN = { zoomed: false, available: false, manualOrder: true };

  it("lists every screen after the actions while the grid is in front", () => {
    const rows = paletteRows("", {}, UNZOOMED, TEXT, { ...NONE, screens: visibleScreens(ALL_SET_UP) });
    expect(rows.slice(0, PALETTE_ACTIONS.length).every(isAction)).toBe(true);
    expect(rows.slice(PALETTE_ACTIONS.length).map(rowKey)).toEqual([
      "screen:terminals",
      "screen:collections",
      "screen:feeds",
      "screen:accounting",
      "screen:files",
      "screen:wiki",
      "screen:prs",
      "screen:rooms",
      "screen:blueprints",
      "screen:worklog",
    ]);
  });

  it("puts the screens first, and runnable, anywhere else", () => {
    const rows = paletteRows("", {}, HIDDEN, TEXT, { ...NONE, screens: visibleScreens(ALL_SET_UP) });
    expect(rows[0]?.kind).toBe("screen");
    expect(rows.filter((row) => row.kind === "screen").every((row) => row.disabledReason === null)).toBe(true);
    expect(rows.filter(isAction).every((row) => row.disabledReason === "grid hidden")).toBe(true);
  });

  it("finds a screen by name, with its icon and line", () => {
    const [first] = paletteRows("Screen wiki", {}, HIDDEN, TEXT, { ...NONE, screens: visibleScreens(ALL_SET_UP) });
    expect(first).toMatchObject({ kind: "screen", screen: "wiki", icon: "menu_book", description: "Open wiki" });
  });

  it("offers no screen for a feature that is not set up", () => {
    const keys = paletteRows("", {}, UNZOOMED, TEXT, { ...NONE, screens: visibleScreens({ prs: false, rooms: false, worklog: false }) }).map(rowKey);
    expect(keys).not.toContain("screen:prs");
    expect(keys).not.toContain("screen:rooms");
    expect(keys).not.toContain("screen:worklog");
    expect(keys).toContain("screen:blueprints");
  });
});

// #2446. The grid's terminals are rows too, found by part of their path.
describe("terminal rows", () => {
  const terminal = (uid: number, path: string, keywords = "") => ({ uid, path, detail: `detail ${uid}`, keywords });
  const TERMINALS = [terminal(1, "~/ss/llm/mulmoclaude"), terminal(2, "~/ss/llm/mulmoterminal4", "release"), terminal(3, "~/ss/llm/mulmoterminal4")];
  const HIDDEN = { zoomed: false, available: false, manualOrder: true };

  it("finds a terminal by part of its path, and keeps two in one directory apart", () => {
    const rows = paletteRows("term4", {}, UNZOOMED, TEXT, { ...NONE, screens: [], terminals: TERMINALS }).filter((row) => row.kind === "terminal");
    expect(rows.map(rowKey).sort()).toEqual(["terminal:2", "terminal:3"]);
    expect(rows.find((row) => rowKey(row) === "terminal:2")).toMatchObject({ icon: "terminal", description: "detail 2", disabledReason: null });
  });

  it("finds one by its memo", () => {
    const [first] = paletteRows("release", {}, UNZOOMED, TEXT, { ...NONE, screens: [], terminals: TERMINALS });
    expect(first && rowKey(first)).toBe("terminal:2");
  });

  it("lists them after the actions on the grid, and after the screens elsewhere", () => {
    const onGrid = paletteRows("", {}, UNZOOMED, TEXT, {
      ...NONE,
      screens: visibleScreens({ prs: false, rooms: false, worklog: false }),
      terminals: TERMINALS,
    }).map((row) => row.kind);
    expect(onGrid.indexOf("terminal")).toBe(PALETTE_ACTIONS.length);
    const elsewhere = paletteRows("", {}, HIDDEN, TEXT, { ...NONE, screens: ["wiki"], terminals: TERMINALS }).map((row) => row.kind);
    expect(elsewhere.slice(0, 4)).toEqual(["screen", "terminal", "terminal", "terminal"]);
  });
});

// #2450. Settings sections are rows too, opened in Settings.
describe("settings rows", () => {
  const HIDDEN = { zoomed: false, available: false, manualOrder: true };

  it("lists each section with its name and the Settings line, last on the grid", () => {
    const rows = paletteRows("", {}, UNZOOMED, TEXT, { ...NONE, screens: ["wiki"], settings: ["theme", "shortcuts"] });
    expect(rows.slice(-2).map(rowKey)).toEqual(["settings:theme", "settings:shortcuts"]);
    expect(rows.at(-1)).toMatchObject({ kind: "settings", icon: "settings", description: "in settings", disabledReason: null });
  });

  it("lists them before the actions elsewhere, and finds one by name", () => {
    const kinds = paletteRows("", {}, HIDDEN, TEXT, { ...NONE, screens: ["wiki"], settings: ["theme"] }).map((row) => row.kind);
    expect(kinds.slice(0, 2)).toEqual(["screen", "settings"]);
    const [first] = paletteRows("Section shortcuts", {}, HIDDEN, TEXT, { ...NONE, settings: ["theme", "shortcuts"] });
    expect(first && rowKey(first)).toBe("settings:shortcuts");
  });
});
