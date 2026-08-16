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
  /** The file's inode, so a REPLACED file is not resumed as a longer one. Size alone cannot tell
   *  those apart: delete the history and let it grow back past the recorded size, and a byte offset
   *  from the old file points into the middle of the new one. 0 where the platform does not report
   *  it (some Windows filesystems), which degrades to the size check below rather than failing. */
  ino: number;
  /** The file's size when the scan that produced it finished. */
  size: number;
  /** The line-aligned byte offset that scan stopped at. */
  offset: number;
  /** The sliding window as it stood there. */
  scan: ClaudePromptScan;
}

/** What the caller learned from `stat`, so resumePlan stays free of fs. */
export interface HistoryStat {
  ino: number;
  size: number;
}

/** Which question a memo answers: the ids being read under, and the `/clear` floor.
 *
 *  Both can change for one session while the server runs — a hook teaches us claude's re-minted id,
 *  or a `/clear` puts a floor under the list — and either changes what the window should contain.
 *  A memo that survived such a change would answer the old question with the old rows, which is
 *  exactly the failure a cache is expected to have and the one nobody notices. */
export const memoKeyFor = (ids: readonly string[], since: number | undefined): string => `${ids.join(",")}|${since ?? ""}`;

/** Where the next scan should start, and whether it may keep what the last one found.
 *
 *  `reuse: null` means start over from byte 0 with a fresh window. `from === size` is not special —
 *  the caller reads an empty range, folds nothing, and answers from the window it kept. */
export interface ResumePlan {
  from: number;
  reuse: ClaudePromptScan | null;
}

const RESTART: ResumePlan = { from: 0, reuse: null };

/** A memo may be resumed only when it answers THIS question, about THIS file, which has only grown.
 *
 *  A file SMALLER than the recorded size was rotated or truncated, so the recorded offset no longer
 *  points where it did — the same reasoning `nextReadRange` applies to a codex rollout. A different
 *  INODE is the case size cannot catch: a history file deleted and grown back past its old size
 *  would otherwise be resumed from an offset belonging to a file that no longer exists, folding the
 *  wrong bytes into a window built from the wrong ones. A file the same size has nothing new, which
 *  is a resume of length zero rather than a special case. */
export function resumePlan(memo: HistoryMemo | undefined, key: string, stat: HistoryStat): ResumePlan {
  if (!memo || memo.key !== key) return RESTART;
  // Only when BOTH sides reported one: a platform that answers 0 gives no evidence either way, and
  // treating "no evidence" as "different file" would disable the resume outright there.
  if (memo.ino !== 0 && stat.ino !== 0 && memo.ino !== stat.ino) return RESTART;
  if (stat.size < memo.size) return RESTART;
  return { from: memo.offset, reuse: memo.scan };
}
