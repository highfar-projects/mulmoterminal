// A seam for a `run: "action"` header button to act on the grid cell it sits in. The button knows
// only its terminal's slot key; the grid knows what every action means for a cell, so TerminalGrid
// registers the runner and the button asks through here — the same runner a shortcut reaches.
//
// One runner, not a queue: a request is about a cell that exists now, and with no grid mounted
// (a terminal outside it) there is nothing to act on, which the caller reports.
import type { CellAction } from "../../common/headerActions";

type Runner = (uid: number, action: CellAction) => boolean;

let runner: Runner | null = null;

const SLOT_UID_RE = /^cell-(\d+)$/;

/** Register the grid's runner; call the returned function on unmount. */
export function registerGridCellRunner(next: Runner): () => void {
  runner = next;
  return () => {
    // Only if it is still ours: a grid that remounts registers before the old one tears down.
    if (runner === next) runner = null;
  };
}

/** Run `action` on the grid cell whose slot key is `slotKey`. False when that is no grid cell, no
 *  grid is mounted, or the cell cannot do it now — the caller says so. */
export function requestGridCellAction(slotKey: string | null, action: CellAction): boolean {
  const match = slotKey?.match(SLOT_UID_RE);
  if (!match || !runner) return false;
  return runner(Number(match[1]), action);
}
