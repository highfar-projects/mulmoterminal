// Settings the command palette switches directly (#2455): the theme, the app's language, and the
// attention sound. Pure — every input is a parameter, so which rows exist and which is current is a
// spec. Applying one is usePaletteChoices'.
import { UI_LANGUAGE_AUTO, type UiLanguage } from "./uiLanguage";

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
}

export interface ChoiceText {
  theme: (name: string) => string;
  language: (name: string) => string;
  autoLanguage: string;
  soundOff: string;
  soundOn: string;
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
  return [...themes, ...languages, sound];
}
