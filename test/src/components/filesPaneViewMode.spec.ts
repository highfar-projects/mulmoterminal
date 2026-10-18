// #3075: the pane beside a cell opens the next file in the view last chosen in that cell's session,
// when the file has that view, and a file's own memory still wins.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

const fakeEditor = fakeCmEditor("edited text");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const NAMES = ["a.md", "b.md", "main.ts", "c.md"] as const;
type Name = (typeof NAMES)[number];

function mockFs(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/list")) return { ok: true, json: async () => ({ entries: NAMES.map((name) => ({ name, dir: false, size: 10 })) }) };
    if (url.includes("/text")) return { ok: true, json: async () => ({ text: url.includes("main.ts") ? "const a = 1;" : "# hello", version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
}

const CANVAS_STUB = { stubs: { FilesCanvasView: true } };
type Pane = ReturnType<typeof mount>;

const mountPane = async (session: string | null): Promise<Pane> => {
  const w = mount(FilesPane, { props: { cwd: "/proj", canvasTarget: true, viewModeSession: session }, global: CANVAS_STUB });
  await flushPromises();
  return w;
};
const openRow = async (w: Pane, name: Name, event: Record<string, boolean> = {}): Promise<void> => {
  await w.findAll('[data-testid="files-row"]')[NAMES.indexOf(name)]?.trigger("click", event);
  await flushPromises();
};
const modeButton = (w: Pane) => w.findAll("button").find((b) => b.text() === "Preview" || b.text() === "Edit");
const inPreview = (w: Pane) => !(w.find("iframe").attributes("style") ?? "").includes("display: none");
const inCanvas = (w: Pane) => w.findComponent({ name: "FilesCanvasView" }).exists();
const clickCanvas = async (w: Pane): Promise<void> => {
  await w.find('[data-testid="files-canvas-btn"]').trigger("click");
  await flushPromises();
};
const clickMode = async (w: Pane): Promise<void> => {
  await modeButton(w)?.trigger("click");
  await flushPromises();
};

beforeEach(() => {
  localStorage.clear();
  mockFs();
});

describe("FilesPane carrying the view to the next file (#3075)", () => {
  it("opens the next Markdown file in Preview once Preview was chosen", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickMode(w);
    await openRow(w, "b.md");
    expect(inPreview(w)).toBe(true);
    expect(modeButton(w)?.text()).toBe("Edit");
  });

  it("opens the next Markdown file in the Canvas view once that was chosen", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickCanvas(w);
    await openRow(w, "b.md");
    expect(inCanvas(w)).toBe(true);
    expect(w.findComponent({ name: "FilesCanvasView" }).props("card")).toMatchObject({ data: { docPath: "/proj/b.md" } });
  });

  // A `.ts` has no Preview: it opens on its editor, and the view stays chosen for the next document.
  it("opens a file without that view on its editor, and keeps the view for the next file", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickMode(w);
    await openRow(w, "main.ts");
    expect(inPreview(w)).toBe(false);
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("const a = 1;", "main.ts");
    await openRow(w, "c.md");
    expect(inPreview(w)).toBe(true);
  });

  it("goes back to opening on the editor once Edit is chosen", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickMode(w);
    await clickMode(w);
    await openRow(w, "b.md");
    expect(inPreview(w)).toBe(false);
  });

  it("keeps a session's choice across a remount, and keeps two sessions apart", async () => {
    const first = await mountPane("s1");
    await openRow(first, "a.md");
    await clickMode(first);
    first.unmount();

    const again = await mountPane("s1");
    await openRow(again, "b.md");
    expect(inPreview(again)).toBe(true);

    const other = await mountPane("s2");
    await openRow(other, "b.md");
    expect(inPreview(other)).toBe(false);
  });

  // A tab remembers the view it was left in, and coming back to it is coming back to that.
  it("lets a tab's own view win over the carried one", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await openRow(w, "b.md", { metaKey: true });
    await clickMode(w);
    await w.findAll('[data-testid="files-tab"]')[0]?.trigger("click");
    await flushPromises();
    expect(inPreview(w)).toBe(false);
  });

  it("lets a path still in the Canvas view come back to it, whatever was chosen since", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickCanvas(w);
    await openRow(w, "b.md");
    await clickCanvas(w); // b back to its editor: the carried view is now the editor
    await openRow(w, "a.md");
    expect(inCanvas(w)).toBe(true);
  });

  // a.md is still in the Canvas view, so it comes back there and the carried Preview is not put
  // behind it: leaving the Canvas view lands on its editor.
  it("does not hand the carried view to a path still in the Canvas view", async () => {
    const w = await mountPane("s1");
    await openRow(w, "a.md");
    await clickCanvas(w);
    await openRow(w, "b.md");
    await clickCanvas(w);
    await clickMode(w); // b in Preview: the carried view is now Preview
    await openRow(w, "a.md");
    expect(inCanvas(w)).toBe(true);
    await clickCanvas(w);
    expect(inPreview(w)).toBe(false);
  });

  it("opens every file on its editor with no session, as before", async () => {
    const w = await mountPane(null);
    await openRow(w, "a.md");
    await clickMode(w);
    await openRow(w, "b.md");
    expect(inPreview(w)).toBe(false);
  });
});
