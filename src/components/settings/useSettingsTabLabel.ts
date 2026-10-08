// What a Settings section is called wherever it is listed: the sidebar, and the command palette
// (#2450), so the two cannot drift.
//
// The LANGUAGE entry carries its English beside it, and it is the only one that does (#2204). It
// is not a preference for bilingual labels: it is the way back for somebody who picked a language
// they cannot read, and they have to find this row in a list written entirely in that language
// before the picker's endonyms can help them. Every other row is reachable once they are back.
import { useI18n } from "vue-i18n";
import { withEnglish } from "../../i18n/englishAnchor";
import type { SettingsTabId } from "./settingsTabs";

export function useSettingsTabLabel(): (id: SettingsTabId) => string {
  const { t, locale } = useI18n();
  return (id) =>
    id === "language" ? withEnglish(t(`settings.tabs.${id}`), t(`settings.tabs.${id}`, {}, { locale: "en" }), locale.value) : t(`settings.tabs.${id}`);
}
