// What the overlay shows for a given heat, setting and theme: nothing when off or cold, the
// session's picture at its level when hot, the finale for a moment when told of one, and a blend
// that keeps the terminal text readable on either theme.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setPlayfulEffects } from "../../../src/composables/playfulEffects";
import HeatStage from "../../../src/components/cpuHeat/HeatStage.vue";

const CpuHeatOverlay = (await import("../../../src/components/CpuHeatOverlay.vue")).default;

const FINALE_SHOW_MS = 2500;

afterEach(() => {
  setPlayfulEffects(undefined);
  document.documentElement.removeAttribute("data-appearance");
  vi.useRealTimers();
});

describe("CpuHeatOverlay", () => {
  it("shows nothing while the session is cold", () => {
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 0, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("shows nothing when switched off, however hot", () => {
    setPlayfulEffects("off");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 4, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("shows nothing for a cell with no session yet", () => {
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: null, heatLevel: 4, heatFinales: 0 } });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("draws the chosen picture at the session's level", () => {
    setPlayfulEffects("volcano");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
    const stage = wrapper.getComponent(HeatStage);
    expect(stage.props("pattern")).toBe("volcano");
    expect(stage.props("level")).toBe(3);
  });

  it("plays the finale for a moment when told of one, then clears", async () => {
    vi.useFakeTimers();
    setPlayfulEffects("bomb");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 3, heatFinales: 0 } });
    await wrapper.setProps({ heatLevel: 0, heatFinales: 1 });
    expect(wrapper.getComponent(HeatStage).props("level")).toBe(5);
    vi.advanceTimersByTime(FINALE_SHOW_MS);
    await flushPromises();
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("does not replay the finale when the count merely resets on a new socket", async () => {
    setPlayfulEffects("bomb");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 0, heatFinales: 2 } });
    await wrapper.setProps({ heatFinales: 0 });
    expect(wrapper.find('[data-testid="cpu-heat"]').exists()).toBe(false);
  });

  it("blends so the lighter pixel wins on a dark theme and the darker on a light one", async () => {
    setPlayfulEffects("bomb");
    document.documentElement.setAttribute("data-appearance", "dark");
    const wrapper = mount(CpuHeatOverlay, { props: { sessionId: "s1", heatLevel: 2, heatFinales: 0 } });
    expect(wrapper.get('[data-testid="cpu-heat"]').classes()).toContain("mix-blend-screen");
    document.documentElement.setAttribute("data-appearance", "light");
    await flushPromises();
    expect(wrapper.get('[data-testid="cpu-heat"]').classes()).toContain("mix-blend-multiply");
  });
});
