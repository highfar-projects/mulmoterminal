// Claude's own conversation, folded into the turns the phone reads (#1751).
//
// The phone's terminal view shows ONE pane, and a claude cell runs on the alternate screen with no
// scrollback, so `capture-pane -S -300` returns the pane's 30-41 rows and nothing older. This reads
// the transcript instead, which is the whole conversation the model saw.
//
// Pure on purpose: the window, the truncation rules and the byte cap are decided here, from records
// alone, so every rule is testable without a transcript on disk. The reader that supplies those
// records is transcript-view-read.ts.
//
// Measured on claude 2.1.226 / 2.1.228 / 2.1.231 / 2.1.233. Claude's on-disk format is not a
// published contract, so every rule below leans toward staying VISIBLE when it changes: an unknown
// content block becomes a row saying so rather than nothing, and `thinking` is dropped only because
// its text measured 0 characters in all twelve transcripts sampled — the moment upstream writes a
// body there, it is rendered like any other prose.
import { isRecord } from "../../common/isRecord.js";
import { describeValue, readString } from "../../common/readString.js";
import { userPromptText } from "./transcript.js";

export type TranscriptRowKind = "user" | "assistant" | "tool" | "unknown";

/** One content block, rendered.
 *
 *  `text` may itself contain newlines — an assistant answer is passed through whole, because the
 *  wrapping belongs to the phone's CSS and not to a host that cannot know its width.
 *
 *  `clipped` says THIS row's text was cut, which is a different fact from `TranscriptView.truncated`
 *  (a whole turn was dropped). Naming them the same word would leave the phone unable to decide
 *  which mark to draw. */
export interface TranscriptRow {
  kind: TranscriptRowKind;
  text: string;
  clipped?: boolean;
}

/** One exchange: a user prompt and everything that followed it.
 *
 *  `at` is the BOUNDARY record's own timestamp — the moment the turn started — or null when it is
 *  not a string. Null rather than dropping the turn: a turn is worth more than its clock. */
export interface TranscriptTurn {
  at: string | null;
  rows: TranscriptRow[];
}

/** What the host answers. A discriminated union rather than "readable: boolean": "no transcript
 *  yet", "the conversation was ended with /clear" and "too big to find a turn in" are three
 *  different things to tell a person, and one boolean collapses them into the same blank view. */
export type TranscriptView =
  { status: "ok"; turns: TranscriptTurn[]; truncated: boolean } | { status: "none" } | { status: "cleared" } | { status: "too-large" };

/** How many LOGICAL lines (newline-separated) the view carries before the oldest turns are dropped.
 *
 *  The goal is ten screens of the phone's terminal view — about 350 displayed rows. The host cannot
 *  know the phone's column count, so it can only count logical lines, and measured over 502 real
 *  turns the logical-to-displayed expansion has a median of 1.39x. 250 logical lines is therefore a
 *  median of 348 displayed ones. */
export const TRANSCRIPT_LINE_BUDGET = 250;

/** How much of one tool result is shown. Its HEAD, because that is the useful end of tool output —
 *  the first lines of a file, the first match of a grep. Without a cap, one turn filled the whole
 *  budget on its own. */
export const TOOL_RESULT_MAX_LINES = 6;

/** The second bound, and it is not the same bound as the line budget: decision 2 does not cap a
 *  `text` block's LINES at all, and one measured record held 4.5 MB (#1692). The reply is written to
 *  a Firestore command doc, which rejects anything over 1 MiB, so a view inside the line budget could
 *  still fail on every poll. Same value as the screen path's SCREEN_MAX_BYTES, for the same reason:
 *  it is a ceiling with room under the real limit, not a budget to spend. */
export const TRANSCRIPT_MAX_BYTES = 256 * 1024;

// What the JSON around each value costs, so the cap bounds the REPLY rather than only the text
// inside it. Each is the widest form of its wrapper, rounded up:
const VIEW_OVERHEAD_BYTES = 64; //  {"status":"ok","turns":[],"truncated":true}
const TURN_OVERHEAD_BYTES = 64; //  {"at":"…","rows":[]},          — `at` is measured separately
const ROW_OVERHEAD_BYTES = 64; //   {"kind":"assistant","text":"","clipped":true},
//
// What is NOT counted is JSON string ESCAPING: a text full of quotes serializes to twice its bytes.
// That is deliberate and it is what the headroom pays for — the real ceiling is Firestore's 1 MiB,
// and this cap sits a quarter of the way to it, exactly as the screen path's does.
const CONTENT_BYTE_CAP = TRANSCRIPT_MAX_BYTES - VIEW_OVERHEAD_BYTES;

// A `text` block belongs to whoever wrote the record. Anything that is neither speaker renders as
// `unknown` rather than being guessed at or dropped — see the note at the top about staying visible.
const SPEAKER_KINDS: Record<string, TranscriptRowKind> = { user: "user", assistant: "assistant" };
const speakerKind = (type: unknown): TranscriptRowKind => SPEAKER_KINDS[readString(type)] ?? "unknown";

const blockTypeName = (part: unknown): string => (isRecord(part) ? readString(part.type) || "?" : "?");

const unknownRow = (part: unknown): TranscriptRow => ({ kind: "unknown", text: `[unknown block: ${blockTypeName(part)}]` });

// `Array.isArray` narrows `unknown` to `any[]`, which puts every element read after it outside the
// type checker's reach — the same trap userPromptText documents. The predicate keeps them `unknown`.
const isBlockList = (value: unknown): value is unknown[] => Array.isArray(value);

// Claude's ordinary user records carry `content` as a PLAIN STRING, not an array of blocks — so a
// reader that only understands the array form sees no prose at all in the common case.
const contentBlocks = (content: unknown): unknown[] | null => {
  if (isBlockList(content)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return null;
};

// An empty string is not prose: a blank row carries nothing a reader can use. (A tool_result is the
// opposite case — see resultText.)
const proseRows = (value: unknown, kind: TranscriptRowKind): TranscriptRow[] => (typeof value === "string" && value !== "" ? [{ kind, text: value }] : []);

// One element of a tool_result's array content. A `text` part contributes its text; anything else is
// rendered by describeValue, so a shape we have not seen is SHOWN rather than silently skipped —
// including the circular case, which it answers for instead of throwing.
const resultPiece = (part: unknown): string[] => {
  if (part === undefined) return []; // there is no rendering of "absent" worth a line
  if (isRecord(part) && typeof part.text === "string") return [part.text];
  return [describeValue(part)];
};

// A tool result as one string, or null when there is nothing to show.
//
// The two empty cases differ. A plain `""` means the tool ran and returned nothing, which IS
// information, so it becomes one empty row. An array that yields no pieces means there was no piece
// to show, so it yields no row at all.
function resultText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!isBlockList(content)) return content === undefined ? null : describeValue(content);
  const joined = content.flatMap(resultPiece).join("\n");
  return joined === "" ? null : joined;
}

// The first TOOL_RESULT_MAX_LINES of `split("\n")` — a trailing newline's empty element counts, or a
// result "capped at 6" would arrive with 7.
function toolResultRow(text: string): TranscriptRow {
  const lines = text.split("\n");
  if (lines.length <= TOOL_RESULT_MAX_LINES) return { kind: "tool", text };
  return { kind: "tool", text: lines.slice(0, TOOL_RESULT_MAX_LINES).join("\n"), clipped: true };
}

function renderBlock(part: unknown, speaker: TranscriptRowKind): TranscriptRow[] {
  if (!isRecord(part)) return [unknownRow(part)];
  switch (part.type) {
    case "text":
      return proseRows(part.text, speaker);
    // Measured empty on disk in every transcript sampled, so today this renders nothing. Rendered
    // like prose rather than discarded by name, so the day upstream writes a body it appears.
    case "thinking":
      return proseRows(part.thinking, speaker);
    case "tool_use": {
      // The name only — arguments are what make a tool call long, and the result below says what it
      // did. A tool_use with no usable name is a shape change, so it says so.
      const name = readString(part.name).trim();
      return name ? [{ kind: "tool", text: name }] : [unknownRow(part)];
    }
    case "tool_result": {
      const text = resultText(part.content);
      return text === null ? [] : [toolResultRow(text)];
    }
    default:
      return [unknownRow(part)];
  }
}

/** One record's rows, in the order its content blocks appear — never merged, never reordered, since
 *  the order is what makes "it said this, then ran that" readable. A record with no message or no
 *  usable content contributes nothing. */
export function renderRecord(record: Record<string, unknown>): TranscriptRow[] {
  const message = isRecord(record.message) ? record.message : null;
  const blocks = message ? contentBlocks(message.content) : null;
  if (!blocks) return [];
  const speaker = speakerKind(record.type);
  return blocks.flatMap((part) => renderBlock(part, speaker));
}

/** Where a turn starts: a non-sidechain `user` record whose content holds a real prompt.
 *
 *  `userPromptText` rather than a fresh predicate, because it already handles BOTH content shapes —
 *  and claude's ordinary prompts are the plain-string one. A predicate written as "has a text block"
 *  would miss them, fusing every exchange into one turn that the line budget can never evict.
 *
 *  `promptId` is not used: measured, 114 records carried none. */
export const isTurnBoundary = (record: Record<string, unknown>): boolean =>
  record.type === "user" && record.isSidechain !== true && userPromptText(isRecord(record.message) ? record.message.content : undefined) !== null;

/** The fold's state: the turns kept so far, oldest first. */
export interface TranscriptScan {
  turns: TranscriptTurn[];
  /** Logical lines across `turns` — see countedLines for why this is not `rows.length`. */
  lines: number;
  /** Something was left out: a turn evicted by the budget, or a fragment before the first turn. */
  truncated: boolean;
}

export const emptyTranscriptScan = (): TranscriptScan => ({ turns: [], lines: 0, truncated: false });

// The budget counts LINES, not row objects. A `text` block is passed through whole, so counting one
// row as one line would let a single 900-line answer walk straight past a 250-line budget.
const countedLines = (rows: readonly TranscriptRow[]): number => rows.reduce((n, row) => n + row.text.split("\n").length, 0);

/** Fold one record into the scan. Same shape as session-reads.ts's `foldTimeline`; only the window
 *  differs, being lines and whole turns rather than a count of events. */
export function foldTranscriptView(scan: TranscriptScan, record: Record<string, unknown>): void {
  // A sub-agent's record is dropped whole — not merely disqualified as a boundary. Filtering it in
  // the boundary predicate alone would still let its assistant records land as rows of whichever
  // turn happened to be open, attributing a sub-agent's work to the main conversation.
  if (record.isSidechain === true) return;
  if (isTurnBoundary(record)) {
    scan.turns.push({ at: typeof record.timestamp === "string" ? record.timestamp : null, rows: [] });
  } else if (scan.turns.length === 0) {
    // The window opens mid-turn, so it starts with the tail of one whose prompt is outside it.
    // Dropped rather than shown as a synthetic turn: a fragment with no speaker leads the view, and
    // counting it against the budget would let something un-evictable push the newest turn out.
    //
    // Marked truncated only when the fragment had something to SHOW. Measured on this machine, most
    // transcripts open with `queue-operation` / `attachment` records that render nothing at all, so
    // marking every pre-boundary record would tell the phone "there is more before this" on a
    // complete conversation — and the same records mid-file cost nothing, so it would be a mark for
    // where a record sits rather than for anything missing.
    if (renderRecord(record).length > 0) scan.truncated = true;
    return;
  }
  const turn = scan.turns[scan.turns.length - 1];
  if (!turn) return;
  const rows = renderRecord(record);
  turn.rows.push(...rows);
  scan.lines += countedLines(rows);
  evictOldestTurns(scan);
}

// Whole turns, oldest first — half a turn is not readable. Never the last one: decision 1 is that
// the newest turn is shown however big it is.
function evictOldestTurns(scan: TranscriptScan): void {
  while (scan.lines > TRANSCRIPT_LINE_BUDGET && scan.turns.length > 1) {
    const dropped = scan.turns.shift();
    if (!dropped) return;
    scan.lines -= countedLines(dropped.rows);
    scan.truncated = true;
  }
}

const rowBytes = (row: TranscriptRow): number => Buffer.byteLength(row.text, "utf8") + ROW_OVERHEAD_BYTES;

// `at` is measured rather than folded into the constant: it is claude's `timestamp` field passed
// through, so a corrupt transcript can put an arbitrarily long string there.
const turnBytes = (turn: TranscriptTurn): number =>
  turn.rows.reduce((n, row) => n + rowBytes(row), TURN_OVERHEAD_BYTES + Buffer.byteLength(turn.at ?? "", "utf8"));

/** `text` cut to at most `maxBytes` UTF-8 bytes, never inside a character.
 *
 *  Bytes, not characters: the cap exists because of what Firestore stores, and one Japanese
 *  character is three bytes there and one `length` here. Cutting a buffer at an arbitrary offset
 *  would leave a broken sequence, so the cut walks back off any continuation byte (0b10xxxxxx). */
export function clipToBytes(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && ((buf[end] ?? 0) & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

// The newest turn does not fit even alone. It is the one turn that must survive (decision 1), so its
// ROWS pay instead: spent from the start, because a turn opens with the prompt that asked for it and
// nothing after that reads without it. The row the budget runs out inside is cut and marked rather
// than removed, so the view shows where it stops.
function clipTurn(turn: TranscriptTurn): TranscriptTurn {
  const rows: TranscriptRow[] = [];
  let remaining = CONTENT_BYTE_CAP - TURN_OVERHEAD_BYTES - Buffer.byteLength(turn.at ?? "", "utf8");
  turn.rows.forEach((row) => {
    if (remaining <= 0) return;
    const size = rowBytes(row);
    if (size <= remaining) {
      rows.push(row);
      remaining -= size;
      return;
    }
    rows.push({ ...row, text: clipToBytes(row.text, remaining - ROW_OVERHEAD_BYTES), clipped: true });
    remaining = 0;
  });
  return { ...turn, rows };
}

// The newest turns that fit, stopped at the first that does not — the same rule the screen path's
// withinByteCap uses, and for the same reason: skipping an oversized turn to keep older ones would
// hand the phone a conversation with a hole in it.
function withinByteCap(turns: readonly TranscriptTurn[]): { turns: TranscriptTurn[]; truncated: boolean } {
  const fit = turns.reduceRight<{ kept: TranscriptTurn[]; bytes: number; full: boolean }>(
    (state, turn) => {
      if (state.full) return state;
      const bytes = state.bytes + turnBytes(turn);
      if (bytes > CONTENT_BYTE_CAP) return { ...state, full: true };
      return { kept: [turn, ...state.kept], bytes, full: false };
    },
    { kept: [], bytes: 0, full: false },
  );
  if (fit.kept.length > 0) return { turns: fit.kept, truncated: fit.full };
  const newest = turns[turns.length - 1];
  return newest ? { turns: [clipTurn(newest)], truncated: true } : { turns: [], truncated: false };
}

/** The scan as the wire shape.
 *
 *  `windowStartedMidFile` is the third way a view can be incomplete, and the only one the fold
 *  cannot see: a tail read that begins after byte 0 has already dropped every older turn before the
 *  line budget could fire, so without it a cut history would arrive claiming to be the whole one. */
export function transcriptViewOf(scan: TranscriptScan, windowStartedMidFile: boolean): TranscriptView {
  if (scan.turns.length === 0) return { status: "none" };
  const fitted = withinByteCap(scan.turns);
  return { status: "ok", turns: fitted.turns, truncated: scan.truncated || fitted.truncated || windowStartedMidFile };
}
