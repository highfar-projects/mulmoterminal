// What the `mark-unread` key does (#2335): the roster row menu's unread / read toggle (#2299),
// aimed at the enlarged cell, or at the one holding the cursor when nothing is enlarged.
import type { AttentionStatus } from "./attentionStatus";
import { attentionAction } from "./rowMenu";

export interface MarkableRow {
  uid: number;
  status: AttentionStatus;
  markable: boolean;
}

export interface MarkUnreadTarget {
  uid: number;
  /** true marks it unread (waiting), false marks it read. */
  waiting: boolean;
}

/** The cell to mark and which way, or null when the key has nothing to act on. `connected` is
 *  asked because the mark travels down the cell's socket — a closed one would drop it silently. */
export function markUnreadTarget(
  rows: readonly MarkableRow[],
  expandedUid: number | null,
  focusedUid: number | null,
  connected: (uid: number) => boolean,
): MarkUnreadTarget | null {
  const uid = expandedUid ?? focusedUid;
  const row = uid === null ? undefined : rows.find((r) => r.uid === uid);
  if (!row) return null;
  const action = attentionAction(row.status, row.markable && connected(row.uid));
  return action === null ? null : { uid: row.uid, waiting: action === "unread" };
}
