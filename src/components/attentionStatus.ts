// Whose turn it is on a session, for every panel that lists sessions: the grid's cells, the
// cockpit roster, the sidebar and the tab bar.
//
// It lived in `gridTabs.ts` as `CellStatus` while the grid was the only reader. The sidebar and the
// tab bar need the same split (#1139) and a session row is not a cell, so the rule moves here —
// the same reason `cellPriority` moved out to `dirPriorityOrder.ts` in #1098 once the launcher
// chips had to order themselves the way the grid does.
//
// `blocked` (needs input or permission) and `done` (finished a turn, output unreviewed) both arrive
// as the server's one `waiting` flag; only the hook that set it tells them apart. Keeping that
// distinction in one function is what stops two panels from disagreeing about what a row means.
export type AttentionStatus = "blocked" | "done" | "working" | "idle";

// `waiting` means "needs the user"; the `event` that set it distinguishes a permission/question
// pause ("Notification" → blocked, the most urgent) from a finished-but-unreviewed turn
// ("Stop" → done). Anything else waiting — an older agent that sends no event, a hook we do not
// model — reads as done: it is the safer of the two, since it does not claim the session is stuck.
export function activityStatus(working: boolean, waiting: boolean, event: string | null | undefined): AttentionStatus {
  if (waiting) return event === "Notification" ? "blocked" : "done";
  if (working) return "working";
  return "idle";
}

// The two ways this status is WORDED, as i18n keys (#2182). Both live here rather than one in each
// component, because both key off the enum above and a state added to it has to be answered by
// both — a table in a component is a table nothing can test without mounting it.
//
// Keys are spelled out per state rather than derived from the state name, and the `Record` types
// are explicit: together they are what makes a new `AttentionStatus` a compile error here instead
// of a key path on a user's screen (#1894).
//
// `_KEY` is in the names on purpose. These are not the words — reading one into a template without
// `t()` renders `status.cell.idle`, which is a mistake the name should make visible.

/** The roster badge's single word. */
export const ROSTER_STATUS_KEY: Record<AttentionStatus, string> = {
  working: "status.attention.working",
  blocked: "status.attention.blocked",
  done: "status.attention.done",
  idle: "status.attention.idle",
};

/** The cell header's longer form — it has room for a short phrase. */
export const CELL_STATUS_KEY: Record<AttentionStatus, string> = {
  blocked: "status.cell.blocked",
  done: "status.cell.done",
  working: "status.cell.working",
  idle: "status.cell.idle",
};
