import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

// Don't instantiate real CodeMirror (needs a full DOM); capture the change callback so a user edit
// can be simulated.
let onChange: () => void = () => {};
const fakeEditor = fakeCmEditor("edited text");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: (_host: HTMLElement, cb: () => void) => ((onChange = cb), fakeEditor) };
});

const writeCalls = () => (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => String(c[0]).includes("/write"));

// The Canvas button (#1374). What it is gated on matters twice over: it decides whether the
// button is offered at all, and it has to agree with the card built from the same row — a button
// that appears and does nothing is worse than no button. Since #3008 it switches the open file to
// the Canvas's plugin view inside this pane, with the tree left where it is.
// The plugin views themselves are the packages' to test; what this pane owes is the card it hands one.
const CANVAS_STUB = { stubs: { FilesCanvasView: true } };

describe("the Canvas button", () => {
  const withEntry = (name: string) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name, dir: false, size: 10 }] }) };
      return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    }) as unknown as typeof fetch;
  };

  const openRow = async (name: string, cwd: string | null, canvasTarget = true, workspace: string | null = null) => {
    // The pane takes the pair now (#1933); these cases are all the pre-named-root world, where the
    // workspace's own stories directory is the only root there is.
    withEntry(name);
    const w = mount(FilesPane, { props: { cwd, canvasTarget, storiesRoots: { workspaces: workspace ? [workspace] : [], roots: [] } }, global: CANVAS_STUB });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    return w;
  };

  const btn = (w: Awaited<ReturnType<typeof openRow>>) => w.find('[data-testid="files-canvas-btn"]');

  it("is offered for a file the Canvas can render, and switches the file to its view in place", async () => {
    const w = await openRow("design.md", "/work/proj");
    expect(btn(w).exists()).toBe(true);
    await btn(w).trigger("click");
    await flushPromises();
    // The card the Canvas would have drawn, built from the path joined under this pane's cwd.
    const view = w.findComponent({ name: "FilesCanvasView" });
    expect(view.props("card")).toMatchObject({ toolName: "presentDocument", data: { markdown: "", docPath: "/work/proj/design.md" } });
    expect(btn(w).attributes("aria-pressed")).toBe("true");
    // The tree stays, and the editor-only controls go while the editor is not what is showing.
    expect(w.findAll('[data-testid="files-row"]')).toHaveLength(1);
    expect(w.find('[data-testid="files-side-by-side"]').exists()).toBe(false);

    await btn(w).trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  // The session's Canvas is the agent's; a file looked at here is not put into it.
  it("writes no card to the session's Canvas", async () => {
    const w = await openRow("design.md", "/work/proj");
    await btn(w).trigger("click");
    await flushPromises();
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((url) => url.includes("/api/agent/toolResult"))).toBe(false);
  });

  // The view reads the file from disk, so an edit still in the buffer would be missing from it.
  it("saves the buffer before drawing the file", async () => {
    const w = await openRow("design.md", "/work/proj");
    onChange();
    await flushPromises();
    await btn(w).trigger("click");
    await flushPromises();
    expect(writeCalls().length).toBeGreaterThan(0);
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(true);
  });

  // Canvas mode is held per RELATIVE path, so a re-root must drop it: the same name under the new
  // root is a different file the user never switched.
  it("forgets which files were in Canvas view when the pane is re-rooted", async () => {
    const w = await openRow("design.md", "/work/proj");
    await btn(w).trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(true);
    await w.setProps({ cwd: "/work/other" });
    await w.vm.reload();
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  // Switching stays on the same file, so a save that loses the version race must not be banked and
  // marked clean the way leaving a file is: the conflict banner stays up over the editor instead.
  it("stays on the editor with the conflict banner when the save loses to another writer", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "design.md", dir: false, size: 10 }] }) };
      if (init?.method === "PUT" && url.includes("/write")) return { ok: false, status: 409, json: async () => ({ version: "theirs" }) };
      if (init?.method === "PUT") return { ok: true, json: async () => ({ stored: true }) };
      return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    }) as unknown as typeof fetch;
    const w = mount(FilesPane, { props: { cwd: "/work/proj", canvasTarget: true, storiesRoots: { workspaces: [], roots: [] } }, global: CANVAS_STUB });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    onChange();
    await flushPromises();
    await btn(w).trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="files-conflict"]').exists()).toBe(true);
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  // #3011: what the pane hands its host to remember, and what it does with it handed back.
  it("puts the Canvas view in its snapshot, and comes back to it from one", async () => {
    const w = await openRow("design.md", "/work/proj");
    await btn(w).trigger("click");
    await flushPromises();
    const snapshot = w.vm.snapshot();
    expect(snapshot.tabs).toEqual([expect.objectContaining({ path: "design.md", showCanvas: true })]);

    withEntry("design.md");
    const back = mount(FilesPane, { props: { cwd: "/work/proj", canvasTarget: true, initialState: snapshot }, global: CANVAS_STUB });
    await flushPromises();
    expect(back.findComponent({ name: "FilesCanvasView" }).exists()).toBe(true);
    expect(btn(back).attributes("aria-pressed")).toBe("true");
  });

  // An open that gets in before the remembered tabs are put back (#1979) comes up as text, as it would
  // with Preview — whether it has landed by then or is still in flight, so no remembered Canvas view is
  // put back that time.
  it.each([
    ["landed", false],
    ["still in flight", true],
  ])("puts no remembered Canvas view back when an open won the restore race (%s)", async (_case, holdOpen) => {
    let releaseSrc!: () => void;
    const srcGate = new Promise<void>((resolve) => (releaseSrc = resolve));
    let releaseText!: () => void;
    const textGate = new Promise<void>((resolve) => (releaseText = resolve));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://x");
      if (url.pathname.includes("/list")) {
        if (url.searchParams.get("path") === "src") {
          await srcGate;
          return { ok: true, json: async () => ({ entries: [] }) };
        }
        const entries = [
          { name: "src", dir: true, size: 0 },
          { name: "a.md", dir: false, size: 1 },
          { name: "b.md", dir: false, size: 1 },
        ];
        return { ok: true, json: async () => ({ entries }) };
      }
      if (holdOpen && url.searchParams.get("path") === "a.md") await textGate;
      return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    }) as unknown as typeof fetch;
    const initialState = {
      tabs: [
        { path: "a.md", showCanvas: true },
        { path: "b.md", showCanvas: true },
      ],
      activePath: "b.md",
      expanded: ["src"],
    };
    const w = mount(FilesPane, { props: { cwd: "/work/proj", canvasTarget: true, initialState }, global: CANVAS_STUB });
    await flushPromises(); // restore is held on `src`

    const opening = w.vm.openFile("a.md", undefined, false);
    await flushPromises();
    releaseSrc();
    await flushPromises();
    releaseText();
    await opening;
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  // A line lives in the text (#3010): a terminal path naming one brings the editor back, at that line,
  // the way it already brings a Preview back to Edit. A click with no line keeps the Canvas view.
  it("leaves the Canvas view for a terminal path that names a line, and keeps it for one that does not", async () => {
    const w = await openRow("design.md", "/work/proj");
    await btn(w).trigger("click");
    await flushPromises();
    await w.vm.openFile("design.md", undefined, false);
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(true);

    fakeEditor.goTo.mockClear();
    await w.vm.openFile("design.md", { line: 2, col: null }, false);
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
    expect(fakeEditor.goTo).toHaveBeenCalledWith({ line: 2, col: 0 });
  });

  // The contract is the REQUEST, not the landing (#3010): a located open the pane declines — the front
  // buffer could be neither saved nor backed up — still takes the target out of the Canvas view.
  it("takes the target out of the Canvas view even when the located open is declined", async () => {
    let writesFail = false;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/list"))
        return {
          ok: true,
          json: async () => ({
            entries: [
              { name: "a.md", dir: false, size: 1 },
              { name: "b.md", dir: false, size: 1 },
            ],
          }),
        };
      if (init?.method === "PUT")
        return writesFail
          ? { ok: false, status: 500, json: async () => ({ error: "disk full" }) }
          : { ok: true, json: async () => ({ ok: true, version: "v2" }) };
      return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    }) as unknown as typeof fetch;
    const w = mount(FilesPane, { props: { cwd: "/work/proj", canvasTarget: true, storiesRoots: { workspaces: [], roots: [] } }, global: CANVAS_STUB });
    await flushPromises();
    const row = (name: string) => w.get(`[data-testid="files-row"][data-path="${name}"]`);
    await row("b.md").trigger("click");
    await flushPromises();
    await btn(w).trigger("click");
    await flushPromises();
    await row("a.md").trigger("click", { metaKey: true });
    await flushPromises();
    onChange();
    await flushPromises();

    writesFail = true;
    await w.vm.openFile("b.md", { line: 42, col: null }, false);
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(w.find('[data-testid="files-error"]').exists()).toBe(true); // declined: a.md is still in front

    writesFail = false;
    await row("b.md").trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  // The store is per directory, and nothing ties a remembered state to the surface that wrote it.
  it("ignores a remembered Canvas view where there is no Canvas view to show", async () => {
    withEntry("design.md");
    const initialState = { tabs: [{ path: "design.md", showCanvas: true }], activePath: "design.md", expanded: [] };
    const w = mount(FilesPane, { props: { cwd: "/work/proj", canvasTarget: false, initialState }, global: CANVAS_STUB });
    await flushPromises();
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
  });

  // A story is built by the server, which can refuse with a sentence of its own (#1941).
  it("shows the server's refusal and stays on the editor", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "tale.json", dir: false, size: 10 }] }) };
      if (url.includes("/api/plugin/presentMulmoScript")) return { ok: true, json: async () => ({ ok: false, error: "File not found: stories/tale.json" }) };
      return { ok: true, json: async () => ({ text: "{}", version: "v1" }) };
    }) as unknown as typeof fetch;
    const w = mount(FilesPane, {
      props: { cwd: "/work/ws/artifacts/stories", canvasTarget: true, storiesRoots: { workspaces: ["/work/ws"], roots: [] } },
      global: CANVAS_STUB,
    });
    await flushPromises();
    await w.findAll('[data-testid="files-row"]')[0].trigger("click");
    await flushPromises();
    await btn(w).trigger("click");
    await flushPromises();
    const error = w.find('[data-testid="files-error"]');
    expect(error.text()).toBe("File not found: stories/tale.json");
    expect(error.attributes("role")).toBe("alert");
    expect(w.findComponent({ name: "FilesCanvasView" }).exists()).toBe(false);
    expect(btn(w).attributes("aria-pressed")).toBe("false");
  });

  it("is not offered for a file no plugin renders", async () => {
    expect(btn(await openRow("notes.txt", "/work/proj")).exists()).toBe(false);
  });

  // FilesOverlay mounts this pane full-screen, where there is no enlarged cell to put a Canvas
  // beside — so the button must not appear even for a file that would render.
  it("is not offered without a cell to open it beside", async () => {
    expect(btn(await openRow("design.md", "/work/proj", false)).exists()).toBe(false);
  });

  // WHERE a story is decides its wire spelling — a workspace-relative `stories/…` under the
  // registered root, its own absolute path anywhere else — but since #1976 it no longer decides
  // whether the button appears. A project cell's own artifacts/stories used to be silently
  // unopenable; it opens by path now, and the card is the same card as the workspace one when it
  // IS the same file.
  it("is offered for a story in the workspace and for one outside it", async () => {
    expect(btn(await openRow("tale.json", "/work/ws/artifacts/stories", true, "/work/ws")).exists()).toBe(true);
    expect(btn(await openRow("tale.json", "/work/other/artifacts/stories", true, "/work/ws")).exists()).toBe(true);
  });

  // The limit the README and both guides now state: without a directory to join the row onto, the
  // row is not a path anything can resolve — the pane falls back to the bare row, and a relative
  // `filePath` would name the DEFAULT stories root's file of that name instead (CodeRabbit on
  // #1992). The pane shows `(default workspace)` in its header in that state.
  it("is withheld for a deck when the pane has no directory to resolve the row against", async () => {
    expect(btn(await openRow("keynote.json", "/work/proj")).exists()).toBe(true);
    expect(btn(await openRow("keynote.json", null)).exists()).toBe(false);
  });

  // The gate runs on the JOINED path, not the row's. `p.html` passes on its own and fails under a
  // directory with a dot segment, which the plugin's iframe mount refuses — so offering it there
  // would be offering a click that silently does nothing.
  it("is withheld when the cell's own directory is what the plugin refuses", async () => {
    expect(btn(await openRow("p.html", "/home/me/proj")).exists()).toBe(true);
    expect(btn(await openRow("p.html", "/home/me/.config/proj")).exists()).toBe(false);
  });
});
