// The last ROOT listing the Files pane read for each directory, so coming back paints instead of
// waiting (#2148). Stage 1 stopped the pane calling a directory empty before it had read it; this
// is the wait itself — every open and every re-root as the zoom walks between cells costs a round
// trip, and the pane has usually seen that directory before.
//
// Its own key rather than a field on `files_pane_state`: a listing is far bigger than the paths
// beside it, and localStorage answers a quota failure by failing the whole write. Sharing would let
// one large tree cost every other directory its remembered open file.
import { isRecord } from "../../common/isRecord";
import { isUnknownArray } from "../../common/isUnknownArray";

const KEY = "files_tree_cache";

/** Directories kept, newest first — an LRU, so the projects in rotation stay and the one opened
 *  once does not push them out. */
export const MAX_CACHED_DIRS = 12;

/** Entries kept per directory. A node_modules root is thousands of names, and painting the first
 *  screen needs a screen's worth: past this the cache costs storage that other directories need
 *  and buys pixels nobody scrolls to before the real listing lands. */
export const MAX_CACHED_ENTRIES = 300;

/** One row of a listing, as the pane's `makeNode` consumes it. */
export interface CachedEntry {
  name: string;
  dir: boolean;
  size: number;
}

export interface CachedListing {
  cwd: string;
  entries: CachedEntry[];
}

const isCachedEntry = (value: unknown): value is CachedEntry =>
  isRecord(value) && typeof value.name === "string" && typeof value.dir === "boolean" && typeof value.size === "number";

const isCachedListing = (value: unknown): value is CachedListing => {
  if (!isRecord(value)) return false;
  return typeof value.cwd === "string" && value.cwd !== "" && isUnknownArray(value.entries) && value.entries.every(isCachedEntry);
};

const capped = (listing: CachedListing): CachedListing => ({ cwd: listing.cwd, entries: listing.entries.slice(0, MAX_CACHED_ENTRIES) });

/** Read back what was stored. Anything unparseable or the wrong shape is dropped rather than
 *  thrown: this is a cache, and a bad entry must cost a paint, never a working pane. */
export function parseTreeCache(raw: string | null): CachedListing[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isUnknownArray(parsed)) return [];
    return parsed.filter(isCachedListing).slice(0, MAX_CACHED_DIRS).map(capped);
  } catch {
    return []; // not JSON at all — a foreign or half-written value
  }
}

/** `cache` with `cwd`'s listing at the front, its previous entry removed. Newest-first is what
 *  makes the cap an LRU rather than an arbitrary truncation. */
export function rememberListing(cache: CachedListing[], cwd: string, entries: CachedEntry[]): CachedListing[] {
  return [capped({ cwd, entries }), ...cache.filter((entry) => entry.cwd !== cwd)].slice(0, MAX_CACHED_DIRS);
}

/** What this directory looked like last time, or null when it is not cached. */
export function recallListing(cache: CachedListing[], cwd: string | null): CachedEntry[] | null {
  if (!cwd) return null;
  return cache.find((entry) => entry.cwd === cwd)?.entries ?? null;
}

// Storage can throw (private mode, storage-blocked contexts) and can be full. Both are survivable
// here in a way they are not for the pane's state: the cost of a failed cache is a spinner.
const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const write = (value: string): void => {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Full or blocked. The next read simply finds nothing for this directory.
  }
};

/** The two the pane calls. Kept beside the pure half so a caller cannot forget the caps. */
export const cachedListingFor = (cwd: string | null): CachedEntry[] | null => recallListing(parseTreeCache(read()), cwd);

export const cacheListing = (cwd: string | null, entries: CachedEntry[]): void => {
  if (!cwd) return;
  write(JSON.stringify(rememberListing(parseTreeCache(read()), cwd, entries)));
};
