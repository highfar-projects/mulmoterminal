// #2533. A pick is remembered for the next opening. Its own file because CommandPalette.spec.ts is
// at the length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, providePaletteHost } from "../../../src/composables/commandPalette";

vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: false }) }));
vi.mock("../../../src/composables/usePaletteWikiPages", async () => {
  const { ref } = await import("vue");
  return { usePaletteWikiPages: () => ({ pages: ref([]) }) };
});

const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
let withdraw: () => void = () => {};
afterEach(() => {
  withdraw();
  closeCommandPalette();
  localStorage.clear();
  document.body.innerHTML = "";
});

const openWith = async (text: string) => {
  withdraw = providePaletteHost({ run: vi.fn(), zoomed: () => true, available: () => true, manualOrder: () => true, filesOpen: () => false });
  openCommandPalette();
  const w = mount(CommandPalette, { attachTo: document.body });
  await flushPromises();
  const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
  if (!input) throw new Error("no input");
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  return w;
};
const enter = async () => {
  document.querySelector('[data-testid="command-palette"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await flushPromises();
};
const remembered = (): string[] => Object.keys(JSON.parse(localStorage.getItem("mt-palette-frecency") ?? "{}"));

describe("CommandPalette — frecency", () => {
  it("remembers a picked action, and the next opening lists it first", async () => {
    const first = await openWith("next-attention");
    await enter();
    expect(remembered()).toEqual(["next-attention"]);
    first.unmount();
    const next = await openWith("");
    expect(document.querySelector("[data-index='0']")?.getAttribute("data-action")).toBe("next-attention");
    next.unmount();
  });

  it("does not remember a hand-off, which names something else next time", async () => {
    const w = await openWith("/ app.ts");
    await enter();
    expect(remembered()).toEqual([]);
    w.unmount();
  });
});
