import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";

// Don't instantiate real CodeMirror (needs a full DOM) — the mode lives beside the editor, not
// inside it.
const fakeEditor = { setDoc: vi.fn(), getDoc: vi.fn(() => "edited text"), destroy: vi.fn() };
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

function mockFs() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
    if (url.includes("/text")) return { ok: true, json: async () => ({ text: "# hello", version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
}

// #2137. Reading a `.md` in Preview is what the pane is FOR half the time, and the file coming
// back in the editor every reload and every walk of the zoom is the thing being fixed here. The
// other direction is the danger: the preview iframe is not gated on the file being Markdown, so a
// mode that outlives its file is an iframe with no way back to the editor.
describe("FilesPane remembering which view was up", () => {
  const modeButton = (w: ReturnType<typeof mount>) => w.findAll("button").find((b) => b.text() === "Preview" || b.text() === "Edit");
  // Both panes are always in the DOM (`v-show`), and the inline display is what says which one is
  // up — `isVisible()` reports a `display: none` element as visible on a detached mount.
  const inPreview = (w: ReturnType<typeof mount>) => !(w.find("iframe").attributes("style") ?? "").includes("display: none");

  beforeEach(() => {
    fakeEditor.setDoc.mockClear();
    mockFs();
  });

  it("carries the mode in what it reports to remember", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    await modeButton(w)?.trigger("click");

    expect((w.vm as unknown as { snapshot: () => { showPreview?: boolean } }).snapshot().showPreview).toBe(true);
  });

  it("comes back in Preview over the file it was remembered for", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "README.md", expanded: [], showPreview: true } } });
    await flushPromises();

    expect(inPreview(w)).toBe(true);
    expect(modeButton(w)?.text()).toBe("Edit"); // the way back is there
  });

  it("starts in the editor when nothing was remembered about the mode", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "README.md", expanded: [] } } });
    await flushPromises();
    expect(inPreview(w)).toBe(false);
  });

  // The mode is remembered per directory, and a directory's entry can name a file the pane has no
  // preview for at all — a state written by hand, or a `.md` renamed since (Codex on #2137).
  it("starts in the editor when the remembered path is not markdown", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "main.ts", dir: false, size: 10 }] }) };
      if (url.includes("/text")) return { ok: true, json: async () => ({ text: "const a = 1;", version: "v1" }) };
      return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
    }) as unknown as typeof fetch;

    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "main.ts", expanded: [], showPreview: true } } });
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenCalledWith("const a = 1;", "main.ts");
    expect(inPreview(w)).toBe(false);
    expect(modeButton(w)).toBeUndefined(); // nothing to toggle, so nothing may be showing
  });

  // A remembered path holds whatever is there NOW. Previewing something the server will not serve
  // as text is a blank iframe over a file the pane has a real panel for.
  it("falls back to the editor when the remembered path is no longer previewable", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
      if (url.includes("/text")) return { ok: false, status: 415, json: async () => ({ error: "this file is not text" }) };
      return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
    }) as unknown as typeof fetch;

    const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { openPath: "README.md", expanded: [], showPreview: true } } });
    await flushPromises();

    expect(inPreview(w)).toBe(false);
    expect(w.find('[data-testid="files-unpreviewable"]').exists()).toBe(true);
    expect(modeButton(w)?.text()).toBe("Preview"); // the pane is in the editor, and says so
  });

  // The reset this replaced was unconditional, and this is what it was for: the iframe asks only
  // whether the file is readable, while the toggle back to the editor asks whether it is Markdown.
  it("drops the preview when another file is opened", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) {
        return {
          ok: true,
          json: async () => ({
            entries: [
              { name: "README.md", dir: false, size: 10 },
              { name: "main.ts", dir: false, size: 10 },
            ],
          }),
        };
      }
      if (url.includes("/text")) return { ok: true, json: async () => ({ text: "# hello", version: "v1" }) };
      return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
    }) as unknown as typeof fetch;

    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    await modeButton(w)?.trigger("click");
    expect(inPreview(w)).toBe(true);

    await w.findAll('[data-testid="files-row"]')[1].trigger("click");
    await flushPromises();
    expect(inPreview(w)).toBe(false);
    expect(modeButton(w)).toBeUndefined(); // no toggle at all on a file that is not Markdown
  });

  // A restore that lost its race must not hand its mode to the pane that won it. The host calls
  // reload() to re-root the pane as the zoom walks between cells, so a slow read from the cell
  // being left can still be in flight while the new cell's restore has already finished — and
  // applying the OLD state's mode then would land the reader in the editor (Codex on #2137).
  it("does not let a load that lost its race set the mode", async () => {
    let releaseFirstRead!: () => void;
    const firstRead = new Promise<void>((resolve) => (releaseFirstRead = resolve));
    let reads = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/text")) {
        reads += 1;
        if (reads === 1) await firstRead;
        return { ok: true, json: async () => ({ text: "# hello", version: "v1" }) };
      }
      return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
    }) as unknown as typeof fetch;

    // The cell being left was in the editor; the one arriving was in Preview, on the same path.
    const w = mount(FilesPane, { props: { cwd: "/left", initialState: { openPath: "README.md", expanded: [], showPreview: false } } });
    await flushPromises(); // the first restore is parked inside its read

    await w.setProps({ cwd: "/right", initialState: { openPath: "README.md", expanded: [], showPreview: true } });
    await (w.vm as unknown as { reload: () => Promise<void> }).reload();
    await flushPromises();
    expect(inPreview(w)).toBe(true);

    releaseFirstRead();
    await flushPromises();
    expect(inPreview(w)).toBe(true); // the abandoned read does not get to answer
  });

  // The one same-path re-read that must NOT keep the mode: what comes back is no longer text, so
  // there is no preview to be in — and the pane has its own panel for that.
  it("leaves Preview when the open file comes back as something that is not text", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    await modeButton(w)?.trigger("click");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/version")) return { ok: true, json: async () => ({ version: "v9" }) };
      if (url.includes("/text")) return { ok: false, status: 415, json: async () => ({ error: "this file is not text" }) };
      return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
    }) as unknown as typeof fetch;
    vi.advanceTimersByTime(30_000);
    await flushPromises();

    expect(w.find('[data-testid="files-unpreviewable"]').exists()).toBe(true);
    expect(inPreview(w)).toBe(false);
    expect((w.vm as unknown as { snapshot: () => { showPreview?: boolean } }).snapshot().showPreview).toBe(false);
    vi.useRealTimers();
  });

  // The same file re-read is not the pane leaving it. The agent editing the very file being read
  // is the ordinary case here, and each of its writes used to end the reading session.
  it("stays in Preview when the open file changes on disk", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    await modeButton(w)?.trigger("click");

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/version")) return { ok: true, json: async () => ({ version: "v9" }) };
      if (url.includes("/text")) return { ok: true, json: async () => ({ text: "# from the agent", version: "v9" }) };
      return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
    }) as unknown as typeof fetch;
    vi.advanceTimersByTime(30_000);
    await flushPromises();

    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# from the agent", "README.md"); // it did re-read
    expect(inPreview(w)).toBe(true);
    vi.useRealTimers();
  });
});
