// @vitest-environment node
// Windows-only: the terminal paths that run a SHELL rather than an agent — the Run menu's
// one-off command and a configured launcher. Both compose shellInvocation() with spawnPty(),
// and on Windows that means `powershell.exe -NoLogo -Command <command>`.
//
// Neither had ever executed on Windows in CI: shell-command.spec asserts the argv shape from
// any host, and nothing spawned it. That matters because PowerShell is a second parser
// between us and the command — the same class of problem as #813, where a quoted payload
// survived cmd.exe and was then dropped by the receiving program. A command carrying quotes
// or a shell metacharacter is the case to watch, so those are the cases here.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { spawnPty } from "../../../server/session/pty-spawn";
import { shellInvocation, defaultShellTarget, launchInvocation, type LaunchTarget, type ShellInvocation } from "../../../server/session/shell-command";

const isWindows = process.platform === "win32";

// A conpty wraps at the window width and paints escape sequences, so compare on the visible
// text with the sequences and line breaks taken out.
const plainText = (data: string): string =>
  data
    // eslint-disable-next-line no-control-regex -- reading a terminal's own output back
    .replace(/\u001b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/[\r\n]/g, "");

function run({ shell, args }: ShellInvocation, cwd: string): Promise<{ output: string; exitCode: number }> {
  const term: IPty = spawnPty(shell, args, cwd);
  let output = "";
  term.onData((data) => {
    output += data;
  });
  return new Promise((resolve) => term.onExit(({ exitCode }) => resolve({ output: plainText(output), exitCode })));
}

const runShell = (command: string, cwd: string, replaceShell = false) => run(shellInvocation(command, replaceShell, "win32", undefined), cwd);

/** The path a Shell cell actually takes: a LaunchTarget, resolved the way spawnLauncherPty does. */
const runTarget = (target: LaunchTarget, cwd: string) => run(launchInvocation(target, "win32", undefined), cwd);

// Every test here starts a REAL PowerShell through a real PTY, which is not what the default
// 15s `testTimeout` was sized for — that number is for unit tests. The first spawn in the process
// is the expensive one (PowerShell loading .NET), and on the PR gate it is slower still because
// that workflow deliberately does NOT disable Defender: `pull_request` runs code the PR supplied,
// so turning the runner's protection off ahead of it is a trade this repo refused (#1723).
//
// Measured on the same spec, same command, same runner image:
//
//   Windows (daily), Defender off   2956ms
//   Windows (PR),    Defender on    4272 / 4773 / 4896ms  — then 15007ms and a failure
//
// So the PR gate ran at 1.5-1.7x with less than half the headroom, and load finished the job
// (#1740). The timeout is raised HERE rather than globally: 15s is right for the other 700 spec
// files, and raising it for all of them would hide a real slowdown in any of them.
const PTY_TIMEOUT_MS = 60_000;

describe.skipIf(!isWindows)("a shell terminal on Windows", { timeout: PTY_TIMEOUT_MS }, () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-shell-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("runs a command and streams its output", async () => {
    const { output, exitCode } = await runShell("Write-Output MTOK-plain", dir);
    expect(output).toContain("MTOK-plain");
    expect(exitCode).toBe(0);
  });

  // The command reaches PowerShell as ONE argv element (`-Command <command>`), so nothing in
  // it may be re-split. A space is the cheapest way to say that.
  it("keeps a multi-word command in one piece", async () => {
    const { output } = await runShell("Write-Output 'MTOK two words'", dir);
    expect(output).toContain("MTOK two words");
  });

  // #813's class, on the PowerShell path: a payload carrying double quotes has to arrive
  // whole. The reporter there measured PowerShell mangling exactly this shape when it was
  // typed at an interactive prompt — this asserts the programmatic path does not.
  it("carries a quoted JSON payload through without losing its quotes", async () => {
    const { output } = await runShell(`Write-Output '{"a":1,"b":"x y"}'`, dir);
    expect(output).toContain('{"a":1,"b":"x y"}');
  });

  // A metacharacter inside the command belongs to PowerShell, not to whatever spawned it.
  it("does not let a shell metacharacter escape the command", async () => {
    const { output } = await runShell("Write-Output 'a&b|c>d'", dir);
    expect(output).toContain("a&b|c>d");
  });

  // Awkward content on the PowerShell side. Single-quoted in PowerShell so the shell itself
  // treats the payload as literal — what is being checked is that the string survives the
  // hop from us to PowerShell intact, not PowerShell's own quoting rules.
  it.each([
    ["double quotes", '{"a":1}'],
    ["parens and brackets", "(a) [b] {c}"],
    ["ampersand and pipe", "a&b|c"],
    ["semicolon and comma", "a;b,c"],
    ["caret and percent", "a^b%c%"],
    ["bang", "a!b"],
    ["CJK", "日本語のテキスト"],
    ["emoji", "emoji 📎 ok"],
    ["accents", "café naïve"],
  ])("carries %s through to the command", async (_case, payload) => {
    const { output } = await runShell(`Write-Output '${payload}'`, dir);
    expect(output).toContain(payload);
  });

  // A backtick is PowerShell's escape character, but ONLY inside double quotes — the
  // assumption this case started life asserting, and the Windows runner corrected it. In
  // single quotes it is literal like everything else, so a Run command wrapped that way means
  // what it looks like; wrapped in double quotes it does not, and both are worth recording
  // because a Run command is user text.
  it("treats a backtick literally inside single quotes", async () => {
    const { output } = await runShell("Write-Output 'a`nb'", dir);
    expect(output).toContain("a`nb");
  });

  it("lets PowerShell consume the backtick inside double quotes", async () => {
    const { output } = await runShell('Write-Output "x`ty"', dir);
    expect(output).not.toContain("`");
  });

  it("reports a failing command's exit code", async () => {
    const { exitCode } = await runShell("exit 3", dir);
    expect(exitCode).toBe(3);
  });

  // A launcher is the persistent variant. On Windows it is the same invocation — `exec` is
  // POSIX-only — so what this pins is that the win32 arm ignores replaceShell rather than
  // producing something PowerShell cannot run.
  it("runs a launcher command the same way", async () => {
    const { output, exitCode } = await runShell("Write-Output MTOK-launcher", dir, true);
    expect(output).toContain("MTOK-launcher");
    expect(exitCode).toBe(0);
  });

  it("runs in the directory it was given", async () => {
    const { output } = await runShell("Write-Output (Get-Location).Path", dir);
    // The conpty may wrap a long path, so compare on the leaf.
    expect(output).toContain(path.basename(dir));
  });
});

// #1717 / #1720: a Shell cell with no launcher runs `$SHELL`, and Git for Windows sets that to
// `C:\Program Files\Git\usr\bin\bash.exe`. It used to go through `powershell -Command`, which
// split it at the first space and reported an unknown command `C:\Program`. Now nothing parses it
// at all — the file is handed to the PTY.
//
// The shell under test is one we WRITE, not one the runner image happens to ship: a `.cmd` inside
// a directory whose name contains a space. That makes the repro deterministic, and it exits on its
// own — pointing this at a real interactive shell would just hang the pty.
describe.skipIf(!isWindows)("a shell path containing a space", { timeout: PTY_TIMEOUT_MS }, () => {
  const TOKEN = "MTOK-spaced-shell";
  let root = "";
  let shellPath = "";

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "mt-spaced-"));
    const spaced = path.join(root, "Program Files Like");
    mkdirSync(spaced);
    shellPath = path.join(spaced, "fake-shell.cmd");
    writeFileSync(shellPath, `@echo off\r\necho ${TOKEN}\r\n`);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  // The original bug, kept: this is what the Shell cell used to do. Without it the passing case
  // below proves only that SOMETHING works, not that what was broken was the parser in the middle.
  it("does not run when the bare path is handed to PowerShell", async () => {
    const { output } = await runShell(shellPath, root);
    expect(output).not.toContain(TOKEN);
  });

  // And quoting alone would not have fixed it: PowerShell evaluates `'C:\…\x.cmd'` as a string
  // expression, echoes it, and starts nothing. A silent failure is worse than the loud one, which
  // is why the answer was to remove the parser rather than to satisfy it.
  it("only echoes the path when it is quoted without the call operator", async () => {
    const { output } = await runShell(`'${shellPath}'`, root);
    expect(output).not.toContain(TOKEN);
    expect(output).toContain("fake-shell.cmd");
  });

  // What ships: no shell in between at all.
  it("runs when the launch target is spawned as a program", async () => {
    const { output, exitCode } = await runTarget(defaultShellTarget("win32", { SHELL: shellPath }), root);
    expect(output).toContain(TOKEN);
    expect(exitCode).toBe(0);
  });

  // A `.cmd` still reaches cmd.exe — but through resolve-bin/cmd-escape, on argv this app controls,
  // rather than through a command string a user's PATH could have put a space in.
  it("carries the spaced path through the batch-shim layer", async () => {
    const { shell, args } = launchInvocation(defaultShellTarget("win32", { SHELL: shellPath }), "win32", undefined);
    expect(shell).toBe(shellPath);
    expect(args).toEqual([]);
  });
});
