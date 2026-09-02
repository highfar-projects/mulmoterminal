// Which files under a directory are mulmoScript DECKS, for the cell header's `[Mulmo] menu (#1948).
//
// The rules are here and the walk is the thin shell at the bottom, because everything worth being
// wrong about — what to skip, what counts as a deck, what to call it — has no fs in it.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "../../common/isRecord.js";

// TWO kinds of limit here, and they answer different questions. What the MENU shows — `MAX_DEPTH`
// and `MAX_DECKS` — is a product decision. What the SCAN may SPEND — files opened, directories
// listed, bytes per file — is a cost decision, and it exists because the shape of the repository
// is not ours to choose: a tree can hold thousands of JSON files that are not decks, or thousands
// of directories holding nothing at all, and this endpoint runs on every directory change.
//
// Stated as a group rather than added one at a time: each of the three cost limits arrived as its
// own review finding, which is what a rule looks like when it is being enumerated instead of said
// (Codex on #1950).

/** A deck someone keeps for a human to find sits near the top of the repository. */
export const MAX_DEPTH = 4;
/** A menu, not a file browser. */
export const MAX_DECKS = 50;
/** The file is read whole to be parsed, so it needs a ceiling (CLAUDE.md's large-file rule). A
 *  mulmoScript past this is not one a person is picking out of a dropdown. */
export const MAX_DECK_BYTES = 2 * 1024 * 1024;
/** How many `.json` files may be OPENED, which is the cost this endpoint actually incurs — the
 *  deck limit bounds only what is found, and a repository can hold thousands of JSON files that
 *  are not decks (measured: 2827 within the depth limit in one real workspace). Without this, a
 *  tree full of configuration is read in full on every directory change (Codex on #1950). */
export const MAX_CANDIDATES = 500;
/** How many directories may be LISTED. Depth alone does not bound this: a monorepo has thousands
 *  of directories within four levels (measured: 1353 in one real workspace, 93 in this repository)
 *  and each costs a `readdir` and a sort even when it holds no JSON at all.
 *
 *  What this does NOT bound is the size of any ONE listing, and that is deliberate. Measured on a
 *  50,000-entry directory: `readdir` 34 ms, sorting all of it 21 ms, streaming the first 500 with
 *  `opendir` 4 ms. The streaming form is the only way to bound a single listing and it answers in
 *  FILESYSTEM order — which is precisely the non-determinism this scanner was fixed for earlier in
 *  the same review. Name order requires seeing every entry, so 55 ms on a pathological directory is
 *  the price of an answer two machines agree on. */
export const MAX_DIRECTORIES = 2000;

/** What one scan may spend. Injectable so a test can exhaust a budget without building a tree the
 *  size of the real limit. */
export interface ScanBudget {
  depth: number;
  decks: number;
  candidates: number;
  directories: number;
}

export const DEFAULT_SCAN_BUDGET: ScanBudget = { depth: MAX_DEPTH, decks: MAX_DECKS, candidates: MAX_CANDIDATES, directories: MAX_DIRECTORIES };

/** Directories that cannot hold a deck a person wrote. Skipping them is most of the walk's cost. */
const SKIPPED_DIRS = new Set([".git", "node_modules", "dist", "lib", "build", "out", "coverage", ".next", ".cache", ".venv", "__pycache__"]);

export const isSkippedDir = (name: string): boolean => SKIPPED_DIRS.has(name) || (name.startsWith(".") && name !== ".mulmoterminal");

/** What the plugin's own schema leads with. `.json` alone would fill the menu with `package.json`
 *  and every tsconfig in the tree, so membership is decided by the marker, not the extension. */
export const isDeckObject = (value: unknown): boolean => isRecord(value) && "$mulmocast" in value;

/** What to show for a deck: its own title when it has a usable one, else the file name — which is
 *  what the user typed and therefore already means something to them. */
export function deckLabel(parsed: unknown, fileName: string): string {
  if (!isRecord(parsed)) return fileName;
  const title = parsed.title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : fileName;
}

export interface DeckEntry {
  /** Relative to the directory that was scanned — the client joins it back, the way the file
   *  tree's rows are relative to their own root. */
  path: string;
  label: string;
}

/** Deck entries sort by path so the menu's order does not depend on the order the fs happened to
 *  hand back its directory entries — two machines listing one repo must agree. */
export const byPath = (a: DeckEntry, b: DeckEntry): number => byName(a.path, b.path);

/** Code-unit order, NOT `localeCompare`: what the server answers must not depend on the machine's
 *  locale, or two people listing one repository see two orders. */
export function byName(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** The order the walk VISITS things in, which decides WHICH decks survive the count limit — not
 *  just how the answer is arranged. `readdir` returns entries in the filesystem's own order, so
 *  without this the 50 kept in a repository holding more are whichever 50 the disk happened to
 *  hand back first (Codex on #1950). Sorting the final list cannot repair that: by then the
 *  discarded ones are gone. */
export const inNameOrder = <T extends { name: string }>(entries: readonly T[]): T[] => [...entries].sort((a, b) => byName(a.name, b.name));

const readDeck = async (absolute: string): Promise<unknown | null> => {
  try {
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_DECK_BYTES) return null;
    return JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    // Unreadable, not JSON, or gone between the listing and the read: not a deck we can offer.
    return null;
  }
};

/** One directory's decks and the subdirectories worth descending into. `budget` caps BOTH what may
 *  be found and what may be opened, and the second is returned so the caller can keep spending it
 *  across directories. */
async function decksIn(
  dir: string,
  root: string,
  budget: { decks: number; opened: number },
): Promise<{ decks: DeckEntry[]; opened: number; subdirs: string[] }> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const decks: DeckEntry[] = [];
  let opened = 0;
  // The loop's own `break` is what bounds the opening — a slice here would be a second copy of the
  // same limit that no test could tell from its absence. What is NOT bounded is the sort above it,
  // deliberately: measured on 50,000 `.json` files in one directory it costs 18 ms, against 10 ms
  // for a hand-rolled k-smallest selection, and 8 ms does not buy twenty lines of index arithmetic
  // in the middle of this (Codex on #1950).
  for (const file of inNameOrder(entries.filter((e) => e.isFile() && e.name.endsWith(".json")))) {
    if (decks.length >= budget.decks || opened >= budget.opened) break;
    opened += 1;
    const absolute = path.join(dir, file.name);
    const parsed = await readDeck(absolute);
    if (isDeckObject(parsed)) decks.push({ path: path.relative(root, absolute), label: deckLabel(parsed, file.name) });
  }
  const subdirs = inNameOrder(entries.filter((e) => e.isDirectory() && !isSkippedDir(e.name))).map((e) => path.join(dir, e.name));
  return { decks, opened, subdirs };
}

/**
 * The decks under `root`, depth- and count-bounded.
 *
 * **Shallower first, then by path** — and that is a rule about WHICH decks survive the count
 * limit, not about how the answer is arranged (the answer is sorted by path either way). Breadth
 * first rather than the obvious recursion, for two reasons that pull the same way: with a cap, the
 * deck a person is looking for is the one near the top of the repository, not one four directories
 * down; and the level order is the only one that can be stated in a line, where "files, then into
 * the first subdirectory, then…" puts a `zzz.json` beside the root ahead of `aaa/talk.json`
 * (Codex on #1950).
 *
 * Every budget in `ScanBudget` stops it, and whichever runs out first decides what survives —
 * which is why the visit order above is part of the contract and not an implementation detail.
 *
 * Errors on any single directory or file are skipped rather than thrown: a menu that renders
 * nothing because one subdirectory is unreadable is worse than one missing that subdirectory.
 */
export async function scanDecks(root: string, budget: ScanBudget = DEFAULT_SCAN_BUDGET): Promise<DeckEntry[]> {
  const found: DeckEntry[] = [];
  let opened = 0;
  let listed = 0;
  let frontier = [root];
  const spent = () => found.length >= budget.decks || opened >= budget.candidates || listed >= budget.directories;
  for (let depth = 0; depth <= budget.depth && frontier.length > 0 && !spent(); depth++) {
    const next: string[] = [];
    for (const dir of frontier) {
      if (spent()) break;
      listed += 1;
      const result = await decksIn(dir, root, { decks: budget.decks - found.length, opened: budget.candidates - opened });
      found.push(...result.decks);
      opened += result.opened;
      next.push(...result.subdirs);
    }
    frontier = next;
  }
  return found.sort(byPath);
}
