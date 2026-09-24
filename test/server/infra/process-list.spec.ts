// @vitest-environment node
// `ps -o time` is printed differently on the two platforms this runs on; a row that cannot be read
// must be dropped rather than guessed, or a session is billed for a process it never had.
import { describe, it, expect } from "vitest";
import { parseCpuTime, parseProcessRows } from "../../../server/infra/process-list";

describe("parseCpuTime", () => {
  it.each([
    ["0:00.00", 0],
    ["0:01.25", 1.25],
    ["12:34.50", 754.5],
    ["1234:05.00", 74045],
  ])("reads macOS minutes:seconds %s", (text, seconds) => {
    expect(parseCpuTime(text)).toBeCloseTo(seconds);
  });

  it.each([
    ["00:00:00", 0],
    ["00:01:02", 62],
    ["10:00:00", 36000],
    ["1-02:03:04", 93784],
    ["12-00:00:01", 1036801],
  ])("reads Linux [days-]hh:mm:ss %s", (text, seconds) => {
    expect(parseCpuTime(text)).toBe(seconds);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseCpuTime("  0:02.00 \n")).toBe(2);
  });

  it.each(["", "abc", "5", "1:xx", "1-", "-1:00", "1::00", "a-00:00:01"])("refuses %j", (text) => {
    expect(parseCpuTime(text)).toBeNull();
  });
});

describe("parseProcessRows", () => {
  it("reads pid, parent and CPU time from each line", () => {
    const stdout = "    1     0   1:02.00\n  345     1   0:00.50\n";
    expect(parseProcessRows(stdout)).toEqual([
      { pid: 1, ppid: 0, cpuSeconds: 62 },
      { pid: 345, ppid: 1, cpuSeconds: 0.5 },
    ]);
  });

  it("drops blank lines, short lines and lines that are not numbers", () => {
    const stdout = "\n  PID  PPID TIME\n  12\n  x 1 0:01.00\n  7 1 later\n  8 1 0:01.00\n";
    expect(parseProcessRows(stdout)).toEqual([{ pid: 8, ppid: 1, cpuSeconds: 1 }]);
  });

  it("is empty for empty output", () => {
    expect(parseProcessRows("")).toEqual([]);
  });
});
