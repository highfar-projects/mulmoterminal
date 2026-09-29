// The palette's memory of what was picked (#2533), kept in this browser. A store that cannot be
// read or written only costs the ordering: every row then counts as never used.
import { frecencyScore, readFrecency, recordUse, type FrecencyStore } from "./paletteFrecency";

const STORAGE_KEY = "mt-palette-frecency";

function load(): FrecencyStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? readFrecency(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function usePaletteFrecency() {
  // Read once per opening: what this opening picks is recorded, and the next opening reads it.
  const store = load();
  const now = Date.now();
  const scoreOf = (key: string): number => frecencyScore(store[key], now);
  const remember = (key: string): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recordUse(load(), key, Date.now())));
    } catch {
      // Nothing to do: a browser that keeps nothing simply has no ordering.
    }
  };
  return { scoreOf, remember };
}
