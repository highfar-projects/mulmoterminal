import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import CommandPalette from "../../../src/components/CommandPalette.vue";

const opened = vi.hoisted(() => [] as string[]);
const voice = vi.hoisted(() => ({ capable: false }));
vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: voice.capable }) }));
vi.mock("../../../src/composables/paletteScreenOpeners", () => ({
  SCREEN_OPENERS: new Proxy({}, { get: (_target, screen: string) => () => opened.push(screen) }),
}));
import { closeCommandPalette, openCommandPalette, paletteOpen, providePaletteHost, providePaletteTerminals } from "../../../src/composables/commandPalette";
import { setActiveKeymap } from "../../../src/composables/activeKeymap";
import { requestedSettingsTab, settingsOpen } from "../../../src/composables/settingsOpener";

// #2266. The palette runs what is picked through the grid's host, and nothing that cannot run.
// jsdom has no layout and no scrollIntoView; the palette calls it whenever the selection moves.
const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
let withdraw: () => void = () => {};
const host = (zoomed: boolean, available = true) => {
  const run = vi.fn();
  withdraw = providePaletteHost({ run, zoomed: () => zoomed, available: () => available, manualOrder: () => true });
  return run;
};

const mountPalette = async () => {
  openCommandPalette();
  const w = mount(CommandPalette, { attachTo: document.body });
  await flushPromises();
  return w;
};
const panel = () => document.querySelector<HTMLElement>('[data-testid="command-palette"]');
const input = () => document.querySelector<HTMLInputElement>('[data-testid="command-palette-input"]');
const key = async (k: string) => {
  panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  await flushPromises();
};
const type = async (text: string) => {
  const el = input();
  if (!el) throw new Error("no input");
  el.value = text;
  el.dispatchEvent(new Event("input"));
  await flushPromises();
};

afterEach(() => {
  withdraw();
  closeCommandPalette();
  setActiveKeymap(null);
  document.body.innerHTML = "";
});

describe("CommandPalette", () => {
  it("narrows to what is typed and runs it on Enter, closing itself", async () => {
    const run = host(true);
    const w = await mountPalette();
    await type("find");
    await key("Enter");
    expect(run).toHaveBeenCalledWith("files-find");
    expect(paletteOpen.value).toBe(false);
    w.unmount();
  });

  it("does not run an action the view cannot run, and stays open", async () => {
    const run = host(false);
    const w = await mountPalette();
    await type("find");
    await key("Enter");
    expect(run).not.toHaveBeenCalled();
    expect(paletteOpen.value).toBe(true);
    expect(document.body.textContent).toContain("Needs an enlarged terminal");
    w.unmount();
  });

  it("shows the key an action is bound to", async () => {
    host(true);
    setActiveKeymap({ "files-find": "Cmd+k p" });
    const w = await mountPalette();
    const row = document.querySelector('[data-action="files-find"]');
    expect(row?.textContent).toContain("Cmd+k p");
    w.unmount();
  });

  it("moves the selection with the arrows", async () => {
    const run = host(true);
    const w = await mountPalette();
    await key("ArrowDown");
    await key("Enter");
    const second = document.querySelectorAll('[data-testid="command-palette-row"]')[1]?.getAttribute("data-action");
    expect(run).toHaveBeenCalledWith(second);
    w.unmount();
  });

  it("closes on Escape without running anything", async () => {
    const run = host(true);
    const w = await mountPalette();
    await key("Escape");
    expect(paletteOpen.value).toBe(false);
    expect(run).not.toHaveBeenCalled();
    w.unmount();
  });

  it("puts the cursor in the search box", async () => {
    host(true);
    const w = await mountPalette();
    expect(document.activeElement).toBe(input());
    w.unmount();
  });

  it("runs nothing while the grid is not in front", async () => {
    const run = host(true, false);
    const w = await mountPalette();
    await type("launch");
    await key("Enter");
    expect(run).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Only while the terminal grid is in front");
    w.unmount();
  });

  // The list scrolls; a row the arrows reach below its edge must come into view before Enter runs it.
  it("scrolls the row the arrows reach into view", async () => {
    host(true);
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    const w = await mountPalette();
    await key("ArrowUp"); // wraps to the last row
    Element.prototype.scrollIntoView = noScroll;
    const rows = document.querySelectorAll('[data-testid="command-palette-row"]');
    expect(scrolled.at(-1)).toBe(rows[rows.length - 1]);
    w.unmount();
  });

  it("leaves Enter to an IME that is composing", async () => {
    const run = host(true);
    const w = await mountPalette();
    panel()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    await flushPromises();
    expect(run).not.toHaveBeenCalled();
    expect(paletteOpen.value).toBe(true);
    w.unmount();
  });

  // #2441. A screen needs no grid: it runs where every action is disabled, and closes the palette.
  it("opens a screen from a screen row, even while the grid is not in front", async () => {
    opened.length = 0;
    host(false, false);
    const w = await mountPalette();
    await type("wiki");
    await key("Enter");
    expect(opened).toEqual(["wiki"]);
    expect(paletteOpen.value).toBe(false);
    w.unmount();
  });

  it("draws a screen row with its icon and no key column", async () => {
    host(true);
    const w = await mountPalette();
    const row = document.querySelector('[data-action="screen:files"]');
    expect(row?.textContent).toContain("folder_open");
    expect(row?.textContent).not.toContain("No key");
    w.unmount();
  });

  // #2446. A terminal row goes to that terminal, from wherever the palette is open.
  it("goes to a terminal picked by part of its path", async () => {
    host(false, false);
    const goTo = vi.fn();
    const withdrawTerminals = providePaletteTerminals({ list: () => [{ uid: 5, path: "~/work/app", detail: "claude", keywords: "" }], goTo });
    const w = await mountPalette();
    await type("work/app");
    await key("Enter");
    expect(goTo).toHaveBeenCalledWith(5);
    expect(paletteOpen.value).toBe(false);
    withdrawTerminals();
    w.unmount();
  });

  // #2450. A Settings section opens Settings on that section, from any screen.
  it("opens Settings on a section picked by name", async () => {
    host(false, false);
    const w = await mountPalette();
    await type(i18n.global.t("settings.tabs.shortcuts"));
    await key("Enter");
    expect(settingsOpen.value).toBe(true);
    expect(requestedSettingsTab.value).toBe("shortcuts");
    settingsOpen.value = false;
    requestedSettingsTab.value = null;
    w.unmount();
  });

  it("offers the Voice section only where the machine can transcribe", async () => {
    host(true);
    voice.capable = false;
    const without = await mountPalette();
    expect(document.querySelector('[data-action="settings:voice"]')).toBeNull();
    without.unmount();
    voice.capable = true;
    const withVoice = await mountPalette();
    expect(document.querySelector('[data-action="settings:voice"]')).not.toBeNull();
    voice.capable = false;
    withVoice.unmount();
  });
});
