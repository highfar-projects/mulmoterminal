import { describe, it, expect } from "vitest";
import { isPresetChangeList, KEYMAP_PRESETS, presetChanges, reservedBindings, withPreset } from "../../common/keymapPresets";
import { validateKeymap, type Keymap } from "../../common/keymap";

// #2581. The recommended keys per platform: they only ADD — a bound action keeps its key, and a key
// any binding already starts with is not claimed again.
describe("KEYMAP_PRESETS", () => {
  // Each preset on its own is a keymap the server takes without a word.
  it.each([["mac"], ["other"]] as const)("is a clean keymap on its own (%s)", (platform) => {
    const keymap = withPreset({}, presetChanges({}, KEYMAP_PRESETS[platform]));
    expect(validateKeymap(keymap)).toEqual([]);
  });

  // Option+Left/Right carry word motion in a Mac terminal, so the Mac set leaves them alone.
  it("does not take Option+Left/Right on a Mac", () => {
    const bindings = Object.values(KEYMAP_PRESETS.mac.actions);
    expect(bindings).not.toContain("Alt+ArrowLeft");
    expect(bindings).not.toContain("Alt+ArrowRight");
  });
});

describe("presetChanges and withPreset", () => {
  it("adds everything to an empty keymap", () => {
    const changes = presetChanges({}, KEYMAP_PRESETS.mac);
    expect(changes.map((c) => c.kind)).toEqual(["add", "add", "add-send", "add-send", "add-send"]);
    const keymap = withPreset({}, changes);
    expect(keymap["zoom-toggle"]).toBe("Alt+ArrowUp");
    expect(keymap.send?.map((s) => s.key)).toEqual(["Cmd+ArrowLeft", "Cmd+ArrowRight", "Cmd+Backspace"]);
  });

  it("keeps an action the user bound, and says so", () => {
    const keymap: Keymap = { "zoom-toggle": "F8" };
    const changes = presetChanges(keymap, KEYMAP_PRESETS.other);
    expect(changes).toContainEqual({ kind: "kept", action: "zoom-toggle", binding: "Alt+ArrowUp", current: "F8" });
    expect(withPreset(keymap, changes)["zoom-toggle"]).toBe("F8");
  });

  it.each([
    ["an action", { "files-find": "Alt+ArrowDown" } satisfies Keymap],
    ["the first key of a sequence", { "files-find": "Alt+ArrowDown p" } satisfies Keymap],
    ["a send entry", { send: [{ key: "Alt+ArrowDown", bytes: "x" }] } satisfies Keymap],
  ])("leaves out a key already used by %s", (_case, keymap) => {
    const changes = presetChanges(keymap, KEYMAP_PRESETS.other);
    expect(changes).toContainEqual({ kind: "taken", action: "next-attention", binding: "Alt+ArrowDown" });
    expect(withPreset(keymap, changes)["next-attention"]).toBeUndefined();
  });

  it("keeps the user's own send entries and adds after them", () => {
    const keymap: Keymap = { send: [{ key: "Cmd+ArrowLeft", bytes: "\u0002" }] };
    const changes = presetChanges(keymap, KEYMAP_PRESETS.mac);
    expect(changes).toContainEqual({ kind: "taken", action: "send", binding: "Cmd+ArrowLeft" });
    expect(withPreset(keymap, changes).send).toEqual([
      { key: "Cmd+ArrowLeft", bytes: "\u0002" },
      { key: "Cmd+ArrowRight", bytes: "\u0005" },
      { key: "Cmd+Backspace", bytes: "\u0015" },
    ]);
  });

  // After the set is in, every line says it is set — the Mac's send entries too, not "already used".
  it.each([["mac"], ["other"]] as const)("changes nothing a second time, and says so (%s)", (platform) => {
    const once = withPreset({}, presetChanges({}, KEYMAP_PRESETS[platform]));
    const again = presetChanges(once, KEYMAP_PRESETS[platform]);
    expect(again.every((c) => c.kind === "kept" || c.kind === "kept-send")).toBe(true);
    expect(withPreset(once, again)).toEqual(once);
  });

  // "Set already" must mean the key sends those bytes: an action on it, or an earlier send, wins.
  it.each<[string, Keymap]>([
    ["an action holds the key", { "pane-tools": "Cmd+Backspace", send: [{ key: "Cmd+Backspace", bytes: "\u0015" }] }],
    ["only a sequence starts with the key", { send: [{ key: "Cmd+Backspace x", bytes: "\u0015" }] }],
    [
      "an earlier send holds the key",
      {
        send: [
          { key: "Cmd+Backspace", bytes: "x" },
          { key: "Cmd+Backspace", bytes: "\u0015" },
        ],
      },
    ],
  ])("does not call a send entry set when %s", (_, keymap) => {
    expect(presetChanges(keymap, KEYMAP_PRESETS.mac)).toContainEqual({ kind: "taken", action: "send", binding: "Cmd+Backspace" });
  });

  it("calls a send entry on the same key with other bytes taken, not set", () => {
    const changes = presetChanges({ send: [{ key: "Cmd+ArrowLeft", bytes: "x" }] }, KEYMAP_PRESETS.mac);
    expect(changes).toContainEqual({ kind: "taken", action: "send", binding: "Cmd+ArrowLeft" });
  });
});

// #2693. Keys held by entries this version does not know (the file keeps them) are taken like any other.
describe("presetChanges with held keys", () => {
  it("does not add a key an unknown entry holds, as a whole key or as the first of two", () => {
    const changes = presetChanges({}, KEYMAP_PRESETS.other, ["Alt+ArrowLeft", "Alt+ArrowRight x"]);
    expect(changes).toContainEqual({ kind: "taken", action: "zoom-prev", binding: "Alt+ArrowLeft" });
    expect(changes).toContainEqual({ kind: "taken", action: "zoom-next", binding: "Alt+ArrowRight" });
    expect(changes).toContainEqual({ kind: "add", action: "zoom-toggle", binding: "Alt+ArrowUp" });
  });

  it("ignores a held value that is not a key", () => {
    expect(presetChanges({}, KEYMAP_PRESETS.other, ["not a key ++"])).toEqual(presetChanges({}, KEYMAP_PRESETS.other));
  });
});

describe("reservedBindings", () => {
  it("takes the string values of the unknown entries", () => {
    expect(reservedBindings({ "future-left": "Alt+ArrowLeft", later: { nested: true }, other: "F9" })).toEqual(["Alt+ArrowLeft", "F9"]);
  });

  it.each([[undefined], [null], ["Alt+x"], [["Alt+x"]]])("has none for %j", (input) => {
    expect(reservedBindings(input)).toEqual([]);
  });
});

describe("isPresetChangeList", () => {
  it("accepts the lists presetChanges draws", () => {
    expect(isPresetChangeList(presetChanges({ "zoom-toggle": "F8" }, KEYMAP_PRESETS.mac, ["Alt+ArrowDown"]))).toBe(true);
    expect(isPresetChangeList([])).toBe(true);
  });

  it.each([
    [null],
    ["x"],
    [[null]],
    [[{ kind: "add" }]],
    [[{ kind: "remove", binding: "F8" }]],
    [[{ kind: "add", action: "not-an-action", binding: "F8" }]],
    [[{ kind: "add", action: "zoom-toggle", binding: 8 }]],
    [[{ kind: "add", binding: "a" }]],
    [[{ kind: "kept", action: "zoom-toggle", binding: "a" }]],
    [[{ kind: "add-send", binding: "Cmd+ArrowLeft" }]],
    [[{ kind: "taken", binding: "F8" }]],
    [[{ kind: "toString", binding: "F8" }]],
  ])("refuses %j", (value) => {
    expect(isPresetChangeList(value)).toBe(false);
  });
});
