// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PTY_TEARDOWN_MARKER, killSignalsFor, teardownVerdict, type KillAttempt, type SurvivorFacts } from "./ptyTeardown";

const linuxFacts = (overrides: Partial<SurvivorFacts> = {}): SurvivorFacts => ({
  platform: "linux",
  pid: 4242,
  shell: "/bin/bash",
  processState: "4242 4200 Ss 00:07 /bin/bash -i",
  ...overrides,
});

const hup = (ending: KillAttempt["ending"]): KillAttempt => ({ signal: "SIGHUP", ending });
const kill9 = (ending: KillAttempt["ending"]): KillAttempt => ({ signal: "SIGKILL", ending });

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

describe("teardownVerdict", () => {
  it("is clean when the first kill is enough, whatever the facts say", () => {
    expect(teardownVerdict([hup("exited")], linuxFacts())).toEqual({ kind: "clean" });
    expect(teardownVerdict([{ signal: undefined, ending: "exited" }], linuxFacts({ platform: "win32" }))).toEqual({ kind: "clean" });
  });

  it("reports an escalation that worked, with what the shell looked like when it outlived SIGHUP", () => {
    const verdict = teardownVerdict([hup("still running"), kill9("exited")], linuxFacts());
    expect(verdict.kind).toBe("escalated");
    expect(verdict.kind !== "clean" && verdict.report).toBe(
      `${PTY_TEARDOWN_MARKER} | shell pid 4242 | $SHELL=/bin/bash | survived SIGHUP | ps: 4242 4200 Ss 00:07 /bin/bash -i`,
    );
  });

  it("fails a shell that outlived every signal, naming each one", () => {
    const verdict = teardownVerdict([hup("still running"), kill9("still running")], linuxFacts());
    expect(verdict.kind).toBe("survived");
    expect(verdict.kind !== "clean" && verdict.report).toContain("survived SIGHUP, SIGKILL");
  });

  it("tells a vanished pid from a live one: gone from ps but never reported as exited", () => {
    const verdict = teardownVerdict([hup("still running"), kill9("exited")], linuxFacts({ processState: undefined }));
    expect(verdict.kind !== "clean" && verdict.report).toContain("ps: no such process (gone, but onExit never fired)");
  });

  it("does not claim a vanished pid on Windows, where ps is never asked", () => {
    const verdict = teardownVerdict([{ signal: undefined, ending: "still running" }], linuxFacts({ platform: "win32", processState: undefined }));
    expect(verdict.kind).toBe("survived");
    expect(verdict.kind !== "clean" && verdict.report).toContain("survived kill()");
    expect(verdict.kind !== "clean" && verdict.report).toContain("ps: not asked on win32");
  });

  it("says so when $SHELL is unset rather than printing undefined", () => {
    const verdict = teardownVerdict([hup("still running"), kill9("exited")], linuxFacts({ shell: undefined }));
    expect(verdict.kind !== "clean" && verdict.report).toContain("$SHELL=(unset)");
    expect(verdict.kind !== "clean" && verdict.report).not.toContain("undefined");
  });

  it("treats no attempt at all as a shell nobody got rid of", () => {
    const verdict = teardownVerdict([], linuxFacts());
    expect(verdict.kind).toBe("survived");
    expect(verdict.kind !== "clean" && verdict.report).toContain("survived nothing");
  });
});
