// #2621. Backends added and removed in Settings, one entry at a time on the server.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { i18n } from "../../../../src/i18n";

const state = vi.hoisted(() => ({
  result: { ok: true, body: {} } as { ok: true; body: object } | { ok: false; problem: string | null },
  sent: [] as [string, unknown][],
}));
vi.mock("../../../../src/composables/providersEditing", () => ({
  changeProviders: async (action: string, payload: unknown) => {
    state.sent.push([action, payload]);
    return state.result;
  },
}));
const options = ref({
  providers: [{ id: "openrouter", label: "OpenRouter", tokenEnv: "OPENROUTER_API_KEY", models: ["m"], ready: true, reason: "" }],
  anyReady: true,
});
vi.mock("../../../../src/composables/useLaunchOptions", () => ({ useLaunchOptions: () => ({ launchOptions: options }) }));

const ProvidersEditor = (await import("../../../../src/components/settings/ProvidersEditor.vue")).default;

afterEach(() => {
  state.result = { ok: true, body: {} };
  state.sent.length = 0;
});

const mountEditor = () => mount(ProvidersEditor, { global: { plugins: [i18n] } });
const field = (wrapper: ReturnType<typeof mountEditor>, id: string) => wrapper.find(`input[data-testid="${id}"], [data-testid="${id}"] input`);

async function fill(wrapper: ReturnType<typeof mountEditor>, values: Record<string, string>) {
  for (const [id, value] of Object.entries(values)) await field(wrapper, id).setValue(value);
}

const GOOD = {
  "provider-label": "Moonshot",
  "provider-base-url": "https://api.moonshot.ai/anthropic",
  "provider-token-env": "MOONSHOT_API_KEY",
  "provider-models": "kimi-k3",
};

describe("ProvidersEditor", () => {
  it("starts the output budget at the recommended value, and sends the form as typed", async () => {
    const wrapper = mountEditor();
    expect((field(wrapper, "provider-max-output").element as HTMLInputElement).value).toBe("16000");
    await fill(wrapper, GOOD);
    await wrapper.find('[data-testid="provider-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([
      ["add", { label: "Moonshot", baseUrl: "https://api.moonshot.ai/anthropic", tokenEnv: "MOONSHOT_API_KEY", models: "kimi-k3", maxOutputTokens: "16000" }],
    ]);
    expect((field(wrapper, "provider-label").element as HTMLInputElement).value).toBe("");
  });

  it("refuses a pasted key and a /v1 URL before sending anything, and says why", async () => {
    const wrapper = mountEditor();
    await fill(wrapper, { ...GOOD, "provider-token-env": "sk-ant-api03-secret" });
    expect(wrapper.find('[data-testid="provider-problem"]').text()).toBe(i18n.global.t("settingsControls.providerProblems.tokenEnv"));
    await fill(wrapper, { ...GOOD, "provider-base-url": "https://api.moonshot.ai/v1" });
    expect(wrapper.find('[data-testid="provider-problem"]').text()).toBe(i18n.global.t("settingsControls.providerProblems.baseUrlV1"));
    await wrapper.find('[data-testid="provider-add"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([]);
  });

  it("removes one by id", async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-testid="settings-providers"] li button').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["remove", { id: "openrouter" }]]);
  });

  it("shows what the server found wrong in the list on disk", async () => {
    state.result = { ok: false, problem: "models" };
    const wrapper = mountEditor();
    await fill(wrapper, GOOD);
    await wrapper.find('[data-testid="provider-add"]').trigger("click");
    await flushPromises();
    await fill(wrapper, { "provider-label": "", "provider-base-url": "", "provider-token-env": "", "provider-models": "" });
    expect(wrapper.find('[data-testid="provider-problem"]').text()).toBe(i18n.global.t("settingsControls.providerProblems.models"));
  });
});
