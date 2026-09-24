// The dynamite's timer really counts down, holds at 0:01, and blinks there — unless the person asked
// for less motion, when it holds still like every other picture.
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import HeatDynamite from "../../../src/components/cpuHeat/HeatDynamite.vue";
import { HEAT_PALETTE } from "../../../src/components/cpuHeat/heatPalette";

const TICK_MS = 1000;
const CRITICAL_START_SECONDS = 5;

afterEach(() => vi.useRealTimers());

function mountCritical(animate: boolean) {
  vi.useFakeTimers();
  const wrapper = mount(HeatDynamite, { props: { level: 4, palette: HEAT_PALETTE.dark, animate } });
  vi.advanceTimersByTime(CRITICAL_START_SECONDS * TICK_MS);
  return wrapper;
}

describe("HeatDynamite", () => {
  it("counts down and holds at 0:01", async () => {
    const wrapper = mountCritical(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.get("text").text()).toBe("0:01");
  });

  it("blinks while holding", async () => {
    const wrapper = mountCritical(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find("text animate").exists()).toBe(true);
  });

  it("holds still for someone who asked for less motion", async () => {
    const wrapper = mountCritical(false);
    await wrapper.vm.$nextTick();
    expect(wrapper.get("text").text()).toBe("0:01");
    expect(wrapper.find("text animate").exists()).toBe(false);
  });
});
