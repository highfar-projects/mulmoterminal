import { describe, it, expect } from "vitest";
import { dialogAfterLookup, dialogWhenUntracked, replyPermitted, type DialogState, type ReplyGateInput } from "../../../src/components/boardReplyGate";
import type { AskQuestionEvent } from "../../../common/askQuestion";

const question: AskQuestionEvent = { sessionId: "s", toolUseId: "t", questions: [] };
const DIALOG_STATES: DialogState[] = ["none", "open", "unknown"];

describe("dialogAfterLookup", () => {
  it("is open for a reported dialog, none for a reported absence, unknown for a failed lookup", () => {
    expect(dialogAfterLookup({ ok: true, question })).toBe("open");
    expect(dialogAfterLookup({ ok: true, question: null })).toBe("none");
    expect(dialogAfterLookup({ ok: false })).toBe("unknown");
  });
});

describe("dialogWhenUntracked", () => {
  it("keeps a dialog seen open, and otherwise tracks none", () => {
    expect(dialogWhenUntracked("open")).toBe("open");
    expect(dialogWhenUntracked("unknown")).toBe("none");
    expect(dialogWhenUntracked("none")).toBe("none");
  });
});

// Every combination of the gate's inputs, built outside the callbacks so the nesting stays flat.
const combinations = (): ReplyGateInput[] => {
  const out: ReplyGateInput[] = [];
  DIALOG_STATES.forEach((dialog) => {
    [false, true].forEach((sending) => {
      [false, true].forEach((answering) => {
        ["go", "  ", ""].forEach((text) => out.push({ dialog, sending, answering, text }));
      });
    });
  });
  return out;
};

describe("replyPermitted", () => {
  it("permits a reply only with no dialog, nothing writing, and text to send", () => {
    expect(combinations().filter(replyPermitted)).toEqual([{ dialog: "none", sending: false, answering: false, text: "go" }]);
  });
});
