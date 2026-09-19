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
// An interactive shell has rc files to read before it will accept anything, so readiness is
// WAITED FOR rather than guessed at: a fixed sleep is either too long on every run or too short on
// the one loaded runner that matters, and Codex on #2200 named that as the flake risk here. A
// shell that has printed its prompt has finished starting, so the first output is the signal; the
// grace after it covers the terminal modes a shell sets immediately afterwards, bracketed paste
// among them, which the paste case below depends on.
const READY_DEADLINE_MS = 10_000;
const READY_GRACE_MS = 200;
// draft-injection.ts submits in a separate write a beat after the paste, and this mirrors it.
const AFTER_PASTE_MS = 300;
// Half the file's budget, so a command that never answers still leaves room to report it.
const COMMAND_TIMEOUT_MS = PTY_TIMEOUT_MS / 2;
// How long a killed shell is given to actually go before the run stops waiting on it.
const KILL_GRACE_MS = 5_000;

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

/** Why the wait ended. `exited` is what node-pty#955 describes, and it is a separate answer from
 *  `timeout` on purpose: a pty that DIED and a runner that was merely slow want opposite responses,
 *  and a waiter that only reported "no output" made them indistinguishable. */
type Settled = "output" | "exited" | "timeout";

const settle = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface LiveShell {
  term: IPty;
  /** Waits for `needle`, the pty's exit, or the deadline — whichever comes first. */
  settleOn: (needle: string, timeoutMs: number) => Promise<Settled>;
  output: () => string;
  /** Whether the pty has exited — node-pty#955's symptom, and nothing else here would catch it. */
  exited: () => boolean;
  occurrences: (needle: string) => number;
  /** Resolves once the pty has actually gone, so a killed shell has released `cwd`. */
  whenExited: () => Promise<void>;
  /** Resolves once the shell has printed anything — its prompt — and had a moment to set its
   *  terminal modes. Observed readiness, rather than a fixed sleep. */
  whenReady: () => Promise<void>;
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
  const exit = new Promise<void>((resolve) =>
    term.onExit(() => {
      hasExited = true;
      resolve();
    }),
  );
  return {
    term,
    output: () => seen,
    exited: () => hasExited,
    whenExited: () => exit,
    whenReady: async () => {
      const deadline = Date.now() + READY_DEADLINE_MS;
      while (seen.length === 0 && !hasExited && Date.now() < deadline) await settle(POLL_MS);
      await settle(READY_GRACE_MS);
    },
    occurrences: (needle) => seen.split(needle).length - 1,
    settleOn: (needle, timeoutMs) =>
      new Promise((resolve) => {
        const deadline = Date.now() + timeoutMs;
        // Order matters: output the pty already sent counts even if it died right after sending it.
        const verdict = (): Settled | null => {
          if (seen.includes(needle)) return "output";
          if (hasExited) return "exited";
          return Date.now() > deadline ? "timeout" : null;
        };
        const tick = setInterval(() => {
          const answer = verdict();
          if (answer !== null) {
            clearInterval(tick);
            resolve(answer);
          }
        }, POLL_MS);
      }),
  };
}

/** The full contract for one command, in one place. Codex on #2200 pointed out that only the
 *  first case was applying it: the others waited for the token and never asserted it had arrived
 *  EXACTLY ONCE, which is the half that rules out the echo. A shared assertion is what stops a
 *  later case being added weaker than the ones around it. */
async function expectCommandOutput(shell: LiveShell, token: string): Promise<void> {
  expect(await shell.settleOn(token, COMMAND_TIMEOUT_MS)).toBe("output");
  // Once, and only from the command's OUTPUT — the source that was echoed does not contain it.
  expect(shell.occurrences(token)).toBe(1);
}

describe("writing into a live pty", { timeout: PTY_TIMEOUT_MS }, () => {
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "mt-live-pty-"));
  });
  // Nothing here exits on its own — an interactive shell has to be killed or it outlives the run.
  //
  // And the kill is AWAITED, which `rmSync` below is the reason for: `force` only swallows ENOENT,
  // so on Windows a directory that is still a live process's cwd fails to remove with EBUSY rather
  // than being ignored. `kill()` returns before the child is reaped, so without this the teardown
  // races the shell (Codex on #2200). Capped, because a shell that will not die must fail the run
  // rather than hang it.
  afterEach(async () => {
    const dying = live;
    live = null;
    if (dying === null) return;
    dying.term.kill();
    // The cap expiring is ASSERTED rather than shrugged off: a shell that outlived its kill would
    // otherwise pass silently on every platform that lets an in-use cwd be removed, which is most
    // of them (Codex on #2200, round 2).
    const ending = await Promise.race([dying.whenExited().then(() => "exited" as const), settle(KILL_GRACE_MS).then(() => "still running" as const)]);
    expect(ending).toBe("exited");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // The design guard for every test below. If a command's source ever carries its own token, the
  // echo alone satisfies the assertion and the suite goes quietly blind.
  it("builds each command so its token cannot come from the echo", () => {
    const { source, token } = commandFor("MTOK-design");
    expect(source).not.toContain(token);
    expect(source).toContain("MT");
  });

  // And the OTHER half, which a mutation sweep over this file cannot reach: dropping the
  // exactly-once assertion goes unnoticed as long as no command source carries its own token, so
  // the two guards only ever fail together. This drives the assertion with a fabricated stream
  // instead — one where the token appears twice, as a shell that re-renders its input line would
  // produce (PSReadLine does exactly that on Windows, which is where the construction guard alone
  // would not be enough).
  it("rejects a token that arrived more than once, however it got there", async () => {
    const doubled = "MTOK-doubled";
    const stub: LiveShell = {
      term: null as unknown as IPty,
      settleOn: async () => "output",
      output: () => `${doubled} ... ${doubled}`,
      exited: () => false,
      occurrences: (needle) => `${doubled} ... ${doubled}`.split(needle).length - 1,
      whenExited: async () => {},
      whenReady: async () => {},
    };
    await expect(expectCommandOutput(stub, doubled)).rejects.toThrow();
  });

  it("runs a command typed into a shell that was already running", async () => {
    const { source, token } = commandFor("MTOK-live");
    live = startLiveShell(dir);
    await live.whenReady();
    live.term.write(`${source}\r`);

    await expectCommandOutput(live, token);
  });

  // node-pty#955 in its own words: beta.15's terminal process exits BEFORE the first write lands.
  // The case above fails on that too, so what this one adds is WHICH SIDE of the write it died on:
  // a pty that never came up and a pty the write killed are different bugs with different owners,
  // and only the pre-write assertion tells them apart.
  it("keeps the pty alive on both sides of the write", async () => {
    const { source, token } = commandFor("MTOK-alive");
    live = startLiveShell(dir);
    await live.whenReady();
    expect(live.exited()).toBe(false); // it came up

    live.term.write(`${source}\r`);
    await expectCommandOutput(live, token);
    expect(live.exited()).toBe(false); // and the write did not end it
  });

  // Several writes on one pty, which is what a session is. A pty that survives the first write and
  // dies on the second would pass everything above.
  it("takes more than one write on the same pty", async () => {
    const first = commandFor("MTOK-first");
    const second = commandFor("MTOK-second");
    live = startLiveShell(dir);
    await live.whenReady();

    live.term.write(`${first.source}\r`);
    await expectCommandOutput(live, first.token);
    live.term.write(`${second.source}\r`);
    await expectCommandOutput(live, second.token);
    // The first token is still there exactly once: the stream accumulates, so a shell that somehow
    // re-ran the first command would show up here rather than passing.
    expect(live.occurrences(first.token)).toBe(1);
    expect(live.exited()).toBe(false);
  });

  // draft-injection.ts's exact shape: the text inside a bracketed paste, then the submit as a
  // SEPARATE write a beat later.
  //
  // What is asserted is the part THIS REPO owns — that an escape-wrapped write and a separate
  // submit both reach the child and leave the session usable — not that the shell RUNS the pasted
  // text. That second thing is the shell's own business and it is not portable: this case asserted
  // it until Codex pointed out it passes under zsh and times out under bash and under the
  // `/bin/sh` that `defaultShellPath` falls back to when SHELL is unset, which is what ubuntu CI
  // would have hit. The invariant below was measured under all three.
  //
  // Nor would asserting it be the right subject: draft injection targets an agent's TUI, which
  // turns bracketed paste on, while an arbitrary $SHELL may not have it at all. What must hold
  // everywhere is that these bytes do not break the session — an escape-laden write is exactly
  // the shape that would.
  it("stays usable after an escape-wrapped write and a separate submit", async () => {
    const pasted = commandFor("MTOK-paste");
    const after = commandFor("MTOK-after-paste");
    live = startLiveShell(dir);
    await live.whenReady();

    live.term.write(`\x1b[200~${pasted.source}\x1b[201~`);
    await settle(AFTER_PASTE_MS);
    live.term.write("\r");
    expect(live.exited()).toBe(false);

    // The session still takes a command and answers it, whatever the shell made of the paste.
    live.term.write(`${after.source}\r`);
    await expectCommandOutput(live, after.token);
  });
});
