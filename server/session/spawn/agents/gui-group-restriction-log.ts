// Which GUI tool groups a session was limited to at spawn (#3033), as read from and written to disk.
//
// It has to OUTLIVE the pty for the same reason the custom-agent log next door does: the transcript
// does. A restricted worker that exits and is resumed from its cell reconnects with `?gui=0`, and
// nothing in that request says it was ever restricted — so without this record the resumed session
// would quietly get every tool its directory registered.
//
// Its OWN append log, for the reasons custom-agent-log.ts gives: several instances and several
// builds share ~/.mulmoterminal, and an append needs no read-merge-write.
import { isToolGroup, type ToolGroup } from "../../../../common/toolGroups.js";

export interface GuiGroupRestriction {
  sessionId: string;
  /** The groups the session may use. Empty means no GUI tool at all. */
  groups: readonly ToolGroup[];
}

/** One line of the log. */
export function guiGroupRestrictionLine(record: GuiGroupRestriction): string {
  return `${JSON.stringify(record)}\n`;
}

/** The record a parsed line holds, or null for anything unusable. A group this build does not know
 *  is dropped from the list rather than voiding the line: a voided line reads as "never restricted",
 *  which would hand the session every tool. */
export function guiGroupRestrictionRecord(parsed: Record<string, unknown>, isValidSessionId: (id: string) => boolean): GuiGroupRestriction | null {
  const { sessionId, groups } = parsed;
  if (typeof sessionId !== "string" || !isValidSessionId(sessionId)) return null;
  if (!Array.isArray(groups)) return null;
  return { sessionId, groups: [...new Set(groups.filter(isToolGroup))] };
}

/** Fold one record into the map: the newest line for a session wins. */
export function applyGuiGroupRestriction(restrictions: Map<string, readonly ToolGroup[]>, record: GuiGroupRestriction): void {
  restrictions.set(record.sessionId, record.groups);
}
