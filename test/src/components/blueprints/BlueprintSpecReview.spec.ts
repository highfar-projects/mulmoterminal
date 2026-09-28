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
// A document build's gate names files to read and does not expect a spec; an app build's gate does.
const panel = (revisionSessionId: string | null = null, expectsSpec = false, chatCount = 0) =>
  mount(BlueprintSpecReview, { props: { runId: "run-00000001", revisionSessionId, chatCount, projectDir: "/work/app", expectsSpec } });

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
    const talked = panel(null, false, 1);
    await flushPromises();
    expect(talked.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    loadSpec.mockResolvedValue(specView(null));
    const revising = panel("s9");
    await flushPromises();
    expect(revising.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
  });

  it("stays at an app build's gate when its spec is missing, so the conversation that can rewrite it is there", async () => {
    loadSpec.mockResolvedValue(specView(null));
    const wrapper = panel(null, true);
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="blueprint-spec-input"]').exists()).toBe(true);
  });

  it("stays while a revision is under way even when the spec could not be read, so its progress and error are there", async () => {
    loadSpec.mockResolvedValue({ ok: false, error: "the spec could not be read" });
    const wrapper = panel("s9");
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="blueprint-spec-revising"]').exists()).toBe(true);
  });

  it("stays when its own read shows a conversation the run record it was given does not have yet", async () => {
    loadSpec.mockResolvedValue(specView(null, [{ role: "person", text: "本の削除も", atMs: 1 }]));
    const wrapper = panel(null, false, 0);
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
  });

  it("stays when the run has a conversation about the spec even if the spec could not be read, showing why", async () => {
    loadSpec.mockResolvedValue({ ok: false, error: "the spec could not be read" });
    const wrapper = panel(null, false, 2);
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("the spec could not be read");
  });

  it("is not shown at a document build's gate with no specification and nothing said about one", async () => {
    loadSpec.mockResolvedValue(specView(null));
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-spec-review"]').exists()).toBe(false);
    expect(wrapper.text()).toBe("");
  });
});
