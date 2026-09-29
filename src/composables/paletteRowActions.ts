// The second panel's actions on one palette row (#2546): what Tab offers. Pure.

export type RowActionId = "run" | "favorite-add" | "favorite-remove" | "copy-key";

export interface RowAction {
  id: RowActionId;
  icon: string;
  disabledReason: string | null;
}

// The kinds whose key may be written into `paletteAliases` / `paletteFavorites`: the ones the keys
// skill lists. A terminal, a launcher start and a past prompt are numbered by position, and a
// hand-off or a symbol never reaches an alias or a favorite.
const WRITABLE_KINDS: ReadonlySet<string> = new Set(["action", "screen", "settings", "choice", "launch", "command", "collection", "resume", "wiki", "github"]);

export const isWritableKey = (row: { kind: string; start?: { kind: string } }): boolean =>
  WRITABLE_KINDS.has(row.kind) || (row.kind === "start" && row.start?.kind === "agent");

export function rowActions(
  row: { kind: string; disabledReason: string | null; start?: { kind: string } },
  key: string,
  favorites: readonly string[],
): RowAction[] {
  const run: RowAction = { id: "run", icon: "play_arrow", disabledReason: row.disabledReason };
  if (!isWritableKey(row)) return [run];
  const favorite: RowAction = favorites.includes(key)
    ? { id: "favorite-remove", icon: "star_off", disabledReason: null }
    : { id: "favorite-add", icon: "star", disabledReason: null };
  return [run, favorite, { id: "copy-key", icon: "content_copy", disabledReason: null }];
}

/** The favorites with `key` added at the end, or taken out if it was there. */
export const toggledFavorites = (favorites: readonly string[], key: string): string[] =>
  favorites.includes(key) ? favorites.filter((favorite) => favorite !== key) : [...favorites, key];
