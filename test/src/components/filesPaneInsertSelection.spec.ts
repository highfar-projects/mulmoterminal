import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

// #2575. The pane's @ button: the selected lines go to the terminal beside it as `@path#L…`.
const fakeEditor = fakeCmEditor("edited text");
let onChange: () => void = () => {};
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: (_host: HTMLElement, cb: () => void) => ((onChange = cb), fakeEditor) };
});

let writes: string[] = [];
let unwritable = false;
let conflictOnWrite = false;
let writeBases: unknown[] = [];

function serve(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://x");
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "b.ts", dir: false, size: 1 }] }) };
    if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "x", version: "v1" }) };
    if (init?.method === "PUT") {
      if (unwritable) return { ok: false, status: 500, json: async () => ({ error: "disk full" }) };
      if (url.pathname.includes("/write")) {
        writeBases.push(JSON.parse(String(init.body)).baseVersion);
        if (conflictOnWrite) return { ok: false, status: 409, json: async () => ({ version: "theirs" }) };
        writes.push(url.searchParams.get("path") ?? "");
        return { ok: true, json: async () => ({ ok: true, version: `v${writes.length + 1}` }) };
      }
      return { ok: true, json: async () => ({ stored: true }) };
    }
    return { ok: true, json: async () => ({ ok: true, version: "v2" }) };
  }) as unknown as typeof fetch;
}

const mountWithTerminal = async (insertTarget = true, path = "b.ts") => {
  const w = mount(FilesPane, {
    props: { cwd: "/proj", insertTarget, insertTargetCwd: "/proj", initialState: { tabs: [{ path }], activePath: path, expanded: [] } },
    attachTo: document.body,
  });
  await flushPromises();
  return w;
};

describe("the Files pane's @ button (#2575)", () => {
  beforeEach(() => {
    localStorage.clear();
    writes = [];
    unwritable = false;
    conflictOnWrite = false;
    writeBases = [];
    serve();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts the selection as @path#L… for the terminal beside it", async () => {
    const w = await mountWithTerminal();
    fakeEditor.selectedLines.mockReturnValueOnce({ from: 3, to: 5 });
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    expect(w.emitted("insert-text")?.[0]).toEqual(["@b.ts#L3-5 "]);
  });

  it("offers no insert where there is no terminal to insert into", async () => {
    const w = await mountWithTerminal(false);
    expect(w.find('[data-testid="files-insert-selection"]').exists()).toBe(false);
  });

  // The agent reads the file on disk, so the line numbers are only right once unsaved edits are.
  it("saves unsaved edits before inserting, and inserts nothing when the save fails", async () => {
    const w = await mountWithTerminal();
    onChange();
    await flushPromises();
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    expect(writes).toContain("b.ts");
    expect(w.emitted("insert-text")).toHaveLength(1);

    onChange();
    unwritable = true;
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    expect(w.emitted("insert-text")).toHaveLength(1);
  });

  // The agent editing the same file made the save lose the race: the pane stays on the file, so that
  // is a conflict to show, not a save to report — and a line reference would name the agent's code.
  it("inserts nothing when the save loses to another writer, and leaves the conflict banner up", async () => {
    const w = await mountWithTerminal();
    onChange();
    conflictOnWrite = true;
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    expect(w.emitted("insert-text")).toBeUndefined();
    expect(w.find('[data-testid="files-conflict"]').exists()).toBe(true);
  });

  // Staying on the file, the next save must be made against the version this one produced.
  it("saves against the version its own save produced the next time", async () => {
    const w = await mountWithTerminal();
    onChange();
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    onChange();
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    expect(writeBases).toEqual(["v1", "v2"]);
    expect(w.find('[data-testid="files-conflict"]').exists()).toBe(false);
  });

  // The editor stays alive under Preview and keeps its last selection; Preview inserts the file alone.
  it("inserts the file alone in Preview, whatever the hidden editor still has selected", async () => {
    const w = await mountWithTerminal(true, "notes.md");
    fakeEditor.selectedLines.mockReturnValue({ from: 3, to: 5 });
    const toggle = w.findAll("button").find((b) => b.text() === "Preview");
    expect(toggle).toBeDefined();
    await toggle?.trigger("click");
    await flushPromises();
    await w.get('[data-testid="files-insert-selection"]').trigger("click");
    await flushPromises();
    fakeEditor.selectedLines.mockReturnValue(null);
    expect(w.emitted("insert-text")?.[0]).toEqual(["@notes.md "]);
  });
});
