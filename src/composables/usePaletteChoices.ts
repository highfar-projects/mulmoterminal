// The live side of paletteChoices: the current theme, language and sound, and applying a pick
// through the same setters Settings and the toolbar use.
import { computed, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { choiceTarget, paletteChoices, type PaletteChoice } from "./paletteChoices";
import { UI_LOCALES, isUiLocale, uiLanguage, UI_LANGUAGE_AUTO } from "./uiLanguage";
import { useSoundEnabled } from "./useSoundEnabled";
import { useTheme } from "./useTheme";

export function usePaletteChoices(): { choices: ComputedRef<PaletteChoice[]>; apply: (id: string) => void } {
  const { t } = useI18n();
  const { themeId, themes, setTheme } = useTheme();
  const sound = useSoundEnabled();
  const choices = computed(() =>
    paletteChoices(
      { themes: themes.value, themeId: themeId.value, languages: UI_LOCALES, language: uiLanguage.value, soundOn: sound.enabled.value },
      {
        theme: (name) => t("commandPalette.choices.theme", { name }),
        language: (name) => t("commandPalette.choices.language", { name }),
        autoLanguage: t("settings.language.auto"),
        soundOff: t("commandPalette.choices.soundOff"),
        soundOn: t("commandPalette.choices.soundOn"),
      },
    ),
  );
  const apply = (id: string): void => {
    const { group, value } = choiceTarget(id);
    if (group === "theme") setTheme(value);
    else if (group === "language" && (value === UI_LANGUAGE_AUTO || isUiLocale(value))) uiLanguage.value = value;
    else if (group === "sound") sound.toggle();
  };
  return { choices, apply };
}
