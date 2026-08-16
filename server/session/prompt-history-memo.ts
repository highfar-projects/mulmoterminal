// Reading claude's prompt history without walking the whole file every time.
//
// The file is one per USER (not per session), so the pane cannot tail-read it — a session whose
// activity is a few days old falls outside any window and reads as empty (#1749, measured: 254
// sessions showed 0). It therefore scans the whole thing, which on this machine is 7.8 MB and 46 ms
// of blocked event loop, on every refresh of an open pane.
//
// It is also APPEND-ONLY, which is the way out: what a second read has to look at is the bytes
// written since the first one. That is the same trick transcript-fold.ts plays on a transcript, and
// it uses the same reader — `forEachJsonlRecordIn`, which takes a byte range and answers where it
// stopped.
//
// Deliberately NOT the reverse scan #1750 proposed: measured over the 14 sessions open at the time,
// five could collect their newest 101 prompts from the last 122–798 KB, and **nine could not be
// satisfied without reading to the start of the file** — they simply have fewer than 101 prompts,
// and "there are no more" is only knowable by reaching the beginning. A resume helps every session;
// a reverse scan helps the busy ones once each.
//
// Pure: the file reading and the map live in session-reads.ts. What is here is when a memo may be
// believed, which is the part that goes wrong silently.
import type { ClaudePromptScan } from "./prompt-history.js";

export interface HistoryMemo {
  /** What question this memo answers — see memoKeyFor. */
  key: string;
  /** Which FILE it answers about — see fileIdentity. */
  identity: string;
  /** The line-aligned byte offset the scan stopped at. Doubles as the shrink guard: the file must
   *  still hold the bytes that scan consumed, or the offset points somewhere it never did.
   *
   *  The offset rather than the size stat'd before the scan, because those differ. Claude can append
   *  DURING a scan, so the stream can run past the size that was sampled first; recording that size
   *  would let an in-place truncation to a length between the two pass the guard and resume from an
   *  offset the file no longer reaches (Codex, #1750). */
  offset: number;
  /** The sliding window as it stood there. */
  scan: ClaudePromptScan;
}

/** What the caller learned from `stat`, so resumePlan stays free of fs. */
export interface HistoryStat {
  ino: number;
  birthtimeMs: number;
  size: number;
}

/** Which question a memo answers: the ids being read under, and the `/clear` floor.
 *
 *  Both can change for one session while the server runs — a hook teaches us claude's re-minted id,
 *  or a `/clear` puts a floor under the list — and either changes what the window should contain.
 *  A memo that survived such a change would answer the old question with the old rows, which is
 *  exactly the failure a cache is expected to have and the one nobody notices. */
export const memoKeyFor = (ids: readonly string[], since: number | undefined): string => `${ids.join(",")}|${since ?? ""}`;

/** Which file a memo answers about: inode AND creation time.
 *
 *  The inode alone is not enough, and CI proved it rather than theory — two temp files created in
 *  succession on Linux got the same inode number, and a memo taken against the first was accepted
 *  for the second. Inode numbers are recycled, so a history file deleted and immediately recreated
 *  can land on the same one; adding the birth time makes that collision need two coincidences.
 *
 *  Either component reads as 0 where the platform does not report it, and that is fine: both sides
 *  are stamped the same way, so the comparison degrades to whatever IS reported. `UNKNOWN_FILE` is
 *  the case where nothing is — there the size guard below is the only evidence available.
 *
 *  The birth time is used at FULL precision. Rounding it to the millisecond was what let CI fail:
 *  on Linux the replacement file gets the same inode EVERY time, so the millisecond was the only
 *  thing left to tell the two apart — and a delete-and-recreate inside one millisecond is the
 *  common case, not a rare one. Measured on an ubuntu runner over 200 rounds of
 *  write/remove/write with no delay:
 *
 *    ino identical                     200/200
 *    `ino:floor(birthtimeMs)` collides 173/200   <- the guard opened
 *    `ino:birthtimeMs`         collides   0/200
 *
 *  macOS gives a fresh inode each time and so never reaches this, which is why it only ever showed
 *  up in CI. Size is deliberately NOT part of the identity: it changes on every append, and a memo
 *  that treats an append as a different file resumes nothing. */
export const fileIdentity = (stat: { ino: number; birthtimeMs: number }): string => `${stat.ino}:${stat.birthtimeMs}`;

const UNKNOWN_FILE = "0:0";

/** Where the next scan should start, and whether it may keep what the last one found.
 *
 *  `reuse: null` means start over from byte 0 with a fresh window. `from === size` is not special —
 *  the caller reads an empty range, folds nothing, and answers from the window it kept. */
export interface ResumePlan {
  from: number;
  reuse: ClaudePromptScan | null;
}

const RESTART: ResumePlan = { from: 0, reuse: null };

/** A memo may be resumed only when it answers THIS question, about THIS file, which still holds
 *  every byte the last scan consumed.
 *
 *  A file shorter than the recorded offset was rotated or truncated, so that offset no longer points
 *  where it did — the same reasoning `nextReadRange` applies to a codex rollout. A file the same
 *  length has nothing new, which is a resume of length zero rather than a special case. */
export function resumePlan(memo: HistoryMemo | undefined, key: string, stat: HistoryStat): ResumePlan {
  if (!memo || memo.key !== key) return RESTART;
  const identity = fileIdentity(stat);
  // Only when both sides identify the file at all: "no evidence" must not read as "different file",
  // or the resume would be disabled outright on a platform that reports neither field.
  if (memo.identity !== UNKNOWN_FILE && identity !== UNKNOWN_FILE && memo.identity !== identity) return RESTART;
  if (stat.size < memo.offset) return RESTART;
  return { from: memo.offset, reuse: memo.scan };
}
