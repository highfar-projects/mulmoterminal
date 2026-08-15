// @vitest-environment node
import { describe, it, expect } from "vitest";
import path from "node:path";

import { resolveWatchDirs, shouldSchedule, isReloadableChange, restartPlan, PORT_IN_USE_EXIT_CODE } from "../../scripts/dev-server-config.js";

describe("resolveWatchDirs", () => {
  const root = "/repo";

  it("watches server/, common/ and bin/ by default (not just server/)", () => {
    const dirs = resolveWatchDirs({}, root);
    // Codex #734: the backend imports common/modelIds.ts and bin/update-check.js, so editing
    // those must reload too — server/ alone regresses `node --watch`'s dependency tracking.
    expect(dirs).toEqual([path.join(root, "server"), path.join(root, "common"), path.join(root, "bin")]);
  });

  it("overrides to a single absolute dir when DEV_SERVER_WATCH is set", () => {
    expect(resolveWatchDirs({ DEV_SERVER_WATCH: "/srv/watch-me" }, root)).toEqual([path.resolve("/srv/watch-me")]);
  });
});

describe("shouldSchedule", () => {
  it("schedules a bring-up when idle", () => {
    expect(shouldSchedule({ shuttingDown: false, restartPending: false })).toBe(true);
  });

  it("skips when a restart is already pending — collapses an overlapping crash + file-change to one spawn", () => {
    // Codex #734: without this, a crash landing inside the file-change debounce would spawn a
    // second backend and race the first onto port 34567 (EADDRINUSE).
    expect(shouldSchedule({ shuttingDown: false, restartPending: true })).toBe(false);
  });

  it("skips while shutting down", () => {
    expect(shouldSchedule({ shuttingDown: true, restartPending: false })).toBe(false);
    expect(shouldSchedule({ shuttingDown: true, restartPending: true })).toBe(false);
  });
});

describe("isReloadableChange", () => {
  it("reloads on source extensions", () => {
    for (const f of ["index.ts", "a.mjs", "b.js", "c.json", "dir/deep.ts"]) expect(isReloadableChange(f)).toBe(true);
  });

  it("ignores editor temp files, extensionless names, and non-strings", () => {
    for (const f of ["index.ts.swp", "4913", "README.md", ".DS_Store"]) expect(isReloadableChange(f)).toBe(false);
    expect(isReloadableChange(null)).toBe(false);
    expect(isReloadableChange(undefined)).toBe(false);
  });
});

// #1735: a second `yarn dev` on a taken port respawned a 113% CPU boot every 3-4 seconds for
// hours. The supervisor decided from how FAST the process died, and the backend does its whole
// setup before it binds — so a busy port took ~3s to fail, landed outside the fast-crash window,
// and reset the delay to its floor every time. The exponential backoff never fired once.
describe("restartPlan", () => {
  const plan = (over: Partial<Parameters<typeof restartPlan>[0]> = {}) =>
    restartPlan({ code: 1, signal: null, consecutiveFailures: 1, minDelayMs: 250, maxDelayMs: 4000, ...over });

  describe("a port that is already in use", () => {
    // Retrying cannot fix it, and every attempt re-runs setup that copies files into the user's
    // home — so this is the one exit the supervisor must NOT come back from.
    it("does not retry, however early or late in a run it happens", () => {
      for (const n of [1, 2, 50]) expect(plan({ code: PORT_IN_USE_EXIT_CODE, consecutiveFailures: n }).retry).toBe(false);
    });

    it("says what to do about it, since nothing will happen on its own", () => {
      const { reason } = plan({ code: PORT_IN_USE_EXIT_CODE });
      expect(reason).toContain("already in use");
      expect(reason).toContain("PORT=");
      // The way back: an edit re-arms the loop, and a dev who is not told that sees a dead server.
      expect(reason).toContain("retry");
    });

    it("is the code server/index.ts actually exits with", () => {
      // Kept in sync with PORT_IN_USE_EXIT_CODE in server/infra/server-exit.ts, which bin/ also
      // reads. A drift here turns the rule above into a no-op that still passes its own tests.
      expect(PORT_IN_USE_EXIT_CODE).toBe(75);
    });
  });

  describe("any other exit", () => {
    it("comes back at the floor the first time", () => {
      expect(plan({ consecutiveFailures: 1 })).toMatchObject({ retry: true, delayMs: 250 });
    });

    // The actual regression: these are all SLOW crashes, which the old elapsed-time test read as
    // one-offs. Backing off is now a function of the count, so it fires regardless of timing.
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
});
