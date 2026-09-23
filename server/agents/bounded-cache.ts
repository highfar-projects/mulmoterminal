// Remembering a bounded number of answers, for the readers that memoize one per session.
//
// Its own file because it is the only PURE part of those readers, and the property worth pinning —
// that the map cannot grow with every session a long-running server has ever rendered — needs no
// filesystem at all. Proving it through a reader meant writing 512 fixtures and 512 lookups, which
// took 45 seconds and would have made that file the first to go red on a loaded runner (#1314).
// The expensive half was never the code under test.

/**
 * Remember `value` under `key`, evicting the oldest entry when the map is already at `max`.
 *
 * Oldest INSERTED, not least recently used: a `Map` iterates in insertion order and nothing here
 * refreshes an entry on a hit. That is the right trade for these readers — the entry a live cell
 * asks about every few seconds is one the store answers cheaply anyway, where re-inserting on every
 * hit would cost a delete and an insert on the hot path to reorder a map nothing reads in order.
 *
 * Returns `value`, so a caller can `return remember(...)` in the branch that computed it.
 */
export function rememberBounded<T>(cache: Map<string, T>, key: string, value: T, max: number): T {
  // Deleting first, so replacing an existing key cannot evict a DIFFERENT entry: without it a
  // rewrite at capacity drops the oldest and then re-adds the same key, leaving the map one short
  // and a neighbour's answer gone for no reason.
  cache.delete(key);
  if (cache.size >= max) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
  return value;
}
