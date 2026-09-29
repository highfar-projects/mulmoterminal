import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import FilesPane from "../../../src/components/FilesPane.vue";

// #2576. The pane offers the Outline for a Markdown file, and nothing else.
const fakeEditor = fakeCmEditor("# One\n\n## Two\n");
vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeEditor };
});

const mountOn = async (path: string) => {
  const w = mount(FilesPane, { props: { cwd: "/proj", initialState: { tabs: [{ path }], activePath: path, expanded: [] } }, attachTo: document.body });
  await flushPromises();
  return w;
};

describe("the Files pane's Outline (#2576)", () => {
  beforeEach(() => {
    localStorage.clear();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "https://x");
      if (url.pathname.includes("/list")) return { ok: true, json: async () => ({ entries: [] }) };
      if (url.pathname.includes("/text")) return { ok: true, json: async () => ({ text: "# One\n\n## Two\n", version: "v1" }) };
      return { ok: true, json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lists a Markdown file's headings from the buffer", async () => {
    const w = await mountOn("notes.md");
    await w.get('[data-testid="files-outline-btn"]').trigger("click");
    await flushPromises();
    expect(w.findAll('[data-testid="files-outline-heading"]').map((r) => r.text())).toEqual(["One", "Two"]);
  });

  it("offers no outline for a file that is not Markdown", async () => {
    const w = await mountOn("main.ts");
    expect(w.find('[data-testid="files-outline-btn"]').exists()).toBe(false);
  });
});
