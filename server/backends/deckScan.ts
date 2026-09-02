// Which files under a directory are mulmoScript DECKS, for the cell header's `[Mulmo] menu (#1948).
//
// The rules are here and the walk is the thin shell at the bottom, because everything worth being
// wrong about — what to skip, what counts as a deck, what to call it — has no fs in it.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "../../common/isRecord.js";

/** A deck someone keeps for a human to find sits near the top of the repository. */
export const MAX_DEPTH = 4;
/** A menu, not a file browser. */
export const MAX_DECKS = 50;
/** The file is read whole to be parsed, so it needs a ceiling (CLAUDE.md's large-file rule). A
 *  mulmoScript past this is not one a person is picking out of a dropdown. */
export const MAX_DECK_BYTES = 2 * 1024 * 1024;

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

/** The decks under `root`, depth- and count-bounded. Errors on any single directory or file are
 *  skipped rather than thrown: a menu that renders nothing because one subdirectory is unreadable
 *  is worse than a menu missing that subdirectory. */
export async function scanDecks(root: string): Promise<DeckEntry[]> {
  const found: DeckEntry[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || found.length >= MAX_DECKS) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const dirs = inNameOrder(entries.filter((e) => e.isDirectory() && !isSkippedDir(e.name)));
    const files = inNameOrder(entries.filter((e) => e.isFile() && e.name.endsWith(".json")));
    for (const file of files) {
      if (found.length >= MAX_DECKS) return;
      const absolute = path.join(dir, file.name);
      const parsed = await readDeck(absolute);
      if (isDeckObject(parsed)) found.push({ path: path.relative(root, absolute), label: deckLabel(parsed, file.name) });
    }
    for (const sub of dirs) {
      if (found.length >= MAX_DECKS) return;
      await walk(path.join(dir, sub.name), depth + 1);
    }
  };

  await walk(root, 0);
  return found.sort(byPath);
}
