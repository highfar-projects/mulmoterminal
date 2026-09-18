import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";

// The search where it actually lives (#2140): inside the pane, over the tree. What the panel DOES
// is FileSearch.spec.ts and what a search MEANS is common/fileSearch.ts — this file is about the
// JOIN, which is the only part no other spec reaches:
//
//   - the button and the host entry point both open it (the shortcut has no default binding, so
//     the button is the only way in for most people),
//   - picking a result opens the file AND puts the editor on the line, which is the half that
//     makes a result worth clicking,
//   - the unsaved buffer reaches the panel, which is the one file the server cannot answer for.

const revealed: number[] = [];
// The ORDER matters, not only the values: `revealLine` scrolls the document the editor is showing
// NOW, so running it before the file has been handed over puts the cursor in the previous file.
// A fake that only counts calls cannot see that, so this one records the sequence.
const calls: string[] = [];
const fakeEditor = {
  setDoc: vi.fn((_text: string, filename: string) => calls.push(`setDoc:${filename}`)),
  getDoc: vi.fn(() => "buffer line one\nbuffer needle two\n"),
  revealLine: vi.fn((line: number) => {
    revealed.push(line);
    calls.push(`reveal:${line}`);
  }),
  destroy: vi.fn(),
};
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
// The pane hands `createEditor` the callback it uses to learn the buffer went dirty. Captured so a
// test can fire it — that flag is the whole precondition for the buffer reaching the panel.
let markDirty: () => void = () => {};
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return {
    ...actual,
    createEditor: (_host: HTMLElement, onChange: () => void) => {
      markDirty = onChange;
      return fakeEditor;
    },
  };
});

const LISTING: Record<string, { name: string; dir: boolean; size: number }[]> = {
  "": [{ name: "src", dir: true, size: 0 }],
  src: [{ name: "deep.ts", dir: false, size: 9 }],
};

function mockFs(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname.endsWith("/search")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ matches: [{ path: "src/deep.ts", line: 12, text: "a needle on twelve", clipped: false }], truncated: false, source: "git" }),
      };
    }
    if (url.pathname.endsWith("/list")) {
      return { ok: true, status: 200, json: async () => ({ entries: LISTING[url.searchParams.get("path") ?? ""] ?? [] }) };
    }
    if (url.pathname.endsWith("/text")) {
      return { ok: true, status: 200, json: async () => ({ text: "on disk\n", version: "v1" }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
}

type Scrollable = { scrollIntoView?: (arg?: unknown) => void };
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  revealed.length = 0;
  calls.length = 0;
  fakeEditor.revealLine.mockClear();
  mockFs();
  (Element.prototype as Scrollable).scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = realFetch;
  delete (Element.prototype as Scrollable).scrollIntoView;
  document.body.innerHTML = "";
});

const mountPane = async () => {
  const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
  await vi.runOnlyPendingTimersAsync();
  await flushPromises();
  return w;
};

const searchFor = async (w: Awaited<ReturnType<typeof mountPane>>, query: string) => {
  await w.find('[data-testid="file-search-input"]').setValue(query);
  await vi.runOnlyPendingTimersAsync();
  await flushPromises();
};

describe("the Files pane's content search", () => {
  // The template binds `search.open.value`, which is only correct because a plain object returned
  // from a composable is NOT ref-unwrapped in a template. Getting that wrong typechecks and renders
  // nothing, so it is asserted rather than assumed.
  it("opens from the pane's own button, with no shortcut configured", async () => {
    const w = await mountPane();
    expect(w.find('[data-testid="file-search"]').exists()).toBe(false);
    await w.find('[data-testid="files-search-btn"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="file-search"]').exists()).toBe(true);
  });

  it("opens from the host, which is how the `files-search` shortcut reaches it", async () => {
    const w = await mountPane();
    (w.vm as unknown as { openSearch: () => void }).openSearch();
    await flushPromises();
    expect(w.find('[data-testid="file-search"]').exists()).toBe(true);
  });

  // The half that makes a result worth clicking. Revealing alone leaves the reader at the top of
  // the file, having to find the match again by hand.
  it("opens the picked file AND puts the editor on the matching line", async () => {
    const w = await mountPane();
    await w.find('[data-testid="files-search-btn"]').trigger("click");
    await searchFor(w, "needle");

    await w.find('[data-testid="file-search-row"]').trigger("click");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenCalled(); // the file was opened
    expect(revealed).toEqual([12]); // and the editor was put on the match
    // IN THAT ORDER. `revealLine` acts on the document the editor is showing, so jumping before the
    // file arrives scrolls the file being left behind.
    // `setDoc` is handed the BASENAME — it selects the language, not the file.
    expect(calls.indexOf("setDoc:deep.ts")).toBeGreaterThan(-1);
    expect(calls.indexOf("reveal:12")).toBeGreaterThan(calls.indexOf("setDoc:deep.ts"));
    expect(w.find('[data-testid="file-search"]').exists()).toBe(false); // the panel got out of the way
  });

  // The pane is the only thing that knows the buffer is dirty, so this join is where that fact
  // reaches the panel at all — and where the quiet failure lives. The server reported the match at
  // line 12 of the SAVED file; the buffer has it on line 2. Showing 12 would send the jump into a
  // document the reader is not looking at.
  it("hands the unsaved buffer to the panel, whose answer replaces the disk's for that file", async () => {
    const w = await mountPane();
    await w.find('[data-testid="files-row"][data-path="src"]').trigger("click");
    await flushPromises();
    await w.find('[data-testid="files-row"][data-path="src/deep.ts"]').trigger("click");
    await flushPromises();

    await w.find('[data-testid="files-search-btn"]').trigger("click");
    await searchFor(w, "needle");
    // CLEAN so far: the file is on disk, so the server's answer stands.
    expect(w.find('[data-testid="file-search-row"]').text()).toContain("12");
    expect(w.find('[data-testid="file-search-unsaved"]').exists()).toBe(false);

    // Now type in the editor. `getDoc()` answers the buffer, whose needle is on line 2.
    markDirty();
    await flushPromises();
    expect(w.find('[data-testid="file-search-unsaved"]').exists()).toBe(true);
    const row = w.find('[data-testid="file-search-row"]');
    expect(row.text()).toContain("buffer needle two");
    expect(row.text()).not.toContain("a needle on twelve");

    // And the jump follows the buffer's line, not the disk's.
    await row.trigger("click");
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    expect(revealed).toEqual([2]);
  });
});
