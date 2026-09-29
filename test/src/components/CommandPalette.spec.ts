import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import CommandPalette from "../../../src/components/CommandPalette.vue";

const opened = vi.hoisted(() => [] as string[]);
const started = vi.hoisted(() => [] as unknown[][]);
const resumeSources = vi.hoisted(() => ({
  agent: null as (() => string) | null,
  dir: null as (() => string | null) | null,
  taken: false,
  gate: null as Promise<void> | null,
}));
vi.mock("../../../src/composables/usePaletteResumes", async () => {
  const { computed } = await import("vue");
  return {
    usePaletteResumes: (sources: { agent: () => string; dir: () => string | null }) => {
      resumeSources.agent = sources.agent;
      resumeSources.dir = sources.dir;
      const resumes = computed(() => (sources.dir() ? [{ id: "k-9", title: "Fix login", mtime: 0, cwd: "/home/me/work/app", account: null }] : []));
      const recheck = async (resume: unknown) => {
        await resumeSources.gate;
        return resumeSources.taken ? null : resume;
      };
      return { resumes, recheck };
    },
  };
});
vi.mock("../../../src/composables/useNewTerminal", () => ({
  openTerminalAt: (...args: unknown[]) => started.push(args),
  openCellAt: (...args: unknown[]) => started.push(["cell", ...args]),
}));
const voice = vi.hoisted(() => ({ capable: false }));
const collection = vi.hoisted(() => ({
  runCollectionAction: vi.fn(async () => ({ ok: true, data: { prompt: "SEED", role: "general" } })),
  startChat: vi.fn(),
}));
const scopes = vi.hoisted(() => ({ active: null as string | null, made: [] as (() => string | null)[] }));
vi.mock("../../../src/composables/collectionUi", () => ({
  makeCollectionUi: (projectIdOf: () => string | null) => {
    scopes.made.push(projectIdOf);
    return collection;
  },
}));
vi.mock("../../../src/composables/collectionSurface", () => ({ activeCollectionProjectId: () => scopes.active }));
vi.mock("../../../src/composables/voiceModelStatus", () => ({ fetchVoiceInputStatus: async () => ({ capable: voice.capable }) }));
vi.mock("../../../src/composables/paletteScreenOpeners", () => ({
  SCREEN_OPENERS: new Proxy({}, { get: (_target, screen: string) => () => opened.push(screen) }),
}));
import {
  closeCommandPalette,
  openCommandPalette,
  paletteGridView,
  paletteOpen,
  providePaletteHost,
  providePaletteTerminals,
} from "../../../src/composables/commandPalette";
import { setActiveKeymap } from "../../../src/composables/activeKeymap";
import { requestedSettingsTab, settingsOpen } from "../../../src/composables/settingsOpener";
import { providePaletteHeaderEntries } from "../../../src/composables/paletteHeaderEntries";
import { useTheme } from "../../../src/composables/useTheme";
import { useSoundEnabled } from "../../../src/composables/useSoundEnabled";
import { uiLanguage } from "../../../src/composables/uiLanguage";

// #2266. The palette runs what is picked through the grid's host, and nothing that cannot run.
// jsdom has no layout and no scrollIntoView; the palette calls it whenever the selection moves.
const noScroll = function (this: Element): void {};
beforeAll(() => {
  Element.prototype.scrollIntoView = noScroll;
});
let withdraw: () => void = () => {};
const host = (zoomed: boolean, available = true) => {
  const run = vi.fn();
  withdraw = providePaletteHost({ run, zoomed: () => zoomed, available: () => available, manualOrder: () => true, filesOpen: () => false });
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

// Open the palette, click one row by its key, and close it again.
const pickRow = async (id: string) => {
  const w = await mountPalette();
  document.querySelector<HTMLElement>(`[data-action="${id}"]`)?.click();
  await flushPromises();
  w.unmount();
};

afterEach(() => {
  withdraw();
  closeCommandPalette();
  setActiveKeymap(null);
  started.length = 0;
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
    const withdrawTerminals = providePaletteTerminals({
      list: () => [{ uid: 5, path: "~/work/app", detail: "claude", keywords: "" }],
      goTo,
      current: () => null,
      launchDirs: () => [],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
    });
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

  // The Language row carries its English, as the Settings sidebar does: the way back from a
  // language the user cannot read.
  it("names the Language section with its English beside it in another language", async () => {
    host(true);
    i18n.global.locale.value = "ja";
    const w = await mountPalette();
    expect(document.querySelector('[data-action="settings:language"]')?.textContent).toContain("Language");
    i18n.global.locale.value = "en";
    w.unmount();
  });

  // #2455. Theme, language and sound switch in place, through the setters Settings uses.
  it("switches the theme, the language and the sound from their rows", async () => {
    host(true);
    const { themeId, setTheme } = useTheme();
    const sound = useSoundEnabled();
    const before = { theme: themeId.value, language: uiLanguage.value, sound: sound.enabled.value };
    await pickRow("choice:theme:nord");
    expect(themeId.value).toBe("nord");
    await pickRow("choice:language:ja");
    expect(uiLanguage.value).toBe("ja");
    await pickRow("choice:sound");
    expect(sound.enabled.value).toBe(!before.sound);
    setTheme(before.theme);
    uiLanguage.value = before.language;
    sound.enabled.value = before.sound;
    i18n.global.locale.value = "en";
  });

  // #2458. A view pick changes the view only when it is not already the one shown: the switch
  // underneath is a toggle.
  it("switches the grid's view and order, and leaves the view alone when it is already shown", async () => {
    host(true);
    const toggleListMode = vi.fn();
    const setSortMode = vi.fn();
    paletteGridView.value = { listMode: () => true, toggleListMode, sortMode: () => "manual", setSortMode };
    await pickRow("choice:view:list");
    expect(toggleListMode).not.toHaveBeenCalled();
    await pickRow("choice:view:strip");
    expect(toggleListMode).toHaveBeenCalledTimes(1);
    await pickRow("choice:sort:priority");
    expect(setSortMode).toHaveBeenCalledWith("priority");
    paletteGridView.value = null;
  });

  // #2462. Picking a symbol from `?` narrows the search and keeps the palette open.
  it("puts a symbol picked from ? in the box, and stays open", async () => {
    host(true);
    const w = await mountPalette();
    await type("?");
    await key("Enter");
    expect(paletteOpen.value).toBe(true);
    expect(input()?.value).toBe(">");
    w.unmount();
  });

  // #2465. The acting terminal's commands and header buttons are rows, run through that terminal.
  it("lists the acting terminal's commands and header buttons, and runs a pick through it", async () => {
    host(true);
    const run = vi.fn();
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 5,
      launchDirs: () => [],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
    });
    const withdrawEntries = providePaletteHeaderEntries("cell-5", {
      buttons: () => [{ id: "tools", label: "Tools", items: [{ id: "lint", label: "Lint", run: "shell" }] }],
      commands: () => [{ id: "release", label: "Release", run: "input", text: "go" }],
      run,
    });
    const w = await mountPalette();
    expect(document.querySelector('[data-action="command:lint"]')?.textContent).toContain("Tools › Lint");
    document.querySelector<HTMLElement>('[data-action="command:release"]')?.click();
    await flushPromises();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ id: "release", run: "input" }));
    expect(paletteOpen.value).toBe(false);
    withdrawEntries();
    withdrawTerminals();
    w.unmount();
  });

  it("lists no commands with no terminal to act on", async () => {
    host(true);
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => null,
      launchDirs: () => [],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
    });
    const withdrawEntries = providePaletteHeaderEntries("cell-5", {
      buttons: () => [],
      commands: () => [{ id: "release", label: "Release", run: "shell" }],
      run: vi.fn(),
    });
    const w = await mountPalette();
    expect(document.querySelector('[data-action="command:release"]')).toBeNull();
    withdrawEntries();
    withdrawTerminals();
    w.unmount();
  });

  // #2471. A collection's actions are read as the palette opens, and a pick starts the chat the
  // collection's own button would.
  it("lists collection actions and runs a pick as the collection's button does", async () => {
    host(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/collections/actions")
          ? new Response(JSON.stringify({ collections: [{ slug: "inv", title: "Invoices", icon: "receipt", actions: [{ id: "sum", label: "Summarise" }] }] }))
          : new Response("{}"),
      ),
    );
    const w = await mountPalette();
    const row = document.querySelector<HTMLElement>('[data-action="collection:inv:sum"]');
    expect(row?.textContent).toContain("Invoices: Summarise");
    row?.click();
    await flushPromises();
    expect(collection.runCollectionAction).toHaveBeenCalledWith("inv", "sum");
    expect(collection.startChat).toHaveBeenCalledWith("SEED", "general");
    vi.unstubAllGlobals();
    w.unmount();
  });

  // An agent action runs on the server (`dispatched`): there is no prompt, and no chat to start.
  it("starts no chat for an action the server ran itself", async () => {
    host(true);
    collection.startChat.mockClear();
    collection.runCollectionAction.mockResolvedValueOnce({ ok: true, data: { dispatched: true } } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ collections: [{ slug: "inv", title: "Invoices", icon: "receipt", actions: [{ id: "chase", label: "Chase" }] }] })),
      ),
    );
    const w = await mountPalette();
    document.querySelector<HTMLElement>('[data-action="collection:inv:chase"]')?.click();
    await flushPromises();
    expect(collection.runCollectionAction).toHaveBeenCalledWith("inv", "chase");
    expect(collection.startChat).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    w.unmount();
  });

  // A failed run keeps the palette open and says why, rather than closing on nothing.
  it("stays open and shows the error when a collection action fails", async () => {
    host(true);
    collection.runCollectionAction.mockResolvedValueOnce({ ok: false, error: "collection action 'sum' not found", status: 404 } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ collections: [{ slug: "inv", title: "Invoices", icon: "receipt", actions: [{ id: "sum", label: "Summarise" }] }] })),
      ),
    );
    const w = await mountPalette();
    document.querySelector<HTMLElement>('[data-action="collection:inv:sum"]')?.click();
    await flushPromises();
    expect(paletteOpen.value).toBe(true);
    expect(document.querySelector('[data-testid="command-palette-error"]')?.textContent).toContain("not found");
    vi.unstubAllGlobals();
    w.unmount();
  });

  // The rows came from one project; the run goes there even if the Collections surface moved on.
  it("runs an action in the project it was listed from", async () => {
    host(true);
    scopes.active = "project-a";
    scopes.made.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ collections: [{ slug: "inv", title: "Invoices", icon: "receipt", actions: [{ id: "sum", label: "Summarise" }] }] })),
      ),
    );
    const w = await mountPalette();
    scopes.active = "project-b";
    document.querySelector<HTMLElement>('[data-action="collection:inv:sum"]')?.click();
    await flushPromises();
    expect(scopes.made.at(-1)?.()).toBe("project-a");
    scopes.active = null;
    vi.unstubAllGlobals();
    w.unmount();
  });

  // A second pick while the first is still running does not run the action again.
  it("runs a collection action once, however often it is picked while running", async () => {
    host(true);
    collection.runCollectionAction.mockClear();
    let release: (value: unknown) => void = () => {};
    collection.runCollectionAction.mockReturnValueOnce(new Promise((resolve) => (release = resolve)) as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ collections: [{ slug: "inv", title: "Invoices", icon: "receipt", actions: [{ id: "sum", label: "Summarise" }] }] })),
      ),
    );
    const w = await mountPalette();
    const row = () => document.querySelector<HTMLElement>('[data-action="collection:inv:sum"]');
    row()?.click();
    row()?.click();
    await flushPromises();
    expect(collection.runCollectionAction).toHaveBeenCalledTimes(1);
    release({ ok: true, data: { prompt: "SEED", role: "general" } });
    await flushPromises();
    expect(paletteOpen.value).toBe(false);
    vi.unstubAllGlobals();
    w.unmount();
  });

  // #2484. A recent directory opens a new terminal there, next to the acting one, running the
  // default agent.
  it("opens a new terminal in a directory the grid lists, beside the acting terminal", async () => {
    host(true);
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 4,
      launchDirs: () => [{ path: "/home/me/work/app", label: "~/work/app" }],
      startDir: () => null,
      full: () => false,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    const row = document.querySelector<HTMLElement>('[data-action="launch:/home/me/work/app"]');
    expect(row?.textContent).toContain("~/work/app");
    row?.click();
    await flushPromises();
    expect(started).toEqual([["/home/me/work/app", "cell-4", "claude"]]);
    withdrawTerminals();
    w.unmount();
  });

  // A full grid would place nothing, so the row stays put with its reason and the palette stays open.
  it("does not start a terminal from a full grid", async () => {
    host(true);
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 4,
      launchDirs: () => [{ path: "/home/me/work/app", label: "~/work/app" }],
      startDir: () => null,
      full: () => true,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    document.querySelector<HTMLElement>('[data-action="launch:/home/me/work/app"]')?.click();
    await flushPromises();
    expect(started).toEqual([]);
    expect(paletteOpen.value).toBe(true);
    withdrawTerminals();
    w.unmount();
  });

  // #2487. An agent starts in the acting terminal's directory, beside it, as the launch panel builds it.
  it("starts a picked agent in the acting terminal's directory, beside it", async () => {
    host(true);
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 4,
      launchDirs: () => [],
      startDir: () => ({ path: "/home/me/work/app", label: "~/work/app" }),
      full: () => false,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    const row = document.querySelector<HTMLElement>('[data-action="start:agent:codex"]');
    expect(row?.textContent).toContain("~/work/app");
    row?.click();
    await flushPromises();
    expect(started).toEqual([["cell", { session: null, cwd: "/home/me/work/app", agent: "codex", autoStart: true }, "cell-4"]]);
    expect(paletteOpen.value).toBe(false);
    withdrawTerminals();
    w.unmount();
  });

  // #2498. A past conversation of the acting directory resumes beside it, in the default agent's history.
  it("resumes a picked conversation of the acting terminal's directory, beside it", async () => {
    host(true);
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 4,
      launchDirs: () => [],
      startDir: () => ({ path: "/home/me/work/app", label: "~/work/app" }),
      full: () => false,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    expect(resumeSources.dir?.()).toBe("/home/me/work/app");
    expect(resumeSources.agent?.()).toBe("claude");
    document.querySelector<HTMLElement>('[data-action="resume::k-9"]')?.click();
    await flushPromises();
    expect(started).toEqual([["cell", { session: "k-9", cwd: "/home/me/work/app" }, "cell-4"]]);
    withdrawTerminals();
    w.unmount();
  });

  // Taken since the palette opened: nothing is placed, and the palette stays open to say why.
  it("does not resume a conversation someone took after the palette listed it", async () => {
    host(true);
    resumeSources.taken = true;
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => 4,
      launchDirs: () => [],
      startDir: () => ({ path: "/home/me/work/app", label: "~/work/app" }),
      full: () => false,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    document.querySelector<HTMLElement>('[data-action="resume::k-9"]')?.click();
    await flushPromises();
    expect(started).toEqual([]);
    expect(paletteOpen.value).toBe(true);
    expect(document.querySelector('[data-testid="command-palette-error"]')?.textContent).toBeTruthy();
    resumeSources.taken = false;
    withdrawTerminals();
    w.unmount();
  });

  // A second Enter while the first resume is still being checked must not resume it twice.
  it("resumes once however often the row is picked while it is checked", async () => {
    host(true);
    let open: () => void = () => {};
    resumeSources.gate = new Promise<void>((resolve) => (open = resolve));
    const withdrawTerminals = providePaletteTerminals({
      list: () => [],
      goTo: vi.fn(),
      current: () => null,
      launchDirs: () => [],
      startDir: () => ({ path: "/home/me/work/app", label: "~/work/app" }),
      full: () => false,
      openSessionIds: () => [],
    });
    const w = await mountPalette();
    const row = document.querySelector<HTMLElement>('[data-action="resume::k-9"]');
    row?.click();
    row?.click();
    open();
    await flushPromises();
    expect(started).toHaveLength(1);
    resumeSources.gate = null;
    withdrawTerminals();
    w.unmount();
  });
});
