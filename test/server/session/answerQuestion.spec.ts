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
  otherWriteCount: () => 0,
  watchOtherWrites: () => {},
  stopWatchingOtherWrites: () => {},
  pause: async () => {},
  gapMs: 0,
});

describe("answerQuestion", () => {
  it("types the keystrokes for the chosen option", async () => {
    const d = deps([CALL("t1", "running")]);

    expect(await answerQuestion(d, { sessionId: "sess1a", toolUseId: "t1", picks: [[1]] })).toEqual({ ok: true });
    expect(d.write.mock.calls.map((call) => call[1])).toEqual([DOWN, ENTER]);
  });

  // The race this function exists to close: answered in the terminal a moment ago, and the keys
  // would land in the prompt underneath.
  it("refuses when that dialog has already closed", async () => {
    const d = deps([CALL("t1", "completed")]);

    expect(await answerQuestion(d, { sessionId: "sess2a", toolUseId: "t1", picks: [[1]] })).toEqual({ ok: false, reason: "closed" });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("refuses a toolUseId that is not the dialog on screen", async () => {
    const d = deps([CALL("t2", "running")]);

    expect(await answerQuestion(d, { sessionId: "sess3a", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "closed" });
    expect(d.write).not.toHaveBeenCalled();
  });

  it("refuses picks that do not fit the questions", async () => {
    const d = deps([CALL("t1", "running")]);

    expect(await answerQuestion(d, { sessionId: "sess4a", toolUseId: "t1", picks: [[5]] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(await answerQuestion(d, { sessionId: "sess4a", toolUseId: "t1", picks: [] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(await answerQuestion(d, { sessionId: "sess4a", toolUseId: "t1", picks: [[0, 1]] })).toEqual({ ok: false, reason: "bad-picks" });
    expect(d.write).not.toHaveBeenCalled();
  });

  // A session that outlived a server restart is viewable but not writable — say so rather than
  // reporting a success nothing acted on.
  it("reports a session it cannot type into", async () => {
    const d = deps(
      [CALL("t1", "running")],
      vi.fn(() => false),
    );

    expect(await answerQuestion(d, { sessionId: "sess5a", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });
  });

  it("stops writing once the PTY refuses a key", async () => {
    const write = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const d = deps([CALL("t1", "running", true)], write);

    expect(await answerQuestion(d, { sessionId: "sess6a", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });
    expect(write.mock.calls).toHaveLength(2); // the refused one, and nothing after it
  });

  // THE INVARIANT. Everything written is a key this module built; nothing the caller sent appears.
  it("writes only control keys, never anything the caller supplied", async () => {
    const d = deps([CALL("t1", "running", true)]);

    await answerQuestion(d, { sessionId: "sess7a", toolUseId: "t1", picks: [[0, 1]] });

    const written = d.write.mock.calls.map((call) => call[1]);
    expect(written.every((chunk) => chunk === DOWN || chunk === ENTER)).toBe(true);
  });

  // Two clients answering at once is not hypothetical here: the pane and the phone are exactly the
  // pair this module was written to serve. Both can read the dialog as still open, and their paced
  // keystrokes would then interleave — the first commits the dialog and the second's leftovers land
  // at the prompt underneath, where an arrow reaches the input history and Enter runs it.
  it("lets one answer through at a time, per session", async () => {
    const d = deps([CALL("t1", "running", true)]);
    const first = answerQuestion(d, { sessionId: "sess8a", toolUseId: "t1", picks: [[0, 1]] });
    const second = answerQuestion(d, { sessionId: "sess8a", toolUseId: "t1", picks: [[0]] });

    expect(await second).toEqual({ ok: false, reason: "closed" });
    expect(await first).toEqual({ ok: true });
    // Exactly one stream's worth: toggle, down, toggle, down x2 to Submit, enter, review enter.
    expect(d.write.mock.calls).toHaveLength(7);
  });

  it("holds the lock per session, not across them", async () => {
    const d = deps([CALL("t1", "running")]);
    const [a, b] = await Promise.all([
      answerQuestion(d, { sessionId: "sess9a", toolUseId: "t1", picks: [[0]] }),
      answerQuestion(d, { sessionId: "sess9b", toolUseId: "t1", picks: [[0]] }),
    ]);

    expect([a, b]).toEqual([{ ok: true }, { ok: true }]);
  });

  // A failed answer must not leave the session unanswerable for the rest of the process's life.
  it("releases the lock when an answer fails", async () => {
    const d = deps(
      [CALL("t1", "running")],
      vi.fn(() => false),
    );
    expect(await answerQuestion(d, { sessionId: "sess10a", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "unwritable" });

    const after = deps([CALL("t1", "running")]);
    expect(await answerQuestion(after, { sessionId: "sess10a", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: true });
  });

  // The lock keeps two ANSWERS apart. This is the other half: the person at the keyboard answers the
  // dialog inside one of the pauses, and the rest of the sequence would land on the prompt beneath.
  it("stops as soon as anything else types into the session", async () => {
    let others = 0;
    const write = vi.fn(() => true);
    const d: AnswerQuestionDeps & { write: ReturnType<typeof vi.fn> } = {
      callsOf: async () => [CALL("t1", "running", true)],
      write,
      otherWriteCount: () => others,
      watchOtherWrites: () => {},
      stopWatchingOtherWrites: () => {},
      // The user's keystroke lands in the gap after the first key goes out.
      pause: async () => {
        if (write.mock.calls.length === 1) others = 1;
      },
      gapMs: 0,
    };

    expect(await answerQuestion(d, { sessionId: "s9", toolUseId: "t1", picks: [[0, 1]] })).toEqual({ ok: false, reason: "closed" });
    expect(write.mock.calls).toHaveLength(1); // nothing after the interruption
  });

  // The dialog is read asynchronously, and a keystroke can land during that read. Counting starts
  // when the answer is claimed — BEFORE the read — so this one is seen; taking a baseline after the
  // read would fold it in and let the sequence carry on into a dialog the user had already closed.
  it("yields to a keystroke that lands while the dialog is being read", async () => {
    let others = 0;
    const write = vi.fn(() => true);
    const d: AnswerQuestionDeps & { write: ReturnType<typeof vi.fn> } = {
      callsOf: async () => {
        others = 1; // the user answers in the terminal while we are reading the history
        return [CALL("t1", "running")];
      },
      write,
      otherWriteCount: () => others,
      watchOtherWrites: () => {
        others = 0;
      },
      stopWatchingOtherWrites: () => {},
      pause: async () => {},
      gapMs: 0,
    };

    expect(await answerQuestion(d, { sessionId: "s10", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: false, reason: "closed" });
    expect(write).not.toHaveBeenCalled();
  });

  // The record does not close the moment the keys go out: the terminal has to process that final
  // Enter and Claude has to report it. A second request in that window would otherwise pass the
  // "still running" check and type its sequence into whatever the screen became.
  it("refuses a second answer to a dialog it already submitted", async () => {
    const calls = [CALL("t1", "running")];
    const d = deps(calls);

    expect(await answerQuestion(d, { sessionId: "s11", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: true });
    // callsOf still reports it running — the close has not arrived yet.
    expect(await answerQuestion(d, { sessionId: "s11", toolUseId: "t1", picks: [[1]] })).toEqual({ ok: false, reason: "closed" });
    expect(d.write.mock.calls).toHaveLength(1); // only the first answer's Enter
  });

  it("answers the NEXT dialog of a session it has already answered one for", async () => {
    const first = deps([CALL("t1", "running")]);
    expect(await answerQuestion(first, { sessionId: "s12", toolUseId: "t1", picks: [[0]] })).toEqual({ ok: true });

    const second = deps([CALL("t2", "running")]);
    expect(await answerQuestion(second, { sessionId: "s12", toolUseId: "t2", picks: [[0]] })).toEqual({ ok: true });
  });
});
