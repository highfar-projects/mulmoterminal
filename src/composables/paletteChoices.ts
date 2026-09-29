// Settings the command palette switches directly (#2455): the theme, the app's language, and the
// attention sound. Pure — every input is a parameter, so which rows exist and which is current is a
// spec. Applying one is usePaletteChoices'.
import { UI_LANGUAGE_AUTO, type UiLanguage } from "./uiLanguage";
import { SORT_MODES, sortModeIcon } from "../components/sortModeButton";
import type { SortMode } from "../components/gridTabs";

export interface PaletteChoice {
  /** `theme:<id>`, `language:<code>` or `sound`. */
  id: string;
  icon: string;
  label: string;
  /** In effect now: choosing it again changes nothing. */
  current: boolean;
}

export interface ChoiceState {
  themes: readonly { id: string; label: string }[];
  themeId: string;
  languages: readonly { code: string; label: string }[];
  language: UiLanguage;
  soundOn: boolean;
  /** The grid's view settings, or null while no grid is mounted to switch them. */
  grid: { listMode: boolean; sortMode: SortMode } | null;
}

export interface ChoiceText {
  theme: (name: string) => string;
  language: (name: string) => string;
  autoLanguage: string;
  soundOff: string;
  soundOn: string;
  view: (name: string) => string;
  viewList: string;
  viewStrip: string;
  sort: (name: string) => string;
  sortLabel: (mode: SortMode) => string;
}

/** A choice id taken apart at its FIRST colon: a custom theme's id may hold one of its own. */
export function choiceTarget(id: string): { group: string; value: string } {
  const colon = id.indexOf(":");
  return colon < 0 ? { group: id, value: "" } : { group: id.slice(0, colon), value: id.slice(colon + 1) };
}

export function paletteChoices(state: ChoiceState, text: ChoiceText): PaletteChoice[] {
  const themes = state.themes.map((theme) => ({
    id: `theme:${theme.id}`,
    icon: "palette",
    label: text.theme(theme.label),
    current: theme.id === state.themeId,
  }));
  const languages = [{ code: UI_LANGUAGE_AUTO, label: text.autoLanguage }, ...state.languages].map((language) => ({
    id: `language:${language.code}`,
    icon: "translate",
    label: text.language(language.label),
    current: language.code === state.language,
  }));
  const sound = { id: "sound", icon: state.soundOn ? "volume_off" : "volume_up", label: state.soundOn ? text.soundOff : text.soundOn, current: false };
  return [...themes, ...languages, sound, ...gridChoices(state.grid, text)];
}

// Roster or strip while a terminal is enlarged (#2458), and the cell order the toolbar's menu sets.
function gridChoices(grid: ChoiceState["grid"], text: ChoiceText): PaletteChoice[] {
  if (grid === null) return [];
  const views = [
    { id: "view:list", icon: "view_agenda", label: text.view(text.viewList), current: grid.listMode },
    { id: "view:strip", icon: "view_carousel", label: text.view(text.viewStrip), current: !grid.listMode },
  ];
  const sorts = SORT_MODES.map((mode) => ({
    id: `sort:${mode}`,
    icon: sortModeIcon(mode),
    label: text.sort(text.sortLabel(mode)),
    current: mode === grid.sortMode,
  }));
  return [...views, ...sorts];
}
