// #2618. The header colour per status, set from Settings: each row shows a sample painted by the same
// class and style a grid cell uses, and every edit saves the whole set through /api/config.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";
import { globalHeaderStatusColors, setHeaderStatusDefaults } from "../../../../src/composables/headerStatusColors";

const server = vi.hoisted(() => ({ ok: true, calls: [] as [string, unknown][], hold: null as Promise<void> | null }));
vi.mock("../../../../src/composables/postConfigField", () => ({
  postConfigField: async (field: string, value: unknown) => {
    server.calls.push([field, value]);
    if (server.hold) await server.hold;
    return server.ok ? { ok: true, value } : { ok: false };
  },
}));

const Editor = (await import("../../../../src/components/settings/HeaderStatusColorsEditor.vue")).default;

afterEach(() => {
  setHeaderStatusDefaults({}, "background");
  server.ok = true;
  server.calls.length = 0;
  server.hold = null;
});

const mountEditor = () => mount(Editor, { global: { plugins: [i18n] } });
const row = (wrapper: ReturnType<typeof mountEditor>, status: string) => wrapper.find(`[data-status="${status}"]`);

describe("HeaderStatusColorsEditor", () => {
  it("shows every status on the theme's colour while nothing is set", () => {
    const wrapper = mountEditor();
    ["working", "done", "blocked"].forEach((status) => {
      expect(row(wrapper, status).find('[data-testid="header-color-background-start"]').exists()).toBe(true);
      expect(row(wrapper, status).find('[data-testid="header-color-reset"]').exists()).toBe(false);
      expect(row(wrapper, status).find('[data-testid="header-color-sample"]').attributes("style") ?? "").not.toContain("--cell-header-bg");
    });
    wrapper.unmount();
  });

  it("paints the sample with a configured colour and a readable ink", () => {
    setHeaderStatusDefaults({ working: "#ffffff" }, "background");
    const wrapper = mountEditor();
    const style = row(wrapper, "working").find('[data-testid="header-color-sample"]').attributes("style") ?? "";
    expect(style).toContain("--cell-header-bg: #ffffff");
    expect(style).toContain("--cell-header-fg");
    wrapper.unmount();
  });

  it("starts a status on a colour, then saves a picked one", async () => {
    const wrapper = mountEditor();
    await row(wrapper, "done").find('[data-testid="header-color-background-start"]').trigger("click");
    await flushPromises();
    expect(server.calls).toHaveLength(1);
    expect(globalHeaderStatusColors.value.done?.background).toMatch(/^#[0-9a-f]{6}$/);
    const input = row(wrapper, "done").find<HTMLInputElement>('[data-testid="header-color-background"]');
    await input.setValue("#00aa00");
    await input.trigger("change");
    await flushPromises();
    expect(server.calls.at(-1)).toEqual(["headerStatusColors", { done: { background: "#00aa00", text: null } }]);
    wrapper.unmount();
  });

  it("sets a text colour, and 'auto' hands it back to the derived ink", async () => {
    setHeaderStatusDefaults({ blocked: { background: "#333333" } }, "background");
    const wrapper = mountEditor();
    await row(wrapper, "blocked").find('[data-testid="header-color-text-start"]').trigger("click");
    await flushPromises();
    expect(globalHeaderStatusColors.value.blocked?.text).toMatch(/^#[0-9a-f]{6}$/);
    await row(wrapper, "blocked").find('[data-testid="header-color-text-auto"]').trigger("click");
    await flushPromises();
    expect(server.calls.at(-1)).toEqual(["headerStatusColors", { blocked: { background: "#333333", text: null } }]);
    wrapper.unmount();
  });

  it("'back to the theme' removes only that status", async () => {
    setHeaderStatusDefaults({ working: "#111111", done: "#222222" }, "background");
    const wrapper = mountEditor();
    await row(wrapper, "working").find('[data-testid="header-color-reset"]').trigger("click");
    await flushPromises();
    expect(server.calls).toEqual([["headerStatusColors", { done: { background: "#222222", text: null } }]]);
    expect(globalHeaderStatusColors.value).toEqual({ done: { background: "#222222", text: null } });
    wrapper.unmount();
  });

  it("keeps what the host holds when the save is refused", async () => {
    server.ok = false;
    setHeaderStatusDefaults({ working: "#111111" }, "background");
    const wrapper = mountEditor();
    await row(wrapper, "working").find('[data-testid="header-color-reset"]').trigger("click");
    await flushPromises();
    expect(globalHeaderStatusColors.value).toEqual({ working: { background: "#111111", text: null } });
    expect(row(wrapper, "working").find('[data-testid="header-color-reset"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("is locked while a save is in flight", async () => {
    let release = () => {};
    server.hold = new Promise<void>((resolve) => (release = resolve));
    const wrapper = mountEditor();
    await row(wrapper, "working").find('[data-testid="header-color-background-start"]').trigger("click");
    expect(wrapper.findAll("button").every((button) => button.element.disabled)).toBe(true);
    release();
    await flushPromises();
    expect(wrapper.findAll("button").every((button) => !button.element.disabled)).toBe(true);
    wrapper.unmount();
  });
});
