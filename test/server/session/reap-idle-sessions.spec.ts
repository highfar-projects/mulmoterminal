// @vitest-environment node
// What the server is allowed to end on its own (#1467).
//
// The rule this replaces asked "is it resumable" — live ∨ grid log ∨ transcript ∨ rollout — of
// which two limbs are permanent records: a transcript is never deleted and the grid log is
// append-only. So on the machine this was measured on, a sweep would have ended 2 of 22 sessions
// while 15 sat idle for hours with nobody attached. Everything below is about NOW instead.
import { describe, it, expect, vi } from "vitest";

import { reapIdleSessions, reapSweepLines, survivingAfterSweep, type ReapSweepInput } from "../../../server/session/reap-idle-sessions.js";
import { reapableTmuxSession, isRestorableSession } from "../../../server/infra/tmux.js";
import { DEFAULT_REAP_IDLE_DAYS, reapIdleSeconds } from "../../../common/sessionReap.js";

const NOW = 2_000_000;
const DAY = 24 * 60 * 60;
const STALE = NOW - 30 * DAY;

const input = (over: Partial<ReapSweepInput> = {}): ReapSweepInput => ({
  ids: [],
  activity: new Map(),
  attached: new Map(),
  nowSeconds: NOW,
  idleDays: DEFAULT_REAP_IDLE_DAYS,
  liveHere: () => false,
  kill: vi.fn(),
  ...over,
});

describe("reapableTmuxSession", () => {
  const facts = (over: Partial<Parameters<typeof reapableTmuxSession>[0]> = {}) => ({
    attachedCount: 0,
    liveHere: false,
    idleSeconds: 30 * DAY,
    idleThresholdSeconds: reapIdleSeconds(DEFAULT_REAP_IDLE_DAYS),
    ...over,
  });

  it("ends a session nobody is attached to that has been silent past the threshold", () => {
    expect(reapableTmuxSession(facts())).toBe(true);
  });

  it("spares one a terminal is holding", () => {
    expect(reapableTmuxSession(facts({ attachedCount: 1 }))).toBe(false);
  });

  // #747: another mulmoterminal may hold it, and a count tmux would not give us is not evidence
  // that nobody does. Killing on that guess is worse than the pile-up.
  it("spares one whose attach count tmux would not give", () => {
    expect(reapableTmuxSession(facts({ attachedCount: null }))).toBe(false);
  });

  it("spares one this process has a pty for, however long tmux thinks it has been quiet", () => {
    expect(reapableTmuxSession(facts({ liveHere: true, idleSeconds: 365 * DAY }))).toBe(false);
  });

  it("spares one whose age is unknown", () => {
    expect(reapableTmuxSession(facts({ idleSeconds: null }))).toBe(false);
  });

  it("spares one that was active within the threshold", () => {
    expect(reapableTmuxSession(facts({ idleSeconds: 6 * DAY }))).toBe(false);
  });

  // Zero is the off switch, and it has to hold even for a session idle for a year.
  it("ends nothing at all when the threshold is zero", () => {
    expect(reapableTmuxSession(facts({ idleThresholdSeconds: 0, idleSeconds: 365 * DAY }))).toBe(false);
  });
});

// The column #1479 got wrong: `live ∨ grid` was counted as restorable, so 20 of 22 rows claimed a
// conversation could be brought back when 15 could.
describe("isRestorableSession", () => {
  const none = new Set<string>();

  it("is restorable with a claude transcript on disk", () => {
    expect(isRestorableSession("s-1", new Set(["s-1"]), () => false)).toBe(true);
  });

  it("is restorable with a codex rollout", () => {
    expect(isRestorableSession("s-1", none, (id) => id === "s-1")).toBe(true);
  });

  it("is NOT restorable just because it once was a grid cell or is running now", () => {
    expect(isRestorableSession("shell-1", none, () => false)).toBe(false);
  });
});

describe("the boot sweep", () => {
  it("ends the stale ones and counts what it kept, and why", () => {
    const kill = vi.fn();
    const result = reapIdleSessions(
      input({
        ids: ["stale", "held", "fresh", "ours"],
        activity: new Map([
          ["stale", STALE],
          ["held", STALE],
          ["fresh", NOW - DAY],
          ["ours", STALE],
        ]),
        attached: new Map([["held", 1]]),
        liveHere: (id) => id === "ours",
        kill,
      }),
    );
    expect(kill.mock.calls.map((c) => c[0])).toEqual(["stale"]);
    expect(result).toEqual({ reaped: ["stale"], heldBack: 2, recent: 1 });
  });

  // `list-clients` reports only sessions that HAVE a client, so absent means zero — but a null map
  // (tmux itself could not answer) must not read the same way.
  it("treats an unanswerable attach list as everything being held", () => {
    const kill = vi.fn();
    const result = reapIdleSessions(input({ ids: ["stale"], activity: new Map([["stale", STALE]]), attached: null, kill }));
    expect(kill).not.toHaveBeenCalled();
    expect(result).toEqual({ reaped: [], heldBack: 1, recent: 0 });
  });

  it("does nothing whatsoever when the threshold is zero", () => {
    const kill = vi.fn();
    const result = reapIdleSessions(input({ ids: ["stale"], activity: new Map([["stale", STALE]]), idleDays: 0, kill }));
    expect(kill).not.toHaveBeenCalled();
    expect(result).toEqual({ reaped: [], heldBack: 0, recent: 0 });
  });
});

// A sweep that prints only what it killed leaves the reader unable to tell "nothing was old enough"
// from "it never ran" — which is the state #1467 was filed about.
describe("what the sweep says", () => {
  it("reports both what it ended and what it kept", () => {
    const lines = reapSweepLines({ reaped: ["a", "b"], heldBack: 6, recent: 12 }, 7).join("\n");
    expect(lines).toContain("ended 2 idle session(s)");
    expect(lines).toContain("kept 18: 6 in use, 12 active within 7 day(s)");
  });

  it("still says what it kept when it ended nothing", () => {
    expect(reapSweepLines({ reaped: [], heldBack: 1, recent: 2 }, 7).join("\n")).toContain("kept 3");
  });

  it("says it is off rather than silently doing nothing", () => {
    expect(reapSweepLines({ reaped: [], heldBack: 0, recent: 0 }, 0).join("\n")).toContain("off");
  });

  it("says nothing at all when there were no sessions to judge", () => {
    expect(reapSweepLines({ reaped: [], heldBack: 0, recent: 0 }, 7)).toEqual([]);
  });
});

// Boot reads the tmux list, sweeps, and THEN decides which settings and drop files are orphaned —
// from that same list. A file kept because its session was in it outlives the session by a whole
// boot, and a session settings file can hold a provider's API token (the reason the prune exists).
// Found reading the boot path during review; no bot flagged it.
describe("survivingAfterSweep", () => {
  it("drops what the sweep just ended", () => {
    expect([...survivingAfterSweep(["kept", "ended", "also-kept"], ["ended"])]).toEqual(["kept", "also-kept"]);
  });

  it("is the whole list when the sweep ended nothing", () => {
    expect([...survivingAfterSweep(["a", "b"], [])]).toEqual(["a", "b"]);
  });
});
