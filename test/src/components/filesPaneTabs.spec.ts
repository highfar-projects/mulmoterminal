import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";
import type { FilesPaneState } from "../../../src/components/filesPaneState";

const fakeEditor = fakeCmEditor("edited text");
let onChange: () => void = () => {};
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: (_host: HTMLElement, cb: () => void) => ((onChange = cb), fakeEditor) };
});

const FILES = ["a.md", "b.ts", "c.ts"];

interface Fs {
  writes: string[];
  /** Paths whose read fails, as a file deleted since it was remembered. */
  missing: Set<string>;
  /** Whether a save and a backup both fail, as with the server down. */
  unwritable: boolean;
}

function mockFs(): Fs {
  const fs: Fs = { writes: [], missing: new Set(), unwritable: false };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: FILES.map((name) => ({ name, dir: false, size: 1 })) }) };
    if (url.pathname.includes("/text")) {
      if (fs.missing.has(path)) return { ok: false, status: 404, json: async () => ({ error: `no such file: ${path}` }) };
      return { ok: true, json: async () => ({ text: `text of ${path}`, version: "v1" }) };
    }
    if (init?.method === "PUT" || init?.method === "POST") {
      if (fs.unwritable) return { ok: false, status: 500, json: async () => ({ error: "disk full" }) };
      if (url.pathname.includes("/write")) fs.writes.push(path);
    }
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
  return fs;
}

const snapshotOf = (w: VueWrapper): FilesPaneState => (w.vm as unknown as { snapshot: () => FilesPaneState }).snapshot();
const tabNames = (w: VueWrapper): string[] => w.findAll('[data-testid="files-tab"]').map((tab) => tab.attributes("data-path") ?? "");
const frontName = (w: VueWrapper): string | undefined => w.find('[data-testid="files-tab"][aria-selected="true"]').attributes("data-path");
const row = (w: VueWrapper, path: string) => w.find(`[data-testid="files-row"][data-path="${path}"]`);

async function mountPane(initialState: FilesPaneState | null = null): Promise<VueWrapper> {
  const w = mount(FilesPane, { props: { cwd: "/proj", initialState }, attachTo: document.body });
  await flushPromises();
  return w;
}

async function click(w: VueWrapper, path: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}): Promise<void> {
  await row(w, path).trigger("click", modifiers);
  await flushPromises();
}

describe("the Files pane's tabs (#2267)", () => {
  let fs: Fs;
  beforeEach(() => {
    localStorage.clear();
    fakeEditor.setDoc.mockClear();
    fakeEditor.goTo.mockClear();
    fs = mockFs();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows no strip for one file — a plain click replaces it, as before tabs", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts");

    expect(w.find('[data-testid="files-tabs"]').exists()).toBe(false);
    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["b.ts"]);
    expect(snapshotOf(w).activePath).toBe("b.ts");
  });

  it("opens a tab of its own on Cmd+click and on Ctrl+click, showing the strip", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await click(w, "c.ts", { ctrlKey: true });

    expect(tabNames(w)).toEqual(["a.md", "b.ts", "c.ts"]);
    expect(frontName(w)).toBe("c.ts");
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("text of c.ts", "c.ts");
  });

  it("goes to the tab a file already has instead of opening it twice", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await click(w, "a.md");
    await click(w, "a.md", { metaKey: true });

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("a.md");
  });

  it("replaces only the front tab on a plain click while several are open", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await w.findAll('[data-testid="files-tab"]')[0].trigger("click"); // a.md to the front
    await flushPromises();
    await click(w, "c.ts");

    expect(tabNames(w)).toEqual(["c.ts", "b.ts"]);
    expect(frontName(w)).toBe("c.ts");
  });

  it("opens a tab from the row menu", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    row(w, "c.ts").element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="files-row-action-open-tab"]')?.click();
    await flushPromises();

    expect(tabNames(w)).toEqual(["a.md", "c.ts"]);
    expect(frontName(w)).toBe("c.ts");
  });

  it("saves the tab being left, and puts each tab's place back when it returns", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    fakeEditor.goTo({ line: 40, col: 3 });
    onChange();
    await click(w, "b.ts", { metaKey: true });

    expect(fs.writes).toEqual(["a.md"]);
    expect(w.find('[data-testid="files-tab"][data-path="a.md"]').text()).not.toContain("●");

    await w.find('[data-testid="files-tab"][data-path="a.md"]').trigger("click");
    await flushPromises();
    expect(fakeEditor.goTo).toHaveBeenLastCalledWith({ line: 40, col: 3 });
  });

  it("marks the front tab unsaved while it has edits", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    onChange();
    await flushPromises();

    expect(w.find('[data-testid="files-tab"][data-path="b.ts"]').text()).toContain("●");
    expect(w.find('[data-testid="files-tab"][data-path="a.md"]').text()).not.toContain("●");
  });

  it("stays on the tab when its edits could be neither saved nor backed up", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    onChange();
    fs.unwritable = true;
    await w.find('[data-testid="files-tab"][data-path="a.md"]').trigger("click");
    await flushPromises();

    expect(frontName(w)).toBe("b.ts");
    expect(snapshotOf(w).activePath).toBe("b.ts");
  });

  it("closes the front tab to its right neighbour, saving it first", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await click(w, "c.ts", { metaKey: true });
    await w.find('[data-testid="files-tab"][data-path="b.ts"]').trigger("click");
    await flushPromises();
    onChange();
    await w.findAll('[data-testid="files-tab-close"]')[1].trigger("click");
    await flushPromises();

    expect(fs.writes).toContain("b.ts");
    expect(tabNames(w)).toEqual(["a.md", "c.ts"]);
    expect(frontName(w)).toBe("c.ts");
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("text of c.ts", "c.ts");
  });

  it("closes a tab behind the front without touching the file on screen", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    fakeEditor.setDoc.mockClear();
    await w.findAll('[data-testid="files-tab-close"]')[0].trigger("click");
    await flushPromises();

    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["b.ts"]);
    expect(w.find('[data-testid="files-tabs"]').exists()).toBe(false); // one tab: the header again
    expect(fakeEditor.setDoc).not.toHaveBeenCalled();
  });

  it("closes on a middle click and on Delete", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await click(w, "c.ts", { metaKey: true });

    const pill = w.find('[data-testid="files-tab"][data-path="a.md"]').element.parentElement;
    pill?.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true }));
    await flushPromises();
    expect(tabNames(w)).toEqual(["b.ts", "c.ts"]);

    await w.find('[data-testid="files-tab"][data-path="c.ts"]').trigger("keydown", { key: "Delete" });
    await flushPromises();
    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["b.ts"]);
    expect(snapshotOf(w).activePath).toBe("b.ts");
  });

  it("moves between tabs with the arrows, and Tab reaches only the front one", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });

    expect(w.findAll('[data-testid="files-tab"]').map((tab) => tab.attributes("tabindex"))).toEqual(["-1", "0"]);
    await w.find('[data-testid="files-tab"][data-path="b.ts"]').trigger("keydown", { key: "ArrowRight" });
    await flushPromises();
    expect(frontName(w)).toBe("a.md"); // wraps
    expect(document.activeElement?.getAttribute("data-path")).toBe("a.md");
  });

  // A keyboard user must land on the tab that is actually in front, not the one they asked for.
  it("keeps focus on the front tab when a keyboard switch is refused", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    onChange();
    fs.unwritable = true;
    const front = w.find('[data-testid="files-tab"][data-path="b.ts"]');
    (front.element as HTMLElement).focus();
    await front.trigger("keydown", { key: "ArrowLeft" });
    await flushPromises();

    expect(frontName(w)).toBe("b.ts");
    expect(document.activeElement?.getAttribute("data-path")).toBe("b.ts");
  });

  it("moves focus to the new front tab after Delete closes the focused one", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    await click(w, "c.ts", { metaKey: true });
    await w.find('[data-testid="files-tab"][data-path="c.ts"]').trigger("keydown", { key: "Delete" });
    await flushPromises();

    expect(frontName(w)).toBe("b.ts");
    expect(document.activeElement?.getAttribute("data-path")).toBe("b.ts");
  });

  it("keeps focus in the pane when Delete leaves one tab and the strip goes", async () => {
    const w = await mountPane();
    await click(w, "a.md");
    await click(w, "b.ts", { metaKey: true });
    const front = w.find('[data-testid="files-tab"][data-path="b.ts"]');
    (front.element as HTMLElement).focus();
    await front.trigger("keydown", { key: "Delete" });
    await flushPromises();

    expect(w.find('[data-testid="files-tabs"]').exists()).toBe(false);
    expect(document.activeElement).not.toBe(document.body);
    expect(w.element.contains(document.activeElement)).toBe(true);
  });

  it("puts every remembered tab back and opens the front one", async () => {
    const w = await mountPane({
      tabs: [{ path: "a.md" }, { path: "b.ts", caret: { line: 7, col: 1 } }, { path: "c.ts" }],
      activePath: "b.ts",
      expanded: [],
    });

    expect(tabNames(w)).toEqual(["a.md", "b.ts", "c.ts"]);
    expect(frontName(w)).toBe("b.ts");
    expect(fakeEditor.setDoc).toHaveBeenCalledTimes(1);
    expect(fakeEditor.goTo).toHaveBeenCalledWith({ line: 7, col: 1 });
  });

  it("drops a remembered front tab whose file is gone and brings its neighbour forward", async () => {
    fs.missing.add("b.ts");
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }, { path: "c.ts" }], activePath: "b.ts", expanded: [] });

    expect(tabNames(w)).toEqual(["a.md", "c.ts"]);
    expect(frontName(w)).toBe("c.ts");
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("text of c.ts", "c.ts");
  });

  it("keeps trying neighbours until a file arrives", async () => {
    fs.missing.add("b.ts");
    fs.missing.add("c.ts");
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }, { path: "c.ts" }], activePath: "b.ts", expanded: [] });

    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["a.md"]);
    expect(snapshotOf(w).activePath).toBe("a.md");
    expect(w.find('[data-testid="files-tabs"]').exists()).toBe(false); // one tab, on screen: the header again
  });

  // A newer open took over during the restore and did not land, so no tab is in front. The strip
  // still has to be visible and reachable, or the remembered tabs have no control at all.
  it("keeps tabs reachable when none is in front", async () => {
    fs.missing.add("gone.md");
    const w = mount(FilesPane, {
      props: { cwd: "/proj", initialState: { tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] } },
      attachTo: document.body,
    });
    void (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("gone.md");
    await flushPromises();

    expect(snapshotOf(w).activePath).toBeNull();
    expect(w.findAll('[data-testid="files-tab"]').map((tab) => tab.attributes("tabindex"))).toEqual(["0", "-1"]);
  });

  it("shows a lone tab that is not on screen, so it can be opened", async () => {
    fs.missing.add("gone.md");
    const w = mount(FilesPane, {
      props: { cwd: "/proj", initialState: { tabs: [{ path: "a.md" }], activePath: "a.md", expanded: [] } },
      attachTo: document.body,
    });
    void (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("gone.md");
    await flushPromises();

    expect(tabNames(w)).toEqual(["a.md"]);
    await w.find('[data-testid="files-tab"]').trigger("click");
    await flushPromises();
    expect(snapshotOf(w).activePath).toBe("a.md");
    expect(w.find('[data-testid="files-tabs"]').exists()).toBe(false);
  });

  it("goes to an open tab from the host's openFile as well", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] });
    await (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("b.ts");
    await flushPromises();

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("b.ts");
  });

  // A path clicked in terminal output reaches the pane as a prop, after it has mounted.
  it("goes to an open tab from a path clicked in terminal output", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] });
    await w.setProps({ requestedPath: "b.ts" });
    await flushPromises();

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("b.ts");
  });

  // The `files-tab-*` keys (#2267) reach the pane through these two.
  it("closes the front tab from the key, the last one leaving the pane empty", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "b.ts", expanded: [] });
    const pane = w.vm as unknown as { closeFrontTab: () => Promise<void> };
    await pane.closeFrontTab();
    await flushPromises();
    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["a.md"]);
    expect(snapshotOf(w).activePath).toBe("a.md");

    await pane.closeFrontTab();
    await flushPromises();
    expect(snapshotOf(w)).toMatchObject({ tabs: [], activePath: null });
    expect(w.text()).toContain("Select a file to view or edit.");
  });

  it("steps between tabs from the key, going round at the ends", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }, { path: "c.ts" }], activePath: "c.ts", expanded: [] });
    const pane = w.vm as unknown as { stepTab: (step: 1 | -1) => Promise<void> };
    await pane.stepTab(1);
    await flushPromises();
    expect(frontName(w)).toBe("a.md");
    await pane.stepTab(-1);
    await flushPromises();
    expect(frontName(w)).toBe("c.ts");
  });

  it("labels each close button with the file it closes", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] });
    expect(w.findAll('[data-testid="files-tab-close"]').map((b) => b.attributes("aria-label"))).toEqual(["Close a.md", "Close b.ts"]);
  });
});
