import { describe, it, expect } from "vitest";
import { accountSwitchChoices } from "../../../src/composables/accountSwitchChoices";
import type { AccountReading } from "../../../src/composables/rateLimitGauge";
import { DEFAULT_LOGIN_ID, DEFAULT_LOGIN_LABEL, type TokenRotation } from "../../../common/tokenRotation";

const NOW_MS = 1_000_000_000_000;
const NOW_SEC = NOW_MS / 1000;

const rotation = (over: Partial<TokenRotation> = {}): TokenRotation => ({
  enabled: true,
  includeDefaultLogin: false,
  tokens: [
    { id: "a", label: "A", email: "a@example.com" },
    { id: "b", label: "B" },
  ],
  ...over,
});

const reading = (id: string, over: Partial<AccountReading> = {}): AccountReading => ({ id, label: id, agent: "claude", limits: null, rotation: true, ...over });
const weekly = (usedPercentage: number, resetsAt_sec: number | null = NOW_SEC + 3600) => ({ fiveHour: null, sevenDay: { usedPercentage, resetsAt_sec } });

describe("accountSwitchChoices (#2950)", () => {
  it("lists the tokens and marks the current one", () => {
    expect(accountSwitchChoices(rotation(), "b", [], NOW_MS).map(({ id, label, detail, current }) => ({ id, label, detail, current }))).toEqual([
      { id: "a", label: "A", detail: "a@example.com", current: false },
      { id: "b", label: "B", detail: null, current: true },
    ]);
  });

  it("adds the /login credential only when it takes part", () => {
    const choices = accountSwitchChoices(rotation({ includeDefaultLogin: true }), DEFAULT_LOGIN_ID, [], NOW_MS);
    expect(choices.at(-1)).toMatchObject({ id: DEFAULT_LOGIN_ID, label: DEFAULT_LOGIN_LABEL, detail: null, current: true });
    expect(accountSwitchChoices(rotation(), "a", [], NOW_MS).map((choice) => choice.id)).toEqual(["a", "b"]);
  });

  it("offers nothing with rotation off or for a cell not on a rotated token", () => {
    expect(accountSwitchChoices(rotation({ enabled: false }), "a", [], NOW_MS)).toEqual([]);
    expect(accountSwitchChoices(rotation(), null, [], NOW_MS)).toEqual([]);
  });

  describe("weekly room (#2954)", () => {
    it("carries what is left of the weekly window", () => {
      const [a] = accountSwitchChoices(rotation(), "b", [reading("a", { limits: weekly(37.4) })], NOW_MS);
      expect(a).toMatchObject({ weekLeftPercent: 62, usage: "ok" });
    });

    it("says not measured, rather than zero, for a subscription with no reading", () => {
      expect(accountSwitchChoices(rotation(), "b", [], NOW_MS)[0]).toMatchObject({ weekLeftPercent: null, usage: "measuring" });
    });

    it("reports a subscription at its usage limit", () => {
      const at = reading("a", { probe: "no-report", probeStall: "usage-limit" });
      expect(accountSwitchChoices(rotation(), "b", [at], NOW_MS)[0]).toMatchObject({ weekLeftPercent: null, usage: "at-limit" });
    });

    it("counts a window whose reset has passed as full", () => {
      const [a] = accountSwitchChoices(rotation(), "b", [reading("a", { limits: weekly(90, NOW_SEC - 1) })], NOW_MS);
      expect(a?.weekLeftPercent).toBe(100);
    });

    it("ignores readings that are accounts, not rotation tokens", () => {
      const account = reading("a", { rotation: false, limits: weekly(10) });
      expect(accountSwitchChoices(rotation(), "b", [account], NOW_MS)[0]).toMatchObject({ weekLeftPercent: null, usage: "measuring" });
    });
  });
});
