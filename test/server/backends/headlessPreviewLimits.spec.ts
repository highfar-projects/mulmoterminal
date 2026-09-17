// @vitest-environment node
//
// The budgets a headless run is allowed to spend, checked WITHOUT a browser.
//
// The contract test next door drives real Chrome and is skipped where none is installed — which is
// most review hosts and every CI job here. These numbers are what decides how long a user waits for
// an answer, so they are pinned somewhere that always runs.
import { describe, it, expect } from "vitest";
import { LIMITS } from "../../../server/backends/sharedApp/headlessPreview.js";

/** What Puppeteer uses when a navigation is given no timeout. Named here because it is the number
 *  the harness navigation used to inherit, not because anything should depend on it. */
const PUPPETEER_DEFAULT_NAVIGATION_MS = 30_000;

describe("LIMITS", () => {
  it("gives every wait a real duration", () => {
    for (const key of ["navigateMs", "evaluateMs", "readyMs", "settleMs"] as const) {
      expect(Number.isFinite(LIMITS[key]) && LIMITS[key] > 0, `${key} is not a duration: ${LIMITS[key]}`).toBe(true);
    }
  });

  it("keeps the harness navigation inside a budget of its own, not Puppeteer's default", () => {
    // The point of #2103: that one call inherited a number six times the budget the wait on the
    // line after it gets.
    expect(LIMITS.navigateMs).toBeLessThan(PUPPETEER_DEFAULT_NAVIGATION_MS);
  });

  it("makes every harness attempt together cost no more than ONE used to", () => {
    // openHarness retries, so a budget chosen per attempt multiplies. This is the property that
    // says the retry did not quietly become the slow path: three attempts at the new budget must
    // not outlast the single attempt the old default allowed.
    expect(LIMITS.harnessAttempts * LIMITS.navigateMs).toBeLessThanOrEqual(PUPPETEER_DEFAULT_NAVIGATION_MS);
  });

  it("does not starve the navigation relative to what it waits for next", () => {
    // Too small is the other failure, and this repo has paid for it once upstream: the navigation
    // is a page load, the wait after it is one function appearing, and a page load is the larger
    // of the two.
    expect(LIMITS.navigateMs).toBeGreaterThan(LIMITS.evaluateMs);
  });
});
