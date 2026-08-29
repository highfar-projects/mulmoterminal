// A seam for restarting the agent in ONE named terminal from anywhere — a `run: "action"` header
// button (which knows the slot key) and the `terminal-restart` shortcut (which knows the grid
// cell). TerminalCell owns the session, so it registers its own handler here, the way GridView
// registers its opener in useNewTerminal.
//
// A Map rather than the shared handler queue: a restart names one terminal and nothing else can
// serve it, so a request for a cell that is not mounted has nowhere to go — queueing it would
// fire at whatever mounted next.
type Handler = () => boolean;

const handlers = new Map<string, Handler>();

/** Register `key`'s handler; it returns whether it had a session to restart. Call the returned
 *  function on unmount. */
export function registerCellRestart(key: string, handler: Handler): () => void {
  handlers.set(key, handler);
  return () => {
    // Only if it is still ours: a cell that remounts under the same key registers before the old
    // instance tears down, and an unconditional delete would drop the LIVE handler.
    if (handlers.get(key) === handler) handlers.delete(key);
  };
}

/** Restart the agent in `key`'s terminal. False when there is no such terminal, or it has no
 *  session running — the caller says so, rather than a button that quietly does nothing. */
export function requestCellRestart(key: string | null): boolean {
  if (!key) return false;
  const handler = handlers.get(key);
  return handler ? handler() : false;
}
