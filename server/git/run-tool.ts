import { spawn, type ChildProcess } from "node:child_process";
import { killTree, spawnsOwnGroup } from "./kill-tree.js";

// After the child exits, how long its stdout may stay open before we stop waiting for it. The pipe
// closes at once unless something the child started inherited it and is still alive — which is
// exactly the process that used to keep `close` from ever arriving.
const DRAIN_AFTER_EXIT_MS = 1_000;

/** How the run ended. Only `exit` means the child reported a status of its own. */
export type ToolEnd = "exit" | "spawn-error" | "timeout" | "abort" | "overflow";

export interface ToolRun {
  end: ToolEnd;
  /** The exit status; null for every end but `exit`, and for an exit by signal. */
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface ToolRunOptions {
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  maxStdoutBytes?: number | undefined;
}

// Run a local tool (git / gh / glab) with argv only — no shell — and collect its output.
//
// Settles by the deadline whatever the child's descendants do. Node's own `timeout` signals the
// direct child only, and `close` waits for every holder of the pipes, so a grandchild that outlived
// a killed git kept the promise pending forever (#2935). Here the deadline kills the whole tree and
// settles without waiting for `close`. Never rejects.
export function runTool(bin: string, args: string[], opts: ToolRunOptions): Promise<ToolRun> {
  return new Promise((resolve) => {
    if (opts.signal?.aborted) {
      resolve({ end: "abort", code: null, stdout: "", stderr: "" });
      return;
    }
    let child: ChildProcess;
    try {
      // `spawn` throws synchronously for an argument execve will not take (a NUL byte).
      child = spawn(bin, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"], detached: spawnsOwnGroup, windowsHide: true });
    } catch {
      resolve({ end: "spawn-error", code: null, stdout: "", stderr: "" });
      return;
    }
    collect(child, opts, resolve);
  });
}

function collect(child: ChildProcess, opts: ToolRunOptions, resolve: (run: ToolRun) => void): void {
  // Bytes are decoded ONCE at the end: a chunk boundary can fall inside a multibyte UTF-8
  // character, and per-chunk toString() would turn it into replacement characters.
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdoutBytes = 0;
  let exitCode: number | null = null;
  let settled = false;
  let drainTimer: NodeJS.Timeout | undefined;

  const settle = (end: ToolEnd): void => {
    if (settled) return;
    settled = true;
    clearTimeout(deadlineTimer);
    clearTimeout(drainTimer);
    opts.signal?.removeEventListener("abort", onAbort);
    // Release our end of the pipes, so a lingering holder cannot keep this process's fds open.
    child.stdout?.destroy();
    child.stderr?.destroy();
    const decode = (chunks: Buffer[]): string => Buffer.concat(chunks).toString("utf8");
    resolve({ end, code: end === "exit" ? exitCode : null, stdout: decode(stdoutChunks), stderr: decode(stderrChunks) });
  };
  const stop = (end: ToolEnd): void => {
    if (settled) return;
    killTree(child);
    settle(end);
  };
  const onAbort = (): void => stop("abort");

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (opts.maxStdoutBytes !== undefined && stdoutBytes > opts.maxStdoutBytes) stop("overflow");
    else stdoutChunks.push(chunk);
  });
  // stderr MUST be drained even by a caller that ignores it: a tool blocks on a full stderr pipe
  // (thousands of lfs/hook warnings pass the 64KB buffer), and an unread pipe deadlocks the call.
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  child.on("error", () => settle("spawn-error"));
  child.on("exit", (code) => {
    // The child answered in time; from here only the drain bounds the wait, so a slow holder of
    // the pipe cannot turn a finished run into a timeout.
    exitCode = code;
    clearTimeout(deadlineTimer);
    drainTimer = setTimeout(() => settle("exit"), DRAIN_AFTER_EXIT_MS);
  });
  child.on("close", () => settle("exit"));
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const deadlineTimer = setTimeout(() => stop("timeout"), opts.timeoutMs);
}
