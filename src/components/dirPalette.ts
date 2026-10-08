// A directory's terminal palette (`colors`) as the Settings form edits it (#2724): read from what the
// file holds, and changed one colour at a time.
import { isRecord } from "../../common/isRecord";
import { PALETTE_COLOR_RE, THEME_COLOR_KEYS, type ThemeColorKey } from "../../common/themeColors";
import { normalizeHexColor } from "../../common/themeVars";

export type DirPalette = Partial<Record<ThemeColorKey, string>>;

/** The entries of the file's `colors` the terminal would use — a known key with a colour xterm
 *  reads. Anything else is not shown, and a save writes the set without it. */
export function paletteFromValue(value: unknown): DirPalette {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    THEME_COLOR_KEYS.flatMap((key) => (typeof value[key] === "string" && PALETTE_COLOR_RE.test(value[key]) ? [[key, value[key]]] : [])),
  );
}

/** The palette with `key` set to `color`, or without it when `color` is null. */
export function withPaletteColor(palette: DirPalette, key: ThemeColorKey, color: string | null): DirPalette {
  const rest: DirPalette = Object.fromEntries(Object.entries(palette).filter(([name]) => name !== key));
  return color === null ? rest : { ...rest, [key]: color };
}

// What a picker starts on for a colour the file does not set: `<input type="color">` has no empty
// state, so the row says "not set" beside it.
const UNSET_PICKER_START = "#808080";

/** The `#rrggbb` a picker can show. A short or alpha form is widened; the alpha is dropped, and
 *  picking a colour writes `#rrggbb` in its place. */
export const pickerColor = (color: string | undefined): string => (color === undefined ? UNSET_PICKER_START : (normalizeHexColor(color) ?? UNSET_PICKER_START));
