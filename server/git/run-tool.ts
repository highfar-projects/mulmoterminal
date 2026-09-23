import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { killTree } from "./kill-tree.js";

export interface ToolRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** The call was killed at the deadline rather than finishing on its own. */
  timedOut: boolean;
  /** The exit code. Null when the process never ran (spawn refused or threw), or was killed — by
   *  the deadline, a signal, or `signal` aborting. */
  code: number | null;
}

export interface RunToolOpts {
  // `| undefined` throughout: exactOptionalPropertyTypes is on, and callers forward their own
  // optional cwd straight through.
  cwd?: string | undefined;
  timeoutMs: number;
  /** Keep stderr for the caller. Either way the pipe IS drained — see below. */
  keepStderr?: boolean | undefined;
  /** Injected for tests; decides how the deadline kills the tree. */
  platform?: NodeJS.Platform | undefined;
  /** Kills the tree when it fires, for a caller whose own reason to wait has gone (a request the
   *  browser hung up on). Settles as `ok:false, code:null`, like a failed spawn. */
  signal?: AbortSignal | undefined;
}

// Run a local dev tool (git / gh) with argv only — no shell — collect its output, and
// GUARANTEE the promise settles by `timeoutMs`. Never rejects: a spawn failure or a timeout
// is `ok:false`, so callers branch on the result instead of catching.
//
// `git()` and `spawnCollect()` each wrote this out themselves. They drifted in exactly the
// way that matters here — a fix to the deadline could land in one and not the other while
// both still compiled — so the spawning, draining, decoding and killing live here once and
// each keeps only its own result shape.
export function runTool(bin: string, args: string[], opts: RunToolOpts): Promise<ToolRun> {
  return new Promise((resolve) => {
    if (opts.signal?.aborted) {
      resolve({ ok: false, stdout: "", stderr: "", timedOut: false, code: null });
      return;
    }
    // `spawn` THROWS SYNCHRONOUSLY for an argument Node refuses to pass to execve — a NUL byte is
    // the reachable one (`ERR_INVALID_ARG_VALUE`, from user text in argv such as `?q=%00`) — and a
    // throw here would reject, which the contract above says never happens.
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch {
      resolve({ ok: false, stdout: "", stderr: "", timedOut: false, code: null });
      return;
    }
    const { stdout, stderr } = child;

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    stdout.on("data", (c: Buffer) => outChunks.push(c));
    // stderr MUST be read even when it is thrown away: git blocks on a full stderr pipe (a
    // repo that prints thousands of lfs/hook warnings easily exceeds the 64KB buffer), and an
    // unread pipe deadlocks the whole call. Discard the bytes, keep reading.
    stderr.on("data", (c: Buffer) => {
      if (opts.keepStderr) errChunks.push(c);
    });

    // Decode ONCE at the end: a chunk boundary can fall inside a multibyte UTF-8 character (a
    // Japanese PR title, branch, or commit message), and per-chunk toString() would corrupt it
    // into replacement characters.
    const text = (chunks: Buffer[]): string => Buffer.concat(chunks).toString("utf8");

    // Settle exactly once, and settle AT the deadline whether or not the pipes ever close.
    // Waiting for `close` is what hung: it fires only when every stdio stream has ended, and a
    // descendant that inherited them (git-lfs filter-process) holds them open after the child
    // itself is gone — so the caller waited forever on a call it had already given up on, and
    // the poll behind it kept counting that call as in flight.
    let settled = false;
    const done = (r: ToolRun): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(r);
    };

    const kill = (): void => {
      killTree(child, opts.platform);
      // Let go of our end of the pipes too, so an orphan that outlives the kill cannot keep
      // pushing bytes into buffers nobody will read.
      stdout.destroy();
      stderr.destroy();
    };
    const timer = setTimeout(() => {
      kill();
      done({ ok: false, stdout: text(outChunks), stderr: text(errChunks), timedOut: true, code: null });
    }, opts.timeoutMs);
    const onAbort = (): void => {
      kill();
      done({ ok: false, stdout: "", stderr: "", timedOut: false, code: null });
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", () => done({ ok: false, stdout: "", stderr: "", timedOut: false, code: null }));
    child.on("close", (code) => done({ ok: code === 0, stdout: text(outChunks), stderr: text(errChunks), timedOut: false, code }));
  });
}
