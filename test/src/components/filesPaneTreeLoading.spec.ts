import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

// Don't instantiate real CodeMirror (needs a full DOM) — this is about the tree, not the editor.
const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

// #2148. `roots` used to carry both "nothing read yet" and "the directory is empty", so the pane
// announced the second for the whole of the first round trip — and again on every re-root, since
// teardown() empties it. Both directions matter: saying "Loading…" over a directory that really is
// empty is the same defect pointing the other way (PromptsPane hit that one in #1749).
describe("FilesPane while the tree is still being read", () => {
  const loading = (w: ReturnType<typeof mount>) => w.find('[data-testid="files-tree-loading"]').exists();
  const empty = (w: ReturnType<typeof mount>) => w.find('[data-testid="files-tree-empty"]').exists();
  /** Serve `entries` for the root listing, with the response held until the returned gate is called. */
  const gatedFs = (entries: { name: string; dir: boolean; size: number }[]) => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/list")) {
        await gate;
        return { ok: true, json: async () => ({ entries }) };
      }
      return { ok: true, json: async () => ({ text: "", version: "v1" }) };
    }) as unknown as typeof fetch;
    return open;
  };

  beforeEach(() => {
    fakeEditor.setDoc.mockClear();
  });

  it("says it is loading, not that the directory is empty", async () => {
    const open = gatedFs([]);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();

    expect(loading(w)).toBe(true);
    expect(empty(w)).toBe(false);

    open();
    await flushPromises();
    expect(loading(w)).toBe(false);
  });

  it("says the directory is empty once the listing comes back with nothing in it", async () => {
    const open = gatedFs([]);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    open();
    await flushPromises();

    expect(empty(w)).toBe(true);
    expect(loading(w)).toBe(false);
  });

  it("says neither once there are entries", async () => {
    const open = gatedFs([{ name: "README.md", dir: false, size: 10 }]);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    open();
    await flushPromises();

    expect(loading(w)).toBe(false);
    expect(empty(w)).toBe(false);
    expect(w.text()).toContain("README.md");
  });

  it("reports a failed listing as the error, not as an empty directory", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/list")) return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
      return { ok: true, json: async () => ({ text: "", version: "v1" }) };
    }) as unknown as typeof fetch;
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();

    expect(w.text()).toContain("HTTP 500");
    expect(empty(w)).toBe(false);
    expect(loading(w)).toBe(false);
  });

  // The window this issue is really about: the host calls reload() to re-root the pane as the zoom
  // walks between cells, and teardown() empties the tree on the way.
  it("goes back to loading — not to empty — when the host re-roots it", async () => {
    const openFirst = gatedFs([{ name: "README.md", dir: false, size: 10 }]);
    const w = mount(FilesPane, { props: { cwd: "/left" } });
    await flushPromises();
    openFirst();
    await flushPromises();
    expect(loading(w)).toBe(false);

    const openSecond = gatedFs([{ name: "other.md", dir: false, size: 10 }]);
    await w.setProps({ cwd: "/right" });
    void (w.vm as unknown as { reload: () => Promise<void> }).reload();
    await flushPromises();

    expect(loading(w)).toBe(true);
    expect(empty(w)).toBe(false);

    openSecond();
    await flushPromises();
    expect(w.text()).toContain("other.md");
  });
});
