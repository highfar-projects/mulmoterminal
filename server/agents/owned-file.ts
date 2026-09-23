// Publishing a file into a directory the USER owns, and taking it back again.
//
// Two agents do this: copilot writes `<COPILOT_HOME>/hooks/mulmoterminal.json` and cursor writes
// `~/.cursor/hooks.json` (their own files say why each path is what it is). Both land at a path the
// user may already be using, and both DELETE on exit — the only destructive act either performs. The
// two rules that make that safe are here rather than in each agent because a second copy of them is
// how one of them ends up subtly different (own-assign.ts's reason).
//
// What is NOT shared is the record itself: each agent creates its own, because they publish
// different files and neither may license a delete in the other's.
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Write through a temp file and rename. `writeFileSync` truncates first, so a crash mid-write
 *  leaves malformed JSON — which every ownership check reads as "not ours", so nothing would replace
 *  it and it would sit there posting to a dead port (Codex, round 2 of #2063). A rename is atomic on
 *  the platforms this ships to, so the file at that path is always a whole one.
 *
 *  Not `writeFileAtomicSync` from server/files/atomic-write.ts, which is the same idea for state
 *  files we own outright: this one names its temp after the pid and removes it when the WRITE fails
 *  as well as the rename, because the directory it leaves debris in belongs to the user. */
export function writeAtomically(file: string, contents: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, contents, "utf8");
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** What THIS process last published, BY FILE.
 *
 *  The only unforgeable evidence available: a file on disk can be made to look like ours by anyone
 *  who can write to the user's home, but nothing can make it match a string we are holding in memory
 *  and never wrote down (Codex review on #2063, P1). It is what licenses the unlink on exit.
 *
 *  Keyed by path rather than held as one string, because one process CAN address two homes: every
 *  function in the agents' files takes `home`, the specs use a fresh temp dir per case, and an
 *  embedded caller could do the same. A single slot let bytes published in one home authorise a
 *  delete in another (Codex round 4). */
export interface PublishedFiles {
  /** Record the exact bytes just written to `file`. */
  remember(file: string, contents: string): void;
  /** Does `file` still hold, byte for byte, what THIS process published there? False for a file we
   *  never published, one a peer has taken over, and one we cannot read — each of which is a file
   *  this process must not delete. */
  isStillOurs(file: string): boolean;
}

export function createPublishedFiles(): PublishedFiles {
  const published = new Map<string, string>();
  return {
    remember(file, contents) {
      published.set(path.resolve(file), contents);
    },
    isStillOurs(file) {
      const bytes = published.get(path.resolve(file));
      if (bytes === undefined) return false;
      try {
        return readFileSync(file, "utf8") === bytes; // read immediately before removing
      } catch {
        return false;
      }
    },
  };
}
