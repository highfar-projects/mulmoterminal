import { runTool } from "./run-tool.js";

export interface SpawnResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

// A network-backed `gh` call that stalls (no route, an auth prompt, a hung proxy) would
// otherwise pin an HTTP request open and stack subprocesses across retries. Kill it.
const DEFAULT_TIMEOUT_MS = 30_000;

// Run a local dev tool (git / gh) with argv only — no shell — and collect its output.
// The tool name is a caller-supplied argument, not a string literal, so this isn't a
// spawn-of-a-string-literal from PATH. Never rejects: a spawn failure (or timeout) resolves
// ok:false with `errorStderr`, so callers branch on the result instead of catching.
export async function spawnCollect(
  bin: string,
  args: string[],
  opts: { cwd?: string; errorStderr: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<SpawnResult> {
  const run = await runTool(bin, args, { cwd: opts.cwd, env: opts.env ?? process.env, timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  if (run.end === "spawn-error") return { ok: false, stdout: "", stderr: opts.errorStderr };
  return { ok: run.end === "exit" && run.code === 0, stdout: run.stdout, stderr: run.stderr };
}
