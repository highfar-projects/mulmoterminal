// The command palette's own settings in the global config (#2540): short names for rows, and rows
// pinned to the top. Both name a row by the key the palette gives it (`zoom-toggle`, `screen:wiki`,
// `github:pr:owner/repo#12`, …). Sanitized the same way on both sides of the wire.
import { isRecord } from "./isRecord.js";

/** `{ "<alias>": "<row key>" }`. */
export type PaletteAliases = Record<string, string>;

export const MAX_PALETTE_ALIASES = 200;
export const MAX_PALETTE_FAVORITES = 50;
/** Longer than any key the palette makes; a longer string is not one of them. */
export const MAX_PALETTE_KEY_CHARS = 512;

const usable = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value.length <= MAX_PALETTE_KEY_CHARS;

/** How an alias is compared: case and surrounding spaces do not count. */
export const normalizeAlias = (alias: string): string => alias.trim().toLowerCase();

export function sanitizePaletteAliases(raw: unknown): PaletteAliases {
  if (!isRecord(raw)) return {};
  const pairs = Object.entries(raw).filter((pair): pair is [string, string] => usable(pair[0]) && usable(pair[1]));
  return Object.fromEntries(pairs.slice(0, MAX_PALETTE_ALIASES).map(([alias, key]) => [alias.trim(), key.trim()]));
}

export function sanitizePaletteFavorites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const keys = raw.filter(usable).map((key) => key.trim());
  return [...new Set(keys)].slice(0, MAX_PALETTE_FAVORITES);
}
