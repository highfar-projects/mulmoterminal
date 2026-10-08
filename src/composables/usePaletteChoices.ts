// The live side of paletteChoices: the current theme, language and sound, and applying a pick
// through the same setters Settings and the toolbar use.
import { computed, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { choiceTarget, paletteChoices, type PaletteChoice } from "./paletteChoices";
import { UI_LOCALES, isUiLocale, uiLanguage, UI_LANGUAGE_AUTO } from "./uiLanguage";
import { useSoundEnabled } from "./useSoundEnabled";
import { useTheme } from "./useTheme";
import { paletteGridView } from "./commandPalette";
import { isSortMode } from "../components/sortModeButton";

// Only a change is applied: the view switch is a toggle, and picking the current one must not flip it.
function applyGridChoice(group: string, value: string): void {
  const grid = paletteGridView.value;
  if (grid === null) return;
  if (group === "view" && (value === "list") !== grid.listMode()) grid.toggleListMode();
  else if (group === "sort" && isSortMode(value)) grid.setSortMode(value);
}

export function usePaletteChoices(): { choices: ComputedRef<PaletteChoice[]>; apply: (id: string) => void } {
  const { t } = useI18n();
  const { themeId, themes, setTheme } = useTheme();
  const sound = useSoundEnabled();
  const choices = computed(() =>
    paletteChoices(
      {
        themes: themes.value,
        themeId: themeId.value,
        languages: UI_LOCALES,
        language: uiLanguage.value,
        soundOn: sound.enabled.value,
        grid: paletteGridView.value ? { listMode: paletteGridView.value.listMode(), sortMode: paletteGridView.value.sortMode() } : null,
      },
      {
        theme: (name) => t("commandPalette.choices.theme", { name }),
        language: (name) => t("commandPalette.choices.language", { name }),
        autoLanguage: t("settings.language.auto"),
        soundOff: t("commandPalette.choices.soundOff"),
        soundOn: t("commandPalette.choices.soundOn"),
        view: (name) => t("commandPalette.choices.view", { name }),
        viewList: t("commandPalette.choices.viewList"),
        viewStrip: t("commandPalette.choices.viewStrip"),
        sort: (name) => t("commandPalette.choices.sort", { name }),
        sortLabel: (mode) => t(`sortMenu.modes.${mode}.label`),
      },
    ),
  );
  const apply = (id: string): void => {
    const { group, value } = choiceTarget(id);
    if (group === "theme") setTheme(value);
    else if (group === "language" && (value === UI_LANGUAGE_AUTO || isUiLocale(value))) uiLanguage.value = value;
    else if (group === "sound") sound.toggle();
    else applyGridChoice(group, value);
  };
  return { choices, apply };
}
