// Where the config file's aliases and favorites put rows (#2540). Pure: rows in, rows out, by key.
import { normalizeAlias, type PaletteAliases } from "../../common/paletteConfig";

/** Every alias written for a row, by the row's key: searched as part of that row. */
export function aliasesByKey(aliases: PaletteAliases): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  Object.entries(aliases).forEach(([alias, key]) => byKey.set(key, [...(byKey.get(key) ?? []), alias]));
  return byKey;
}

/** The row an alias names, when the query IS that alias (ignoring case and spaces around it). */
export function aliasTarget(aliases: PaletteAliases, query: string): string | null {
  const wanted = normalizeAlias(query);
  if (wanted === "") return null;
  return Object.entries(aliases).find(([alias]) => normalizeAlias(alias) === wanted)?.[1] ?? null;
}

/** Favorites first when nothing is typed, in the order written; then an exact alias above all.
 *  Everything else keeps the order it came in. */
export function pinRows<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  pins: { favorites: readonly string[]; nothingTyped: boolean; aliased: string | null },
): T[] {
  const favoriteRank = (row: T): number => (pins.nothingTyped ? pins.favorites.indexOf(keyOf(row)) : -1);
  const favorites = rows.filter((row) => favoriteRank(row) >= 0).sort((a, b) => favoriteRank(a) - favoriteRank(b));
  const ordered = [...favorites, ...rows.filter((row) => favoriteRank(row) < 0)];
  const aliased = ordered.find((row) => pins.aliased !== null && keyOf(row) === pins.aliased);
  return aliased === undefined ? ordered : [aliased, ...ordered.filter((row) => row !== aliased)];
}
