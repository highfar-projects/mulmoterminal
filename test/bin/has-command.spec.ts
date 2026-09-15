// @vitest-environment node
//
// The start-up probe. Its own spec because the rule it enforces is a SECURITY and CORRECTNESS one
// that was invisible while the function lived inside the launcher: the command it runs can be a
// `<AGENT>_BIN` the user set (#2082), so a shell would both split it and interpret it.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { hasCommand } from "../../bin/has-command.js";

let dir: string;
/** A directory with a SPACE in it, which is the ordinary case: `/Applications/…` has one. */
let spaced: string;
let probe: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "has-command-"));
  spaced = path.join(dir, "My Tools");
  mkdirSync(spaced, { recursive: true });
  probe = path.join(spaced, "faux-agent");
  writeFileSync(probe, '#!/bin/sh\necho "faux 1.0"\n', "utf8");
  chmodSync(probe, 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("hasCommand", () => {
  it("finds a real executable whose path contains a space", () => {
    expect(hasCommand(probe)).toBe(true);
  });

  it("answers false for something that is not there, rather than throwing", () => {
    expect(hasCommand(path.join(spaced, "definitely-not-installed"))).toBe(false);
  });

  // THE REGRESSION GUARD. With `execSync(`${cmd} ${args}`)` this shell metacharacter ran, so the
  // probe executed whatever the override said. Asserted by SIDE EFFECT rather than by return
  // value: the return is false either way, so only the file proves which happened.
  it("does not let a shell metacharacter in the command execute", () => {
    const marker = path.join(dir, "EXECUTED");
    expect(hasCommand(`true; touch ${marker}`)).toBe(false);
    expect(existsSync(marker), "a shell ran the injected command").toBe(false);
  });

  it("does not let a pipe or a substitution execute either", () => {
    const marker = path.join(dir, "EXECUTED2");
    expect(hasCommand(`true | touch ${marker}`)).toBe(false);
    expect(hasCommand(`$(touch ${marker})`)).toBe(false);
    expect(existsSync(marker)).toBe(false);
  });

  // The near-miss half: the guard must not be passing simply because nothing ever runs. This proves
  // the SAME injected string DOES execute under a shell, so the assertions above mean something.
  // The marker is QUOTED here and nowhere else in this file, which is its own small joke: the test
  // demonstrating that a shell splits on spaces would itself split on one if `os.tmpdir()` had a
  // space in it (Codex, C-bis of #2084). The assertions above need no quoting — they are proving
  // that nothing reaches a shell at all.
  it("proves the guard is not vacuous — the same string executes under a shell", () => {
    const marker = path.join(dir, "SHELL_PROOF");
    execSync(`true; touch '${marker}'`, { stdio: "pipe" });
    expect(existsSync(marker), "the shell form really does execute it").toBe(true);
  });

  // `powershell.exe -NoProfile -Command exit` is three arguments. One string would hand it one.
  it("passes each argument separately", () => {
    const seen: string[][] = [];
    const spy = ((cmd: string, args: string[]) => {
      seen.push([cmd, ...args]);
      return Buffer.from("");
    }) as unknown as typeof import("node:child_process").execFileSync;
    hasCommand("powershell.exe", ["-NoProfile", "-Command", "exit"], spy);
    expect(seen[0]).toEqual(["powershell.exe", "-NoProfile", "-Command", "exit"]);
  });
});
