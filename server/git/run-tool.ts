import { spawn } from "node:child_process";
import { killTree } from "./kill-tree.js";

export interface ToolRun {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** The call was killed at the deadline rather than finishing on its own. */
  timedOut: boolean;
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
    const child = spawn(bin, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => outChunks.push(c));
    // stderr MUST be read even when it is thrown away: git blocks on a full stderr pipe (a
    // repo that prints thousands of lfs/hook warnings easily exceeds the 64KB buffer), and an
    // unread pipe deadlocks the whole call. Discard the bytes, keep reading.
    child.stderr.on("data", (c: Buffer) => {
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
      resolve(r);
    };

    const timer = setTimeout(() => {
      killTree(child, opts.platform);
      // Let go of our end of the pipes too, so an orphan that outlives the kill cannot keep
      // pushing bytes into buffers nobody will read.
      child.stdout.destroy();
      child.stderr.destroy();
      done({ ok: false, stdout: text(outChunks), stderr: text(errChunks), timedOut: true });
    }, opts.timeoutMs);

    child.on("error", () => done({ ok: false, stdout: "", stderr: "", timedOut: false }));
    child.on("close", (code) => done({ ok: code === 0, stdout: text(outChunks), stderr: text(errChunks), timedOut: false }));
  });
}
