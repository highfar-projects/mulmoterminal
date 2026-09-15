// A copilot conversation, folded into the same turns the phone already reads for claude, codex and
// cursor (#1822).
//
// Copilot is the one hosted agent whose conversation is not a file of records but a TABLE, and the
// one whose shape needed no measuring to recognise — it is declared:
//
//   CREATE TABLE turns (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     session_id TEXT NOT NULL REFERENCES sessions(id),
//     turn_index INTEGER NOT NULL,
//     user_message TEXT,
//     assistant_response TEXT,
//     timestamp TEXT DEFAULT (datetime('now')),
//     UNIQUE(session_id, turn_index)
//   );
//
// One row is one turn, prompt and reply already separated and already named. So there is no part
// type to recognise, no wrapper to strip and no double write to guard — and no `unknown` row
// either, because copilot has no part axis for one to catch. Cursor's is load-bearing precisely
// because a new part type would otherwise vanish; here a change of shape is a schema migration,
// which fails loudly rather than thinning the view.
//
// MEASURED over the whole store on this machine against copilot CLI 1.0.83, read through the WAL on
// a copy so an uncheckpointed page could not hide anything: sessions 8 · turns 8 · session_files 1 ·
// checkpoints 0 · session_refs 0 · forge_trajectory_events 0.
//
// THAT LAST ZERO IS THE LIMITATION, and it is copilot's file rather than a gap here.
// `forge_trajectory_events` is where a tool call would go — its columns are literally
// `tool_call_id`, `command`, `output`, `exit_code` — and it is EMPTY, including for the two sessions
// that demonstrably ran tools (one ran a shell command, one created a file). So a copilot turn shows
// what was asked and what was said, and nothing about what ran: thinner than cursor, which shows
// WHICH tools ran but never what they answered.
//
// `session_files` is not the missing half and must not be pressed into service as one. It holds a
// `tool_name`, but `UNIQUE(session_id, file_path)` makes it a deduped "files seen in this session"
// index — a file touched in turns 1 and 3 appears once, attributed to turn 1. Rendering it per turn
// would under-report and mis-attribute, which is worse than the honest gap.
import { readString } from "../../common/readString.js";
import type { SqliteRow } from "../agents/sqlite-read.js";
import { type TranscriptRow, type TranscriptScan, emptyTranscriptScan, foldTurnRecord } from "./transcript-view.js";

/** One `turns` row as the fold wants it, or null when it carries nothing to show.
 *
 *  BOTH rows are emitted here rather than leaving the prompt to the fold, and that is not a style
 *  choice: `foldTurnRecord` supplies the prompt row ONLY when the boundary record rendered nothing,
 *  so handing it the reply alone would print the answer and silently drop the question. Cursor paid
 *  for that lesson in #2081; copilot's one-row-per-turn shape walks straight into it. */
export function copilotTurnRows(row: SqliteRow): TranscriptRow[] {
  const prompt = readString(row.user_message).trim();
  const reply = readString(row.assistant_response).trim();
  const rows: TranscriptRow[] = [];
  if (prompt !== "") rows.push({ kind: "user", text: prompt });
  if (reply !== "") rows.push({ kind: "assistant", text: reply });
  return rows;
}

/** Copilot's rows, folded into the shared scan. `rows` arrive OLDEST FIRST, because the budget
 *  evicts from the front — the caller's query takes the newest by `turn_index` and reverses them.
 *
 *  `prompt` is a string and never null, which is what says "every row opens a turn": copilot keys
 *  its rows by `turn_index`, so a reply is never a continuation of the row before it the way a
 *  claude or cursor record can be. A row whose `user_message` is empty still opens its turn, and
 *  shows the reply alone rather than being folded into someone else's question.
 *
 *  A row with neither a prompt nor a reply opens nothing: an empty heading on the phone is worse
 *  than a turn that is not there, and the fold's own guarantee — a boundary always gets a row —
 *  has no text to fall back on here. */
export function copilotScanOf(rows: readonly SqliteRow[]): TranscriptScan {
  const scan = emptyTranscriptScan();
  rows.forEach((row) => {
    const rendered = copilotTurnRows(row);
    if (rendered.length === 0) return;
    foldTurnRecord(scan, { prompt: readString(row.user_message).trim(), at: readString(row.timestamp) || null, rows: rendered });
  });
  return scan;
}
