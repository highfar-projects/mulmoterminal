import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const index = vi.hoisted(() => ({ fail: false }));
vi.mock("../../../src/wikiApi", () => ({
  fetchWikiIndex: async () => {
    if (index.fail) throw new Error("/api/wiki → 500");
    return { content: "", entries: [{ slug: "deploy", title: "Deploy", description: "", tags: [] }] };
  },
}));

const { usePaletteWikiPages } = await import("../../../src/composables/usePaletteWikiPages");

const mountPages = () =>
  mount(
    defineComponent({
      setup() {
        const { pages } = usePaletteWikiPages();
        return () => h("div", pages.value.map((page) => page.slug).join(","));
      },
    }),
  );

describe("usePaletteWikiPages", () => {
  it("reads the index as the palette opens", async () => {
    index.fail = false;
    const w = mountPages();
    await flushPromises();
    expect(w.text()).toBe("deploy");
    w.unmount();
  });

  it("lists no pages when the index cannot be read", async () => {
    index.fail = true;
    const w = mountPages();
    await flushPromises();
    expect(w.text()).toBe("");
    w.unmount();
  });
});
