// #2230. An agent this machine cannot start is dimmed but still pickable — picking it is how its
// install guide is reached — and nothing that STARTS the picked agent may run while it is picked.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import type { AgentPick } from "../../../common/customAgents";
import { resetAgentAvailability } from "../../../src/composables/useAgentAvailability";

const CellLaunchForm = (await import("../../../src/components/CellLaunchForm.vue")).default;

const MUSE_GUIDE = "https://dev.meta.ai/docs/muse-code";
const AVAILABILITY = {
  agents: [
    { agent: "claude", available: true },
    { agent: "muse", available: false, reason: "missing", installGuide: MUSE_GUIDE },
    { agent: "grok", available: false, reason: "no-such-path", installGuide: null },
  ],
};

let availabilityAnswer: () => Promise<unknown>;
let worktrees: unknown[] = [];

function mockFetch() {
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/agents/availability")) return { ok: true, json: availabilityAnswer };
    if (u.includes("/api/worktrees")) return { ok: true, json: async () => ({ isGit: true, base: "main", worktrees }) };
    if (u.includes("/api/sessions")) return { ok: true, json: async () => ({ cwd: "/repo", sessions: [] }) };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const mountForm = async (agent: AgentPick) => {
  const w = mount(CellLaunchForm, {
    props: { dir: "/repo", agent, choice: null, defaultCwd: "/home/me/ws", presets: [{ label: "web", path: "/repo/web" }], openSessionIds: [] },
    global: { stubs: { ModelPicker: true } },
  });
  await flushPromises();
  return w;
};

const fetchedWith = (method: string) =>
  (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls.filter(([, init]) => init?.method === method);

beforeEach(() => {
  resetAgentAvailability();
  availabilityAnswer = async () => AVAILABILITY;
  worktrees = [];
  mockFetch();
});

describe("an agent that cannot start", () => {
  it("is dimmed in the picker but still pickable", async () => {
    const w = await mountForm("claude");
    const muse = w.find('[data-testid="agent-picker-muse"]');
    expect(muse.attributes("data-unavailable")).toBe("true");
    expect(muse.attributes("disabled")).toBeUndefined();
    expect(w.find('[data-testid="agent-picker-claude"]').attributes("data-unavailable")).toBeUndefined();
    await muse.trigger("click");
    expect(w.emitted("update:agent")?.at(-1)).toEqual(["muse"]);
  });

  it("says why when picked, links its install guide, and says to restart", async () => {
    const w = await mountForm("muse");
    const notice = w.get('[data-testid="agent-unavailable"]');
    expect(notice.text()).toContain("Muse is not installed");
    expect(notice.text()).toContain("Restart MulmoTerminal");
    const link = w.get('[data-testid="agent-install-guide"]');
    expect(link.attributes("href")).toBe(MUSE_GUIDE);
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toContain("noopener");
  });

  // An override naming nothing is not "not installed", and has no install page to send anyone to.
  it("words an override that names nothing differently, with no link when none is recorded", async () => {
    const w = await mountForm("grok");
    expect(w.get('[data-testid="agent-unavailable"]').text()).toContain("command override points at a file that is not there");
    expect(w.find('[data-testid="agent-install-guide"]').exists()).toBe(false);
  });

  it("starts nothing, by any of the form's start paths", async () => {
    const w = await mountForm("muse");
    expect(w.get('[data-testid="cell-dir-go"]').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="cell-dir-input"]').trigger("keydown.enter");
    const chipLaunch = w.findAll('[data-testid="cell-chip-launch"]');
    chipLaunch.forEach((button) => expect(button.attributes("disabled")).toBeDefined());
    await w.get('[data-testid="wt-task"]').setValue("fix login");
    expect(w.get('[data-testid="wt-start"]').attributes("disabled")).toBeDefined();
    await w.get('[data-testid="wt-task"]').trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toBeUndefined();
    // Not worth cutting a branch for a session that will not start.
    expect(fetchedWith("POST")).toEqual([]);
  });
});

// A worktree row with no session in it starts the PICKED agent fresh; one with a session resumes that
// session's own agent, which the picker has no say over.
describe("a worktree row", () => {
  it("does not start the picked agent fresh while it cannot start", async () => {
    worktrees = [{ path: "/repo/.wt/fix-login", branch: "fix-login", task: "fix-login", dirty: false }];
    const w = await mountForm("muse");
    await w.get('[data-testid="worktree-reuse"]').trigger("click");
    await flushPromises();
    expect(w.emitted("start")).toBeUndefined();
  });

  it("still resumes a session that is already there, as its own agent", async () => {
    worktrees = [
      { path: "/repo/.wt/fix-login", branch: "fix-login", task: "fix-login", dirty: false, session: { id: "s-1", agent: "claude", attached: false } },
    ];
    const w = await mountForm("muse");
    await w.get('[data-testid="worktree-reuse"]').trigger("click");
    await flushPromises();
    expect(w.emitted("resume")).toEqual([[{ id: "s-1", cwd: "/repo/.wt/fix-login", agent: "claude" }]]);
  });
});

describe("an agent that can start", () => {
  it("shows no notice and starts as before", async () => {
    const w = await mountForm("claude");
    expect(w.find('[data-testid="agent-unavailable"]').exists()).toBe(false);
    await w.get('[data-testid="cell-dir-input"]').trigger("keydown.enter");
    await flushPromises(); // the fork's devcontainer offer makes the start async (CellLaunchForm.vue startHere)
    expect(w.emitted("start")).toEqual([["/repo"]]);
  });

  // No answer is not a reason to block anything: the form behaves as it did before #2230.
  it.each([
    ["the request fails", async () => Promise.reject(new Error("offline"))],
    ["the body is not the expected shape", async () => ({ agents: "nope" })],
  ])("blocks nothing when %s", async (_case, answer) => {
    availabilityAnswer = answer;
    const w = await mountForm("muse");
    expect(w.find('[data-testid="agent-unavailable"]').exists()).toBe(false);
    await w.get('[data-testid="cell-dir-input"]').trigger("keydown.enter");
    await flushPromises();
    expect(w.emitted("start")).toEqual([["/repo"]]);
  });
});
