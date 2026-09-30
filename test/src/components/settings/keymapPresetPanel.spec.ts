import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { activeKeymap, setActiveKeymap } from "../../../../src/composables/activeKeymap";
import type { Keymap } from "../../../../common/keymap";

// #2581. The recommended keys in Settings: what applying them adds, what is sent, and what the panel
// does with each answer. The server works the additions out on the file (config-routes spec).
const { applyKeymapPreset } = vi.hoisted(() => ({ applyKeymapPreset: vi.fn() }));
vi.mock("../../../../src/components/settings/keymapPresetApi", () => ({ applyKeymapPreset }));
const KeymapPresetPanel = (await import("../../../../src/components/settings/KeymapPresetPanel.vue")).default;

const panelFor = (keymap: Keymap, platform: "mac" | "other" = "other") => {
  setActiveKeymap(keymap);
  return mount(KeymapPresetPanel, { props: { platform } });
};
const kinds = (w: ReturnType<typeof panelFor>) => w.findAll('[data-testid="keymap-preset-change"]').map((li) => li.attributes("data-kind"));
const status = (w: ReturnType<typeof panelFor>) => w.get('[data-testid="keymap-preset-status"]').text();
const press = async (w: ReturnType<typeof panelFor>) => {
  await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
  await flushPromises();
};

beforeEach(() => applyKeymapPreset.mockReset());

describe("KeymapPresetPanel", () => {
  it("lists what the set adds and what it leaves alone", () => {
    const w = panelFor({ "zoom-toggle": "F8" });
    expect(kinds(w)).toEqual(["kept", "add", "add", "add"]);
    expect(w.text()).toContain("F8");
  });

  // The list the reader was shown goes with the request, so the server can refuse when its file
  // would make it different.
  it("sends the platform and the list shown, and adopts the keymap the server saved", async () => {
    applyKeymapPreset.mockResolvedValue({ status: "saved", keymap: { "zoom-toggle": "Alt+ArrowUp", "files-find": "Cmd+Shift+f" } });
    const w = panelFor({});
    await press(w);
    expect(applyKeymapPreset).toHaveBeenCalledWith("other", expect.arrayContaining([{ kind: "add", action: "zoom-toggle", binding: "Alt+ArrowUp" }]));
    expect(activeKeymap.value["files-find"]).toBe("Cmd+Shift+f");
    expect(status(w)).toBe("Added. The keys work now.");
  });

  it("redraws the list from the file's keymap when the server says it changed", async () => {
    applyKeymapPreset.mockResolvedValue({ status: "changed", keymap: { "zoom-toggle": "F8" } });
    const w = panelFor({});
    expect(kinds(w)[0]).toBe("add");
    await press(w);
    expect(kinds(w)[0]).toBe("kept");
    expect(status(w)).toContain("changed");
  });

  it("keeps the keymap and says so when the save fails", async () => {
    applyKeymapPreset.mockResolvedValue({ status: "failed" });
    const w = panelFor({ "files-find": "F2" });
    await press(w);
    expect(activeKeymap.value).toEqual({ "files-find": "F2" });
    expect(status(w)).toBe("Could not save the keymap.");
  });

  // "Added" is about the list it was said over: once the keys skill removes a key, the offer is new.
  it("drops the outcome once the keymap moves on", async () => {
    applyKeymapPreset.mockResolvedValue({ status: "saved", keymap: { "zoom-toggle": "Alt+ArrowUp" } });
    const w = panelFor({});
    await press(w);
    expect(status(w)).toBe("Added. The keys work now.");
    setActiveKeymap({});
    await flushPromises();
    expect(status(w)).toBe("");
    setActiveKeymap({ "zoom-toggle": "Alt+ArrowUp" }); // the same list again: nothing was attempted
    await flushPromises();
    expect(status(w)).toBe("");
  });

  it("offers nothing to add once the set is in", () => {
    const w = panelFor({ "zoom-toggle": "Alt+ArrowUp", "next-attention": "Alt+ArrowDown", "zoom-prev": "Alt+ArrowLeft", "zoom-next": "Alt+ArrowRight" });
    expect(w.get('[data-testid="keymap-preset-apply"]').attributes("disabled")).toBeDefined();
  });

  it("offers the Mac set on a Mac", () => {
    const w = panelFor({}, "mac");
    expect(kinds(w)).toEqual(["add", "add", "add-send", "add-send", "add-send"]);
  });
});
