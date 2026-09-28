// The run view and a finished build's report: shown once every step has passed, never while a step is still
// open, and rendered from Markdown with the path it came from.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

const { loadRun, loadReport } = vi.hoisted(() => ({ loadRun: vi.fn(), loadReport: vi.fn() }));
vi.mock("../../../../src/composables/blueprintsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../src/composables/blueprintsApi")>();
  return { ...actual, loadRun, loadReport };
});

import BlueprintRunView from "../../../../src/components/blueprints/BlueprintRunView.vue";

const step = { id: "report", title: "報告", description: "", skill: "skills/report", check: "true", gates: [], origin: "usecase" as const };
const runView = (status: "passed" | "running") => ({
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
    },
    state: { steps: { report: { status, approved: false, answers: [] } } },
  },
});

describe("a finished build's report in the run view", () => {
  beforeEach(() => {
    loadRun.mockReset();
    loadReport.mockReset();
    loadReport.mockResolvedValue({
      ok: true,
      value: { path: "/work/docs/.blueprint/review-report.md", markdown: "## 見つけたこと\n\n支払期限が二か所で違う。" },
    });
  });

  it("shows the report, and where it is, once every step has passed", async () => {
    loadRun.mockResolvedValue(runView("passed"));
    const wrapper = mount(BlueprintRunView, { props: { runId: "run-00000001" } });
    await flushPromises();
    const report = wrapper.get('[data-testid="blueprint-report"]');
    expect(report.text()).toContain("支払期限が二か所で違う。");
    expect(report.text()).toContain("/work/docs/.blueprint/review-report.md");
    // Inside the framed body, where the theme's text colour and font apply: bare, it rendered dark on dark.
    expect(report.get('[data-testid="blueprint-report-body"]').find("h2").exists()).toBe(true);
  });

  it("does not ask for the report while a step is still open", async () => {
    loadRun.mockResolvedValue(runView("running"));
    const wrapper = mount(BlueprintRunView, { props: { runId: "run-00000001" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-report"]').exists()).toBe(false);
    expect(loadReport).not.toHaveBeenCalled();
  });

  it("shows nothing when the usecase names no report", async () => {
    loadRun.mockResolvedValue(runView("passed"));
    loadReport.mockResolvedValue({ ok: true, value: { path: null, markdown: null } });
    const wrapper = mount(BlueprintRunView, { props: { runId: "run-00000001" } });
    await flushPromises();
    expect(wrapper.find('[data-testid="blueprint-report"]').exists()).toBe(false);
  });
});
