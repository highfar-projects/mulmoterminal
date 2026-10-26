// @vitest-environment node
import { describe, it, expect } from "vitest";
import { liveServerFrom, measuredForLiveServer, type LiveTmuxServer } from "../../../../server/infra/process/tmuxLiveServer";

const CASES: [label: string, probeVersion: string | null, live: LiveTmuxServer, applies: boolean][] = [
  ["no server running yet", "3.6a", { running: false }, true],
  ["no server, and the probe could not say its version", null, { running: false }, true],
  ["the same tmux", "3.6a", { running: true, version: "3.6a" }, true],
  ["a server left over from before an upgrade", "3.6a", { running: true, version: "3.5a" }, false],
  ["a server whose version could not be read", "3.6a", { running: true, version: null }, false],
  ["a probe that could not say its version", null, { running: true, version: "3.6a" }, false],
  ["neither version known", null, { running: true, version: null }, false],
];

describe("measuredForLiveServer", () => {
  it.each(CASES)("%s", (_label, probeVersion, live, applies) => {
    expect(measuredForLiveServer(probeVersion, live)).toBe(applies);
  });
});

describe("liveServerFrom", () => {
  it("is not running when tmux says it holds nothing", () => {
    expect(liveServerFrom({ status: 1, stdout: "" }, true)).toEqual({ running: false });
  });

  it("reads the version, trimmed", () => {
    expect(liveServerFrom({ status: 0, stdout: "3.6a\n" }, false)).toEqual({ running: true, version: "3.6a" });
  });

  it.each([
    ["a failure that is not an absent server", { status: 1, stdout: "" }],
    ["a timeout", { status: null, stdout: "" }],
    ["an empty answer", { status: 0, stdout: "  \n" }],
  ])("is running with no version after %s", (_label, result) => {
    expect(liveServerFrom(result, false)).toEqual({ running: true, version: null });
  });
});
