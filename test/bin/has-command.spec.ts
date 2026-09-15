// @vitest-environment node
//
// The start-up probe. Two bugs live here, and both are about platforms or inputs the developer's
// own machine does not produce, so both branches are driven explicitly:
//
//   1. the command can be a `<AGENT>_BIN` the USER set (#2082) — it must never be interpreted
//   2. an npm-installed tool on Windows is a `.cmd`, which `execFileSync` cannot launch at all
//
// The Windows rules are exercised from any host by injecting `platform`, `env` and the filesystem
// probe. reveal-argv.spec.ts makes the same argument: the interesting branch is the one this
// machine cannot run.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasCommand } from "../../bin/has-command.js";

/** A fake disk: every listed path is an executable file, nothing else exists.
 *
 *  CASE-INSENSITIVE, because the thing it doubles is. PATHEXT yields `.CMD` while npm writes
 *  `codex.cmd`, and on a real Windows volume those are one file — a double that compared exactly
 *  reported the .cmd shim missing, which is the very bug under test wearing the harness's clothes. */
const diskWith = (...files: string[]) => {
  const known = new Set(files.map((f) => f.toLowerCase()));
  const here = (candidate: string) => known.has(candidate.toLowerCase());
  return { isFile: here, isExecutable: here };
};

describe("hasCommand — Windows, which no developer here runs", () => {
  const env = { PATH: "C:\\tools;C:\\npm", PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  const win = (cmd: string, ...files: string[]) => hasCommand(cmd, { platform: "win32", env, probe: diskWith(...files) });

  // THE REGRESSION. `codex` installed by npm on Windows IS `codex.cmd`, and the argv probe that
  // replaced the shell one could not launch a .cmd — so it reported a working install as missing.
  it("finds a bare name that is really a .cmd shim", () => {
    expect(win("codex", "C:\\npm\\codex.cmd")).toBe(true);
  });

  it.each([
    [".EXE", "C:\\tools\\gh.EXE"],
    [".BAT", "C:\\tools\\gh.BAT"],
    [".COM", "C:\\tools\\gh.COM"],
  ])("finds a bare name through a %s in PATHEXT", (_ext, file) => {
    expect(win("gh", file)).toBe(true);
  });

  it("honours a PATHEXT the environment actually sets, not a hardcoded list", () => {
    const probe = diskWith("C:\\tools\\thing.PS1");
    expect(hasCommand("thing", { platform: "win32", env: { PATH: "C:\\tools", PATHEXT: ".PS1" }, probe })).toBe(true);
    expect(hasCommand("thing", { platform: "win32", env: { PATH: "C:\\tools", PATHEXT: ".EXE" }, probe })).toBe(false);
  });

  it("answers false when nothing in PATH matches under any extension", () => {
    expect(win("nowhere", "C:\\tools\\other.EXE")).toBe(false);
  });

  // A name that already carries its extension must be found as ITSELF, not as `gh.exe.EXE`.
  it("finds a name that already has its extension", () => {
    expect(win("C:\\tools\\gh.exe", "C:\\tools\\gh.exe")).toBe(true);
  });

  // Windows has no meaningful execute bit; the extension is what decides. A probe that demanded
  // one would report every .cmd missing, which is the bug wearing different clothes.
  it("does not require an execute bit on Windows", () => {
    const noExecBit = { isFile: (c: string) => c.toLowerCase() === "c:\\npm\\codex.cmd", isExecutable: () => false };
    expect(hasCommand("codex", { platform: "win32", env, probe: noExecBit })).toBe(true);
  });
});

describe("hasCommand — POSIX", () => {
  const env = { PATH: "/usr/bin:/opt/bin" };
  const posix = (cmd: string, ...files: string[]) => hasCommand(cmd, { platform: "linux", env, probe: diskWith(...files) });

  it("finds a bare name on PATH", () => {
    expect(posix("git", "/usr/bin/git")).toBe(true);
  });

  it("requires the execute bit, unlike Windows", () => {
    const notExecutable = { isFile: (c: string) => c === "/usr/bin/git", isExecutable: () => false };
    expect(hasCommand("git", { platform: "linux", env, probe: notExecutable })).toBe(false);
  });

  // cmd.exe searches the working directory; POSIX shells deliberately do not, and a probe that did
  // would find a `./git` dropped in a checkout.
  it("does not search the working directory", () => {
    expect(posix("git", "git")).toBe(false);
  });

  // An empty name must not join to the DIRECTORY and match it. Declared as `/usr/bin` exactly,
  // because that is what `join("/usr/bin", "")` produces — with a trailing slash the assertion
  // passed whether or not the guard existed, which a mutation sweep caught.
  it("answers false for an empty name rather than matching the PATH directory itself", () => {
    expect(posix("", "/usr/bin")).toBe(false);
  });
});

describe("hasCommand — against the real filesystem", () => {
  let dir: string;
  let spaced: string;
  let probe: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "has-command-"));
    // A space, because `/Applications/…` has one and the shell probe refused exactly this.
    spaced = path.join(dir, "My Tools");
    mkdirSync(spaced, { recursive: true });
    probe = path.join(spaced, "faux-agent");
    writeFileSync(probe, "#!/bin/sh\nexit 0\n", "utf8");
    chmodSync(probe, 0o755);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("finds a real executable whose path contains a space", () => {
    expect(hasCommand(probe)).toBe(true);
  });

  it("answers false for a path that is not there", () => {
    expect(hasCommand(path.join(spaced, "definitely-not-installed"))).toBe(false);
  });

  // Nothing is executed at ANY point, so a metacharacter is just a filename that does not exist.
  // This is the injection guard, and it is now true by construction rather than by escaping.
  it.each([
    ["a semicolon", "true; touch /tmp/mt-has-command-PWNED"],
    ["a pipe", "true | touch /tmp/x"],
    ["a substitution", "$(touch /tmp/x)"],
  ])("treats %s as a filename, not as syntax", (_label, cmd) => {
    expect(hasCommand(cmd)).toBe(false);
    expect(hasCommand(cmd, { platform: "linux", env: { PATH: "/usr/bin" }, probe: diskWith() })).toBe(false);
  });

  it("answers false for a directory, which is a file that is not a file", () => {
    expect(hasCommand(spaced)).toBe(false);
  });
});
