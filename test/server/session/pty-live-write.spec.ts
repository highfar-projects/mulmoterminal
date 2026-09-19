// @vitest-environment node
// Writing into a pty that STAYS ALIVE, and reading what comes back.
//
// This is the shape a cell actually uses — `entry.term.write(...)` on a shell that was started
// once and keeps running (pty-connection.ts, draft-injection.ts) — and until now nothing tested
// it on any platform. The four specs that spawn a pty all hand it argv and wait for `onExit`, so
// a one-shot command was covered and the interactive path was not (#2170).
//
// Windows is why it became urgent. `node-pty` is pinned to an exact `1.2.0-beta.15` (no caret) to
// fix the fd leak in #1595, and microsoft/node-pty#955 reports that exact version exiting with
// "terminal process has exited" AT THE FIRST WRITE, bisected to beta.15 with beta.14 clean. That
// report has no answer and this repo had no way to tell whether it applied here. It runs on every
// platform rather than only Windows because the gap was never Windows-specific — the Windows leg
// is simply the one with an open report against it.
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { spawnPty } from "../../../server/session/pty-spawn.js";
import { defaultShellTarget, launchInvocation } from "../../../server/session/shell-command.js";

// A real shell through a real pty, and on Windows a conpty that loads .NET first. The same
// reasoning as shell-spawn-win.spec.ts: the default 15s is sized for unit tests, and raising it
// globally would hide a real slowdown in the other spec files.
const PTY_TIMEOUT_MS = 60_000;
const POLL_MS = 50;
// An interactive shell has rc files to read before it will accept anything.
const SHELL_SETTLE_MS = 800;
// draft-injection.ts submits in a separate write a beat after the paste, and this mirrors it.
const AFTER_PASTE_MS = 300;

/** The token must NOT appear in the text we type. A terminal echoes what it is sent, so a command
 *  whose source contains the token would satisfy every assertion here while the shell sat idle —
 *  the test would pass against a pty that reads and never runs. Each command therefore builds its
 *  token out of two pieces, and `the token is not in the source` below is what keeps that true. */
interface LiveCommand {
  source: string;
  token: string;
}

const commandFor = (token: string): LiveCommand => {
  const [head, tail] = [token.slice(0, 2), token.slice(2)];
  return {
    source: process.platform === "win32" ? `Write-Output ("${head}" + "${tail}")` : `echo "${head}""${tail}"`,
    token,
  };
};

interface LiveShell {
  term: IPty;
  /** Resolves true once `needle` has appeared in everything the pty has sent. */
  waitFor: (needle: string, timeoutMs: number) => Promise<boolean>;
  output: () => string;
  /** Whether the pty has exited — node-pty#955's symptom, and nothing else here would catch it. */
  exited: () => boolean;
  occurrences: (needle: string) => number;
}

let live: LiveShell | null = null;

function startLiveShell(cwd: string): LiveShell {
  // The Shell cell's own invocation, not an ad-hoc shell: `powershell.exe` on Windows and
  // `bash -lc "exec '<shell>'"` on POSIX, which is what makes this a test of the shipped path.
  const { shell, args } = launchInvocation(defaultShellTarget(process.platform, process.env), process.platform, undefined);
  const term = spawnPty(shell, args, cwd);
  let seen = "";
  let hasExited = false;
  term.onData((data) => {
    seen += data;
  });
  term.onExit(() => {
    hasExited = true;
  });
  return {
    term,
    output: () => seen,
    exited: () => hasExited,
    occurrences: (needle) => seen.split(needle).length - 1,
    waitFor: (needle, timeoutMs) =>
      new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        const tick = setInterval(() => {
          if (seen.includes(needle)) {
            clearInterval(tick);
            resolve(true);
          } else if (Date.now() > deadline) {
            clearInterval(tick);
            resolve(false);
          }
        }, POLL_MS);
      }),
  };
}

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("writing into a live pty", { timeout: PTY_TIMEOUT_MS }, () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-live-pty-"));
  });
  // Nothing here exits on its own — an interactive shell has to be killed or it outlives the run.
  afterEach(() => {
    live?.term.kill();
    live = null;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // The design guard for every test below. If a command's source ever carries its own token, the
  // echo alone satisfies the assertion and the suite goes quietly blind.
  it("builds each command so its token cannot come from the echo", () => {
    const { source, token } = commandFor("MTOK-design");
    expect(source).not.toContain(token);
    expect(source).toContain("MT");
  });

  it("runs a command typed into a shell that was already running", async () => {
    const { source, token } = commandFor("MTOK-live");
    live = startLiveShell(dir);
    await settle(SHELL_SETTLE_MS);
    live.term.write(`${source}\r`);

    expect(await live.waitFor(token, PTY_TIMEOUT_MS / 2)).toBe(true);
    // Exactly once, and the echo cannot have produced it: this is the command's OUTPUT.
    expect(live.occurrences(token)).toBe(1);
  });

  // node-pty#955 in its own words: the terminal process exits before the first write lands. That
  // fails the test above too, but only as "no output" — which reads like a slow runner. This says
  // what actually happened, so a future upgrade that reintroduces it is diagnosed rather than retried.
  it("keeps the pty alive across the write", async () => {
    const { source, token } = commandFor("MTOK-alive");
    live = startLiveShell(dir);
    await settle(SHELL_SETTLE_MS);
    expect(live.exited()).toBe(false);

    live.term.write(`${source}\r`);
    await live.waitFor(token, PTY_TIMEOUT_MS / 2);
    expect(live.exited()).toBe(false);
  });

  // Several writes on one pty, which is what a session is. A pty that survives the first write and
  // dies on the second would pass everything above.
  it("takes more than one write on the same pty", async () => {
    const first = commandFor("MTOK-first");
    const second = commandFor("MTOK-second");
    live = startLiveShell(dir);
    await settle(SHELL_SETTLE_MS);

    live.term.write(`${first.source}\r`);
    expect(await live.waitFor(first.token, PTY_TIMEOUT_MS / 2)).toBe(true);
    live.term.write(`${second.source}\r`);
    expect(await live.waitFor(second.token, PTY_TIMEOUT_MS / 2)).toBe(true);
    expect(live.exited()).toBe(false);
  });

  // draft-injection.ts's exact shape: the text inside a bracketed paste, then the submit as a
  // SEPARATE write a beat later. The terminator matters — without it the shell is still in paste
  // mode and the carriage return is text rather than a keystroke.
  it("runs a bracketed paste followed by a separate submit", async () => {
    const { source, token } = commandFor("MTOK-paste");
    live = startLiveShell(dir);
    await settle(SHELL_SETTLE_MS);

    live.term.write(`\x1b[200~${source}\x1b[201~`);
    await settle(AFTER_PASTE_MS);
    live.term.write("\r");

    expect(await live.waitFor(token, PTY_TIMEOUT_MS / 2)).toBe(true);
    expect(live.exited()).toBe(false);
  });
});
