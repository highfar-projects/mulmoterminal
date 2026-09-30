// The palette's `/` and `#` (#2512): the text goes to the grid's Files action and nothing is left
// behind. Its own file because CommandPalette.spec.ts is at the length limit.
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CommandPalette from "../../../src/components/CommandPalette.vue";
import { closeCommandPalette, openCommandPalette, paletteOpen, providePaletteHost } from "../../../src/composables/commandPalette";
import { takeFilesPanelSeed } from "../../../src/composables/filesPanelSeed";
import { provideFilesScreenHost } from "../../../src/composables/filesScreenHost";

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
  document.body.innerHTML = "";
});

const enlargedHost = () => {
  const run = vi.fn();
  withdraw = providePaletteHost({ run, zoomed: () => true, available: () => true, manualOrder: () => true, filesOpen: () => false });
  return run;
};
const mountPalette = async () => {
  openCommandPalette();
  const w = mount(CommandPalette, { attachTo: document.body });
  await flushPromises();
  return w;
};
const typeAndEnter = async (text: string) => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
  if (!input) throw new Error("no input");
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await flushPromises();
  document.querySelector('[data-testid="command-palette"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await flushPromises();
};

describe("CommandPalette — / and #", () => {
  it("hands what follows / to the Files finder while the grid runs the action", async () => {
    const run = enlargedHost();
    const taken: string[] = [];
    run.mockImplementation((action: "files-find") => taken.push(takeFilesPanelSeed(action)));
    const w = await mountPalette();
    await typeAndEnter("/ app.ts");
    expect(run).toHaveBeenCalledWith("files-find");
    expect(taken).toEqual(["app.ts"]);
    expect(paletteOpen.value).toBe(false);
    w.unmount();
  });

  // The grid can still refuse at the last moment; what it did not take must not wait for a later open.
  it("leaves no text behind when the grid does not take it", async () => {
    const run = enlargedHost();
    const w = await mountPalette();
    await typeAndEnter("# TODO");
    expect(run).toHaveBeenCalledWith("files-search");
    expect(takeFilesPanelSeed("files-search")).toBe("");
    w.unmount();
  });
});

// #2655. With the full-screen Files view up the grid is not in front, and the Files rows and `/` run
// on that view instead of being refused.
describe("CommandPalette — Files actions on the full-screen Files view", () => {
  const hiddenGrid = () => {
    const run = vi.fn();
    withdraw = providePaletteHost({ run, zoomed: () => false, available: () => false, manualOrder: () => true, filesOpen: () => false });
    return run;
  };

  it("runs a Files action row on the view, not the grid", async () => {
    const gridRun = hiddenGrid();
    const filesRun = vi.fn();
    const withdrawFiles = provideFilesScreenHost({ open: () => true, run: filesRun });
    const w = await mountPalette();
    document.querySelector<HTMLElement>('[data-action="files-tab-next"]')?.click();
    await flushPromises();
    expect(filesRun).toHaveBeenCalledWith("files-tab-next");
    expect(gridRun).not.toHaveBeenCalled();
    w.unmount();
    withdrawFiles();
  });

  it("hands what follows / to the view's finder", async () => {
    const gridRun = hiddenGrid();
    const taken: string[] = [];
    const withdrawFiles = provideFilesScreenHost({
      open: () => true,
      run: (action) => {
        if (action === "files-find") taken.push(takeFilesPanelSeed(action));
      },
    });
    const w = await mountPalette();
    await typeAndEnter("/ app.ts");
    expect(taken).toEqual(["app.ts"]);
    expect(gridRun).not.toHaveBeenCalled();
    w.unmount();
    withdrawFiles();
  });
});
