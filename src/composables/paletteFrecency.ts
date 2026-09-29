// How often and how recently each command-palette row was picked (#2533). Pure: the store is passed
// in and handed back, and the clock is an argument.
import { isRecord } from "../../common/isRecord";

export interface FrecencyEntry {
  /** Uses so far, each weighed down by its age when it was folded in. */
  weight: number;
  /** Epoch ms of the last use. */
  last: number;
}

export type FrecencyStore = Record<string, FrecencyEntry>;

/** A use counts half as much a week later. */
export const FRECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
/** Rows kept at most; the weakest go first. */
export const FRECENCY_MAX_ENTRIES = 200;

const decay = (age_ms: number): number => 0.5 ** (Math.max(0, age_ms) / FRECENCY_HALF_LIFE_MS);

export const frecencyScore = (entry: FrecencyEntry | undefined, now: number): number => (entry ? entry.weight * decay(now - entry.last) : 0);

/** The store after one more use of `key` at `now`, trimmed to the strongest entries. */
export function recordUse(store: FrecencyStore, key: string, now: number): FrecencyStore {
  const next: FrecencyStore = { ...store, [key]: { weight: frecencyScore(store[key], now) + 1, last: now } };
  if (Object.keys(next).length <= FRECENCY_MAX_ENTRIES) return next;
  const strongest = Object.entries(next)
    .sort(([, a], [, b]) => frecencyScore(b, now) - frecencyScore(a, now))
    .slice(0, FRECENCY_MAX_ENTRIES);
  return Object.fromEntries(strongest);
}

const isEntry = (value: unknown): value is FrecencyEntry =>
  isRecord(value) &&
  typeof value.weight === "number" &&
  Number.isFinite(value.weight) &&
  value.weight > 0 &&
  typeof value.last === "number" &&
  Number.isFinite(value.last);

/** A stored value read back: anything malformed is dropped rather than trusted. */
export function readFrecency(raw: unknown): FrecencyStore {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((pair): pair is [string, FrecencyEntry] => isEntry(pair[1])));
}

// An allowlist, not a list of exceptions: a row is remembered only when its key names the same row
// in every terminal and on every opening. Left out, among others: a terminal (its uid is renumbered
// on reload), a launcher start (its place in the list), a command (its id is per terminal's header
// config), a collection action or a Wiki page (a slug is per project / workspace), a past prompt, a
// hand-off, a symbol.
const REMEMBERED_KINDS: ReadonlySet<string> = new Set(["action", "screen", "settings", "choice", "launch", "resume", "github"]);

// A switch whose one id flips its meaning: "sound" reads "Sound on" while it is off and "Sound off"
// while it is on, so remembering it would lift the opposite of what was picked.
const FLIPPING_CHOICES: ReadonlySet<string> = new Set(["sound"]);

/** Whether a picked row is remembered: only one whose key names the same row next time. */
export const isRemembered = (row: { kind: string; id?: string; start?: { kind: string } }): boolean => {
  if (row.kind === "choice") return !FLIPPING_CHOICES.has(row.id ?? "");
  return REMEMBERED_KINDS.has(row.kind) || (row.kind === "start" && row.start?.kind === "agent");
};
