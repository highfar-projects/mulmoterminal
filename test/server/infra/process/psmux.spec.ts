// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isAtLeast, isPsmuxVersion, psmuxStartupNote, psmuxVersionOf, psmuxVtInputFor } from "../../../../server/infra/process/psmux";

const PSMUX_340 = "tmux 3.4.0\npsmux 3.4.0 (e39b9fe5 2026-10-10)\n";
const PSMUX_338 = "tmux 3.3.8\r\npsmux 3.3.8 (abc1234)\r\n";

describe("isPsmuxVersion", () => {
  it("recognises psmux by its second line", () => {
    expect(isPsmuxVersion(PSMUX_340)).toBe(true);
    expect(isPsmuxVersion(PSMUX_338)).toBe(true);
  });

  it.each([
    "tmux 3.8\n",
    "tmux 3.7a\n",
    "tmux next-3.9\n",
    "",
    "tmux 3.4\npsmuxer 1.0.0",
    "psmux 3.4.0 (x)\n",
    "tmux 3.8 psmux\n",
    "tmux 3.8\nbuilt by a psmux fan\n",
    "tmux 3.8\n\npsmux 3.4.0 (x)\n",
  ])("does not take %j for psmux", (stdout) => {
    expect(isPsmuxVersion(stdout)).toBe(false);
  });
});

describe("psmuxVersionOf", () => {
  it("reads psmux's own release, not the tmux it imitates", () => {
    expect(psmuxVersionOf("tmux 3.3.8\npsmux 3.4.0 (x)")).toEqual([3, 4, 0]);
    expect(psmuxVersionOf(PSMUX_338)).toEqual([3, 3, 8]);
    expect(psmuxVersionOf("tmux 3.4\nPSMUX 10.0.12")).toEqual([10, 0, 12]);
  });

  it.each(["tmux 3.8", "tmux 3.4\npsmux", "tmux 3.4\npsmux 3.4", "tmux 3.4\npsmux v3.4.0", "", "psmux 3.4.0", "tmux 3.8\n\npsmux 3.4.0"])(
    "is null for %j",
    (stdout) => {
      expect(psmuxVersionOf(stdout)).toBeNull();
    },
  );
});

describe("isAtLeast", () => {
  it.each([
    [[3, 4, 0], true],
    [[3, 4, 1], true],
    [[3, 5, 0], true],
    [[4, 0, 0], true],
    [[3, 3, 99], false],
    [[2, 9, 9], false],
    [[3, 3, 8], false],
  ] as const)("%j against 3.4.0 is %s", (version, expected) => {
    expect(isAtLeast(version, [3, 4, 0])).toBe(expected);
  });
});

describe("psmuxVtInputFor", () => {
  it("turns the VT input route on from 3.4.0", () => {
    expect(psmuxVtInputFor([3, 4, 0], undefined)).toBe(true);
    expect(psmuxVtInputFor([3, 5, 2], "1")).toBe(true);
  });

  it("leaves an older psmux, or an unreadable version, on the default route", () => {
    expect(psmuxVtInputFor([3, 3, 8], undefined)).toBe(false);
    expect(psmuxVtInputFor(null, undefined)).toBe(false);
  });

  it("is turned off by PSMUX_VT_INPUT=0 only", () => {
    expect(psmuxVtInputFor([3, 4, 0], "0")).toBe(false);
    expect(psmuxVtInputFor([3, 4, 0], "")).toBe(true);
    expect(psmuxVtInputFor([3, 4, 0], "false")).toBe(true);
  });
});

describe("psmuxStartupNote", () => {
  it("names a supported psmux", () => {
    expect(psmuxStartupNote([3, 4, 0])).toBe("[tmux] running on psmux 3.4.0");
  });

  it("tells an older psmux to upgrade", () => {
    expect(psmuxStartupNote([3, 3, 8])).toMatch(/psmux 3\.3\.8 is older than 3\.4\.0.*winget upgrade -e --id marlocarlo\.psmux/);
  });

  it("says when the version could not be read", () => {
    expect(psmuxStartupNote(null)).toMatch(/could not be read.*3\.4\.0/);
  });
});
