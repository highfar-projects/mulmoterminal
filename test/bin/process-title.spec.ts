// @vitest-environment node
import { describe, it, expect } from "vitest";

import { processTitle } from "../../bin/process-title.js";

// The base name has to stay findable by the two things a user reaches for, and both of them
// constrain it: `pkill mulmoterminal` matches unanchored, and Linux only keeps the first 15
// characters of the name in `comm` — so the base must fit inside that on its own, whatever gets
// appended after it.
const LINUX_COMM_MAX = 15;

describe("processTitle", () => {
  it("names the process and says which port it serves", () => {
    expect(processTitle(34567)).toBe("mulmoterminal :34567");
  });

  it("accepts the port as the string the environment supplies", () => {
    // PORT comes from `process.env.PORT || 34567`, so both types reach this in normal use.
    expect(processTitle("34567")).toBe(processTitle(34567));
  });

  it.each([null, undefined, "", "abc", 0, -1, 1.5, NaN, Infinity, 65536, 70000])("falls back to the bare name rather than claiming port %p", (port) => {
    expect(processTitle(port)).toBe("mulmoterminal");
  });

  it("stays matchable by `pkill mulmoterminal` across the whole port range", () => {
    for (const port of [1, 80, 34567, 65535]) expect(processTitle(port)).toContain("mulmoterminal");
  });

  it("names the same range parsePortArg accepts, so the two cannot disagree about what a port is", () => {
    expect(processTitle(65535)).toBe("mulmoterminal :65535");
    expect(processTitle(65536)).toBe("mulmoterminal");
  });

  it("keeps the base name inside the length Linux preserves", () => {
    expect(processTitle(null).length).toBeLessThanOrEqual(LINUX_COMM_MAX);
    // The truncated form is what `pkill mulmoterminal` matches against on Linux, so it must still
    // contain the base — which it does only because the port is appended, never prepended.
    expect(processTitle(34567).slice(0, LINUX_COMM_MAX)).toContain("mulmoterminal");
  });
});
