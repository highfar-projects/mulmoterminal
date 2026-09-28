// What a cell header's two pane menus list, decided from the cell's state alone.
//
// History: what happened in this session — the prompts you sent, the whole conversation, and what
// the agent ran (the Activity timeline, Claude only). Tools: views of things made outside the
// terminal — the tools the agent used, the Canvas, and this folder's collections — and, below
// them, restarting the agent.
//
// Panes only exist beside an ENLARGED cell, so on a tile they are listed disabled with the reason;
// the timeline is an overlay and works from a tile. A menu with nothing to choose is not shown.
import type { RightPane } from "./gridCell";

export type CellPaneMenuId = "prompts" | "transcript" | "timeline" | "tools" | "canvas" | "collections" | "restart";

export interface CellPaneMenuEntry {
  id: CellPaneMenuId;
  icon: string;
  label: string;
  detail: string;
  disabled: boolean;
  // Whether this pane is the one open beside the cell; undefined for an entry that is not a pane.
  checked?: boolean;
  // Drawn below a divider: an action on the cell, set apart from the views above it.
  separated?: boolean;
}

export interface CellPaneMenuState {
  expanded: boolean;
  rightPane: RightPane | null;
  canvasAvailable: boolean;
  collectionsAvailable: boolean;
  timelineAvailable: boolean;
  restartAvailable: boolean;
}

type Translate = (key: string) => string;

const ICONS: Record<CellPaneMenuId, string> = {
  prompts: "outbox",
  transcript: "chat",
  timeline: "timeline",
  tools: "build",
  canvas: "draw",
  collections: "database",
  restart: "restart_alt",
};

function paneEntry(id: CellPaneMenuId, state: CellPaneMenuState, t: Translate): CellPaneMenuEntry {
  return {
    id,
    icon: ICONS[id],
    label: t(`cellMenu.items.${id}.label`),
    detail: state.expanded ? t(`cellMenu.items.${id}.detail`) : t("cellMenu.enlargeFirst"),
    disabled: !state.expanded,
    checked: state.rightPane === id,
  };
}

export function historyEntries(state: CellPaneMenuState, t: Translate): CellPaneMenuEntry[] {
  const entries = [paneEntry("prompts", state, t), paneEntry("transcript", state, t)];
  if (state.timelineAvailable) {
    entries.push({
      id: "timeline",
      icon: ICONS.timeline,
      label: t("cellMenu.items.timeline.label"),
      detail: t("cellMenu.items.timeline.detail"),
      disabled: false,
    });
  }
  return entries;
}

export function toolEntries(state: CellPaneMenuState, t: Translate): CellPaneMenuEntry[] {
  const entries = [paneEntry("tools", state, t)];
  // Disabled rather than missing when this session has no render MCP: the reason is the fix.
  const canvas = paneEntry("canvas", state, t);
  if (state.expanded && !state.canvasAvailable) entries.push({ ...canvas, disabled: true, detail: t("cellMenu.canvasUnavailable") });
  else entries.push(canvas);
  // Missing rather than disabled without the collection tools — unless its pane is open, because
  // this entry is that pane's only close.
  if (state.collectionsAvailable || state.rightPane === "collections") entries.push(paneEntry("collections", state, t));
  // An action, not a view: it needs no room beside the cell, so it works from a tile too.
  if (state.restartAvailable) {
    entries.push({
      id: "restart",
      icon: ICONS.restart,
      label: t("cellMenu.items.restart.label"),
      detail: t("cellMenu.items.restart.detail"),
      disabled: false,
      separated: true,
    });
  }
  return entries;
}

/** A menu is worth an icon only when something in it can be chosen. */
export const hasChoice = (entries: CellPaneMenuEntry[]): boolean => entries.some((entry) => !entry.disabled);
