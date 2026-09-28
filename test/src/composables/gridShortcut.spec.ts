import { describe, it, expect } from "vitest";
import { gridShortcutFor, isEditableTarget, terminalMove, type GridKeyState, type ShortcutKeyEvent } from "../../../src/composables/gridShortcut.js";
import type { Keymap } from "../../../common/keymap.js";

// The grid in manual order, enlarged or not — the state every rule below except the order ones is read in.
const view = (zoomed: boolean): GridKeyState => ({ zoomed, manualOrder: true });

const KEYMAP: Keymap = { "zoom-next": "PageDown", "zoom-prev": "PageUp" };

const key = (over: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  type: "keydown",
  key: "PageDown",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...over,
});

describe("gridShortcutFor", () => {
  it("resolves the user's bindings while zoomed", () => {
    expect(gridShortcutFor(KEYMAP, key({ key: "PageDown" }), view(true))).toBe("zoom-next");
    expect(gridShortcutFor(KEYMAP, key({ key: "PageUp" }), view(true))).toBe("zoom-prev");
  });

  it("does nothing with an EMPTY keymap — shortcuts are opt-in via config.json", () => {
    expect(gridShortcutFor({}, key({ key: "PageDown" }), view(true))).toBeNull();
    expect(gridShortcutFor({}, key({ key: "PageUp" }), view(true))).toBeNull();
  });

  it("does nothing when nothing is zoomed — an un-zoomed grid has no selected terminal", () => {
    expect(gridShortcutFor(KEYMAP, key({ key: "PageDown" }), view(false))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ key: "PageUp" }), view(false))).toBeNull();
  });

  it("gates the actions that need a subject terminal on being zoomed", () => {
    const map: Keymap = { "terminal-new-adjacent": "F2", "terminal-close": "F3", "terminal-restart": "F4" };
    expect(gridShortcutFor(map, key({ key: "F2" }), view(true))).toBe("terminal-new-adjacent");
    expect(gridShortcutFor(map, key({ key: "F3" }), view(true))).toBe("terminal-close");
    // Restarting acts on one running agent, so it needs a terminal the grid can name (#1918).
    expect(gridShortcutFor(map, key({ key: "F4" }), view(true))).toBe("terminal-restart");
    expect(gridShortcutFor(map, key({ key: "F2" }), view(false))).toBeNull();
    expect(gridShortcutFor(map, key({ key: "F3" }), view(false))).toBeNull();
    expect(gridShortcutFor(map, key({ key: "F4" }), view(false))).toBeNull();
  });

  // Un-zoomed it marks the cell holding the cursor, which is where `next-attention` lands (#2335).
  it("lets mark-unread through in both view states", () => {
    const map: Keymap = { "mark-unread": "F5" };
    expect(gridShortcutFor(map, key({ key: "F5" }), view(true))).toBe("mark-unread");
    expect(gridShortcutFor(map, key({ key: "F5" }), view(false))).toBe("mark-unread");
  });

  // The mirror of the gate above (#2106): these walk the TILED grid, so the state they need is the
  // one the zoom actions refuse. Declining rather than swallowing is what lets a same-key `send`
  // fire while a cell is enlarged.
  it("gates the focus walk on NOTHING being enlarged — the mirror of the zoom actions", () => {
    const map: Keymap = { "focus-next": "F6", "focus-prev": "F7" };
    expect(gridShortcutFor(map, key({ key: "F6" }), view(false))).toBe("focus-next");
    expect(gridShortcutFor(map, key({ key: "F7" }), view(false))).toBe("focus-prev");
    expect(gridShortcutFor(map, key({ key: "F6" }), view(true))).toBeNull();
    expect(gridShortcutFor(map, key({ key: "F7" }), view(true))).toBeNull();
  });

  // The decision recorded in plans/feat-2106-focus-prev-next.md, pinned as behaviour: one keystroke
  // still resolves to ONE action. `actionForKey` stops at the first bound action in KEYMAP_ACTIONS
  // order, so the later one never fires in EITHER state — it is not promoted into the gap the
  // earlier one leaves. Anything that changes this is the state-dependent dispatch we declined.
  it("does not pick between two actions on one key by state — the earlier one wins or nothing does", () => {
    const both: Keymap = { "zoom-prev": "F8", "focus-prev": "F8" };
    expect(gridShortcutFor(both, key({ key: "F8" }), view(true))).toBe("zoom-prev");
    expect(gridShortcutFor(both, key({ key: "F8" }), view(false))).toBeNull();
  });

  // The Files pane exists only in the ENLARGED row (docs/grid-view-modes.md), so a tiled grid has
  // nowhere to put the finder and the key declines rather than guessing which cell was meant.
  it("gates the file finder on a zoom too, because the pane it opens lives in the zoomed row", () => {
    const map: Keymap = { "files-find": "F5" };
    expect(gridShortcutFor(map, key({ key: "F5" }), view(true))).toBe("files-find");
    expect(gridShortcutFor(map, key({ key: "F5" }), view(false))).toBeNull();
  });

  it("lets terminal-new work WITHOUT a zoom — appending a cell needs no subject", () => {
    const map: Keymap = { "terminal-new": "F1" };
    expect(gridShortcutFor(map, key({ key: "F1" }), view(false))).toBe("terminal-new");
    expect(gridShortcutFor(map, key({ key: "F1" }), view(true))).toBe("terminal-new");
  });

  it("leaves Shift+PageUp alone when only the bare key is bound (xterm's scrollback)", () => {
    expect(gridShortcutFor(KEYMAP, key({ key: "PageUp", shiftKey: true }), view(true))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ key: "PageDown", shiftKey: true }), view(true))).toBeNull();
  });

  it("honours a binding that DOES ask for a modifier", () => {
    const shifted: Keymap = { "zoom-next": "Shift+PageDown" };
    expect(gridShortcutFor(shifted, key({ key: "PageDown", shiftKey: true }), view(true))).toBe("zoom-next");
    expect(gridShortcutFor(shifted, key({ key: "PageDown" }), view(true))).toBeNull();
  });

  it("leaves every other modifier combination alone", () => {
    expect(gridShortcutFor(KEYMAP, key({ altKey: true }), view(true))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ ctrlKey: true }), view(true))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ metaKey: true }), view(true))).toBeNull();
  });

  it("ignores anything that isn't a keydown", () => {
    expect(gridShortcutFor(KEYMAP, key({ type: "keyup" }), view(true))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ type: "keypress" }), view(true))).toBeNull();
  });

  it("ignores the keystroke while an IME is composing — it pages the candidate list", () => {
    expect(gridShortcutFor(KEYMAP, key({ isComposing: true }), view(true))).toBeNull();
  });

  it("ignores unbound keys", () => {
    expect(gridShortcutFor(KEYMAP, key({ key: "ArrowDown" }), view(true))).toBeNull();
    expect(gridShortcutFor(KEYMAP, key({ key: "" }), view(true))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("treats form fields as editable", () => {
    expect(isEditableTarget("INPUT", [])).toBe(true);
    expect(isEditableTarget("TEXTAREA", [])).toBe(true);
    expect(isEditableTarget("SELECT", [])).toBe(true);
  });

  it("does NOT treat xterm's helper textarea as editable — the shortcut must work there", () => {
    expect(isEditableTarget("TEXTAREA", ["xterm-helper-textarea"])).toBe(false);
  });

  it("keeps other classes on a textarea editable", () => {
    expect(isEditableTarget("TEXTAREA", ["some-other-class"])).toBe(true);
  });

  it("is case-insensitive about the tag name", () => {
    expect(isEditableTarget("input", [])).toBe(true);
    expect(isEditableTarget("textarea", [])).toBe(true);
  });

  it("leaves non-form elements alone", () => {
    expect(isEditableTarget("DIV", [])).toBe(false);
    expect(isEditableTarget("BUTTON", [])).toBe(false);
    expect(isEditableTarget("", [])).toBe(false);
  });
});

// #900: `copy` / `paste` share the one `keymap` block, but the grid handler must never claim
// them — it ends every match with preventDefault(), and for `paste` that cancels the browser's
// own paste, which IS the mechanism. They are decided in the terminal instead.
describe("terminal-scoped actions never reach the grid", () => {
  const keymap = { copy: "Ctrl+c", paste: "Ctrl+v", "zoom-next": "PageDown" };
  const press = (k: string, ctrl = false) => ({ type: "keydown", key: k, shiftKey: false, altKey: false, ctrlKey: ctrl, metaKey: false });

  it("refuses copy and paste in both zoomed and un-zoomed grids", () => {
    [true, false].forEach((zoomed) => {
      expect(gridShortcutFor(keymap, press("c", true), view(zoomed))).toBeNull();
      expect(gridShortcutFor(keymap, press("v", true), view(zoomed))).toBeNull();
    });
  });

  it("still resolves the grid's own actions", () => {
    expect(gridShortcutFor(keymap, press("PageDown"), view(true))).toBe("zoom-next");
  });
});

// A move names the terminal and the way; anything that cannot move answers null instead.
describe("terminalMove", () => {
  it("moves the named terminal one place back or forward", () => {
    expect(terminalMove("terminal-move-prev", 4)).toEqual({ uid: 4, dir: -1 });
    expect(terminalMove("terminal-move-next", 4)).toEqual({ uid: 4, dir: 1 });
  });

  it("does nothing with no terminal, or for another action", () => {
    expect(terminalMove("terminal-move-next", null)).toBeNull();
    expect(terminalMove("zoom-next", 4)).toBeNull();
  });
});

// Outside manual order the move keys stand aside rather than being claimed for nothing, so a key
// bound to one reaches the terminal (or a same-key send) in auto and priority order.
describe("the move actions and the sort order", () => {
  const map: Keymap = { "terminal-move-prev": "F9", "terminal-move-next": "F10" };

  it("take their keys in manual order, enlarged or not", () => {
    for (const zoomed of [true, false]) {
      expect(gridShortcutFor(map, key({ key: "F9" }), view(zoomed))).toBe("terminal-move-prev");
      expect(gridShortcutFor(map, key({ key: "F10" }), view(zoomed))).toBe("terminal-move-next");
    }
  });

  it("decline them in auto or priority order", () => {
    expect(gridShortcutFor(map, key({ key: "F10" }), { zoomed: true, manualOrder: false })).toBeNull();
    expect(gridShortcutFor(map, key({ key: "F9" }), { zoomed: false, manualOrder: false })).toBeNull();
  });
});
