// A seam for what ONE terminal does by itself — restart its agent, open its timeline, talk to another
// terminal, set itself aside — asked for by the grid (TerminalGrid.runCellAction, and GridView's
// `terminal-restart`), which knows the cell but not its session. TerminalCell owns the session, so it
// registers its own handler here, the way GridView registers its opener in useNewTerminal.
//
// A Map rather than the shared handler queue: an action names one terminal and nothing else can
// serve it, so a request for a cell that is not mounted has nowhere to go — queueing it would
// fire at whatever mounted next.
import type { CellSelfAction } from "../../common/headerActions";

type Handler = (action: CellSelfAction) => boolean;

const handlers = new Map<string, Handler>();

/** Register `key`'s handler; it returns whether it could do what was asked. Call the returned
 *  function on unmount. */
export function registerCellAction(key: string, handler: Handler): () => void {
  handlers.set(key, handler);
  return () => {
    // Only if it is still ours: a cell that remounts under the same key registers before the old
    // instance tears down, and an unconditional delete would drop the LIVE handler.
    if (handlers.get(key) === handler) handlers.delete(key);
  };
}

/** Do `action` in `key`'s terminal. False when there is no such terminal, or it cannot do it now
 *  (no session to restart, no one to talk to) — the caller says so, rather than a button that
 *  quietly does nothing. */
export function requestCellAction(key: string | null, action: CellSelfAction): boolean {
  if (!key) return false;
  const handler = handlers.get(key);
  return handler ? handler(action) : false;
}
