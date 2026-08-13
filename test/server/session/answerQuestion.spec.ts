// @vitest-environment node
// Answering a live AskUserQuestion dialog on the host (#1685). The property worth pinning above
// all others: the bytes that reach the PTY are built from the HOST's record of the dialog and the
// caller's option indexes — never from anything the caller sent as text. A client that could put a
// control byte on the wire could type anything into somebody's terminal.
import { describe, it, expect, vi } from "vitest";
import { answerQuestion, type AnswerQuestionDeps } from "../../../server/session/answerQuestion";
import type { RecordedCall } from "../../../common/askQuestion";

const DOWN = "\x1b[B";
const ENTER = "\r";

const CALL = (toolUseId: string, status: string, multiSelect = false): RecordedCall => ({
  toolUseId,
  toolName: "AskUserQuestion",
  status,
  toolInput: {
    questions: [
      {
        question: "Red or blue?",
        header: "Color",
        options: [{ label: "Red" }, { label: "Blue" }],
        multiSelect,
      },
    ],
  },
});

const deps = (calls: RecordedCall[], write = vi.fn(() => true)): AnswerQuestionDeps & { write: ReturnType<typeof vi.fn> } => ({
  callsOf: async () => calls,
  write,
  pause: async () => {},
  gapMs: 0,
});

describe("answerQuestion", () => {
  it("types the keystrokes for the chosen option", async () => {
    const d = deps([CALL("t1", "running")]);

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[1]] })).toEqual({ ok: true });
    expect(d.write.mock.calls.map((call) => call[1])).toEqual([DOWN, ENTER]);
  });

  // The race this function exists to close: answered in the terminal a moment ago, and the keys
  // would land in the prompt underneath.
  it("refuses when that dialog has already closed", async () => {
    const d = deps([CALL("t1", "completed")]);

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[1]] })).toEqual({ ok: false, reason: "closed" });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("refuses a toolUseId that is not the dialog on screen", async () => {
    const d = deps([CALL("t2", "running")]);

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "closed" });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("refuses picks that do not fit the questions", async () => {
    const d = deps([CALL("t1", "running")]);

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[5]] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0, 1]] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(d.write).not.toHaveBeenCalled();
  });

  // A session that outlived a server restart is viewable but not writable — say so rather than
  // reporting a success nothing acted on.
  it("reports a session it cannot type into", async () => {
    const d = deps(
      [CALL("t1", "running")],
      vi.fn(() => false),
    );

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });
  });

  it("stops writing once the PTY refuses a key", async () => {
    const write = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const d = deps([CALL("t1", "running", true)], write);

    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });
    expect(write.mock.calls).toHaveLength(2); // the refused one, and nothing after it
  });

  // THE INVARIANT. Everything written is a key this module built; nothing the caller sent appears.
  it("writes only control keys, never anything the caller supplied", async () => {
    const d = deps([CALL("t1", "running", true)]);

    await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0, 1]] });

    const written = d.write.mock.calls.map((call) => call[1]);
    expect(written.every((chunk) => chunk === DOWN || chunk === ENTER)).toBe(true);
  });
});
