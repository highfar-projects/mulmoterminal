import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

const fakeEditor = fakeCmEditor("", { line: 12, col: 4 });
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

// #2149. The pane already remembers WHICH file was open and which directories were expanded; this
// is where in them the reader was. Both halves are per cell within a session and per directory
// across a reload, riding the same snapshot the rest of that memory does.
describe("FilesPane remembering where the reader was", () => {
  const fs = () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://x");
      if (url.pathname.includes("/list")) {
        const path = url.searchParams.get("path");
        if (path === "") {
          return {
            ok: true,
            json: async () => ({
              entries: [
                { name: "src", dir: true, size: 0 },
                { name: "notes.md", dir: false, size: 10 },
              ],
            }),
          };
        }
        return { ok: true, json: async () => ({ entries: [{ name: "deep.ts", dir: false, size: 5 }] }) };
      }
      if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "# hello", version: "v1" }) };
      return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
    }) as unknown as typeof fetch;
  };

  beforeEach(() => {
    localStorage.clear();
    fakeEditor.setDoc.mockClear();
    fakeEditor.goTo.mockClear();
    fs();
  });

  it("reports the caret and the tree's scroll in what it remembers", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    // Assigned, not redefined: `defineProperty` makes it read-only, and the pane writes to it when
    // the root changes — which then throws inside teardown rather than failing an assertion here.
    w.find('[aria-label="File tree"]').element.scrollTop = 240;

    const snapshot = (w.vm as unknown as { snapshot: () => { caret?: unknown; treeScrollTop?: number } }).snapshot();
    expect(snapshot.caret).toEqual({ line: 12, col: 4 });
    expect(snapshot.treeScrollTop).toBe(240);
  });

  it("puts the caret back in the file it was remembered for", async () => {
    mount(FilesPane, {
      props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 31, col: 2 } } },
    });
    await flushPromises();

    expect(fakeEditor.goTo).toHaveBeenCalledWith({ line: 31, col: 2 });
  });

  // The caret belongs to the text it was in. A path that now holds something else is not that text,
  // and a file the server will not serve as text has no caret to place at all.
  it("does not place a caret when the read did not land on that file", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "notes.md", dir: false, size: 10 }] }) };
      return { ok: false, status: 415, json: async () => ({ error: "this file is not text" }) };
    }) as unknown as typeof fetch;

    const w = mount(FilesPane, {
      props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 31, col: 2 } } },
    });
    await flushPromises();

    expect(w.find('[data-testid="files-unpreviewable"]').exists()).toBe(true);
    expect(fakeEditor.goTo).not.toHaveBeenCalled();
  });

  it("opens a file with no remembered caret at the top, asking for nothing", async () => {
    mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [] } } });
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenCalledWith("# hello", "notes.md");
    expect(fakeEditor.goTo).not.toHaveBeenCalled();
  });

  // The rows have to exist before there is anything to scroll past, and the remembered expansions
  // are what create them — so the scroll is restored last, after they have rendered.
  it("scrolls the tree back after the remembered directories have opened", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: null, expanded: ["src"], treeScrollTop: 180 } } });
    await flushPromises();
    await flushPromises();

    expect(w.findAll('[data-testid="files-row"]').map((r) => r.attributes("data-path"))).toEqual(["src", "src/deep.ts", "notes.md"]);
    expect(w.find('[aria-label="File tree"]').element.scrollTop).toBe(180);
  });

  // The tree element outlives the root — a re-root happens in place — so without a reset the
  // scrollbar stays where the LAST directory left it, and a remembered 0 is indistinguishable from
  // nothing remembered (Codex on #2156).
  it.each([
    ["a remembered top", 0],
    ["nothing remembered", undefined],
  ])("does not leave the previous root's scroll behind when re-rooted with %s", async (_case, treeScrollTop) => {
    const w = mount(FilesPane, { props: { cwd: "/left", initialState: { openPath: null, expanded: ["src"], treeScrollTop: 300 } } });
    await flushPromises();
    await flushPromises();
    const tree = w.find('[aria-label="File tree"]').element;
    expect(tree.scrollTop).toBe(300);

    await w.setProps({ cwd: "/right", initialState: { openPath: null, expanded: ["src"], ...(treeScrollTop === undefined ? {} : { treeScrollTop }) } });
    await (w.vm as unknown as { reload: () => Promise<void> }).reload();
    await flushPromises();
    await flushPromises();

    expect(w.find('[aria-label="File tree"]').element.scrollTop).toBe(0);
  });

  it("leaves the tree at the top when nothing was remembered", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: null, expanded: ["src"] } } });
    await flushPromises();
    await flushPromises();

    expect(w.find('[aria-label="File tree"]').element.scrollTop).toBe(0);
  });
});
