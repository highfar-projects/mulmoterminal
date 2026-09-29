import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { activeKeymap, setActiveKeymap } from "../../../../src/composables/activeKeymap";
import type { Keymap } from "../../../../common/keymap";

// #2581. The recommended keys in Settings: what applying them adds, and the whole keymap written.
const { postConfigField, savedKeymap } = vi.hoisted(() => ({ postConfigField: vi.fn(), savedKeymap: vi.fn() }));
vi.mock("../../../../src/composables/postConfigField", () => ({ postConfigField }));
vi.mock("../../../../src/components/settings/savedKeymap", () => ({ savedKeymap }));
const KeymapPresetPanel = (await import("../../../../src/components/settings/KeymapPresetPanel.vue")).default;

// `onDisk` is what the server has when the button is pressed; by default what the page loaded.
const panelFor = (keymap: Keymap, platform: "mac" | "other" = "other", onDisk: Keymap = keymap) => {
  setActiveKeymap(keymap);
  savedKeymap.mockResolvedValue(onDisk);
  return mount(KeymapPresetPanel, { props: { platform } });
};
const kinds = (w: ReturnType<typeof panelFor>) => w.findAll('[data-testid="keymap-preset-change"]').map((li) => li.attributes("data-kind"));

beforeEach(() => {
  postConfigField.mockReset();
  savedKeymap.mockReset();
});
const status = (w: ReturnType<typeof panelFor>) => w.get('[data-testid="keymap-preset-status"]').text();

describe("KeymapPresetPanel", () => {
  it("lists what the set adds and what it leaves alone", () => {
    const w = panelFor({ "zoom-toggle": "F8" });
    expect(kinds(w)).toEqual(["kept", "add", "add", "add"]);
    expect(w.text()).toContain("F8");
  });

  it("writes the whole keymap, the user's bindings included, and takes the saved one", async () => {
    postConfigField.mockImplementation(async (_field: string, value: unknown) => ({ ok: true, value }));
    const w = panelFor({ "files-find": "Cmd+Shift+f", "zoom-toggle": "F8" });
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(postConfigField).toHaveBeenCalledWith("keymap", {
      "files-find": "Cmd+Shift+f",
      "zoom-toggle": "F8",
      "zoom-prev": "Alt+ArrowLeft",
      "zoom-next": "Alt+ArrowRight",
      "next-attention": "Alt+ArrowDown",
    });
    expect(activeKeymap.value["next-attention"]).toBe("Alt+ArrowDown");
  });

  it("keeps the keymap and says so when the save fails", async () => {
    postConfigField.mockResolvedValue({ ok: false });
    const w = panelFor({});
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(activeKeymap.value).toEqual({});
    expect(status(w)).toBe("Could not save the keymap.");
  });

  // The keymap is written whole: a binding the keys skill (or another window) added since this page
  // loaded must survive, so the write is built on the keymap on disk now.
  it("builds the write on the keymap on disk, keeping what was added since the page loaded", async () => {
    postConfigField.mockImplementation(async (_field: string, value: unknown) => ({ ok: true, value }));
    const w = panelFor({}, "other", { "files-find": "Cmd+Shift+f" });
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(postConfigField).toHaveBeenCalledWith("keymap", expect.objectContaining({ "files-find": "Cmd+Shift+f", "zoom-toggle": "Alt+ArrowUp" }));
  });

  // If the keymap on disk changes what the list promised, nothing is written; the list is redrawn.
  it("writes nothing when the keymap on disk changes what the list said", async () => {
    const w = panelFor({}, "other", { "zoom-toggle": "F8" });
    expect(kinds(w)[0]).toBe("add");
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(postConfigField).not.toHaveBeenCalled();
    expect(kinds(w)[0]).toBe("kept");
    expect(status(w)).toContain("changed");
  });

  it("writes nothing when the keymap on disk cannot be read", async () => {
    const w = panelFor({});
    savedKeymap.mockResolvedValue(null);
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(postConfigField).not.toHaveBeenCalled();
    expect(status(w)).toBe("Could not save the keymap.");
  });

  it("says it was added, and nothing else, once it is", async () => {
    postConfigField.mockImplementation(async (_field: string, value: unknown) => ({ ok: true, value }));
    const w = panelFor({});
    await w.get('[data-testid="keymap-preset-apply"]').trigger("click");
    await flushPromises();
    expect(status(w)).toBe("Added. The keys work now.");
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
