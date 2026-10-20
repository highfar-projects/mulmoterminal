// Personal-fork: a devcontainer rebuild or stop (TerminalCell.vue's badge buttons) removes the
// container every session in that directory runs in. The server sees the agent's process die and
// reports it exactly as an agent ending on its own (a reap), so #3049's auto-close would take each
// of those cells off the grid — the cell that asked for the rebuild included. Nothing server-side
// can tell the two apart (the container just disappears), so the browser that started the
// operation is what remembers it: a cell whose session ends while an operation on ITS directory is
// in flight, or settled within the grace window, keeps its cell and is resumed in place once the
// operation succeeded — the same reconnect the agent restart (#1918) uses.
//
// Module-level rather than per cell, because the operation is per DIRECTORY: a second cell open on
// the same project loses its session to the same rebuild, and has to know about it as well.

/** How long after the operation returns an exit frame is still put down to it. The container is
 *  removed early in `devcontainer up --remove-existing-container`, so the frame normally arrives
 *  while the call is still running; this covers one that lands after. */
export const DEVCONTAINER_EXIT_GRACE_MS = 15_000;

interface DevcontainerOp {
  settledAt: number | null;
  ok: boolean;
}

const ops = new Map<string, DevcontainerOp>();
const settledListeners = new Set<(dir: string, ok: boolean) => void>();

export function beginDevcontainerOp(dir: string): void {
  ops.set(dir, { settledAt: null, ok: false });
}

export function settleDevcontainerOp(dir: string, ok: boolean, now = Date.now()): void {
  const op = ops.get(dir);
  if (!op) return;
  op.settledAt = now;
  op.ok = ok;
  for (const listener of settledListeners) listener(dir, ok);
}

/** The operation an ended session in `dir` is to be put down to: `"running"` while it is in flight,
 *  `"succeeded"` / `"failed"` within the grace window after it returned, `null` otherwise. */
export function devcontainerOpFor(dir: string | null, now = Date.now()): "running" | "succeeded" | "failed" | null {
  if (!dir) return null;
  const op = ops.get(dir);
  if (!op) return null;
  if (op.settledAt === null) return "running";
  if (now - op.settledAt > DEVCONTAINER_EXIT_GRACE_MS) {
    ops.delete(dir);
    return null;
  }
  return op.ok ? "succeeded" : "failed";
}

export function onDevcontainerOpSettled(listener: (dir: string, ok: boolean) => void): () => void {
  settledListeners.add(listener);
  return () => settledListeners.delete(listener);
}

/** Test seam: forget every operation. */
export function resetDevcontainerOps(): void {
  ops.clear();
}
