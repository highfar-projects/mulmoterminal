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

  // Two clients answering at once is not hypothetical here: the pane and the phone are exactly the
  // pair this module was written to serve. Both can read the dialog as still open, and their paced
  // keystrokes would then interleave — the first commits the dialog and the second's leftovers land
  // at the prompt underneath, where an arrow reaches the input history and Enter runs it.
  it("lets one answer through at a time, per session", async () => {
    const d = deps([CALL("t1", "running", true)]);
    const first = answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0, 1]] });
    const second = answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] });

    expect(await second).toEqual({ ok: false, reason: "closed" });
    expect(await first).toEqual({ ok: true });
    // Exactly one stream's worth: toggle, down, toggle, down x2 to Submit, enter, review enter.
    expect(d.write.mock.calls).toHaveLength(7);
  });

  it("holds the lock per session, not across them", async () => {
    const d = deps([CALL("t1", "running")]);
    const [a, b] = await Promise.all([
      answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] }),
      answerQuestion(d, { sessionId: "s2", toolUseId: "t1", picks: [[0]] }),
    ]);

    expect([a, b]).toEqual([{ ok: true }, { ok: true }]);
  });

  // A failed answer must not leave the session unanswerable for the rest of the process's life.
  it("releases the lock when an answer fails", async () => {
    const d = deps(
      [CALL("t1", "running")],
      vi.fn(() => false),
    );
    expect(await answerQuestion(d, { sessionId: "s1", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });

    const after = deps([CALL("t1", "running")]);
    expect(await answerQuestion(after, { sessionId: "s1", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: true });
  });
});
