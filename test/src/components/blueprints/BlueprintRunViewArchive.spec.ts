// Putting a build away from the run view: offered once no agent works on it, reversible, and the list is told.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { loadRun, loadReport, archiveRun } = vi.hoisted(() => ({ loadRun: vi.fn(), loadReport: vi.fn(), archiveRun: vi.fn() }));
vi.mock("../../../../src/composables/useBlueprintsView", () => ({ blueprintsViewFollowUp: vi.fn() }));
vi.mock("../../../../src/composables/useFilesView", () => ({ filesGotoFile: vi.fn(), filesGotoIndex: vi.fn() }));
vi.mock("../../../../src/composables/useNewTerminal", () => ({ openTerminalAt: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/blueprintsApi")>();
  return { ...actual, loadRun, loadReport, archiveRun };
});

import BlueprintRunView from "../../../../src/components/blueprints/BlueprintRunView.vue";

const step = { id: "report", title: "報告", description: "", skill: "skills/report", check: "true", gates: [], reads: [], origin: "usecase" as const };
const runView = (run: Partial<{ archivedAtMs: number | null; activeSessionId: string | null; revisionSessionId: string | null }> = {}) => ({
  ok: true,
  value: {
    run: {
      id: "run-00000001",
      projectDir: "/work/docs",
      basePackDir: "/packs/docs",
      usecasePackDir: "/packs/review",
      steps: [step],
      failedChecks: {},
      activeSessionId: null,
      sessions: [],
      createdAtMs: 1,
      specChat: [],
      revisionSessionId: null,
      archivedAtMs: null,
      ...run,
    },
    state: { steps: { report: { status: "passed", approved: false, answers: [] } } },
  },
});

const mountView = async () => {
  const wrapper = mount(BlueprintRunView, { props: { runId: "run-00000001" } });
  await flushPromises();
  return wrapper;
};

describe("putting a build away from the run view", () => {
  beforeEach(() => {
    loadRun.mockReset();
    archiveRun.mockReset();
    loadReport.mockResolvedValue({ ok: true, value: { path: null, markdown: null, changed: { files: [], more: false }, pair: null } });
  });

  it("puts a finished build away, shows where it went, and tells the list", async () => {
    loadRun.mockResolvedValue(runView());
    archiveRun.mockResolvedValue(runView({ archivedAtMs: 5 }));
    const wrapper = await mountView();
    const button = wrapper.get('[data-testid="blueprint-archive"]');
    expect(button.text()).toContain("Put away");
    expect(wrapper.find('[data-testid="blueprint-archived-note"]').exists()).toBe(false);
    await button.trigger("click");
    await flushPromises();
    expect(archiveRun).toHaveBeenCalledWith("run-00000001", true);
    expect(wrapper.get('[data-testid="blueprint-archive"]').text()).toContain("Back to the list");
    expect(wrapper.find('[data-testid="blueprint-archived-note"]').exists()).toBe(true);
    expect(wrapper.emitted("archived")).toHaveLength(1);
    wrapper.unmount();
  });

  it("brings a put-away build back", async () => {
    loadRun.mockResolvedValue(runView({ archivedAtMs: 5 }));
    archiveRun.mockResolvedValue(runView());
    const wrapper = await mountView();
    await wrapper.get('[data-testid="blueprint-archive"]').trigger("click");
    await flushPromises();
    expect(archiveRun).toHaveBeenCalledWith("run-00000001", false);
    expect(wrapper.find('[data-testid="blueprint-archived-note"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([{ activeSessionId: "s1" }, { revisionSessionId: "s2" }])("cannot put a build away while an agent works on it: %j", async (working) => {
    loadRun.mockResolvedValue(runView(working));
    const wrapper = await mountView();
    const button = wrapper.get('[data-testid="blueprint-archive"]');
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("data-tip")).toContain("no agent is working");
    wrapper.unmount();
  });

  it("says why when the server refuses, and leaves the build listed", async () => {
    loadRun.mockResolvedValue(runView());
    archiveRun.mockResolvedValue({ ok: false, error: "an agent is working on the build", refusal: { code: "agent-working" } });
    const wrapper = await mountView();
    await wrapper.get('[data-testid="blueprint-archive"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="blueprint-archive-error"]').text()).toContain("agent");
    expect(wrapper.emitted("archived")).toBeUndefined();
    wrapper.unmount();
  });
});
