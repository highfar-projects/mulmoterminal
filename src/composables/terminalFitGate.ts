// When a terminal may be fitted to its host, and what to do with a fit that arrives while it
// cannot be.
//
// xterm PAUSES its renderer while the terminal is off screen (an IntersectionObserver of its own).
// A resize that lands while it is paused takes effect on the buffer immediately but DEFERS the
// renderer's dimensions, and xterm's viewport then builds its scroll range out of one of each: the
// canvas height it had before, over the line count it has now. In the alternate buffer nothing
// re-syncs that — a full-screen TUI repaints in place and never scrolls, so the `onScroll` that
// would recompute it never fires — which leaves an agent cell with a scrollbar for scrollback it
// does not have, a slider that tracks nothing and a drag that moves nothing (#1762).
//
// So a fit waits for the terminal to be on screen. This file is the rule alone; the observer that
// feeds it lives in useTerminalConnections.

export interface FitGate {
  /** The last on-screen state the observer DELIVERED. Starts true because xterm's own pause flag
   *  starts false: before either observer has delivered anything the two agree, so the fit that
   *  attach() does before connect() (#1178) still runs. */
  readonly onScreen: boolean;
  /** A fit was asked for while off screen and is owed. One flag rather than a count: a fit reads
   *  the host's CURRENT size, so replaying two of them is replaying the same one twice. */
  readonly owed: boolean;
}

export const initialFitGate: FitGate = { onScreen: true, owed: false };

export interface FitGateStep {
  readonly gate: FitGate;
  /** Whether the caller should fit now. */
  readonly fit: boolean;
}

/** Ask to fit. Off screen the request is remembered instead, for reportOnScreen to release. */
export function requestFit(gate: FitGate): FitGateStep {
  if (!gate.onScreen) return { gate: { onScreen: false, owed: true }, fit: false };
  return { gate: { onScreen: true, owed: false }, fit: true };
}

/** Record what the observer delivered. `fit` is true when a held-back fit is now due. */
export function reportOnScreen(gate: FitGate, onScreen: boolean): FitGateStep {
  if (!onScreen) return { gate: { onScreen: false, owed: gate.owed }, fit: false };
  return { gate: { onScreen: true, owed: false }, fit: gate.owed };
}
