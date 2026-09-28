// What a filmstrip thumbnail's ⋮ offers — the same menu a roster row has (CockpitRowMenu), decided
// from the same row data, so the two cannot disagree about what a cell can do.
import { attentionAction, type AttentionAction } from "./rowMenu";
import type { AttentionStatus } from "./attentionStatus";

export interface RowMenuModel {
  canUp: boolean;
  canDown: boolean;
  reorderable: boolean;
  attention: AttentionAction | null;
  parkable: boolean;
  parked: boolean;
}

export interface RowMenuSource {
  status: AttentionStatus;
  markable: boolean;
  parkable: boolean;
  parked: boolean;
}

export interface RowMenuMoves {
  canUp: boolean;
  canDown: boolean;
  reorderable: boolean;
}

/** The menu for a cell's row, or null when the grid has no row for it. Unread/read is offered only
 *  while the cell's socket is open: the mark travels down it, so a closed one would drop the press. */
export function rowMenuFor(row: RowMenuSource | undefined, moves: RowMenuMoves, connected: boolean): RowMenuModel | null {
  if (!row) return null;
  return { ...moves, attention: attentionAction(row.status, row.markable && connected), parkable: row.parkable, parked: row.parked };
}
