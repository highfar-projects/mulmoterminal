import { describe, it, expect } from "vitest";
import {
  DEFAULT_USAGE_PROBE_INTERVAL_MINUTES,
  MAX_USAGE_PROBE_INTERVAL_MINUTES,
  MIN_USAGE_PROBE_INTERVAL_MINUTES,
  USAGE_GAUGE_DEFAULT,
  sanitizeUsageGauge,
  sanitizeUsageProbeIntervalMinutes,
} from "../../common/usageGauge";

// #3153. The gauge stays on unless the config says `false`; the interval is whole minutes in range.
describe("sanitizeUsageGauge", () => {
  it("is on by default, and takes a boolean as written", () => {
    expect(USAGE_GAUGE_DEFAULT).toBe(true);
    expect(sanitizeUsageGauge(true)).toBe(true);
    expect(sanitizeUsageGauge(false)).toBe(false);
  });

  it("reads anything else as unconfigured", () => {
    [undefined, null, "false", 0, {}].forEach((value) => expect(sanitizeUsageGauge(value)).toBe(true));
  });
});

describe("sanitizeUsageProbeIntervalMinutes", () => {
  it("keeps a whole number of minutes in range", () => {
    expect(sanitizeUsageProbeIntervalMinutes(30)).toBe(30);
    expect(sanitizeUsageProbeIntervalMinutes(MIN_USAGE_PROBE_INTERVAL_MINUTES)).toBe(MIN_USAGE_PROBE_INTERVAL_MINUTES);
    expect(sanitizeUsageProbeIntervalMinutes(MAX_USAGE_PROBE_INTERVAL_MINUTES)).toBe(MAX_USAGE_PROBE_INTERVAL_MINUTES);
  });

  it("rounds, and clamps to the range", () => {
    expect(sanitizeUsageProbeIntervalMinutes(12.6)).toBe(13);
    expect(sanitizeUsageProbeIntervalMinutes(1)).toBe(MIN_USAGE_PROBE_INTERVAL_MINUTES);
    expect(sanitizeUsageProbeIntervalMinutes(MAX_USAGE_PROBE_INTERVAL_MINUTES + 1)).toBe(MAX_USAGE_PROBE_INTERVAL_MINUTES);
  });

  it("reads anything that is not a positive number as the default", () => {
    [undefined, null, "30", 0, -5, Number.NaN, Number.POSITIVE_INFINITY, {}].forEach((value) =>
      expect(sanitizeUsageProbeIntervalMinutes(value)).toBe(DEFAULT_USAGE_PROBE_INTERVAL_MINUTES),
    );
  });
});
