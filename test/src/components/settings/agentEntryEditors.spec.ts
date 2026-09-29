// #2620. Custom agents and accounts, added and removed in Settings. Each save sends the WHOLE list
// (the config merge is top-level only), and a refused save leaves the list as the host holds it.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { i18n } from "../../../../src/i18n";
import type { CustomAgent } from "../../../../common/customAgents";
import type { AgentAccount } from "../../../../common/agentAccounts";

const state = vi.hoisted(() => ({ ok: true, problem: null as string | null, sent: [] as [string, string, unknown][], hold: null as Promise<void> | null }));
const customAgents = ref<CustomAgent[]>([]);
const accounts = ref<AgentAccount[]>([]);
// Stands in for the server: applies the one change to ITS list, which is what the routes do.
vi.mock("../../../../src/composables/useAppConfig", () => ({
  useAppConfig: () => ({
    customAgents,
    accounts,
    changeCustomAgents: async (action: string, payload: Record<string, unknown>) => {
      state.sent.push(["customAgents", action, payload]);
      if (state.hold) await state.hold;
      if (!state.ok) return { ok: false, problem: state.problem };
      if (action === "remove") customAgents.value = customAgents.value.filter((entry) => entry.id !== payload.id);
      else
        customAgents.value = [
          ...customAgents.value,
          { id: String(payload.label).toLowerCase(), label: String(payload.label), agent: "claude", command: String(payload.command) },
        ];
      return { ok: true, body: {} };
    },
    changeAccounts: async (action: string, payload: Record<string, unknown>) => {
      state.sent.push(["accounts", action, payload]);
      if (!state.ok) return { ok: false, problem: state.problem };
      return { ok: true, body: {} };
    },
  }),
}));

const CustomAgentsEditor = (await import("../../../../src/components/settings/CustomAgentsEditor.vue")).default;
const AccountsEditor = (await import("../../../../src/components/settings/AccountsEditor.vue")).default;

afterEach(() => {
  customAgents.value = [];
  accounts.value = [];
  state.ok = true;
  state.problem = null;
  state.hold = null;
  state.sent.length = 0;
});

const mountWith = <T>(component: T) => mount(component as never, { global: { plugins: [i18n] } });

describe("CustomAgentsEditor", () => {
  it("adds an entry with an id from its name, and clears the form", async () => {
    const wrapper = mountWith(CustomAgentsEditor);
    await wrapper.find('[data-testid="custom-agent-label"] input, input[data-testid="custom-agent-label"]').setValue("Kimi K3");
    await wrapper
      .find('[data-testid="custom-agent-command"] input, input[data-testid="custom-agent-command"]')
      .setValue("ollama launch claude --model kimi --");
    await wrapper.find('[data-testid="custom-agent-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["customAgents", "add", { label: "Kimi K3", command: "ollama launch claude --model kimi --" }]]);
    expect(wrapper.findAll('[data-testid="settings-custom-agents"] li')).toHaveLength(1);
    expect((wrapper.find('input[data-testid="custom-agent-label"], [data-testid="custom-agent-label"] input').element as HTMLInputElement).value).toBe("");
    wrapper.unmount();
  });

  it("sends only the one entry to remove, and locks every remove button while it is out", async () => {
    customAgents.value = [
      { id: "a", label: "A", agent: "claude", command: "x" },
      { id: "b", label: "B", agent: "claude", command: "y" },
    ];
    const wrapper = mountWith(CustomAgentsEditor);
    let release = () => {};
    state.hold = new Promise<void>((resolve) => (release = resolve));
    await wrapper.findAll('[data-testid="settings-custom-agents"] li button')[0]?.trigger("click");
    const buttons = wrapper.findAll('[data-testid="settings-custom-agents"] li button');
    expect(buttons.every((button) => button.attributes("disabled") !== undefined)).toBe(true);
    await buttons[1]?.trigger("click");
    release();
    await flushPromises();
    expect(state.sent).toEqual([["customAgents", "remove", { id: "a" }]]);
    expect(customAgents.value.map((entry) => entry.id)).toEqual(["b"]);
    wrapper.unmount();
  });

  it("says what is missing once something is typed, and keeps Add off", async () => {
    const wrapper = mountWith(CustomAgentsEditor);
    expect(wrapper.find('[data-testid="custom-agent-problem"]').exists()).toBe(false);
    await wrapper.find('input[data-testid="custom-agent-label"], [data-testid="custom-agent-label"] input').setValue("Kimi");
    expect(wrapper.find('[data-testid="custom-agent-problem"]').text()).toBe(i18n.global.t("settingsControls.entryProblems.command"));
    expect(wrapper.find('[data-testid="custom-agent-add"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("keeps the form and says so when the save is refused", async () => {
    state.ok = false;
    const wrapper = mountWith(CustomAgentsEditor);
    await wrapper.find('input[data-testid="custom-agent-label"], [data-testid="custom-agent-label"] input').setValue("Kimi");
    await wrapper.find('input[data-testid="custom-agent-command"], [data-testid="custom-agent-command"] input').setValue("run");
    await wrapper.find('[data-testid="custom-agent-add"]').trigger("click");
    await flushPromises();
    expect(customAgents.value).toEqual([]);
    expect(wrapper.find('[data-testid="custom-agent-refused"]').exists()).toBe(true);
    expect((wrapper.find('input[data-testid="custom-agent-label"], [data-testid="custom-agent-label"] input').element as HTMLInputElement).value).toBe("Kimi");
    wrapper.unmount();
  });

  it("says what the server found wrong in the list on disk", async () => {
    state.ok = false;
    state.problem = "full";
    const wrapper = mountWith(CustomAgentsEditor);
    await wrapper.find('input[data-testid="custom-agent-label"], [data-testid="custom-agent-label"] input').setValue("Kimi");
    await wrapper.find('input[data-testid="custom-agent-command"], [data-testid="custom-agent-command"] input').setValue("run");
    await wrapper.find('[data-testid="custom-agent-add"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="custom-agent-problem"]').text()).toBe(i18n.global.t("settingsControls.entryProblems.full"));
    expect(wrapper.find('[data-testid="custom-agent-refused"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("AccountsEditor", () => {
  it("adds a codex account with the picked agent", async () => {
    const wrapper = mountWith(AccountsEditor);
    await wrapper.find('input[data-testid="account-label"], [data-testid="account-label"] input').setValue("Work");
    await wrapper.find('[data-testid="account-agent"]').setValue("codex");
    await wrapper.find('input[data-testid="account-home"], [data-testid="account-home"] input').setValue("~/.codex-work");
    await wrapper.find('[data-testid="account-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["accounts", "add", { label: "Work", agent: "codex", home: "~/.codex-work" }]]);
    wrapper.unmount();
  });

  it("refuses a relative home before sending anything", async () => {
    const wrapper = mountWith(AccountsEditor);
    await wrapper.find('input[data-testid="account-label"], [data-testid="account-label"] input').setValue("Work");
    await wrapper.find('input[data-testid="account-home"], [data-testid="account-home"] input').setValue(".claude-work");
    await wrapper.find('[data-testid="account-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([]);
    expect(wrapper.find('[data-testid="account-problem"]').text()).toBe(i18n.global.t("settingsControls.entryProblems.home"));
    wrapper.unmount();
  });
});
