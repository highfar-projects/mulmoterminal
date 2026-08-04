// Two memos keyed by a file's (mtime, size). `createFileCache` reuses a derived value while the
// file is unchanged and recomputes when it is written; `createAppendFileCache` goes further for an
// append-only input, remembering where the last scan stopped so a file that GREW costs only the
// bytes that were added. Purpose-built for session transcripts, whose `.jsonl` is append-only and
// can be hundreds of MB — re-reading and re-parsing one on every window focus / grid-cell refresh
// stalls the event loop, and re-reading FIFTY of them is what made the session list take 5 s
// (#1377).
//
// `size` guards the sub-millisecond case where a file is rewritten within the same mtime
// tick; together (mtime, size) is a cheap, good-enough freshness stamp (a full content hash
// would defeat the point — we're avoiding reading the file at all on a hit).

export interface FileStamp {
  mtimeMs: number;
  size: number;
}

const sameStamp = (a: FileStamp, b: FileStamp): boolean => a.mtimeMs === b.mtimeMs && a.size === b.size;

export interface FileCache<T> {
  get(key: string, stamp: FileStamp): T | undefined;
  set(key: string, stamp: FileStamp, value: T): void;
}

// Bounded by `max` entries with rough-LRU eviction (a hit/refresh moves the key to the end,
// so the oldest untouched key is evicted first), so a machine that has opened thousands of
// sessions doesn't retain every summary forever.
export function createFileCache<T>(max = 500): FileCache<T> {
  const entries = createLruStore<{ stamp: FileStamp; value: T }>(max);
  return {
    get(key, stamp) {
      const hit = entries.get(key);
      return hit && sameStamp(hit.stamp, stamp) ? hit.value : undefined;
    },
    set(key, stamp, value) {
      entries.set(key, { stamp, value });
    },
  };
}

/** What a partially-folded, append-only file left behind: everything folded so far, and the byte
 *  the next scan resumes at. */
export interface AppendScan<T> {
  from: number;
  value: T;
}

/** The same memo for a value folded out of an APPEND-ONLY file, where an unchanged file is not the
 *  only cheap case: a file that merely GREW can be caught up by folding the new bytes, instead of
 *  being read from the start (#1377 — the session list was re-reading gigabytes it had read).
 *
 *  Nothing is resumable when the file got SHORTER (truncated, or replaced by a shorter one), nor
 *  when it stayed the same length but was written again — a same-size rewrite is the case mtime
 *  catches here, mirroring how size catches a same-mtime rewrite above. A file rewritten wholesale
 *  into something LONGER still reads as an append; that is the same (mtime, size) approximation
 *  `createFileCache` already makes, and a transcript is only ever appended to. */
export interface AppendFileCache<T> {
  resume(key: string, stamp: FileStamp): AppendScan<T> | undefined;
  set(key: string, stamp: FileStamp, from: number, value: T): void;
}

export function createAppendFileCache<T>(max = 500): AppendFileCache<T> {
  const entries = createLruStore<{ stamp: FileStamp; scan: AppendScan<T> }>(max);
  return {
    resume(key, stamp) {
      const hit = entries.get(key);
      if (!hit || stamp.size < hit.stamp.size) return undefined;
      if (stamp.size === hit.stamp.size && stamp.mtimeMs !== hit.stamp.mtimeMs) return undefined;
      return hit.scan;
    },
    set(key, stamp, from, value) {
      entries.set(key, { stamp, scan: { from, value } });
    },
  };
}

// The bookkeeping both caches share: insertion-ordered Map, re-inserted on every hit so the
// oldest untouched key is the one evicted.
function createLruStore<V>(max: number) {
  const entries = new Map<string, V>();
  return {
    get(key: string): V | undefined {
      const hit = entries.get(key);
      if (hit === undefined) return undefined;
      entries.delete(key); // move to end (most-recently used)
      entries.set(key, hit);
      return hit;
    },
    set(key: string, value: V): void {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
    },
  };
}
