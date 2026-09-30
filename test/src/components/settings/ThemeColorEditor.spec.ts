// #2623. The colour editor copies the theme in use, paints a colour change before it is saved, and
// sends only a saved change.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { i18n } from "../../../../src/i18n";

const state = vi.hoisted(() => ({
  result: { ok: true, body: {} } as { ok: true; body: Record<string, unknown> } | { ok: false; problem: string | null },
  sent: [] as [string, unknown][],
  previews: [] as unknown[],
  refreshes: 0,
  picked: [] as string[],
}));
const themeId = ref("mine");
const custom = { id: "mine", label: "Mine", extends: "nord", colors: { "--accent": "#ff0000" } };
vi.mock("../../../../src/composables/customThemes", () => ({ findCustomTheme: (id: string) => (id === "mine" ? custom : null) }));
vi.mock("../../../../src/composables/useTheme", () => ({
  DEFAULT_THEME: "midnight",
  previewCustomTheme: (theme: unknown) => {
    state.previews.push(theme);
    return true;
  },
  refreshTheme: () => {
    state.refreshes += 1;
  },
  resolvedThemeVars: () => null,
  useTheme: () => ({
    themeId,
    themes: ref([
      { id: "nord", label: "Nord" },
      { id: "mine", label: "Mine" },
    ]),
    setTheme: (id: string) => {
      state.picked.push(id);
      themeId.value = id;
    },
  }),
}));
vi.mock("../../../../src/composables/themeEditing", () => ({
  changeCustomThemes: async (action: string, payload: unknown) => {
    state.sent.push([action, payload]);
    return state.result;
  },
}));

const ThemeColorEditor = (await import("../../../../src/components/settings/ThemeColorEditor.vue")).default;

afterEach(() => {
  state.result = { ok: true, body: {} };
  state.sent.length = 0;
  state.previews.length = 0;
  state.refreshes = 0;
  state.picked.length = 0;
  themeId.value = "mine";
});

const mountEditor = () => mount(ThemeColorEditor, { global: { plugins: [i18n] } });

describe("ThemeColorEditor", () => {
  it("offers only the copy for a built-in theme, and switches to the copy it made", async () => {
    themeId.value = "nord";
    state.result = { ok: true, body: { id: "nord-copy" } };
    const wrapper = mountEditor();
    expect(wrapper.find('[data-testid="theme-colors"]').exists()).toBe(false);
    await wrapper.find('[data-testid="theme-duplicate"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["duplicate", { source: "nord", label: "Nord copy" }]]);
    expect(state.picked).toEqual(["nord-copy"]);
  });

  it("paints a colour change at once and saves only on Save", async () => {
    const wrapper = mountEditor();
    const save = wrapper.find('[data-testid="theme-save"]');
    expect(save.attributes("disabled")).toBeDefined();
    await wrapper.find('[data-testid="theme-color---text"]').setValue("#00ff00");
    expect(state.previews).toEqual([{ ...custom, colors: { "--accent": "#ff0000", "--text": "#00ff00" } }]);
    expect(state.sent).toEqual([]);
    await save.trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["colors", { id: "mine", colors: { "--accent": "#ff0000", "--text": "#00ff00" } }]]);
  });

  it("puts the saved theme back when a draft is discarded or left unsaved", async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-testid="theme-color---text"]').setValue("#00ff00");
    await wrapper.find('[data-testid="theme-discard"]').trigger("click");
    expect(state.refreshes).toBe(1);
    await wrapper.find('[data-testid="theme-color---text"]').setValue("#00ff00");
    wrapper.unmount();
    expect(state.refreshes).toBe(2);
  });

  it("removes the theme and falls back to its base, and says why a change was refused", async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-testid="theme-remove"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["remove", { id: "mine" }]]);
    expect(state.picked).toEqual(["nord"]);
    themeId.value = "mine";
    state.result = { ok: false, problem: "missing" };
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="theme-remove"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="theme-problem"]').text()).toBe(i18n.global.t("themeEditor.problems.missing"));
  });
});
