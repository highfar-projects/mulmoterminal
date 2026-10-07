import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { confettiRequest } from "../../../src/composables/useConfetti";
import { useKonamiCode } from "../../../src/composables/useKonamiCode";
import { KONAMI_SEQUENCE } from "../../../src/composables/konamiCode";

const Host = defineComponent({
  setup() {
    useKonamiCode();
    return () => h("div");
  },
});

const press = (target: EventTarget): void => {
  KONAMI_SEQUENCE.forEach((key) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
};
const requestCount = () => confettiRequest.value?.id ?? 0;

describe("useKonamiCode", () => {
  afterEach(() => document.body.replaceChildren());

  it("fires the finale when the sequence is pressed on the page", () => {
    const wrapper = mount(Host);
    const before = requestCount();
    press(document.body);
    expect(requestCount()).toBe(before + 1);
    wrapper.unmount();
  });

  it("ignores the sequence typed into a field, which a terminal is", () => {
    const wrapper = mount(Host);
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    const before = requestCount();
    press(field);
    expect(requestCount()).toBe(before);
    wrapper.unmount();
  });

  it("stops listening once unmounted", () => {
    mount(Host).unmount();
    const before = requestCount();
    press(document.body);
    expect(requestCount()).toBe(before);
  });
});
