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

const summary = (id: string, usecaseTitle: string | null) => ({
  id,
  projectDir: "/work/chain",
  createdAtMs: 1,
  current: null,
  waitingOn: null,
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
});
