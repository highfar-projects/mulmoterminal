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

// #3215: the header's Reload button re-read the root and carried every folder already read, so a
// file added to an expanded folder from a terminal never appeared. The composable's own spec pins
// what a reload reads; this pins that the button reaches it.
describe("FilesPane's Reload button", () => {
  type Listing = { name: string; dir: boolean; size: number }[];
  const rowPaths = (w: ReturnType<typeof mount>) => w.findAll('[data-testid="files-row"]').map((row) => row.attributes("data-path"));
  /** Listings by relative path, read on every request, so the test can add a file "on disk". */
  const serve = (disk: Record<string, Listing>) => {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input), "https://x");
      if (!url.pathname.endsWith("/list")) return new Response(JSON.stringify({ text: "", version: "v1" }), { status: 200 });
      const entries = disk[url.searchParams.get("path") ?? ""] ?? [];
      return new Response(JSON.stringify({ entries }), { status: 200 });
    };
  };

  beforeEach(() => {
    localStorage.clear();
    fakeEditor.setDoc.mockClear();
  });

  it("shows a file added to an expanded folder after the button is pressed", async () => {
    const disk: Record<string, Listing> = { "": [{ name: "plans", dir: true, size: 0 }], plans: [{ name: "a.md", dir: false, size: 1 }] };
    serve(disk);
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    await w.find('[data-testid="files-row"][data-path="plans"]').trigger("click");
    await flushPromises();
    expect(rowPaths(w)).toEqual(["plans", "plans/a.md"]);

    disk.plans = [
      { name: "a.md", dir: false, size: 1 },
      { name: "zzz.md", dir: false, size: 1 },
    ];
    await w.find('[aria-label="Reload tree"]').trigger("click");
    await flushPromises();

    expect(rowPaths(w)).toEqual(["plans", "plans/a.md", "plans/zzz.md"]);
  });
});
