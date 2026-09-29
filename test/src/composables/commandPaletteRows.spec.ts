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
  currentChoice: "current",
  switchChoice: "switch",
  scopeLabel: (kind) => `Only ${kind}`,
  fromCollection: "collection",
  newTerminalIn: (dir) => `New in ${dir}`,
  launchDetail: "launch",
  gridFull: "full",
};
const NONE = { screens: [], terminals: [], settings: [], choices: [], commands: [], collectionActions: [], launchDirs: [], gridFull: false };
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

// #2455. Settings switched in place are rows too; the one in effect says so.
describe("choice rows", () => {
  const CHOICES = [
    { id: "theme:nord", icon: "palette", label: "Theme: Nord", current: true },
    { id: "theme:dracula", icon: "palette", label: "Theme: Dracula", current: false },
  ];

  it("lists each choice with its icon, and marks the current one", () => {
    const rows = paletteRows("Theme", {}, UNZOOMED, TEXT, { ...NONE, choices: CHOICES }).filter((row) => row.kind === "choice");
    expect(rows.map(rowKey).sort()).toEqual(["choice:theme:dracula", "choice:theme:nord"]);
    expect(rows.find((row) => rowKey(row) === "choice:theme:nord")).toMatchObject({ icon: "palette", description: "current", disabledReason: null });
    expect(rows.find((row) => rowKey(row) === "choice:theme:dracula")?.description).toBe("switch");
  });
});

// #2462. A leading symbol narrows the rows to one kind; `?` lists the symbols.
describe("a leading symbol", () => {
  const TERMINALS = [{ uid: 1, path: "~/work/app", detail: "claude", keywords: "" }];
  const SOURCES = { ...NONE, screens: ["files" as const], terminals: TERMINALS };

  it("keeps only actions after >, matched on what follows it", () => {
    const rows = paletteRows("> find", {}, UNZOOMED, TEXT, SOURCES);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.kind === "action")).toBe(true);
    expect(rows[0] && rowKey(rows[0])).toBe("files-find");
  });

  it("keeps only terminals after @", () => {
    expect(paletteRows("@", {}, UNZOOMED, TEXT, SOURCES).map(rowKey)).toEqual(["terminal:1"]);
    expect(paletteRows("@app", {}, UNZOOMED, TEXT, SOURCES).map(rowKey)).toEqual(["terminal:1"]);
  });

  it("lists the symbols after ?", () => {
    const rows = paletteRows("?", {}, UNZOOMED, TEXT, SOURCES);
    expect(rows.map(rowKey)).toEqual(["prefix:>", "prefix:@"]);
    expect(rows[1]).toMatchObject({ kind: "prefix", description: "@", disabledReason: null });
  });
});

// #2465. The acting terminal's buttons and commands are rows beside the grid's actions, and `>`
// finds them with the actions.
describe("command rows", () => {
  const COMMANDS = [{ id: "release", label: "Release", icon: "bolt", detail: "command" }];

  it("lists them right after the actions on the grid", () => {
    const rows = paletteRows("", {}, UNZOOMED, TEXT, { ...NONE, commands: COMMANDS });
    expect(rows[PALETTE_ACTIONS.length]).toMatchObject({ kind: "command", id: "release", icon: "bolt", description: "command", disabledReason: null });
  });

  it("is found by > together with the actions", () => {
    expect(paletteRows("> Release", {}, UNZOOMED, TEXT, { ...NONE, commands: COMMANDS }).map(rowKey)).toContain("command:release");
    expect(paletteRows("@ Release", {}, UNZOOMED, TEXT, { ...NONE, commands: COMMANDS }).map(rowKey)).not.toContain("command:release");
  });
});

// #2471. Collection actions are rows beside the terminal's commands, found by > too, and two
// collections with an action of the same name stay two rows.
describe("collection rows", () => {
  const ACTIONS = [
    { slug: "inv", id: "sum", label: "Invoices: Summarise", icon: "summarize" },
    { slug: "tasks", id: "sum", label: "Tasks: Summarise", icon: "task" },
    // Two collections with one title: only the slug tells their actions apart.
    { slug: "notes-a", id: "sum", label: "Notes: Summarise", icon: "note" },
    { slug: "notes-b", id: "sum", label: "Notes: Summarise", icon: "note" },
  ];

  it("lists each one, keyed by its collection", () => {
    const rows = paletteRows("Summarise", {}, UNZOOMED, TEXT, { ...NONE, collectionActions: ACTIONS }).filter((row) => row.kind === "collection");
    expect(rows.map(rowKey).sort()).toEqual(["collection:inv:sum", "collection:notes-a:sum", "collection:notes-b:sum", "collection:tasks:sum"]);
    expect(rows[0]).toMatchObject({ description: "collection", disabledReason: null });
  });

  it("is found by > with the actions, and not by @", () => {
    expect(paletteRows("> Invoices", {}, UNZOOMED, TEXT, { ...NONE, collectionActions: ACTIONS }).map(rowKey)).toContain("collection:inv:sum");
    expect(paletteRows("@ Invoices", {}, UNZOOMED, TEXT, { ...NONE, collectionActions: ACTIONS }).map(rowKey)).not.toContain("collection:inv:sum");
  });
});

// #2484. Opening a new terminal is a run too, so > finds it with the actions.
describe("launch rows", () => {
  const DIRS = [{ path: "/home/me/app", label: "~/app" }];

  it("lists each directory, and > finds it", () => {
    expect(paletteRows("", {}, UNZOOMED, TEXT, { ...NONE, launchDirs: DIRS }).map(rowKey)).toContain("launch:/home/me/app");
    expect(paletteRows("> New in ~/app", {}, UNZOOMED, TEXT, { ...NONE, launchDirs: DIRS }).map(rowKey)).toContain("launch:/home/me/app");
    expect(paletteRows("@ New in ~/app", {}, UNZOOMED, TEXT, { ...NONE, launchDirs: DIRS }).map(rowKey)).not.toContain("launch:/home/me/app");
  });

  it("is refused, with the reason on it, while the grid is full", () => {
    const [row] = paletteRows("New in ~/app", {}, UNZOOMED, TEXT, { ...NONE, launchDirs: DIRS, gridFull: true });
    expect(row?.disabledReason).toBe("full");
    const [open] = paletteRows("New in ~/app", {}, UNZOOMED, TEXT, { ...NONE, launchDirs: DIRS });
    expect(open?.disabledReason).toBeNull();
  });
});
