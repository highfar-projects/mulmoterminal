// @vitest-environment node
import { describe, it, expect } from "vitest";
import { MAX_ASK_CHOICES, parseAskChoices } from "../../../common/blueprint/askChoices";

describe("parseAskChoices — what an agent can offer", () => {
  it("is a plain question when nothing is offered", () => {
    expect(parseAskChoices(undefined, undefined)).toEqual({ ok: true, choices: [] });
    expect(parseAskChoices("", "")).toEqual({ ok: true, choices: [] });
    expect(parseAskChoices(" \n\n ", "  ")).toEqual({ ok: true, choices: [] });
  });

  it("reads one choice per line, the label before the first colon and the cost after it", () => {
    expect(parseAskChoices("Fix the type: runtime unaffected, types only\nLeave it: costs nothing", undefined)).toEqual({
      ok: true,
      choices: [
        { label: "Fix the type", description: "runtime unaffected, types only" },
        { label: "Leave it", description: "costs nothing" },
      ],
    });
  });

  it("takes a full-width colon, and keeps later colons in the description", () => {
    expect(parseAskChoices("直す：実行時の影響なし\n見送る: 理由: 費用が大きい", undefined)).toEqual({
      ok: true,
      choices: [
        { label: "直す", description: "実行時の影響なし" },
        { label: "見送る", description: "理由: 費用が大きい" },
      ],
    });
  });

  it("allows a choice with no description", () => {
    expect(parseAskChoices("Yes\nNo:", undefined)).toEqual({ ok: true, choices: [{ label: "Yes" }, { label: "No" }] });
  });

  it("splits on a literal backslash-n, which is what single quotes deliver", () => {
    expect(parseAskChoices(String.raw`A: one\nB: two`, undefined)).toEqual({
      ok: true,
      choices: [
        { label: "A", description: "one" },
        { label: "B", description: "two" },
      ],
    });
  });

  it("ignores blank lines, CRLF and the indentation a shell line carries", () => {
    expect(parseAskChoices("\r\n  A: one\r\n\r\n   B: two  \r\n", undefined)).toEqual({
      ok: true,
      choices: [
        { label: "A", description: "one" },
        { label: "B", description: "two" },
      ],
    });
  });

  it("marks the recommended choice, and only that one", () => {
    const parsed = parseAskChoices("A: one\nB: two\nC: three", " B ");
    expect(parsed).toEqual({
      ok: true,
      choices: [
        { label: "A", description: "one" },
        { label: "B", description: "two", recommended: true },
        { label: "C", description: "three" },
      ],
    });
  });

  it("accepts exactly the maximum number of choices", () => {
    const lines = Array.from({ length: MAX_ASK_CHOICES }, (_, index) => `C${index}: d`).join("\n");
    const parsed = parseAskChoices(lines, undefined);
    expect(parsed.ok && parsed.choices.length).toBe(MAX_ASK_CHOICES);
  });
});

describe("parseAskChoices — what the agent is told to fix", () => {
  it.each([
    ["a single choice", "Only: one", undefined, "offer at least two choices, or none"],
    [
      "too many choices",
      Array.from({ length: MAX_ASK_CHOICES + 1 }, (_, index) => `C${index}`).join("\n"),
      undefined,
      `offer at most ${MAX_ASK_CHOICES} choices`,
    ],
    ["a line with no label", "A: one\n: two", undefined, "every choice needs a label before its ':'"],
    ["a label that is a paragraph", `${"x".repeat(81)}\nB`, undefined, "a choice's label is at most 80 characters"],
    ["two equal labels", "A: one\nA: two", undefined, "two choices have the same label"],
    ["a recommendation naming no choice", "A: one\nB: two", "C", 'RECOMMEND "C" is not one of the choices\' labels'],
    ["a recommendation with nothing to pick from", undefined, "A", "RECOMMEND needs CHOICES to pick from"],
  ])("refuses %s", (_label, choices, recommend, reason) => {
    expect(parseAskChoices(choices, recommend)).toEqual({ ok: false, reason });
  });
});
