import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import CellLaunchForm from "../../../src/components/CellLaunchForm.vue";
import AccountMark from "../../../src/components/AccountMark.vue";
import { buildAgentWsUrl, buildTerminalWsUrl, connWsUrl } from "../../../src/components/wsUrl";
import { cellForPanelResume, cellForPanelStart } from "../../../src/components/launchCell";
import { accountLabel, accountsForAgent, type AgentAccount } from "../../../common/agentAccounts";
import { customAgentPick, type AgentPick } from "../../../common/customAgents";

// The browser half of #2215: which login a NEW cell starts on, and how a cell says which one it is.
const WORK: AgentAccount = { id: "work", label: "Work", agent: "claude", home: "~/.claude-work" };
const CODEX_WORK: AgentAccount = { id: "cwork", label: "Codex work", agent: "codex", home: "~/.codex-work" };
const ACCOUNTS = [WORK, CODEX_WORK];

describe("accountsForAgent / accountLabel", () => {
  it("offers only the picked agent's accounts, and none for an agent an account cannot move", () => {
    expect(accountsForAgent(ACCOUNTS, "claude")).toEqual([WORK]);
    expect(accountsForAgent(ACCOUNTS, "codex")).toEqual([CODEX_WORK]);
    expect(accountsForAgent(ACCOUNTS, "grok")).toEqual([]);
    expect(accountsForAgent(ACCOUNTS, null)).toEqual([]);
  });

  it("names an account by its label, and by its id once it has left the config", () => {
    expect(accountLabel(ACCOUNTS, "work")).toBe("Work");
    expect(accountLabel([], "work")).toBe("work");
  });
});

describe("the ws URL carries the account", () => {
  const base = { host: "h", secure: false, sessionId: null };

  it("sends it to /ws and to an agent endpoint, and leaves it off for the default login", () => {
    expect(new URL(buildTerminalWsUrl({ ...base, account: "work" })).searchParams.get("account")).toBe("work");
    expect(new URL(buildAgentWsUrl("codex", { ...base, account: "cwork" })).searchParams.get("account")).toBe("cwork");
    expect(new URL(buildTerminalWsUrl({ ...base, account: null })).searchParams.has("account")).toBe(false);
  });

  it("routes a slot's account to whichever endpoint the slot connects", () => {
    const slot = { cwd: "/p", devTerminal: true, command: null, launcher: null, account: "cwork" };
    expect(new URL(connWsUrl({ ...slot, agent: "codex" }, null, "h", false)).searchParams.get("account")).toBe("cwork");
    expect(new URL(connWsUrl(slot, null, "h", false)).searchParams.get("account")).toBe("cwork");
  });
});

describe("cells the launch panel places", () => {
  it("carries the account on a started cell only when one was picked", () => {
    expect(cellForPanelStart({ dir: "/p", pick: "claude", choice: null, account: "work" }, null).account).toBe("work");
    expect("account" in cellForPanelStart({ dir: "/p", pick: "claude", choice: null, account: null }, null)).toBe(false);
  });

  it("carries the row's account on a resumed cell", () => {
    expect(cellForPanelResume({ id: "s", cwd: "/p", agent: "claude", account: "work" }).account).toBe("work");
    expect("account" in cellForPanelResume({ id: "s", cwd: "/p" })).toBe(false);
  });
});

type SessionRow = { id: string; title: string; mtime: number; account?: string };
function mockFetch(sessions: SessionRow[] = []) {
  globalThis.fetch = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("sessions")) return { ok: true, json: async () => ({ cwd: "/repo", sessions }) };
    if (u.includes("/api/worktrees")) return { ok: true, json: async () => ({ isGit: true, base: "main", worktrees: [] }) };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const mountForm = (agent: AgentPick, account: string | null = null, accounts: AgentAccount[] = ACCOUNTS) =>
  mount(CellLaunchForm, {
    props: { dir: "/repo", agent, choice: null, defaultCwd: "/home/me/ws", presets: [], accounts, account },
    global: { stubs: { ModelPicker: true } },
  });

describe("the launch form's account choice", () => {
  it("is not there at all without accounts — the form looks as it always did", async () => {
    mockFetch();
    const w = mountForm("claude", null, []);
    await flushPromises();
    expect(w.find('[data-testid="cell-account-select"]').exists()).toBe(false);
  });

  it("offers the picked agent's accounts, a custom agent getting Claude's", async () => {
    mockFetch();
    const optionsFor = async (agent: AgentPick) => {
      const w = mountForm(agent);
      await flushPromises();
      return w.findAll('[data-testid="cell-account-select"] option').map((o) => o.text());
    };
    expect(await optionsFor("claude")).toEqual(["Default login", "Work"]);
    expect(await optionsFor("codex")).toEqual(["Default login", "Codex work"]);
    expect(await optionsFor(customAgentPick("kimi_k3"))).toEqual(["Default login", "Work"]);
    expect(await optionsFor("grok")).toEqual([]);
  });

  it("reports the pick, and the default login as null", async () => {
    mockFetch();
    const w = mountForm("claude");
    await flushPromises();
    await w.find('[data-testid="cell-account-select"]').setValue("work");
    await w.find('[data-testid="cell-account-select"]').setValue("");
    expect(w.emitted("update:account")).toEqual([["work"], [null]]);
  });

  it("drops a pick that belongs to another agent when the picker moves", async () => {
    mockFetch();
    const w = mountForm("claude", "work");
    await flushPromises();
    await w.setProps({ agent: "codex" });
    await flushPromises();
    expect(w.emitted("update:account")?.at(-1)).toEqual([null]);
  });

  it("names a resume row's account and resumes with it", async () => {
    mockFetch([{ id: "s-1", title: "on the work login", mtime: 1, account: "work" }]);
    const w = mountForm("claude");
    await flushPromises();
    expect(w.find('[data-testid="ri-account"]').text()).toBe("Work");
    await w.find('[data-testid="cell-resume-item"]').trigger("click");
    expect(w.emitted("resume")?.[0]).toEqual([{ id: "s-1", cwd: "/repo", agent: "claude", account: "work" }]);
  });
});

describe("AccountMark", () => {
  it("names the account, and draws nothing for the default login", () => {
    expect(mount(AccountMark, { props: { label: "Work" } }).text()).toContain("Work");
    expect(
      mount(AccountMark, { props: { label: null } })
        .find('[data-testid="cell-account-mark"]')
        .exists(),
    ).toBe(false);
  });
});
