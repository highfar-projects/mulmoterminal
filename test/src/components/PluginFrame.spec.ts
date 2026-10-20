import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h } from "vue";
import PluginFrame from "../../../src/components/PluginFrame.vue";
import { getPlugin } from "../../../src/plugins-registry";

// A plugin authored for a light surface gets a white one under it in MulmoTerminal's dark panel.
// The chart plugin draws its own surface for `data-appearance`, and a forced white mount would
// frame its dark cards in white.
const mountSurface = (followsAppearance: boolean | undefined) => {
  const wrapper = mount(PluginFrame, { props: { followsAppearance }, slots: { default: () => h("span", "view") }, attachTo: document.body });
  const host = wrapper.element instanceof HTMLElement ? wrapper.element : null;
  const surface = host?.shadowRoot?.querySelector("div");
  const style = { background: surface?.style.background, color: surface?.style.color };
  wrapper.unmount();
  return style;
};

describe("PluginFrame surface", () => {
  it("puts a light surface under a plugin that does not follow the appearance", () => {
    expect(mountSurface(undefined).background).toMatch(/#ffffff|rgb\(255, 255, 255\)/);
    expect(mountSurface(false).color).not.toBe("");
  });

  it("leaves the surface to a plugin that follows the appearance", () => {
    expect(mountSurface(true)).toEqual({ background: "", color: "" });
  });

  it("the chart plugin follows the appearance", () => {
    expect(getPlugin("presentChart")?.followsAppearance).toBe(true);
  });
});
