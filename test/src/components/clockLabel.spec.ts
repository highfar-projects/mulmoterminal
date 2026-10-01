import { describe, it, expect } from "vitest";
import { clockLabel } from "../../../src/components/clockLabel";

// Expectations are built from the same instant with the platform formatter, never as literals:
// the label is locale- and zone-dependent, and a literal would pass in one zone only.
const NOW = new Date(2026, 5, 15, 14, 30, 0, 0);
const now = (): Date => new Date(NOW.getTime());
const startOfToday = new Date(2026, 5, 15, 0, 0, 0, 0).getTime();
const timeOf = (ms: number): string => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dateOf = (ms: number): string => new Date(ms).toLocaleDateString([], { month: "numeric", day: "numeric" });
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

describe("clockLabel", () => {
  it("shows the time alone for a moment today, from midnight on", () => {
    [startOfToday, startOfToday + MINUTE_MS, NOW.getTime(), NOW.getTime() + DAY_MS].forEach((ms) => expect(clockLabel(ms, now)).toBe(timeOf(ms)));
  });

  it("adds the date for anything before today's midnight", () => {
    [startOfToday - 1, startOfToday - DAY_MS, 0].forEach((ms) => expect(clockLabel(ms, now)).toBe(`${dateOf(ms)} ${timeOf(ms)}`));
  });

  it("labels an instant the same whether it arrives as epoch ms or as a timestamp string", () => {
    // Generated across a week either side of the boundary: the two panes hand over different spellings.
    Array.from({ length: 200 }, (_, i) => startOfToday + (i - 100) * 3_600_000 + (i % 7)).forEach((ms) => {
      expect(clockLabel(new Date(ms).toISOString(), now)).toBe(clockLabel(ms, now));
    });
  });

  it("shows nothing for an absent or unparseable moment", () => {
    [null, Number.NaN, Number.POSITIVE_INFINITY, 8.64e15 + 1, "", "garbage", "2024-13-01T00:00:00Z"].forEach((at) => expect(clockLabel(at, now)).toBe(""));
  });

  it("reads the clock only for a moment that parsed", () => {
    let reads = 0;
    const counting = (): Date => {
      reads += 1;
      return now();
    };
    clockLabel(null, counting);
    clockLabel("garbage", counting);
    expect(reads).toBe(0);
    clockLabel(startOfToday, counting);
    expect(reads).toBe(1);
  });
});
