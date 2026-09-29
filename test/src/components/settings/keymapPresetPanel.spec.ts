import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { activeKeymap, setActiveKeymap } from "../../../../src/composables/activeKeymap";
import type { Keymap } from "../../../../common/keymap";

// #2581. The recommended keys in Settings: what applying them adds, and the whole keymap written.
const { postConfigField } = vi.hoisted(() => ({ postConfigField: vi.fn() }));
vi.mock("../../../../src/composables/postConfigField", () => ({ postConfigField }));
const KeymapPresetPanel = (await import("../../../../src/components/settings/KeymapPresetPanel.vue")).default;

const panelFor = (keymap: Keymap, platform: "mac" | "other" = "other") => {
  setActiveKeymap(keymap);
  return mount(KeymapPresetPanel, { props: { platform } });
};
const kinds = (w: ReturnType<typeof panelFor>) => w.findAll('[data-testid="keymap-preset-change"]').map((li) => li.attributes("data-kind"));

beforeEach(() => postConfigField.mockReset());

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
    expect(w.find('[role="status"]').exists()).toBe(true);
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
