// #2627. The Settings button that reads config.json again.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";

const outcome = vi.hoisted(() => ({ value: { ok: true } as { ok: true } | { ok: false; error: string; problems: string[] } }));
vi.mock("../../../../src/composables/configReload", () => ({ reloadConfigFile: async () => outcome.value }));

const ConfigReloadButton = (await import("../../../../src/components/settings/ConfigReloadButton.vue")).default;

afterEach(() => {
  outcome.value = { ok: true };
});

describe("ConfigReloadButton", () => {
  it("says it was reloaded when the server adopted the file", async () => {
    const wrapper = mount(ConfigReloadButton, { global: { plugins: [i18n] } });
    await wrapper.find('[data-testid="settings-config-reload"]').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("reloaded")).toHaveLength(1);
    expect(wrapper.find('[data-testid="settings-config-reload-refused"]').exists()).toBe(false);
  });

  it("shows why it refused, with the keymap entries, and does not reload", async () => {
    outcome.value = { ok: false, error: "the keymap would stop MulmoTerminal from starting", problems: ["  keymap.zoom-next: bad"] };
    const wrapper = mount(ConfigReloadButton, { global: { plugins: [i18n] } });
    await wrapper.find('[data-testid="settings-config-reload"]').trigger("click");
    await flushPromises();
    expect(wrapper.emitted("reloaded")).toBeUndefined();
    const refused = wrapper.find('[data-testid="settings-config-reload-refused"]');
    expect(refused.text()).toContain("keymap would stop");
    expect(refused.text()).toContain("keymap.zoom-next");
  });
});
