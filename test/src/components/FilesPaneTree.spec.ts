import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";

vi.mock("../../../src/composables/usePubSub", () => ({
  usePubSub: () => ({ subscribe: () => () => {}, onReconnect: () => () => {} }),
}));
vi.mock("../../../src/components/cmEditor", async (orig) => {
  const actual = await orig<typeof import("../../../src/components/cmEditor")>();
  return { ...actual, createEditor: () => fakeCmEditor("") };
});

function mockFs() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/list")) return { ok: true, json: async () => ({ entries: [{ name: "README.md", dir: false, size: 10 }] }) };
      return { ok: true, json: async () => ({ text: "", version: "v1" }) };
    }),
  );
}

describe("the file tree's width and clipped names", () => {
  beforeEach(() => {
    mockFs();
    localStorage.clear();
  });

  const measure = (el: Element, sizes: { clientWidth?: number; scrollWidth?: number }) =>
    Object.entries(sizes).forEach(([prop, value]) => Object.defineProperty(el, prop, { configurable: true, value }));

  it("resizes the tree from the keyboard and remembers the width", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    const tree = w.find("nav").element;
    if (!(tree instanceof HTMLElement) || !tree.parentElement) throw new Error("no tree row");
    measure(tree.parentElement, { clientWidth: 1005 });
    const before = tree.style.flexBasis;
    await w.find('[data-testid="files-tree-splitter"]').trigger("keydown", { key: "ArrowRight" });
    expect(tree.style.flexBasis).not.toBe(before);
    expect(localStorage.getItem("files_tree_width")).toBe(tree.style.flexBasis.replace("px", ""));
  });

  it("puts the name in a tip on hover or focus only when the row cuts it off", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    const row = w.find('[data-testid="files-row"]');
    const label = row.find("[data-row-name]").element;
    measure(label, { scrollWidth: 200, clientWidth: 80 });
    await row.trigger("pointerover");
    expect(row.attributes("data-tip")).toBe("README.md");
    measure(label, { scrollWidth: 80, clientWidth: 200 });
    await row.trigger("focusin");
    expect(row.attributes("data-tip")).toBeUndefined();
  });
});
