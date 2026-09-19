// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  planAfterServerExit,
  PORT_IN_USE_EXIT_CODE,
  RESTART_MIN_DELAY_MS,
  RESTART_MAX_DELAY_MS,
  MAX_CONSECUTIVE_RESTARTS,
} from "../../bin/server-supervision.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// A server that HAS served and has just failed once — the ordinary crash this exists for. Each
// case below names only what it changes, so what a case is about is what you can read in it.
const plan = (exit: Partial<Parameters<typeof planAfterServerExit>[0]> = {}) =>
  planAfterServerExit({ code: 1, signal: null, everServed: true, consecutiveFailures: 1, ...exit });

describe("planAfterServerExit", () => {
  describe("the exits that must NOT be restarted", () => {
    it("reports a taken port instead of retrying it — a port that is taken stays taken", () => {
      expect(plan({ code: PORT_IN_USE_EXIT_CODE }).action).toBe("port-in-use");
      // Even mid-crash-loop: the caller has a message naming who holds the port, and no count
      // changes that answer.
      expect(plan({ code: PORT_IN_USE_EXIT_CODE, consecutiveFailures: 3, everServed: false }).action).toBe("port-in-use");
    });

    it("treats a clean exit as the stop somebody asked for", () => {
      // `mulmoterminal stop` and the browser's Stop button both SIGTERM the server, whose handler
      // exits 0. Restarting this is the product's own stop button not stopping it.
      const stopped = plan({ code: 0 });
      expect(stopped.action).toBe("stop");
      expect(stopped.reason).toBeNull(); // nothing to explain: the user asked for it
    });

    it("treats a termination signal as a stop, SIGKILL included", () => {
      // `kill -9 <pid>` is what bin/stop.js prints for a server that will not stop on its own, and
      // the pid it prints is the server child's — a restart there defeats that escape hatch.
      for (const signal of ["SIGTERM", "SIGINT", "SIGKILL", "SIGHUP", "SIGQUIT"]) {
        const ended = plan({ code: null, signal });
        expect(ended.action, signal).toBe("stop");
        expect(ended.reason, signal).toContain(signal);
      }
    });

    it("does not restart a server that never reached the port", () => {
      // Nothing was serving, so there is no browser session to bring back — and the same boot
      // fails the same way. This is what keeps a bad config out of a respawn loop.
      const gaveUp = plan({ everServed: false });
      expect(gaveUp.action).toBe("stop");
      expect(gaveUp.reason).toContain("without ever reaching the port");
    });

    it("gives up once the failures in a row pass the cap", () => {
      expect(plan({ consecutiveFailures: MAX_CONSECUTIVE_RESTARTS }).action).toBe("restart");
      const gaveUp = plan({ consecutiveFailures: MAX_CONSECUTIVE_RESTARTS + 1 });
      expect(gaveUp.action).toBe("stop");
      expect(gaveUp.reason).toContain("in a row");
    });
  });

  describe("the exits that ARE restarted", () => {
    it("restarts a crash the server exited on", () => {
      const again = plan({ code: 1 });
      expect(again.action).toBe("restart");
      expect(again.reason).toContain("code 1");
    });

    it("restarts the signals a crashing process raises on itself", () => {
      // Node aborts on out-of-memory (SIGABRT), and a native addon — node-pty here — can take the
      // process down with SIGSEGV or SIGBUS. Those are the crashes worth coming back from.
      for (const signal of ["SIGABRT", "SIGSEGV", "SIGBUS", "SIGILL", "SIGFPE", "SIGTRAP"]) {
        const again = plan({ code: null, signal });
        expect(again.action, signal).toBe("restart");
        expect(again.reason, signal).toContain(signal);
      }
    });

    it("comes back at the floor first, then doubles", () => {
      expect(plan({ consecutiveFailures: 1 }).delayMs).toBe(RESTART_MIN_DELAY_MS);
      expect(plan({ consecutiveFailures: 2 }).delayMs).toBe(RESTART_MIN_DELAY_MS * 2);
      expect(plan({ consecutiveFailures: 3 }).delayMs).toBe(RESTART_MIN_DELAY_MS * 4);
    });

    it("stops doubling at the ceiling, which the last allowed attempt reaches", () => {
      // The second assertion is the one worth having. A ceiling the doubling never reaches is a
      // line nothing executes: it passed every test here while doing nothing, and only a mutation
      // that DELETED it — and stayed green — showed that. Raising the ceiling or lowering the cap
      // puts it back in that state, and this is what says so.
      expect(plan({ consecutiveFailures: MAX_CONSECUTIVE_RESTARTS }).delayMs).toBe(RESTART_MAX_DELAY_MS);
      expect(RESTART_MIN_DELAY_MS * 2 ** (MAX_CONSECUTIVE_RESTARTS - 1)).toBeGreaterThan(RESTART_MAX_DELAY_MS);
    });

    it("says how long it is waiting and that terminals come back", () => {
      const again = plan({ consecutiveFailures: 2 });
      expect(again.reason).toContain(`${RESTART_MIN_DELAY_MS * 2}ms`);
      expect(again.reason).toContain("tmux");
    });
  });

  describe("abnormal input", () => {
    it("never returns a delay for an action that is not a restart", () => {
      for (const exit of [{ code: PORT_IN_USE_EXIT_CODE }, { code: 0 }, { code: null, signal: "SIGTERM" }, { everServed: false }]) {
        expect(plan(exit).delayMs).toBe(0);
      }
    });

    it("names an unknown signal rather than assuming it was a crash", () => {
      // Not on either list. Stopping is the conservative answer: a restart that should not have
      // happened is a server the user cannot get rid of.
      const ended = plan({ code: null, signal: "SIGUSR2" });
      expect(ended.action).toBe("stop");
      expect(ended.reason).toContain("SIGUSR2");
    });

    it("describes an exit with neither a code nor a signal without printing undefined", () => {
      const ended = plan({ code: null, signal: null });
      expect(ended.action).toBe("restart");
      expect(ended.reason).toContain("code null");
      expect(ended.reason).not.toContain("undefined");
    });
  });
});

// The launcher is a plain .js entry point run by bare node, so nothing type-checks the wiring
// between it and this module. Reading the file is the only thing that can.
describe("the contract with bin/mulmoterminal.js", () => {
  const launcher = readFileSync(path.join(REPO_ROOT, "bin", "mulmoterminal.js"), "utf8");
  // The anchor is asserted before anything is asserted ABOUT it: a negative match on text that
  // has since been renamed passes while checking nothing, which is the failure mode of every
  // source-text guard.
  const closeHandler = launcher.match(/server\.on\("close"[\s\S]*?\n {4}\}\);/);

  it("still has a close handler to make claims about", () => {
    expect(closeHandler, "the server's close handler moved or was renamed — this guard is now blind").not.toBeNull();
  });

  it("reports the exit instead of leaving on it", () => {
    // The defect this fixes: `server.on("close", …)` ran process.exit for everything but 75, so a
    // crash took the launcher with it while `yarn dev` restarted the same backend (#2162).
    expect(closeHandler?.[0]).not.toMatch(/process\.exit/);
    expect(launcher).toMatch(/planAfterServerExit\(/);
  });
});
