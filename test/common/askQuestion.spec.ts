// @vitest-environment node
// The keystrokes that answer a live AskUserQuestion dialog (#1679). Every expectation here was
// measured against a real `claude` 2.1.231 under tmux, because the dialog shows rows the tool
// schema does not mention ("Type something", "Submit") and only three of the four question
// shapes end with a review screen. Derived from the schema alone, the sequences are wrong.
import { describe, it, expect } from "vitest";
import {
  parseAskQuestions,
  keysForAnswers,
  keysToAnswerInWords,
  isAskQuestionEvent,
  openQuestionOf,
  shouldPublishQuestion,
  type AskQuestion,
  type AskQuestionDone,
} from "../../common/askQuestion";

const DOWN = "\x1b[B";
const ENTER = "\r";

// The exact PreToolUse tool_input captured from the run described above.
const CAPTURED = {
  questions: [
    {
      question: "Red or blue?",
      header: "Color",
      options: [
        { label: "Red", description: "Pick red." },
        { label: "Blue", description: "Pick blue." },
      ],
      multiSelect: false,
    },
  ],
};

const single = (labels: string[]): AskQuestion => ({
  question: "q",
  header: "h",
  options: labels.map((label) => ({ label })),
  multiSelect: false,
});

const multi = (labels: string[]): AskQuestion => ({ ...single(labels), multiSelect: true });

describe("parseAskQuestions", () => {
  it("reads a captured AskUserQuestion tool_input", () => {
    expect(parseAskQuestions(CAPTURED)).toEqual([
      {
        question: "Red or blue?",
        header: "Color",
        options: [
          { label: "Red", description: "Pick red." },
          { label: "Blue", description: "Pick blue." },
        ],
        multiSelect: false,
      },
    ]);
  });

  it("defaults a missing header and multiSelect", () => {
    expect(parseAskQuestions({ questions: [{ question: "q", options: [{ label: "a" }] }] })).toEqual([
      { question: "q", header: "", options: [{ label: "a" }], multiSelect: false },
    ]);
  });

  it("rejects another tool's input", () => {
    expect(parseAskQuestions({ command: "ls" })).toBeNull();
    expect(parseAskQuestions(null)).toBeNull();
    expect(parseAskQuestions({ questions: [] })).toBeNull();
  });

  // Answering happens BY INDEX, so a list we could only half-read would aim at the wrong row.
  it("rejects a question whose options did not all parse", () => {
    expect(parseAskQuestions({ questions: [{ question: "q", options: [{ label: "a" }, { nope: 1 }] }] })).toBeNull();
  });
});

describe("isAskQuestionEvent", () => {
  it("accepts a published event and rejects a partial one", () => {
    const event = { sessionId: "s", toolUseId: "t", ...CAPTURED };
    expect(isAskQuestionEvent(event)).toBe(true);
    expect(isAskQuestionEvent({ sessionId: "s", ...CAPTURED })).toBe(false);
    expect(isAskQuestionEvent({ sessionId: "s", toolUseId: "t", questions: [] })).toBe(false);
  });
});

describe("keysForAnswers", () => {
  // MEASURED: a lone single-select question commits on the option's own Enter — no review.
  it("walks down to the option and commits, with no review, for one single-select question", () => {
    expect(keysForAnswers([single(["Red", "Blue"])], [[1]])).toEqual([DOWN, ENTER]);
    expect(keysForAnswers([single(["Red", "Blue"])], [[0]])).toEqual([ENTER]);
  });

  // MEASURED: Enter toggles and leaves the cursor put; Submit sits one row past "Type something";
  // and a lone multi-select question DOES get the review screen.
  it("toggles each pick, then Submit, then the review, for one multi-select question", () => {
    expect(keysForAnswers([multi(["Nuts", "Cream", "Honey"])], [[0, 2]])).toEqual([
      ENTER, // toggle Nuts (cursor already on row 0)
      DOWN,
      DOWN,
      ENTER, // toggle Honey
      DOWN,
      DOWN, // past "Type something" to Submit
      ENTER,
      ENTER, // review: "Submit answers"
    ]);
  });

  // MEASURED: answering one question advances to the next by itself, and the review closes it.
  it("chains questions and ends with the review", () => {
    expect(keysForAnswers([single(["Small", "Large"]), single(["Hot", "Cold"])], [[0], [1]])).toEqual([ENTER, DOWN, ENTER, ENTER]);
  });

  it("mixes single and multi-select questions", () => {
    expect(keysForAnswers([single(["Apple", "Banana"]), multi(["Nuts", "Cream", "Honey"])], [[0], [2]])).toEqual([
      ENTER, // Apple
      DOWN,
      DOWN,
      ENTER, // toggle Honey
      DOWN,
      DOWN,
      ENTER, // Submit
      ENTER, // review
    ]);
  });

  it("allows a multi-select question with nothing picked", () => {
    expect(keysForAnswers([multi(["Nuts", "Cream"])], [[]])).toEqual([DOWN, DOWN, DOWN, ENTER, ENTER]);
  });

  it("refuses picks that do not fit the questions", () => {
    expect(keysForAnswers([single(["a", "b"])], [])).toBeNull();
    expect(keysForAnswers([single(["a", "b"])], [[2]])).toBeNull();
    expect(keysForAnswers([single(["a", "b"])], [[-1]])).toBeNull();
    expect(keysForAnswers([single(["a", "b"])], [[0, 1]])).toBeNull();
    expect(keysForAnswers([single(["a", "b"])], [[]])).toBeNull();
    expect(keysForAnswers([], [])).toBeNull();
  });

  // The walk only ever moves DOWN, so an unsorted pick list would toggle the wrong rows.
  it("refuses multi-select picks that are not ascending", () => {
    expect(keysForAnswers([multi(["a", "b", "c"])], [[2, 0]])).toBeNull();
    expect(keysForAnswers([multi(["a", "b", "c"])], [[1, 1]])).toBeNull();
  });
});

describe("shouldPublishQuestion", () => {
  const offer = { sessionId: "s", toolUseId: "t", ...CAPTURED };
  const close: AskQuestionDone = { sessionId: "s", toolUseId: "t", done: true };

  it("offers a question only while the pane is switched on", () => {
    expect(shouldPublishQuestion(offer, true)).toBe(true);
    expect(shouldPublishQuestion(offer, false)).toBe(false);
  });

  // The regression this exists for: the switch turned off DURING a dialog that was already
  // offered. Gating the close too would leave the pane holding live buttons over a dialog that
  // has since closed, where the next click walks the prompt's input history and submits it.
  it("closes a dialog even when the pane has been switched off since", () => {
    expect(shouldPublishQuestion(close, false)).toBe(true);
    expect(shouldPublishQuestion(close, true)).toBe(true);
  });
});

describe("openQuestionOf", () => {
  const running = { toolUseId: "t1", toolName: "AskUserQuestion", toolInput: CAPTURED, status: "running" };

  it("rebuilds the dialog a session is still blocked on", () => {
    expect(openQuestionOf([{ toolUseId: "b", toolName: "Bash", toolInput: {}, status: "completed" }, running], "s1")).toEqual({
      sessionId: "s1",
      toolUseId: "t1",
      questions: CAPTURED.questions,
    });
  });

  it("ignores a question that has already been answered", () => {
    expect(openQuestionOf([{ ...running, status: "completed" }], "s1")).toBeNull();
    expect(openQuestionOf([{ ...running, status: "failed" }], "s1")).toBeNull();
    expect(openQuestionOf([], "s1")).toBeNull();
  });

  it("takes the most recent open question", () => {
    expect(openQuestionOf([running, { ...running, toolUseId: "t2" }], "s1")?.toolUseId).toBe("t2");
  });

  // A session blocked on a question runs nothing else until it is answered, so a later call proves
  // the question is over — even if its own close never arrived (an interrupted turn, a `/clear`, a
  // hook that did not land). Offering it anyway would put buttons over a terminal that moved on.
  it("treats a question the agent has moved past as gone, close or no close", () => {
    const movedOn = [running, { toolUseId: "b", toolName: "Bash", toolInput: { command: "ls" }, status: "running" }];
    expect(openQuestionOf(movedOn, "s1")).toBeNull();

    const andFinished = [running, { toolUseId: "b", toolName: "Bash", toolInput: { command: "ls" }, status: "completed" }];
    expect(openQuestionOf(andFinished, "s1")).toBeNull();
  });

  it("ignores every other running tool", () => {
    expect(openQuestionOf([{ toolUseId: "b", toolName: "Bash", toolInput: { command: "ls" }, status: "running" }], "s1")).toBeNull();
  });
});

// MEASURED: `Type something` is a text FIELD. Highlight it, type, and Enter commits the words as the
// answer — PostToolUse carries `{"Red or blue?": "green please"}`. (Enter while it is still empty
// declines instead; reading only that is what first sent this feature down the wrong road.)
describe("keysToAnswerInWords", () => {
  it("walks past the options to the text row, types, and commits", () => {
    expect(keysToAnswerInWords([single(["Red", "Blue"])], "green please")).toEqual([DOWN, DOWN, "green please", ENTER]);
  });

  // Every shape but the measured one ends somewhere this sequence does not reach: a wizard moves on
  // to its next question, a multi-select dialog stops at its review screen. Claiming the dialog
  // there would leave the terminal waiting for something the pane cannot send.
  it("refuses a dialog that holds more than one question", () => {
    expect(keysToAnswerInWords([single(["Small", "Large"]), single(["Hot", "Cold"])], "medium")).toBeNull();
  });

  it("refuses a multi-select question, review screen and all", () => {
    expect(keysToAnswerInWords([multi(["Nuts", "Cream", "Honey"])], "olives")).toBeNull();
  });

  // Empty text would land on the row and press Enter, which DECLINES the whole question — the one
  // thing a user typing an answer never meant.
  it("refuses to send nothing", () => {
    expect(keysToAnswerInWords([single(["Red", "Blue"])], "")).toBeNull();
    expect(keysToAnswerInWords([], "green")).toBeNull();
  });
});
