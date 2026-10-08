import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

// #2674. A PDF, a video and a sound are drawn from the raw route instead of being read as text, and
// a file too large to edit still offers Open in OS rather than a dead end.
const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

interface Fs {
  /** Paths over the server's edit cap: the text and version routes answer 413. */
  tooLarge: Set<string>;
  textReads: string[];
}

function mockFs(): Fs {
  const fs: Fs = { tooLarge: new Set(), textReads: [] };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: [] }) };
    if (url.pathname.endsWith("/backups")) return { ok: true, json: async () => ({ backups: [] }) };
    if (url.pathname.includes("/text")) fs.textReads.push(path);
    const reads = url.pathname.includes("/text") || url.pathname.includes("/version");
    if (reads && fs.tooLarge.has(path)) return { ok: false, status: 413, json: async () => ({ error: "file too large to edit" }) };
    if (url.pathname.includes("/version")) return { ok: true, json: async () => ({ version: "v7" }) };
    return { ok: true, json: async () => ({ text: `text of ${path}`, version: "v1" }) };
  }) as unknown as typeof fetch;
  return fs;
}

async function mountOn(path: string): Promise<VueWrapper> {
  const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { tabs: [{ path }], activePath: path, expanded: [] } }, attachTo: document.body });
  await flushPromises();
  return w;
}

describe("the Files pane draws a PDF, a video and a sound (#2674)", () => {
  let fs: Fs;
  beforeEach(() => {
    fs = mockFs();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows a PDF in a frame on the raw route, never reading it as text", async () => {
    const w = await mountOn("docs/paper.pdf");

    const frame = w.find('[data-testid="files-pdf"]');
    expect(frame.attributes("src")).toBe("/api/files/raw?cwd=%2Fproj&path=docs%2Fpaper.pdf&v=v7");
    // The raw route leaves a PDF unsandboxed for WebKit, and a frame attribute would undo that.
    expect(frame.attributes("sandbox")).toBeUndefined();
    expect(fs.textReads).toEqual([]);
    expect(w.find('[data-testid="files-open-in-os"]').exists()).toBe(true);
    expect(w.findAll("button").some((b) => b.text() === "Preview")).toBe(false);
  });

  // Over the edit cap the version route answers 413 as well; the file still shows, with no version.
  it.each([
    ["scan.pdf", "files-pdf"],
    ["recording.mp4", "files-video"],
    ["memo.m4a", "files-audio"],
  ])("draws %s over the edit cap", async (path, testid) => {
    fs.tooLarge.add(path);
    const w = await mountOn(path);

    expect(w.find(`[data-testid="${testid}"]`).attributes("src")).toBe(`/api/files/raw?cwd=%2Fproj&path=${path}`);
    expect(w.find('[data-testid="files-error"]').exists()).toBe(false);
  });

  it.each([
    ["clip.webm", "files-video"],
    ["song.mp3", "files-audio"],
  ])("gives %s player controls", async (path, testid) => {
    const w = await mountOn(path);
    expect(w.find(`[data-testid="${testid}"]`).attributes("controls")).toBeDefined();
    expect(w.find('[data-testid="files-image"]').exists()).toBe(false);
  });

  // It used to be an error with nothing to press: 413 threw where 415 offered the button.
  it("offers Open in OS for a file too large to edit", async () => {
    fs.tooLarge.add("huge.log");
    const w = await mountOn("huge.log");

    expect(w.find('[data-testid="files-error"]').exists()).toBe(false);
    expect(w.find('[data-testid="files-unpreviewable"]').text()).toContain("file too large to edit");
    expect(w.find('[data-testid="files-open-in-os"]').exists()).toBe(true);
  });
});
