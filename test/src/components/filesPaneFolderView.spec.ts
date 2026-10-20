// #3120: the folder the empty file area shows, as the pane wires it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
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

type Entry = { name: string; dir: boolean; size: number };
const file = (name: string): Entry => ({ name, dir: false, size: 10 });
const disk = new Map<string, Entry[]>();
const listings: string[] = [];
/** Listings that answer only once their promise settles, to hold a read mid-flight. */
const held = new Map<string, Promise<void>>();

beforeEach(() => {
  // A tree operation puts the keyboard on a row by its escaped path; jsdom has no CSS.escape.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  listings.length = 0;
  held.clear();
  disk.clear();
  disk.set("", [{ name: "shots", dir: true, size: 0 }, file("notes.md"), file("a.png")]);
  disk.set("shots", [{ name: "old", dir: true, size: 0 }, file("b.png")]);
  disk.set("shots/old", [file("c.png")]);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.href);
    if (url.pathname.endsWith("/list")) {
      const pathRel = url.searchParams.get("path") ?? "";
      listings.push(pathRel);
      await held.get(pathRel);
      const entries = disk.get(pathRel);
      return entries ? { ok: true, json: async () => ({ entries }) } : { ok: false, status: 404, json: async () => ({}) };
    }
    if (url.pathname.endsWith("/text")) return { ok: true, json: async () => ({ text: "# hi", version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const folderRows = (w: VueWrapper) => w.findAll('[data-testid="files-folder-row"]').map((row) => row.attributes("data-path"));
const treeRow = (w: VueWrapper, name: string) => w.findAll('[data-testid="files-row"]').find((row) => row.text().includes(name));

describe("FilesPane — the folder in the empty file area (#3120)", () => {
  it("reads the folder on show again from the header's reload, as it does the tree", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    disk.set("", [...(disk.get("") ?? []), file("new.png")]);
    await w
      .findAll("button")
      .find((button) => button.attributes("aria-label") === "Reload tree")
      ?.trigger("click");
    await flushPromises();
    expect(folderRows(w)).toContain("new.png");
  });

  it("is not drawn under the right-click gallery, so its tiles cannot play unseen", async () => {
    localStorage.setItem("files_folder_view_mode", "gallery");
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    expect(w.findAll('[data-testid="files-gallery"]')).toHaveLength(1);
    treeRow(w, "shots")?.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="files-row-action-open-gallery"]')?.click();
    await flushPromises();
    expect(w.find('[data-testid="files-folder-view"]').exists()).toBe(false);
    expect(w.findAll('[data-testid="files-gallery"]')).toHaveLength(1);
    await w.get('[data-testid="files-gallery-close"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="files-folder-view"]').exists()).toBe(true);
  });

  // The pane's teardown runs on unmount as well as on a re-root, and resets the folder on the way.
  it("reads nothing as the pane closes", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    listings.length = 0;
    w.unmount();
    await flushPromises();
    expect(listings).toEqual([]);
  });

  it("keeps the keyboard in the pane when a row opens its file, the row going with the view", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    const row = w.get<HTMLElement>('[data-testid="files-folder-row"][data-path="notes.md"]');
    row.element.focus();
    await row.trigger("click");
    await flushPromises();
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# hi", "notes.md");
    expect(document.activeElement).not.toBe(document.body);
  });

  it("opens the tree down to a folder the view moves to, and leaves it open going up (#3134)", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="files-folder-row"][data-path="shots"]').trigger("click");
    await flushPromises();
    await w.get('[data-testid="files-folder-row"][data-path="shots/old"]').trigger("click");
    await flushPromises();
    expect(treeRow(w, "c.png")).toBeDefined();
    await w.get('[data-testid="files-folder-up"]').trigger("click");
    await flushPromises();
    expect(folderRows(w)).toContain("shots/old");
    expect(treeRow(w, "c.png")).toBeDefined();
  });

  // A folder, not a file: opening a file brings a tab forward, which the tree follows and which
  // would overtake the move by itself.
  it("does not scroll the tree off a folder clicked in it while a move was still opening folders (#3134)", async () => {
    const scrolledTo: string[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.path) scrolledTo.push(this.dataset.path);
    });
    let release = (): void => {};
    held.set("shots", new Promise<void>((resolve) => (release = resolve)));
    disk.set("", [...(disk.get("") ?? []), { name: "docs", dir: true, size: 0 }]);
    disk.set("docs", [file("d.md")]);
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="files-folder-row"][data-path="shots"]').trigger("click");
    await flushPromises(); // the tree's read of shots is held
    await treeRow(w, "docs")?.trigger("click");
    await flushPromises();
    release();
    await flushPromises();
    expect(scrolledTo).not.toContain("shots");
  });

  it("does not scroll to a folder clicked in the tree to collapse it while a move into it was opening it (#3134)", async () => {
    const scrolledTo: string[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
      if (this instanceof HTMLElement && this.dataset.path) scrolledTo.push(this.dataset.path);
    });
    let release = (): void => {};
    held.set("shots", new Promise<void>((resolve) => (release = resolve)));
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await w.get('[data-testid="files-folder-row"][data-path="shots"]').trigger("click");
    await flushPromises(); // the tree's read of shots is held
    await treeRow(w, "shots")?.trigger("click");
    release();
    await flushPromises();
    expect(scrolledTo).not.toContain("shots");
  });
});
