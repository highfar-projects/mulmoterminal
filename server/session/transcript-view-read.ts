// Reading one session's transcript for the phone's transcript view (#1751).
//
// Separate from session-reads.ts because neither reader there fits: `sessionTimeline` folds the
// whole file for tool events, and `sessionLastTurn` reads a fixed 4 MB tail for ONE exchange. This
// window is a line budget over whole turns, and it needs its own widening rule.
//
// Nothing here is cached or folded incrementally: the first cold read of `transcript-fold` is the
// whole file, and a live session of 107 MB exists on this machine. The tail is read directly
// instead, measured at 24.3 ms for 4 MB against 39.3 ms for the tmux capture the phone already pays.
import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { SESSION_ID_RE } from "../config/env.js";
import { hasErrnoCode, messageOf } from "../errors.js";
import { forEachJsonlRecordIn } from "../infra/jsonl-file.js";
import { clearedTranscripts } from "./cleared-transcripts.js";
import { projectSessionsDir } from "./project-dir.js";
import { emptyTranscriptScan, foldTranscriptView, transcriptViewOf, type TranscriptView } from "./transcript-view.js";

/** How much of the transcript's end is read, and how far that may widen (see readWindow).
 *
 *  Injected with a default, like every other bound in this area, so a spec can exercise the widening
 *  and the ceiling without writing a 32 MB fixture. */
export interface TranscriptWindow {
  tailBytes: number;
  maxTailBytes: number;
}

export const DEFAULT_TRANSCRIPT_WINDOW: TranscriptWindow = {
  // Measured: reaching 250 logical lines needs a median of 609 KB and at most 1457 KB, so this is
  // 2.8x the worst case seen — and it reads in 24.3 ms on a 107 MB file.
  tailBytes: 4 * 1024 * 1024,
  // How far the window will widen looking for a turn boundary, and no further. The largest single
  // record measured is 4,761,619 characters (#1692), so this is seven times that; past it, a session
  // with no boundary in 32 MB is reported as too-large rather than as empty.
  maxTailBytes: 32 * 1024 * 1024,
};

// Not merely a nicety on top of SESSION_ID_RE: the regexp is what makes the id safe, and this is
// what still holds if someone later loosens it.
const isInside = (dir: string, file: string): boolean => {
  const rel = path.relative(dir, path.resolve(file));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

const isMissingFile = (e: unknown): boolean => hasErrnoCode(e) && e.code === "ENOENT";

const NEWLINE = 0x0a;

/** Whether `from` is genuinely the first byte of a line.
 *
 *  `forEachJsonlRecordIn` drops the leading line of a range it was not told starts at one, and that
 *  is the right default: a window picked by arithmetic almost always opens INSIDE a line, and half a
 *  line is not JSON. "Almost always" is not always. When `size - tail` happens to land exactly on a
 *  boundary the dropped line is a WHOLE record — and if it was a user prompt, its exchange is folded
 *  into the previous turn, or the window loses its only boundary and a perfectly readable session is
 *  reported as `too-large` (Codex, PR #1776).
 *
 *  One byte answers it, which is why the check is cheaper than the bug. */
async function startsAtLine(handle: FileHandle, from: number): Promise<boolean> {
  if (from === 0) return true;
  const byte = Buffer.alloc(1);
  const { bytesRead } = await handle.read(byte, 0, 1, from - 1);
  return bytesRead === 1 && byte[0] === NEWLINE;
}

// A window with no turn boundary in it is not a view: the whole point is turns, and the newest one
// must be complete. It happens when a SINGLE record is bigger than the window — the range fold drops
// the partial line it starts inside, taking that record with it — so the answer is to widen.
//
// The condition is "no boundary", not "no records": for `[record bigger than the window][a small
// assistant record]` a records-based test finds one and stops, and the view then arrives missing the
// very turn it promised. Stating the guarantee is what keeps this correct as shapes change.
//
// Widening stops for two different reasons, and they are two different answers. `from === 0` means
// the whole file has been read and simply holds no turn, which is not a size problem. Reaching the
// ceiling with `from > 0` means there is more file we refuse to read.
async function readWindow(handle: FileHandle, size: number, tail: number, window: TranscriptWindow): Promise<TranscriptView> {
  const from = Math.max(0, size - tail);
  const scan = emptyTranscriptScan();
  const atLineStart = await startsAtLine(handle, from);
  await forEachJsonlRecordIn(handle, { from, atLineStart }, (record) => foldTranscriptView(scan, record));
  if (scan.turns.length > 0) return transcriptViewOf(scan, from > 0);
  if (from === 0) return { status: "none" };
  if (tail >= window.maxTailBytes) return { status: "too-large" };
  return readWindow(handle, size, tail * 2, window);
}

/** The phone's view of `id`'s conversation, read from claude's transcript under `cwd`'s project.
 *
 *  `cwd` is the SESSION's directory, resolved by the caller. An empty one means "this host does not
 *  know that session" — never "look here": `projectSessionsDir("")` resolves against the server
 *  process's own directory, so an unknown id would be answered with whatever transcript of the same
 *  name happens to sit beside the server.
 *
 *  Every failure answers `none`, because the phone's response to all of them is the same (fall back
 *  to the screen). Only the two it can SAY something about are kept apart: `cleared` names a
 *  conversation the user ended, and `too-large` names a size. An I/O error is logged here, since it
 *  is otherwise indistinguishable from a session that has not written a transcript yet.
 *
 *  Which AGENT the session runs is deliberately not consulted, and the file's existence is asked
 *  instead: a claude session that outlived a restart reports its agent as "shell", because a claude
 *  pane's `pane_current_command` is a version string (`2.1.233`) that agentFromPaneCommand has no
 *  entry for. Asking the file also answers correctly for codex / grok / muse, whose own logs this
 *  does not read — they have no `<id>.jsonl` here, so they get `none`. */
export async function sessionTranscriptView(cwd: string, id: string, window: TranscriptWindow = DEFAULT_TRANSCRIPT_WINDOW): Promise<TranscriptView> {
  if (!cwd || !SESSION_ID_RE.test(id)) return { status: "none" };
  // Before the file is opened. `/clear` makes claude mint a new id and a new transcript while hooks
  // keep reporting under ours, so from that moment `${id}.jsonl` holds the conversation the user
  // just ENDED (cleared-transcripts.ts) — it still exists, so a stat would happily serve it.
  //
  // The plain `.has`, like every other reader of that file. A per-read `markStillHolds` here would
  // make this view disagree with the cockpit, the summary and the push about the same session.
  if (clearedTranscripts.has(id)) return { status: "cleared" };
  const dir = projectSessionsDir(cwd);
  const file = path.join(dir, `${id}.jsonl`);
  if (!isInside(dir, file)) return { status: "none" };
  let handle: FileHandle | null = null;
  try {
    // A HANDLE, not the path, and it is opened once for every read below. The window is read two to
    // four times when it has to widen, and a path is re-resolved each time — so a `/clear` or a
    // `--resume` between two of them would answer with one file's size and another file's records.
    handle = await fs.open(file, "r");
    const { size } = await handle.stat();
    if (size === 0) return { status: "none" };
    // `return await`, not `return`: without it the handle is closed while the read is still running.
    return await readWindow(handle, size, window.tailBytes, window);
  } catch (e) {
    if (!isMissingFile(e)) console.error(`[transcript-view] ${file}: ${messageOf(e)}`);
    return { status: "none" };
  } finally {
    // Polled every 5 seconds per open session, so one leaked descriptor is not one leak — it is a
    // slow climb to EMFILE. Closed on every path: the widened giveaway, the early return, the throw.
    //
    // Its own rejection is swallowed: an awaited throw in `finally` REPLACES what the `try` already
    // produced, so a failing close would turn a conversation that read perfectly well into an error
    // on the phone. The descriptor is gone either way (CodeRabbit, PR #1776).
    await handle?.close().catch((e: unknown) => console.error(`[transcript-view] close ${file}: ${messageOf(e)}`));
  }
}
