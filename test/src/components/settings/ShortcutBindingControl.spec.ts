// #2619. Change or clear one shortcut by pressing the keys.
import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { i18n } from "../../../../src/i18n";
import { shortcutRecording } from "../../../../src/composables/shortcutRecording";

const state = vi.hoisted(() => ({
  sent: [] as [string, string | null][],
  outcome: { ok: true, warnings: [] } as { ok: true; warnings: string[] } | { ok: false; problems: string[] },
}));
vi.mock("../../../../src/composables/keymapEditing", () => ({
  setKeymapBinding: async (action: string, binding: string | null) => {
    state.sent.push([action, binding]);
    return state.outcome;
  },
}));

const ShortcutBindingControl = (await import("../../../../src/components/settings/ShortcutBindingControl.vue")).default;

afterEach(() => {
  state.sent.length = 0;
  state.outcome = { ok: true, warnings: [] };
});

const mountControl = (bound = false) => mount(ShortcutBindingControl, { props: { action: "zoom-next", bound }, global: { plugins: [i18n] } });
// Sent to an element, as a real key press is, so the event travels window (capture) → element →
// document (bubble) and "kept from anything else" can be observed on the way.
const press = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e);
  return e;
};

describe("ShortcutBindingControl", () => {
  it("records the chord once a non-modifier key arrives, and saves it", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    expect(shortcutRecording.value).toBe(true);
    press({ key: "Shift", shiftKey: true });
    expect(state.sent).toEqual([]);
    const e = press({ key: "PageDown", shiftKey: true, ctrlKey: true });
    await flushPromises();
    expect(e.defaultPrevented).toBe(true);
    expect(state.sent).toEqual([["zoom-next", "Ctrl+Shift+PageDown"]]);
    expect(shortcutRecording.value).toBe(false);
    wrapper.unmount();
  });

  it("cancels on a bare Escape without saving, and keeps the key from anything else", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    const elsewhere = vi.fn();
    document.addEventListener("keydown", elsewhere);
    press({ key: "Escape" });
    await flushPromises();
    document.removeEventListener("keydown", elsewhere);
    expect(state.sent).toEqual([]);
    expect(elsewhere).not.toHaveBeenCalled();
    expect(shortcutRecording.value).toBe(false);
    wrapper.unmount();
  });

  it("says why a key cannot be bound, without saving", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    press({ key: " " });
    await flushPromises();
    expect(state.sent).toEqual([]);
    expect(wrapper.find('[data-testid="shortcut-message"]').text()).toBe(i18n.global.t("settingsControls.shortcuts.whitespace"));
    wrapper.unmount();
  });

  it("clears a bound shortcut, and shows the server's refusal", async () => {
    state.outcome = { ok: false, problems: ["bad binding"] };
    const wrapper = mountControl(true);
    await wrapper.find('[data-testid="shortcut-clear"]').trigger("click");
    await flushPromises();
    expect(state.sent).toEqual([["zoom-next", null]]);
    expect(wrapper.find('[data-testid="shortcut-message"]').text()).toContain("bad binding");
    wrapper.unmount();
  });

  it("stops recording when it goes away mid-record", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    wrapper.unmount();
    expect(shortcutRecording.value).toBe(false);
    press({ key: "PageDown" });
    await flushPromises();
    expect(state.sent).toEqual([]);
  });

  it("lets only one row record: starting a second stops the first", async () => {
    const first = mountControl();
    const second = mount(ShortcutBindingControl, { props: { action: "zoom-prev", bound: false }, global: { plugins: [i18n] } });
    await first.find('[data-testid="shortcut-change"]').trigger("click");
    await second.find('[data-testid="shortcut-change"]').trigger("click");
    expect(first.find('[data-testid="shortcut-change"]').attributes("aria-pressed")).toBe("false");
    press({ key: "PageDown" });
    await flushPromises();
    expect(state.sent).toEqual([["zoom-prev", "PageDown"]]);
    first.unmount();
    second.unmount();
  });

  it("stops recording when focus leaves the button — another tab, or the modal closing", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    await wrapper.find('[data-testid="shortcut-change"]').trigger("blur");
    expect(shortcutRecording.value).toBe(false);
    press({ key: "PageDown" });
    await flushPromises();
    expect(state.sent).toEqual([]);
    wrapper.unmount();
  });

  it("leaves a key alone while an input method is composing", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    const e = press({ key: "Enter", isComposing: true });
    await flushPromises();
    expect(e.defaultPrevented).toBe(false);
    expect(state.sent).toEqual([]);
    expect(shortcutRecording.value).toBe(true);
    wrapper.unmount();
  });

  it("announces a refusal as an alert and a warning as a status", async () => {
    const wrapper = mountControl();
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    press({ key: " " });
    await flushPromises();
    expect(wrapper.find('[data-testid="shortcut-message"]').attributes("role")).toBe("alert");
    state.outcome = { ok: true, warnings: ["the browser keeps it"] };
    await wrapper.find('[data-testid="shortcut-change"]').trigger("click");
    press({ key: "PageDown" });
    await flushPromises();
    expect(wrapper.find('[data-testid="shortcut-message"]').attributes("role")).toBe("status");
    wrapper.unmount();
  });
});

