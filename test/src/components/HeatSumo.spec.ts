import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import HeatStage from "../../../src/components/cpuHeat/HeatStage.vue";
import { HEAT_PALETTE } from "../../../src/components/cpuHeat/heatPalette";
import { ARM_PATHS, BODY_TRANSFORM } from "../../../src/components/cpuHeat/sumoPose";
import type { StageLevel } from "../../../src/components/cpuHeat/stageLevel";

const LEVELS: StageLevel[] = [0, 1, 2, 3, 4, 5];

describe("sumo heat picture", () => {
  it.each(LEVELS)("draws two rikishi at level %i, with and without motion", (level) => {
    [true, false].forEach((animate) => {
      const wrapper = mount(HeatStage, { props: { pattern: "sumo", level, palette: HEAT_PALETTE.dark, animate } });
      expect(wrapper.findAll("radialGradient").length).toBeGreaterThanOrEqual(2);
    });
  });

  it("plays the throw only in the finale", () => {
    const hot = mount(HeatStage, { props: { pattern: "sumo", level: 4, palette: HEAT_PALETTE.dark, animate: true } });
    const finale = mount(HeatStage, { props: { pattern: "sumo", level: 5, palette: HEAT_PALETTE.dark, animate: true } });
    expect(hot.findAll("animateMotion[path^='M0 0 Q55']")).toHaveLength(0);
    expect(finale.findAll("animateMotion[path^='M0 0 Q55']")).toHaveLength(1);
  });

  it("gives every pose two arms and a body transform", () => {
    Object.values(ARM_PATHS).forEach((arms) => expect(arms).toHaveLength(2));
    expect(Object.keys(BODY_TRANSFORM).sort()).toEqual(Object.keys(ARM_PATHS).sort());
  });
});
