import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";
import type { FilesPaneState } from "../../../src/components/filesPaneState";
import type { FileLocation } from "../../../src/composables/filePathLocation";

const fakeEditor = fakeCmEditor("");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const FILES = ["a.md", "b.ts", "c.ts"];

beforeEach(() => {
  localStorage.clear();
  fakeEditor.goTo.mockClear();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://x");
    const path = url.searchParams.get("path") ?? "";
    if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: FILES.map((name) => ({ name, dir: false, size: 1 })) }) };
    if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: `text of ${path}`, version: "v1" }) };
    return { ok: true, json: async () => ({ ok: true, version: "v1" }) };
  }) as unknown as typeof fetch;
});
afterEach(() => {
  document.body.innerHTML = "";
});

type HostOpen = { openFile: (pathRel: string, location: FileLocation | undefined, newTab: boolean) => Promise<void> };

const tabNames = (w: VueWrapper): string[] => w.findAll('[data-testid="files-tab"]').map((tab) => tab.attributes("data-path") ?? "");
const frontName = (w: VueWrapper): string | undefined => w.find('[data-testid="files-tab"][aria-selected="true"]').attributes("data-path");
const snapshotOf = (w: VueWrapper): FilesPaneState => (w.vm as unknown as { snapshot: () => FilesPaneState }).snapshot();

const mountPane = async (initialState: FilesPaneState | null = null): Promise<VueWrapper> => {
  const w = mount(FilesPane, { props: { cwd: "/proj", initialState }, attachTo: document.body });
  await flushPromises();
  return w;
};

const hostOpen = async (w: VueWrapper, path: string, location: FileLocation | undefined, newTab: boolean): Promise<void> => {
  await (w.vm as unknown as HostOpen).openFile(path, location, newTab);
  await flushPromises();
};

// #3005. A path clicked in terminal output with Cmd/Ctrl reaches the pane through the host's openFile
// with `newTab`: it adds a tab beside the front one instead of replacing it, as the tree does (#2461).
describe("a terminal path opened in a new tab", () => {
  it("adds a tab and keeps the one in front", async () => {
    const w = await mountPane();
    await hostOpen(w, "a.md", undefined, false);
    await hostOpen(w, "b.ts", undefined, true);

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("b.ts");
  });

  it("adds a tab at a named line as well", async () => {
    const w = await mountPane();
    await hostOpen(w, "a.md", undefined, false);
    await hostOpen(w, "b.ts", { line: 42, col: null }, true);

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("b.ts");
    expect(fakeEditor.goTo).toHaveBeenLastCalledWith({ line: 42, col: 0 });
  });

  it("goes to the tab a file already has", async () => {
    const w = await mountPane({ tabs: [{ path: "a.md" }, { path: "b.ts" }], activePath: "a.md", expanded: [] });
    await hostOpen(w, "b.ts", undefined, true);

    expect(tabNames(w)).toEqual(["a.md", "b.ts"]);
    expect(frontName(w)).toBe("b.ts");
  });

  it("still replaces the front tab without the modifier, with or without a line", async () => {
    const w = await mountPane();
    await hostOpen(w, "a.md", undefined, false);
    await hostOpen(w, "b.ts", undefined, false);
    await hostOpen(w, "c.ts", { line: 3, col: null }, false);

    expect(snapshotOf(w).tabs.map((tab) => tab.path)).toEqual(["c.ts"]);
  });
});
