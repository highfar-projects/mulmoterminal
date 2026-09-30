import { THEME_VAR_KEYS, normalizeHexColor, type CustomThemeInput, type ThemeVarKey, type ThemeVars } from "../../../common/themeVars";

// What the colour editor shows and saves, kept out of the component so it can be tested alone.

/** The colour a picker shows for `key`: the theme's own value, else its base's, as `#rrggbb` —
 *  the only form `<input type="color">` takes. A value it cannot read shows as black. */
export function pickerValue(key: ThemeVarKey, colors: Partial<ThemeVars>, resolved: ThemeVars | null): string {
  const own = colors[key];
  const shown = own ?? resolved?.[key] ?? "";
  return normalizeHexColor(shown) ?? "#000000";
}

/** The theme with the draft colours in place of its own, for painting before it is saved. */
export const withDraftColors = (theme: CustomThemeInput, draft: Partial<ThemeVars>): CustomThemeInput => ({ ...theme, colors: draft });

/** Whether the draft says something different from what is saved. */
export function draftDiffers(saved: Partial<ThemeVars>, draft: Partial<ThemeVars>): boolean {
  return THEME_VAR_KEYS.some((key) => (saved[key] ?? "") !== (draft[key] ?? ""));
}

/** The label a copy is offered with. */
export const copyLabel = (label: string, suffix: string): string => `${label} ${suffix}`.trim();
