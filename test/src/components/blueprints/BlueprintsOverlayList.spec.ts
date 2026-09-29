// The build list names what each build makes, so several builds in one folder can be told apart.
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { listRuns } = vi.hoisted(() => ({ listRuns: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/blueprintsApi")>();
  return { ...actual, listRuns, listPacks: async () => ({ ok: true, value: { packs: [] } }), listPresets: async () => ({ ok: true, value: { presets: [] } }) };
});
vi.mock("../../../../src/composables/useBlueprintsView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/useBlueprintsView")>();
  const { computed } = await import("vue");
  return {
    ...actual,
    useBlueprintsView: () => ({ isOpen: computed(() => true), runId: computed(() => null), inMarket: computed(() => false), close: () => undefined }),
  };
});

import BlueprintsOverlay from "../../../../src/components/blueprints/BlueprintsOverlay.vue";

const summary = (
  id: string,
  usecaseTitle: string | null,
  state: Partial<{ current: { id: string; title: string } | null; waitingOn: string | null }> = {},
) => ({
  id,
  projectDir: `/work/${id}`,
  createdAtMs: 1,
  current: null,
  waitingOn: null,
  ...state,
  passed: 3,
  total: 3,
  usecaseTitle,
});

describe("the build list", () => {
  it("names what each build in one folder made, and shows no line for one whose pack could not be read", async () => {
    listRuns.mockResolvedValue({ ok: true, value: { runs: [summary("run-3", "文書を整える"), summary("run-2", "文書を書く"), summary("run-1", null)] } });
    const wrapper = mount(BlueprintsOverlay);
    await flushPromises();
    expect(wrapper.findAll('[data-testid="blueprint-run-item"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="blueprint-run-kind"]').map((line) => line.text())).toEqual(["文書を整える", "文書を書く"]);
    wrapper.unmount();
  });

  it("puts the builds waiting for the person first, then those running, then those done, each in the order given", async () => {
    const step = { id: "s", title: "工程" };
    listRuns.mockResolvedValue({
      ok: true,
      value: {
        runs: [
          summary("done-new", "文書を書く"),
          summary("running", "文書を整える", { current: step }),
          summary("waiting-new", "文書を読み解く", { current: step, waitingOn: "approval" }),
          summary("done-old", "文書に尋ねる"),
          summary("waiting-old", "文書を確かめる", { current: step, waitingOn: "answer" }),
        ],
      },
    });
    const wrapper = mount(BlueprintsOverlay);
    await flushPromises();
    expect(wrapper.findAll('[data-testid="blueprint-run-group"]').map((heading) => heading.text())).toEqual(["Waiting for you", "Running", "Done"]);
    expect(wrapper.findAll('[data-testid="blueprint-run-item"]').map((item) => item.attributes("data-tip"))).toEqual([
      "/work/waiting-new",
      "/work/waiting-old",
      "/work/running",
      "/work/done-new",
      "/work/done-old",
    ]);
    wrapper.unmount();
  });

  it("shows no heading for a group with no build in it", async () => {
    listRuns.mockResolvedValue({ ok: true, value: { runs: [summary("done", "文書を書く")] } });
    const wrapper = mount(BlueprintsOverlay);
    await flushPromises();
    expect(wrapper.findAll('[data-testid="blueprint-run-group"]').map((heading) => heading.text())).toEqual(["Done"]);
    wrapper.unmount();
  });
});
