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
import { isRecord } from "../../common/isRecord.js";
import { hasErrnoCode, messageOf } from "../errors.js";
import { forEachJsonlRecordIn } from "../infra/jsonl-file.js";
import { clearedTranscripts } from "./cleared-transcripts.js";
import { projectSessionsDir } from "./project-dir.js";
import { emptyTranscriptScan, foldTranscriptView, transcriptViewOf, type TranscriptScan, type TranscriptView } from "./transcript-view.js";
import { createCodexFold } from "./transcript-view-codex.js";
import { createCursorFold } from "./transcript-view-cursor.js";
import { codexRollouts, codexRolloutsHydrated } from "./registry.js";
import { codexSessionsRoot } from "../agents/codex-session.js";
import { codexRolloutPath } from "../agents/codex-sessions.js";
import { cursorTranscriptPath } from "../agents/cursor-sessions.js";
import { listCopilotTurns } from "../agents/copilot-sessions.js";
import { copilotScanOf } from "./transcript-view-copilot.js";
import type { SessionAgent } from "../../common/sessionAgent.js";

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

/** The bytes after the last newline, folded when they are a whole record.
 *
 *  A `to`-bounded fold never yields the last line of its range, and that is right at an arbitrary
 *  cut: half a record and a finished one look the same there. Here the cut is the SIZE, so the only
 *  thing past the last newline is one line — and JSON says which of the two it is, exactly as the
 *  fold decides at EOF. Without this, bounding the scan at the snapshot silently dropped a complete
 *  final record whose newline had not landed yet, which for a one-turn session is the whole view
 *  (Codex, PR #1776).
 *
 *  Bounded by the snapshot like everything else: what lies between is at most one record. */
async function foldFinalLine(handle: FileHandle, from: number, to: number, onRecord: (record: Record<string, unknown>) => void): Promise<void> {
  if (to <= from) return;
  const buf = Buffer.alloc(to - from);
  const { bytesRead } = await handle.read(buf, 0, buf.length, from);
  const line = buf.subarray(0, bytesRead).toString("utf8").trim();
  if (!line) return;
  try {
    const parsed: unknown = JSON.parse(line);
    if (isRecord(parsed)) onRecord(parsed);
  } catch {
    // Half a record — the writer is mid-line. The next poll picks it up whole.
  }
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
async function readWindow(handle: FileHandle, size: number, tail: number, window: TranscriptWindow, source: FileTranscriptSource): Promise<TranscriptView> {
  const from = Math.max(0, size - tail);
  const scan = emptyTranscriptScan();
  // Per WINDOW, not per file: a widened re-read folds the same bytes from the start, and a fold
  // carrying state from the abandoned pass (codex's double-write guard does) would judge the first
  // record of the new pass against the last record of the old one.
  const fold = source.createFold(scan);
  const atLineStart = await startsAtLine(handle, from);
  // `to: size` — the window ENDS at the size that was stat'd. Without it the fold reads until EOF,
  // and this file is being appended to WHILE it is read: a live session writes every 2-17 seconds,
  // in records that reach megabytes, so a read nominally bounded at 4 MB follows the writer for as
  // long as the writer keeps going. Bounding it at the snapshot also makes a widened re-read fold
  // the same bytes the first one did, rather than a file that moved underneath (Codex, PR #1776).
  const end = await forEachJsonlRecordIn(handle, { from, to: size, atLineStart }, fold);
  await foldFinalLine(handle, end, size, fold);
  if (scan.turns.length > 0) return transcriptViewOf(scan, from > 0);
  if (from === 0) return { status: "none" };
  if (tail >= window.maxTailBytes) return { status: "too-large" };
  // Clamped, so the ceiling is the ceiling: doubling past it would read more than this says it will
  // whenever the two are not a power of two apart (CodeRabbit, PR #1776).
  return readWindow(handle, size, Math.min(tail * 2, window.maxTailBytes), window, source);
}

// ── which agent's log answers, and how it is chosen (#1822) ───────────────────────────────────
//
// THE AGENT IS NOT ASKED. That is the constraint the whole shape follows from, and it predates the
// second reader: a claude session that outlived a server restart reports its agent as `shell`,
// because a claude pane's `pane_current_command` is a version string (`2.1.233`) that
// `agentFromPaneCommand` has no entry for. A reader chosen by `agentOfSession` would therefore lose
// the conversation view on every restarted claude cell — the exact regression this file's original
// comment warned about.
//
// So each source is asked whether IT has a file for this (cwd, id), in order, and the first that
// does answers. That is the generalisation of what one reader already did by asking for
// `<id>.jsonl`: file existence is a fact, and the agent is a guess.
//
// Claude is first because it is the cheapest question (one path join) and the common case. A source
// whose `locate` is expensive belongs later in the list.
//
// THREE of the four keep a FILE and one keeps a TABLE, which is why this is a union rather than one
// shape. A file source is read by locating it and folding a byte window off its tail; copilot has no
// file to locate and no tail to read — its window is `ORDER BY turn_index DESC LIMIT n`. What the
// two have in common is the SCAN, so that is where they meet: both hand the same `TranscriptScan` to
// the same `transcriptViewOf`, and the budget, the byte cap and the eviction rule are shared by
// construction rather than by each reader remembering them.
export interface FileTranscriptSource {
  kind: "file";
  agent: SessionAgent;
  /** This agent's transcript for the session, or null when it keeps none. Returning a path is not
   *  a claim that it EXISTS — the caller opens it and moves on if it does not. */
  locate: (cwd: string, id: string) => Promise<string | null>;
  /** A fold for one scan. A factory rather than a function because a fold may need state across
   *  records (codex's double-write guard). */
  createFold: (scan: TranscriptScan) => (record: Record<string, unknown>) => void;
}

export interface QueryTranscriptSource {
  kind: "query";
  agent: SessionAgent;
  /** This session's turns from the agent's own index, or null when it holds none — the same answer
   *  an empty file gives, so the search moves on to the next source rather than stopping.
   *
   *  It takes `cwd` for a reason a file source gets for free: a machine-global index must scope the
   *  read to the directory itself, or a session id from another project is readable here by hand. */
  scan: (cwd: string, id: string) => Promise<TranscriptScan | null>;
}

export type TranscriptSource = FileTranscriptSource | QueryTranscriptSource;

const claudeSource: FileTranscriptSource = {
  kind: "file",
  agent: "claude",
  locate: (cwd, id) => {
    const dir = projectSessionsDir(cwd);
    const file = path.join(dir, `${id}.jsonl`);
    // Not merely a nicety on top of SESSION_ID_RE: the regexp is what makes the id safe, and this is
    // what still holds if someone later loosens it.
    return Promise.resolve(isInside(dir, file) ? file : null);
  },
  createFold: (scan) => (record) => foldTranscriptView(scan, record),
};

const codexSource: FileTranscriptSource = {
  kind: "file",
  agent: "codex",
  // Two hops, and the mapping is the reason: codex mints its own rollout id, so the session key the
  // browser knows is not the file's name. `codexRollouts` is that mapping, read off disk — hence
  // the await, without which a request served during startup falls through to the key and names no
  // rollout. `codexRolloutPath` scans the day tree and answers null for an id it cannot find, which
  // is also the containment check: it only ever joins a name it read from a directory under `root`.
  locate: async (_cwd, id) => {
    await codexRolloutsHydrated;
    const rolloutId = codexRollouts.get(id)?.conversationId ?? id;
    return codexRolloutPath(codexSessionsRoot(), rolloutId);
  },
  createFold: createCodexFold,
};

const cursorSource: FileTranscriptSource = {
  kind: "file",
  agent: "cursor",
  // The session key IS cursor's chat id (`--resume <uuid>` with a uuid this server invents), so
  // there is no mapping to wait for. What the lookup costs instead is a walk: a chat lives under
  // `~/.cursor/projects/<slug>/agent-transcripts/<id>/`, and the slug is a truncated-and-hashed
  // form of the path that cannot be reconstructed — so each project directory is asked what it
  // stands for (cursor-sessions.ts).
  locate: (cwd, id) => cursorTranscriptPath(cwd, id),
  createFold: createCursorFold,
};

const copilotSource: QueryTranscriptSource = {
  kind: "query",
  agent: "copilot",
  // One indexed query against copilot's own machine-global store, scoped to the directory inside
  // the SQL (listCopilotTurns) rather than after it — every other source is bound to a cwd by where
  // its file lives, and this one would otherwise read another project's conversation into this cell.
  //
  // A read that left an older turn behind is marked truncated here rather than in the fold: the
  // fold's own `truncated` means "the budget evicted something", and this is the different statement
  // that the READ stopped early. `transcriptViewOf` ORs the two, so the phone sees one answer.
  scan: async (cwd, id) => {
    const { turns, more } = await listCopilotTurns(id, cwd);
    if (turns.length === 0) return null;
    const scan = copilotScanOf(turns);
    if (more) scan.truncated = true;
    return scan;
  },
};

/** In the order they are asked.
 *
 *  Claude first because it is the cheapest question and the common case. Cursor LAST OF THE FILE
 *  sources because its locate is the most expensive: a readdir of every cursor project plus a read
 *  of each one's `.workspace-trusted`, where claude joins one path and codex scans a day tree.
 *
 *  Copilot last of all, and for a different reason from cursor's: its cost is not a walk but a
 *  sqlite open, and `node:sqlite` is imported lazily on the first call (sqlite-read.ts). Asking it
 *  only after every file has missed keeps that import off the path the overwhelming majority of
 *  cells take. */
const TRANSCRIPT_SOURCES: readonly TranscriptSource[] = [claudeSource, codexSource, cursorSource, copilotSource];

/** Agents with no reader here yet, for the one question the sources cannot answer: is a session
 *  that matched nothing a session with nothing written, or one this host cannot read?
 *
 *  Derived from the source list rather than listed, so wiring a source removes it from here by
 *  construction. `shell` is excluded deliberately — a shell cell has no conversation and never
 *  will, so the screen IS its content rather than a fallback from something missing. */
const hasReader = (agent: SessionAgent): boolean => TRANSCRIPT_SOURCES.some((source) => source.agent === agent);

/** Ask ONE source, whichever kind it is, or null when it has nothing here.
 *
 *  The two kinds converge on the SCAN and not before it: a file source reads a byte window and folds
 *  records into one, a query source builds one from rows. `transcriptViewOf` then applies the byte
 *  cap and decides the status for both, so neither reader owns a copy of the budget. */
function viewFromSource(source: TranscriptSource, cwd: string, id: string, window: TranscriptWindow): Promise<TranscriptView | null> {
  return source.kind === "query" ? viewFromQuery(source, cwd, id) : viewFromFile(source, cwd, id, window);
}

/** Read ONE source's index, or null when it holds nothing for this session — the same answer an
 *  empty file gives, so the search moves on rather than stopping here.
 *
 *  `false` for `windowStartedMidFile`: a query source has no window that can open mid-turn. Where
 *  its read DID stop early it says so on the scan itself, which `transcriptViewOf` ORs in. */
async function viewFromQuery(source: QueryTranscriptSource, cwd: string, id: string): Promise<TranscriptView | null> {
  const scan = await source.scan(cwd, id);
  return scan === null ? null : transcriptViewOf(scan, false);
}

/** Read ONE source's file, or null when it has nothing here. */
async function viewFromFile(source: FileTranscriptSource, cwd: string, id: string, window: TranscriptWindow): Promise<TranscriptView | null> {
  const file = await source.locate(cwd, id);
  if (file === null) return null;
  let handle: FileHandle | null = null;
  try {
    // A HANDLE, not the path, and it is opened once for every read below. The window is read two to
    // four times when it has to widen, and a path is re-resolved each time — so a `/clear` or a
    // `--resume` between two of them would answer with one file's size and another file's records.
    handle = await fs.open(file, "r");
    const { size } = await handle.stat();
    // An empty file is this source having nothing to say, not the end of the search: a codex cell
    // whose rollout has been created but not written to must not stop claude being asked. `none` is
    // decided once, by the caller, when every source has answered.
    if (size === 0) return null;
    // `return await`, not `return`: without it the handle is closed while the read is still running.
    return await readWindow(handle, size, window.tailBytes, window, source);
  } catch (e) {
    if (isMissingFile(e)) return null; // this agent keeps no file for this session — ask the next
    console.error(`[transcript-view] ${file}: ${messageOf(e)}`);
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

/** What the caller knows that the files do not, for the one question file existence cannot answer.
 *  Injected rather than imported: `agentOfSession` lives in server/index.ts, which imports this. */
export interface TranscriptViewDeps {
  window?: TranscriptWindow;
  /** This session's agent, when the host knows it. Consulted ONLY after every source has missed —
   *  never to choose a reader (see TranscriptSource). */
  agentOf?: (id: string) => SessionAgent | null;
}

/** The phone's view of `id`'s conversation, from whichever hosted agent's log holds it.
 *
 *  `cwd` is the SESSION's directory, resolved by the caller. An empty one means "this host does not
 *  know that session" — never "look here": `projectSessionsDir("")` resolves against the server
 *  process's own directory, so an unknown id would be answered with whatever transcript of the same
 *  name happens to sit beside the server.
 *
 *  Four answers, and they are four different sentences to a person:
 *
 *    `ok`            a conversation
 *    `cleared`       the user ended this one with /clear (claude's own state)
 *    `too-large`     no turn boundary inside the ceiling
 *    `not-supported` this session's agent keeps a conversation that no reader here reads YET
 *    `none`          nothing written, or nothing this host can find
 *
 *  The phone falls back to the screen for all but the first, so the distinction buys a sentence
 *  rather than a behaviour — and `not-supported` also names a thing to go and implement, which
 *  `none` silently did not (#1822). */
export async function sessionTranscriptView(cwd: string, id: string, deps: TranscriptViewDeps | TranscriptWindow = {}): Promise<TranscriptView> {
  // The old signature took the window positionally and several specs still do. Kept rather than
  // migrated: the window is the only thing those specs vary, and a second parameter shape is
  // cheaper than touching every one of them.
  const { window = DEFAULT_TRANSCRIPT_WINDOW, agentOf } = "tailBytes" in deps ? { window: deps, agentOf: undefined } : deps;
  if (!cwd || !SESSION_ID_RE.test(id)) return { status: "none" };
  // Before any file is opened. `/clear` makes claude mint a new id and a new transcript while hooks
  // keep reporting under ours, so from that moment `${id}.jsonl` holds the conversation the user
  // just ENDED (cleared-transcripts.ts) — it still exists, so a stat would happily serve it.
  //
  // The plain `.has`, like every other reader of that file. A per-read `markStillHolds` here would
  // make this view disagree with the cockpit, the summary and the push about the same session.
  if (clearedTranscripts.has(id)) return { status: "cleared" };
  // Sequential on purpose. Asking every source at once would open a descriptor per agent on a route
  // polled every 5 seconds per open session, to discard all but one — and the first source answers
  // for the overwhelming majority of cells.
  for (const source of TRANSCRIPT_SOURCES) {
    const view = await viewFromSource(source, cwd, id, window);
    if (view !== null) return view;
  }
  // Nothing on disk for any source. NOW the agent may be asked, and only to choose between two
  // sentences — never to choose a reader. Asking here is safe precisely because it is last: the
  // restarted-claude case (reported as `shell`) has already been answered by claude's file.
  const agent = agentOf?.(id) ?? null;
  return agent !== null && agent !== "shell" && !hasReader(agent) ? { status: "not-supported" } : { status: "none" };
}
