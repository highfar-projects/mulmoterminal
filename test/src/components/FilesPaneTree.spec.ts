import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import FilesPane from "../../../src/components/FilesPane.vue";
import { fakeCmEditor } from "../../helpers/cmEditorDouble";
import { MIN_FILE_EDITOR, SPLITTER_STEP } from "../../../src/components/splitterWidth";

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

  // A width stored in a wider window: the first key has to move what is ON SCREEN, not snap a
  // hidden stored value down to it, and the separator announces the range that fits now.
  it("moves a stored width that no longer fits from where it is shown", async () => {
    localStorage.setItem("files_tree_width", "900");
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    const tree = w.find("nav").element;
    if (!(tree instanceof HTMLElement) || !tree.parentElement) throw new Error("no tree row");
    measure(tree.parentElement, { clientWidth: 505 });
    const separator = w.find('[data-testid="files-tree-splitter"]');
    await separator.trigger("keydown", { key: "ArrowLeft" });
    expect(tree.style.flexBasis).toBe(`${260 - SPLITTER_STEP}px`);
    expect(separator.attributes("aria-valuenow")).toBe(String(260 - SPLITTER_STEP));
    expect(separator.attributes("aria-valuemax")).toBe("260");
  });

  it("never announces a floor above its ceiling when the row is too narrow for the tree", async () => {
    const w = mount(FilesPane, { props: { cwd: "/proj" } });
    await flushPromises();
    const tree = w.find("nav").element;
    if (!(tree instanceof HTMLElement) || !tree.parentElement) throw new Error("no tree row");
    measure(tree.parentElement, { clientWidth: MIN_FILE_EDITOR - 40 });
    const separator = w.find('[data-testid="files-tree-splitter"]');
    await separator.trigger("keydown", { key: "Home" });
    expect(separator.attributes("aria-valuemax")).toBe("0");
    expect(separator.attributes("aria-valuemin")).toBe("0");
    expect(separator.attributes("aria-valuenow")).toBe("0");
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
