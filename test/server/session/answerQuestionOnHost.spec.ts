// @vitest-environment node
// The wire shape of an answer, which is not the same on both transports (#182).
//
// The pane POSTs JSON and sends each question's chosen indexes as a plain `number[]`. The phone's
// command is a Firestore DOCUMENT, and Firestore cannot store an array inside an array: addDoc
// rejects a `number[][]` outright with "Nested arrays are not supported", so the whole command
// never leaves the phone. Its rows therefore arrive wrapped one map deep.
//
// Both must end up as the same indexes, and anything else must still be refused — a coerced pick
// is a keystroke aimed at a row nobody chose.
import { describe, it, expect, vi } from "vitest";

const write = vi.fn<(sessionId: string, key: string) => boolean>(() => true);
vi.mock("../../../server/session/write-to-session.js", () => ({
  writeAnswerKey: (sessionId: string, key: string) => write(sessionId, key),
  otherWriteCount: () => 0,
}));

const { answerQuestionOnHost } = await import("../../../server/session/answerQuestionOnHost");

const DOWN = "\x1b[B";
const ENTER = "\r";

const CALLS = (multiSelect = false) => [
  {
    toolUseId: "t1",
    toolName: "AskUserQuestion",
    status: "running",
    toolInput: {
      questions: [{ question: "Red or blue?", header: "Color", options: [{ label: "Red" }, { label: "Blue" }], multiSelect }],
    },
  },
];

// A fresh session per call: an answered dialog is claimed until it is reaped, so reusing one id
// would refuse every case after the first as "closed".
let sessions = 0;

const answer = async (picks: unknown, multiSelect = false) => {
  write.mockClear();
  sessions += 1;
  const result = await answerQuestionOnHost(`sess${sessions}`, "t1", picks, async () => CALLS(multiSelect));
  return { result, keys: write.mock.calls.map((call) => call[1]) };
};

describe("answerQuestionOnHost picks", () => {
  it("reads the pane's rows", async () => {
    expect(await answer([[1]])).toEqual({ result: { ok: true }, keys: [DOWN, ENTER] });
  });

  // The phone's shape. Identical keystrokes, or the two clients disagree about what the user chose.
  it("reads the phone's wrapped rows the same way", async () => {
    expect(await answer([{ options: [1] }])).toEqual({ result: { ok: true }, keys: [DOWN, ENTER] });
  });

  it("reads a multi-select row from either shape", async () => {
    const pane = await answer([[0, 1]], true);
    const phone = await answer([{ options: [0, 1] }], true);
    expect(pane.result).toEqual({ ok: true });
    expect(phone.keys).toEqual(pane.keys);
  });

  it("refuses a wrapper holding something that is not indexes", async () => {
    expect(await answer([{ options: ["1"] }])).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
    expect(await answer([{ options: "1" }])).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
    expect(await answer([{ nope: [1] }])).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
  });

  // Neither client sends this, so reading it would be guessing at what somebody meant.
  it("refuses a wrapper inside a wrapper", async () => {
    expect(await answer([{ options: { options: [1] } }])).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
  });

  it("still refuses what neither shape allows", async () => {
    expect(await answer("1")).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
    expect(await answer([1])).toEqual({ result: { ok: false, reason: "bad-picks" }, keys: [] });
  });
});
