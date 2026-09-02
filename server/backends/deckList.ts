// Which decks the cell header's `[Mulmo] menu offers (#1948), and where they come from.
//
// TWO named places, and nothing else — no walk. The first design searched the workspace for
// anything that parsed as a mulmoScript, and the real data killed it: one workspace held 250 such
// files, of which 33 were the user's own decks and **217 were a checked-out repository's test
// fixtures and samples**. A menu is a short list of things someone chose; a search finds whatever
// happens to be on disk, and on disk there is mostly other people's data.
//
// Losing the walk also loses everything it needed — depth, count, candidate, directory and
// per-listing budgets, a deterministic traversal order, and an unbounded `readdir` nobody could
// bound without making the common case slower. All of it existed to make searching safe.
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "../../common/isRecord.js";

/** Where the plugin keeps the decks an agent makes, relative to the workspace. Fixed by the
 *  plugin: the artifacts area is its only file capability and `stories` is its wire prefix. */
export const STORIES_DIR = path.join("artifacts", "stories");

/** A menu, not a file browser. Reached only by a workspace with an unusual number of decks. */
export const MAX_DECKS = 50;

/** Read whole to be parsed, so it needs a ceiling (CLAUDE.md's large-file rule). */
export const MAX_DECK_BYTES = 2 * 1024 * 1024;

/** What the plugin's own schema leads with. A declared path that is not a deck is dropped rather
 *  than offered: the menu would open it and the server would refuse. */
export const isDeckObject = (value: unknown): boolean => isRecord(value) && "$mulmocast" in value;

/** What to show for a deck: its own title when it has a usable one, else the file name — which is
 *  what the user typed and therefore already means something to them. */
export function deckLabel(parsed: unknown, fileName: string): string {
  if (!isRecord(parsed)) return fileName;
  const title = parsed.title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : fileName;
}

export interface DeckEntry {
  /** ABSOLUTE. The two sources have different roots — the stories directory hangs off the
   *  workspace, a declared path off the directory that declared it — so a relative answer would
   *  need a base the browser cannot know. */
  path: string;
  label: string;
}

/** Code-unit order, not `localeCompare`: what the server answers must not depend on the machine's
 *  locale, or two people listing one workspace see two orders. */
export const byLabel = (a: DeckEntry, b: DeckEntry): number => {
  if (a.label === b.label) return a.path < b.path ? -1 : 1;
  return a.label < b.label ? -1 : 1;
};

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

const deckAt = async (absolute: string): Promise<DeckEntry | null> => {
  const parsed = await readDeck(absolute);
  return isDeckObject(parsed) ? { path: absolute, label: deckLabel(parsed, path.basename(absolute)) } : null;
};

/** The decks in the workspace's own stories directory — one listing, no recursion. */
async function storiesDecks(workspace: string): Promise<DeckEntry[]> {
  const dir = path.join(workspace, STORIES_DIR);
  const names = await readdir(dir).catch(() => []);
  const found = await Promise.all(names.filter((name) => name.endsWith(".json")).map((name) => deckAt(path.join(dir, name))));
  return found.filter((deck): deck is DeckEntry => deck !== null);
}

/** The decks a directory DECLARED, in `.mulmoterminal.json`. Each entry is a path relative to that
 *  directory — this is how a deck kept inside a repository reaches the menu, and it is a decision
 *  someone wrote down rather than a guess about what a file on disk is for. */
async function declaredDecks(cwd: string, declared: readonly string[]): Promise<DeckEntry[]> {
  const found = await Promise.all(declared.map((rel) => deckAt(path.resolve(cwd, rel))));
  return found.filter((deck): deck is DeckEntry => deck !== null);
}

/**
 * Every deck this cell can offer: the workspace's stories directory plus whatever its own
 * directory declared, deduplicated by path (a declared entry pointing into the stories directory
 * names the same deck) and capped.
 */
export async function listDecks(workspace: string, cwd: string, declared: readonly string[]): Promise<DeckEntry[]> {
  const [stories, own] = await Promise.all([storiesDecks(workspace), declaredDecks(cwd, declared)]);
  const byPath = new Map<string, DeckEntry>();
  [...stories, ...own].forEach((deck) => byPath.set(deck.path, deck));
  return [...byPath.values()].sort(byLabel).slice(0, MAX_DECKS);
}
