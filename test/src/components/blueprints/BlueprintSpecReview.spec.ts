// The specification panel at a review gate: an app build has a specification to read and talk over; a document build
// has none, and an empty panel would send the person looking for one.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { loadSpec, sendSpecMessage } = vi.hoisted(() => ({ loadSpec: vi.fn(), sendSpecMessage: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", () => ({ loadSpec, sendSpecMessage }));

import BlueprintSpecReview from "../../../../src/components/blueprints/BlueprintSpecReview.vue";

const specView = (spec: string | null, chat: { role: "person" | "agent"; text: string; atMs: number }[] = []) => ({
  ok: true,
  value: { spec, openQuestions: null, chat, revising: false },
});
const panel = (revisionSessionId: string | null = null) =>
  mount(BlueprintSpecReview, { props: { runId: "run-00000001", revisionSessionId, chatCount: 0, projectDir: "/work/app" } });

describe("the specification panel", () => {
  beforeEach(() => {
    loadSpec.mockReset();
  });

  it("shows the specification and where it is, when there is one", async () => {
    loadSpec.mockResolvedValue(specView("# spec"));
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("/work/app/.blueprint/spec.md");
  });

  it("stays while a conversation about the specification exists, or a revision is under way", async () => {
    loadSpec.mockResolvedValue(specView(null, [{ role: "person", text: "本の削除も", atMs: 1 }]));
    const talked = panel();
    await flushPromises();
    expect(talked.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    loadSpec.mockResolvedValue(specView(null));
    const revising = panel("s9");
    await flushPromises();
    expect(revising.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
  });

  it("is not shown for a build with no specification and nothing said about one", async () => {
    loadSpec.mockResolvedValue(specView(null));
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });
});
