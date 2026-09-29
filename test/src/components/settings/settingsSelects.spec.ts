// #2617. Three settings that had no control: the default agent (Models), the header's status colour
// mode (Header buttons), and the playful effects switch (Theme). Each saves through /api/config and
// puts itself back when the save is refused.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { i18n } from "../../../../src/i18n";
import { defaultAgentRef, setDefaultAgent } from "../../../../src/composables/defaultAgent";
import { globalHeaderStatusTint, setHeaderStatusDefaults } from "../../../../src/composables/headerStatusColors";
import { playfulEffects, setPlayfulEffects } from "../../../../src/composables/playfulEffects";

const server = vi.hoisted(() => ({ ok: true, echo: undefined as unknown, calls: [] as [string, unknown][], hold: null as Promise<void> | null }));
vi.mock("../../../../src/composables/postConfigField", () => ({
  postConfigField: async (field: string, value: unknown) => {
    server.calls.push([field, value]);
    if (server.hold) await server.hold;
    return server.ok ? { ok: true, value: server.echo === undefined ? value : server.echo } : { ok: false };
  },
}));
const availability = vi.hoisted(() => ({ confirmed: ["claude", "grok", "cursor", "muse", "copilot", "antigravity"] as string[] }));
vi.mock("../../../../src/composables/useAgentAvailability", () => ({
  useAgentAvailability: () => ({
    unavailableAgents: ref(new Map([["codex", { agent: "codex", available: false }]])),
    confirmedAgents: ref(new Set(availability.confirmed)),
  }),
}));
vi.mock("../../../../src/composables/useLaunchOptions", () => ({ useLaunchOptions: () => ({ launchOptions: ref({ providers: [] }) }) }));
vi.mock("../../../../src/composables/useAppConfig", () => ({ useAppConfig: () => ({ customAgents: ref([]), accounts: ref([]) }) }));

const ModelsSection = (await import("../../../../src/components/settings/ModelsSection.vue")).default;
const HeaderChromeSection = (await import("../../../../src/components/settings/HeaderChromeSection.vue")).default;
const ThemeSection = (await import("../../../../src/components/settings/ThemeSection.vue")).default;

afterEach(() => {
  setDefaultAgent(null);
  setHeaderStatusDefaults({}, "background");
  setPlayfulEffects("random");
  server.ok = true;
  server.echo = undefined;
  server.calls.length = 0;
  server.hold = null;
  availability.confirmed = ["claude", "grok", "cursor", "muse", "copilot", "antigravity"];
});

// Holds every save until `release` is called, to look at the control while one is in flight.
function holdSaves(): () => void {
  let release = () => {};
  server.hold = new Promise<void>((resolve) => (release = resolve));
  return release;
}

const mountWith = <T>(component: T) => mount(component as never, { global: { plugins: [i18n] } });

describe("ModelsSection — default agent", () => {
  it("offers 'not set' first and an agent this machine lacks only disabled, named as not installed", () => {
    const wrapper = mountWith(ModelsSection);
    const options = wrapper.findAll<HTMLOptionElement>('[data-testid="settings-default-agent"] option');
    expect(options[0]?.element.value).toBe("");
    const codex = options.find((option) => option.element.value === "codex");
    expect(codex?.element.disabled).toBe(true);
    expect(codex?.text()).toBe(i18n.global.t("settingsControls.defaultAgent.notInstalled", { agent: "Codex" }));
    expect(options.find((option) => option.element.value === "grok")?.element.disabled).toBe(false);
    wrapper.unmount();
  });

  it("offers no agent before the server has confirmed any", () => {
    availability.confirmed = [];
    const wrapper = mountWith(ModelsSection);
    const enabled = wrapper.findAll<HTMLOptionElement>('[data-testid="settings-default-agent"] option').filter((option) => !option.element.disabled);
    expect(enabled.map((option) => option.element.value)).toEqual([""]);
    wrapper.unmount();
  });

  it("is locked while a save is in flight", async () => {
    const release = holdSaves();
    const wrapper = mountWith(ModelsSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-default-agent"]');
    await select.setValue("grok");
    expect(select.element.disabled).toBe(true);
    release();
    await flushPromises();
    expect(select.element.disabled).toBe(false);
    wrapper.unmount();
  });

  it("saves the pick, and 'not set' as null", async () => {
    const wrapper = mountWith(ModelsSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-default-agent"]');
    await select.setValue("grok");
    await flushPromises();
    expect(defaultAgentRef.value).toBe("grok");
    await select.setValue("");
    await flushPromises();
    expect(server.calls).toEqual([
      ["defaultAgent", "grok"],
      ["defaultAgent", null],
    ]);
    expect(defaultAgentRef.value).toBeNull();
    expect(wrapper.find('[data-testid="settings-default-agent-overridden"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("says so when --agent makes this run answer something else", async () => {
    server.echo = "cursor";
    const wrapper = mountWith(ModelsSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-default-agent"]');
    await select.setValue("grok");
    await flushPromises();
    expect(wrapper.find('[data-testid="settings-default-agent-overridden"]').exists()).toBe(true);
    expect(select.element.value).toBe("cursor");
    wrapper.unmount();
  });

  it("puts the select back when the save is refused", async () => {
    server.ok = false;
    const wrapper = mountWith(ModelsSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-default-agent"]');
    await select.setValue("grok");
    await flushPromises();
    expect(select.element.value).toBe("");
    expect(defaultAgentRef.value).toBeNull();
    wrapper.unmount();
  });
});

describe("HeaderChromeSection — status colour mode", () => {
  it("is locked while a save is in flight", async () => {
    const release = holdSaves();
    const wrapper = mountWith(HeaderChromeSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-header-tint"]');
    await select.setValue("none");
    expect(select.element.disabled).toBe(true);
    release();
    await flushPromises();
    expect(select.element.disabled).toBe(false);
    wrapper.unmount();
  });

  it("saves the mode and the header reads it at once", async () => {
    const wrapper = mountWith(HeaderChromeSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-header-tint"]');
    expect(select.element.value).toBe("background");
    await select.setValue("none");
    await flushPromises();
    expect(server.calls).toEqual([["headerStatusTint", "none"]]);
    expect(globalHeaderStatusTint.value).toBe("none");
    wrapper.unmount();
  });

  it("puts the select back when the save is refused", async () => {
    server.ok = false;
    const wrapper = mountWith(HeaderChromeSection);
    const select = wrapper.find<HTMLSelectElement>('[data-testid="settings-header-tint"]');
    await select.setValue("none");
    await flushPromises();
    expect(select.element.value).toBe("background");
    expect(globalHeaderStatusTint.value).toBe("background");
    wrapper.unmount();
  });
});

describe("ThemeSection — playful effects switch", () => {
  it("is locked while a save is in flight", async () => {
    const release = holdSaves();
    const wrapper = mountWith(ThemeSection);
    const input = wrapper.find<HTMLInputElement>('[data-testid="settings-playful-effects"]');
    await input.setValue(false);
    expect(input.element.disabled).toBe(true);
    release();
    await flushPromises();
    expect(input.element.disabled).toBe(false);
    wrapper.unmount();
  });

  it("switching off writes off, and on again comes back as random", async () => {
    const wrapper = mountWith(ThemeSection);
    const input = wrapper.find<HTMLInputElement>('[data-testid="settings-playful-effects"]');
    expect(input.element.checked).toBe(true);
    await input.setValue(false);
    await flushPromises();
    expect(playfulEffects.value).toBe("off");
    await input.setValue(true);
    await flushPromises();
    expect(server.calls).toEqual([
      ["playfulEffects", "off"],
      ["playfulEffects", "random"],
    ]);
    wrapper.unmount();
  });

  it("puts the box back when the save is refused", async () => {
    server.ok = false;
    const wrapper = mountWith(ThemeSection);
    const input = wrapper.find<HTMLInputElement>('[data-testid="settings-playful-effects"]');
    await input.setValue(false);
    await flushPromises();
    expect(input.element.checked).toBe(true);
    expect(playfulEffects.value).toBe("random");
    wrapper.unmount();
  });
});
