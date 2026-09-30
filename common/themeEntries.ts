import { THEME_IDS, type ThemeId } from "./themeIds.js";
import { THEME_VAR_KEYS, isBuiltinThemeId, type ThemeVarKey } from "./themeVars.js";
import { isPaletteColor, type ThemeColorKey } from "./themeColors.js";
import { isRecord } from "./isRecord.js";

// A custom theme made and changed in Settings (#2623): one theme at a time, against the list on
// disk. A new theme is always a COPY of one that exists — a built-in becomes a theme that extends it
// with no colours of its own yet, a custom one is copied whole — so it can be painted from the start.

export const CUSTOM_THEMES_MAX = 24;
const ID_MAX = 32;
/** The same cap the config schema holds a theme's label to. */
export const THEME_LABEL_MAX = 40;

export const THEME_PROBLEMS = ["source", "label", "full", "missing", "colors"] as const;
export type ThemeProblem = (typeof THEME_PROBLEMS)[number];
export const isThemeProblem = (value: unknown): value is ThemeProblem => THEME_PROBLEMS.some((problem) => problem === value);

/** A theme as either side holds it: the client's `CustomThemeInput`, or the server's parsed entry,
 *  whose optional fields may be present and undefined. */
export interface ThemeEntry {
  id: string;
  label: string;
  extends?: ThemeId | undefined;
  colors: Partial<Record<ThemeVarKey, string>>;
  term?: Partial<Record<ThemeColorKey, string>> | undefined;
}

type Built = { theme: ThemeEntry } | { problem: ThemeProblem };

const isThemeVarKey = (key: string): key is ThemeVarKey => THEME_VAR_KEYS.some((known) => known === key);

/** The first free id of `<base>-copy`, `<base>-copy-2`, …, each cut to fit. */
export function copyId(base: string, taken: readonly string[]): string {
  const candidates = Array.from({ length: taken.length + 1 }, (_, i) => {
    const suffix = i === 0 ? "-copy" : `-copy-${i + 1}`;
    return `${base.slice(0, ID_MAX - suffix.length)}${suffix}`;
  });
  return candidates.find((id) => !taken.includes(id) && !isBuiltinThemeId(id)) ?? `${base.slice(0, ID_MAX - 5)}-copy`;
}

/** A copy of `sourceId` — a built-in or one of `existing` — named `label`. */
export function duplicateTheme(sourceId: string, label: string, existing: readonly ThemeEntry[]): Built {
  const cleanLabel = label.trim();
  if (existing.length >= CUSTOM_THEMES_MAX) return { problem: "full" };
  if (!cleanLabel || cleanLabel.length > THEME_LABEL_MAX) return { problem: "label" };
  const id = copyId(
    sourceId,
    existing.map((theme) => theme.id),
  );
  const builtin: ThemeId | undefined = THEME_IDS.find((known) => known === sourceId);
  if (builtin) return { theme: { id, label: cleanLabel, extends: builtin, colors: {} } };
  const custom = existing.find((theme) => theme.id === sourceId);
  if (!custom) return { problem: "source" };
  const copy: ThemeEntry = { id, label: cleanLabel, colors: { ...custom.colors } };
  if (custom.extends) copy.extends = custom.extends;
  if (custom.term) copy.term = { ...custom.term };
  return { theme: copy };
}

/** The colours a caller sent, kept only when every key is a theme variable and every value a colour. */
export function themeColorsFrom(value: unknown): Partial<Record<ThemeVarKey, string>> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (!entries.every(([key, color]) => isThemeVarKey(key) && isPaletteColor(color))) return null;
  return Object.fromEntries(entries);
}

/** `existing` with theme `id`'s colours replaced. A theme with no base must still set every one. */
export function themesWithColors(
  existing: readonly ThemeEntry[],
  id: string,
  colors: Partial<Record<ThemeVarKey, string>>,
): { themes: ThemeEntry[] } | { problem: ThemeProblem } {
  const target = existing.find((theme) => theme.id === id);
  if (!target) return { problem: "missing" };
  if (!target.extends && !THEME_VAR_KEYS.every((key) => colors[key])) return { problem: "colors" };
  return { themes: existing.map((theme) => (theme.id === id ? { ...theme, colors } : theme)) };
}
