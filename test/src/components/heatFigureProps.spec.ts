// Every picture HeatStage can show takes exactly the shared figure contract, so the stage can hand
// any of them the same three props.
import { describe, it, expect } from "vitest";
import type { Component } from "vue";
import HeatBalloon from "../../../src/components/cpuHeat/HeatBalloon.vue";
import HeatBomb from "../../../src/components/cpuHeat/HeatBomb.vue";
import HeatDynamite from "../../../src/components/cpuHeat/HeatDynamite.vue";
import HeatKettle from "../../../src/components/cpuHeat/HeatKettle.vue";
import HeatRocket from "../../../src/components/cpuHeat/HeatRocket.vue";
import HeatSkull from "../../../src/components/cpuHeat/HeatSkull.vue";
import HeatUfo from "../../../src/components/cpuHeat/HeatUfo.vue";
import HeatVolcano from "../../../src/components/cpuHeat/HeatVolcano.vue";

const FIGURES: Record<string, Component> = { HeatBalloon, HeatBomb, HeatDynamite, HeatKettle, HeatRocket, HeatSkull, HeatUfo, HeatVolcano };

const declaredProps = (figure: Component): unknown => ("props" in figure ? figure.props : undefined);

describe("heat figure props", () => {
  it.each(Object.entries(FIGURES))("%s declares level, palette and animate, all required", (_name, figure) => {
    expect(declaredProps(figure)).toEqual({
      level: { type: null, required: true },
      palette: { type: Object, required: true },
      animate: { type: Boolean, required: true },
    });
  });
});
