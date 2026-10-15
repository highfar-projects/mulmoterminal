import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

// #3058. "Recently opened": which files this directory had open, so one whose tab was closed can be
// found again. Kept apart from History (#2574), which is one file's earlier versions.
const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const LISTING = ["a.ts", "b.ts", "c.ts"].map((name) => ({ name, dir: false, size: 1 }));

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: LISTING }) };
    if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v1" }) };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  document.body.innerHTML = "";
});

const mountPane = async (cwd = "/proj"): Promise<VueWrapper> => {
  const w = mount(FilesPane, { props: { cwd, initialState: { tabs: [], activePath: null, expanded: [] } }, attachTo: document.body });
  await flushPromises();
  return w;
};

const openRow = async (w: VueWrapper, path: string): Promise<void> => {
  await w.get(`[data-testid="files-row"][data-path="${path}"]`).trigger("click");
  await flushPromises();
};

const openMenu = async (w: VueWrapper): Promise<void> => {
  await w.get('[data-testid="files-recent-btn"]').trigger("click");
  await flushPromises();
};

const listed = (w: VueWrapper): string[] => w.findAll('[data-testid="files-recent-entry"]').map((row) => row.attributes("data-path") ?? "");

describe("the Files pane's recently opened files (#3058)", () => {
  it("lists the files opened here, newest first, with the open one marked", async () => {
    const w = await mountPane();
    await openRow(w, "a.ts");
    await openRow(w, "b.ts");
    await openMenu(w);
    expect(listed(w)).toEqual(["b.ts", "a.ts"]);
    expect(w.findAll('[data-testid="files-recent-entry"][aria-current="true"]').map((row) => row.attributes("data-path"))).toEqual(["b.ts"]);
  });

  it("opens the file picked, and closes the list", async () => {
    const w = await mountPane();
    await openRow(w, "a.ts");
    await openRow(w, "b.ts");
    await openMenu(w);
    await w.get('[data-testid="files-recent-entry"][data-path="a.ts"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="files-recent"]').exists()).toBe(false);
    expect(w.get('[data-testid="files-row"][aria-current="true"]').attributes("data-path")).toBe("a.ts");
  });

  it("keeps the list when the pane is mounted again, per directory", async () => {
    const first = await mountPane("/proj");
    await openRow(first, "c.ts");
    first.unmount();

    const again = await mountPane("/proj");
    await openMenu(again);
    expect(listed(again)).toEqual(["c.ts"]);
    again.unmount();

    const other = await mountPane("/other");
    await openMenu(other);
    expect(listed(other)).toEqual([]);
  });

  // The History menu beside it lists ONE file's earlier versions; the two must not read as the same thing.
  it("is titled as recently opened files, not as history", async () => {
    const w = await mountPane();
    await openMenu(w);
    const panel = w.get('[data-testid="files-recent"]').text();
    expect(panel).toContain("Recently opened");
    expect(panel).not.toMatch(/history/i);
  });

  it("closes on Escape and on a press outside it", async () => {
    const w = await mountPane();
    await openMenu(w);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(w.find('[data-testid="files-recent"]').exists()).toBe(false);

    await openMenu(w);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(w.find('[data-testid="files-recent"]').exists()).toBe(false);
  });
});
