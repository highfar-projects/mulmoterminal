import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

// #2148 stage 2 — the pane paints the last listing it saw for this directory while it re-reads, so
// coming back to a cell shows the tree instead of "Loading…". The direction that matters just as
// much: a directory it has never seen, and a read that FAILS, must not paint someone else's tree.
describe("FilesPane painting from its last listing", () => {
  const loading = (w: ReturnType<typeof mount>) => w.find('[data-testid="files-tree-loading"]').exists();
  const rowPaths = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="files-row"]').map((r) => r.attributes("data-path"));
  /** Serve `names` for any listing, with the response held until the returned gate is called. */
  const gatedFs = (names: string[]) => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/list")) {
        await gate;
        return { ok: true, json: async () => ({ entries: names.map((name) => ({ name, dir: false, size: 1 })) }) };
      }
      return { ok: true, json: async () => ({ text: "", version: "v1" }) };
    }) as unknown as typeof fetch;
    return open;
  };
  /** Visit a directory and let its listing land, which is what fills the cache. */
  const visit = async (cwd: string, names: string[]) => {
    const open = gatedFs(names);
    const w = mount(FilesPane, { props: { cwd } });
    await flushPromises();
    open();
    await flushPromises();
    w.unmount();
  };

  beforeEach(() => {
    localStorage.clear();
    fakeEditor.setDoc.mockClear();
  });

  it("shows Loading on a directory it has never read", async () => {
    gatedFs(["first.ts"]);
    const w = mount(FilesPane, { props: { cwd: "/fresh" } });
    await flushPromises();
    expect(loading(w)).toBe(true);
    expect(rowPaths(w)).toEqual([]);
  });

  it("paints the last listing immediately on the next visit, with no Loading frame", async () => {
    await visit("/proj", ["a.ts", "b.ts"]);

    gatedFs(["a.ts", "b.ts"]); // the answer is held, so anything on screen came from the cache
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();

    expect(loading(w)).toBe(false);
    expect(rowPaths(w)).toEqual(["a.ts", "b.ts"]);
  });

  it("replaces the painted tree with what the server says", async () => {
    await visit("/proj", ["stale.ts"]);

    const open = gatedFs(["fresh.ts"]);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    expect(rowPaths(w)).toEqual(["stale.ts"]);

    open();
    await flushPromises();
    expect(rowPaths(w)).toEqual(["fresh.ts"]);
  });

  // The cache is per directory, and painting one directory's tree over another is worse than a wait.
  it("does not paint another directory's listing", async () => {
    await visit("/one", ["one.ts"]);

    gatedFs(["two.ts"]);
    const w = mount(FilesPane, { props: { cwd: "/two" } });
    await flushPromises();

    expect(loading(w)).toBe(true);
    expect(rowPaths(w)).toEqual([]);
  });

  // We do not know what the directory holds, and a stale tree under an error reads as if we did.
  it("shows the error rather than the cached tree when the read fails", async () => {
    await visit("/proj", ["a.ts"]);

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/list")) return { ok: false, status: 500, json: async () => ({ error: "boom" }) };
      return { ok: true, json: async () => ({ text: "", version: "v1" }) };
    }) as unknown as typeof fetch;
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();

    expect(w.text()).toContain("HTTP 500");
    expect(rowPaths(w)).toEqual([]);
  });

  // The window the cache exists to fill is also a window the user can click in. A directory they
  // expanded while the real listing was in flight must not collapse under them when it lands.
  it("keeps a directory the user expanded while the real listing was still coming", async () => {
    const dirEntry = { name: "src", dir: true, size: 0 };
    const listing = (names: string[]) => ({ entries: [dirEntry, ...names.map((name) => ({ name, dir: false, size: 1 }))] });
    let openRoot!: () => void;
    const rootGate = new Promise<void>((resolve) => (openRoot = resolve));
    const serve = (rootNames: string[], gated: boolean) => {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "https://x");
        if (url.pathname.includes("/list")) {
          const path = url.searchParams.get("path");
          if (path === "src") return { ok: true, json: async () => ({ entries: [{ name: "inside.ts", dir: false, size: 1 }] }) };
          if (gated) await rootGate;
          return { ok: true, json: async () => listing(rootNames) };
        }
        return { ok: true, json: async () => ({ text: "", version: "v1" }) };
      }) as unknown as typeof fetch;
    };

    serve(["first.ts"], false);
    const first = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    first.unmount(); // the listing is cached now

    serve(["second.ts"], true); // the real answer is held; what is on screen is the cache
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    expect(rowPaths(w)).toEqual(["src", "first.ts"]);

    await w.findAll('[data-testid="files-row"]')[0].trigger("click"); // expand `src` from the painted tree
    await flushPromises();
    expect(rowPaths(w)).toEqual(["src", "src/inside.ts", "first.ts"]);

    openRoot();
    await flushPromises();
    expect(rowPaths(w)).toEqual(["src", "src/inside.ts", "second.ts"]); // swapped, and still open
  });

  // The header's Reload button comes through loadRoot with a real tree already on screen. Replacing
  // that with an older copy would be a step backwards.
  it("leaves a tree that is already on screen alone when it re-reads", async () => {
    await visit("/proj", ["old.ts"]);

    const openFirst = gatedFs(["current.ts"]);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    openFirst();
    await flushPromises();
    expect(rowPaths(w)).toEqual(["current.ts"]);

    gatedFs(["later.ts"]); // held: nothing new can land during the assertion below
    await w.find('[aria-label="Reload tree"]').trigger("click");
    await flushPromises();
    expect(rowPaths(w)).toEqual(["current.ts"]); // not "old.ts" from the cache
  });
});
