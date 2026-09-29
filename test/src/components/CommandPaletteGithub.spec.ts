// #2517. A PR or Issue row opens it on GitHub, in a new tab. Its own file because
// CommandPalette.spec.ts is at the length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, paletteOpen } from "../../../src/composables/commandPalette";

vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: false }) }));
vi.mock("../../../src/composables/usePaletteWikiPages", async () => {
  const { ref } = await import("vue");
  return { usePaletteWikiPages: () => ({ pages: ref([]) }) };
});
const offeredWith = vi.hoisted(() => ({ offered: null as (() => boolean) | null }));
vi.mock("../../../src/composables/usePaletteGithubItems", async () => {
  const { ref } = await import("vue");
  return {
    usePaletteGithubItems: (offered: () => boolean) => {
      offeredWith.offered = offered;
      return { items: ref([{ kind: "pr", repo: "acme/app", number: 12, title: "Fix login", url: "https://github.com/acme/app/pull/12" }]) };
    },
  };
});

const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
afterEach(() => {
  closeCommandPalette();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("CommandPalette — PRs and Issues", () => {
  it("opens a picked PR on GitHub in a new tab, and asks the GitHub view's gate", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    openCommandPalette();
    const w = mount(CommandPalette, { attachTo: document.body });
    await flushPromises();
    expect(offeredWith.offered?.()).toBe(false); // no repos configured in this test
    document.querySelector<HTMLElement>('[data-action="github:acme/app#12"]')?.click();
    await flushPromises();
    expect(opened).toHaveBeenCalledWith("https://github.com/acme/app/pull/12", "_blank", "noopener,noreferrer");
    expect(paletteOpen.value).toBe(false);
    w.unmount();
  });
});
