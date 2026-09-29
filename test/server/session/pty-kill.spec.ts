// @vitest-environment node
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { IPty } from "node-pty";
import { killSignalsFor } from "../../../server/session/pty-kill-plan.js";
import { killPty, ptyHasExited, trackPtyExit, PTY_KILL_GRACE_MS, type SignalGroup } from "../../../server/session/pty-kill.js";

interface FakePty {
  term: Pick<IPty, "pid" | "kill" | "onExit">;
  signals: (string | undefined)[];
  exit: () => void;
}

type ExitListener = (event: { exitCode: number; signal?: number }) => void;

function fakePty(options: { throwsOnKill?: boolean } = {}): FakePty {
  const signals: (string | undefined)[] = [];
  const exitListeners: ExitListener[] = [];
  const term: Pick<IPty, "pid" | "kill" | "onExit"> = {
    pid: 4242,
    kill: (signal?: string) => {
      signals.push(signal);
      if (options.throwsOnKill === true) throw new Error("Signals not supported on windows.");
    },
    onExit: (listener: ExitListener) => {
      exitListeners.push(listener);
      return { dispose: () => {} };
    },
  };
  return { term, signals, exit: () => exitListeners.forEach((listener) => listener({ exitCode: 0 })) };
}

describe("killSignalsFor", () => {
  it("escalates from SIGHUP to SIGKILL on POSIX", () => {
    expect(killSignalsFor("linux")).toEqual(["SIGHUP", "SIGKILL"]);
    expect(killSignalsFor("darwin")).toEqual(["SIGHUP", "SIGKILL"]);
    expect(killSignalsFor("freebsd")).toEqual(["SIGHUP", "SIGKILL"]);
  });

  it("sends one bare kill on Windows, where node-pty throws on any signal", () => {
    expect(killSignalsFor("win32")).toEqual([undefined]);
  });
});

describe("killPty", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends SIGHUP, and nothing more when the program exits within the grace", () => {
    const pty = fakePty();
    trackPtyExit(pty.term);
    killPty(pty.term, { label: "session s1", platform: "linux" });
    expect(pty.signals).toEqual(["SIGHUP"]);
    pty.exit();
    vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
    expect(pty.signals).toEqual(["SIGHUP"]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("sends SIGKILL to a program that outlived SIGHUP's grace, and says so", () => {
    const pty = fakePty();
    trackPtyExit(pty.term);
    killPty(pty.term, { label: "session s1", platform: "linux" });
    vi.advanceTimersByTime(PTY_KILL_GRACE_MS - 1);
    expect(pty.signals).toEqual(["SIGHUP"]);
    vi.advanceTimersByTime(1);
    expect(pty.signals).toEqual(["SIGHUP", "SIGKILL"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("session s1 (pid 4242)"));
  });

  it("stops after the last signal rather than repeating it", () => {
    const pty = fakePty();
    trackPtyExit(pty.term);
    killPty(pty.term, { label: "session s1", platform: "linux", graceMs: 10 });
    vi.advanceTimersByTime(1_000);
    expect(pty.signals).toEqual(["SIGHUP", "SIGKILL"]);
  });

  it("signals nothing at all for a pty that has already exited", () => {
    const pty = fakePty();
    trackPtyExit(pty.term);
    pty.exit();
    killPty(pty.term, { label: "session s1", platform: "linux" });
    vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
    expect(pty.signals).toEqual([]);
  });

  // The reason exit is tracked from the SPAWN: reap runs from onExit, so a listener added at kill
  // time would never fire and the SIGKILL would go to whatever now holds the pid.
  it("remembers an exit that happened before the kill was asked for", () => {
    const pty = fakePty();
    trackPtyExit(pty.term);
    pty.exit();
    expect(ptyHasExited(pty.term)).toBe(true);
  });

  it("sends one bare kill on Windows and never schedules an escalation", () => {
    const pty = fakePty({ throwsOnKill: false });
    trackPtyExit(pty.term);
    killPty(pty.term, { label: "command cell", platform: "win32" });
    vi.advanceTimersByTime(PTY_KILL_GRACE_MS * 10);
    expect(pty.signals).toEqual([undefined]);
  });

  it("swallows a kill that throws, and still escalates", () => {
    const pty = fakePty({ throwsOnKill: true });
    trackPtyExit(pty.term);
    expect(() => killPty(pty.term, { label: "session s1", platform: "linux" })).not.toThrow();
    expect(() => vi.advanceTimersByTime(PTY_KILL_GRACE_MS)).not.toThrow();
    expect(pty.signals).toEqual(["SIGHUP", "SIGKILL"]);
  });

  describe("with scope: group", () => {
    const errorWithCode = (code: string): Error => Object.assign(new Error(code), { code });

    // A group whose members are listed by `alive`; signal 0 asks, anything else is recorded.
    function fakeGroup(alive: { members: boolean; code?: string }) {
      const sent: (string | number)[] = [];
      const signalGroup: SignalGroup = (pgid, signal) => {
        if (signal === 0) {
          if (!alive.members) throw errorWithCode(alive.code ?? "ESRCH");
          return;
        }
        sent.push(`${pgid}:${signal}`);
      };
      return { sent, signalGroup };
    }

    // The case the process scope misses: the wrapper shell goes on SIGHUP, the command it
    // started ignores it and stays in the group.
    it("SIGKILLs the group when its program exited but something it started is still in it", () => {
      const pty = fakePty();
      trackPtyExit(pty.term);
      const group = fakeGroup({ members: true });
      killPty(pty.term, { label: "command cell", scope: "group", platform: "linux", signalGroup: group.signalGroup });
      expect(pty.signals).toEqual(["SIGHUP"]);
      pty.exit();
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
      expect(group.sent).toEqual(["4242:SIGKILL"]);
      expect(pty.signals).toEqual(["SIGHUP"]);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("command cell (process group 4242)"));
    });

    it("sends nothing when the group has emptied", () => {
      const pty = fakePty();
      trackPtyExit(pty.term);
      const group = fakeGroup({ members: false });
      killPty(pty.term, { label: "command cell", scope: "group", platform: "linux", signalGroup: group.signalGroup });
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
      expect(group.sent).toEqual([]);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("treats EPERM as a member still there, and any other error as none", () => {
      const eperm = fakePty();
      const permitted = fakeGroup({ members: false, code: "EPERM" });
      killPty(eperm.term, { label: "command cell", scope: "group", platform: "linux", signalGroup: permitted.signalGroup });
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
      expect(permitted.sent).toEqual(["4242:SIGKILL"]);

      const other = fakePty();
      const weird = fakeGroup({ members: false, code: "EINVAL" });
      killPty(other.term, { label: "command cell", scope: "group", platform: "linux", signalGroup: weird.signalGroup });
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
      expect(weird.sent).toEqual([]);
    });

    it("still sends nothing at all to a pty that exited before the kill", () => {
      const pty = fakePty();
      trackPtyExit(pty.term);
      pty.exit();
      const group = fakeGroup({ members: true });
      killPty(pty.term, { label: "command cell", scope: "group", platform: "linux", signalGroup: group.signalGroup });
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS);
      expect(pty.signals).toEqual([]);
      expect(group.sent).toEqual([]);
    });

    it("never escalates on Windows, group or not", () => {
      const pty = fakePty();
      const group = fakeGroup({ members: true });
      killPty(pty.term, { label: "command cell", scope: "group", platform: "win32", signalGroup: group.signalGroup });
      vi.advanceTimersByTime(PTY_KILL_GRACE_MS * 10);
      expect(pty.signals).toEqual([undefined]);
      expect(group.sent).toEqual([]);
    });
  });
});
