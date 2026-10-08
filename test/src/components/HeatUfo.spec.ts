import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import HeatStage from "../../../src/components/cpuHeat/HeatStage.vue";
import { HEAT_PALETTE } from "../../../src/components/cpuHeat/heatPalette";
import type { StageLevel } from "../../../src/components/cpuHeat/stageLevel";

const LEVELS: StageLevel[] = [0, 1, 2, 3, 4, 5];
const mountUfo = (level: StageLevel, animate = true) => mount(HeatStage, { props: { pattern: "ufo", level, palette: HEAT_PALETTE.dark, animate } });

describe("ufo heat picture", () => {
  it.each(LEVELS)("draws the saucer at level %i, with and without motion", (level) => {
    [true, false].forEach((animate) => expect(mountUfo(level, animate).findAll("ellipse").length).toBeGreaterThan(0));
  });

  it("beams down from the second level until the finale", () => {
    const beamed = LEVELS.map((level) => mountUfo(level).findAll("polygon").length);
    expect(beamed).toEqual([0, 0, 1, 1, 1, 0]);
  });

  it("flies off only in the finale", () => {
    const flightOf = (level: StageLevel) => mountUfo(level).findAll("animateTransform[values='0 0;190 -230']").length;
    expect(flightOf(4)).toBe(0);
    expect(flightOf(5)).toBe(1);
  });
});
