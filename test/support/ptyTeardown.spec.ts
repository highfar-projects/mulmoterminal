// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PTY_TEARDOWN_MARKER, killSignalsFor, psCaptureFromError, readPsProbe, teardownVerdict, type KillAttempt, type SurvivorFacts } from "./ptyTeardown";

const PS_LINE = "4242 4200 Ss 00:07 /bin/bash -i";

const linuxFacts = (overrides: Partial<SurvivorFacts> = {}): SurvivorFacts => ({
  platform: "linux",
  pid: 4242,
  shell: "/bin/bash",
  processState: { kind: "found", line: PS_LINE },
  ...overrides,
});

const hup = (ending: KillAttempt["ending"]): KillAttempt => ({ signal: "SIGHUP", ending });
const kill9 = (ending: KillAttempt["ending"]): KillAttempt => ({ signal: "SIGKILL", ending });

const reportOf = (attempts: KillAttempt[], facts: SurvivorFacts): string => {
  const verdict = teardownVerdict(attempts, facts);
  return verdict.kind === "clean" ? "" : verdict.report;
};

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

const ran = (exitCode: number | null, stdout: string, stderr: string) => ({ exitCode, stdout, stderr, failure: undefined });

describe("readPsProbe", () => {
  it("takes the line when ps printed one", () => {
    expect(readPsProbe(ran(0, `  ${PS_LINE}\n`, ""))).toEqual({ kind: "found", line: PS_LINE });
  });

  it("calls the pid absent only when ps ran and reported no such process", () => {
    expect(readPsProbe(ran(1, "", ""))).toEqual({ kind: "absent" });
    expect(readPsProbe(ran(1, "  \n", " \n"))).toEqual({ kind: "absent" });
  });

  it("does not mistake a ps that could not run for a vanished pid", () => {
    expect(readPsProbe({ exitCode: null, stdout: "", stderr: "", failure: "ENOENT" })).toEqual({ kind: "unavailable", detail: "ENOENT" });
    expect(readPsProbe({ exitCode: null, stdout: "", stderr: "", failure: "timed out after 5000ms" })).toEqual({
      kind: "unavailable",
      detail: "timed out after 5000ms",
    });
    expect(readPsProbe(ran(1, "", "ps: Invalid process id\nmore"))).toEqual({ kind: "unavailable", detail: "exit 1: ps: Invalid process id" });
    expect(readPsProbe(ran(127, "", ""))).toEqual({ kind: "unavailable", detail: "exit 127" });
    expect(readPsProbe(ran(null, "", ""))).toEqual({ kind: "unavailable", detail: "exit null" });
    expect(readPsProbe(ran(0, "", ""))).toEqual({ kind: "unavailable", detail: "exit 0" });
  });
});

describe("psCaptureFromError", () => {
  it("keeps ps's own exit status and output", () => {
    expect(psCaptureFromError({ code: 1, stdout: "", stderr: "" }, 5000)).toEqual({ exitCode: 1, stdout: "", stderr: "", failure: undefined });
  });

  it("names a ps that never ran by its error code", () => {
    expect(psCaptureFromError({ code: "ENOENT", message: "spawn /bin/ps ENOENT" }, 5000)).toEqual({
      exitCode: null,
      stdout: "",
      stderr: "",
      failure: "ENOENT",
    });
  });

  it("names a ps that was killed by the timeout", () => {
    expect(psCaptureFromError({ code: null, killed: true, signal: "SIGTERM", stdout: "", stderr: "" }, 5000).failure).toBe("timed out after 5000ms");
  });

  it("does not trust fields of the wrong type, or a thrown non-object", () => {
    expect(psCaptureFromError({ code: 1, stdout: 42, stderr: null }, 5000)).toEqual({ exitCode: 1, stdout: "", stderr: "", failure: undefined });
    expect(psCaptureFromError("boom", 5000)).toEqual({ exitCode: null, stdout: "", stderr: "", failure: undefined });
    expect(psCaptureFromError(undefined, 5000)).toEqual({ exitCode: null, stdout: "", stderr: "", failure: undefined });
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
    expect(reportOf([hup("still running"), kill9("exited")], linuxFacts())).toBe(
      `${PTY_TEARDOWN_MARKER} | shell pid 4242 | $SHELL=/bin/bash | survived SIGHUP | ps: ${PS_LINE}`,
    );
  });

  it("keeps a shell that went on its own after the grace apart from one that needed SIGKILL", () => {
    expect(teardownVerdict([hup("exited late")], linuxFacts()).kind).toBe("late");
    expect(reportOf([hup("exited late")], linuxFacts())).toBe(
      `${PTY_TEARDOWN_MARKER} | shell pid 4242 | $SHELL=/bin/bash | survived nothing | exited late after SIGHUP | ps: ${PS_LINE}`,
    );
    expect(teardownVerdict([hup("still running"), kill9("exited late")], linuxFacts()).kind).toBe("late");
  });

  it("fails a shell that outlived every signal, naming each one", () => {
    expect(teardownVerdict([hup("still running"), kill9("still running")], linuxFacts()).kind).toBe("survived");
    expect(reportOf([hup("still running"), kill9("still running")], linuxFacts())).toContain("survived SIGHUP, SIGKILL");
  });

  it("tells a vanished pid from a live one: gone from ps but never reported as exited", () => {
    expect(reportOf([hup("still running"), kill9("exited")], linuxFacts({ processState: { kind: "absent" } }))).toContain(
      "ps: no such process (gone before onExit arrived)",
    );
  });

  it("reports a ps that could not run as unavailable, never as a vanished pid", () => {
    const report = reportOf([hup("still running"), kill9("exited")], linuxFacts({ processState: { kind: "unavailable", detail: "ENOENT" } }));
    expect(report).toContain("ps: unavailable (ENOENT)");
    expect(report).not.toContain("no such process");
  });

  it("does not claim a vanished pid on Windows, where ps is never asked", () => {
    const facts = linuxFacts({ platform: "win32", processState: { kind: "unavailable", detail: "not asked on win32" } });
    expect(teardownVerdict([{ signal: undefined, ending: "still running" }], facts).kind).toBe("survived");
    expect(reportOf([{ signal: undefined, ending: "still running" }], facts)).toContain("survived kill()");
    expect(reportOf([{ signal: undefined, ending: "still running" }], facts)).toContain("ps: unavailable (not asked on win32)");
  });

  it("says so when $SHELL is unset rather than printing undefined", () => {
    const report = reportOf([hup("still running"), kill9("exited")], linuxFacts({ shell: undefined }));
    expect(report).toContain("$SHELL=(unset)");
    expect(report).not.toContain("undefined");
  });

  it("treats no attempt at all as a shell nobody got rid of", () => {
    expect(teardownVerdict([], linuxFacts()).kind).toBe("survived");
    expect(reportOf([], linuxFacts())).toContain("survived nothing");
  });
});
