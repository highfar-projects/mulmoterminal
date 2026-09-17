// @vitest-environment node
//
// Copilot's half of the phone's conversation view (#1822).
//
// Copilot is the one hosted agent whose conversation is a TABLE rather than a file of records, and
// the one whose shape is declared rather than measured: `turns(session_id, turn_index, user_message,
// assistant_response, timestamp)`, one row per turn with the prompt and the reply already separated.
// So there is no part type to recognise and no `unknown` row to catch one — what these tests pin is
// the fold, the columns being read tolerantly, and the trap #2081 paid for.
import { describe, it, expect } from "vitest";
import { copilotTurnRows, foldCopilotRow } from "../../../server/session/transcript-view-copilot";
import { emptyTranscriptScan } from "../../../server/session/transcript-view";

/** The rows folded the way the paging reader folds them — row by row, which is the only path
 *  production has. It used to be a whole-page wrapper that nothing but this file called. */
const scanOf = (rows: readonly Record<string, unknown>[]) => {
  const scan = emptyTranscriptScan();
  rows.forEach((row) => foldCopilotRow(scan, row));
  return scan;
};
import { transcriptViewOf, TRANSCRIPT_LINE_BUDGET } from "../../../server/session/transcript-view";

const turn = (user_message: unknown, assistant_response: unknown, timestamp: unknown = "2026-09-13T19:51:49.713Z") => ({
  user_message,
  assistant_response,
  timestamp,
});

describe("copilotTurnRows", () => {
  it("renders the prompt and the reply of one row, in that order", () => {
    expect(copilotTurnRows(turn("Reply with just the word pong.", "pong"))).toEqual([
      { kind: "user", text: "Reply with just the word pong." },
      { kind: "assistant", text: "pong" },
    ]);
  });

  it("renders the reply alone when the row carries no prompt", () => {
    expect(copilotTurnRows(turn("", "pong"))).toEqual([{ kind: "assistant", text: "pong" }]);
  });

  it("renders the prompt alone when the reply has not been written yet", () => {
    expect(copilotTurnRows(turn("in flight", ""))).toEqual([{ kind: "user", text: "in flight" }]);
  });

  it("renders nothing for a row with neither", () => {
    expect(copilotTurnRows(turn("   ", "\n"))).toEqual([]);
  });

  // The columns are `TEXT` and nullable, and what sqlite hands back is a row shape this reader does
  // not own. A non-string reads as absent rather than as the text "null" or "[object Object]".
  it("treats a non-string column as absent rather than stringifying it", () => {
    expect(copilotTurnRows(turn(null, 42))).toEqual([]);
    expect(copilotTurnRows(turn({ nested: true }, "ok"))).toEqual([{ kind: "assistant", text: "ok" }]);
  });
});

describe("folding copilot rows", () => {
  // THE TRAP #2081 PAID FOR, and copilot's one-row-per-turn shape walks straight into it:
  // `foldTurnRecord` supplies the prompt row ONLY when the boundary record rendered nothing, so a
  // source that hands it the reply and leaves the prompt to the fold prints the answer and silently
  // drops the question. The rows are emitted by the reader for that reason.
  it("keeps the question as well as the answer", () => {
    const scan = scanOf([turn("ハロー", "ハロー！今日は何をお手伝いしましょうか？")]);
    expect(scan.turns).toHaveLength(1);
    expect(scan.turns[0]?.rows).toEqual([
      { kind: "user", text: "ハロー" },
      { kind: "assistant", text: "ハロー！今日は何をお手伝いしましょうか？" },
    ]);
  });

  it("opens one turn per row, in the order given", () => {
    const scan = scanOf([turn("first", "a"), turn("second", "b")]);
    expect(scan.turns).toHaveLength(2);
    expect(scan.turns.map((t) => t.rows[0]?.text)).toEqual(["first", "second"]);
  });

  // Every row opens a turn because copilot keys them by `turn_index` — a reply is never a
  // continuation of the row before it, the way a claude or cursor record can be. Without this a
  // prompt-less row is folded into the PREVIOUS question, attributing an answer to the wrong one.
  it("gives a prompt-less row its own turn rather than folding it into the one before", () => {
    const scan = scanOf([turn("asked", "answered"), turn("", "an answer to nothing")]);
    expect(scan.turns).toHaveLength(2);
    expect(scan.turns[1]?.rows).toEqual([{ kind: "assistant", text: "an answer to nothing" }]);
  });

  it("opens no turn at all for a row with nothing in it", () => {
    expect(scanOf([turn("", ""), turn("real", "yes")]).turns).toHaveLength(1);
  });

  it("passes the row's timestamp through as the turn's time", () => {
    expect(scanOf([turn("q", "a", "2026-09-13T20:53:55.717Z")]).turns[0]?.at).toBe("2026-09-13T20:53:55.717Z");
  });

  // `timestamp` is a default-filled column and its format is not ours to assume. Anything that is
  // not a string reads as no clock, and a turn with no clock keeps its content.
  it("answers a null time rather than dropping the turn", () => {
    const scan = scanOf([turn("q", "a", null)]);
    expect(scan.turns[0]?.at).toBeNull();
    expect(scan.turns[0]?.rows).toHaveLength(2);
  });

  // The budget is the SHARED one — this reader owns no copy of it. Past it the oldest turns are
  // evicted and the scan says so, exactly as for a file source.
  it("evicts the oldest turns under the shared line budget and marks the scan truncated", () => {
    const rows = Array.from({ length: TRANSCRIPT_LINE_BUDGET }, (_, i) => turn(`q${i}`, `a${i}`));
    const scan = scanOf(rows);
    expect(scan.truncated).toBe(true);
    expect(scan.turns.length).toBeLessThan(rows.length);
    // The NEWEST survives — eviction is from the front.
    expect(scan.turns[scan.turns.length - 1]?.rows[0]?.text).toBe(`q${rows.length - 1}`);
  });

  it("answers `none` through the shared exit when there is nothing to show", () => {
    expect(transcriptViewOf(scanOf([]), false)).toEqual({ status: "none" });
    expect(transcriptViewOf(scanOf([turn("", "")]), false)).toEqual({ status: "none" });
  });
});
