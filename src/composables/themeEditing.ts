import { isThemeProblem, type ThemeProblem } from "../../common/themeEntries";
import { postEntryChange, type EntryChange } from "./configEntryChange";
import { setCustomThemes } from "./customThemes";
import { refreshTheme } from "./useTheme";

// A custom theme copied, recoloured or removed on the server (#2623), which answers the list as it
// now holds it. The painted theme is redone from that list, so a save leaves no preview behind.
export type ThemeAction = "duplicate" | "colors" | "remove";

export async function changeCustomThemes(action: ThemeAction, payload: Record<string, unknown>): Promise<EntryChange<ThemeProblem>> {
  const change = await postEntryChange(`/api/config/themes/${action}`, payload, isThemeProblem);
  if (change.ok) {
    setCustomThemes(change.body.themes);
    refreshTheme();
  }
  return change;
}
