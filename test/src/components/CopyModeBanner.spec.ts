import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import { uiLanguage } from "../../../src/composables/uiLanguage";

const CopyModeBanner = (await import("../../../src/components/CopyModeBanner.vue")).default;

describe("CopyModeBanner", () => {
  it("says why typing does nothing and how to get back", () => {
    const wrapper = mount(CopyModeBanner);
    expect(wrapper.text()).toContain("what you type doesn't reach the terminal");
    expect(wrapper.text()).toContain("q");
    expect(wrapper.get('[data-testid="copy-mode-exit"]').text()).toBe("Back to input");
  });

  it("emits exit when the button is pressed, and only then", async () => {
    const wrapper = mount(CopyModeBanner);
    expect(wrapper.emitted("exit")).toBeUndefined();
    await wrapper.get('[data-testid="copy-mode-exit"]').trigger("click");
    expect(wrapper.emitted("exit")).toHaveLength(1);
  });

  it("follows the UI language", async () => {
    uiLanguage.value = "ja";
    i18n.global.locale.value = "ja";
    const wrapper = mount(CopyModeBanner);
    expect(wrapper.get('[data-testid="copy-mode-exit"]').text()).toBe("入力に戻る");
  });
});
