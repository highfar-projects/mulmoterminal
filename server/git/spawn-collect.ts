import { runTool } from "./run-tool.js";

export interface SpawnResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

// A network-backed `gh` call that stalls (no route, an auth prompt, a hung proxy) would
// otherwise pin an HTTP request open and stack subprocesses across retries. Kill it.
const DEFAULT_TIMEOUT_MS = 30_000;

// Run a local dev tool (git / gh) with argv only — no shell — and collect its output. The
// tool name is a caller-supplied argument, not a string literal, so this isn't a
// spawn-of-a-string-literal from PATH. Never rejects: a spawn failure (or timeout) resolves
// ok:false with `errorStderr`, so callers branch on the result instead of catching.
//
// runTool owns the deadline, and kills the whole process tree when it expires — signalling
// only the direct child left descendants alive holding the pipes.
export async function spawnCollect(bin: string, args: string[], opts: { cwd?: string; errorStderr: string; timeoutMs?: number }): Promise<SpawnResult> {
  const res = await runTool(bin, args, { cwd: opts.cwd, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, keepStderr: true });
  // A tool that never started, or one killed at the deadline, has nothing useful on stderr —
  // give the caller the message it wants to show instead of an empty string.
  if (!res.ok && !res.stderr) return { ok: false, stdout: res.stdout, stderr: opts.errorStderr };
  return { ok: res.ok, stdout: res.stdout, stderr: res.stderr };
}
