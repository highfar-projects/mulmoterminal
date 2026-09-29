import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";
import type { FilesPaneState } from "../../../src/components/filesPaneState";
import { MD_PREVIEW_FROM_FRAME } from "../../../common/mdPreviewMessage";
import { frontTab } from "./filesPaneFixture";

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
  /** Paths over the server's edit cap: the text and version routes answer 413. */
  tooLarge: Set<string>;
  /** Every path the text route was asked for. */
  textReads: string[];
  /** What the version route answers for a path, when a spec sets it. */
  versions: Map<string, string>;
  /** Version answers from call number `from` on are held until `gate` resolves, to look at the
   *  pane mid-read. */
  versionHold: { from: number; gate: Promise<void> } | null;
  versionCalls: number;
}

interface FakeAnswer {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

/** The version route, for a path a spec gave a version or took away; null leaves the default. */
async function versionAnswer(fs: Fs, path: string): Promise<FakeAnswer | null> {
  if (fs.missing.has(path)) return { ok: true, json: async () => ({ version: null }) };
  if (!fs.versions.has(path)) return null;
  fs.versionCalls += 1;
  if (fs.versionHold && fs.versionCalls >= fs.versionHold.from) await fs.versionHold.gate;
  return { ok: true, json: async () => ({ version: fs.versions.get(path) }) };
}

function textAnswer(fs: Fs, path: string): FakeAnswer {
  fs.textReads.push(path);
  if (fs.missing.has(path)) return { ok: false, status: 404, json: async () => ({ error: `no such file: ${path}` }) };
  if (path.endsWith(".png") || path.endsWith(".pdf")) return { ok: false, status: 415, json: async () => ({ error: "this file is not text" }) };
  return { ok: true, json: async () => ({ text: `text of ${path}`, version: "v1" }) };
}

function mockFs(): Fs {
  const fs: Fs = {
    writes: [],
    missing: new Set(),
    unwritable: false,
    tooLarge: new Set(),
    textReads: [],
    versions: new Map(),
    versionHold: null,
    versionCalls: 0,
  };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: FILES.map((name) => ({ name, dir: false, size: 1 })) }) };
    const reads = url.pathname.includes("/text") || url.pathname.includes("/version");
    if (reads && fs.tooLarge.has(path)) return { ok: false, status: 413, json: async () => ({ error: "file too large" }) };
    if (url.pathname.includes("/version")) {
      const answer = await versionAnswer(fs, path);
      if (answer) return answer;
    }
    if (url.pathname.includes("/text")) return textAnswer(fs, path);
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

  // #2268. A link clicked in the Preview arrives from the frame as written; the pane resolves it
  // against the document and opens it beside, in Preview since that is where the reader was.
  const clickInPreview = (w: VueWrapper, href: string): void => {
    const frame = w.find("iframe").element;
    const event = new MessageEvent("message", { data: { source: MD_PREVIEW_FROM_FRAME, kind: "open", href } });
    Object.defineProperty(event, "source", { value: frame instanceof HTMLIFrameElement ? frame.contentWindow : null });
    window.dispatchEvent(event);
  };

  it("opens a relative link from the Preview in a new tab, in Preview", async () => {
    const w = await mountPane({ tabs: [{ path: "docs/a.md", showPreview: true }], activePath: "docs/a.md", expanded: [] });
    clickInPreview(w, "../b.md#usage");
    await flushPromises();

    expect(tabNames(w)).toEqual(["docs/a.md", "b.md"]);
    expect(frontName(w)).toBe("b.md");
    expect(frontTab(snapshotOf(w))?.showPreview).toBe(true);
  });

  it("goes to the tab a linked file already has", async () => {
    const w = await mountPane({ tabs: [{ path: "docs/a.md", showPreview: true }, { path: "b.md" }], activePath: "docs/a.md", expanded: [] });
    clickInPreview(w, "../b.md");
    await flushPromises();

    expect(tabNames(w)).toEqual(["docs/a.md", "b.md"]);
    expect(frontName(w)).toBe("b.md");
  });

  it("says why a link above the root does not open, instead of doing nothing", async () => {
    const w = await mountPane({ tabs: [{ path: "docs/a.md", showPreview: true }], activePath: "docs/a.md", expanded: [] });
    clickInPreview(w, "../../x.md");
    await flushPromises();

    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["docs/a.md"]);
    expect(w.find('[data-testid="files-error"]').text()).toContain("../../x.md");
  });

  // #2269. An HTML file has a Preview, like Markdown: the page itself, sandboxed, by path.
  it("previews an HTML file as the page it is", async () => {
    const w = await mountPane({ tabs: [{ path: "out/report.html" }], activePath: "out/report.html", expanded: [] });
    const toggle = w.findAll("button").find((b) => b.text() === "Preview");
    expect(toggle).toBeDefined();
    await toggle?.trigger("click");
    await flushPromises();

    const frame = w.find("iframe");
    expect(frame.attributes("src")).toBe("/api/files/page/%2Fproj/out/report.html?v=v1");
    expect(frame.attributes("sandbox")).toBe("allow-scripts");
    expect(frame.attributes("title")).toBe("File preview");
    // A page that sets no background expects a browser's white, not the app's dark ground.
    expect(frame.classes()).toContain("bg-white");
  });

  // The mode belongs to the file it was turned on for, and an HTML page has one now.
  it("brings a remembered HTML tab back in Preview", async () => {
    const w = await mountPane({ tabs: [{ path: "out/report.html", showPreview: true }], activePath: "out/report.html", expanded: [] });
    expect(frontTab(snapshotOf(w))?.showPreview).toBe(true);
    expect(w.findAll("button").some((b) => b.text() === "Edit")).toBe(true);
  });

  it("shows a PNG as the picture where it would say the file is not text", async () => {
    const w = await mountPane({ tabs: [{ path: "chart.png" }], activePath: "chart.png", expanded: [] });

    // The version rides the URL, so a redrawn chart is fetched again.
    expect(w.find('[data-testid="files-image"]').attributes("src")).toBe("/api/files/raw?cwd=%2Fproj&path=chart.png&v=v2");
    expect(fs.textReads).not.toContain("chart.png");
    expect(w.find('[data-testid="files-image"]').attributes("alt")).toBe("chart.png");
    expect(w.find('[data-testid="files-open-in-os"]').exists()).toBe(true);
    expect(w.findAll("button").some((b) => b.text() === "Preview")).toBe(false);
  });

  // A screenshot is often over the edit cap, where the text route — and the version route — answer
  // 413. The picture shows regardless; it was never going to be edited.
  it("shows a picture over the edit cap", async () => {
    fs.tooLarge.add("shot.png");
    const w = await mountPane({ tabs: [{ path: "shot.png" }], activePath: "shot.png", expanded: [] });

    expect(w.find('[data-testid="files-image"]').attributes("src")).toBe("/api/files/raw?cwd=%2Fproj&path=shot.png");
    expect(w.find('[data-testid="files-error"]').exists()).toBe(false);
  });

  it("says a picture that is not there is not found", async () => {
    fs.missing.add("gone.png");
    const w = await mountPane({ tabs: [{ path: "a.md" }], activePath: "a.md", expanded: [] });
    await (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("gone.png");
    await flushPromises();

    expect(w.find('[data-testid="files-image"]').exists()).toBe(false);
    expect(w.find('[data-testid="files-error"]').text()).toContain("gone.png");
  });

  // The Preview wire trusts its frame to hold only the server's reporter. An HTML page runs its own
  // scripts, so while one is up nothing it posts reaches the host.
  it("does not let an HTML page ask the host to open anything", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = await mountPane({ tabs: [{ path: "out/report.html", showPreview: true }], activePath: "out/report.html", expanded: [] });
    clickInPreview(w, "../a.md");
    const frame = w.find("iframe").element;
    const navigate = new MessageEvent("message", { data: { source: MD_PREVIEW_FROM_FRAME, kind: "navigate", href: "https://evil.example/" } });
    Object.defineProperty(navigate, "source", { value: frame instanceof HTMLIFrameElement ? frame.contentWindow : null });
    window.dispatchEvent(navigate);
    await flushPromises();

    expect(open).not.toHaveBeenCalled();
    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["out/report.html"]);
    open.mockRestore();
  });

  // `contentWindow` is the same object across a navigation, so a page being replaced by a Markdown
  // document could still speak on the Markdown wire unless the document gets a frame of its own.
  it("does not hear the page it replaced once a Markdown document is up", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const w = await mountPane({ tabs: [{ path: "out/report.html", showPreview: true }], activePath: "out/report.html", expanded: [] });
    const pageFrame = w.find("iframe").element;
    const pageWindow = pageFrame instanceof HTMLIFrameElement ? pageFrame.contentWindow : null;
    await (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("a.md");
    await flushPromises();

    expect(w.find("iframe").element).not.toBe(pageFrame);
    const forged = new MessageEvent("message", { data: { source: MD_PREVIEW_FROM_FRAME, kind: "navigate", href: "https://evil.example/" } });
    Object.defineProperty(forged, "source", { value: pageWindow });
    window.dispatchEvent(forged);
    await flushPromises();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  // A page runs its own scripts, so it is loaded only while its Preview is up.
  it("does not load a page being edited", async () => {
    const w = await mountPane({ tabs: [{ path: "out/report.html" }], activePath: "out/report.html", expanded: [] });
    expect(w.find("iframe").attributes("src") ?? "").toBe("");
  });

  it("still loads a Markdown document ahead of its Preview", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }], activePath: "a.md", expanded: [] });
    expect(w.find("iframe").attributes("src")).toContain("/api/files/browse/md?");
  });

  // With no root an HTML page has no URL; coming back in a Preview that shows nothing would leave
  // no button to leave it by.
  it("brings an HTML tab back in the editor when there is no page to load", async () => {
    const w = mount(FilesPane, {
      props: { cwd: null, initialState: { tabs: [{ path: "report.html", showPreview: true }], activePath: "report.html", expanded: [] } },
      attachTo: document.body,
    });
    await flushPromises();
    expect(frontTab(snapshotOf(w))?.showPreview).toBe(false);
  });

  // A redrawn chart is read again; the picture stays up while that happens rather than an empty
  // editor showing for the round trip.
  it("keeps the picture up while a redrawn one is read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fs.versions.set("chart.png", "img1");
    const w = await mountPane({ tabs: [{ path: "chart.png" }], activePath: "chart.png", expanded: [] });
    expect(w.find('[data-testid="files-image"]').attributes("src")).toContain("v=img1");

    fs.versions.set("chart.png", "img2");
    let release: () => void = () => {};
    // The next call is the recheck, which sees img2 and starts a re-read; the one after it is that
    // re-read, held here.
    fs.versionHold = { from: fs.versionCalls + 2, gate: new Promise((resolve) => (release = resolve)) };
    vi.advanceTimersByTime(30_000);
    await flushPromises();
    expect(fs.versionCalls).toBe(3);
    expect(w.find('[data-testid="files-image"]').exists()).toBe(true);
    release();
    await flushPromises();
    expect(w.find('[data-testid="files-image"]').attributes("src")).toContain("v=img2");
    vi.useRealTimers();
  });

  it("previews an SVG as the picture, from the raw route", async () => {
    const w = await mountPane({ tabs: [{ path: "logo.svg", showPreview: true }], activePath: "logo.svg", expanded: [] });
    const frame = w.find("iframe");
    expect(frame.attributes("src")).toBe("/api/files/raw?cwd=%2Fproj&path=logo.svg&v=v1");
    expect(frame.classes()).toContain("bg-white");
  });

  // The other half of the frame's two looks: Markdown keeps the app's colours and its own name.
  it("keeps the Markdown preview in the app's colours", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md", showPreview: true }], activePath: "a.md", expanded: [] });
    const frame = w.find("iframe");
    expect(frame.classes()).toContain("bg-[var(--bg-base)]");
    expect(frame.classes()).not.toContain("bg-white");
    expect(frame.attributes("title")).toBe("Markdown preview");
  });

  // A chart clicked in terminal output is asked for to be seen, so a page or an SVG comes up drawn.
  it("opens a page from the host drawn, and Markdown as it always has", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }], activePath: "a.md", expanded: [] });
    const pane = w.vm as unknown as { openFile: (p: string) => Promise<void> };
    await pane.openFile("out/report.html");
    await flushPromises();
    expect(frontTab(snapshotOf(w))?.showPreview).toBe(true);

    await pane.openFile("notes.md");
    await flushPromises();
    expect(frontTab(snapshotOf(w))?.showPreview).toBe(false);
  });

  // Its route serves only under an authorised base; with no root there is no page to load, so
  // there is no Preview to offer.
  it("offers no page Preview with no root", async () => {
    const w = mount(FilesPane, {
      props: { cwd: null, initialState: { tabs: [{ path: "report.html" }], activePath: "report.html", expanded: [] } },
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.findAll("button").some((b) => b.text() === "Preview")).toBe(false);
  });

  it("still says a file that is neither text nor a picture is not text", async () => {
    const w = await mountPane({ tabs: [{ path: "paper.pdf" }], activePath: "paper.pdf", expanded: [] });
    expect(w.find('[data-testid="files-image"]').exists()).toBe(false);
    expect(w.find('[data-testid="files-unpreviewable"]').text()).toContain("this file is not text");
  });

  it("labels each close button with the file it closes", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] });
    expect(w.findAll('[data-testid="files-tab-close"]').map((b) => b.attributes("aria-label"))).toEqual(["Close a.md", "Close b.ts"]);
  });
});
