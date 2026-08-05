// The on-disk record of which working tree was handed which value (#1367), as a pure format.
//
// APPEND-ONLY, for the reason session-tool-groups.ts is: MULMOTERMINAL_HOME is shared by every
// server on this machine (several checkouts of one repo run side by side here), and a
// read-merge-write loses whichever of two instances finishes first. A lost reservation is not a
// tidiness problem — the port it held is then handed to a second directory, which is the exact
// collision this whole feature exists to prevent.
//
// One JSON object per line. A line that does not parse is dropped on its own: a file cut off
// mid-append costs the last entry, never the ones before it.
import { isRecord } from "../../common/isRecord.js";

/** One handed-out value. `base` is recorded so that editing `base` in `.mulmoterminal.json`
 *  invalidates what was reserved against the old one — otherwise a project that moved from 3000
 *  to 4000 would go on exporting 3010 with nothing to say why. */
export interface WorktreeEnvReservation {
  dir: string;
  name: string;
  kind: "port" | "slug";
  base: number | null;
  value: string;
}

/** A reservation given up. Without `name` it is the whole directory — a worktree is removed as a
 *  whole, and listing its variables there would mean the release could go stale against the
 *  config. With `name` it is one variable, which is what a directory that RENAMED or dropped a key
 *  needs: the value it used to hold has to come back into circulation while the directory itself
 *  lives on. */
interface ReleaseEntry {
  dir: string;
  name?: string;
  release: true;
}

const key = (dir: string, name: string): string => `${dir} ${name}`;

/** The newline LEADS rather than trails, like session-id-log.ts: whatever the file ended with,
 *  an appended entry starts its own line, so a truncated write costs one entry and not the next. */
export const reservationLine = (entry: WorktreeEnvReservation): string => `\n${JSON.stringify(entry)}`;

export const releaseLine = (dir: string, name?: string): string =>
  `\n${JSON.stringify((name === undefined ? { dir, release: true } : { dir, name, release: true }) satisfies ReleaseEntry)}`;

function parsedLine(line: string): WorktreeEnvReservation | ReleaseEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const raw: unknown = JSON.parse(trimmed);
    if (isRelease(raw)) return raw;
    return isReservation(raw) ? raw : null;
  } catch {
    return null;
  }
}

const isRelease = (raw: unknown): raw is ReleaseEntry =>
  isRecord(raw) && raw.release === true && typeof raw.dir === "string" && (raw.name === undefined || typeof raw.name === "string");

const isReservation = (raw: unknown): raw is WorktreeEnvReservation =>
  isRecord(raw) &&
  typeof raw.dir === "string" &&
  typeof raw.name === "string" &&
  (raw.kind === "port" || raw.kind === "slug") &&
  (raw.base === null || typeof raw.base === "number") &&
  typeof raw.value === "string";

/** What the log says now: replayed IN ORDER so a later line for the same (dir, name) wins and a
 *  release drops everything that directory held. Ordering is the whole point — this is not a
 *  union of the lines. */
export function parseReservations(contents: string): WorktreeEnvReservation[] {
  const live = new Map<string, WorktreeEnvReservation>();
  contents.split("\n").forEach((line) => {
    const entry = parsedLine(line);
    if (!entry) return;
    if (isRelease(entry)) {
      const released = [...live.values()].filter((held) => held.dir === entry.dir && (entry.name === undefined || held.name === entry.name));
      released.forEach((held) => live.delete(key(held.dir, held.name)));
      return;
    }
    live.set(key(entry.dir, entry.name), entry);
  });
  return [...live.values()];
}

/** The reservation a directory holds for one variable, or null. Also null when it was made
 *  against a different `base` — see the field's comment. */
export function heldReservation(
  reservations: readonly WorktreeEnvReservation[],
  dir: string,
  name: string,
  base: number | null,
): WorktreeEnvReservation | null {
  const held = reservations.find((entry) => entry.dir === dir && entry.name === name);
  if (!held) return null;
  return held.base === base ? held : null;
}
