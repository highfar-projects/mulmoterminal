import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

const fakeEditor = fakeCmEditor("", { line: 12, col: 4 }, 9);
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

    const snapshot = (w.vm as unknown as { snapshot: () => { caret?: unknown; topLine?: number; treeScrollTop?: number } }).snapshot();
    expect(snapshot.caret).toEqual({ line: 12, col: 4 });
    expect(snapshot.topLine).toBe(9); // what was on SCREEN, which scrolling moves and the caret does not
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

  // Found by driving a browser, and invisible to every test above: scrolling moves neither the
  // selection nor the caret, so a reader who never clicks has a caret on line 1 while reading line
  // 130 — and a restore that only placed the caret put them back at the top of the file (#2149).
  it("puts back what was on screen, not only where the cursor was", async () => {
    mount(FilesPane, {
      props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 1, col: 0 }, topLine: 130 } },
    });
    await flushPromises();

    expect(fakeEditor.scrollLineToTop).toHaveBeenCalledWith(130);
    expect(fakeEditor.topLine()).toBe(130);
  });

  // Order matters: `goTo` scrolls the caret into view, so the remembered screen has to be applied
  // after it or the caret's scroll wins and the reader lands somewhere they never were.
  it("applies the remembered screen after the caret, not before", async () => {
    mount(FilesPane, {
      props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 200, col: 2 }, topLine: 180 } },
    });
    await flushPromises();

    const order = fakeEditor.goTo.mock.invocationCallOrder[0];
    const screen = fakeEditor.scrollLineToTop.mock.invocationCallOrder[0];
    expect(order).toBeLessThan(screen);
  });

  // The refresh nobody asked for: the agent working in this directory writes the file being read,
  // and the pane re-reads it. `setDoc` collapses the selection, so without carrying the caret the
  // reader is thrown to line 1 every thirty seconds — in the app this PR is supposed to fix that
  // for (Codex on #2156).
  it("keeps the reader's place when the open file is re-read under them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 200, col: 0 } } } });
    await flushPromises();
    expect(fakeEditor.caretAt()).toEqual({ line: 200, col: 0 });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://x");
      if (url.pathname.includes("/version")) return { ok: true, json: async () => ({ version: "v9" }) };
      if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "# from the agent", version: "v9" }) };
      return { ok: true, json: async () => ({ entries: [{ name: "notes.md", dir: false, size: 10 }] }) };
    }) as unknown as typeof fetch;
    vi.advanceTimersByTime(30_000);
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# from the agent", "notes.md"); // it re-read
    expect(fakeEditor.caretAt()).toEqual({ line: 200, col: 0 }); // and the reader did not move
    vi.useRealTimers();
    w.unmount();
  });

  // The same thing for the reader who never clicks, which is the one the caret cannot speak for.
  // Codex found this gap one field after the caret's — a rule written field by field earns that.
  it("keeps what is on screen when the open file is re-read under them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], topLine: 130 } } });
    await flushPromises();
    expect(fakeEditor.topLine()).toBe(130);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://x");
      if (url.pathname.includes("/version")) return { ok: true, json: async () => ({ version: "v9" }) };
      if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "# from the agent", version: "v9" }) };
      return { ok: true, json: async () => ({ entries: [{ name: "notes.md", dir: false, size: 10 }] }) };
    }) as unknown as typeof fetch;
    vi.advanceTimersByTime(30_000);
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# from the agent", "notes.md"); // it re-read
    expect(fakeEditor.topLine()).toBe(130); // and the reader is still looking at the same place
    vi.useRealTimers();
    w.unmount();
  });

  // Opening ANOTHER file is not a re-read: that caret belongs to the text it was in.
  it("does not carry a caret into a different file", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "notes.md", expanded: [], caret: { line: 200, col: 0 } } } });
    await flushPromises();
    fakeEditor.goTo.mockClear();

    await (w.vm as unknown as { openFile: (p: string) => Promise<void> }).openFile("src/deep.ts");
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# hello", "deep.ts");
    expect(fakeEditor.goTo).not.toHaveBeenCalled();
    expect(fakeEditor.caretAt()).toEqual({ line: 1, col: 0 });
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
