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
let gitReads = 0;
/** Holds the git answer until released, to look at the tree while a read is out. */
let gitGate: Promise<void> | null = null;
let version = 1;

beforeEach(() => {
  gitFiles = { "src/app.ts": "modified", "notes.md": "untracked" };
  gitReads = 0;
  gitGate = null;
  version = 1;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
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
