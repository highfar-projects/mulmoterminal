// #2546. The second panel: Tab on a row, then an action. Its own file because CommandPalette.spec.ts
// is at the length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, paletteOpen, providePaletteHost } from "../../../src/composables/commandPalette";
import { useAppConfig } from "../../../src/composables/useAppConfig";

vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: false }) }));
vi.mock("../../../src/composables/usePaletteWikiPages", async () => {
  const { ref } = await import("vue");
  return { usePaletteWikiPages: () => ({ pages: ref([]) }) };
});
const posted = vi.hoisted(() => ({ calls: [] as [string, unknown][], ok: true }));
vi.mock("../../../src/composables/postConfigField", () => ({
  postConfigField: async (field: string, value: unknown) => {
    posted.calls.push([field, value]);
    return posted.ok ? { ok: true, value } : { ok: false };
  },
}));

const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
let withdraw: () => void = () => {};
afterEach(() => {
  withdraw();
  closeCommandPalette();
  useAppConfig().paletteFavorites.value = [];
  posted.calls.length = 0;
  posted.ok = true;
  document.body.innerHTML = "";
});

const openWith = async (text: string) => {
  const run = vi.fn();
  withdraw = providePaletteHost({ run, zoomed: () => true, available: () => true, manualOrder: () => true, filesOpen: () => false });
  openCommandPalette();
  const w = mount(CommandPalette, { attachTo: document.body });
  await flushPromises();
  const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
  if (!input) throw new Error("no input");
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  return { w, run };
};
const press = async (key: string, shiftKey = false) => {
  document.querySelector('[data-testid="command-palette"]')?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
  await flushPromises();
};
const actionIds = () => [...document.querySelectorAll("[data-action-id]")].map((element) => element.getAttribute("data-action-id"));
const pickAction = async (id: string) => {
  document.querySelector<HTMLElement>(`[data-action-id="${id}"]`)?.click();
  await flushPromises();
};

describe("CommandPalette — the second panel", () => {
  it("opens on Tab with the row's actions, and Esc goes back without closing", async () => {
    const { w } = await openWith("next-attention");
    await press("Tab");
    expect(actionIds()).toEqual(["run", "favorite-add", "copy-key"]);
    await press("Escape");
    expect(actionIds()).toEqual([]);
    expect(paletteOpen.value).toBe(true);
    expect(document.querySelector("[data-index='0']")?.getAttribute("data-action")).toBe("next-attention");
    w.unmount();
  });

  it("runs the row from the panel", async () => {
    const { w, run } = await openWith("next-attention");
    await press("Tab");
    await press("Enter");
    expect(run).toHaveBeenCalledWith("next-attention");
    w.unmount();
  });

  it("adds the row to the favorites in the config, and takes it out again", async () => {
    const { w } = await openWith("next-attention");
    await press("Tab");
    await pickAction("favorite-add");
    expect(posted.calls).toEqual([["paletteFavorites", ["next-attention"]]]);
    expect(useAppConfig().paletteFavorites.value).toEqual(["next-attention"]);
    expect(paletteOpen.value).toBe(true);
    await press("Tab");
    expect(actionIds()).toContain("favorite-remove");
    await pickAction("favorite-remove");
    expect(posted.calls.at(-1)).toEqual(["paletteFavorites", []]);
    w.unmount();
  });

  it("says so when the favorites cannot be saved", async () => {
    posted.ok = false;
    const { w } = await openWith("next-attention");
    await press("Tab");
    await pickAction("favorite-add");
    expect(document.querySelector('[data-testid="command-palette-error"]')?.textContent).toBeTruthy();
    expect(useAppConfig().paletteFavorites.value).toEqual([]);
    w.unmount();
  });

  it("copies the row's key", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { w } = await openWith("next-attention");
    await press("Tab");
    await pickAction("copy-key");
    expect(writeText).toHaveBeenCalledWith("next-attention");
    w.unmount();
  });

  it("closes when the text changes, back to the rows it now lists", async () => {
    const { w } = await openWith("next-attention");
    await press("Tab");
    const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
    if (input) {
      input.value = "zoom";
      input.dispatchEvent(new Event("input"));
    }
    await flushPromises();
    expect(actionIds()).toEqual([]);
    w.unmount();
  });
});
