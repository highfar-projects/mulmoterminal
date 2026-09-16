// @vitest-environment node
//
// The shared crash-restart decision (bin/server-restart-policy.js), used by both the production
// launcher and the dev supervisor. See test/scripts/dev-server-config.spec.ts for the #1735 story
// this policy exists to get right — this spec only pins the shared function's own contract.
import { describe, it, expect } from "vitest";
import { restartPlan } from "../../bin/server-restart-policy.js";

const PORT_IN_USE = 75;
const plan = (over: Partial<Parameters<typeof restartPlan>[0]> = {}) =>
  restartPlan({ code: 1, signal: null, consecutiveFailures: 1, minDelayMs: 250, maxDelayMs: 4000, portInUseCode: PORT_IN_USE, ...over });

describe("a port that is already in use", () => {
  // Retrying cannot fix it, and every attempt re-runs setup that copies files into the user's
  // home — so this is the one exit the caller must NOT come back from.
  it("does not retry, however early or late in a run it happens", () => {
    for (const n of [1, 2, 50]) expect(plan({ code: PORT_IN_USE, consecutiveFailures: n }).retry).toBe(false);
  });

  it("says what to do about it, since nothing will happen on its own", () => {
    const { reason } = plan({ code: PORT_IN_USE });
    expect(reason).toContain("already in use");
    expect(reason).toContain("PORT=");
  });

  // A caller's own copy of the exit code, not something this file could import: bin/ ships in the
  // published package and scripts/ does not, so the code lives wherever server/index.ts's own
  // exit is pinned for THAT caller, and only gets handed in here.
  it("is decided entirely by what the caller passes as portInUseCode", () => {
    expect(plan({ code: 99, portInUseCode: 99 }).retry).toBe(false);
    expect(plan({ code: 75, portInUseCode: 99 }).retry).toBe(true);
  });
});

describe("any other exit", () => {
  it("comes back at the floor the first time", () => {
    expect(plan({ consecutiveFailures: 1 })).toMatchObject({ retry: true, delayMs: 250 });
  });

  // These are all SLOW crashes — the regression this policy exists to avoid read them as one-offs
  // when the decision was made from elapsed time instead of a consecutive-failure count.
  it("doubles per consecutive failure and caps", () => {
    const delays = [1, 2, 3, 4, 5, 6].map((n) => plan({ consecutiveFailures: n }).delayMs);
    expect(delays).toEqual([250, 500, 1000, 2000, 4000, 4000]);
  });

  it("names the loop only once there is one", () => {
    expect(plan({ consecutiveFailures: 1 }).reason).not.toContain("in a row");
    expect(plan({ consecutiveFailures: 3 }).reason).toContain("3 in a row");
  });

  it("reports a signal as a signal", () => {
    expect(plan({ code: null, signal: "SIGSEGV" }).reason).toContain("signal SIGSEGV");
    expect(plan({ code: 1, signal: null }).reason).toContain("code 1");
  });

  it("never returns a delay outside the bounds it was given", () => {
    for (const n of [0, 1, 7, 99]) {
      const { delayMs } = plan({ consecutiveFailures: n });
      expect(delayMs).toBeGreaterThanOrEqual(250);
      expect(delayMs).toBeLessThanOrEqual(4000);
    }
  });
});
