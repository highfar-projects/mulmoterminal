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

const collection = vi.hoisted(() => ({ error: null as string | null }));
vi.mock("../../../src/composables/usePaletteCollectionActions", async () => {
  const { ref } = await import("vue");
  return {
    usePaletteCollectionActions: () => ({
      groups: ref([{ slug: "inv", title: "Invoices", icon: "database", actions: [{ id: "sum", label: "Summarise" }] }]),
      run: async () => collection.error,
    }),
  };
});

vi.mock("../../../src/composables/usePaletteResumes", async () => {
  const { ref } = await import("vue");
  return {
    usePaletteResumes: () => ({
      resumes: ref([{ id: "s1", title: "Fix login", mtime: 0, cwd: "/w", account: null }]),
      recheck: async () => null,
    }),
  };
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

  // A collection's slug names another collection in another project, so its actions are not
  // remembered, whether they ran or not.
  it("does not remember a collection action", async () => {
    collection.error = null;
    const w = await openWith("Invoices: Summarise");
    await enter();
    expect(remembered()).toEqual([]);
    w.unmount();
  });

  // A resume someone else took in the meantime did not run here, so it is not remembered.
  it("does not remember a resume that was taken before it ran", async () => {
    const w = await openWith("Resume: Fix login");
    await enter();
    expect(remembered()).toEqual([]);
    w.unmount();
  });
});
