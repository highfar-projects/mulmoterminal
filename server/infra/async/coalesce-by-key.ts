// Share one in-flight run per key, so callers asking the same question at the same moment
// run it once instead of N times (#2164).
//
// Deliberately NOT a cache: the entry lives exactly as long as the work does and is dropped
// the moment it settles. So a caller arriving after the previous run finished starts a fresh
// one, and nothing here can serve an answer staler than a single uncoalesced call already
// would. A TTL is a separate decision, and adding one would change what callers observe.
export interface CoalesceOptions {
  /** Start a new run rather than joining one in flight. For a caller that must observe
   *  something it just CAUSED: a run already in flight may have sampled the world before
   *  that happened, so joining it answers about the world before the change (#2164 review). */
  fresh?: boolean;
}

export function coalesceByKey<K, V>(): (key: K, run: () => Promise<V>, opts?: CoalesceOptions) => Promise<V> {
  const inFlight = new Map<K, Promise<V>>();
  return (key, run, opts) => {
    const running = opts?.fresh === true ? undefined : inFlight.get(key);
    if (running) return running;
    // The async wrapper turns a SYNCHRONOUS throw from `run` into a rejection, so the entry
    // below is always one that settles — a sync throw would otherwise skip `finally` and
    // leave the key wedged, refusing every later call for it.
    const started = (async () => await run())().finally(() => {
      // Only when THIS run is still the current one. A fresh run replaces the entry, and the
      // run it replaced must not delete its successor on the way out — that would send the
      // next caller off to start a third run while the second is still going.
      if (inFlight.get(key) === started) inFlight.delete(key);
    });
    inFlight.set(key, started);
    return started;
  };
}
