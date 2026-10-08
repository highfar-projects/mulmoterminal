// What one edit does to a list of strings in a directory's config (#2725, #2728) — `addDirs`, `skills`
// and `decks` — kept apart from the editor so each rule is tested without mounting it.

/** The list with entry `index` rewritten; an emptied entry is removed rather than kept empty. */
export function withEntryReplaced(items: readonly string[], index: number, text: string): string[] {
  const value = text.trim();
  return value === "" ? items.filter((_, at) => at !== index) : items.map((item, at) => (at === index ? value : item));
}

export const withEntryRemoved = (items: readonly string[], index: number): string[] => items.filter((_, at) => at !== index);

/** The list with `text` added at the end, or null when there is nothing to add or it is already there. */
export function withEntryAdded(items: readonly string[], text: string): string[] | null {
  const value = text.trim();
  return value === "" || items.includes(value) ? null : [...items, value];
}

/** The list with entry `index` swapped with its neighbour; unchanged at either end. */
export function withEntryMoved(items: readonly string[], index: number, delta: -1 | 1): string[] {
  const other = index + delta;
  if (index < 0 || index >= items.length || other < 0 || other >= items.length) return [...items];
  return items.map((item, at) => {
    if (at === index) return items[other] ?? item;
    return at === other ? (items[index] ?? item) : item;
  });
}
