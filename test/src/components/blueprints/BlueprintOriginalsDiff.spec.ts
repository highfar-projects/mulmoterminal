// The finished screen's comparison with the originals: one diff per file still there, a note for one that is gone,
// and nothing at all for a build that kept no originals.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { loadOriginals, createDiffView } = vi.hoisted(() => ({
  loadOriginals: vi.fn<(runId: string) => Promise<unknown>>(),
  createDiffView: vi.fn<(parent: HTMLElement, original: string, current: string, phrases: unknown) => { destroy: () => void }>(() => ({ destroy: vi.fn() })),
}));
vi.mock("../../../../src/composables/blueprintsApi", () => ({ loadOriginals }));
vi.mock("../../../../src/components/cmDiffView", () => ({ createDiffView }));

import BlueprintOriginalsDiff from "../../../../src/components/blueprints/BlueprintOriginalsDiff.vue";

beforeEach(() => {
  loadOriginals.mockReset();
  createDiffView.mockClear();
});

describe("BlueprintOriginalsDiff", () => {
  it("compares each file still there with its original, and says which are gone", async () => {
    loadOriginals.mockResolvedValue({
      ok: true,
      value: {
        files: [
          { path: "a.md", original: "old a", current: "new a" },
          { path: "gone.md", original: "old g", current: null },
          { path: "b.md", original: "old b", current: "new b" },
        ],
        more: true,
      },
    });
    const wrapper = mount(BlueprintOriginalsDiff, { props: { runId: "r1" } });
    await flushPromises();
    expect(loadOriginals).toHaveBeenCalledWith("r1");
    expect(wrapper.findAll('[data-testid="blueprint-original"] span').map((span) => span.text())).toEqual(["a.md", "gone.md", "b.md"]);
    expect(wrapper.findAll('[data-testid="blueprint-original-gone"]')).toHaveLength(1);
    expect(createDiffView.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      ["old a", "new a"],
      ["old b", "new b"],
    ]);
    expect(createDiffView.mock.calls[0]?.[3]).toEqual({ "$ unchanged lines": "$ unchanged lines" });
    expect(wrapper.text()).toContain("There are more");
  });

  it("shows nothing for a build that kept no originals, or when they could not be read", async () => {
    loadOriginals.mockResolvedValue({ ok: true, value: { files: [], more: false } });
    const empty = mount(BlueprintOriginalsDiff, { props: { runId: "r1" } });
    await flushPromises();
    expect(empty.find('[data-testid="blueprint-originals"]').exists()).toBe(false);
    loadOriginals.mockResolvedValue({ ok: false, error: "gone" });
    const failed = mount(BlueprintOriginalsDiff, { props: { runId: "r2" } });
    await flushPromises();
    expect(failed.find('[data-testid="blueprint-originals"]').exists()).toBe(false);
    expect(createDiffView).not.toHaveBeenCalled();
  });
});
