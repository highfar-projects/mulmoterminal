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
// The server's list, which may hold entries this tab never saw: a change is ONE entry against it.
const server = vi.hoisted(() => ({ calls: [] as unknown[], ok: true, onDisk: [] as string[] }));
vi.mock("../../../src/utils/fetchWithTimeout", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchWithTimeout: async (url: string, init?: { body?: string }) => {
    if (url !== "/api/config/palette-favorites") return new Response("{}", { status: 404 });
    const body: { key: string; favorite: boolean } = JSON.parse(init?.body ?? "{}");
    server.calls.push(body);
    if (!server.ok) return new Response("{}", { status: 500 });
    server.onDisk = [...server.onDisk.filter((key) => key !== body.key), ...(body.favorite ? [body.key] : [])];
    return new Response(JSON.stringify({ paletteFavorites: server.onDisk }));
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
  server.calls.length = 0;
  server.ok = true;
  server.onDisk = [];
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

  it("adds the row to the favorites one entry at a time, keeping what another tab added, and takes it out", async () => {
    server.onDisk = ["screen:wiki"]; // written elsewhere, never seen by this tab
    const { w } = await openWith("next-attention");
    await press("Tab");
    await pickAction("favorite-add");
    expect(server.calls).toEqual([{ key: "next-attention", favorite: true }]);
    expect(useAppConfig().paletteFavorites.value).toEqual(["screen:wiki", "next-attention"]);
    expect(paletteOpen.value).toBe(true);
    await press("Tab");
    expect(actionIds()).toContain("favorite-remove");
    await pickAction("favorite-remove");
    expect(server.calls.at(-1)).toEqual({ key: "next-attention", favorite: false });
    expect(useAppConfig().paletteFavorites.value).toEqual(["screen:wiki"]);
    w.unmount();
  });

  // The input names what is selected: the row, and while the panel is up, the action.
  it("points the input at the panel's selected action while the panel is up", async () => {
    const { w } = await openWith("next-attention");
    const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
    expect(input?.getAttribute("aria-activedescendant")).toBe("command-palette-row-0");
    await press("Tab");
    await press("ArrowDown");
    expect(input?.getAttribute("aria-activedescendant")).toBe("command-palette-action-1");
    expect(document.getElementById(input?.getAttribute("aria-controls") ?? "")).not.toBeNull();
    expect(document.getElementById("command-palette-action-1")).not.toBeNull();
    await press("Escape");
    expect(input?.getAttribute("aria-activedescendant")).toBe("command-palette-row-0");
    w.unmount();
  });

  it("says so when the favorites cannot be saved", async () => {
    server.ok = false;
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
