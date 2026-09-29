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
import type { PaletteTerminal } from "./commandPalette";
import type { SettingsTabId } from "../components/settings/settingsTabs";
import type { PaletteChoice } from "./paletteChoices";
import { PALETTE_SCOPES, scopeOf, type ScopedKind } from "./paletteScope";

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

/** One of the grid's terminals, found by its path (#2446). Going to it needs no grid in front. */
export interface TerminalRow extends RowCommon {
  kind: "terminal";
  uid: number;
  icon: string;
}

/** A Settings section, opened in Settings (#2450). */
export interface SettingsRow extends RowCommon {
  kind: "settings";
  tab: SettingsTabId;
  icon: string;
}

/** A setting switched in place (#2455): a theme, a language, the sound. */
export interface ChoiceRow extends RowCommon {
  kind: "choice";
  id: string;
  icon: string;
}

/** A leading symbol offered by `?` (#2462): picking it narrows the search rather than running. */
export interface PrefixRow extends RowCommon {
  kind: "prefix";
  symbol: string;
  icon: string;
}

export type PaletteRow = ActionRow | ScreenRow | TerminalRow | SettingsRow | ChoiceRow | PrefixRow;

const SETTINGS_ICON = "settings";

/** What the palette can list beside the grid's actions. */
export interface PaletteSources {
  screens: readonly PaletteScreen[];
  terminals: readonly PaletteTerminal[];
  settings: readonly SettingsTabId[];
  choices: readonly PaletteChoice[];
}

const TERMINAL_ICON = "terminal";

/** A key that tells the rows apart across kinds, for `v-for` and tests. */
export const rowKey = (row: PaletteRow): string => {
  if (row.kind === "action") return row.action;
  if (row.kind === "settings") return `settings:${row.tab}`;
  if (row.kind === "choice") return `choice:${row.id}`;
  if (row.kind === "prefix") return `prefix:${row.symbol}`;
  return row.kind === "screen" ? `screen:${row.screen}` : `terminal:${row.uid}`;
};

export interface PaletteText {
  label: (action: KeymapAction) => string;
  description: (action: KeymapAction) => string;
  needsEnlarged: string;
  needsNothingEnlarged: string;
  needsManualOrder: string;
  gridHidden: string;
  screenLabel: (screen: PaletteScreen) => string;
  screenDescription: (screen: PaletteScreen) => string;
  settingsLabel: (tab: SettingsTabId) => string;
  openInSettings: string;
  currentChoice: string;
  switchChoice: string;
  scopeLabel: (kind: ScopedKind) => string;
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

type Candidate =
  | { kind: "action"; action: KeymapAction; name: string }
  | { kind: "screen"; screen: PaletteScreen; name: string }
  | { kind: "terminal"; terminal: PaletteTerminal; name: string }
  | { kind: "settings"; tab: SettingsTabId; name: string }
  | { kind: "choice"; choice: PaletteChoice; name: string };

// While the grid is in front its actions are what the palette is for; anywhere else only the
// screens can run, so they lead the unfiltered list.
function candidatesFor({ screens, terminals, settings, choices }: PaletteSources, state: PaletteState, text: PaletteText): Map<string, Candidate> {
  const actions = PALETTE_ACTIONS.map((action): [string, Candidate] => [
    `${text.label(action)} ${action}`,
    { kind: "action", action, name: text.label(action) },
  ]);
  const places = screens.map((screen): [string, Candidate] => [
    `${text.screenLabel(screen)} ${screen}`,
    { kind: "screen", screen, name: text.screenLabel(screen) },
  ]);
  // Two terminals can share a directory, so the uid keeps each candidate its own; it trails the
  // text anyone would type.
  const cells = terminals.map((terminal): [string, Candidate] => [
    `${terminal.path} ${terminal.keywords} #${terminal.uid}`,
    { kind: "terminal", terminal, name: terminal.path },
  ]);
  const sections = settings.map((tab): [string, Candidate] => [`${text.settingsLabel(tab)} ${tab}`, { kind: "settings", tab, name: text.settingsLabel(tab) }]);
  const switches = choices.map((choice): [string, Candidate] => [`${choice.label} ${choice.id}`, { kind: "choice", choice, name: choice.label }]);
  return new Map(state.available ? [...actions, ...cells, ...places, ...sections, ...switches] : [...places, ...cells, ...sections, ...switches, ...actions]);
}

function rowOf(candidate: Candidate, indexes: number[], keymap: Keymap, state: PaletteState, text: PaletteText): PaletteRow {
  const label = highlightParts(
    candidate.name,
    indexes.filter((index) => index < candidate.name.length),
  );
  if (candidate.kind === "choice") {
    const { choice } = candidate;
    return {
      kind: "choice",
      id: choice.id,
      icon: choice.icon,
      label,
      description: choice.current ? text.currentChoice : text.switchChoice,
      disabledReason: null,
    };
  }
  if (candidate.kind === "settings") {
    return { kind: "settings", tab: candidate.tab, icon: SETTINGS_ICON, label, description: text.openInSettings, disabledReason: null };
  }
  if (candidate.kind === "terminal") {
    return { kind: "terminal", uid: candidate.terminal.uid, icon: TERMINAL_ICON, label, description: candidate.terminal.detail, disabledReason: null };
  }
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
export function paletteRows(query: string, keymap: Keymap, state: PaletteState, text: PaletteText, sources: PaletteSources): PaletteRow[] {
  const scope = scopeOf(query);
  if (scope.help) return prefixRows(text);
  const all = candidatesFor(sources, state, text);
  const byCandidate = scope.only === null ? all : new Map([...all].filter(([, candidate]) => candidate.kind === scope.only));
  return rankPaths([...byCandidate.keys()], scope.rest, byCandidate.size).flatMap((match) => {
    const candidate = byCandidate.get(match.path);
    return candidate === undefined ? [] : [rowOf(candidate, match.indexes, keymap, state, text)];
  });
}

const PREFIX_ICON = "filter_alt";

/** What `?` lists: each symbol, and what it narrows the search to. */
function prefixRows(text: PaletteText): PaletteRow[] {
  return PALETTE_SCOPES.map(({ symbol, kind }) => ({
    kind: "prefix",
    symbol,
    icon: PREFIX_ICON,
    label: [{ text: text.scopeLabel(kind), hit: false }],
    description: symbol,
    disabledReason: null,
  }));
}
