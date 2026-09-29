// #2523. A picked prompt goes back to the acting terminal's input, unsent. Its own file because
// CommandPalette.spec.ts is at the length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, paletteOpen, providePaletteTerminals } from "../../../src/composables/commandPalette";

vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: false }) }));
vi.mock("../../../src/composables/usePaletteWikiPages", async () => {
  const { ref } = await import("vue");
  return { usePaletteWikiPages: () => ({ pages: ref([]) }) };
});
vi.mock("../../../src/composables/usePalettePrompts", async () => {
  const { ref } = await import("vue");
  return { usePalettePrompts: () => ({ prompts: ref([{ index: 0, text: "fix the login\nand the tests" }]) }) };
});
const inserted = vi.hoisted(() => [] as [string, string][]);
vi.mock("../../../src/composables/useTerminalConnections", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  insertText: (key: string, text: string) => inserted.push([key, text]),
}));

const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
afterEach(() => {
  closeCommandPalette();
  document.body.innerHTML = "";
});

describe("CommandPalette — past prompts", () => {
  it("brings the acting terminal forward and puts the whole prompt at its input", async () => {
    const goTo = vi.fn();
    const withdraw = providePaletteTerminals({
      list: () => [],
      goTo,
      current: () => 4,
      launchDirs: () => [],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
      promptSource: () => ({ uid: 4, slotKey: "cell-4", session: "s-4", agent: "claude", cwd: "/w" }),
    });
    openCommandPalette();
    const w = mount(CommandPalette, { attachTo: document.body });
    await flushPromises();
    document.querySelector<HTMLElement>('[data-action="prompt:0"]')?.click();
    await flushPromises();
    expect(goTo).toHaveBeenCalledWith(4);
    expect(inserted).toEqual([["cell-4", "fix the login\nand the tests"]]);
    expect(paletteOpen.value).toBe(false);
    withdraw();
    w.unmount();
  });
});
