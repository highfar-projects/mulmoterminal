import { describe, it, expect } from "vitest";
import { formatCpu, formatElapsed, formatMemory } from "../../../../src/components/processes/processFormat";

describe("formatMemory", () => {
  it.each([
    [0, "0K"],
    [1023, "1023K"],
    [1024, "1M"],
    [1536, "2M"],
    [1024 * 1024, "1.0G"],
    [1.5 * 1024 * 1024, "1.5G"],
    [12 * 1024 * 1024, "12G"],
  ])("%s KB reads %s", (rssKb, text) => {
    expect(formatMemory(rssKb)).toBe(text);
  });
});

describe("formatElapsed", () => {
  const NOW = 1_000_000_000;
  it.each([
    [30, "just now"],
    [5 * 60, "5m"],
    [3 * 3600, "3h"],
    [2 * 86_400, "2d"],
  ])("%s seconds reads %s", (seconds, text) => {
    expect(formatElapsed(seconds, NOW)).toBe(text);
  });
});

describe("formatCpu", () => {
  it.each([
    [null, "—"],
    [0, "0%"],
    [49.6, "50%"],
    [250, "250%"],
  ])("%s reads %s", (cpu, text) => {
    expect(formatCpu(cpu)).toBe(text);
  });
});
