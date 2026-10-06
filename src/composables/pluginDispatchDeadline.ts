// A plugin's dispatch can stand for work that takes minutes — mulmoscript's generateMovie answers
// only when the whole render is done, and a remotion scene alone calls `claude -p` several times —
// so it has its own deadline rather than SLOW_COMMAND_TIMEOUT_MS. MulmoClaude sets none; this host
// keeps one because a request without a bound can do nothing forever (#1393).
export const PLUGIN_DISPATCH_TIMEOUT_MS = 60 * 60_000;

const MS_PER_MINUTE = 60_000;

const isAbortError = (err: unknown): boolean => typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";

/** What a failed dispatch should throw: a deadline abort says it timed out, anything else is kept. */
export function pluginDispatchError(toolName: string, err: unknown, timeout_ms: number): unknown {
  if (!isAbortError(err)) return err;
  const minutes = Math.round(timeout_ms / MS_PER_MINUTE);
  return new Error(
    `plugin/${toolName} gave no answer within ${minutes} minutes. The work may still be running on the server; its result appears here once it finishes.`,
    { cause: err },
  );
}
