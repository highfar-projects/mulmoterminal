// #3079: a folder opened as a gallery from its row menu, over the pane's file area.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

const ROOT = [
  { name: "shots", dir: true, size: 0 },
  { name: "notes.md", dir: false, size: 10 },
];
const SHOTS = [
  { name: "b.png", dir: false, size: 10 },
  { name: "a.mp4", dir: false, size: 10 },
  { name: "readme.md", dir: false, size: 10 },
];

const fs = { shotsGone: false };

beforeEach(() => {
  // A tree operation puts the keyboard on a row by its escaped path; jsdom has no CSS.escape.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  fs.shotsGone = false;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.href);
    if (url.pathname.endsWith("/rename")) {
      fs.shotsGone = true;
      return { ok: true, json: async () => ({ path: "photos" }) };
    }
    if (url.pathname.endsWith("/list") && url.searchParams.get("path") === "shots" && fs.shotsGone) return { ok: false, status: 404, json: async () => ({}) };
    if (url.pathname.endsWith("/list")) return { ok: true, json: async () => ({ entries: url.searchParams.get("path") === "shots" ? SHOTS : ROOT }) };
    if (url.pathname.endsWith("/text")) return { ok: true, json: async () => ({ text: "# hi", version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const rowNamed = (w: ReturnType<typeof mount>, name: string) => w.findAll('[data-testid="files-row"]').find((row) => row.text().includes(name));

async function openGallery(w: ReturnType<typeof mount>): Promise<void> {
  rowNamed(w, "shots")?.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  await flushPromises();
  document.querySelector<HTMLElement>('[data-testid="files-row-action-open-gallery"]')?.click();
  await flushPromises();
}

describe("FilesPane — a folder as a gallery (#3079)", () => {
  it("opens from a folder's row menu with that folder's media, in name order", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    const tiles = w.findAll('[data-testid="files-gallery-tile"]');
    expect(tiles.map((tile) => tile.text())).toEqual([expect.stringContaining("a.mp4"), expect.stringContaining("b.png")]);
    expect(w.find("video").attributes("src")).toContain("path=shots%2Fa.mp4");
  });

  it("goes when a file is opened from the tree, and the file is what shows", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    await rowNamed(w, "notes.md")?.trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
    expect(fakeEditor.setDoc).toHaveBeenLastCalledWith("# hi", "notes.md");
  });

  // Asked of the open file, not of the tree: a terminal link or the host opening a file is a file opened too.
  it("goes when a file is opened from outside the tree", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    await w.setProps({ requestedPath: "notes.md" });
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  // The file already open is opened again by its row: nothing changes path, and the gallery still has to go.
  it("goes when the file already open is clicked in the tree", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await rowNamed(w, "notes.md")?.trigger("click");
    await flushPromises();
    await openGallery(w);
    await rowNamed(w, "notes.md")?.trigger("click");
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  it("takes the keyboard as it opens, so Esc closes it straight away", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    expect(document.activeElement).toBe(w.get('[data-testid="files-gallery"]').element);
    await w.get('[data-testid="files-gallery"]').trigger("keydown", { key: "Escape" });
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  // Opening the file already in front changes no path, and is still a file opened (Codex round 2).
  it("goes when the file in front is opened again from its row menu", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await rowNamed(w, "notes.md")?.trigger("click");
    await flushPromises();
    await openGallery(w);
    rowNamed(w, "notes.md")?.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="files-row-action-open-tab"]')?.click();
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  it("goes when the pane is re-rooted", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    await w.setProps({ cwd: "/other" });
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  // Its tiles would all point at a folder that is not there any more (Codex round 2).
  it("goes when its folder is renamed from the tree", async () => {
    vi.stubGlobal("prompt", () => "photos");
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    rowNamed(w, "shots")?.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="files-row-action-rename"]')?.click();
    await flushPromises();
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });

  it("stays when renaming its folder is cancelled", async () => {
    vi.stubGlobal("prompt", () => null);
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    rowNamed(w, "shots")?.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await flushPromises();
    document.querySelector<HTMLElement>('[data-testid="files-row-action-rename"]')?.click();
    await flushPromises();
    expect(w.findAll('[data-testid="files-gallery-tile"]')).toHaveLength(2);
  });

  it("closes from its own button", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" }, attachTo: document.body });
    await flushPromises();
    await openGallery(w);
    await w.get('[data-testid="files-gallery-close"]').trigger("click");
    expect(w.find('[data-testid="files-gallery"]').exists()).toBe(false);
  });
});
