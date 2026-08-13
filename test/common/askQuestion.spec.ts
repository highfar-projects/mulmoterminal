// @vitest-environment node
// The keystrokes that answer a live AskUserQuestion dialog (#1679). Every expectation here was
// measured against a real `claude` 2.1.231 under tmux, because the dialog shows rows the tool
// schema does not mention ("Type something", "Submit") and only three of the four question
// shapes end with a review screen. Derived from the schema alone, the sequences are wrong.
import { describe, it, expect } from "vitest";
import { parseAskQuestions, keysForAnswers, isAskQuestionEvent, type AskQuestion } from "../../common/askQuestion";

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
