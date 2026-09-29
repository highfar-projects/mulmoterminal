import { describe, it, expect, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { i18n } from "../../../src/i18n";
import { focusModeNotice } from "../../../src/composables/focusMode";

const FocusModeNotice = (await import("../../../src/components/FocusModeNotice.vue")).default;

// #2580. Every outcome has words, in every locale — a missing one would show its raw key.
const LOCALES = ["en", "ja", "ko", "zh-CN", "zh-TW"] as const;
const OUTCOMES = ["locked", "unlocked", "insecure", "refused"] as const;

describe("FocusModeNotice", () => {
  afterEach(() => (focusModeNotice.value = null));

  it.each(LOCALES.flatMap((locale) => OUTCOMES.map((outcome) => [locale, outcome] as const)))("%s says %s", (locale, outcome) => {
    expect(i18n.global.te(`focusMode.${outcome}`, locale)).toBe(true);
  });

  it("shows the outcome's message, and nothing when there is none", async () => {
    const w = mount(FocusModeNotice, { global: { plugins: [i18n] } });
    expect(w.find('[data-testid="focus-mode-notice"]').exists()).toBe(false);
    focusModeNotice.value = "insecure";
    await nextTick();
    expect(w.get('[data-testid="focus-mode-notice"]').text()).toBe(i18n.global.t("focusMode.insecure"));
    w.unmount();
  });
});
