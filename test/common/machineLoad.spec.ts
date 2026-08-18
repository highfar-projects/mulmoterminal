// @vitest-environment node
import { describe, it, expect } from "vitest";
import { machineLoadFrom, parseMachineLoad, keepsLoadAverage } from "../../common/machineLoad";

const MAC = "darwin";

describe("machineLoadFrom", () => {
  it("carries the three averages and the core count through", () => {
    expect(machineLoadFrom([66.84, 59.88, 55.24], 20, MAC)).toEqual({ avg1: 66.84, avg5: 59.88, avg15: 55.24, cores: 20 });
  });

  // The whole reason the platform decides and the values do not: an idle machine reports 0.00,
  // and calling that "unknown" would drop the one reading we can vouch for.
  it("keeps a genuine zero on a host that has load averages", () => {
    expect(machineLoadFrom([0, 0, 0], 8, "linux")).toEqual({ avg1: 0, avg5: 0, avg15: 0, cores: 8 });
  });

  // Node documents `[0, 0, 0]` on Windows. Drawing that as 0% would say "idle" where the truth is
  // "not measured", which is the mistake the gauges beside this one exist not to make.
  it("reports nothing on Windows, whatever the numbers say", () => {
    expect(machineLoadFrom([0, 0, 0], 16, "win32")).toBeNull();
    expect(machineLoadFrom([3.2, 3.1, 3.0], 16, "win32")).toBeNull();
  });

  it("rejects averages that describe no machine", () => {
    expect(machineLoadFrom([Number.NaN, 1, 1], 4, MAC)).toBeNull();
    expect(machineLoadFrom([Number.POSITIVE_INFINITY, 1, 1], 4, MAC)).toBeNull();
    expect(machineLoadFrom([-1, 1, 1], 4, MAC)).toBeNull();
    expect(machineLoadFrom([1, 1], 4, MAC)).toBeNull();
    expect(machineLoadFrom([], 4, MAC)).toBeNull();
  });

  // A zero core count is not a quiet machine, it is a division by zero on the way to the screen.
  it("rejects a core count that cannot divide", () => {
    expect(machineLoadFrom([1, 1, 1], 0, MAC)).toBeNull();
    expect(machineLoadFrom([1, 1, 1], -4, MAC)).toBeNull();
    expect(machineLoadFrom([1, 1, 1], 2.5, MAC)).toBeNull();
  });
});

describe("parseMachineLoad", () => {
  it("accepts the shape the route sends", () => {
    expect(parseMachineLoad({ avg1: 1.5, avg5: 1.2, avg15: 1, cores: 4 })).toEqual({ avg1: 1.5, avg5: 1.2, avg15: 1, cores: 4 });
  });

  it("rejects anything that is not that shape", () => {
    for (const bad of [null, undefined, 3, "1.5", [], [1, 2, 3], {}, { avg1: 1, avg5: 1, avg15: 1 }, { avg1: "1", avg5: 1, avg15: 1, cores: 4 }]) {
      expect(parseMachineLoad(bad)).toBeNull();
    }
  });

  // The client parses a body, not a platform — a host that keeps no average says so by sending
  // `load: null`, which never reaches here.
  it("does not second-guess the platform", () => {
    expect(parseMachineLoad({ avg1: 0, avg5: 0, avg15: 0, cores: 8 })).toEqual({ avg1: 0, avg5: 0, avg15: 0, cores: 8 });
  });
});

describe("keepsLoadAverage", () => {
  it("is false only for Windows", () => {
    expect(keepsLoadAverage("win32")).toBe(false);
    for (const platform of ["darwin", "linux", "freebsd", "openbsd", "aix", "sunos"]) expect(keepsLoadAverage(platform)).toBe(true);
  });
});
