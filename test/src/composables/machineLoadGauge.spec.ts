// @vitest-environment node
import { describe, it, expect } from "vitest";
import { machineLoadReadout, BUSY_PERCENT, SATURATED_PERCENT } from "../../../src/composables/machineLoadGauge";

const load = (avg1: number, cores: number) => ({ avg1, avg5: avg1, avg15: avg1, cores });

describe("machineLoadReadout", () => {
  it("reads the load as a percentage of the cores", () => {
    expect(machineLoadReadout(load(10, 20))?.percent).toBe(50);
    expect(machineLoadReadout(load(20, 20))?.percent).toBe(100);
    expect(machineLoadReadout(load(66.84, 20))?.percent).toBe(334);
  });

  it("draws nothing when the host reports nothing", () => {
    expect(machineLoadReadout(null)).toBeNull();
  });

  it("colours on the core ratio, so the same number means the same thing on any machine", () => {
    expect(machineLoadReadout(load(3.9, 4))?.tone).toBe("muted");
    expect(machineLoadReadout(load(4, 4))?.tone).toBe("amber");
    expect(machineLoadReadout(load(64, 8))?.tone).toBe("err");
    // 3.9 on 4 cores is nearly saturated; the same 3.9 on 64 is nothing at all.
    expect(machineLoadReadout(load(3.9, 64))?.tone).toBe("muted");
  });

  // Deliberately the DISPLAYED figure, not the raw one (CodeRabbit on #1791): the screen says
  // `load 100%` and the docs say amber at 100%, so colouring 99.6% grey under a label reading
  // 100% would contradict the only threshold a reader can see.
  it("colours what it shows, so the number and the colour cannot disagree", () => {
    const almost = machineLoadReadout(load(19.96, 20));
    expect(almost?.percent).toBe(100);
    expect(almost?.tone).toBe("amber");
    const almostSaturated = machineLoadReadout(load(39.96, 20));
    expect(almostSaturated?.percent).toBe(200);
    expect(almostSaturated?.tone).toBe("err");
  });

  it("puts the boundaries exactly where the constants say", () => {
    expect(machineLoadReadout(load(BUSY_PERCENT / 100, 1))?.tone).toBe("amber");
    expect(machineLoadReadout(load((BUSY_PERCENT - 1) / 100, 1))?.tone).toBe("muted");
    expect(machineLoadReadout(load(SATURATED_PERCENT / 100, 1))?.tone).toBe("err");
    expect(machineLoadReadout(load((SATURATED_PERCENT - 1) / 100, 1))?.tone).toBe("amber");
  });

  // The hover answers the question the percentage cannot: is this a spike, or has it been like
  // this for a quarter of an hour.
  it("keeps the raw triple, the cores and the ratio in the hover", () => {
    expect(machineLoadReadout({ avg1: 66.84, avg5: 59.88, avg15: 55.24, cores: 20 })?.title).toBe("Load average 66.84 / 59.88 / 55.24 — 20 cores (3.3x)");
  });
});
