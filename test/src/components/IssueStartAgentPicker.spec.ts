// The PRs & Issues view's agent picker (#2226): one choice for the view, remembered, with the
// auto-run warning beside a non-Claude pick and the account select only where there are accounts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { resetAgentAvailability } from "../../../src/composables/useAgentAvailability";
import { resetIssueStartAgent, useIssueStartAgent } from "../../../src/composables/useIssueStartAgent";
import { useAppConfig } from "../../../src/composables/useAppConfig";

const IssueStartAgentPicker = (await import("../../../src/components/IssueStartAgentPicker.vue")).default;

let availability: unknown = { agents: [] };

beforeEach(() => {
  localStorage.clear();
  resetIssueStartAgent();
  resetAgentAvailability();
  availability = { agents: [] };
  useAppConfig().accounts.value = [
    { id: "work", label: "Work", agent: "claude", home: "~/.claude-work" },
    { id: "side", label: "Side", agent: "codex", home: "~/.codex-side" },
  ];
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => availability })) as unknown as typeof fetch;
});

const mountPicker = async () => {
  const w = mount(IssueStartAgentPicker);
  await flushPromises();
  return w;
};

describe("IssueStartAgentPicker", () => {
  it("starts on Claude with no warning, and offers Claude's accounts", async () => {
    const w = await mountPicker();
    expect((w.get('[data-testid="issue-start-agent"]').element as HTMLSelectElement).value).toBe("claude");
    expect(w.find('[data-testid="issue-start-warning"]').exists()).toBe(false);
    const accounts = w
      .get('[data-testid="issue-start-account"]')
      .findAll("option")
      .map((o) => o.text());
    expect(accounts).toEqual(["Default login", "Work"]);
  });

  it("remembers the picked agent and starts it on its default login", async () => {
    const w = await mountPicker();
    await w.get('[data-testid="issue-start-account"]').setValue("work");
    await w.get('[data-testid="issue-start-agent"]').setValue("codex");
    expect(localStorage.getItem("mt-issue-start-agent")).toBe("codex");
    expect(localStorage.getItem("mt-issue-start-account")).toBeNull();
    expect((w.get('[data-testid="issue-start-account"]').element as HTMLSelectElement).value).toBe("");
  });

  it("warns that Codex runs the issue at once, without claiming auto-approval", async () => {
    const w = await mountPicker();
    await w.get('[data-testid="issue-start-agent"]').setValue("codex");
    const text = w.get('[data-testid="issue-start-warning"]').text();
    expect(text).toContain("Codex runs the issue text as soon as it starts");
    expect(text).not.toContain("approved automatically");
  });

  it("warns that an auto-approving agent approves its own tools, and hides accounts it cannot use", async () => {
    const w = await mountPicker();
    await w.get('[data-testid="issue-start-agent"]').setValue("cursor");
    expect(w.get('[data-testid="issue-start-warning"]').text()).toContain("with its tools approved automatically");
    expect(w.find('[data-testid="issue-start-account"]').exists()).toBe(false);
  });

  it("disables an agent this machine cannot start, and explains a remembered pick of one", async () => {
    availability = { agents: [{ agent: "muse", available: false, reason: "missing", installGuide: "https://dev.meta.ai/docs/muse-code" }] };
    useIssueStartAgent().chooseAgent("muse");
    const w = await mountPicker();
    const muse = w.get('[data-testid="issue-start-agent"] option[value="muse"]');
    expect(muse.attributes("disabled")).toBeDefined();
    expect(muse.text()).toContain("not installed");
    expect(w.get('[data-testid="issue-start-unavailable"]').text()).toContain("Muse is not installed");
    expect(w.get('[data-testid="issue-start-install-guide"]').attributes("href")).toBe("https://dev.meta.ai/docs/muse-code");
    expect(w.find('[data-testid="issue-start-warning"]').exists()).toBe(false);
  });
});
