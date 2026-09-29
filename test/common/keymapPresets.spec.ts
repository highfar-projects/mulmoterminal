import { describe, it, expect } from "vitest";
import { KEYMAP_PRESETS, presetChanges, withPreset } from "../../common/keymapPresets";
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

  it("changes nothing a second time", () => {
    const once = withPreset({}, presetChanges({}, KEYMAP_PRESETS.other));
    const again = presetChanges(once, KEYMAP_PRESETS.other);
    expect(again.every((c) => c.kind === "kept")).toBe(true);
    expect(withPreset(once, again)).toEqual(once);
  });
});
