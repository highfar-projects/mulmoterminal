import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";
import type { FileGitState } from "../../../common/fileGitStatus";

const fakeEditor = fakeCmEditor("edited");
let onChange: () => void = () => {};
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: (_host: HTMLElement, cb: () => void) => ((onChange = cb), fakeEditor) };
});

const LISTINGS: Record<string, { name: string; dir: boolean }[]> = {
  "": [
    { name: "src", dir: true },
    { name: "notes.md", dir: false },
    { name: "readme.md", dir: false },
  ],
  src: [{ name: "app.ts", dir: false }],
};

let gitFiles: Record<string, FileGitState> = {};
/** HEAD's text per path; a path missing here has no HEAD version. */
let headTexts: Record<string, string> = {};
let headReads = 0;
/** Holds the HEAD answer for one path until released, to overtake it with another file. */
let headHold: { path: string; gate: Promise<void> } | null = null;
let gitReads = 0;
/** Holds the git answer until released, to look at the tree while a read is out. */
let gitGate: Promise<void> | null = null;
let version = 1;

beforeEach(() => {
  gitFiles = { "src/app.ts": "modified", "notes.md": "untracked" };
  gitReads = 0;
  headTexts = { "readme.md": "head of readme", "notes.md": "head of notes" };
  headReads = 0;
  headHold = null;
  fakeEditor.setOriginal.mockClear();
  fakeEditor.setShowChanges.mockClear();
  gitGate = null;
  version = 1;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
    if (url.pathname.includes("/head")) {
      headReads += 1;
      if (headHold && headHold.path === path) await headHold.gate;
      return { ok: true, json: async () => ({ text: headTexts[path] ?? null }) };
    }
    if (url.pathname.includes("/git-status")) {
      gitReads += 1;
      if (gitGate) await gitGate;
      return { ok: true, json: async () => ({ repo: true, files: gitFiles }) };
    }
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: (LISTINGS[path] ?? []).map((e) => ({ ...e, size: 1 })) }) };
    if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: `text of ${path}`, version: `v${version}` }) };
    version += 1;
    return { ok: true, json: async () => ({ ok: true, version: `v${version}` }) };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const mark = (w: VueWrapper, path: string): string => w.find(`[data-testid="files-row"][data-path="${path}"] [role="img"]`).text();
const hasMark = (w: VueWrapper, path: string): boolean => w.find(`[data-testid="files-row"][data-path="${path}"] [role="img"]`).exists();

// #2496. The tree shows what git sees, as VS Code's explorer does.
describe("the Files tree's git marks", () => {
  it("gives changed files their letter and a folder holding changes a dot", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();

    expect(mark(w, "notes.md")).toBe("U");
    expect(mark(w, "src")).toBe("●"); // collapsed, and still says where to look
    expect(hasMark(w, "readme.md")).toBe(false);
    expect(w.find('[data-testid="files-row"][data-path="notes.md"] [role="img"]').attributes("aria-label")).toBe("Untracked");

    await w.find('[data-testid="files-row"][data-path="src"]').trigger("click");
    await flushPromises();
    expect(mark(w, "src/app.ts")).toBe("M");
  });

  // A save moves the open file's version; what git sees has changed with it.
  it("reads git again after a save", async () => {
    const w = mount(FilesPane, {
      props: { cwd: "/proj", initialState: { tabs: [{ path: "readme.md" }], activePath: "readme.md", expanded: [] } },
      attachTo: document.body,
    });
    await flushPromises();
    const before = gitReads;
    gitFiles = { ...gitFiles, "readme.md": "modified" };
    onChange();
    await w.find("header").trigger("keydown", { key: "s", metaKey: true });
    await flushPromises();

    expect(gitReads).toBeGreaterThan(before);
    expect(mark(w, "readme.md")).toBe("M");
  });

  it("reads git again with the tree's own reload", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    gitFiles = {};
    const reload = w.findAll("button").find((b) => b.attributes("data-tip") === "Reload tree");
    await reload?.trigger("click");
    await flushPromises();

    expect(hasMark(w, "notes.md")).toBe(false);
    expect(hasMark(w, "src")).toBe(false);
  });

  // The marks belong to the root they were read for; a re-rooted pane does not show them.
  // An agent writes while the reader is in another window; coming back reads git at once.
  it("reads git again when the reader comes back to the window", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    gitFiles = { ...gitFiles, "readme.md": "modified" };
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(mark(w, "readme.md")).toBe("M");
  });

  // Checked while the new root's read is still out: the old marks must be gone before it lands.
  it("drops the marks when the pane is re-rooted", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    expect(hasMark(w, "notes.md")).toBe(true);
    let release: () => void = () => {};
    gitGate = new Promise((resolve) => (release = resolve));
    const reloading = (w.vm as unknown as { reload: () => Promise<void> }).reload();
    await flushPromises();

    expect(hasMark(w, "notes.md")).toBe(false);
    release();
    await reloading;
  });
});

// #2497. The open file's changes against HEAD, marked beside its lines.
describe("the editor's changes against HEAD", () => {
  const openAt = async (path: string): Promise<VueWrapper> => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { tabs: [{ path }], activePath: path, expanded: [] } }, attachTo: document.body });
    await flushPromises();
    return w;
  };

  it("hands the editor the file as HEAD has it, and offers the Changes toggle", async () => {
    const w = await openAt("readme.md");
    expect(fakeEditor.setOriginal).toHaveBeenLastCalledWith("head of readme");
    const toggle = w.find('[data-testid="files-changes-btn"]');
    expect(toggle.attributes("aria-pressed")).toBe("false");
    await toggle.trigger("click");
    expect(fakeEditor.setShowChanges).toHaveBeenLastCalledWith(true);
    expect(toggle.attributes("aria-pressed")).toBe("true");
  });

  it("offers no toggle for a file HEAD does not have", async () => {
    const w = await openAt("src/app.ts");
    expect(fakeEditor.setOriginal).toHaveBeenLastCalledWith(null);
    expect(w.find('[data-testid="files-changes-btn"]').exists()).toBe(false);
  });

  // Marks against the previous file's HEAD must not show on the next one while its HEAD is read.
  it("clears the marks before another file's text goes in", async () => {
    const w = await openAt("readme.md");
    fakeEditor.setOriginal.mockClear();
    fakeEditor.setDoc.mockClear();
    await w.find('[data-testid="files-row"][data-path="notes.md"]').trigger("click");
    await flushPromises();

    const clearedAt = fakeEditor.setOriginal.mock.invocationCallOrder[0] ?? Infinity;
    const loadedAt = fakeEditor.setDoc.mock.invocationCallOrder[0] ?? -1;
    expect(fakeEditor.setOriginal.mock.calls[0]).toEqual([null]);
    expect(clearedAt).toBeLessThan(loadedAt);
    expect(fakeEditor.setOriginal).toHaveBeenLastCalledWith("head of notes");
  });

  // A slow HEAD read for the file just left must not land on the one now open.
  it("drops a HEAD answer that arrives after the reader moved on", async () => {
    let release: () => void = () => {};
    headHold = { path: "readme.md", gate: new Promise((resolve) => (release = resolve)) };
    const w = await openAt("readme.md");
    await w.find('[data-testid="files-row"][data-path="notes.md"]').trigger("click");
    await flushPromises();
    release();
    await flushPromises();

    expect(fakeEditor.setOriginal).toHaveBeenLastCalledWith("head of notes");
    expect(fakeEditor.setOriginal).not.toHaveBeenCalledWith("head of readme");
  });

  // An agent's commit moves HEAD without touching the file; what git sees moving is the cue.
  it("reads HEAD again when what git sees changes", async () => {
    await openAt("readme.md");
    const before = headReads;
    gitFiles = { ...gitFiles, "readme.md": "modified" };
    headTexts = { ...headTexts, "readme.md": "committed readme" };
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(headReads).toBeGreaterThan(before);
    expect(fakeEditor.setOriginal).toHaveBeenLastCalledWith("committed readme");
  });
});
