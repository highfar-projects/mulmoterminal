// When the run view puts a build away, the list reads the builds again at once rather than on its next poll.
import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

const { listRuns } = vi.hoisted(() => ({ listRuns: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/blueprintsApi")>();
  return { ...actual, listRuns };
});
vi.mock("../../../../src/composables/useBlueprintsView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/useBlueprintsView")>();
  const { computed } = await import("vue");
  return {
    ...actual,
    useBlueprintsView: () => ({ isOpen: computed(() => true), runId: computed(() => "run-1"), inMarket: computed(() => false), close: () => undefined }),
  };
});

import BlueprintsOverlay from "../../../../src/components/blueprints/BlueprintsOverlay.vue";

const RunViewStub = defineComponent({
  emits: ["archived"],
  setup:
    (_props, { emit }) =>
    () =>
      h("button", { "data-testid": "stub-archive", onClick: () => emit("archived") }),
});

describe("the build list after a build is put away", () => {
  it("reads the builds again when the run view says it put one away", async () => {
    listRuns.mockResolvedValue({ ok: true, value: { runs: [] } });
    const wrapper = mount(BlueprintsOverlay, { global: { stubs: { BlueprintRunView: RunViewStub } } });
    await flushPromises();
    const before = listRuns.mock.calls.length;
    await wrapper.get('[data-testid="stub-archive"]').trigger("click");
    await flushPromises();
    expect(listRuns.mock.calls).toHaveLength(before + 1);
    wrapper.unmount();
  });
});
