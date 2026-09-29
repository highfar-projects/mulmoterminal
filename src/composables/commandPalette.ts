// The command palette's state (#2266): whether it is open, and who runs what it picks. Module-level
// because the three parties are far apart — the toolbar opens it, the palette itself lists and
// picks, and the grid is the only thing that can run an action — and none of them owns the others.
import { ref, shallowRef } from "vue";
import type { KeymapAction } from "../../common/keymap";
import type { SortMode } from "../components/gridTabs";
import type { PaletteLaunchDir } from "./paletteLaunchDirs";
import type { PalettePromptSource } from "./palettePrompts";

/** The grid's side: run an action, and say what the rows need to know to be disabled — whether a
 *  terminal is enlarged, and whether the grid is in front at all. The toolbar (and so the palette)
 *  stays up over another view and over the launch panel, where the grid does not take keys either. */
export interface PaletteHost {
  run: (action: KeymapAction) => void;
  zoomed: () => boolean;
  available: () => boolean;
  /** Whether the grid is in manual order, the only one in which a terminal can be moved. */
  manualOrder: () => boolean;
  /** Whether the Files pane is up, which the tab actions need. */
  filesOpen: () => boolean;
}

export const paletteOpen = ref(false);
export const paletteHost = shallowRef<PaletteHost | null>(null);

export const openCommandPalette = (): void => {
  paletteOpen.value = true;
};
export const closeCommandPalette = (): void => {
  paletteOpen.value = false;
};

/** One of the grid's terminals, as a palette row names it (#2446). */
export interface PaletteTerminal {
  uid: number;
  /** Its directory, home-relative. */
  path: string;
  /** What else it is known by: the user's memo, the AI summary, or the agent. */
  detail: string;
  /** Text searched beside the path. */
  keywords: string;
}

/** The grid's terminals, and how to go to one. Registered apart from the host, which runs actions:
 *  a terminal row needs neither the grid in front nor its keyboard. */
export interface PaletteTerminals {
  list: () => readonly PaletteTerminal[];
  goTo: (uid: number) => void;
  /** The terminal a command acts on (#2465), or null when there is none. */
  current: () => number | null;
  /** The launch panel's directories (#2484): only the grid holds the loaded presets. */
  launchDirs: () => readonly PaletteLaunchDir[];
  /** Where the palette starts an agent or a launcher (#2487): the acting terminal's directory, else
   *  the workspace; null before either is known, when a start would have no directory to run in. */
  startDir: () => PaletteLaunchDir | null;
  /** Whose prompt history the palette lists, and where a picked prompt goes (#2523). */
  promptSource: () => PalettePromptSource | null;
  /** The sessions the grid already has open, which a resume row must not offer again (#2498). */
  openSessionIds: () => readonly string[];
  /** Whether the grid is at its terminal cap, where a launch would place nothing. */
  full: () => boolean;
}

export const paletteTerminals = shallowRef<PaletteTerminals | null>(null);

export function providePaletteTerminals(terminals: PaletteTerminals): () => void {
  paletteTerminals.value = terminals;
  return () => {
    if (paletteTerminals.value === terminals) paletteTerminals.value = null;
  };
}

/** The grid's view settings, switched from the palette (#2458): roster or strip while enlarged,
 *  and the cell order. Registered like the terminals — neither needs the grid in front. */
export interface PaletteGridView {
  listMode: () => boolean;
  toggleListMode: () => void;
  sortMode: () => SortMode;
  setSortMode: (mode: SortMode) => void;
}

export const paletteGridView = shallowRef<PaletteGridView | null>(null);

/** Register the grid as the palette's host; returns how to withdraw it. Withdrawing only clears the
 *  host it registered, so a remount that registers first is not undone by the old unmount. */
export function providePaletteHost(host: PaletteHost): () => void {
  paletteHost.value = host;
  return () => {
    if (paletteHost.value === host) paletteHost.value = null;
  };
}
