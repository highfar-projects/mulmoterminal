// What the command palette lists (#2266), with no DOM, no i18n instance and no state of its own —
// every input is a parameter, so every rule below is a spec.
import {
  KEYMAP_ACTIONS,
  NEEDS_A_CURRENT_TERMINAL,
  NEEDS_MANUAL_ORDER,
  NEEDS_NOTHING_ENLARGED,
  TERMINAL_SCOPED_ACTIONS,
  type Keymap,
  type KeymapAction,
} from "../../common/keymap";
import { highlightParts, rankPaths, type HighlightPart } from "../components/filePathMatch";
import { SCREEN_ICONS, type PaletteScreen } from "./paletteScreens";

/** The actions a palette can run. Not `copy` / `paste` — they act on a terminal's selection, from
 *  inside it — and not the palette itself. */
export const PALETTE_ACTIONS: readonly KeymapAction[] = KEYMAP_ACTIONS.filter(
  (action) => !TERMINAL_SCOPED_ACTIONS.includes(action) && action !== "command-palette",
);

interface RowCommon {
  /** The row's name, split into the runs the query matched. */
  label: HighlightPart[];
  description: string;
  /** Why it cannot run right now, or null when it can. */
  disabledReason: string | null;
}

/** A grid action, run by the grid. */
export interface ActionRow extends RowCommon {
  kind: "action";
  action: KeymapAction;
  /** The user's binding as they wrote it, or null when the action has none. */
  binding: string | null;
}

/** A screen to go to (#2441). It needs no grid, so it is never disabled. */
export interface ScreenRow extends RowCommon {
  kind: "screen";
  screen: PaletteScreen;
  icon: string;
}

export type PaletteRow = ActionRow | ScreenRow;

/** A key that tells the rows apart across kinds, for `v-for` and tests. */
export const rowKey = (row: PaletteRow): string => (row.kind === "action" ? row.action : `screen:${row.screen}`);

export interface PaletteText {
  label: (action: KeymapAction) => string;
  description: (action: KeymapAction) => string;
  needsEnlarged: string;
  needsNothingEnlarged: string;
  needsManualOrder: string;
  gridHidden: string;
  screenLabel: (screen: PaletteScreen) => string;
  screenDescription: (screen: PaletteScreen) => string;
}

/** The grid's state, as far as the rows care. */
export interface PaletteState {
  zoomed: boolean;
  /** Whether the grid is in front and taking keys; false over another view or the launch panel. */
  available: boolean;
  manualOrder: boolean;
}

const disabledReason = (action: KeymapAction, { zoomed, available, manualOrder }: PaletteState, text: PaletteText): string | null => {
  if (!available) return text.gridHidden;
  if (NEEDS_MANUAL_ORDER.includes(action) && !manualOrder) return text.needsManualOrder;
  if (NEEDS_A_CURRENT_TERMINAL.includes(action) && !zoomed) return text.needsEnlarged;
  if (NEEDS_NOTHING_ENLARGED.includes(action) && zoomed) return text.needsNothingEnlarged;
  return null;
};

type Candidate = { kind: "action"; action: KeymapAction; name: string } | { kind: "screen"; screen: PaletteScreen; name: string };

// While the grid is in front its actions are what the palette is for; anywhere else only the
// screens can run, so they lead the unfiltered list.
function candidatesFor(screens: readonly PaletteScreen[], state: PaletteState, text: PaletteText): Map<string, Candidate> {
  const actions = PALETTE_ACTIONS.map((action): [string, Candidate] => [
    `${text.label(action)} ${action}`,
    { kind: "action", action, name: text.label(action) },
  ]);
  const places = screens.map((screen): [string, Candidate] => [
    `${text.screenLabel(screen)} ${screen}`,
    { kind: "screen", screen, name: text.screenLabel(screen) },
  ]);
  return new Map(state.available ? [...actions, ...places] : [...places, ...actions]);
}

function rowOf(candidate: Candidate, indexes: number[], keymap: Keymap, state: PaletteState, text: PaletteText): PaletteRow {
  const label = highlightParts(
    candidate.name,
    indexes.filter((index) => index < candidate.name.length),
  );
  if (candidate.kind === "screen") {
    return {
      kind: "screen",
      screen: candidate.screen,
      icon: SCREEN_ICONS[candidate.screen],
      label,
      description: text.screenDescription(candidate.screen),
      disabledReason: null,
    };
  }
  const { action } = candidate;
  return {
    kind: "action",
    action,
    label,
    description: text.description(action),
    binding: keymap[action] ?? null,
    disabledReason: disabledReason(action, state, text),
  };
}

/** The rows for this query, best first. An action's id and a screen's id are searched as well as
 *  the name, so typing the name the config uses (`files-find`) finds it too; only the name is
 *  highlighted. */
export function paletteRows(query: string, keymap: Keymap, state: PaletteState, text: PaletteText, screens: readonly PaletteScreen[]): PaletteRow[] {
  const byCandidate = candidatesFor(screens, state, text);
  return rankPaths([...byCandidate.keys()], query, byCandidate.size).flatMap((match) => {
    const candidate = byCandidate.get(match.path);
    return candidate === undefined ? [] : [rowOf(candidate, match.indexes, keymap, state, text)];
  });
}
